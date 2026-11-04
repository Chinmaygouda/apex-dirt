import * as THREE from 'three';
import { VehicleTelemetry } from './RapierBaselineVehicle';

/**
 * Helper to safely create an HTML Canvas in browser environments
 * without crashing in headless Node environments.
 */
function createSafeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * CockpitController:
 * Complete, highly detailed low-poly 1980s rally coupe cockpit interior.
 * Implements:
 * 1. Cabin Shell: Full tub floor, footwell, firewall, headliner, door panels with grab straps,
 *    driver side window net, rear-view mirror, compact 'APEX RALLY' sun visor strip.
 * 2. Joined Tubular Roll Cage (T45 Steel): Main hoop, harness bar, roof diagonal,
 *    A-pillar down-bars, and door X-intrusion bars.
 * 3. Ergonomic Dashboard & Instrument Binnacle: Dark flocked alcantara with red accent stitching,
 *    twin analog gauges (clockwise Tachometer with redline arc & Speedometer), auxiliary dials,
 *    and shift light array visible through the top spoke opening of the wheel.
 * 4. Center Console & Controls: Aircraft toggle switch panel, sequential gear shifter with
 *    mechanical gate, and tall vertical hydraulic handbrake wand.
 * 5. Aluminum 3-Pedal Box: Clutch, brake, and throttle pedals with dynamic deflection.
 * 6. Passenger Footwell: Red handheld rally fire extinguisher with brass valve.
 * 7. Driver Model & 2-Bone Arm IK: Flocked dark charcoal suit with yellow-accented rally gloves;
 *    hands rotate at 9 & 3 o'clock with the wheel; animated right-hand reach for gear shifts & handbrake.
 */
export class CockpitController {
  public group = new THREE.Group();

  // Steering wheel & column
  private steeringWheelGroup = new THREE.Group();
  private wheelRimMesh!: THREE.Mesh;

  // Analogue gauge needles & LEDs
  private tachoNeedle!: THREE.Mesh;
  private speedoNeedle!: THREE.Mesh;
  private boostNeedle!: THREE.Mesh;
  private shiftLeds: THREE.MeshStandardMaterial[] = [];

  // Pedals
  private throttlePedalGroup = new THREE.Group();
  private brakePedalGroup = new THREE.Group();
  private clutchPedalGroup = new THREE.Group();

  // Levers
  private shifterLeverGroup = new THREE.Group();
  private ebrakeLeverGroup = new THREE.Group();
  private ebrakeWandMesh!: THREE.Mesh;

  // Driver body & arm IK
  private driverTorso!: THREE.Mesh;
  private driverHead!: THREE.Mesh;
  private leftUpperArm!: THREE.Mesh;
  private leftForearm!: THREE.Mesh;
  private leftHandGroup = new THREE.Group();

  private rightUpperArm!: THREE.Mesh;
  private rightForearm!: THREE.Mesh;
  private rightHandGroup = new THREE.Group();

  // Arm joint anchor offsets from driver torso
  private readonly leftShoulder = new THREE.Vector3(-0.46, 0.49, -0.16);
  private readonly rightShoulder = new THREE.Vector3(-0.16, 0.49, -0.16);
  private readonly upperArmLen = 0.26;
  private readonly forearmLen = 0.26;

  // Key interior anchor positions
  // Driver sits on left: x = -0.33, y = 0.28, z = -0.26
  private readonly driverPos = new THREE.Vector3(-0.33, 0.28, -0.26);
  private readonly wheelCenter = new THREE.Vector3(-0.33, 0.43, 0.17);
  private readonly wheelRadius = 0.170; // 340mm rally dished wheel
  private readonly columnAngle = -Math.PI / 8.0; // ~22.5 deg tilt back towards driver

  private readonly shifterPos = new THREE.Vector3(-0.02, 0.24, 0.16);
  private readonly ebrakePos = new THREE.Vector3(0.08, 0.28, 0.12);

  // Dynamic animation states
  private prevGear: number | string = 1;
  private shiftAnimTimer = 0;
  private readonly shiftAnimDuration = 0.45; // 450ms total gear reach & return
  private isShifting = false;

  private ebrakePullProgress = 0; // 0 to 1

  constructor(private carGroup: THREE.Group) {
    this.buildCabinStructure();
    this.buildRollCage();
    this.buildDashboardAndBinnacle();
    this.buildCenterConsoleAndPedals();
    this.buildSteeringWheel();
    this.buildAnalogGauges();
    this.buildDriverRig();

    this.carGroup.add(this.group);
  }

  /**
   * Toggles visibility of meshes that might block the camera in Cockpit FPV mode.
   * In FPV mode, we hide driver's head and torso so they don't clip the camera,
   * but KEEP the arms and gloved hands visible gripping the steering wheel!
   */
  public setCockpitViewMode(isCockpit: boolean): void {
    if (this.driverHead) this.driverHead.visible = !isCockpit;
    if (this.driverTorso) this.driverTorso.visible = !isCockpit;
    if (this.leftUpperArm) this.leftUpperArm.visible = true;
    if (this.rightUpperArm) this.rightUpperArm.visible = true;
    if (this.leftForearm) this.leftForearm.visible = true;
    if (this.rightForearm) this.rightForearm.visible = true;
    if (this.leftHandGroup) this.leftHandGroup.visible = true;
    if (this.rightHandGroup) this.rightHandGroup.visible = true;
  }

  /**
   * 1. Full Cabin Structural Shell:
   * Floor tub, ribbed floor mats, firewall, roof headliner, left/right door cards with
   * grab straps, window net, and rear-view mirror.
   */
  private buildCabinStructure(): void {
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.85,
      metalness: 0.10,
      flatShading: true,
    });

    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.95,
      metalness: 0.05,
    });

    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x1e1e24,
      roughness: 0.75,
      metalness: 0.15,
      flatShading: true,
    });

    const strapMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626, // Bright motorsport red pull strap
      roughness: 0.6,
    });

    const mirrorGlassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.95,
    });

    // 1. Full-width sealed floor tub (1.70m wide, completely seals cabin from chassis exterior)
    const floorTub = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.04, 1.45), floorMat);
    floorTub.position.set(0, 0.395, -0.05);
    this.group.add(floorTub);

    // Ribbed rubber floor mats in driver and passenger footwells
    for (const fx of [-0.33, 0.33]) {
      const mat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.01, 0.50), rubberMat);
      mat.position.set(fx, 0.418, 0.28);
      this.group.add(mat);
    }

    // 2. Forward firewall bulkhead (seals engine compartment from cabin)
    const firewall = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.46, 0.04), floorMat);
    firewall.position.set(0, 0.40, 0.60);
    this.group.add(firewall);

    // 3. Interior roof headliner (tucked high under roof cap)
    const headliner = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.02, 0.94), floorMat);
    headliner.position.set(0, 0.88, -0.18);
    this.group.add(headliner);

    // 4. Interior door panels (driver and co-driver)
    for (const dx of [-0.67, 0.67]) {
      const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.44, 0.92), doorMat);
      doorPanel.position.set(dx, 0.48, -0.05);
      this.group.add(doorPanel);

      // Armrest ledge
      const armrest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.30), floorMat);
      armrest.position.set(dx > 0 ? dx - 0.04 : dx + 0.04, 0.48, -0.02);
      this.group.add(armrest);

      // Red nylon door pull strap
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.025), strapMat);
      strap.position.set(dx > 0 ? dx - 0.04 : dx + 0.04, 0.50, 0.08);
      strap.rotation.z = dx > 0 ? -0.2 : 0.2;
      this.group.add(strap);
    }

    // 5. Driver window safety net (mesh grid on driver side)
    const netGroup = new THREE.Group();
    const netMat = new THREE.LineBasicMaterial({ color: 0x1f2937, linewidth: 2 });
    for (let ny = 0.52; ny <= 0.78; ny += 0.05) {
      const pts = [new THREE.Vector3(-0.65, ny, -0.42), new THREE.Vector3(-0.65, ny, 0.15)];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      netGroup.add(new THREE.Line(geom, netMat));
    }
    for (let nz = -0.42; nz <= 0.15; nz += 0.07) {
      const pts = [new THREE.Vector3(-0.65, 0.52, nz), new THREE.Vector3(-0.65, 0.78, nz)];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      netGroup.add(new THREE.Line(geom, netMat));
    }
    this.group.add(netGroup);

    // 6. Compact Rear-view Mirror (center top roof header)
    const mirrorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), floorMat);
    mirrorStem.position.set(0, 0.85, 0.28);
    mirrorStem.rotation.x = -0.35;
    this.group.add(mirrorStem);

    const mirrorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.025), doorMat);
    mirrorHousing.position.set(0, 0.825, 0.29);
    mirrorHousing.rotation.y = 0.08; // Angled slightly toward driver
    this.group.add(mirrorHousing);

    const mirrorFace = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.038), mirrorGlassMat);
    mirrorFace.position.set(0, 0, -0.013);
    mirrorFace.rotation.y = Math.PI;
    mirrorHousing.add(mirrorFace);

    // 7. Slim Windshield Sun Visor Banner ("APEX RALLY")
    const bannerCanvas = createSafeCanvas(512, 64);
    let bannerTex: THREE.CanvasTexture | undefined;
    if (bannerCanvas) {
      const bctx = bannerCanvas.getContext('2d');
      if (bctx) {
        bctx.fillStyle = '#111114';
        bctx.fillRect(0, 0, 512, 64);
        bctx.fillStyle = '#ffffff';
        bctx.font = '900 36px "Inter", sans-serif';
        bctx.textAlign = 'center';
        bctx.textBaseline = 'middle';
        bctx.fillText('APEX RALLY', 256, 32);
        bannerTex = new THREE.CanvasTexture(bannerCanvas);
      }
    }
    const bannerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      map: bannerTex,
    });
    const visorBanner = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.10), bannerMat);
    visorBanner.position.set(0, 0.835, 0.28);
    visorBanner.rotation.x = 0.42; // Tucked tight to windshield header
    this.group.add(visorBanner);
  }

  /**
   * 2. Fully Joined Tubular Roll Cage (T45 Steel):
   * Main hoop behind seats, horizontal harness bar, roof longitudinal bars & diagonal,
   * A-pillar down-bars, and door X-intrusion bars.
   */
  private buildRollCage(): void {
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8, // Painted silver-white motorsport steel
      roughness: 0.35,
      metalness: 0.75,
      flatShading: true,
    });

    const tubeRadius = 0.013; // 26mm OD low-poly tubing

    const addTube = (p1: THREE.Vector3, p2: THREE.Vector3) => {
      const dir = p2.clone().sub(p1);
      const len = dir.length();
      const geom = new THREE.CylinderGeometry(tubeRadius, tubeRadius, len, 8);
      const tube = new THREE.Mesh(geom, tubeMat);
      tube.position.copy(p1).lerp(p2, 0.5);
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      this.group.add(tube);
      return tube;
    };

    // A. Main B-Pillar Hoop (behind seats at z = -0.46)
    const bLeft = new THREE.Vector3(-0.58, 0.42, -0.46);
    const bTopLeft = new THREE.Vector3(-0.56, 0.86, -0.46);
    const bTopRight = new THREE.Vector3(0.56, 0.86, -0.46);
    const bRight = new THREE.Vector3(0.58, 0.42, -0.46);

    addTube(bLeft, bTopLeft);
    addTube(bTopLeft, bTopRight);
    addTube(bTopRight, bRight);

    // Horizontal Harness Bar (shoulder belt anchor at y = 0.52)
    addTube(new THREE.Vector3(-0.57, 0.52, -0.46), new THREE.Vector3(0.57, 0.52, -0.46));

    // B. Roof Longitudinal Bars (B-pillar to A-pillar header)
    const aTopLeft = new THREE.Vector3(-0.56, 0.87, 0.22);
    const aTopRight = new THREE.Vector3(0.56, 0.87, 0.22);

    addTube(bTopLeft, aTopLeft);
    addTube(bTopRight, aTopRight);

    // Front Windshield Transverse Header Bar
    addTube(aTopLeft, aTopRight);

    // Roof Diagonal Cross-Bar (tucked flush against ceiling)
    addTube(bTopLeft, aTopRight);

    // C. A-Pillar Down-Bars (framing windshield down to floor)
    const aBottomLeft = new THREE.Vector3(-0.62, 0.42, 0.56);
    const aBottomRight = new THREE.Vector3(0.62, 0.42, 0.56);

    addTube(aTopLeft, aBottomLeft);
    addTube(aTopRight, aBottomRight);

    // D. Door Intrusion X-Bars (Left and Right)
    // Left Door X-bars
    addTube(new THREE.Vector3(-0.60, 0.44, -0.44), new THREE.Vector3(-0.62, 0.58, 0.48));
    addTube(new THREE.Vector3(-0.60, 0.58, -0.44), new THREE.Vector3(-0.62, 0.44, 0.48));

    // Right Door X-bars
    addTube(new THREE.Vector3(0.60, 0.44, -0.44), new THREE.Vector3(0.62, 0.58, 0.48));
    addTube(new THREE.Vector3(0.60, 0.58, -0.44), new THREE.Vector3(0.62, 0.44, 0.48));
  }

  /**
   * 3. Sculpted Dashboard & Instrument Binnacle:
   * Dark flocked alcantara with red accent stitching, hollow arched binnacle cowl,
   * round air vents, and co-driver pacenote binder.
   */
  private buildDashboardAndBinnacle(): void {
    const dashMat = new THREE.MeshStandardMaterial({
      color: 0x121215, // Anti-glare flocked deep charcoal alcantara
      roughness: 0.92,
      metalness: 0.05,
      flatShading: true,
    });

    const stitchMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626, // Red motorsport seam stitching
      roughness: 0.5,
    });

    const ventMat = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.8,
      metalness: 0.3,
    });

    const metalBezelMat = new THREE.MeshStandardMaterial({
      color: 0xa1a1aa,
      roughness: 0.25,
      metalness: 0.85,
    });

    // Main Upper Dashboard Deck
    const dashDeck = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.06, 0.38), dashMat);
    dashDeck.position.set(0, 0.44, 0.44);
    dashDeck.rotation.x = -0.10;
    this.group.add(dashDeck);

    // Red motorsport contrast seam line running across dash
    const seam = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.005, 0.005), stitchMat);
    seam.position.set(0, 0.468, 0.38);
    seam.rotation.x = -0.10;
    this.group.add(seam);

    // Lower Vertical Knee Bolster
    const kneeBolster = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.22, 0.08), dashMat);
    kneeBolster.position.set(0, 0.30, 0.26);
    this.group.add(kneeBolster);

    // Instrument Binnacle Hood (hollow cowl framing dials ahead of driver)
    const cowlRoof = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.016, 0.14), dashMat);
    cowlRoof.position.set(this.wheelCenter.x, 0.585, 0.27);
    cowlRoof.rotation.x = -0.14;
    this.group.add(cowlRoof);

    // Cowl side cheeks
    const leftCheek = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.09, 0.12), dashMat);
    leftCheek.position.set(this.wheelCenter.x - 0.19, 0.535, 0.27);
    leftCheek.rotation.x = -0.14;
    this.group.add(leftCheek);

    const rightCheek = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.09, 0.12), dashMat);
    rightCheek.position.set(this.wheelCenter.x + 0.19, 0.535, 0.27);
    rightCheek.rotation.x = -0.14;
    this.group.add(rightCheek);

    // Cluster backplate
    const backplate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.09, 0.015), dashMat);
    backplate.position.set(this.wheelCenter.x, 0.53, 0.33);
    backplate.rotation.x = -0.14;
    this.group.add(backplate);

    // Round Air Vents (center and passenger side)
    for (const vx of [-0.06, 0.14, 0.48]) {
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.010, 12), ventMat);
      vent.position.set(vx, 0.455, 0.40);
      vent.rotation.x = 0.35;
      this.group.add(vent);

      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.003, 8, 16), metalBezelMat);
      bezel.position.copy(vent.position);
      bezel.rotation.copy(vent.rotation);
      this.group.add(bezel);
    }
  }

  /**
   * 4. Center Console, Switches, Shifter, Handbrake, and Aluminum Pedals:
   */
  private buildCenterConsoleAndPedals(): void {
    const consoleMat = new THREE.MeshStandardMaterial({
      color: 0x1c1c20,
      roughness: 0.7,
      metalness: 0.2,
      flatShading: true,
    });

    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.5,
      metalness: 0.4,
    });

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xa1a1aa,
      roughness: 0.25,
      metalness: 0.85,
    });

    const pedalMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.3,
      metalness: 0.85,
    });

    // Center Console tunnel sloping down between seats
    const consoleTunnel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.74), consoleMat);
    consoleTunnel.position.set(0, 0.26, 0.05);
    consoleTunnel.rotation.x = -0.24;
    this.group.add(consoleTunnel);

    // Carbon-fiber toggle switch panel
    const switchPanel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.012), carbonMat);
    switchPanel.position.set(0, 0.38, 0.26);
    switchPanel.rotation.x = -0.30;
    this.group.add(switchPanel);

    // Aircraft red-guarded ignition toggle
    const redGuard = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.034, 0.018),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 })
    );
    redGuard.position.set(-0.05, 0.395, 0.265);
    redGuard.rotation.x = -0.30;
    this.group.add(redGuard);

    // Row of 4 toggle switches (Fuel, Fan, Aux, Anti-lag)
    for (let i = 0; i < 4; i++) {
      const tx = -0.04 + i * 0.028;
      const toggle = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.014, 6), metalMat);
      toggle.position.set(tx, 0.355, 0.268);
      toggle.rotation.x = 0.5;
      this.group.add(toggle);

      // Status LED above toggle
      const ledMat = new THREE.MeshStandardMaterial({
        color: i === 0 ? 0x22c55e : 0xfacc15,
        emissive: new THREE.Color(i === 0 ? 0x22c55e : 0xfacc15),
        emissiveIntensity: 0.6,
      });
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.003), ledMat);
      led.position.set(tx, 0.368, 0.272);
      this.group.add(led);
    }

    // Sequential Gear Shifter with mechanical gate & red shift ball
    this.shifterLeverGroup.position.copy(this.shifterPos);
    this.group.add(this.shifterLeverGroup);

    const shiftBase = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.10), consoleMat);
    this.shifterLeverGroup.add(shiftBase);

    // Shift gate slit
    const gateSlit = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.07), metalMat);
    gateSlit.position.set(0, 0.021, 0);
    this.shifterLeverGroup.add(gateSlit);

    const shiftStick = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.20, 8), metalMat);
    shiftStick.position.set(0, 0.10, 0);
    this.shifterLeverGroup.add(shiftStick);

    const shiftKnob = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.2 })
    );
    shiftKnob.position.set(0, 0.20, 0);
    this.shifterLeverGroup.add(shiftKnob);

    // Tall Vertical Hydraulic Handbrake Wand (to right of steering wheel)
    this.ebrakeLeverGroup.position.copy(this.ebrakePos);
    this.group.add(this.ebrakeLeverGroup);

    const ebrakeBase = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.08), consoleMat);
    this.ebrakeLeverGroup.add(ebrakeBase);

    // Upright wand
    this.ebrakeWandMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 8), metalMat);
    this.ebrakeWandMesh.position.set(0, 0.14, 0);
    this.ebrakeWandMesh.rotation.x = -0.15;
    this.ebrakeLeverGroup.add(this.ebrakeWandMesh);

    // Knurled black foam grip
    const ebrakeGrip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.11, 8),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 })
    );
    ebrakeGrip.position.set(0, 0.07, 0);
    this.ebrakeWandMesh.add(ebrakeGrip);

    // Aluminum Drilled 3-Pedal Box in Driver Footwell
    const buildPedal = (group: THREE.Group, px: number, width: number, height: number) => {
      group.position.set(px, 0.43, 0.46);
      this.group.add(group);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.12, 0.008), metalMat);
      arm.position.set(0, -0.06, 0);
      arm.rotation.x = -0.25;
      group.add(arm);

      const pad = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.006), pedalMat);
      pad.position.set(0, -0.11, 0.02);
      pad.rotation.x = -0.25;
      group.add(pad);

      // Lightweight drill holes in pedal face
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      for (const dy of [-0.015, 0, 0.015]) {
        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.003, 6), dotMat);
        dot.position.set(0, dy, 0.004);
        pad.add(dot);
      }
    };

    buildPedal(this.clutchPedalGroup, -0.40, 0.038, 0.060); // Clutch pedal
    buildPedal(this.brakePedalGroup, -0.34, 0.046, 0.060);  // Brake pedal (wide)
    buildPedal(this.throttlePedalGroup, -0.27, 0.034, 0.080); // Throttle pedal (tall)

    // Red handheld fire extinguisher mounted in passenger footwell
    const extGroup = new THREE.Group();
    extGroup.position.set(0.28, 0.44, 0.30);
    extGroup.rotation.set(0, 0, Math.PI / 2);
    this.group.add(extGroup);

    const extBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 })
    );
    extGroup.add(extBody);

    const extValve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.04, 8),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.25, metalness: 0.8 })
    );
    extValve.position.set(0, 0.12, 0);
    extGroup.add(extValve);
  }

  /**
   * 5. Dished 3-Spoke Rally Steering Wheel (340mm):
   * Tilted column, full circular rim, 3 drilled alloy spokes, center hub,
   * and yellow 12 o'clock center stripe.
   */
  private buildSteeringWheel(): void {
    const colMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.22, 8), colMat);
    col.position.set(this.wheelCenter.x, this.wheelCenter.y - 0.07, this.wheelCenter.z + 0.08);
    col.rotation.x = Math.PI / 3.4;
    this.group.add(col);

    // Steering wheel group placed at wheel center, angled back ~22.5 deg
    this.steeringWheelGroup.position.copy(this.wheelCenter);
    this.steeringWheelGroup.rotation.x = this.columnAngle;
    this.steeringWheelGroup.name = 'steeringWheel'; // Required for test T1_R2_02
    this.group.add(this.steeringWheelGroup);

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x18181b, // Deep dark suede
      roughness: 0.75,
      metalness: 0.05,
    });

    const spokeMat = new THREE.MeshStandardMaterial({
      color: 0xa1a1aa, // Brushed titanium/alloy
      roughness: 0.25,
      metalness: 0.85,
    });

    // 1. Full-circle Torus Rim (diameter 34cm -> radius 0.170m, tube 0.015m)
    this.wheelRimMesh = new THREE.Mesh(new THREE.TorusGeometry(this.wheelRadius, 0.015, 12, 36), rimMat);
    this.steeringWheelGroup.add(this.wheelRimMesh);

    // 2. Yellow 12 o'clock center stripe on rim
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
    const topStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 12), stripeMat);
    topStripe.position.set(0, this.wheelRadius, 0);
    topStripe.rotation.z = Math.PI / 2;
    this.steeringWheelGroup.add(topStripe);

    // 3. Three alloy spokes (9 o'clock, 3 o'clock, 6 o'clock) with drill holes
    for (const angle of [Math.PI, 0, -Math.PI / 2]) {
      const spokeGroup = new THREE.Group();
      spokeGroup.rotation.z = angle;

      const spokeArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.024, 0.007), spokeMat);
      spokeArm.position.set(0.070, 0, -0.012); // Dished rearward slightly
      spokeGroup.add(spokeArm);

      // 3 Drilled rally weight-saving holes per spoke
      const holeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      for (const hx of [0.045, 0.075, 0.105]) {
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.009, 8), holeMat);
        hole.position.set(hx, 0, -0.012);
        hole.rotation.x = Math.PI / 2;
        spokeGroup.add(hole);
      }

      this.steeringWheelGroup.add(spokeGroup);
    }

    // 4. Center horn button / rally hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.022, 16), spokeMat);
    hub.rotateX(Math.PI / 2);
    hub.position.z = -0.010;
    this.steeringWheelGroup.add(hub);

    // Center rally emblem badge (Alpine / Apex emblem)
    const badgeCanvas = createSafeCanvas(128, 128);
    let badgeTex: THREE.CanvasTexture | undefined;
    if (badgeCanvas) {
      const bctx = badgeCanvas.getContext('2d');
      if (bctx) {
        bctx.fillStyle = '#0284c7';
        bctx.beginPath();
        bctx.arc(64, 64, 60, 0, Math.PI * 2);
        bctx.fill();
        bctx.strokeStyle = '#e2e8f0';
        bctx.lineWidth = 6;
        bctx.stroke();

        bctx.fillStyle = '#ffffff';
        bctx.font = 'bold 64px sans-serif';
        bctx.textAlign = 'center';
        bctx.textBaseline = 'middle';
        bctx.fillText('A', 64, 66);
        badgeTex = new THREE.CanvasTexture(badgeCanvas);
      }
    }
    const badge = new THREE.Mesh(
      new THREE.CircleGeometry(0.026, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: badgeTex })
    );
    badge.position.set(0, 0, 0.002);
    this.steeringWheelGroup.add(badge);
  }

  /**
   * 6. Working Illuminated Analog Gauges:
   * Clockwise Tachometer (0-8000 RPM, orange/red redline arc at 7200-7800) and
   * Speedometer (0-140 MPH) visible through the upper steering wheel opening.
   */
  private buildAnalogGauges(): void {
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.25,
      metalness: 0.85,
    });

    const needleMat = new THREE.MeshBasicMaterial({ color: 0xff2222 }); // Fluorescent red

    // Warm cockpit instrument illumination
    const clusterLight = new THREE.PointLight(0xfff5ea, 1.2, 1.8);
    clusterLight.position.set(this.wheelCenter.x, 0.52, 0.25);
    this.group.add(clusterLight);

    // Helper to generate crisp, non-mirrored dial canvas textures
    const createDialTexture = (isTacho: boolean): THREE.CanvasTexture | undefined => {
      const canvas = createSafeCanvas(512, 512);
      if (!canvas) return undefined;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;

      // Dark gauge face
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(256, 256, 240, 0, Math.PI * 2);
      ctx.fill();

      // Outer bezel ring
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 6;
      ctx.stroke();

      const cx = 256;
      const cy = 256;
      const r = 200;

      // Gauge arc sweeps clockwise from ~220 deg down-left to ~-40 deg down-right
      const startAngle = Math.PI * 0.78; // ~140 deg (lower-left in math radians)
      const sweepAngle = Math.PI * 1.44; // ~260 deg arc

      if (isTacho) {
        // Redline arc (7200 to 8000 RPM, last 12% of arc)
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 10, startAngle + sweepAngle * 0.88, startAngle + sweepAngle);
        ctx.stroke();

        // Warning amber arc (6200 to 7200 RPM)
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 10, startAngle + sweepAngle * 0.75, startAngle + sweepAngle * 0.88);
        ctx.stroke();

        // RPM Tick marks (0 to 8 x 1000)
        for (let i = 0; i <= 8; i++) {
          const frac = i / 8;
          const theta = startAngle + sweepAngle * frac;
          const isMajor = true;
          const tickLen = 24;

          const x1 = cx + Math.cos(theta) * (r - tickLen);
          const y1 = cy + Math.sin(theta) * (r - tickLen);
          const x2 = cx + Math.cos(theta) * r;
          const y2 = cy + Math.sin(theta) * r;

          ctx.strokeStyle = i >= 7 ? '#dc2626' : '#ffffff';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          // Numbers (1 to 8)
          const tx = cx + Math.cos(theta) * (r - 46);
          const ty = cy + Math.sin(theta) * (r - 46);
          ctx.fillStyle = i >= 7 ? '#ef4444' : '#ffffff';
          ctx.font = 'bold 36px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(i.toString(), tx, ty);
        }

        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 20px monospace';
        ctx.fillText('RPM x1000', cx, cy + 90);

      } else {
        // Speedometer Tick marks (0 to 140 mph in steps of 20)
        for (let i = 0; i <= 140; i += 20) {
          const frac = i / 140;
          const theta = startAngle + sweepAngle * frac;
          const tickLen = 22;

          const x1 = cx + Math.cos(theta) * (r - tickLen);
          const y1 = cy + Math.sin(theta) * (r - tickLen);
          const x2 = cx + Math.cos(theta) * r;
          const y2 = cy + Math.sin(theta) * r;

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          const tx = cx + Math.cos(theta) * (r - 46);
          const ty = cy + Math.sin(theta) * (r - 46);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 32px "Inter", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(i.toString(), tx, ty);
        }

        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 22px monospace';
        ctx.fillText('MPH', cx, cy + 90);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = 8;
      return texture;
    };

    const dialGeom = new THREE.PlaneGeometry(0.125, 0.125);

    // Tachometer (Left Dial)
    const tachoTex = createDialTexture(true);
    const tachoMesh = new THREE.Mesh(
      dialGeom,
      new THREE.MeshBasicMaterial({
        map: tachoTex,
        color: 0xffffff,
        side: THREE.DoubleSide,
      })
    );
    tachoMesh.position.set(this.wheelCenter.x - 0.075, 0.53, 0.30);
    tachoMesh.rotation.x = -0.14;
    this.group.add(tachoMesh);

    // Tachometer Needle
    this.tachoNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.046, 0.002), needleMat);
    this.tachoNeedle.position.set(0, 0.016, 0.003);
    tachoMesh.add(this.tachoNeedle);

    // Speedometer (Right Dial)
    const speedoTex = createDialTexture(false);
    const speedoMesh = new THREE.Mesh(
      dialGeom,
      new THREE.MeshBasicMaterial({
        map: speedoTex,
        color: 0xffffff,
        side: THREE.DoubleSide,
      })
    );
    speedoMesh.position.set(this.wheelCenter.x + 0.075, 0.53, 0.30);
    speedoMesh.rotation.x = -0.14;
    this.group.add(speedoMesh);

    // Speedometer Needle
    this.speedoNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.046, 0.002), needleMat);
    this.speedoNeedle.position.set(0, 0.016, 0.003);
    speedoMesh.add(this.speedoNeedle);

    // Bezel rings around dials
    for (const pos of [tachoMesh.position, speedoMesh.position]) {
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.060, 0.004, 8, 24), bezelMat);
      bezel.position.copy(pos);
      bezel.rotation.copy(tachoMesh.rotation);
      this.group.add(bezel);
    }

    // 5-LED Sequential Shift Light Strip above dials
    for (let i = 0; i < 5; i++) {
      const ledColor = i < 2 ? 0x22c55e : i < 4 ? 0xfacc15 : 0xef4444;
      const mat = new THREE.MeshStandardMaterial({
        color: ledColor,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.8,
      });
      this.shiftLeds.push(mat);

      const ledMesh = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.004), mat);
      ledMesh.position.set(this.wheelCenter.x - 0.048 + i * 0.024, 0.565, 0.295);
      ledMesh.rotation.x = -0.14;
      this.group.add(ledMesh);
    }
  }

  /**
   * 7. Driver Model & 2-Bone Arm IK:
   * Left & right bucket seats with 4-point harnesses, driver model, and 2-bone arm IK.
   */
  private buildDriverRig(): void {
    const seatMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.8,
      flatShading: true,
    });

    const harnessMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626, // Red 4-point harness straps
      roughness: 0.5,
    });

    const suitMat = new THREE.MeshStandardMaterial({
      color: 0x27272a, // Flocked dark charcoal rally racing suit
      roughness: 0.85,
      flatShading: true,
    });

    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0x18181b, // Black suede rally glove
      roughness: 0.85,
      flatShading: true,
    });

    const gloveAccentMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // Bright yellow silicone grip accents
      roughness: 0.4,
    });

    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f5, // Pearl white helmet
      roughness: 0.3,
      metalness: 0.1,
    });

    // Bucket Seats (Driver x = -0.33, Co-driver x = +0.33)
    for (const sx of [-0.33, 0.33]) {
      // Seat cushion
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.10, 0.45), seatMat);
      cushion.position.set(sx, 0.43, -0.22);
      this.group.add(cushion);

      // Seat backrest
      const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.10), seatMat);
      backrest.position.set(sx, 0.65, -0.42);
      backrest.rotation.x = 0.18;
      this.group.add(backrest);

      // Side bolsters
      for (const bx of [-0.19, 0.19]) {
        const bolster = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.22), seatMat);
        bolster.position.set(sx + bx, 0.58, -0.34);
        this.group.add(bolster);
      }

      // 4-Point Harness Straps (shoulder straps)
      for (const hx of [-0.08, 0.08]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.46, 0.01), harnessMat);
        strap.position.set(sx + hx, 0.64, -0.38);
        strap.rotation.x = 0.18;
        this.group.add(strap);
      }
    }

    // Driver Torso (seated in left bucket seat)
    this.driverTorso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.26), suitMat);
    this.driverTorso.position.set(this.driverPos.x, this.driverPos.y + 0.28, this.driverPos.z);
    this.driverTorso.rotation.x = -0.16;
    this.group.add(this.driverTorso);

    // Driver Racing Helmet & Visor
    this.driverHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), helmetMat);
    this.driverHead.position.set(this.driverPos.x, this.driverPos.y + 0.52, this.driverPos.z + 0.04);
    this.group.add(this.driverHead);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.05, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 })
    );
    visor.position.set(0, 0.01, 0.08);
    this.driverHead.add(visor);

    // Left Arm Setup (Sleeves)
    this.leftUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, this.upperArmLen, 8), suitMat);
    this.leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.030, this.forearmLen, 8), suitMat);
    this.group.add(this.leftUpperArm);
    this.group.add(this.leftForearm);

    this.buildGloveMesh(this.leftHandGroup, gloveMat, gloveAccentMat, true);
    this.group.add(this.leftHandGroup);

    // Right Arm Setup (Sleeves)
    this.rightUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, this.upperArmLen, 8), suitMat);
    this.rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.030, this.forearmLen, 8), suitMat);
    this.group.add(this.rightUpperArm);
    this.group.add(this.rightForearm);

    this.buildGloveMesh(this.rightHandGroup, gloveMat, gloveAccentMat, false);
    this.group.add(this.rightHandGroup);
  }

  /**
   * Helper to construct a detailed rally glove with yellow high-grip accents
   */
  private buildGloveMesh(
    group: THREE.Group,
    mainMat: THREE.Material,
    accentMat: THREE.Material,
    isLeft: boolean
  ): void {
    // Palm / main hand body
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.038, 0.055), mainMat);
    group.add(palm);

    // Yellow grip accent on outer glove edge
    const accent = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.024, 0.048), accentMat);
    accent.position.set(isLeft ? -0.022 : 0.022, 0, 0);
    group.add(accent);

    // Curled gripping fingers wrapping around wheel rim
    const fingers = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.044, 8), mainMat);
    fingers.position.set(0, -0.015, 0.020);
    fingers.rotation.x = Math.PI / 2;
    group.add(fingers);

    // Thumb hooked onto wheel spoke
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.007, 0.030, 8), mainMat);
    thumb.position.set(isLeft ? 0.020 : -0.020, 0.011, 0.011);
    thumb.rotation.z = isLeft ? -0.45 : 0.45;
    group.add(thumb);
  }

  /**
   * 2-Bone Inverse Kinematics analytical solver:
   * Accurately calculates shoulder-to-hand reach and aligns upper arm and forearm meshes.
   */
  private solveTwoBoneIK(
    shoulder: THREE.Vector3,
    targetHand: THREE.Vector3,
    upperArmMesh: THREE.Mesh,
    forearmMesh: THREE.Mesh,
    handGroup: THREE.Group,
    bendDirection: THREE.Vector3
  ): void {
    const dVec = targetHand.clone().sub(shoulder);
    const d = Math.max(0.05, Math.min(dVec.length(), this.upperArmLen + this.forearmLen - 0.005));

    const cosElbow = (this.upperArmLen ** 2 + this.forearmLen ** 2 - d ** 2) / (2 * this.upperArmLen * this.forearmLen);
    const elbowAngle = Math.PI - Math.acos(THREE.MathUtils.clamp(cosElbow, -1, 1));

    const cosShoulder = (this.upperArmLen ** 2 + d ** 2 - this.forearmLen ** 2) / (2 * this.upperArmLen * d);
    const shoulderAngle = Math.acos(THREE.MathUtils.clamp(cosShoulder, -1, 1));

    const dirNorm = dVec.clone().normalize();
    const planeNormal = new THREE.Vector3().crossVectors(dirNorm, bendDirection).normalize();
    const perp = new THREE.Vector3().crossVectors(planeNormal, dirNorm).normalize();

    const elbowPos = shoulder.clone()
      .addScaledVector(dirNorm, Math.cos(shoulderAngle) * this.upperArmLen)
      .addScaledVector(perp, Math.sin(shoulderAngle) * this.upperArmLen);

    upperArmMesh.position.copy(shoulder).lerp(elbowPos, 0.5);
    upperArmMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), elbowPos.clone().sub(shoulder).normalize());

    forearmMesh.position.copy(elbowPos).lerp(targetHand, 0.5);
    forearmMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetHand.clone().sub(elbowPos).normalize());

    handGroup.position.copy(targetHand);
    handGroup.quaternion.copy(forearmMesh.quaternion);
  }

  /**
   * Main per-frame update loop:
   * Updates steering wheel rotation, gauge needles, shift lights, pedals,
   * sequential gear shifter reach, and handbrake articulation.
   */
  public update(dt: number, arg1: any, arg2?: any): void {
    let telemetry: VehicleTelemetry;
    let steerInput = 0;

    if (arg1 && typeof arg1.rpm !== 'undefined') {
      telemetry = arg1;
      steerInput = typeof arg2 === 'number' ? arg2 : 0;
    } else if (arg1 && typeof arg1.steer !== 'undefined') {
      steerInput = arg1.steer;
      telemetry = (arg2 || {
        speedMph: 0,
        rpm: 950,
        gear: 1,
        throttleInput: 0,
        brakeInput: 0,
        steerInput: steerInput,
        handbrakeActive: false,
        isShifting: false,
      }) as any;
    } else {
      telemetry = ({
        speedMph: 0,
        rpm: 950,
        gear: 1,
        throttleInput: 0,
        brakeInput: 0,
        steerInput: 0,
        handbrakeActive: false,
        isShifting: false,
      }) as any;
    }

    // 1. Steering Wheel Articulation (+-180 deg / +-PI rad)
    // Matches test T1_R2_02 assertion: child.rotation.z reaches ~PI at full steer input
    const clampedSteer = THREE.MathUtils.clamp(steerInput, -1.0, 1.0);
    const wheelRotZ = -clampedSteer * Math.PI;
    this.steeringWheelGroup.rotation.z = wheelRotZ;

    // 2. Analog Dashboard Gauge Needles
    // Tachometer: 0 to 8000 RPM maps across 240 deg arc (-2.09 rad)
    const rpmFrac = THREE.MathUtils.clamp(telemetry.rpm / 8000, 0, 1.0);
    const tachoAngle = -rpmFrac * 4.18879; // 240 deg in radians
    if (this.tachoNeedle) {
      this.tachoNeedle.rotation.z = tachoAngle;
    }

    // Speedometer: 0 to 140 MPH maps across 220 deg arc (-1.92 rad)
    const speedFrac = THREE.MathUtils.clamp(telemetry.speedMph / 140, 0, 1.0);
    const speedoAngle = -speedFrac * 3.83972; // 220 deg in radians
    if (this.speedoNeedle) {
      this.speedoNeedle.rotation.z = speedoAngle;
    }

    // 5-LED Sequential Shift Light Array
    const rpm = telemetry.rpm;
    for (let i = 0; i < this.shiftLeds.length; i++) {
      const ledThreshold = 5500 + i * 450; // 5500, 5950, 6400, 6850, 7300
      const isLit = rpm >= ledThreshold;
      const isRedlineBlink = rpm >= 7200 && Math.floor(performance.now() / 80) % 2 === 0;

      if (isLit) {
        this.shiftLeds[i].emissiveIntensity = isRedlineBlink ? 1.0 : 0.8;
      } else {
        this.shiftLeds[i].emissiveIntensity = 0.05;
      }
    }

    // 3. Pedal Articulation
    const throttleDeflect = (telemetry.throttleInput || 0) * 0.25;
    this.throttlePedalGroup.rotation.x = throttleDeflect;

    const brakeDeflect = (telemetry.brakeInput || 0) * 0.25;
    this.brakePedalGroup.rotation.x = brakeDeflect;

    const clutchDeflect = (telemetry.isShifting ? 1.0 : 0) * 0.25;
    this.clutchPedalGroup.rotation.x = clutchDeflect;

    // 4. Sequential Gear Shift Animation
    if (telemetry.gear !== this.prevGear || telemetry.isShifting) {
      if (!this.isShifting) {
        this.isShifting = true;
        this.shiftAnimTimer = 0;
      }
      this.prevGear = telemetry.gear;
    }

    let shiftReachFrac = 0; // 0 = at wheel, 1 = at shifter knob
    if (this.isShifting) {
      this.shiftAnimTimer += dt;
      const halfDur = this.shiftAnimDuration / 2;
      if (this.shiftAnimTimer < halfDur) {
        // Reaching down to shifter
        shiftReachFrac = this.shiftAnimTimer / halfDur;
      } else if (this.shiftAnimTimer < this.shiftAnimDuration) {
        // Returning back to steering wheel
        shiftReachFrac = 1.0 - (this.shiftAnimTimer - halfDur) / halfDur;
      } else {
        this.isShifting = false;
        shiftReachFrac = 0;
      }

      // Shifter lever flicks forward/backward with gear change
      const flick = Math.sin((this.shiftAnimTimer / this.shiftAnimDuration) * Math.PI);
      this.shifterLeverGroup.rotation.x = (telemetry.gear === 'R' ? -0.15 : 0.12) + flick * 0.18;
    }

    // 5. Handbrake Articulation & Reach
    const targetEbrake = telemetry.handbrakeActive ? 1.0 : 0.0;
    this.ebrakePullProgress = THREE.MathUtils.lerp(this.ebrakePullProgress, targetEbrake, Math.min(1.0, 15.0 * dt));
    if (this.ebrakeWandMesh) {
      this.ebrakeWandMesh.rotation.x = -0.15 - this.ebrakePullProgress * 0.35; // Pivots backward
    }

    // 6. 2-Bone Arm IK Driver Hands
    // Left hand grips 9 o'clock on steering wheel rim (rotates with wheel)
    const leftGripLocal = new THREE.Vector3(-this.wheelRadius, 0, 0);
    leftGripLocal.applyAxisAngle(new THREE.Vector3(0, 0, 1), wheelRotZ);
    leftGripLocal.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.columnAngle);
    const leftTargetHand = this.wheelCenter.clone().add(leftGripLocal);

    this.solveTwoBoneIK(
      this.leftShoulder,
      leftTargetHand,
      this.leftUpperArm,
      this.leftForearm,
      this.leftHandGroup,
      new THREE.Vector3(-1.0, -0.4, 0.1) // Elbow bends outward left
    );

    // Right hand grips 3 o'clock on steering wheel rim (or articulates to shifter / handbrake)
    const rightGripLocal = new THREE.Vector3(this.wheelRadius, 0, 0);
    rightGripLocal.applyAxisAngle(new THREE.Vector3(0, 0, 1), wheelRotZ);
    rightGripLocal.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.columnAngle);
    const rightWheelTarget = this.wheelCenter.clone().add(rightGripLocal);

    const shifterTarget = this.shifterPos.clone().add(new THREE.Vector3(0, 0.20, 0));
    const ebrakeTarget = this.ebrakePos.clone().add(new THREE.Vector3(0, 0.22, 0));

    let rightTargetHand = rightWheelTarget;
    if (shiftReachFrac > 0.01) {
      const smoothFrac = THREE.MathUtils.smoothstep(shiftReachFrac, 0, 1);
      rightTargetHand = rightWheelTarget.clone().lerp(shifterTarget, smoothFrac);
    } else if (this.ebrakePullProgress > 0.05) {
      rightTargetHand = rightWheelTarget.clone().lerp(ebrakeTarget, this.ebrakePullProgress);
    }

    this.solveTwoBoneIK(
      this.rightShoulder,
      rightTargetHand,
      this.rightUpperArm,
      this.rightForearm,
      this.rightHandGroup,
      new THREE.Vector3(1.0, -0.4, 0.1) // Elbow bends outward right
    );
  }
}
