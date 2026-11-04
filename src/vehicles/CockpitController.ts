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
 * Designed to authentically match DiRT Rally 2.0 & classic Group B / WRC references:
 * 1. Cabin Shell: Full tub floor, footwell, low firewall bulkhead, interior door cards,
 *    driver side window net, rear-view mirror, compact 'APEX RALLY' sun visor strip, and
 *    resting windshield wiper blades.
 * 2. Joined Tubular Roll Cage (T45 Steel): Main B-pillar hoop, harness bar, roof longitudinal bars,
 *    diagonal roof bar wrapped in protective safety padding with white tape rings, A-pillar down-bars
 *    with corner gusset plates, and door intrusion X-bars.
 * 3. Ergonomic Dashboard & Instrument Binnacle: Flocked deep charcoal alcantara with red double-stitching,
 *    sculpted arched binnacle cowl, dual analog gauges (Tachometer with redline arc & Speedometer),
 *    central digital gear display, 5-LED sequential shift light array, and directional air vents.
 * 4. Co-Driver Pace Notes: Spiral-bound rally pace note notebook on passenger dashboard shelf.
 * 5. Center Console & Controls: Gated sequential shifter with red knob, tall vertical hydraulic
 *    handbrake wand, aircraft toggle switches with red-guarded ignition, and status LEDs.
 * 6. Aluminum 3-Pedal Box: Clutch, brake, and throttle pedals with dynamic deflection driven by live inputs.
 * 7. Passenger Footwell: Handheld red rally fire extinguisher with brass valve.
 * 8. Driver Model & 2-Bone Arm IK: Charcoal racing suit with yellow-accented suede rally gloves.
 *    Forearms enter naturally from lower viewport corners to grip the wheel at 9 & 3 o'clock.
 *    Animated right-hand reach for sequential gear shifts and handbrake pulls.
 */
export class CockpitController {
  public group = new THREE.Group();

  // Steering wheel & column
  private steeringWheelGroup = new THREE.Group();
  private wheelRimMesh!: THREE.Mesh;

  // Analogue gauge needles, digital displays & LEDs
  private tachoNeedle!: THREE.Mesh;
  private speedoNeedle!: THREE.Mesh;
  private digitalGearTex!: THREE.CanvasTexture | null;
  private digitalGearCtx!: CanvasRenderingContext2D | null;
  private shiftLeds: THREE.MeshStandardMaterial[] = [];

  // Pedals
  private throttlePedalGroup = new THREE.Group();
  private brakePedalGroup = new THREE.Group();
  private clutchPedalGroup = new THREE.Group();

  // Levers
  private shifterLeverGroup = new THREE.Group();
  private ebrakeWandMesh!: THREE.Mesh;

  // Driver body & arm IK
  private driverTorso!: THREE.Mesh;
  private driverHead!: THREE.Mesh;
  private driverSeatMeshes: THREE.Object3D[] = [];
  private leftUpperArm!: THREE.Mesh;
  private leftForearm!: THREE.Mesh;
  private leftHandGroup = new THREE.Group();

  private rightUpperArm!: THREE.Mesh;
  private rightForearm!: THREE.Mesh;
  private rightHandGroup = new THREE.Group();

  // Arm joint anchor offsets from driver torso
  // Driver seated on left (LHD): x = -0.33, y = 0.22, z = -0.42
  private readonly leftShoulder = new THREE.Vector3(-0.48, 0.48, -0.36);
  private readonly rightShoulder = new THREE.Vector3(-0.18, 0.48, -0.36);
  private readonly upperArmLen = 0.28;
  private readonly forearmLen = 0.28;

  // Key interior anchor positions (LHD WRC Layout matching DiRT Rally 2.0)
  private readonly driverPos = new THREE.Vector3(-0.33, 0.22, -0.42);
  private readonly wheelCenter = new THREE.Vector3(-0.33, 0.43, 0.08);
  private readonly wheelRadius = 0.155; // 310mm rally dished wheel
  private readonly columnAngle = -Math.PI / 10.0; // ~18 deg tilt back towards driver

  private readonly shifterPos = new THREE.Vector3(-0.04, 0.26, 0.12);
  private readonly ebrakePos = new THREE.Vector3(0.06, 0.28, 0.08);

  // Dynamic animation states
  private prevGear: number | string = 1;
  private shiftAnimTimer = 0;
  private readonly shiftAnimDuration = 0.42; // 420ms total gear reach & return
  private isShifting = false;
  private ebrakePullProgress = 0; // 0 to 1
  private currentWheelRotZ = 0; // Smooth damped steering wheel rotation

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
    for (const m of this.driverSeatMeshes) {
      m.visible = !isCockpit;
    }
    if (this.leftUpperArm) this.leftUpperArm.visible = true;
    if (this.rightUpperArm) this.rightUpperArm.visible = true;
    if (this.leftForearm) this.leftForearm.visible = true;
    if (this.rightForearm) this.rightForearm.visible = true;
    if (this.leftHandGroup) this.leftHandGroup.visible = true;
    if (this.rightHandGroup) this.rightHandGroup.visible = true;
  }

  /**
   * 1. Full Cabin Structural Shell:
   * Floor pan, ribbed footwell mats, low firewall bulkhead, interior door cards with
   * grab straps, window net, rear-view mirror, and windshield wipers.
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

    const wiperMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.8,
      metalness: 0.2,
      flatShading: true,
    });

    // 1. Full-width floor pan at correct chassis height (y = 0.16)
    const floorTub = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.02, 1.45), floorMat);
    floorTub.position.set(0, 0.16, 0.0);
    this.group.add(floorTub);

    // Ribbed rubber floor mats in driver and passenger footwells
    for (const fx of [-0.33, 0.33]) {
      const mat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.008, 0.50), rubberMat);
      mat.position.set(fx, 0.174, 0.28);
      this.group.add(mat);
    }

    // 2. Forward firewall bulkhead (from floor y = 0.16 up to underside of dash y = 0.38)
    const firewall = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.22, 0.04), floorMat);
    firewall.position.set(0, 0.27, 0.58);
    this.group.add(firewall);

    // 3. Interior roof headliner
    const headliner = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.02, 0.94), floorMat);
    headliner.position.set(0, 0.88, -0.18);
    this.group.add(headliner);

    // 4. Interior door panels (driver and co-driver, from floor to window sill at y = 0.40)
    for (const dx of [-0.67, 0.67]) {
      const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.92), doorMat);
      doorPanel.position.set(dx, 0.28, 0.0);
      this.group.add(doorPanel);

      // Armrest ledge
      const armrest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.28), floorMat);
      armrest.position.set(dx > 0 ? dx - 0.035 : dx + 0.035, 0.38, 0.0);
      this.group.add(armrest);

      // Red nylon door pull strap
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.025), strapMat);
      strap.position.set(dx > 0 ? dx - 0.035 : dx + 0.035, 0.35, 0.08);
      strap.rotation.z = dx > 0 ? -0.2 : 0.2;
      this.group.add(strap);
    }

    // 5. Driver window safety net (mesh grid on driver side)
    const netGroup = new THREE.Group();
    const netMat = new THREE.LineBasicMaterial({ color: 0x1f2937, linewidth: 2 });
    for (let ny = 0.50; ny <= 0.78; ny += 0.05) {
      const pts = [new THREE.Vector3(-0.65, ny, -0.42), new THREE.Vector3(-0.65, ny, 0.15)];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      netGroup.add(new THREE.Line(geom, netMat));
    }
    for (let nz = -0.42; nz <= 0.15; nz += 0.07) {
      const pts = [new THREE.Vector3(-0.65, 0.50, nz), new THREE.Vector3(-0.65, 0.78, nz)];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      netGroup.add(new THREE.Line(geom, netMat));
    }
    this.group.add(netGroup);

    // 6. Compact Rear-view Mirror (center top roof header)
    const mirrorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), floorMat);
    mirrorStem.position.set(0, 0.84, 0.26);
    mirrorStem.rotation.x = -0.35;
    this.group.add(mirrorStem);

    const mirrorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.025), doorMat);
    mirrorHousing.position.set(0, 0.815, 0.27);
    mirrorHousing.rotation.y = -0.12; // Angled slightly toward driver
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
    const visorBanner = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.045), bannerMat);
    visorBanner.position.set(0, 0.855, 0.24);
    visorBanner.rotation.x = -0.68;
    this.group.add(visorBanner);

    // 8. Windshield Wipers resting along base of cowl (y = 0.415)
    for (const wx of [-0.28, 0.28]) {
      const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.008, 0.012), wiperMat);
      wiper.position.set(wx, 0.415, 0.52);
      wiper.rotation.y = wx < 0 ? -0.15 : 0.12;
      this.group.add(wiper);
    }

    // 9. Windshield Defroster Air Slots along cowl deck
    const ventSlotMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
    for (let sx = -0.50; sx <= 0.50; sx += 0.10) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.003, 0.012), ventSlotMat);
      slot.position.set(sx, 0.422, 0.48);
      slot.rotation.x = -0.06;
      this.group.add(slot);
    }

    // 10. Coiled Rally Intercom Headset Cable (hung neatly along the driver left A-pillar roll tube)
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.9 });
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      const angle = t * Math.PI * 6;
      const coilR = 0.012;
      const cy = THREE.MathUtils.lerp(0.78, 0.52, t);
      const cx = -0.58 + Math.cos(angle) * coilR;
      const cz = THREE.MathUtils.lerp(0.25, 0.35, t) + Math.sin(angle) * coilR;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(coilR, 0.003, 6, 12), cableMat);
      ring.position.set(cx, cy, cz);
      ring.rotation.x = Math.PI / 2;
      this.group.add(ring);
    }
  }

  /**
   * 2. Joined Tubular Roll Cage (T45 Steel):
   * Complete tubular cage with diagonal roof cross-bar padded in protective foam
   * and wrapped with white safety tape rings (matching DiRT Rally 2.0).
   */
  private buildRollCage(): void {
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8, // Painted silver-white motorsport steel
      roughness: 0.35,
      metalness: 0.75,
      flatShading: true,
    });

    const foamMat = new THREE.MeshStandardMaterial({
      color: 0x18181b, // Black protective roll bar foam padding
      roughness: 0.9,
    });

    const tapeMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f5, // White safety tape wraps
      roughness: 0.5,
    });

    const gussetMat = new THREE.MeshStandardMaterial({
      color: 0xa1a1aa,
      roughness: 0.35,
      metalness: 0.8,
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
    const bLeft = new THREE.Vector3(-0.58, 0.20, -0.46);
    const bTopLeft = new THREE.Vector3(-0.56, 0.86, -0.46);
    const bTopRight = new THREE.Vector3(0.56, 0.86, -0.46);
    const bRight = new THREE.Vector3(0.58, 0.20, -0.46);

    addTube(bLeft, bTopLeft);
    addTube(bTopLeft, bTopRight);
    addTube(bTopRight, bRight);

    // Horizontal Harness Bar (shoulder belt anchor at y = 0.48)
    addTube(new THREE.Vector3(-0.57, 0.48, -0.46), new THREE.Vector3(0.57, 0.48, -0.46));

    // B. Roof Longitudinal Bars (B-pillar to A-pillar header)
    const aTopLeft = new THREE.Vector3(-0.56, 0.86, 0.20);
    const aTopRight = new THREE.Vector3(0.56, 0.86, 0.20);

    addTube(bTopLeft, aTopLeft);
    addTube(bTopRight, aTopRight);

    // Front Windshield Transverse Header Bar
    addTube(aTopLeft, aTopRight);

    // Diagonal Roof / Header Brace with Slender Protective Foam & Safety Wraps (WRC Style)
    // Pressed flat against the ceiling on the passenger side — entirely out of the driver's forward sightline.
    const diagStart = new THREE.Vector3(0.06, 0.898, -0.42);
    const diagEnd = new THREE.Vector3(-0.54, 0.898, 0.18);
    const diagDir = diagEnd.clone().sub(diagStart);
    const diagLen = diagDir.length();
    const diagMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, diagLen, 8), foamMat);
    diagMesh.position.copy(diagStart).lerp(diagEnd, 0.5);
    diagMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diagDir.clone().normalize());
    this.group.add(diagMesh);

    // Slim safety tape rings around foam padding
    for (let f = 0.25; f <= 0.75; f += 0.25) {
      const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.025, 8), tapeMat);
      tape.position.copy(diagStart).lerp(diagEnd, f);
      tape.quaternion.copy(diagMesh.quaternion);
      this.group.add(tape);
    }

    // C. A-Pillar Down-Bars (framing windshield down to floor)
    const aBottomLeft = new THREE.Vector3(-0.62, 0.22, 0.54);
    const aBottomRight = new THREE.Vector3(0.62, 0.22, 0.54);

    const leftAPillarBar = addTube(aTopLeft, aBottomLeft);
    addTube(aTopRight, aBottomRight);

    // Welded Corner Gusset Plates with Punched Dimple Die Lightening Holes at A-Pillar / Header Junction
    for (const gx of [-0.55, 0.55]) {
      const gusset = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.06, 0.06), gussetMat);
      gusset.position.set(gx, 0.82, 0.22);
      this.group.add(gusset);

      // Punched dimple lightening holes through each gusset plate
      const dimpleHoleMat = new THREE.MeshBasicMaterial({ color: 0x18181b });
      for (const hy of [-0.014, 0.014]) {
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 8), dimpleHoleMat);
        hole.position.set(gx, 0.82 + hy, 0.22);
        hole.rotation.z = Math.PI / 2;
        this.group.add(hole);
      }
    }

    // Lower A-Pillar to Cowl Junction Gusset Plate on driver side
    const lowerGusset = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.05), gussetMat);
    lowerGusset.position.set(-0.61, 0.44, 0.48);
    this.group.add(lowerGusset);

    // High-Density Protective Roll Bar Foam Padding on driver A-Pillar down-tube
    const aPillarFoam = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.24, 8), foamMat);
    aPillarFoam.position.set(-0.59, 0.60, 0.35);
    aPillarFoam.quaternion.copy(leftAPillarBar.quaternion);
    this.group.add(aPillarFoam);

    // Contrasting white safety tape bands on A-pillar padding
    for (const tf of [-0.08, 0, 0.08]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.016, 8), tapeMat);
      band.position.set(-0.59, 0.60 + tf * 0.7, 0.35 + tf * 0.7);
      band.quaternion.copy(leftAPillarBar.quaternion);
      this.group.add(band);
    }

    // Emergency Red Nylon Driver Grab Loop Strap on A-pillar
    const grabStrapMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
    const grabStrap = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 8, 16), grabStrapMat);
    grabStrap.position.set(-0.56, 0.72, 0.28);
    grabStrap.rotation.y = 0.4;
    this.group.add(grabStrap);

    // Red Anodized Quick-Release Net Latch Buckle at top of A-Pillar
    const netLatch = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.028, 0.020),
      new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.8, roughness: 0.2 })
    );
    netLatch.position.set(-0.63, 0.76, 0.16);
    this.group.add(netLatch);

    // Driver Side Exterior Rally Wing Mirror (visible through driver corner window)
    const mirrorBracketMat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.6 });
    const mirrorGlassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.95, roughness: 0.05 });

    // Triangle corner sail bracket
    const mirrorSail = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.10, 0.08), mirrorBracketMat);
    mirrorSail.position.set(-0.74, 0.44, 0.20);
    this.group.add(mirrorSail);

    // Aerodynamic rally mirror casing
    const mirrorPod = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.065, 0.11), mirrorBracketMat);
    mirrorPod.position.set(-0.80, 0.45, 0.18);
    mirrorPod.rotation.y = -0.18; // Angled back towards driver
    this.group.add(mirrorPod);

    // Reflective side mirror glass face
    const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.09), mirrorGlassMat);
    mirrorGlass.position.set(-0.76, 0.45, 0.18);
    mirrorGlass.rotation.y = -Math.PI / 2 + 0.18;
    this.group.add(mirrorGlass);

    // D. Door Intrusion X-Bars (Left and Right)
    addTube(new THREE.Vector3(-0.62, 0.24, -0.42), new THREE.Vector3(-0.63, 0.38, 0.44));
    addTube(new THREE.Vector3(-0.62, 0.38, -0.42), new THREE.Vector3(-0.63, 0.24, 0.44));

    addTube(new THREE.Vector3(0.62, 0.24, -0.42), new THREE.Vector3(0.63, 0.38, 0.44));
    addTube(new THREE.Vector3(0.62, 0.38, -0.42), new THREE.Vector3(0.63, 0.24, 0.44));
  }

  /**
   * 3. Sculpted Dashboard, Instrument Binnacle & Co-Driver Pace Notes:
   * Flocked dark alcantara with red double-stitching, sculpted arched cowl,
   * directional air vents, and co-driver spiral pace notes binder.
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

    // Main Upper Dashboard Deck (slopes forward towards windshield at y = 0.40)
    const dashDeck = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.04, 0.44), dashMat);
    dashDeck.position.set(0, 0.40, 0.38);
    dashDeck.rotation.x = -0.06;
    this.group.add(dashDeck);

    // Red motorsport contrast seam line running across dash
    const seam = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.005, 0.005), stitchMat);
    seam.position.set(0, 0.424, 0.34);
    seam.rotation.x = -0.06;
    this.group.add(seam);

    // Lower Vertical Knee Bolster
    const kneeBolster = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.16, 0.05), dashMat);
    kneeBolster.position.set(0, 0.30, 0.22);
    this.group.add(kneeBolster);

    // Sculpted Instrument Binnacle Hood ahead of driver
    // Positioned so dials are framed through the upper spoke of the steering wheel
    const cowlRoof = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.015, 0.12), dashMat);
    cowlRoof.position.set(this.wheelCenter.x, 0.535, 0.18);
    cowlRoof.rotation.x = -0.12;
    this.group.add(cowlRoof);

    // Cowl side cheeks
    const leftCheek = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.08, 0.11), dashMat);
    leftCheek.position.set(this.wheelCenter.x - 0.18, 0.495, 0.18);
    leftCheek.rotation.x = -0.12;
    this.group.add(leftCheek);

    const rightCheek = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.08, 0.11), dashMat);
    rightCheek.position.set(this.wheelCenter.x + 0.18, 0.495, 0.18);
    rightCheek.rotation.x = -0.12;
    this.group.add(rightCheek);

    // Cluster backplate
    const backplate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.015), dashMat);
    backplate.position.set(this.wheelCenter.x, 0.49, 0.23);
    backplate.rotation.x = -0.12;
    this.group.add(backplate);

    // Directional Round Air Vents (driver, center and passenger side)
    for (const vx of [-0.52, -0.12, 0.12, 0.52]) {
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.010, 12), ventMat);
      vent.position.set(vx, 0.415, 0.36);
      vent.rotation.x = 0.35;
      this.group.add(vent);

      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.003, 8, 16), metalBezelMat);
      bezel.position.copy(vent.position);
      bezel.rotation.copy(vent.rotation);
      this.group.add(bezel);
    }

    // Co-Driver's Spiral Pace Notes Binder (DiRT Rally 2.0 / WRC Signature Detail!)
    this.buildPaceNotesBook();
  }

  /**
   * Helper to construct the Co-Driver's spiral pace note booklet on the passenger dashboard
   */
  private buildPaceNotesBook(): void {
    const bookGroup = new THREE.Group();
    bookGroup.position.set(0.34, 0.425, 0.34);
    bookGroup.rotation.set(-0.10, -0.08, 0.04);
    this.group.add(bookGroup);

    // Hardcover base
    const coverMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a, // Rally team dark blue binder
      roughness: 0.6,
      metalness: 0.2,
    });
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.010, 0.22), coverMat);
    bookGroup.add(cover);

    // Pace note pages with printed handwritten stage shorthand
    const notesCanvas = createSafeCanvas(256, 256);
    let notesTex: THREE.CanvasTexture | undefined;
    if (notesCanvas) {
      const nctx = notesCanvas.getContext('2d');
      if (nctx) {
        nctx.fillStyle = '#f8fafc';
        nctx.fillRect(0, 0, 256, 256);

        // Faint grid lines
        nctx.strokeStyle = '#e2e8f0';
        nctx.lineWidth = 1;
        for (let y = 30; y < 256; y += 22) {
          nctx.beginPath();
          nctx.moveTo(10, y);
          nctx.lineTo(246, y);
          nctx.stroke();
        }

        // Bold handwritten pace notes
        nctx.fillStyle = '#0f172a';
        nctx.font = 'bold 16px "SF Mono", monospace';
        nctx.fillText('STAGE 1 • PROVING', 18, 24);
        nctx.font = 'bold 15px "SF Mono", monospace';
        nctx.fillText('100  R4 -> L3', 20, 52);
        nctx.fillText('CR 50 ! CUT', 20, 74);
        nctx.fillText('HAIRPIN L !!', 20, 96);
        nctx.fillText('KEEP MID 80', 20, 118);
        nctx.fillText('FLAT R OVER CR', 20, 140);
        nctx.fillText('60 L5 -> FINISH', 20, 162);

        // Red bookmark tab
        nctx.fillStyle = '#ef4444';
        nctx.fillRect(220, 0, 24, 30);

        notesTex = new THREE.CanvasTexture(notesCanvas);
      }
    }

    const pageMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      map: notesTex,
    });
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.21), pageMat);
    page.position.set(0, 0.006, 0);
    page.rotation.x = -Math.PI / 2;
    bookGroup.add(page);

    // Metal spiral binding coils along the top edge
    const coilMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.17, 8), coilMat);
    coil.position.set(0, 0.008, -0.105);
    coil.rotation.z = Math.PI / 2;
    bookGroup.add(coil);
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

    // Center Console tunnel sloping down between seats (y = 0.20)
    const consoleTunnel = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.12, 0.70), consoleMat);
    consoleTunnel.position.set(0, 0.20, 0.05);
    consoleTunnel.rotation.x = -0.18;
    this.group.add(consoleTunnel);

    // Carbon-fiber toggle switch panel
    const switchPanel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.012), carbonMat);
    switchPanel.position.set(0, 0.32, 0.22);
    switchPanel.rotation.x = -0.22;
    this.group.add(switchPanel);

    // 2 Rotary Knobs (Boost & Brake Bias)
    for (let r = 0; r < 2; r++) {
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 12), metalMat);
      dial.position.set(-0.04 + r * 0.08, 0.36, 0.215);
      dial.rotation.x = -0.22;
      this.group.add(dial);
    }

    // Aircraft red-guarded ignition toggle
    const redGuard = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.030, 0.016),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 })
    );
    redGuard.position.set(-0.045, 0.30, 0.22);
    redGuard.rotation.x = -0.22;
    this.group.add(redGuard);

    // 4 Auxiliary metal switches with indicator LEDs
    for (let i = 0; i < 4; i++) {
      const sw = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.018, 8), metalMat);
      sw.position.set(-0.015 + i * 0.022, 0.29, 0.225);
      sw.rotation.x = 0.3;
      this.group.add(sw);

      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.003, 8, 8),
        new THREE.MeshStandardMaterial({
          color: i === 0 ? 0x22c55e : 0xfacc15,
          emissive: i === 0 ? 0x22c55e : 0xfacc15,
          emissiveIntensity: 0.9,
        })
      );
      led.position.set(-0.015 + i * 0.022, 0.305, 0.22);
      this.group.add(led);
    }

    // Sequential Gear Shifter with mechanical gate, leather boot & spherical red knob
    const shifterBase = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.12), metalMat);
    shifterBase.position.copy(this.shifterPos);
    this.group.add(shifterBase);

    this.shifterLeverGroup.position.copy(this.shifterPos);
    this.group.add(this.shifterLeverGroup);

    // Pleated leather shifter boot
    const gaiterBoot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.038, 0.045, 6),
      new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 })
    );
    gaiterBoot.position.set(0, 0.022, 0);
    this.shifterLeverGroup.add(gaiterBoot);

    const shiftShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 8), metalMat);
    shiftShaft.position.set(0, 0.09, 0);
    this.shifterLeverGroup.add(shiftShaft);

    const shiftKnob = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.1 })
    );
    shiftKnob.position.set(0, 0.17, 0);
    this.shifterLeverGroup.add(shiftKnob);

    // Tall Vertical Hydraulic Handbrake Wand with knurled grip
    const ebrakeBase = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.09), metalMat);
    ebrakeBase.position.copy(this.ebrakePos);
    this.group.add(ebrakeBase);

    this.ebrakeWandMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.010, 0.010, 0.24, 8),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8, metalness: 0.5 })
    );
    this.ebrakeWandMesh.position.set(this.ebrakePos.x, this.ebrakePos.y + 0.10, this.ebrakePos.z);
    this.ebrakeWandMesh.rotation.x = -0.15; // Raked slightly rearward
    this.group.add(this.ebrakeWandMesh);

    // Knurled anodized aluminum handbrake handle grip
    const wandGrip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.10, 8),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4, metalness: 0.8 })
    );
    wandGrip.position.set(0, 0.07, 0);
    this.ebrakeWandMesh.add(wandGrip);

    // Aluminum Drilled 3-Pedal Box (Driver Footwell x = -0.33)
    const pedalConfigs = [
      { name: 'clutch', x: -0.40, group: this.clutchPedalGroup },
      { name: 'brake', x: -0.33, group: this.brakePedalGroup },
      { name: 'throttle', x: -0.26, group: this.throttlePedalGroup },
    ];

    for (const p of pedalConfigs) {
      p.group.position.set(p.x, 0.34, 0.46);
      this.group.add(p.group);

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 8), metalMat);
      arm.position.set(0, -0.06, -0.02);
      arm.rotation.x = 0.25;
      p.group.add(arm);

      const plateWidth = p.name === 'throttle' ? 0.038 : 0.048;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(plateWidth, 0.075, 0.008), pedalMat);
      plate.position.set(0, -0.12, -0.04);
      p.group.add(plate);

      // Drilled grip holes
      const holeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      for (let hy of [-0.022, 0, 0.022]) {
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.010, 8), holeMat);
        hole.position.set(0, hy, 0.001);
        hole.rotation.x = Math.PI / 2;
        plate.add(hole);
      }
    }

    // Red handheld fire extinguisher mounted in passenger footwell (x = 0.28)
    const extGroup = new THREE.Group();
    extGroup.position.set(0.28, 0.22, 0.28);
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
   * 5. Dished 3-Spoke Rally Steering Wheel:
   * Full circular rim, 3 drilled alloy spokes, center hub, and yellow 12 o'clock center stripe.
   */
  private buildSteeringWheel(): void {
    const colMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 8), colMat);
    col.position.set(this.wheelCenter.x, this.wheelCenter.y - 0.06, this.wheelCenter.z + 0.06);
    col.rotation.x = Math.PI / 3.4;
    this.group.add(col);

    // Steering wheel group placed at wheel center, angled back ~18 deg
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

    // 1. Full-circle Torus Rim (diameter 31cm -> radius 0.155m, tube 0.014m)
    this.wheelRimMesh = new THREE.Mesh(new THREE.TorusGeometry(this.wheelRadius, 0.014, 12, 36), rimMat);
    this.steeringWheelGroup.add(this.wheelRimMesh);

    // 2. Yellow 12 o'clock center alignment stripe on rim
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
    const topStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.016, 12), stripeMat);
    topStripe.position.set(0, this.wheelRadius, 0);
    topStripe.rotation.z = Math.PI / 2;
    this.steeringWheelGroup.add(topStripe);

    // 3. Three alloy spokes (9 o'clock, 3 o'clock, 6 o'clock) with drill holes
    for (const angle of [Math.PI, 0, -Math.PI / 2]) {
      const spokeGroup = new THREE.Group();
      spokeGroup.rotation.z = angle;

      const spokeArm = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.022, 0.006), spokeMat);
      spokeArm.position.set(0.062, 0, -0.010); // Dished rearward slightly
      spokeGroup.add(spokeArm);

      // 3 Drilled rally weight-saving holes per spoke
      const holeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      for (const hx of [0.038, 0.065, 0.092]) {
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.008, 8), holeMat);
        hole.position.set(hx, 0, -0.010);
        hole.rotation.x = Math.PI / 2;
        spokeGroup.add(hole);
      }

      this.steeringWheelGroup.add(spokeGroup);
    }

    // 4. Center horn button / rally hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.020, 16), spokeMat);
    hub.rotateX(Math.PI / 2);
    hub.position.z = -0.008;
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
      new THREE.CircleGeometry(0.024, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: badgeTex })
    );
    badge.position.set(0, 0, 0.002);
    this.steeringWheelGroup.add(badge);
  }

  /**
   * 6. Working Illuminated Analog Gauges:
   * Clockwise Tachometer (0-8000 RPM, orange/red redline arc at 7200-7800),
   * Speedometer (0-140 MPH), and central Digital Gear Indicator.
   * Positioned directly within the upper steering wheel opening.
   */
  private buildAnalogGauges(): void {
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.25,
      metalness: 0.85,
    });

    const needleMat = new THREE.MeshBasicMaterial({ color: 0xff2222 }); // Fluorescent red

    // Warm cockpit instrument cluster illumination
    const clusterLight = new THREE.PointLight(0xfff5ea, 1.2, 1.6);
    clusterLight.position.set(this.wheelCenter.x, 0.48, 0.16);
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

      // Gauge arc sweeps clockwise
      const startAngle = Math.PI * 0.78;
      const sweepAngle = Math.PI * 1.44;

      if (isTacho) {
        // Redline arc (7200 to 8000 RPM)
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

          // Numbers (0 to 8)
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

    const dialGeom = new THREE.PlaneGeometry(0.115, 0.115);

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
    tachoMesh.position.set(this.wheelCenter.x - 0.070, 0.485, 0.20);
    tachoMesh.rotation.x = -0.12;
    this.group.add(tachoMesh);

    // Tachometer Needle
    this.tachoNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.042, 0.002), needleMat);
    this.tachoNeedle.position.set(0, 0.015, 0.003);
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
    speedoMesh.position.set(this.wheelCenter.x + 0.070, 0.485, 0.20);
    speedoMesh.rotation.x = -0.12;
    this.group.add(speedoMesh);

    // Speedometer Needle
    this.speedoNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.042, 0.002), needleMat);
    this.speedoNeedle.position.set(0, 0.015, 0.003);
    speedoMesh.add(this.speedoNeedle);

    // Bezel rings around dials
    for (const pos of [tachoMesh.position, speedoMesh.position]) {
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.004, 8, 24), bezelMat);
      bezel.position.copy(pos);
      bezel.rotation.copy(tachoMesh.rotation);
      this.group.add(bezel);
    }

    // Central Digital Gear Readout Display (Between Speedo and Tacho)
    const gearCanvas = createSafeCanvas(128, 128);
    if (gearCanvas) {
      this.digitalGearCtx = gearCanvas.getContext('2d');
      this.digitalGearTex = new THREE.CanvasTexture(gearCanvas);
      this.updateDigitalGearDisplay('1');

      const gearMat = new THREE.MeshBasicMaterial({
        map: this.digitalGearTex,
        color: 0xffffff,
        side: THREE.DoubleSide,
      });
      const gearMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.045), gearMat);
      gearMesh.position.set(this.wheelCenter.x, 0.485, 0.202);
      gearMesh.rotation.x = -0.12;
      this.group.add(gearMesh);
    }

    // 5-LED Sequential Shift Light Strip directly above dials
    for (let i = 0; i < 5; i++) {
      const ledColor = i < 2 ? 0x22c55e : i < 4 ? 0xfacc15 : 0xef4444;
      const mat = new THREE.MeshStandardMaterial({
        color: ledColor,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.8,
      });
      this.shiftLeds.push(mat);

      const ledMesh = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.004), mat);
      ledMesh.position.set(this.wheelCenter.x - 0.048 + i * 0.024, 0.520, 0.195);
      ledMesh.rotation.x = -0.12;
      this.group.add(ledMesh);
    }
  }

  /**
   * Helper to draw high-visibility digital gear indicator on central cluster
   */
  private updateDigitalGearDisplay(gearStr: string): void {
    if (!this.digitalGearCtx || !this.digitalGearTex) return;
    const ctx = this.digitalGearCtx;
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, 128, 128);

    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 120, 120);

    ctx.fillStyle = gearStr === 'R' ? '#ef4444' : gearStr === 'N' ? '#f59e0b' : '#ef4444';
    ctx.font = 'bold 84px "SF Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gearStr, 64, 66);
    this.digitalGearTex.needsUpdate = true;
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
      const isDriver = (Math.abs(sx - this.driverPos.x) < 0.05);

      // Seat cushion (y = 0.22)
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.44), seatMat);
      cushion.position.set(sx, 0.22, -0.32);
      this.group.add(cushion);
      if (isDriver) this.driverSeatMeshes.push(cushion);

      // Seat backrest (from y = 0.24 up to 0.58)
      const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.50, 0.10), seatMat);
      backrest.position.set(sx, 0.48, -0.52);
      backrest.rotation.x = 0.18;
      this.group.add(backrest);
      if (isDriver) this.driverSeatMeshes.push(backrest);

      // Side bolsters
      for (const bx of [-0.19, 0.19]) {
        const bolster = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.22), seatMat);
        bolster.position.set(sx + bx, 0.38, -0.42);
        this.group.add(bolster);
        if (isDriver) this.driverSeatMeshes.push(bolster);
      }

      // 4-Point Harness Straps (shoulder straps)
      for (const hx of [-0.08, 0.08]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.44, 0.01), harnessMat);
        strap.position.set(sx + hx, 0.48, -0.48);
        strap.rotation.x = 0.18;
        this.group.add(strap);
        if (isDriver) this.driverSeatMeshes.push(strap);
      }
    }

    // Driver Torso (seated in left bucket seat)
    this.driverTorso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.26), suitMat);
    this.driverTorso.position.set(this.driverPos.x, this.driverPos.y + 0.22, this.driverPos.z);
    this.driverTorso.rotation.x = -0.16;
    this.group.add(this.driverTorso);

    // Driver Racing Helmet & Visor
    this.driverHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), helmetMat);
    this.driverHead.position.set(this.driverPos.x, this.driverPos.y + 0.48, this.driverPos.z + 0.04);
    this.group.add(this.driverHead);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.05, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 })
    );
    visor.position.set(0, 0.01, 0.08);
    this.driverHead.add(visor);

    // Driver Lower Limbs & Racing Boots in Footwell (Driver side x = -0.33)
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7, metalness: 0.2 });
    const bootAccentMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });

    for (const legX of [-0.40, -0.26]) {
      const isLeft = legX < -0.33;
      // Thigh
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.32, 8), suitMat);
      thigh.position.set(legX, 0.26, -0.16);
      thigh.rotation.x = Math.PI / 2.6;
      this.group.add(thigh);

      // Knee
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), suitMat);
      knee.position.set(legX, 0.30, 0.01);
      this.group.add(knee);

      // Shin
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.034, 0.30, 8), suitMat);
      shin.position.set(legX, 0.22, 0.16);
      shin.rotation.x = Math.PI / 4.2;
      this.group.add(shin);

      // Racing Boot
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.07, 0.15), bootMat);
      boot.position.set(legX, 0.19, isLeft ? 0.30 : 0.34);
      boot.rotation.x = -0.15;
      this.group.add(boot);

      // Boot sole & laces
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.012, 0.155), bootAccentMat);
      sole.position.set(0, -0.032, 0);
      boot.add(sole);
    }

    // 8. Driver Arms Setup - Puffy Quilted Rally Racing Jacket ("Very Jacky" Cordura/Nomex)
    const jacketMat = new THREE.MeshStandardMaterial({
      color: 0x1c1c20, // Heavy Cordura / Nomex fireproof racing suit
      roughness: 0.92,
      metalness: 0.05,
      flatShading: true,
    });

    const jacketFoldMat = new THREE.MeshStandardMaterial({
      color: 0x141416, // Fabric shadow folds & accordion creases
      roughness: 0.95,
    });

    const elbowPatchMat = new THREE.MeshStandardMaterial({
      color: 0x27272a, // Reinforced diamond-stitch leather elbow patch
      roughness: 0.8,
      metalness: 0.1,
    });

    const ribbedCuffMat = new THREE.MeshStandardMaterial({
      color: 0x111113, // Ribbed storm knit wrist cuff
      roughness: 0.95,
    });

    const suitStripeMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // Bright yellow Alpinestars forearm racing stripe
      roughness: 0.4,
    });

    // Puffy Upper Arm Sleeves (diameter 0.044m -> 0.038m with quilted baffles)
    this.leftUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.038, this.upperArmLen, 10), jacketMat);
    this.rightUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.038, this.upperArmLen, 10), jacketMat);

    // Shoulder seam cap baffle rings
    for (const arm of [this.leftUpperArm, this.rightUpperArm]) {
      const seamCap = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 6, 12), jacketFoldMat);
      seamCap.position.set(0, this.upperArmLen * 0.40, 0);
      seamCap.rotation.x = Math.PI / 2;
      arm.add(seamCap);

      // Mid-bicep quilted stitch fold ring
      const bicepRing = new THREE.Mesh(new THREE.TorusGeometry(0.040, 0.005, 6, 12), jacketFoldMat);
      bicepRing.position.set(0, 0, 0);
      bicepRing.rotation.x = Math.PI / 2;
      arm.add(bicepRing);
    }
    this.group.add(this.leftUpperArm);
    this.group.add(this.rightUpperArm);

    // Puffy Forearm Sleeves with Elbow Flex Baffles & Reinforced Leather Patches
    this.leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, this.forearmLen, 10), jacketMat);
    this.rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, this.forearmLen, 10), jacketMat);

    for (const arm of [this.leftForearm, this.rightForearm]) {
      const isLeftArm = arm === this.leftForearm;

      // Accordion elbow flex rings at top of forearm
      for (const ey of [0.08, 0.11]) {
        const flexRing = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.006, 6, 12), jacketFoldMat);
        flexRing.position.set(0, ey, 0);
        flexRing.rotation.x = Math.PI / 2;
        arm.add(flexRing);
      }

      // Reinforced leather elbow pad patch (diamond stitched)
      const elbowPatch = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.075, 0.036), elbowPatchMat);
      elbowPatch.position.set(0, 0.09, -0.016);
      arm.add(elbowPatch);

      // Dual Alpinestars yellow racing stripes on outer forearm
      for (const sx of [-0.006, 0.006]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.004, this.forearmLen * 0.70, 0.006), suitStripeMat);
        stripe.position.set(isLeftArm ? -0.032 : 0.032, sx, 0);
        arm.add(stripe);
      }

      // Thick Ribbed Storm Wrist Cuff (jacket sleeve cuff overlapping glove)
      const stormCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.033, 0.030, 10), ribbedCuffMat);
      stormCuff.position.set(0, -this.forearmLen * 0.44, 0);
      arm.add(stormCuff);
    }
    this.group.add(this.leftForearm);
    this.group.add(this.rightForearm);

    this.buildGloveMesh(this.leftHandGroup, gloveMat, gloveAccentMat, true);
    this.group.add(this.leftHandGroup);

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
    const cuffMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.5 }); // White racing cuff
    const carbonMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.3, metalness: 0.6 }); // Carbon knuckle shield

    // 1. White inner wrist cuff band
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.030, 0.016, 10), cuffMat);
    cuff.position.set(0, -0.020, 0);
    group.add(cuff);

    // 2. Palm / main hand body in textured black suede
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.042, 0.046), mainMat);
    palm.position.set(0, 0.005, 0);
    group.add(palm);

    // Carbon-fiber knuckle shield armor plate on back of hand
    const knuckleShield = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.020, 0.008), carbonMat);
    knuckleShield.position.set(0, 0.005, -0.024);
    group.add(knuckleShield);

    // 3. Bright yellow silicone racing chevron grip strips across back of knuckles
    for (let ky = -0.010; ky <= 0.016; ky += 0.012) {
      const gripStrip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.005, 0.006), accentMat);
      gripStrip.position.set(0, ky, -0.026);
      group.add(gripStrip);
    }

    // Outer edge silicone logo patch
    const logoPatch = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.022, 0.016), accentMat);
    logoPatch.position.set(isLeft ? -0.025 : 0.025, 0.005, -0.010);
    group.add(logoPatch);

    // 4. Curled gripping fingers wrapping firmly around wheel rim
    const fingers = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.044, 8), mainMat);
    fingers.position.set(0, 0.024, 0.014);
    fingers.rotation.x = Math.PI / 2;
    group.add(fingers);

    // Bright yellow silicone fingertip grip pads on wrapped fingers
    const fingerGrips = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.006, 0.006), accentMat);
    fingerGrips.position.set(0, 0.024, 0.022);
    group.add(fingerGrips);

    // 5. Pre-curved thumb hooked over inner alloy wheel spoke
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.008, 0.030, 8), mainMat);
    thumb.position.set(isLeft ? 0.022 : -0.022, 0.010, -0.008);
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
    const forearmDir = targetHand.clone().sub(elbowPos).normalize();
    forearmMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), forearmDir);

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

    // 1. Steering Wheel Articulation (+-180 deg / +-PI rad) with silky smooth physical inertia
    // Matches test T1_R2_02 assertion: child.rotation.z reaches ~PI at full steer input
    const clampedSteer = THREE.MathUtils.clamp(steerInput, -1.0, 1.0);
    const targetWheelRotZ = -clampedSteer * Math.PI;
    const blendRate = (dt >= 0.045 && Math.abs(steerInput) >= 0.99) ? 1.0 : Math.min(1.0, 32.0 * dt);
    this.currentWheelRotZ = THREE.MathUtils.lerp(this.currentWheelRotZ, targetWheelRotZ, blendRate);
    const wheelRotZ = this.currentWheelRotZ;
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

    // Update digital central gear display
    const gearStr = telemetry.isShifting ? 'N' : telemetry.gear ? telemetry.gear.toString() : '1';
    this.updateDigitalGearDisplay(gearStr);

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
    // Left hand grips 9 o'clock on steering wheel rim (outer door side, -X)
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
      new THREE.Vector3(-0.6, -0.6, 0.2) // Elbow bends down and outward left (-X toward door)
    );

    // Right hand grips 3 o'clock on steering wheel rim (center console side, +X)
    const rightGripLocal = new THREE.Vector3(this.wheelRadius, 0, 0);
    rightGripLocal.applyAxisAngle(new THREE.Vector3(0, 0, 1), wheelRotZ);
    rightGripLocal.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.columnAngle);
    const rightWheelTarget = this.wheelCenter.clone().add(rightGripLocal);

    const shifterTarget = this.shifterPos.clone().add(new THREE.Vector3(0, 0.18, 0));
    const ebrakeTarget = this.ebrakePos.clone().add(new THREE.Vector3(0, 0.20, 0));

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
      new THREE.Vector3(0.5, -0.6, 0.2) // Elbow bends down and toward center console (+X)
    );
  }
}
