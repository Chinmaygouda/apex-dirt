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
 * CockpitController handles:
 * 1. Cabin interior (flocked sculpted dashboard, WRC steel roll cage with diagonal cross-brace,
 *    interior A-pillars, sun strip visor banner, rearview mirror, wipers, co-driver pacenotes)
 * 2. Rotating rally steering wheel (+-180 deg) with 3 drilled alloy spokes, center hub badge,
 *    and yellow 12 o'clock center stripe
 * 3. Working analog dashboard gauges (Tachometer 0-240 deg, Speedometer 0-220 deg)
 *    and digital red 7-segment gear indicator pod on the A-pillar cowl
 * 4. Driver model with 2-bone arm IK gripping the wheel with high-grip rally gloves
 *    and animated sequential gear shifting
 */
export class CockpitController {
  public group = new THREE.Group();

  // Cockpit sub-elements
  private steeringWheelGroup = new THREE.Group();
  private tachoNeedle!: THREE.Mesh;
  private speedoNeedle!: THREE.Mesh;
  private shifterLever!: THREE.Mesh;
  private ebrakeLever!: THREE.Mesh;

  // Digital displays & shift lights
  private gearTex?: THREE.CanvasTexture;
  private gearCtx?: CanvasRenderingContext2D;
  private shiftLedMat!: THREE.MeshStandardMaterial;

  // Driver body parts
  private driverTorso!: THREE.Mesh;
  private driverHead!: THREE.Mesh;

  // Left Arm & Rally Glove (grips 9 o'clock)
  private leftUpperArm!: THREE.Mesh;
  private leftForearm!: THREE.Mesh;
  private leftHandGroup = new THREE.Group();

  // Right Arm & Rally Glove (grips 3 o'clock, shifts gears)
  private rightUpperArm!: THREE.Mesh;
  private rightForearm!: THREE.Mesh;
  private rightHandGroup = new THREE.Group();

  // Shift animation state
  private isShiftingAnim = false;
  private shiftTimer = 0;
  private shiftDuration = 0.16; // 160ms flick
  private prevGear: number | string = 1;

  // Positions relative to car chassis origin
  // Driver sits on left: x = -0.32, y = 0.30, z = -0.18
  private readonly driverPos = new THREE.Vector3(-0.32, 0.30, -0.18);
  private readonly wheelCenter = new THREE.Vector3(-0.32, 0.46, 0.18);
  private readonly shifterPos = new THREE.Vector3(0.0, 0.28, 0.14);

  // Arm joint anchor offsets from driver torso
  private readonly leftShoulder = new THREE.Vector3(-0.48, 0.50, -0.16);
  private readonly rightShoulder = new THREE.Vector3(-0.16, 0.50, -0.16);

  // Fixed 2-bone lengths
  private readonly upperArmLen = 0.26;
  private readonly forearmLen = 0.26;

  constructor(private carGroup: THREE.Group) {
    this.buildCockpitCabin();
    this.buildRollCage();
    this.buildDashboard();
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
    // Driver arms and hands remain visible in both chase and cockpit views!
    if (this.leftUpperArm) this.leftUpperArm.visible = true;
    if (this.rightUpperArm) this.rightUpperArm.visible = true;
    if (this.leftForearm) this.leftForearm.visible = true;
    if (this.rightForearm) this.rightForearm.visible = true;
    if (this.leftHandGroup) this.leftHandGroup.visible = true;
    if (this.rightHandGroup) this.rightHandGroup.visible = true;
  }

  /**
   * Builds the cabin enclosure: interior roof headliner, framing A-pillars,
   * windshield sun strip visor banner, rearview mirror, wiper blades,
   * and left door interior card.
   */
  private buildCockpitCabin(): void {
    const headlinerMat = new THREE.MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true,
    });

    const mirrorGlassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.95,
    });

    // 1. Interior Roof Headliner (dark ceiling above driver)
    const headliner = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.02, 0.92), headlinerMat);
    headliner.position.set(0, 0.85, -0.18);
    this.group.add(headliner);

    // 2. Thick Interior Framing A-Pillars (left and right of windshield)
    for (const ax of [-0.64, 0.64]) {
      const apillar = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.08, 0.74), trimMat);
      apillar.position.set(ax, 0.62, 0.38);
      apillar.rotation.x = -0.68;
      this.group.add(apillar);
    }

    // 3. Windshield Sun Strip / Visor Banner ("APEX RALLY")
    const bannerCanvas = createSafeCanvas(512, 64);
    let bannerTex: THREE.CanvasTexture | undefined;
    if (bannerCanvas) {
      const bctx = bannerCanvas.getContext('2d');
      if (bctx) {
        bctx.fillStyle = '#0f172a';
        bctx.fillRect(0, 0, 512, 64);

        // Yellow and red accent stripes at bottom of banner
        bctx.fillStyle = '#facc15';
        bctx.fillRect(0, 56, 512, 4);
        bctx.fillStyle = '#ef4444';
        bctx.fillRect(0, 60, 512, 4);

        // Bold condensed rally typography
        bctx.fillStyle = '#ffffff';
        bctx.font = 'bold 36px sans-serif';
        bctx.textAlign = 'center';
        bctx.textBaseline = 'middle';
        bctx.fillText('A P E X   R A L L Y', 256, 30);
        bannerTex = new THREE.CanvasTexture(bannerCanvas);
      }
    }

    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.4,
      map: bannerTex,
      flatShading: true,
    });

    const sunStrip = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.16, 0.012), visorMat);
    sunStrip.position.set(0, 0.77, 0.24);
    sunStrip.rotation.x = -0.68;
    this.group.add(sunStrip);

    // 4. Interior Rearview Mirror (mounted at top center-right of windshield)
    const mirrorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), trimMat);
    mirrorStem.position.set(0.12, 0.79, 0.24);
    mirrorStem.rotation.x = 0.3;
    this.group.add(mirrorStem);

    const mirrorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.02), trimMat);
    mirrorHousing.position.set(0.12, 0.76, 0.25);
    mirrorHousing.rotation.y = -0.22; // Angled toward left-hand driver
    mirrorHousing.rotation.x = -0.10;

    const mirrorFace = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.05), mirrorGlassMat);
    mirrorFace.position.set(0, 0, -0.011);
    mirrorFace.rotation.y = Math.PI;
    mirrorHousing.add(mirrorFace);
    this.group.add(mirrorHousing);

    // 5. Dual Windshield Wiper Blades (resting at cowl base)
    const wiperMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    for (const wx of [-0.36, 0.16]) {
      const wiperArm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.012, 0.016), wiperMat);
      wiperArm.position.set(wx + 0.18, 0.48, 0.60);
      wiperArm.rotation.x = -0.68;
      wiperArm.rotation.z = -0.06;
      this.group.add(wiperArm);
    }

    // 6. Left Interior Door Panel / Sill (driver side framing)
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.76), trimMat);
    doorPanel.position.set(-0.66, 0.34, -0.05);
    this.group.add(doorPanel);

    // Red nylon door pull strap
    const pullStrap = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.10, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 })
    );
    pullStrap.position.set(-0.61, 0.42, 0.08);
    pullStrap.rotation.z = 0.2;
    this.group.add(pullStrap);

    // Subtle warm cabin ambient bounce light
    const cabinLight = new THREE.PointLight(0xffedd5, 0.40, 2.8);
    cabinLight.position.set(-0.15, 0.70, 0.02);
    this.group.add(cabinLight);
  }

  /**
   * Builds the tubular WRC roll cage with prominent diagonal crossbar across
   * the windshield header, foam protective padding, and zip-tie retention wraps
   * (matching reference image 2).
   */
  private buildRollCage(): void {
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8, // Painted silver-white rally tubing
      roughness: 0.35,
      metalness: 0.65,
      flatShading: true,
    });

    const paddingMat = new THREE.MeshStandardMaterial({
      color: 0x27272a, // High-density black roll bar padding
      roughness: 0.9,
      flatShading: true,
    });

    const strapMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f5, // White retention straps / tie wraps
      roughness: 0.4,
    });

    const tubeRadius = 0.020;

    // 1. Top Windshield Transverse Tube (running across upper windshield)
    const topBar = new THREE.Mesh(new THREE.CylinderGeometry(tubeRadius, tubeRadius, 1.20, 8), tubeMat);
    topBar.position.set(0, 0.82, 0.22);
    topBar.rotation.z = Math.PI / 2;
    this.group.add(topBar);

    // 2. Top Windshield Diagonal Crossbar (WRC signature element from Reference Image 2!)
    // Runs diagonally across the upper windshield from (-0.58, 0.82, 0.22) to (+0.35, 0.72, 0.26)
    const p1 = new THREE.Vector3(-0.58, 0.82, 0.22);
    const p2 = new THREE.Vector3(0.35, 0.72, 0.26);
    const diagVec = p2.clone().sub(p1);
    const diagLen = diagVec.length();

    const diagBar = new THREE.Mesh(new THREE.CylinderGeometry(tubeRadius, tubeRadius, diagLen, 8), tubeMat);
    diagBar.position.copy(p1).lerp(p2, 0.5);
    diagBar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diagVec.clone().normalize());
    this.group.add(diagBar);

    // Padded protective foam sleeve on the diagonal bar (center-left section)
    const padLen = 0.42;
    const padding = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, padLen, 8), paddingMat);
    padding.position.copy(p1).lerp(p2, 0.38);
    padding.quaternion.copy(diagBar.quaternion);
    this.group.add(padding);

    // Retention tie wraps around padding
    for (const offset of [-0.14, 0.0, 0.14]) {
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.0335, 0.0335, 0.025, 8), strapMat);
      const strapPos = padding.position.clone().addScaledVector(diagVec.clone().normalize(), offset);
      strap.position.copy(strapPos);
      strap.quaternion.copy(diagBar.quaternion);
      this.group.add(strap);
    }

    // 3. Left A-Pillar Down-tube
    const aLeftP1 = new THREE.Vector3(-0.58, 0.82, 0.22);
    const aLeftP2 = new THREE.Vector3(-0.62, 0.44, 0.52);
    const aLeftVec = aLeftP2.clone().sub(aLeftP1);
    const aLeftBar = new THREE.Mesh(new THREE.CylinderGeometry(tubeRadius, tubeRadius, aLeftVec.length(), 8), tubeMat);
    aLeftBar.position.copy(aLeftP1).lerp(aLeftP2, 0.5);
    aLeftBar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aLeftVec.clone().normalize());
    this.group.add(aLeftBar);

    // 4. Right A-Pillar Down-tube
    const aRightP1 = new THREE.Vector3(0.58, 0.82, 0.22);
    const aRightP2 = new THREE.Vector3(0.62, 0.44, 0.52);
    const aRightVec = aRightP2.clone().sub(aRightP1);
    const aRightBar = new THREE.Mesh(new THREE.CylinderGeometry(tubeRadius, tubeRadius, aRightVec.length(), 8), tubeMat);
    aRightBar.position.copy(aRightP1).lerp(aRightP2, 0.5);
    aRightBar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aRightVec.clone().normalize());
    this.group.add(aRightBar);

    // 5. Left Door Lateral Side-Protection Tube
    const doorTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 8), tubeMat);
    doorTube.position.set(-0.64, 0.36, -0.05);
    doorTube.rotation.x = Math.PI / 2;
    this.group.add(doorTube);
  }

  /**
   * Builds the sculpted rally dashboard (placed forward of steering wheel),
   * center console, defroster round vents, sequential gear shifter,
   * hydraulic handbrake wand, and co-driver pace notes binder.
   */
  private buildDashboard(): void {
    const dashMat = new THREE.MeshStandardMaterial({
      color: 0x111114, // Deep flocked dark charcoal alcantara (anti-glare)
      roughness: 0.90,
      metalness: 0.05,
      flatShading: true,
    });

    const consoleMat = new THREE.MeshStandardMaterial({
      color: 0x222226,
      roughness: 0.7,
      metalness: 0.2,
      flatShading: true,
    });

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xa1a1aa,
      roughness: 0.3,
      metalness: 0.8,
      flatShading: true,
    });

    const ventMat = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.8,
      metalness: 0.4,
    });

    // 1. Main Dashboard Upper Deck (sloping forward towards windshield base, forward of wheel)
    const dashDeck = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.05, 0.32), dashMat);
    dashDeck.position.set(0, 0.40, 0.44);
    dashDeck.rotation.x = -0.12;
    this.group.add(dashDeck);

    // Lower Dashboard Vertical Knee Bolster
    const dashLower = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.18, 0.06), dashMat);
    dashLower.position.set(0, 0.28, 0.30);
    this.group.add(dashLower);

    // 2. Instrument Binnacle Cowl over driver's dials (forward of wheel at z = 0.30)
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.10, 0.18), dashMat);
    cowl.position.set(-0.32, 0.49, 0.30);
    cowl.rotation.x = -0.10;
    this.group.add(cowl);

    // 3. Round Defroster Air Vents (Center and Passenger)
    for (const vx of [-0.06, 0.14, 0.48]) {
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.010, 12), ventMat);
      vent.position.set(vx, 0.42, 0.40);
      vent.rotation.x = 0.35;
      this.group.add(vent);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.003, 8, 16), metalMat);
      ring.position.copy(vent.position);
      ring.rotation.copy(vent.rotation);
      this.group.add(ring);
    }

    // 4. Center Console Sloping Down between Seats
    const centerConsole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.20, 0.72), consoleMat);
    centerConsole.position.set(0, 0.24, 0.05);
    centerConsole.rotation.x = -0.25;
    this.group.add(centerConsole);

    // Center Console Carbon Switch Panel
    const switchPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.14, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5, metalness: 0.5 })
    );
    switchPanel.position.set(0, 0.36, 0.26);
    switchPanel.rotation.x = -0.30;
    this.group.add(switchPanel);

    // Aircraft-style guarded red flip toggle switch
    const flipCover = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.03, 0.015),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 })
    );
    flipCover.position.set(0, 0.37, 0.265);
    flipCover.rotation.x = -0.30;
    this.group.add(flipCover);

    // 5. Sequential Gear Shifter Pedestal & Lever
    const shifterBase = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.045, 0.05, 8), consoleMat);
    shifterBase.position.copy(this.shifterPos);
    this.group.add(shifterBase);

    this.shifterLever = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), metalMat);
    this.shifterLever.position.set(this.shifterPos.x, this.shifterPos.y + 0.10, this.shifterPos.z);
    this.shifterLever.rotation.x = 0.12;

    const shiftKnob = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.3 })
    );
    shiftKnob.position.set(0, 0.11, 0);
    this.shifterLever.add(shiftKnob);
    this.group.add(this.shifterLever);

    // 6. Hydraulic Handbrake Vertical Wand
    this.ebrakeLever = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.26, 8), metalMat);
    this.ebrakeLever.position.set(0.08, 0.38, 0.08);
    this.ebrakeLever.rotation.x = -0.22;

    const ebrakeGrip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.11, 8),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 })
    );
    ebrakeGrip.position.set(0, 0.07, 0);
    this.ebrakeLever.add(ebrakeGrip);
    this.group.add(this.ebrakeLever);

    // 7. Co-Driver Pace Notes Spiral Ring Binder (visible on passenger side dash!)
    const paceCanvas = createSafeCanvas(256, 256);
    let paceTex: THREE.CanvasTexture | undefined;
    if (paceCanvas) {
      const pctx = paceCanvas.getContext('2d');
      if (pctx) {
        pctx.fillStyle = '#f8fafc';
        pctx.fillRect(0, 0, 256, 256);

        // Grid lines
        pctx.strokeStyle = '#e2e8f0';
        pctx.lineWidth = 1;
        for (let y = 30; y < 256; y += 22) {
          pctx.beginPath();
          pctx.moveTo(35, y);
          pctx.lineTo(250, y);
          pctx.stroke();
        }

        // Binder ring holes on the left
        pctx.fillStyle = '#475569';
        for (let y = 25; y < 256; y += 38) {
          pctx.beginPath();
          pctx.arc(18, y, 6, 0, Math.PI * 2);
          pctx.fill();
        }

        // Hand-written pace notes
        pctx.fillStyle = '#0f172a';
        pctx.font = 'bold 18px monospace';
        pctx.fillText('SS1 COLD CREEK', 40, 26);
        pctx.fillStyle = '#dc2626';
        pctx.fillText('! R5 40 -> L4+', 40, 52);
        pctx.fillStyle = '#0f172a';
        pctx.fillText('! CREST -> R3 CUT', 40, 74);
        pctx.fillStyle = '#2563eb';
        pctx.fillText('! HAIRPIN L (HB)', 40, 96);
        pctx.fillStyle = '#0f172a';
        pctx.fillText('L6 / CR 120m', 40, 118);
        pctx.fillStyle = '#dc2626';
        pctx.fillText('!! FINISH GATE', 40, 140);
        paceTex = new THREE.CanvasTexture(paceCanvas);
      }
    }

    const notesMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      map: paceTex,
    });

    const clipBoard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.014, 0.28), notesMat);
    clipBoard.position.set(0.14, 0.38, 0.30);
    clipBoard.rotation.set(0.35, -0.20, 0.10);
    this.group.add(clipBoard);
  }

  /**
   * Builds the 3-spoke rally steering wheel with drilled alloy spokes,
   * perforated suede rim, yellow 12 o'clock center stripe, and center rally hub.
   */
  private buildSteeringWheel(): void {
    // Steering column angled towards driver
    const colMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.22, 8), colMat);
    col.position.set(this.wheelCenter.x, this.wheelCenter.y - 0.07, this.wheelCenter.z + 0.08);
    col.rotation.x = Math.PI / 3.4;
    this.group.add(col);

    // Steering wheel group placed at wheel center, angled back ~28 degrees
    this.steeringWheelGroup.position.copy(this.wheelCenter);
    this.steeringWheelGroup.rotation.x = -Math.PI / 6.5;
    this.steeringWheelGroup.name = 'steeringWheel'; // Required for test T1_R2_02

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x18181b, // Deep dark suede
      roughness: 0.75,
      metalness: 0.05,
    });

    const spokeMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af, // Brushed titanium/alloy
      roughness: 0.25,
      metalness: 0.85,
    });

    // 1. Torus rim (diameter 33 cm -> radius 0.165m, tube 0.018m)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.018, 12, 32), rimMat);
    this.steeringWheelGroup.add(rim);

    // 2. Three alloy spokes (9 o'clock, 3 o'clock, 6 o'clock) with drill holes
    for (const angle of [Math.PI, 0, -Math.PI / 2]) {
      const spokeGroup = new THREE.Group();
      spokeGroup.rotation.z = angle;

      // Main spoke arm
      const spokeArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.024, 0.008), spokeMat);
      spokeArm.position.set(0.07, 0, 0);
      spokeGroup.add(spokeArm);

      // Lightweight drilled rally holes (decorative dark cylinder rivets)
      const holeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      for (const hx of [0.045, 0.075, 0.105]) {
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.010, 8), holeMat);
        hole.position.set(hx, 0, 0);
        hole.rotation.x = Math.PI / 2;
        spokeGroup.add(hole);
      }

      this.steeringWheelGroup.add(spokeGroup);
    }

    // 3. Center horn button / rally hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.020, 16), spokeMat);
    hub.rotateX(Math.PI / 2);
    this.steeringWheelGroup.add(hub);

    // Center rally emblem badge (Alpine / Apex blue emblem)
    const badgeCanvas = createSafeCanvas(128, 128);
    let badgeTex: THREE.CanvasTexture | undefined;
    if (badgeCanvas) {
      const bctx = badgeCanvas.getContext('2d');
      if (bctx) {
        const grad = bctx.createRadialGradient(64, 64, 10, 64, 64, 60);
        grad.addColorStop(0, '#0284c7');
        grad.addColorStop(1, '#0369a1');
        bctx.fillStyle = grad;
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

    const badgeMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.5,
      roughness: 0.3,
      map: badgeTex,
    });
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), badgeMat);
    badge.position.set(0, 0, 0.011);
    this.steeringWheelGroup.add(badge);

    // 4. Rally yellow top centering stripe at 12 o'clock
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.019, 0.032, 10),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 })
    );
    stripe.position.set(0, 0.165, 0);
    this.steeringWheelGroup.add(stripe);

    this.group.add(this.steeringWheelGroup);
  }

  /**
   * Builds analog gauges (Tachometer, Speedometer) behind the steering wheel,
   * digital red LED gear display on the A-pillar cowl, and multi-stage shift LED bar.
   */
  private buildAnalogGauges(): void {
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3, metalness: 0.85 });
    const needleMat = new THREE.MeshBasicMaterial({ color: 0xef4444 }); // Fluorescent red

    // 1. Tachometer (Left, x = -0.38, y = 0.46, z = 0.30)
    const tachoCanvas = createSafeCanvas(256, 256);
    let tachoTex: THREE.CanvasTexture | undefined;
    if (tachoCanvas) {
      const tctx = tachoCanvas.getContext('2d');
      if (tctx) {
        tctx.fillStyle = '#09090b';
        tctx.beginPath();
        tctx.arc(128, 128, 126, 0, Math.PI * 2);
        tctx.fill();

        // 0 to 8000 RPM sweep (-120 to +120 deg)
        for (let i = 0; i <= 8; i++) {
          const deg = -120 + (i / 8) * 240;
          const rad = (deg - 90) * (Math.PI / 180);
          const x1 = 128 + Math.cos(rad) * 110;
          const y1 = 128 + Math.sin(rad) * 110;
          const x2 = 128 + Math.cos(rad) * 88;
          const y2 = 128 + Math.sin(rad) * 88;

          tctx.strokeStyle = i >= 7 ? '#ef4444' : i >= 6 ? '#facc15' : '#f8fafc';
          tctx.lineWidth = i % 2 === 0 ? 4 : 2;
          tctx.beginPath();
          tctx.moveTo(x1, y1);
          tctx.lineTo(x2, y2);
          tctx.stroke();

          // Text numbers
          const xt = 128 + Math.cos(rad) * 72;
          const yt = 128 + Math.sin(rad) * 72;
          tctx.fillStyle = i >= 7 ? '#ef4444' : '#f8fafc';
          tctx.font = 'bold 22px sans-serif';
          tctx.textAlign = 'center';
          tctx.textBaseline = 'middle';
          tctx.fillText(String(i), xt, yt);
        }

        tctx.fillStyle = '#a1a1aa';
        tctx.font = '14px sans-serif';
        tctx.fillText('RPM x1000', 128, 168);
        tachoTex = new THREE.CanvasTexture(tachoCanvas);
      }
    }

    const tachoFaceMat = new THREE.MeshBasicMaterial({ color: 0x09090b, map: tachoTex });
    const tachoBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.015, 18), bezelMat);
    tachoBezel.rotateX(Math.PI / 2.3);
    tachoBezel.position.set(-0.38, 0.46, 0.30);
    this.group.add(tachoBezel);

    const tachoFace = new THREE.Mesh(new THREE.CircleGeometry(0.046, 18), tachoFaceMat);
    tachoFace.position.set(0, 0.009, 0);
    tachoFace.rotateX(-Math.PI / 2);
    tachoBezel.add(tachoFace);

    // Tachometer Needle (pivot at base)
    const tachoNeedleGeom = new THREE.ConeGeometry(0.004, 0.036, 4);
    tachoNeedleGeom.translate(0, 0.018, 0);
    this.tachoNeedle = new THREE.Mesh(tachoNeedleGeom, needleMat);
    this.tachoNeedle.position.set(0, 0.011, 0);
    this.tachoNeedle.rotation.x = -Math.PI / 2;
    tachoBezel.add(this.tachoNeedle);

    // 2. Speedometer (Right, x = -0.26, y = 0.46, z = 0.30)
    const speedoCanvas = createSafeCanvas(256, 256);
    let speedoTex: THREE.CanvasTexture | undefined;
    if (speedoCanvas) {
      const sctx = speedoCanvas.getContext('2d');
      if (sctx) {
        sctx.fillStyle = '#09090b';
        sctx.beginPath();
        sctx.arc(128, 128, 126, 0, Math.PI * 2);
        sctx.fill();

        for (let i = 0; i <= 7; i++) {
          const mph = i * 20;
          const deg = -110 + (i / 7) * 220;
          const rad = (deg - 90) * (Math.PI / 180);
          const x1 = 128 + Math.cos(rad) * 110;
          const y1 = 128 + Math.sin(rad) * 110;
          const x2 = 128 + Math.cos(rad) * 90;
          const y2 = 128 + Math.sin(rad) * 90;

          sctx.strokeStyle = '#f8fafc';
          sctx.lineWidth = 3;
          sctx.beginPath();
          sctx.moveTo(x1, y1);
          sctx.lineTo(x2, y2);
          sctx.stroke();

          const xt = 128 + Math.cos(rad) * 72;
          const yt = 128 + Math.sin(rad) * 72;
          sctx.fillStyle = '#f8fafc';
          sctx.font = 'bold 20px sans-serif';
          sctx.textAlign = 'center';
          sctx.textBaseline = 'middle';
          sctx.fillText(String(mph), xt, yt);
        }

        sctx.fillStyle = '#a1a1aa';
        sctx.font = '14px sans-serif';
        sctx.fillText('MPH', 128, 168);
        speedoTex = new THREE.CanvasTexture(speedoCanvas);
      }
    }

    const speedoFaceMat = new THREE.MeshBasicMaterial({ color: 0x09090b, map: speedoTex });
    const speedoBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.015, 18), bezelMat);
    speedoBezel.rotateX(Math.PI / 2.3);
    speedoBezel.position.set(-0.26, 0.46, 0.30);
    this.group.add(speedoBezel);

    const speedoFace = new THREE.Mesh(new THREE.CircleGeometry(0.046, 18), speedoFaceMat);
    speedoFace.position.set(0, 0.009, 0);
    speedoFace.rotateX(-Math.PI / 2);
    speedoBezel.add(speedoFace);

    // Speedometer Needle
    const speedoNeedleGeom = new THREE.ConeGeometry(0.004, 0.036, 4);
    speedoNeedleGeom.translate(0, 0.018, 0);
    this.speedoNeedle = new THREE.Mesh(speedoNeedleGeom, needleMat);
    this.speedoNeedle.position.set(0, 0.011, 0);
    this.speedoNeedle.rotation.x = -Math.PI / 2;
    speedoBezel.add(this.speedoNeedle);

    // 3. Digital Red 7-Segment Gear Indicator Pod on Left A-Pillar Cowl (Reference Image 1!)
    const gearCanvas = createSafeCanvas(64, 64);
    if (gearCanvas) {
      this.gearCtx = gearCanvas.getContext('2d') || undefined;
      this.gearTex = new THREE.CanvasTexture(gearCanvas);
      this.drawGearDisplay(1);
    }

    const gearPodMat = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.4,
      metalness: 0.7,
      map: this.gearTex,
    });

    const gearPod = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.020, 16), bezelMat);
    gearPod.position.set(-0.46, 0.50, 0.26);
    gearPod.rotation.x = 0.25;
    gearPod.rotation.y = 0.28; // Angled directly toward driver eye
    this.group.add(gearPod);

    const gearFace = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), gearPodMat);
    gearFace.position.set(0, 0.011, 0);
    gearFace.rotateX(-Math.PI / 2);
    gearPod.add(gearFace);

    // 4. Multi-Stage Shift Warning Light LED Bar
    this.shiftLedMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: new THREE.Color(0x22c55e),
      emissiveIntensity: 0.2,
    });
    const shiftBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.010, 0.010), this.shiftLedMat);
    shiftBar.position.set(-0.32, 0.52, 0.30);
    this.group.add(shiftBar);
  }

  /**
   * Builds the driver rig (torso, helmet, 2-bone arms, and detailed rally gloves)
   * and the co-driver in the passenger seat.
   */
  private buildDriverRig(): void {
    const suitMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a, // Rally navy blue racing suit
      roughness: 0.8,
      flatShading: true,
    });

    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0x18181b, // Black suede rally glove
      roughness: 0.85,
      flatShading: true,
    });

    const gloveAccentMat = new THREE.MeshStandardMaterial({
      color: 0xeab308, // Bright yellow high-grip silicone accents
      roughness: 0.4,
      flatShading: true,
    });

    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f5, // Pearl white helmet
      roughness: 0.3,
      metalness: 0.1,
      flatShading: true,
    });

    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Dark tinted visor
      roughness: 0.1,
      metalness: 0.9,
    });

    // Driver Torso seated in bucket seat
    this.driverTorso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.40, 0.28), suitMat);
    this.driverTorso.position.set(this.driverPos.x, this.driverPos.y + 0.16, this.driverPos.z);
    this.driverTorso.rotation.x = -0.18;
    this.group.add(this.driverTorso);

    // Driver Racing Helmet & Visor
    this.driverHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), helmetMat);
    this.driverHead.position.set(this.driverPos.x, this.driverPos.y + 0.38, this.driverPos.z + 0.02);
    this.group.add(this.driverHead);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.09), visorMat);
    visor.position.set(0, 0.01, 0.08);
    this.driverHead.add(visor);

    // Co-Driver / Navigator in passenger seat (x = +0.32)
    const coDriverPos = new THREE.Vector3(0.32, 0.30, -0.18);
    const coDriverTorso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.40, 0.28), suitMat);
    coDriverTorso.position.set(coDriverPos.x, coDriverPos.y + 0.16, coDriverPos.z);
    coDriverTorso.rotation.x = -0.18;
    this.group.add(coDriverTorso);

    const coDriverHead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), helmetMat);
    coDriverHead.position.set(coDriverPos.x, coDriverPos.y + 0.38, coDriverPos.z + 0.02);
    coDriverHead.rotation.y = -0.22;
    this.group.add(coDriverHead);

    const coVisor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.09), visorMat);
    coVisor.position.set(0, 0.01, 0.08);
    coDriverHead.add(coVisor);

    // Left Arm Setup (Sleeve)
    this.leftUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.036, this.upperArmLen, 8), suitMat);
    this.leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, this.forearmLen, 8), suitMat);
    this.group.add(this.leftUpperArm);
    this.group.add(this.leftForearm);

    // Left Rally Glove Group (palm + curled fingers + thumb + yellow accents)
    this.buildGloveMesh(this.leftHandGroup, gloveMat, gloveAccentMat, true);
    this.group.add(this.leftHandGroup);

    // Right Arm Setup (Sleeve)
    this.rightUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.036, this.upperArmLen, 8), suitMat);
    this.rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, this.forearmLen, 8), suitMat);
    this.group.add(this.rightUpperArm);
    this.group.add(this.rightForearm);

    // Right Rally Glove Group
    this.buildGloveMesh(this.rightHandGroup, gloveMat, gloveAccentMat, false);
    this.group.add(this.rightHandGroup);
  }

  /**
   * Helper to construct a detailed rally racing glove (palm, fingers, thumb, yellow grip accents)
   */
  private buildGloveMesh(
    group: THREE.Group,
    mainMat: THREE.Material,
    accentMat: THREE.Material,
    isLeft: boolean
  ): void {
    // 1. Palm / main hand body
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.042, 0.060), mainMat);
    group.add(palm);

    // 2. Curled gripping fingers wrapping around wheel rim
    const fingers = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.048, 8), mainMat);
    fingers.position.set(0, -0.016, 0.022);
    fingers.rotation.x = Math.PI / 2;
    group.add(fingers);

    // 3. Thumb hooked onto spoke/front face
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.008, 0.034, 8), mainMat);
    thumb.position.set(isLeft ? 0.022 : -0.022, 0.012, 0.012);
    thumb.rotation.z = isLeft ? -0.45 : 0.45;
    group.add(thumb);

    // 4. Yellow silicone grip pad accent (Reference Images 1 & 2!)
    const gripPatch = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.008, 0.038), accentMat);
    gripPatch.position.set(0, 0.020, 0);
    group.add(gripPatch);

    // 5. White motorsport wrist cuff
    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.034, 0.020, 8),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 })
    );
    cuff.position.set(0, 0, -0.032);
    cuff.rotation.x = Math.PI / 2;
    group.add(cuff);
  }

  /**
   * Analytical 2-bone inverse kinematics solver:
   * Positions upper arm and forearm meshes to connect shoulder to target hand position.
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

    // Law of cosines to find elbow bend angle
    const cosElbow = (this.upperArmLen ** 2 + this.forearmLen ** 2 - d ** 2) / (2 * this.upperArmLen * this.forearmLen);
    const elbowAngle = Math.PI - Math.acos(THREE.MathUtils.clamp(cosElbow, -1, 1));

    // Angle of upper arm relative to shoulder-to-target line
    const cosShoulder = (this.upperArmLen ** 2 + d ** 2 - this.forearmLen ** 2) / (2 * this.upperArmLen * d);
    const shoulderAngle = Math.acos(THREE.MathUtils.clamp(cosShoulder, -1, 1));

    // Plane normal for arm flexion
    const dirNorm = dVec.clone().normalize();
    const planeNormal = new THREE.Vector3().crossVectors(dirNorm, bendDirection).normalize();
    const perp = new THREE.Vector3().crossVectors(planeNormal, dirNorm).normalize();

    // Elbow joint position in 3D space
    const elbowPos = shoulder.clone()
      .addScaledVector(dirNorm, Math.cos(shoulderAngle) * this.upperArmLen)
      .addScaledVector(perp, Math.sin(shoulderAngle) * this.upperArmLen);

    // Align upper arm
    upperArmMesh.position.copy(shoulder).lerp(elbowPos, 0.5);
    upperArmMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), elbowPos.clone().sub(shoulder).normalize());

    // Align forearm
    forearmMesh.position.copy(elbowPos).lerp(targetHand, 0.5);
    forearmMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetHand.clone().sub(elbowPos).normalize());

    // Align hand
    handGroup.position.copy(targetHand);
    handGroup.quaternion.copy(forearmMesh.quaternion);
  }

  /**
   * Draws the bright red 7-segment digital gear readout on the pod canvas texture
   */
  private drawGearDisplay(gear: number | string): void {
    if (!this.gearCtx || !this.gearTex) return;
    const ctx = this.gearCtx;
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, 64, 64);

    // Beveled red outer border
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 60, 60);

    // Glowing red digital character
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 8;
    ctx.font = 'bold 38px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const txt = gear === -1 ? 'R' : gear === 0 ? 'N' : String(gear);
    ctx.fillText(txt, 32, 34);
    ctx.shadowBlur = 0; // reset
    this.gearTex.needsUpdate = true;
  }

  /**
   * Update cockpit, steering wheel, gauges, shift lights, and driver arms every frame.
   * Polymorphic signature accepts:
   * (dt, telemetry, steer) OR (dt, { steer }, telemetry)
   */
  public update(dt: number, arg1: any, arg2?: any): void {
    let telemetry: VehicleTelemetry;
    let steerInput = 0;

    if (arg1 && typeof arg1.rpm !== 'undefined') {
      telemetry = arg1;
      steerInput = typeof arg2 === 'number' ? arg2 : (arg2?.steer ?? 0);
    } else if (arg2 && typeof arg2.rpm !== 'undefined') {
      telemetry = arg2;
      steerInput = typeof arg1 === 'number' ? arg1 : (arg1?.steer ?? 0);
    } else {
      telemetry = arg1 || {};
      steerInput = typeof arg2 === 'number' ? arg2 : (arg1?.steer ?? 0);
    }

    // Clamp steer to [-1.0, 1.0] for wheel rotation (+-180 deg max lock)
    const clampedSteer = THREE.MathUtils.clamp(steerInput, -1.0, 1.0);
    const targetWheelRot = -clampedSteer * Math.PI;
    this.steeringWheelGroup.rotation.z = THREE.MathUtils.lerp(
      this.steeringWheelGroup.rotation.z,
      targetWheelRot,
      Math.min(1.0, 25.0 * dt)
    );

    // 2. Animate Analog Dashboard Needles
    // Tachometer: 0 to 8,500 RPM maps to 0 to 240 deg (-120 deg to +120 deg)
    const rpm = Math.max(0, telemetry.rpm || 0);
    const rpmFraction = THREE.MathUtils.clamp(rpm / 8500, 0, 1.0);
    const tachoAngle = (rpmFraction * 240.0 - 120.0) * (Math.PI / 180.0);
    if (this.tachoNeedle) {
      this.tachoNeedle.rotation.z = -tachoAngle;
    }

    // Speedometer: 0 to 140 mph maps to 0 to 220 deg (-110 deg to +110 deg)
    const speedMph = Math.max(0, telemetry.speedMph || 0);
    const speedFraction = THREE.MathUtils.clamp(speedMph / 140.0, 0, 1.0);
    const speedoAngle = (speedFraction * 220.0 - 110.0) * (Math.PI / 180.0);
    if (this.speedoNeedle) {
      this.speedoNeedle.rotation.z = -speedoAngle;
    }

    // 3. Shift Warning LED Bar (Green -> Yellow -> Blinking Red at redline)
    if (this.shiftLedMat) {
      if (rpmFraction > 0.88) {
        const blink = Math.sin(Date.now() * 0.02) > 0;
        this.shiftLedMat.color.setHex(blink ? 0xef4444 : 0x450a0a);
        this.shiftLedMat.emissive.setHex(blink ? 0xef4444 : 0x000000);
        this.shiftLedMat.emissiveIntensity = blink ? 2.5 : 0;
      } else if (rpmFraction > 0.75) {
        this.shiftLedMat.color.setHex(0xfacc15);
        this.shiftLedMat.emissive.setHex(0xfacc15);
        this.shiftLedMat.emissiveIntensity = 1.5;
      } else {
        this.shiftLedMat.color.setHex(0x22c55e);
        this.shiftLedMat.emissive.setHex(0x22c55e);
        this.shiftLedMat.emissiveIntensity = 0.6;
      }
    }

    // 4. Update Digital Gear Display
    const currentGear = telemetry.gear ?? 1;
    if (currentGear !== this.prevGear || telemetry.isShifting) {
      this.drawGearDisplay(currentGear);
      this.isShiftingAnim = true;
      this.shiftTimer = 0;
      this.prevGear = currentGear;
    }

    // 5. Gear Shifting Flick Animation
    if (this.isShiftingAnim) {
      this.shiftTimer += dt;
      if (this.shiftTimer >= this.shiftDuration) {
        this.isShiftingAnim = false;
        if (this.shifterLever) this.shifterLever.rotation.x = 0.12;
      } else {
        const t = this.shiftTimer / this.shiftDuration;
        const flick = Math.sin(t * Math.PI) * 0.35;
        if (this.shifterLever) this.shifterLever.rotation.x = 0.12 + flick;
      }
    }

    // 6. Update Driver Arm IK
    // Find world positions of 9 o'clock and 3 o'clock grips on the rotating wheel rim
    const rimRadius = 0.160;
    const currentWheelZRot = this.steeringWheelGroup.rotation.z;

    // Left hand target (9 o'clock = angle PI)
    const leftLocal = new THREE.Vector3(
      Math.cos(Math.PI + currentWheelZRot) * rimRadius,
      Math.sin(Math.PI + currentWheelZRot) * rimRadius,
      0.02
    );
    leftLocal.applyEuler(this.steeringWheelGroup.rotation);
    const leftGripTarget = this.wheelCenter.clone().add(leftLocal);

    // Right hand target (3 o'clock = angle 0)
    const rightLocal = new THREE.Vector3(
      Math.cos(0 + currentWheelZRot) * rimRadius,
      Math.sin(0 + currentWheelZRot) * rimRadius,
      0.02
    );
    rightLocal.applyEuler(this.steeringWheelGroup.rotation);
    const rightGripTarget = this.wheelCenter.clone().add(rightLocal);

    // If shifting, right hand moves toward sequential shift knob!
    let activeRightTarget = rightGripTarget;
    if (this.isShiftingAnim) {
      const shiftTarget = new THREE.Vector3(
        this.shifterPos.x,
        this.shifterPos.y + 0.20,
        this.shifterPos.z
      );
      const shiftProgress = Math.sin((this.shiftTimer / this.shiftDuration) * Math.PI);
      activeRightTarget = rightGripTarget.clone().lerp(shiftTarget, shiftProgress);
    }

    // Solve 2-bone IK for left and right arms
    this.solveTwoBoneIK(
      this.leftShoulder,
      leftGripTarget,
      this.leftUpperArm,
      this.leftForearm,
      this.leftHandGroup,
      new THREE.Vector3(-0.6, 0.4, -0.4) // Outward elbow bend
    );

    this.solveTwoBoneIK(
      this.rightShoulder,
      activeRightTarget,
      this.rightUpperArm,
      this.rightForearm,
      this.rightHandGroup,
      new THREE.Vector3(0.5, 0.3, -0.4)
    );

    // Subtle head tilt into turns (lookahead)
    if (this.driverHead) {
      const targetHeadYaw = -clampedSteer * 0.22;
      this.driverHead.rotation.y = THREE.MathUtils.lerp(
        this.driverHead.rotation.y,
        targetHeadYaw,
        Math.min(1.0, 10.0 * dt)
      );
    }
  }
}

