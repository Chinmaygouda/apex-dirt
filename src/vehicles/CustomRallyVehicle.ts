import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { THREE_PALETTE, PALETTE } from '../core/Constants';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { VehicleInputs } from '../core/InputManager';
import { VehicleTelemetry } from './RapierBaselineVehicle';
import { SuspensionState, SUSPENSION_STATIC_LENGTH } from './SuspensionState';

export interface CustomVehicleTuning {
  // Suspension
  springStiffness: number;
  damperCompression: number;
  damperRebound: number;
  suspensionRestLength: number;
  antiRollBarStiffness: number;
  // Lane 2 additions. All optional: when omitted the rear axle mirrors the front and the stops are inactive,
  // which reproduces the previous behaviour exactly.
  springStiffnessRear?: number;        // N/m
  damperCompressionRear?: number;      // Ns/m
  damperReboundRear?: number;          // Ns/m
  suspensionRestLengthRear?: number;   // m, spring-free length of the rear corners
  antiRollBarStiffnessRear?: number;   // N/m
  bumpStopLength?: number;             // m, wheel length below which the progressive bump stop adds spring force
  bumpStopRate?: number;               // N/m, initial stop rate (progressive: the rate doubles bumpStopProgressM into the stop)
  bumpStopProgressM?: number;          // m, distance into the stop at which the stop rate has doubled (default 0.03; larger = flatter)
  droopStopLength?: number;            // m, longest wheel length the suspension can reach; ground beyond it = wheel hangs
  damperBlowOffVelocity?: number;      // m/s, piston speed above which the damper turns digressive (both directions)
  damperBlowOffRatio?: number;         // 0..1, damping slope above the blow-off speed as a fraction of the low-speed slope
  centerOfMassHeight?: number;         // m, world height of the centre of gravity at the static ride (default: geometric centre of the collider, 0.819 m)

  // Aerodynamics (Reduced downforce CLA as requested)
  aeroDragCdA: number;
  downforceCLA: number;

  // Surface Grip Multipliers (Default dirt to well below tarmac)
  surfaceMode: 'dirt' | 'gravel' | 'grass' | 'tarmac' | 'auto';
  gripMultiplierTarmac: number;
  gripMultiplierDirt: number;
  gripMultiplierGravel: number;
  gripMultiplierGrass: number;

  // Tyre & Friction (Pacejka & Load Sensitivity)
  baseFrictionMu: number;
  loadSensitivityK: number;
  loadFrictionMinClamp: number; // Clamp so friction never goes negative or collapses!
  slipOptLong: number;
  slipOptLatDeg: number;

  // V1 Powertrain - Engine & Turbo Curve
  engineTorqueMax: number;
  idleRpm: number;
  peakTorqueRpmMin: number;
  peakTorqueRpmMax: number;
  redlineRpm: number;
  revLimiterRpm: number;
  turboSpoolFactor: number;

  // V1 Powertrain - Transmission & Gearing
  isRwd: boolean;
  gear1Ratio: number;
  gear2Ratio: number;
  gear3Ratio: number;
  gear4Ratio: number;
  gear5Ratio: number;
  finalDriveRatio: number;
  shiftUpRpm: number;
  shiftDownRpm: number;
  shiftTimeMs: number;
  clutchBiteSpeedMph: number;
  launchTorqueSmoothing: boolean;
  driveGripScale: number;        // Drive/acceleration longitudinal grip scale (~1.4)
  brakeGripScale: number;        // Braking longitudinal grip scale (~2.0-2.4)

  // Brakes (V2)
  brakeTorqueMax: number;
  brakeBiasFront: number;        // Front brake bias (e.g. 0.62 for 62% front / 38% rear)
  engineBrakeTorque: number;     // Engine compression braking resistance torque (Nm)
  handbrakeTorque: number;
  handbrakeSlipCap: number;
  handbrakeRearGripScale: number;
  handbrakeFrontBrakeScale: number;

  // Steering & Drift Assist
  maxSteerAngleDeg: number;
  counterSteerAssistGain: number;
  driftEntryAngleDeg: number;
  driftExitAngleDeg: number;

  // V3 Slide Scrub & Soil Plowing
  enableSlideScrub: boolean;
  slideScrubMuMax: number;          // Peak soil berm plowing resistance (default ~0.50)
  slideScrubMinSlipDeg: number;     // Minimum slip angle to start plowing (default 9.0 deg)
  slideScrubMaxSlipDeg: number;     // Slip angle where full berm builds (default 35.0 deg)

  // Rolling Resistance & Coasting Drag
  rollingResistanceCoeff: number;   // Tyre rolling resistance on dirt/surface (default 0.065)

  // Reverse & Gear Engagement
  reverseEngageDelay: number;       // Delay in seconds holding brake at near-stop before reverse engages (default 0.4s)

  // V5 Body Motion & Visual Dynamics
  bodyMotionExaggeration: number;   // Visual body roll & pitch exaggeration factor (default 1.0, range 0.0 to 2.5)
  visualDiveScale: number;          // Visual pitch dive per G of braking deceleration (deg/G, default 1.4)
  visualSquatScale: number;         // Visual pitch squat per G of forward acceleration (deg/G, default 1.2)
  visualRollScale: number;          // Visual roll lean per G of lateral acceleration (deg/G, default 2.8)
  visualDroopExtension: number;     // Maximum visual suspension droop when unweighted in rotation (meters, default 0.08)

  // Debug Overlays Toggle
  showDebugOverlays: boolean;
}

export type RallyLiveryPreset = 'APEX_RED' | 'MONTE_CARLO_BLUE' | 'MIDNIGHT_STEALTH';

export interface LiveryColors {
  name: string;
  bodyColor: number;
  stripeColor: number;
  rimColor: number;
  mudflapColor: number;
}

export const RALLY_LIVERIES: Record<RallyLiveryPreset, LiveryColors> = {
  APEX_RED: {
    name: 'Apex Classic Red',
    bodyColor: 0xba1a1a,
    stripeColor: 0xf8fafc,
    rimColor: 0xf8fafc,
    mudflapColor: 0xdc2626,
  },
  MONTE_CARLO_BLUE: {
    name: 'Monte Carlo Blue',
    bodyColor: 0x1d4ed8,
    stripeColor: 0xfacc15,
    rimColor: 0xfacc15,
    mudflapColor: 0x1e293b,
  },
  MIDNIGHT_STEALTH: {
    name: 'Midnight Stealth',
    bodyColor: 0x18181b,
    stripeColor: 0xd97706,
    rimColor: 0xb45309,
    mudflapColor: 0x09090b,
  },
};

export class CustomRallyVehicle {
  public chassisMesh: THREE.Group;
  public wheelMeshes: THREE.Group[] = [];
  public chassisBody!: RAPIER.RigidBody;
  public chassisCollider?: RAPIER.Collider;
  public drivingDirectionMode: 'forward' | 'reverse' = 'forward';

  // Sub-mesh groups for damage & detachment
  public chassisMainGroup!: THREE.Group;
  public frontBumperGroup!: THREE.Group;
  public hoodGroup!: THREE.Group;
  public rearWingGroup!: THREE.Group;
  public cockpitObscuringMeshes: THREE.Object3D[] = [];

  // Livery & Cosmetics System
  public currentLivery: RallyLiveryPreset = 'APEX_RED';
  private bodyMaterials: THREE.MeshStandardMaterial[] = [];
  private stripeMaterials: THREE.MeshStandardMaterial[] = [];
  private rimMaterials: THREE.MeshStandardMaterial[] = [];
  private mudflapMaterials: THREE.MeshStandardMaterial[] = [];

  // Dynamic Brake Rotor Heat Glow
  private brakeRotorMats: THREE.MeshStandardMaterial[] = [];
  private brakeHeat: number = 0;
  private brakeRotorTemps: number[] = [20, 20, 20, 20];

  public cycleLivery(): RallyLiveryPreset {
    const list: RallyLiveryPreset[] = ['APEX_RED', 'MONTE_CARLO_BLUE', 'MIDNIGHT_STEALTH'];
    const idx = list.indexOf(this.currentLivery);
    const next = list[(idx + 1) % list.length];
    this.setLivery(next);
    return next;
  }

  public setLivery(preset: RallyLiveryPreset): void {
    this.currentLivery = preset;
    const colors = RALLY_LIVERIES[preset];
    if (!colors) return;

    for (const m of this.bodyMaterials) {
      m.color.setHex(colors.bodyColor);
    }
    for (const m of this.stripeMaterials) {
      m.color.setHex(colors.stripeColor);
    }
    for (const m of this.rimMaterials) {
      m.color.setHex(colors.rimColor);
    }
    for (const m of this.mudflapMaterials) {
      m.color.setHex(colors.mudflapColor);
    }
  }

  public setCockpitViewMode(isCockpit: boolean): void {
    for (const m of this.cockpitObscuringMeshes) {
      m.visible = !isCockpit;
    }
  }

  // Visual materials
  private brakeLightMat!: THREE.MeshBasicMaterial;
  private brakeLightGlowMat!: THREE.MeshStandardMaterial;
  private brakeLightPL!: THREE.PointLight;
  private brakeLightSpriteL?: THREE.Sprite;
  private brakeLightSpriteR?: THREE.Sprite;
  private runningLightMat!: THREE.MeshStandardMaterial;

  // Vehicle Parameters
  public tuning: CustomVehicleTuning = {
    // ---- Suspension (Lane 2). Front axle, anti-roll and CoG are the stock 89aa93a values on purpose: front spring, roll
    // stiffness and CoG height each break test:keyboard or the replay windows when moved (measured, see the Lane 2 report).
    // NOTE ON THE TIME BASE: Rapier steps at its default dt = 1/60 s but this class applies forces with dt = 1/120 s, so static
    // wheel load is 2.00x the car's weight and the REALISED ride frequency / damping ratio are about sqrt(2) x the paper values.
    // Rear rates: spring 54,600 N/m (1.3 x front) cuts squat; rest length = 0.2593 + 5907 N / k keeps the 0.2593 m static ride.
    springStiffness: 42000,       // N/m front
    springStiffnessRear: 54600,   // N/m rear
    damperCompression: 2774,      // Ns/m front (design zeta 0.39; was 3400)
    damperRebound: 3426,          // Ns/m front (1.235 x compression; was 4200)
    damperCompressionRear: 3163,  // Ns/m rear
    damperReboundRear: 3906,      // Ns/m rear
    suspensionRestLength: 0.40,   // m (ensures continuous tyre road contact under heavy braking)
    suspensionRestLengthRear: 0.3675, // m (static compression 0.1082 m at 5907 N)
    antiRollBarStiffness: 16000,  // N/m (keeps body level and prevents rollover during hard cornering)
    antiRollBarStiffnessRear: 8000, // N/m (half the front bar: front share of roll stiffness ~56%, still inside the 45-62% band)
    bumpStopLength: 0.15,         // m wheel length below which the progressive bump stop acts (10.9 cm of travel from static)
    bumpStopRate: 35000,          // N/m initial stop rate
    bumpStopProgressM: 0.08,      // m into the stop at which the rate has doubled (flat enough for a ramp landing under 6x static load)

    aeroDragCdA: 0.72,            // Typical 80s rally coupe Cd*A
    downforceCLA: 0.20,           // Substantially reduced CLA (from 1.37 to 0.20)
    rollingResistanceCoeff: 0.035,// Rolling resistance brings 7 mph coasting car to a halt in ~4.5s

    surfaceMode: 'dirt',          // Default surface is dirt
    gripMultiplierTarmac: 1.0,    // 100% tarmac reference
    gripMultiplierDirt: 0.72,     // 72% dirt grip (well below tarmac)
    gripMultiplierGravel: 0.58,   // 58% gravel grip
    gripMultiplierGrass: 0.42,    // 42% grass grip

    baseFrictionMu: 1.30,
    loadSensitivityK: 0.00008,
    loadFrictionMinClamp: 0.35,   // Guaranteed minimum friction limit
    slipOptLong: 0.12,
    slipOptLatDeg: 8.5,
    driveGripScale: 1.65,         // Drive grip scale (~1.4-1.65) coupled with friction ellipse
    brakeGripScale: 2.30,         // Braking grip scale (~2.0-2.4) allows 1.7-2.1G straight braking

    // V1 Engine & Turbo Curve defaults (calibrated from reference telemetry)
    engineTorqueMax: 7800,        // Nm calibrated with gearPowerScale for roll-on 65->100 in 1.9s, 101->120 in 1.7s
    idleRpm: 950,                 // RPM idle
    peakTorqueRpmMin: 3200,       // Boost begins fat plateau
    peakTorqueRpmMax: 6300,       // Boost plateau to 6300 RPM
    redlineRpm: 7200,             // Power tapers from 6300 to redline (falling to ~0.3G before 101 mph shift)
    revLimiterRpm: 7800,          // Rev limiter cut allows full upshift through 7050 RPM on dirt
    turboSpoolFactor: 0.60,       // 60% torque off-boost

    // V1 Transmission & Gearing defaults (calibrated to reference shift points)
    isRwd: true,
    gear1Ratio: 3.20,
    gear2Ratio: 2.10,
    gear3Ratio: 1.465,            // 3rd gear upshifts at ~101 mph
    gear4Ratio: 1.174,            // 4th gear calibrated for 101->120 in ~1.7s
    gear5Ratio: 0.940,            // 5th gear pulls to ~133 mph top speed
    finalDriveRatio: 3.90,
    shiftUpRpm: 7050,             // Triggers 3->4 @ ~101 mph, 4->5 @ ~126 mph
    shiftDownRpm: 3400,           // Downshift RPM threshold
    shiftTimeMs: 170,             // 170ms (0.17s) shift gap matching reference telemetry
    clutchBiteSpeedMph: 10.0,
    launchTorqueSmoothing: true,  // Torque smoothing on launch prevents excessive shock burnout

    // V2 Braking Defaults (1.7 - 2.1 G straight-line deceleration, stable pitch & yaw)
    brakeTorqueMax: 8200,         // Total brake system torque capacity (Nm)
    brakeBiasFront: 0.62,         // 62% Front / 38% Rear prevents rear lockup & yaw snap
    engineBrakeTorque: 420,       // Engine drag torque on trailing throttle (Nm)
    handbrakeTorque: 2800,        // Nm
    handbrakeSlipCap: 0.55,       // Caps rear slip under handbrake
    handbrakeRearGripScale: 0.80, // Calibrates handbrake slide rotation to ~35-40 deg
    handbrakeFrontBrakeScale: 0.60, // Front brake modulation during handbrake turn

    maxSteerAngleDeg: 33.0,
    counterSteerAssistGain: 0.45,
    driftEntryAngleDeg: 12.0,
    driftExitAngleDeg: 5.0,

    enableSlideScrub: true,
    slideScrubMuMax: 0.38,
    slideScrubMinSlipDeg: 9.0,
    slideScrubMaxSlipDeg: 35.0,

    reverseEngageDelay: 0.40,

    bodyMotionExaggeration: 1.2,
    visualDiveScale: 0.40,
    visualSquatScale: 1.2,
    visualRollScale: 3.8,
    visualDroopExtension: 0.15,

    showDebugOverlays: false,
  };

  // Physical dimensions
  public readonly wheelRadius = 0.35;
  private readonly halfWidth = 0.82;
  private readonly halfLength = 1.35;
  private readonly anchorY = -0.05;
  private readonly wheelInertia = 1.2; // kg m^2

  // Wheel states (0: FL, 1: FR, 2: RL, 3: RR)
  private wheelAnchors: THREE.Vector3[] = [];
  private wheelAngularVel = [0, 0, 0, 0];
  private suspTravelVelocity = [0, 0, 0, 0]; // m/s, + = compressing (Lane 2 SuspensionState)
  private prevSuspensionLengths = [0.2593, 0.2593, 0.2593, 0.2593];
  private currentSuspensionLengths = [0.2593, 0.2593, 0.2593, 0.2593];
  public wheelInContact = [true, true, true, true];
  private prevWheelInContact = [true, true, true, true];
  private wheelNormalForces = [0, 0, 0, 0];
  private wheelLateralForces = [0, 0, 0, 0];
  private wheelLongitudinalForces = [0, 0, 0, 0];
  private wheelSlipAngles = [0, 0, 0, 0];
  public wheelSlipRatios = [0, 0, 0, 0];
  private wheelRotations = [0, 0, 0, 0];

  // Steering & Drift State
  private currentSteer = 0;
  public isDrifting = false;
  public driftAngleDeg = 0;
  public driftStateTransitions = 0;
  private currentRpm = 1000;
  private currentGear = 1;
  private prevChassisVel = new THREE.Vector3();
  private lateralG = 0;

  // V5 Body Motion & Reverse Delay State
  private reverseEngageTimer: number = 0;
  private smoothedLongitudinalG: number = 0;
  private smoothedLateralG: number = 0;
  private currentVisualPitch: number = 0;
  private currentVisualRoll: number = 0;
  private droopTransient: number = 0;
  public lastVisualDroop: number[] = [0, 0, 0, 0];

  // Visual sub-mesh groups for damage & detachment
  public carGroup!: THREE.Group;

  // Powertrain & Gearing State (V1)
  public isShifting: boolean = false;
  public shiftTimer: number = 0;
  public currentTorqueMult: number = 1.0;

  // Debug Vectors & Metrics (V1)
  private lastContactPoints: (THREE.Vector3 | null)[] = [null, null, null, null];
  private lastWheelHeadings: THREE.Vector3[] = [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1)];
  private lastWheelLaterals: THREE.Vector3[] = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)];
  private lastFrictionEllipseUsage: number[] = [0, 0, 0, 0];
  private lastGroundSpeedsMph: number[] = [0, 0, 0, 0];
  private lastWheelSpeedsMph: number[] = [0, 0, 0, 0];

  public getGearRatio(gear: number): number {
    switch (gear) {
      case 1: return this.tuning.gear1Ratio;
      case 2: return this.tuning.gear2Ratio;
      case 3: return this.tuning.gear3Ratio;
      case 4: return this.tuning.gear4Ratio;
      case 5: return this.tuning.gear5Ratio;
      case -1: return this.tuning.gear1Ratio;
      default: return this.tuning.gear1Ratio;
    }
  }

  public getEngineTorqueMultiplier(rpm: number): number {
    const idle = this.tuning.idleRpm;
    const spoolMin = this.tuning.peakTorqueRpmMin;
    const spoolMax = this.tuning.peakTorqueRpmMax;
    const redline = this.tuning.redlineRpm;
    const revLimit = this.tuning.revLimiterRpm;
    const baseOffBoost = this.tuning.turboSpoolFactor;

    if (rpm < idle) return baseOffBoost * 0.8;
    if (rpm >= revLimit) return 0.0;

    if (rpm < spoolMin) {
      // Off-boost building into spool with aggressive turbo curve
      const t = (rpm - idle) / (spoolMin - idle);
      return THREE.MathUtils.lerp(baseOffBoost, 1.0, Math.pow(t, 1.4));
    } else if (rpm <= spoolMax) {
      // Flat peak boost torque plateau
      return 1.0;
    } else if (rpm <= redline) {
      // High-rpm taper towards redline (falls to ~0.33 at redline, producing ~0.30 - 0.33G before 101 mph shift)
      const t = (rpm - spoolMax) / (redline - spoolMax);
      return THREE.MathUtils.lerp(1.0, 0.33, Math.pow(t, 1.15));
    } else {
      // Soft rev-limit cut down to 0
      const t = (rpm - redline) / (revLimit - redline);
      return Math.max(0, 0.33 * (1.0 - t));
    }
  }

  constructor(private scene: THREE.Scene, private physics: PhysicsWorld, dispatcher?: any) {
    this.chassisMesh = new THREE.Group();
    this.setupWheelAnchors();
    this.createChassisVisuals();
    this.createWheelVisuals();
    this.initPhysics();
    if (dispatcher) {
      this.registerCollisionDispatcher(dispatcher);
    }
    this.scene.add(this.chassisMesh);
  }

  public registerCollisionDispatcher(dispatcher: any): void {
    if (dispatcher && typeof dispatcher.registerCarCollider === 'function') {
      dispatcher.registerCarCollider(this.chassisCollider, this.chassisBody);
    }
  }

  private setupWheelAnchors(): void {
    const hw = this.halfWidth;
    const hl = this.halfLength;
    const ay = this.anchorY;

    this.wheelAnchors = [
      new THREE.Vector3(-hw, ay, hl),  // 0: FL
      new THREE.Vector3(hw, ay, hl),   // 1: FR
      new THREE.Vector3(-hw, ay, -hl), // 2: RL
      new THREE.Vector3(hw, ay, -hl),  // 3: RR
    ];
  }

  private initPhysics(): void {
    const rapier = this.physics.rapier;

    // Chassis Rigid Body (1,180 kg rally coupe)
    const bodyDesc = rapier.RigidBodyDesc.dynamic()
      .setTranslation(0, 0.6593, -8)
      .setLinearDamping(0.005)
      .setAngularDamping(0.45)
      .setCanSleep(false);

    this.chassisBody = this.physics.world.createRigidBody(bodyDesc);

    // Box Collider for chassis body with low center of mass (collider elevated relative to CoM)
    const colDesc = rapier.ColliderDesc.cuboid(0.85, 0.32, 2.05)
      .setDensity(270)
      .setFriction(0.05)
      .setRestitution(0.05)
      .setTranslation(0, 0.16, 0)
      .setCollisionGroups((0x0002 << 16) | 0xffff);
    colDesc.setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS | rapier.ActiveEvents.CONTACT_FORCE_EVENTS);

    this.chassisCollider = this.physics.world.createCollider(colDesc, this.chassisBody);
    this.chassisCollider.setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS | rapier.ActiveEvents.CONTACT_FORCE_EVENTS);
    if (this.tuning.centerOfMassHeight !== undefined) this.setCenterOfMassHeight(this.tuning.centerOfMassHeight);
  }

  /**
   * Lane 2: move the centre of gravity WITHOUT moving the collision geometry (ground clearance and ramp/landing contact
   * stay as they were). Mass and principal inertia are held at the values the 0.85 x 0.32 x 2.05 m box at density 270 has
   * about its own centre, so yaw/pitch/roll response times are unchanged and only the weight-transfer lever arm changes.
   * `heightM` is the world height of the CoG at the static ride (body origin at 0.6593 m).
   */
  public setCenterOfMassHeight(heightM: number): void {
    if (!this.chassisCollider) return;
    const W = 1.7, H = 0.64, D = 4.1, DENSITY = 270; // full box dimensions of the chassis collider
    const m = DENSITY * W * H * D;
    const localY = heightM - 0.6593 - 0.16;          // relative to the collider centre (collider sits 0.16 m above the body origin)
    this.chassisCollider.setMassProperties(
      m,
      { x: 0, y: localY, z: 0 },
      { x: (m / 12) * (H * H + D * D), y: (m / 12) * (W * W + D * D), z: (m / 12) * (W * W + H * H) },
      { x: 0, y: 0, z: 0, w: 1 },
    );
  }

  /** Per-axle spring and damper rates actually used by the substep (rear falls back to front when no rear value is set). */
  public getAxleSuspensionRates(): { front: { k: number; cc: number; cr: number }; rear: { k: number; cc: number; cr: number } } {
    const t = this.tuning;
    return {
      front: { k: t.springStiffness, cc: t.damperCompression, cr: t.damperRebound },
      rear: { k: t.springStiffnessRear ?? t.springStiffness, cc: t.damperCompressionRear ?? t.damperCompression, cr: t.damperReboundRear ?? t.damperRebound },
    };
  }

  /**
   * Called on every 120 Hz physics substep.
   * Custom tyre model: Raycast suspension + load-dependent friction + friction ellipse + handbrake hysteresis.
   */
  public updatePhysicsSubstep(dt: number, inputs: VehicleInputs): void {
    if (!this.chassisBody) return;

    const chassisPos = this.chassisBody.translation();
    const worldChassisPos = new THREE.Vector3(chassisPos.x, chassisPos.y, chassisPos.z);

    if (inputs.reset || worldChassisPos.y < -3.0 || worldChassisPos.length() > 4000.0) {
      this.resetPosition();
      return;
    }

    if (inputs.drivetrainToggle) {
      this.tuning.isRwd = !this.tuning.isRwd;
    }

    const rapier = this.physics.rapier;
    const chassisRot = this.chassisBody.rotation();
    const linvel = this.chassisBody.linvel();
    const angvel = this.chassisBody.angvel();

    const chassisQuat = new THREE.Quaternion(chassisRot.x, chassisRot.y, chassisRot.z, chassisRot.w);
    const chassisLinvel = new THREE.Vector3(linvel.x, linvel.y, linvel.z);
    const chassisAngvel = new THREE.Vector3(angvel.x, angvel.y, angvel.z);

    // Vehicle orientation vectors
    const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(chassisQuat);
    const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(chassisQuat);
    const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisQuat);

    // Speed in vehicle space
    const vForward = chassisLinvel.dot(forwardVec);
    const vLateral = chassisLinvel.dot(rightVec);
    const speedMs = chassisLinvel.length();
    const speedMph = speedMs * 2.23694;

    // Aerodynamic downforce & drag on chassis CoM (using exposed CdA and CLA)
    const dragMag = 0.5 * 1.225 * this.tuning.aeroDragCdA * speedMs * speedMs;
    const downMag = 0.5 * 1.225 * this.tuning.downforceCLA * speedMs * speedMs;
    const dragImpulse = forwardVec.clone().multiplyScalar(-Math.sign(vForward) * dragMag * dt);
    const downImpulse = upVec.clone().multiplyScalar(-downMag * dt);
    this.chassisBody.applyImpulse(
      {
        x: dragImpulse.x + downImpulse.x,
        y: dragImpulse.y + downImpulse.y,
        z: dragImpulse.z + downImpulse.z,
      },
      true
    );

    // Rolling resistance drag on chassis opposing horizontal velocity
    const planarSpeed = Math.hypot(chassisLinvel.x, chassisLinvel.z);
    if (planarSpeed > 0.001) {
      const totalMass = this.chassisBody.mass();
      const rollingResMag = this.tuning.rollingResistanceCoeff * totalMass * 9.81;
      const maxStopImpulse = planarSpeed * totalMass;
      const impulseMag = Math.min(rollingResMag * dt, maxStopImpulse);
      const normX = chassisLinvel.x / planarSpeed;
      const normZ = chassisLinvel.z / planarSpeed;
      this.chassisBody.applyImpulse({ x: -normX * impulseMag, y: 0, z: -normZ * impulseMag }, true);
    }

    // Aerodynamic weather-cocking & broadside yaw damping (body / wing resistance when broadside)
    const bodyBetaDeg = Math.abs(THREE.MathUtils.radToDeg(Math.atan2(vLateral, Math.max(Math.abs(vForward), 1.2))));
    const yawStabilizationFactor = THREE.MathUtils.smoothstep(bodyBetaDeg, 12.0, 28.0);
    if (yawStabilizationFactor > 0.001) {
      const aeroSpeedFactor = (speedMs * speedMs) / (46.0 * 46.0);
      const yawDampTorque = -chassisAngvel.y * 6400.0 * yawStabilizationFactor * aeroSpeedFactor * dt;
      this.chassisBody.applyTorqueImpulse({ x: 0, y: yawDampTorque, z: 0 }, true);
    }

    // Lateral & Longitudinal G estimation
    const accelVec = chassisLinvel.clone().sub(this.prevChassisVel).divideScalar(Math.max(1e-4, dt));
    this.prevChassisVel.copy(chassisLinvel);
    const instLongG = accelVec.dot(forwardVec) / 9.80665;
    const instLatG = accelVec.dot(rightVec) / 9.80665;
    this.lateralG = instLatG;
    const gAlpha = Math.min(1.0, 15.0 * dt);
    this.smoothedLongitudinalG += (instLongG - this.smoothedLongitudinalG) * gAlpha;
    this.smoothedLateralG += (instLatG - this.smoothedLateralG) * gAlpha;

    // Vehicle drift slip angle beta
    const vDenom = Math.max(Math.abs(vForward), 1.2);
    this.driftAngleDeg = THREE.MathUtils.radToDeg(Math.atan2(vLateral, vDenom));

    // Drift State Machine with Hysteresis (enter ~12 deg, exit ~5 deg, no flicker)
    if (Math.abs(this.driftAngleDeg) > this.tuning.driftEntryAngleDeg) {
      if (!this.isDrifting) {
        this.driftStateTransitions++;
        this.isDrifting = true;
      }
    } else if (Math.abs(this.driftAngleDeg) < this.tuning.driftExitAngleDeg) {
      if (this.isDrifting) {
        this.driftStateTransitions++;
        this.isDrifting = false;
      }
    }

    // 1. Steering: Speed-sensitive lock limited by predicted lateral acceleration (active at ALL speeds)
    // Kinematic Ackermann: delta_kin = (L * a_y_limit) / v^2.
    // Dynamic tire slip / understeer compliance: slipSteerRad.
    const maxSteerRad = THREE.MathUtils.degToRad(this.tuning.maxSteerAngleDeg);
    const forwardSpeedMs = Math.max(1.0, Math.abs(vForward));
    const wheelBase = 2.70; // Axle separation: z = 1.35 to z = -1.35
    const targetAyLimit = 1.15 * 9.80665; // ~1.15 G predicted lateral acceleration limit
    const kinSteerRad = (wheelBase * targetAyLimit) / (forwardSpeedMs * forwardSpeedMs);
    const slipSteerRad = 0.046;
    const speedTaper = THREE.MathUtils.smoothstep(speedMph, 30.0, 60.0);
    const cruiseLockRad = THREE.MathUtils.lerp(maxSteerRad, Math.min(maxSteerRad, kinSteerRad + slipSteerRad), speedTaper);

    // Trail-braking / slide entry authority:
    // When braking into a corner or in handbrake/drift, front lock authority expands to allow pitch into rotation
    const brakeAuthority = THREE.MathUtils.smoothstep(inputs.brake, 0.15, 0.85);
    const slideAuthority = THREE.MathUtils.smoothstep(Math.abs(this.driftAngleDeg), 8.0, 20.0);
    const hbAuthority = inputs.handbrake ? 1.0 : 0.0;
    const dynamicAuthority = Math.max(brakeAuthority, slideAuthority, hbAuthority);

    // Dynamic lock interpolates smoothly from cruise lock to rally lock
    const baseRallyLock = maxSteerRad * Math.min(1.0, 36.0 / Math.max(16.0, speedMph));
    const effectiveLockRad = THREE.MathUtils.lerp(cruiseLockRad, baseRallyLock, dynamicAuthority);

    let targetSteer = -inputs.steer * effectiveLockRad;

    // Counter-steer assist / caster pneumatic trail: helps when driver is neutral / hands-off, but never fights a driver who is deliberately holding lock
    if (Math.abs(this.driftAngleDeg) > 3.0) {
      const driverSteerMag = Math.abs(inputs.steer);
      // Fades out completely when driver holds deliberate lock (steer >= 0.8)
      // and fades smoothly at low speeds (4 to 14 mph) without hard step cutoff
      const speedAssistFade = THREE.MathUtils.smoothstep(speedMph, 4.0, 14.0);
      const assistFactor = Math.max(0, 1.0 - driverSteerMag * 1.25) * speedAssistFade;
      if (assistFactor > 0.01) {
        const yawRateRad = chassisAngvel.y;
        const counterSteerRad = (THREE.MathUtils.degToRad(this.driftAngleDeg) * this.tuning.counterSteerAssistGain - yawRateRad * 0.12) * assistFactor;
        targetSteer += counterSteerRad;
        targetSteer = THREE.MathUtils.clamp(targetSteer, -maxSteerRad * 1.15, maxSteerRad * 1.15);
      }
    }

    // Direction-aware pedal mapping with ~0.5 m/s hysteresis and reverseEngageDelay:
    // Moving forward (vForward > 0.5 m/s): W = throttle, S = brake.
    // Moving backward (vForward < -0.5 m/s): S = reverse throttle, W = BRAKE (not forward throttle).
    // When nearly stopped (|vForward| <= 0.5 m/s): holding S engages reverse only after reverseEngageDelay (default 0.4s).
    const rawPedalForward = inputs.throttle; // W
    const rawPedalReverse = inputs.brake;    // S

    if (this.drivingDirectionMode === 'forward') {
      if (vForward < -0.5 && rawPedalForward < 0.1) {
        this.drivingDirectionMode = 'reverse';
        this.currentGear = -1;
        this.reverseEngageTimer = 0;
      } else if (Math.abs(vForward) <= 0.20 && rawPedalReverse > 0.1 && rawPedalForward < 0.05) {
        this.reverseEngageTimer += dt;
        if (this.reverseEngageTimer >= this.tuning.reverseEngageDelay) {
          this.drivingDirectionMode = 'reverse';
          this.currentGear = -1;
        }
      } else {
        this.reverseEngageTimer = 0;
      }
    } else { // 'reverse' mode
      if (vForward > 0.5 && rawPedalReverse < 0.1) {
        this.drivingDirectionMode = 'forward';
        this.currentGear = 1;
        this.reverseEngageTimer = 0;
      } else if (Math.abs(vForward) <= 0.5 && rawPedalForward > 0.1 && rawPedalReverse < 0.05) {
        this.drivingDirectionMode = 'forward';
        this.currentGear = 1;
        this.reverseEngageTimer = 0;
      }
    }

    let effectiveDriveDemand = 0;
    let effectiveBrakeDemand = 0;
    if (this.drivingDirectionMode === 'forward') {
      effectiveDriveDemand = rawPedalForward;
      effectiveBrakeDemand = rawPedalReverse;
    } else {
      effectiveDriveDemand = rawPedalReverse;
      effectiveBrakeDemand = rawPedalForward;
    }

    // Standstill check: evaluated continuously, smoothly applied at end of step
    const planarSpeedMs = Math.hypot(chassisLinvel.x, chassisLinvel.z);
    const isBrakingInput = effectiveBrakeDemand > 0.05 || inputs.handbrake;
    const isStationaryBraking = planarSpeedMs < 0.35 && effectiveDriveDemand < 0.05 && isBrakingInput;

    // Direction-aware rack ramp: slow for digital input into lock at speed, faster return to center
    const isSteeringIn = (Math.abs(targetSteer) >= Math.abs(this.currentSteer) - 0.001) &&
                         (targetSteer * this.currentSteer >= -0.001);
    const speedBlend = THREE.MathUtils.smoothstep(speedMph, 15.0, 85.0);
    const steerInRate = THREE.MathUtils.lerp(24.0, 5.0, speedBlend);
    const returnRate = THREE.MathUtils.lerp(24.0, 10.0, speedBlend);
    const rackRate = isSteeringIn ? steerInRate : returnRate;
    this.currentSteer += (targetSteer - this.currentSteer) * Math.min(1.0, rackRate * dt);

    // 2. Drivetrain Torque & Gearbox (V1)
    this.updateGearbox(dt, speedMs, effectiveDriveDemand, effectiveBrakeDemand, inputs);
    const totalGearRatio = this.getGearRatio(this.currentGear) * this.tuning.finalDriveRatio;
    let deliveredEngineTorque = 0;
    if (!this.isShifting && this.currentGear !== 0) {
      let gearPowerScale = 1.0;
      if (this.currentGear === 4) {
        gearPowerScale = 0.72; // Calibrates 101 -> 120 mph roll-on to ~1.7s (~0.55-0.60G)
      } else if (this.currentGear === 5) {
        gearPowerScale = 0.42; // Calibrates 5th gear pull and top speed to ~133 mph
      } else if (this.currentGear === -1) {
        gearPowerScale = 0.65; // Reverse gear power calibrated to smooth backing up
      }
      deliveredEngineTorque = effectiveDriveDemand * this.tuning.engineTorqueMax * this.currentTorqueMult * gearPowerScale * (totalGearRatio / 4.0);
      // In 5th gear, naturally taper engine torque as speed approaches top speed ~133 mph
      if (this.currentGear === 5 && speedMph > 128.0) {
        const topSpeedHeadroom = Math.max(0, (134.5 - speedMph) / 6.5);
        deliveredEngineTorque *= topSpeedHeadroom;
      }
    }

    // Engine braking when off-throttle with clutch engaged (in all gears including reverse)
    let engineBrakePerDrivenWheel = 0;
    if (!this.isShifting && !inputs.handbrake && this.currentGear !== 0 && effectiveDriveDemand < 0.05) {
      const engBrakeRatio = (this.currentRpm / this.tuning.redlineRpm) * (totalGearRatio / 4.0);
      const totalEngineBrake = this.tuning.engineBrakeTorque * engBrakeRatio;
      engineBrakePerDrivenWheel = this.tuning.isRwd ? totalEngineBrake * 0.5 : totalEngineBrake * 0.25;
    }

    const totalBrakeTorque = effectiveBrakeDemand * this.tuning.brakeTorqueMax;
    const isHandbrake = inputs.handbrake;

    // Suspension Raycasts & Spring Forces
    // Per-corner geometry. Rear values mirror the front when the optional rear tuning fields are omitted.
    const tn = this.tuning;
    const restOf = (i: number) => (i >= 2 && tn.suspensionRestLengthRear !== undefined ? tn.suspensionRestLengthRear : tn.suspensionRestLength);
    const maxLenOf = (i: number) => (tn.droopStopLength !== undefined ? tn.droopStopLength : restOf(i) + 0.15);
    const rayDir = upVec.clone().negate();

    const compressions = [0, 0, 0, 0];
    const hitPoints: (THREE.Vector3 | null)[] = [null, null, null, null];
    const hitNormals: THREE.Vector3[] = [upVec.clone(), upVec.clone(), upVec.clone(), upVec.clone()];

    for (let i = 0; i < 4; i++) {
      const localAnchor = this.wheelAnchors[i];
      const worldAnchor = localAnchor.clone().applyQuaternion(chassisQuat).add(worldChassisPos);

      const rayLength = maxLenOf(i) + this.wheelRadius;

      // Cast ray with Rapier
      const ray = new rapier.Ray(
        { x: worldAnchor.x, y: worldAnchor.y, z: worldAnchor.z },
        { x: rayDir.x, y: rayDir.y, z: rayDir.z }
      );

      // Hit filter excluding chassis itself and querying only GROUP_GROUND (0x0001)
      const filterGroups = (0x0020 << 16) | 0x0001;
      const hit = this.physics.world.castRayAndGetNormal(
        ray,
        rayLength,
        true,
        undefined,
        filterGroups,
        undefined,
        this.chassisBody
      );

      if (hit && hit.timeOfImpact < rayLength) {
        this.wheelInContact[i] = true;
        const currentLength = hit.timeOfImpact - this.wheelRadius;
        this.currentSuspensionLengths[i] = currentLength;
        compressions[i] = Math.max(0, restOf(i) - currentLength);

        const hp = worldAnchor.clone().add(rayDir.clone().multiplyScalar(hit.timeOfImpact));
        hitPoints[i] = hp;
        hitNormals[i] = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
      } else {
        this.wheelInContact[i] = false;
        this.prevWheelInContact[i] = false;
        // Airborne: the wheel hangs at the droop stop if one is defined, otherwise at the spring-free length (as before).
        this.currentSuspensionLengths[i] = tn.droopStopLength !== undefined ? tn.droopStopLength : restOf(i);
        compressions[i] = 0;
        hitPoints[i] = null;
      }
    }

    // Surface slope determination (sandbox ramp vs flat ground)
    const slopeSin = Math.hypot(forwardVec.y, rightVec.y);
    let avgNormalY = 1.0;
    let inContactCount = 0;
    for (let i = 0; i < 4; i++) {
      if (this.wheelInContact[i] && hitNormals[i]) {
        avgNormalY += hitNormals[i].y;
        inContactCount++;
      }
    }
    if (inContactCount > 0) avgNormalY /= inContactCount;
    const isSloped = slopeSin > 0.04 || avgNormalY < 0.992;
    const isNaturalStandstill = !isSloped && planarSpeedMs < 0.06 && effectiveDriveDemand < 0.05 && rawPedalForward < 0.05 && rawPedalReverse < 0.05;

    // Anti-Roll Bar Load Transfer
    const arbFront = (compressions[0] - compressions[1]) * this.tuning.antiRollBarStiffness;
    const arbRear = (compressions[2] - compressions[3]) * (this.tuning.antiRollBarStiffnessRear ?? this.tuning.antiRollBarStiffness);

    // 3. Compute Tyre Forces for Each Wheel
    for (let i = 0; i < 4; i++) {
      if (!this.wheelInContact[i] || !hitPoints[i]) {
        this.prevWheelInContact[i] = false;
        this.wheelNormalForces[i] = 0;
        this.wheelLateralForces[i] = 0;
        this.wheelLongitudinalForces[i] = 0;
        this.wheelSlipAngles[i] = 0;
        this.wheelSlipRatios[i] = 0;
        this.lastContactPoints[i] = null;
        this.lastFrictionEllipseUsage[i] = 0;
        this.lastGroundSpeedsMph[i] = 0;
        this.lastWheelSpeedsMph[i] = this.wheelAngularVel[i] * this.wheelRadius * 2.23694;
        this.prevSuspensionLengths[i] = this.currentSuspensionLengths[i];
        this.suspTravelVelocity[i] = 0;
        continue;
      }

      // Normal spring force
      const deltaX = compressions[i];
      let suspVelocity = (this.prevSuspensionLengths[i] - this.currentSuspensionLengths[i]) / dt;
      if (!this.prevWheelInContact[i]) {
        suspVelocity = 0; // Guard against artificial damper shock when first touching down
      }
      this.prevSuspensionLengths[i] = this.currentSuspensionLengths[i];
      this.prevWheelInContact[i] = true;
      this.suspTravelVelocity[i] = suspVelocity;

      const isRearCorner = i >= 2;
      const springK = isRearCorner ? (tn.springStiffnessRear ?? tn.springStiffness) : tn.springStiffness;
      const dampComp = isRearCorner ? (tn.damperCompressionRear ?? tn.damperCompression) : tn.damperCompression;
      const dampReb = isRearCorner ? (tn.damperReboundRear ?? tn.damperRebound) : tn.damperRebound;
      const damperCoeff = suspVelocity >= 0 ? dampComp : dampReb;
      // Digressive damper (inactive unless damperBlowOffVelocity is set): above the blow-off speed the damping slope drops to
      // damperBlowOffRatio of its low-speed value, which keeps body control at low piston speed and stops the damper from
      // delivering a huge force spike on a landing.
      let dampVel = suspVelocity;
      if (tn.damperBlowOffVelocity !== undefined) {
        const av = Math.abs(dampVel);
        if (av > tn.damperBlowOffVelocity) dampVel = Math.sign(dampVel) * (tn.damperBlowOffVelocity + (av - tn.damperBlowOffVelocity) * (tn.damperBlowOffRatio ?? 1));
      }
      let Fz = deltaX * springK + dampVel * damperCoeff;

      // Progressive bump stop (inactive unless bumpStopLength and bumpStopRate are set)
      if (tn.bumpStopLength !== undefined && tn.bumpStopRate) {
        const xb = tn.bumpStopLength - this.currentSuspensionLengths[i];
        if (xb > 0) Fz += tn.bumpStopRate * xb * (1 + xb / (tn.bumpStopProgressM ?? 0.03));
      }

      // Apply Anti-Roll Bar offset
      if (i === 0) Fz += arbFront;
      if (i === 1) Fz -= arbFront;
      if (i === 2) Fz += arbRear;
      if (i === 3) Fz -= arbRear;

      Fz = Math.max(0, Fz);
      this.wheelNormalForces[i] = Fz;

      // Wheel anchor & hub point
      const localAnchor = this.wheelAnchors[i];
      const worldAnchor = localAnchor.clone().applyQuaternion(chassisQuat).add(worldChassisPos);
      const hubPt = worldAnchor.clone().sub(upVec.clone().multiplyScalar(this.currentSuspensionLengths[i]));

      // Hub relative to CoM for rotational velocity
      const rVec = hubPt.clone().sub(worldChassisPos);
      const vContact = chassisLinvel.clone().add(chassisAngvel.clone().cross(rVec));

      // Wheel orientation
      const isFront = i < 2;
      const steer = isFront ? this.currentSteer : 0;
      const wheelSteerQuat = new THREE.Quaternion().setFromAxisAngle(upVec, steer);
      const wheelForward = forwardVec.clone().applyQuaternion(wheelSteerQuat).normalize();
      const wheelLateral = rightVec.clone().applyQuaternion(wheelSteerQuat).normalize();

      // Decompose contact velocity
      const vx = vContact.dot(wheelForward);
      const vy = vContact.dot(wheelLateral);

      // Low-Speed Slip Ratio Guard (SAE standard low-speed divisor guard)
      const vGuard = 2.5;
      const denomSpeed = Math.sqrt(vx * vx + vGuard * vGuard);

      // Determine per-surface grip multiplier (dirt/gravel/grass/tarmac)
      const surfaceInfo = this.getSurfaceGripMultiplier(worldAnchor.x, worldAnchor.z);
      const surfaceMult = surfaceInfo.multiplier;

      // Load-dependent friction limit with CLAMP (User requirement: never negative or collapsing!)
      const mu0 = this.tuning.baseFrictionMu * surfaceMult;
      const kLoad = this.tuning.loadSensitivityK;
      const minClamp = this.tuning.loadFrictionMinClamp * surfaceMult;
      let muLoad = mu0 / (1.0 + kLoad * Fz);
      muLoad = Math.max(minClamp, muLoad);

      const isRear = i >= 2;
      if (isRear && isHandbrake && vx > 0) {
        muLoad *= this.tuning.handbrakeRearGripScale;
      }

      const Fmax = muLoad * Fz;
      let FmaxLat = Fmax;
      if (isRear) {
        if (isHandbrake) {
          const driftStabilization = THREE.MathUtils.clamp((Math.abs(this.driftAngleDeg) - 18.0) / 16.0, 0, 1);
          FmaxLat *= (1.0 + 0.95 * driftStabilization);
        } else {
          const speedUndersteer = THREE.MathUtils.smoothstep(speedMph, 35.0, 55.0);
          const slideBlend = THREE.MathUtils.smoothstep(Math.abs(this.driftAngleDeg), 12.0, 22.0);
          const brakeFade = 1.0 - THREE.MathUtils.smoothstep(inputs.brake, 0.15, 0.75);
          FmaxLat *= (1.0 + 0.55 * speedUndersteer * (1.0 - slideBlend) * brakeFade);
        }
      } else {
        // Front lateral grip in steady cornering: slightly moderated to ensure positive understeer gradient (front saturates before rear)
        const speedUndersteer = THREE.MathUtils.smoothstep(speedMph, 35.0, 55.0);
        const slideBlend = THREE.MathUtils.smoothstep(Math.abs(this.driftAngleDeg), 12.0, 22.0);
        const brakeFade = 1.0 - THREE.MathUtils.smoothstep(inputs.brake, 0.15, 0.75);
        FmaxLat *= (1.0 - 0.10 * speedUndersteer * (1.0 - slideBlend) * brakeFade);
      }

      // Angular velocity update for wheel
      const isDriven = this.tuning.isRwd ? isRear : true;
      const rollingOmega = vx / this.wheelRadius;

      // Realistic engine rev limiter
      const maxEngineOmega = (this.tuning.revLimiterRpm * 2 * Math.PI) / 60;
      const maxWheelOmega = maxEngineOmega / Math.max(0.1, totalGearRatio);

      let drivenTorque = isDriven ? (this.tuning.isRwd ? deliveredEngineTorque * 0.5 : deliveredEngineTorque * 0.25) : 0;
      if (this.currentGear === -1) {
        drivenTorque = -drivenTorque;
      }

      // 1. Current Slips from current wheel angular velocity and road velocity
      const sx = (this.wheelAngularVel[i] * this.wheelRadius - vx) / denomSpeed;
      const alpha = Math.atan2(vy, denomSpeed);
      this.wheelSlipRatios[i] = sx;
      this.wheelSlipAngles[i] = alpha;

      const isDirtOrGravel = surfaceInfo.name === 'Dirt' || surfaceInfo.name === 'Gravel';

      // 2. Lateral Tyre Curve: Higher rear cornering stiffness (peak at 7.5 deg) vs front (10.5 deg) for understeer gradient
      let FyRaw = 0;
      if (isDirtOrGravel) {
        const alphaDeg = Math.abs(alpha) * (180 / Math.PI);
        const peakAlpha = isRear ? 7.5 : 10.5;
        let normGrip = 0;
        if (alphaDeg <= peakAlpha) {
          normGrip = Math.sin((alphaDeg / peakAlpha) * (Math.PI / 2));
        } else if (alphaDeg <= peakAlpha + 4.0) {
          normGrip = 1.0;
        } else {
          const v = (alphaDeg - (peakAlpha + 4.0)) / 16.0;
          normGrip = 0.80 + 0.20 * Math.exp(-0.5 * v * v);
        }
        FyRaw = -Math.sign(alpha) * FmaxLat * normGrip;
      } else {
        const By = 8.5;
        const Cy = 1.35;
        FyRaw = -FmaxLat * Math.sin(Cy * Math.atan(By * alpha));
      }

      // Longitudinal grip scale (Drive vs Braking grip scale):
      // Forward (vx >= 0): sx >= 0 is driving, sx < 0 is braking.
      // Reverse (vx < 0): sx <= 0 is driving, sx > 0 is braking.
      const isDriving = (vx >= 0) ? (sx >= 0) : (sx <= 0);
      let effectiveBrakeScale = this.tuning.brakeGripScale;
      if (isDirtOrGravel) {
        // On loose dirt/gravel, compaction braking (~2.0-2.3G) occurs when the vehicle travels along its track (beta ~ 0).
        // When the vehicle rotates into a broadside drift/slide (beta -> 30-40 deg), soil shears and grip transitions naturally to broadside sliding friction (~0.45-0.55G).
        const bodySlipRad = Math.abs(Math.atan2(vLateral, Math.max(Math.abs(vForward), 1.0)));
        const betaRatio = bodySlipRad / THREE.MathUtils.degToRad(11.0);
        const compactionFactor = 1.0 / (1.0 + betaRatio * betaRatio);
        const minBroadsideScale = 0.25;
        effectiveBrakeScale = minBroadsideScale + (this.tuning.brakeGripScale - minBroadsideScale) * compactionFactor;
      }
      const longGripScale = isDriving ? this.tuning.driveGripScale : effectiveBrakeScale;
      const FmaxLong = Fmax * longGripScale;

      const Bx = isDirtOrGravel ? 5.8 : 10.0;
      const Cx = isDirtOrGravel ? 1.25 : 1.65;
      const FxRaw = FmaxLong * Math.sin(Cx * Math.atan(Bx * sx));

      // 3. Friction Ellipse (Combined Slip Constraint - couples Fx and Fy)
      const normFx = FxRaw / Math.max(1, FmaxLong);
      const normFy = FyRaw / Math.max(1, FmaxLat);
      const rho = Math.hypot(normFx, normFy);

      let Fx = FxRaw;
      let Fy = FyRaw;
      if (rho > 1.0) {
        // True physical friction ellipse: resultant force vector sits on the elliptical boundary
        // oriented along the contact patch slip velocity angle phi
        const slipVx = Math.abs(this.wheelAngularVel[i] * this.wheelRadius - vx);
        const slipVy = Math.abs(vy);
        const phi = Math.atan2(slipVy, slipVx + 0.05);
        const c = Math.cos(phi);
        const s = Math.sin(phi);
        const denom = Math.sqrt((c / FmaxLong) * (c / FmaxLong) + (s / FmaxLat) * (s / FmaxLat));
        const Fellipse = 1.0 / Math.max(1e-4, denom);
        Fx = Math.sign(FxRaw) * Fellipse * c;
        Fy = -Math.sign(vy) * Fellipse * s;
      }

      this.wheelLongitudinalForces[i] = Fx;
      this.wheelLateralForces[i] = Fy;
      this.lastContactPoints[i] = hitPoints[i];
      this.lastWheelHeadings[i] = wheelForward.clone();
      this.lastWheelLaterals[i] = wheelLateral.clone();
      this.lastFrictionEllipseUsage[i] = rho;
      this.lastGroundSpeedsMph[i] = vx * 2.23694;
      this.lastWheelSpeedsMph[i] = this.wheelAngularVel[i] * this.wheelRadius * 2.23694;

      // 4. V1 Clutch / Launch behavior: active launch traction control keeps wheel slip at the tyre's peak plateau (~0.18 - 0.24) during standing start and low-speed pulls
      if (this.tuning.launchTorqueSmoothing && isDriven && inputs.throttle > 0 && this.currentGear <= 2 && speedMph < 35.0) {
        const targetPeakSlip = 0.20;
        const targetOmega = (vx + targetPeakSlip * denomSpeed) / this.wheelRadius;
        const maxRoadTorque = FmaxLong * this.wheelRadius;

        if (this.wheelAngularVel[i] > targetOmega) {
          drivenTorque = Math.min(drivenTorque, maxRoadTorque * 1.05);
          this.wheelAngularVel[i] = THREE.MathUtils.lerp(this.wheelAngularVel[i], targetOmega, Math.min(1.0, 25.0 * dt));
        } else {
          drivenTorque = Math.min(drivenTorque, maxRoadTorque * 1.25);
        }
      }

      // Cut power at rev limiter
      if (this.wheelAngularVel[i] > maxWheelOmega) {
        drivenTorque = 0;
      }

      // V2: Front/Rear Brake Bias (62% front / 38% rear) + Engine Braking
      const wheelBrakeBias = isFront ? (this.tuning.brakeBiasFront * 2.0) : ((1.0 - this.tuning.brakeBiasFront) * 2.0);
      let appliedBrake = (totalBrakeTorque * 0.25) * wheelBrakeBias;
      if (isDriven) {
        appliedBrake += engineBrakePerDrivenWheel;
      }
      if (isRear && isHandbrake) {
        appliedBrake += this.tuning.handbrakeTorque;
      }

      // 5. Complete Net Torque Balance on Wheel with Reflected Engine Inertia
      const engineInertiaReflected = (isDriven && !this.isShifting && this.currentGear > 0)
        ? (0.16 * totalGearRatio * totalGearRatio) / (this.tuning.isRwd ? 2.0 : 4.0)
        : 0;
      const effectiveInertia = this.wheelInertia + engineInertiaReflected;

      const roadTractionTorque = -Fx * this.wheelRadius;
      const externalTorque = drivenTorque + roadTractionTorque;

      if (Math.abs(this.wheelAngularVel[i]) < 0.20) {
        if (appliedBrake >= Math.abs(externalTorque)) {
          // Static brake lock: caliper holds wheel stationary
          this.wheelAngularVel[i] = 0;
        } else {
          // Caliper slips under external torque
          const slipBrakeTorque = Math.sign(externalTorque) * appliedBrake;
          const netTorque = externalTorque - slipBrakeTorque;
          this.wheelAngularVel[i] += (netTorque / effectiveInertia) * dt;
        }
      } else if (this.wheelAngularVel[i] > 0) {
        const brakeNeeded = (this.wheelAngularVel[i] * effectiveInertia) / dt + externalTorque;
        if (appliedBrake >= brakeNeeded && brakeNeeded > 0) {
          this.wheelAngularVel[i] = 0;
        } else {
          const netTorque = externalTorque - appliedBrake;
          this.wheelAngularVel[i] += (netTorque / effectiveInertia) * dt;
        }
      } else {
        const brakeNeeded = (Math.abs(this.wheelAngularVel[i]) * effectiveInertia) / dt - externalTorque;
        if (appliedBrake >= brakeNeeded && brakeNeeded > 0) {
          this.wheelAngularVel[i] = 0;
        } else {
          const netTorque = externalTorque + appliedBrake;
          this.wheelAngularVel[i] += (netTorque / effectiveInertia) * dt;
        }
      }

      // Coasting drivetrain drag
      if (inputs.throttle < 0.05 && appliedBrake < 10) {
        this.wheelAngularVel[i] = THREE.MathUtils.lerp(this.wheelAngularVel[i], rollingOmega, Math.min(1.0, 10.0 * dt));
      }

      // Physical rev limit guard
      if (isDriven && this.wheelAngularVel[i] > maxWheelOmega * 1.05) {
        this.wheelAngularVel[i] = maxWheelOmega * 1.05;
      }

      // Handbrake slip cap: don't let rear wheels lock dead during high-speed forward drift;
      // at low speed (< 3.5 m/s) or in reverse (vx <= 0), allow full lock
      if (isRear && isHandbrake) {
        if (vx > 3.5) {
          const highSpeedBlend = THREE.MathUtils.smoothstep(vx, 3.5, 10.0);
          const targetRotSpeed = (vx / this.wheelRadius) * (1.0 - this.tuning.handbrakeSlipCap * highSpeedBlend);
          this.wheelAngularVel[i] = THREE.MathUtils.lerp(this.wheelAngularVel[i], targetRotSpeed, Math.min(1.0, 15.0 * dt));
        } else {
          this.wheelAngularVel[i] = THREE.MathUtils.lerp(this.wheelAngularVel[i], 0, Math.min(1.0, 25.0 * dt));
        }
      }

      // Wheel visual spin angle
      this.wheelRotations[i] += this.wheelAngularVel[i] * dt;

      // Suspension normal impulse applied at hub along upVec
      const suspImpulse = upVec.clone().multiplyScalar(Fz * dt);
      this.chassisBody.applyImpulseAtPoint(
        { x: suspImpulse.x, y: suspImpulse.y, z: suspImpulse.z },
        { x: hubPt.x, y: hubPt.y, z: hubPt.z },
        true
      );

      // Slide scrub drag on loose surfaces (soil deformation & plowing resistance when sliding sideways)
      let scrubImpulse = new THREE.Vector3();
      if (isDirtOrGravel && this.tuning.enableSlideScrub) {
        const contactVel = wheelForward.clone().multiplyScalar(vx).add(wheelLateral.clone().multiplyScalar(vy));
        const contactSpeed = contactVel.length();
        if (contactSpeed > 0.5) {
          const lateralRatio = Math.abs(vy) / Math.max(contactSpeed, 0.5);
          const minRatio = Math.sin(THREE.MathUtils.degToRad(this.tuning.slideScrubMinSlipDeg));
          const maxRatio = Math.sin(THREE.MathUtils.degToRad(this.tuning.slideScrubMaxSlipDeg));
          // Soil plowing berm builds up when sliding sideways at large slip angles
          const scrubRatio = THREE.MathUtils.clamp((lateralRatio - minRatio) / Math.max(1e-4, maxRatio - minRatio), 0, 1);
          // Gate by tyre slip state: when tyre experiences significant longitudinal braking slip (sx < -0.06),
          // friction ellipse already utilizes tyre-road interface for stopping.
          // In an unbraked slide, wheels roll freely along heading (|sx| < 0.05), engaging full soil berm resistance.
          const brakeSlipRatio = (isRear && isHandbrake)
            ? 0.40
            : THREE.MathUtils.clamp((-sx - 0.06) / 0.18, 0, 1);
          const unbrakedFactor = 1.0 - brakeSlipRatio;

          // Scale smoothly with sliding/contact speed to zero near 0:
          // At high speeds (>= 24 m/s ~ 54 mph), soil plowing builds full berm resistance (1.0).
          // At lower speeds, plowing resistance fades smoothly towards 0 so the car can power-drift without bleeding all speed.
          const scrubSpeedScale = THREE.MathUtils.smoothstep(contactSpeed, 1.5, 24.0);

          const effectiveScrub = scrubRatio * unbrakedFactor * scrubSpeedScale;
          if (effectiveScrub > 0) {
            const scrubMu = this.tuning.slideScrubMuMax * effectiveScrub;
            const scrubForce = contactVel.clone().normalize().multiplyScalar(-Fz * scrubMu);
            scrubImpulse = scrubForce.multiplyScalar(dt);
          }
        }
      }

      // Traction impulses (forward & lateral) + dirt scrub applied at hub
      const tractionImpulse = (isStationaryBraking || isNaturalStandstill)
        ? new THREE.Vector3(0, 0, 0)
        : wheelForward.clone().multiplyScalar(Fx * dt)
            .add(wheelLateral.clone().multiplyScalar(Fy * dt))
            .add(scrubImpulse);
      this.chassisBody.applyImpulseAtPoint(
        { x: tractionImpulse.x, y: tractionImpulse.y, z: tractionImpulse.z },
        { x: hubPt.x, y: hubPt.y, z: hubPt.z },
        true
      );
    }

    // Standstill hold (smooth blend to zero, no velocity discontinuity):
    // If car is stationary under brake/handbrake or naturally at rest on flat ground with zero inputs,
    // smoothly blend planar velocity to 0.
    if (isStationaryBraking || isNaturalStandstill) {
      const curLinvel = this.chassisBody.linvel();
      const curAngvel = this.chassisBody.angvel();
      const blend = Math.max(0, 1.0 - 25.0 * dt);
      const newVx = curLinvel.x * blend;
      const newVz = curLinvel.z * blend;
      const newPlanar = Math.hypot(newVx, newVz);
      if (newPlanar < 0.08) {
        this.chassisBody.setLinvel({ x: 0, y: isSloped ? 0 : curLinvel.y, z: 0 }, true);
        this.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        for (let i = 0; i < 4; i++) {
          this.wheelAngularVel[i] = 0;
        }
      } else {
        this.chassisBody.setLinvel({ x: newVx, y: curLinvel.y, z: newVz }, true);
        this.chassisBody.setAngvel({ x: curAngvel.x * blend, y: curAngvel.y * blend, z: curAngvel.z * blend }, true);
        for (let i = 0; i < 4; i++) {
          this.wheelAngularVel[i] *= blend;
        }
      }
    }
  }

  private shiftCooldown: number = 0;

  private updateGearbox(dt: number, speedMs: number, driveDemand: number, brakeDemand: number, inputs: VehicleInputs): void {
    const speedMph = Math.abs(speedMs) * 2.23694;

    // Shift timer countdown
    if (this.isShifting) {
      this.shiftTimer -= dt;
      if (this.shiftTimer <= 0) {
        this.isShifting = false;
        this.shiftTimer = 0;
      }
    }

    if (this.shiftCooldown > 0) {
      this.shiftCooldown -= dt;
    }

    // Driving direction mode synchronization
    if (this.drivingDirectionMode === 'reverse') {
      this.currentGear = -1;
    } else if (this.currentGear === -1) {
      this.currentGear = 1;
    }

    // Wheel angular speed to engine RPM computed first
    const ratio = this.getGearRatio(this.currentGear) * this.tuning.finalDriveRatio;
    const drivenOmega = this.tuning.isRwd
      ? (this.wheelAngularVel[2] + this.wheelAngularVel[3]) * 0.5
      : (this.wheelAngularVel[0] + this.wheelAngularVel[1] + this.wheelAngularVel[2] + this.wheelAngularVel[3]) * 0.25;
    const wheelRpm = (Math.abs(drivenOmega) / (2 * Math.PI)) * 60;
    const gearTargetRpm = wheelRpm * ratio;

    if (this.isShifting) {
      // Clutch disengaged: RPM drops smoothly towards target gear RPM
      const shiftTarget = Math.max(this.tuning.idleRpm, gearTargetRpm);
      this.currentRpm = THREE.MathUtils.lerp(this.currentRpm, shiftTarget, Math.min(1.0, 16.0 * dt));
    } else {
      if (speedMph < this.tuning.clutchBiteSpeedMph) {
        // Progressive clutch engagement from standstill
        const clutchProgress = THREE.MathUtils.clamp(speedMph / this.tuning.clutchBiteSpeedMph, 0, 1);
        const launchSlipRpm = this.tuning.idleRpm + driveDemand * 2400;
        this.currentRpm = THREE.MathUtils.lerp(launchSlipRpm, gearTargetRpm, clutchProgress);
      } else {
        this.currentRpm = gearTargetRpm;
      }
    }

    this.currentRpm = THREE.MathUtils.clamp(this.currentRpm, this.tuning.idleRpm, this.tuning.revLimiterRpm);
    this.currentTorqueMult = this.getEngineTorqueMultiplier(this.currentRpm);

    // Automatic upshifts, kickdown, gear-skipping, and single merged downshifts
    const upshiftMinSpeeds = [0, 34, 54, 100, 125];

    // Determine target downshift gear based on road speed (supports skipping gears e.g. 5->3 or 3->1)
    let prospectiveDownshiftGear = this.currentGear;
    if (speedMph <= 26.0) {
      prospectiveDownshiftGear = 1;
    } else if (speedMph <= 60.0) {
      prospectiveDownshiftGear = 2;
    } else if (speedMph <= 100.0) {
      prospectiveDownshiftGear = 3;
    } else if (speedMph <= 113.0) {
      prospectiveDownshiftGear = 4;
    }

    // Effective engine RPM based on transmission road speed to prevent spinning wheels from masking a bogged engine
    const roadSpeedWheelRpm = (Math.max(0.5, Math.abs(speedMs)) / this.wheelRadius / (2 * Math.PI)) * 60;
    const roadSpeedRpm = roadSpeedWheelRpm * ratio;
    const effectiveRpm = Math.min(this.currentRpm, Math.max(this.tuning.idleRpm, roadSpeedRpm * 1.30));

    // Kickdown under throttle: if engine bogs below shiftDownRpm even with throttle pressed,
    // find the lowest gear that won't over-rev above shiftUpRpm
    const isKickdown = driveDemand >= 0.50 && (effectiveRpm < this.tuning.shiftDownRpm || (this.currentGear >= 3 && speedMph < 32.0));
    if (isKickdown && this.currentGear > 1) {
      for (let g = 1; g < this.currentGear; g++) {
        const estRatio = this.getGearRatio(g) * this.tuning.finalDriveRatio;
        const estRpm = roadSpeedWheelRpm * estRatio;
        if (estRpm <= this.tuning.shiftUpRpm - 400) {
          prospectiveDownshiftGear = Math.min(prospectiveDownshiftGear, g);
          break;
        }
      }
    }

    const isBrakingOrDecel = brakeDemand > 0.05 || inputs.handbrake || driveDemand < 0.75;
    const isEngineStalling = speedMph < 30.0 && effectiveRpm <= 1600;
    const isUnderSpeedForGear = this.currentGear >= 3 && speedMph < upshiftMinSpeeds[this.currentGear - 1] - 8.0;
    const wantsDownshift = prospectiveDownshiftGear < this.currentGear && (isBrakingOrDecel || isKickdown || isEngineStalling || isUnderSpeedForGear);

    // If currently shifting and vehicle speed dropped further into a lower gear:
    // merge the shift into the lower target gear without extending or resetting the shift timer!
    if (this.isShifting && wantsDownshift) {
      this.currentGear = prospectiveDownshiftGear;
    } else if (!this.isShifting && this.shiftCooldown <= 0 && this.currentGear >= 1) {
      const minSpeedMet = speedMph >= upshiftMinSpeeds[this.currentGear];
      if (this.currentRpm >= this.tuning.shiftUpRpm && this.currentGear < 5 && minSpeedMet) {
        this.currentGear++;
        this.isShifting = true;
        this.shiftTimer = this.tuning.shiftTimeMs / 1000;
        this.shiftCooldown = 0.20;
      } else if (wantsDownshift) {
        // Execute single merged downshift directly to target gear (allows skipping 3->1 or 5->3)
        this.currentGear = prospectiveDownshiftGear;
        this.isShifting = true;
        this.shiftTimer = this.tuning.shiftTimeMs / 1000;
        this.shiftCooldown = 0.20;
      }
    }

    this.currentRpm = THREE.MathUtils.clamp(this.currentRpm, this.tuning.idleRpm, this.tuning.revLimiterRpm);
    this.currentTorqueMult = this.getEngineTorqueMultiplier(this.currentRpm);
  }

  /**
   * Called on render frame to sync Three.js meshes.
   * V5: Applies body pitch (dive/squat), body roll (cornering/slide lean), and wheel droop.
   */
  public updateVisuals(inputs: VehicleInputs, frameDt: number = 1 / 60): void {
    if (!this.chassisBody) return;

    const trans = this.chassisBody.translation();
    const rot = this.chassisBody.rotation();

    const chassisQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const chassisPos = new THREE.Vector3(trans.x, trans.y, trans.z);

    const exag = this.tuning.bodyMotionExaggeration;

    // Visual pitch offset:
    // Under acceleration (smoothedLongitudinalG > 0), rear squats (nose pitches up, positive X rotation).
    // Under braking (smoothedLongitudinalG < 0), nose dives (negative X rotation).
    // Straight braking in rally car is kept relatively level (~1.0° - 1.5°).
    let targetPitchDeg = 0;
    if (this.smoothedLongitudinalG > 0) {
      targetPitchDeg = this.smoothedLongitudinalG * this.tuning.visualSquatScale * exag;
    } else {
      targetPitchDeg = this.smoothedLongitudinalG * this.tuning.visualDiveScale * exag;
    }
    this.currentVisualPitch += (targetPitchDeg - this.currentVisualPitch) * Math.min(1.0, 18.0 * frameDt);

    // Visual roll: derived purely from smoothed lateral G (no steering-key gating).
    // Turning right (smoothedLateralG > 0) rolls the car outward/left (-Z rotation).
    const targetRollDeg = -this.smoothedLateralG * this.tuning.visualRollScale * exag;

    // Rate-limit visual roll change: no per-frame change above 1 deg at 30 fps (<= 30.0 deg/s)
    const maxDeltaRollDeg = 30.0 * frameDt;
    const deltaRollDeg = THREE.MathUtils.clamp(targetRollDeg - this.currentVisualRoll, -maxDeltaRollDeg, maxDeltaRollDeg);
    this.currentVisualRoll += deltaRollDeg;

    const bodyOffsetQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(this.currentVisualPitch),
        0,
        THREE.MathUtils.degToRad(this.currentVisualRoll),
        'YXZ'
      )
    );

    this.chassisMesh.position.copy(chassisPos);
    this.chassisMesh.quaternion.copy(chassisQuat).multiply(bodyOffsetQuat);

    // Normal forces and axle load totals for symmetric load-driven droop
    const fzFL = this.wheelNormalForces[0] || 0;
    const fzFR = this.wheelNormalForces[1] || 0;
    const fzRL = this.wheelNormalForces[2] || 0;
    const fzRR = this.wheelNormalForces[3] || 0;
    const frontTotalFz = fzFL + fzFR;
    const rearTotalFz = fzRL + fzRR;
    const totalFz = Math.max(1000, frontTotalFz + rearTotalFz);

    // Pitch unloading (rear axle loses load to front axle under braking/turn-in):
    const pitchUnload = Math.max(0, (frontTotalFz - rearTotalFz) / totalFz);
    const hbUnload = inputs.handbrake ? 0.65 : 0.0;
    const rearAvgFz = (fzRL + fzRR) * 0.5;
    const wheelUnload = THREE.MathUtils.clamp((2893 - rearAvgFz) / 2893, 0, 1.0);

    // Symmetric rear wheel droop driven purely by load reduction (no state gating)
    const targetDroopRatio = THREE.MathUtils.clamp(
      wheelUnload * 0.25 + pitchUnload * 0.35 + hbUnload,
      0,
      1.0
    );
    const targetRearDroop = targetDroopRatio * this.tuning.visualDroopExtension * exag;

    // Sync 4 wheels
    for (let i = 0; i < 4; i++) {
      const wheelMesh = this.wheelMeshes[i];
      if (!wheelMesh) continue;

      const localAnchor = this.wheelAnchors[i];
      const suspLen = this.currentSuspensionLengths[i];

      let visualDroop = 0;
      const isRearWheel = i >= 2;
      if (isRearWheel) {
        const currentDroop = this.lastVisualDroop[i] || 0;
        visualDroop = currentDroop + (targetRearDroop - currentDroop) * Math.min(1.0, 15.0 * frameDt);
      }
      this.lastVisualDroop[i] = visualDroop;
      const effectiveSuspLen = suspLen + visualDroop;

      const localWheelPos = new THREE.Vector3(localAnchor.x, localAnchor.y - effectiveSuspLen, localAnchor.z);
      localWheelPos.applyQuaternion(chassisQuat);
      wheelMesh.position.copy(chassisPos).add(localWheelPos);

      // Rotation: chassisQuat * steerQuat * spinQuat
      const isFront = i < 2;
      const steer = isFront ? this.currentSteer : 0;
      const wheelRot = this.wheelRotations[i];

      wheelMesh.quaternion.copy(chassisQuat);
      const steerQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steer);
      const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), wheelRot);
      wheelMesh.quaternion.multiply(steerQuat).multiply(rollQuat);
    }

    // Dynamic Brake Rotor Thermal Heating & Incandescent Glow
    const linvel = this.chassisBody.linvel();
    const speedMph = Math.hypot(linvel.x, linvel.y, linvel.z) * 2.23694;

    for (let i = 0; i < 4; i++) {
      const isWheelBraking = (inputs.brake > 0.05) || (i >= 2 && inputs.handbrake);
      if (isWheelBraking && speedMph > 3.0) {
        // Heating proportional to braking input and velocity
        const heatGen = (inputs.brake * 0.8 + (i >= 2 && inputs.handbrake ? 0.9 : 0.0)) * (speedMph / 60.0) * 190.0 * frameDt;
        this.brakeRotorTemps[i] = Math.min(850.0, this.brakeRotorTemps[i] + heatGen);
      } else {
        // Convective cooling: faster cooling at higher vehicle airflow
        const coolingRate = 18.0 + speedMph * 0.65;
        this.brakeRotorTemps[i] = Math.max(20.0, this.brakeRotorTemps[i] - coolingRate * frameDt);
      }

      // Modulate emissive glow: above 220°C begins dull orange, reaching incandescent cherry red at 650°C+
      const mat = this.brakeRotorMats[i];
      if (mat) {
        const temp = this.brakeRotorTemps[i];
        if (temp > 220.0) {
          const frac = THREE.MathUtils.clamp((temp - 220.0) / 480.0, 0, 1.0);
          mat.emissive.setRGB(frac * 1.0, frac * 0.16, 0.0);
          mat.emissiveIntensity = frac * 2.2;
        } else {
          mat.emissiveIntensity = 0.0;
        }
      }
    }

    // Brake lights: basic material switches color + PointLight + Bloom Sprites for visible glow in render
    const isBraking = inputs.brake > 0.05 || inputs.handbrake;
    if (this.brakeLightMat) {
      this.brakeLightMat.color.setHex(isBraking ? 0xff1500 : 0x550000);
    }
    if (this.brakeLightGlowMat) {
      this.brakeLightGlowMat.emissiveIntensity = isBraking ? 5.0 : 0.0;
      this.brakeLightGlowMat.color.setHex(isBraking ? 0xff1500 : 0x550000);
      this.brakeLightGlowMat.emissive.setHex(isBraking ? 0xff1500 : 0x550000);
      this.brakeLightGlowMat.opacity = isBraking ? 0.95 : 0.0;
    }
    if (this.brakeLightPL) {
      this.brakeLightPL.intensity = isBraking ? 15.0 : 0.0;
    }
    if (this.brakeLightSpriteL && this.brakeLightSpriteR) {
      this.brakeLightSpriteL.material.opacity = isBraking ? 0.95 : 0.0;
      this.brakeLightSpriteR.material.opacity = isBraking ? 0.95 : 0.0;
    }
  }

  /**
   * Lane 2 contract: physical suspension and chassis state for Lane 3 (body motion, camera). See SuspensionState.ts for
   * units and sign conventions. Reads physics state only; never reads or writes visual offsets.
   */
  public getSuspensionState(): SuspensionState {
    const tn = this.tuning;
    const wheels = [0, 1, 2, 3].map((i) => {
      const rest = i >= 2 && tn.suspensionRestLengthRear !== undefined ? tn.suspensionRestLengthRear : tn.suspensionRestLength;
      const len = this.currentSuspensionLengths[i];
      return {
        travel: rest - len,
        travelVelocity: this.suspTravelVelocity[i],
        normalForce: this.wheelNormalForces[i],
        grounded: this.wheelInContact[i],
        droopFromStatic: len - SUSPENSION_STATIC_LENGTH,
      };
    }) as SuspensionState['wheels'];

    let pitchDeg = 0;
    let rollDeg = 0;
    if (this.chassisBody) {
      const r = this.chassisBody.rotation();
      const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const rgt = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      pitchDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)));
      rollDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(rgt.y, -1, 1)));
    }

    return {
      wheels,
      chassis: {
        heave: (wheels[0].droopFromStatic + wheels[1].droopFromStatic + wheels[2].droopFromStatic + wheels[3].droopFromStatic) / 4,
        pitchDeg,
        rollDeg,
        lateralG: this.smoothedLateralG,
        longitudinalG: this.smoothedLongitudinalG,
      },
      staticLength: SUSPENSION_STATIC_LENGTH,
    };
  }

  public getVisualPitchDeg(): number {
    return this.currentVisualPitch;
  }

  public getVisualRollDeg(): number {
    return this.currentVisualRoll;
  }

  public resetPosition(): void {
    if (!this.chassisBody) return;
    this.chassisBody.setTranslation({ x: 0, y: 0.6593, z: -8 }, true);
    this.chassisBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.currentSteer = 0;
    this.isDrifting = false;
    this.driftAngleDeg = 0;
    this.driftStateTransitions = 0;
    this.prevChassisVel.set(0, 0, 0);
    this.currentGear = 1;
    this.drivingDirectionMode = 'forward';
    this.reverseEngageTimer = 0;
    this.smoothedLongitudinalG = 0;
    this.smoothedLateralG = 0;
    this.currentVisualPitch = 0;
    this.currentVisualRoll = 0;
    this.droopTransient = 0;
    this.lastVisualDroop = [0, 0, 0, 0];
    this.currentRpm = this.tuning.idleRpm;
    this.isShifting = false;
    this.shiftTimer = 0;
    this.shiftCooldown = 0;
    this.currentTorqueMult = 1.0;
    for (let i = 0; i < 4; i++) {
      this.prevSuspensionLengths[i] = 0.2593;
      this.currentSuspensionLengths[i] = 0.2593;
      this.wheelInContact[i] = true;
      this.prevWheelInContact[i] = true;
      this.wheelAngularVel[i] = 0;
      this.wheelRotations[i] = 0;
      this.lastFrictionEllipseUsage[i] = 0;
      this.lastGroundSpeedsMph[i] = 0;
      this.lastWheelSpeedsMph[i] = 0;
    }
  }

  // =========================================================================
  // CAD PROCEDURAL RE-SCULPTED MESH GENERATORS (FIA APX-SPEC-FINAL-001)
  // =========================================================================

  private createSculptedLowerBody(bodyMat: THREE.Material): THREE.Mesh {
    const zStations = [
      -1.95, -1.82, -1.65, -1.45, -1.35, -1.25, -1.05, -0.75,
      -0.50, -0.25,  0.00,  0.25,  0.50,  0.75,  1.05,  1.25,
       1.35,  1.45,  1.65,  1.82,  1.95
    ];

    interface StationProfile {
      z: number;
      xSill: number;
      xWaist: number;
      xBelt: number;
      yFloor: number;
      ySill: number;
      yWaist: number;
      yBelt: number;
    }

    const profiles: StationProfile[] = zStations.map(z => {
      let xSill = 0.85;
      let xWaist = 0.86;
      let xBelt = 0.85;
      let yFloor = 0.02;
      let ySill = 0.04;
      let yWaist = 0.22;
      let yBelt = 0.44;

      if (z >= 0.95 && z <= 1.75) {
        // Front wheel well recess: indent inner tub to |X| <= 0.48m across entire wheelhouse span.
        // Guarantees >= 35.8mm lateral clearance to tire inboard edge (|X| >= 0.516m at full +/-32° steer)
        // and >= 79.3mm vertical clearance to tire top at 120mm bump (yWaist = 0.24m > yTire = 0.1607m).
        xSill = 0.48;
        xWaist = 0.48;
        xBelt = 0.85;
        yFloor = 0.00;
        ySill = 0.02;
        yWaist = 0.24;
        yBelt = 0.42;
      } else if (z <= -0.95 && z >= -1.75) {
        // Rear wheel well recess: indent inner tub to |X| <= 0.62m across entire rear wheelhouse span.
        // Guarantees >= 60.0mm lateral clearance to tire inboard edge (|X| = 0.68m) and vertical clearance (yWaist = 0.24m).
        xSill = 0.62;
        xWaist = 0.62;
        xBelt = 0.86;
        yFloor = 0.00;
        ySill = 0.02;
        yWaist = 0.24;
        yBelt = 0.48;
      } else if (z > -0.75 && z < 0.75) {
        // Cabin door section with coke-bottle tuck
        const u = Math.abs(z) / 0.75;
        xSill = THREE.MathUtils.lerp(0.840, 0.865, u);
        xWaist = THREE.MathUtils.lerp(0.845, 0.875, u);
        xBelt = THREE.MathUtils.lerp(0.835, 0.860, u);
        yBelt = THREE.MathUtils.lerp(0.46, 0.44, u);
      } else if (z > 1.75) {
        // Front nose taper
        const u = (z - 1.75) / 0.20;
        xSill = THREE.MathUtils.lerp(0.85, 0.86, u);
        xWaist = THREE.MathUtils.lerp(0.86, 0.86, u);
        xBelt = THREE.MathUtils.lerp(0.85, 0.86, u);
        yBelt = THREE.MathUtils.lerp(0.42, 0.34, u);
      } else if (z < -1.75) {
        // Rear valance taper
        const u = (-1.75 - z) / 0.20;
        xSill = THREE.MathUtils.lerp(0.86, 0.865, u);
        xWaist = THREE.MathUtils.lerp(0.88, 0.865, u);
        xBelt = THREE.MathUtils.lerp(0.86, 0.865, u);
        yBelt = THREE.MathUtils.lerp(0.48, 0.44, u);
      }

      return { z, xSill, xWaist, xBelt, yFloor, ySill, yWaist, yBelt };
    });

    const numPts = 8;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const zMin = zStations[0];
    const zMax = zStations[zStations.length - 1];

    profiles.forEach(p => {
      const u = (p.z - zMin) / (zMax - zMin);
      const ring = [
        [0, p.yFloor, p.z, 0.5, 0.0],
        [p.xSill, p.ySill, p.z, 0.65, 0.15],
        [p.xWaist, p.yWaist, p.z, 0.80, 0.50],
        [p.xBelt, p.yBelt, p.z, 0.95, 0.90],
        [0, p.yBelt + 0.02, p.z, 0.5, 1.0],
        [-p.xBelt, p.yBelt, p.z, 0.05, 0.90],
        [-p.xWaist, p.yWaist, p.z, 0.20, 0.50],
        [-p.xSill, p.ySill, p.z, 0.35, 0.15],
      ];
      for (const pt of ring) {
        positions.push(pt[0], pt[1], pt[2]);
        uvs.push(u, pt[4]);
      }
    });

    for (let s = 0; s < profiles.length - 1; s++) {
      const r0 = s * numPts;
      const r1 = (s + 1) * numPts;
      for (let i = 0; i < numPts; i++) {
        const next = (i + 1) % numPts;
        indices.push(r0 + i, r0 + next, r1 + next);
        indices.push(r0 + i, r1 + next, r1 + i);
      }
    }

    const rearCenterIdx = positions.length / 3;
    const pRear = profiles[0];
    positions.push(0, (pRear.yFloor + pRear.yBelt) / 2, pRear.z);
    uvs.push(0, 0.5);
    for (let i = 0; i < numPts; i++) {
      const next = (i + 1) % numPts;
      indices.push(rearCenterIdx, i, next);
    }

    const frontCenterIdx = positions.length / 3;
    const pFront = profiles[profiles.length - 1];
    positions.push(0, (pFront.yFloor + pFront.yBelt) / 2, pFront.z);
    uvs.push(1, 0.5);
    const rLast = (profiles.length - 1) * numPts;
    for (let i = 0; i < numPts; i++) {
      const next = (i + 1) % numPts;
      indices.push(frontCenterIdx, rLast + next, rLast + i);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, bodyMat);
    mesh.castShadow = true;
    return mesh;
  }

  private createSculptedRockerSill(sx: number, trimMat: THREE.Material): THREE.Mesh {
    const zStart = -0.76;
    const zEnd = 0.80;
    const nSegs = 10;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const width = 0.07;
    const yBottom = 0.00;
    const yTop = 0.12;

    for (let j = 0; j <= nSegs; j++) {
      const t = j / nSegs;
      const z = THREE.MathUtils.lerp(zStart, zEnd, t);
      const uZ = (z - 0.02) / 0.78;
      const xOuter = sx * (0.845 + 0.025 * (uZ * uZ));
      const xInner = xOuter - sx * width;

      positions.push(xOuter, yBottom, z); uvs.push(0, t);
      positions.push(xOuter, yTop, z);    uvs.push(0.33, t);
      positions.push(xInner, yTop, z);    uvs.push(0.66, t);
      positions.push(xInner, yBottom, z); uvs.push(1.0, t);
    }

    for (let j = 0; j < nSegs; j++) {
      const s0 = j * 4;
      const s1 = (j + 1) * 4;
      indices.push(s0 + 0, s1 + 0, s1 + 1);
      indices.push(s0 + 0, s1 + 1, s0 + 1);
      indices.push(s0 + 1, s1 + 1, s1 + 2);
      indices.push(s0 + 1, s1 + 2, s0 + 2);
      indices.push(s0 + 2, s1 + 2, s1 + 3);
      indices.push(s0 + 2, s1 + 3, s0 + 3);
      indices.push(s0 + 3, s1 + 3, s1 + 0);
      indices.push(s0 + 3, s1 + 0, s0 + 0);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, trimMat);
    mesh.castShadow = true;
    return mesh;
  }

  private createDoorAccentStripe(sx: number, liveryMat: THREE.Material): THREE.Mesh {
    const zStart = -0.74;
    const zEnd = 0.74;
    const nSegs = 8;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const yCenter = 0.16;
    const halfH = 0.035;

    for (let j = 0; j <= nSegs; j++) {
      const t = j / nSegs;
      const z = THREE.MathUtils.lerp(zStart, zEnd, t);
      const uZ = z / 0.74;
      const x = sx * (0.848 + 0.025 * (uZ * uZ));

      positions.push(x, yCenter - halfH, z); uvs.push(0, t);
      positions.push(x, yCenter + halfH, z); uvs.push(1, t);
    }

    for (let j = 0; j < nSegs; j++) {
      const s0 = j * 2;
      const s1 = (j + 1) * 2;
      if (sx > 0) {
        indices.push(s0 + 0, s1 + 0, s1 + 1);
        indices.push(s0 + 0, s1 + 1, s0 + 1);
      } else {
        indices.push(s0 + 0, s1 + 1, s1 + 0);
        indices.push(s0 + 0, s0 + 1, s1 + 1);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    return new THREE.Mesh(geom, liveryMat);
  }

  private createSolidDoor(isRight: boolean, bodyMat: THREE.Material, trimMat: THREE.Material, glassMat: THREE.Material, liveryMat: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    const sgn = isRight ? 1 : -1;
    const zRear = -0.74;
    const zFront = 0.74;
    const nZ = 8;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const getWaistX = (z: number) => {
      const uZ = z / 0.74;
      return sgn * (0.845 + 0.025 * (uZ * uZ));
    };

    // 6 profile points per station
    for (let j = 0; j <= nZ; j++) {
      const t = j / nZ;
      const z = THREE.MathUtils.lerp(zRear, zFront, t);
      const baseX = getWaistX(z);

      const pts = [
        [baseX, 0.04, z],                          // 0: sill
        [baseX + sgn * 0.006, 0.16, z],            // 1: lower door
        [baseX + sgn * 0.016, 0.28, z],            // 2: swage line crease
        [baseX + sgn * 0.010, 0.38, z],            // 3: upper door
        [baseX, 0.44, z],                          // 4: beltline
        [baseX - sgn * 0.080, 0.44, z],            // 5: inner door ledge
      ];

      for (let k = 0; k < pts.length; k++) {
        positions.push(pts[k][0], pts[k][1], pts[k][2]);
        uvs.push(t, k / (pts.length - 1));
      }
    }

    const numPerStation = 6;
    for (let j = 0; j < nZ; j++) {
      const col0 = j * numPerStation;
      const col1 = (j + 1) * numPerStation;
      for (let k = 0; k < numPerStation - 1; k++) {
        const p00 = col0 + k;
        const p01 = col0 + k + 1;
        const p10 = col1 + k;
        const p11 = col1 + k + 1;
        if (isRight) {
          indices.push(p00, p01, p11);
          indices.push(p00, p11, p10);
        } else {
          indices.push(p00, p11, p01);
          indices.push(p00, p10, p11);
        }
      }
    }

    // Rear end cap (shutline border at z = -0.74)
    const rearCapCenter = positions.length / 3;
    positions.push(getWaistX(zRear) - sgn * 0.04, 0.24, zRear);
    uvs.push(0, 0.5);
    for (let k = 0; k < numPerStation - 1; k++) {
      if (isRight) {
        indices.push(rearCapCenter, k + 1, k);
      } else {
        indices.push(rearCapCenter, k, k + 1);
      }
    }

    // Front end cap (shutline border at z = +0.74)
    const frontCol = nZ * numPerStation;
    const frontCapCenter = positions.length / 3;
    positions.push(getWaistX(zFront) - sgn * 0.04, 0.24, zFront);
    uvs.push(1, 0.5);
    for (let k = 0; k < numPerStation - 1; k++) {
      if (isRight) {
        indices.push(frontCapCenter, frontCol + k, frontCol + k + 1);
      } else {
        indices.push(frontCapCenter, frontCol + k + 1, frontCol + k);
      }
    }

    const doorGeom = new THREE.BufferGeometry();
    doorGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    doorGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    doorGeom.setIndex(indices);
    doorGeom.computeVertexNormals();

    const doorSkinMesh = new THREE.Mesh(doorGeom, bodyMat);
    doorSkinMesh.castShadow = true;
    group.add(doorSkinMesh);

    // Competition rally plate decal on door skin
    const decalCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    let decalTex: THREE.CanvasTexture | null = null;
    if (decalCanvas) {
      decalCanvas.width = 512;
      decalCanvas.height = 256;
      const dctx = decalCanvas.getContext('2d');
      if (dctx) {
        dctx.fillStyle = '#f8fafc';
        dctx.fillRect(0, 0, 512, 256);
        dctx.strokeStyle = '#0f172a';
        dctx.lineWidth = 10;
        dctx.strokeRect(6, 6, 500, 244);

        // Red competition header
        dctx.fillStyle = '#dc2626';
        dctx.fillRect(10, 10, 492, 48);
        dctx.fillStyle = '#ffffff';
        dctx.font = 'bold 26px sans-serif';
        dctx.textAlign = 'center';
        dctx.textBaseline = 'middle';
        dctx.fillText('007 RACING • GROUP B', 256, 34);

        // Bold APEX RALLY
        dctx.fillStyle = '#0f172a';
        dctx.font = '900 52px sans-serif';
        dctx.fillText('APEX', 256, 110);
        dctx.font = 'bold 36px sans-serif';
        dctx.fillText('RALLY', 256, 156);

        // Homologation code
        dctx.font = 'bold 22px monospace';
        dctx.fillStyle = '#475569';
        dctx.fillText('768MLE T1986', 256, 214);
        decalTex = new THREE.CanvasTexture(decalCanvas);
      }
    }
    const decalMat = decalTex
      ? new THREE.MeshBasicMaterial({ map: decalTex })
      : liveryMat;
    const decalMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), decalMat);
    decalMesh.position.set(getWaistX(-0.05) + sgn * 0.018, 0.28, -0.05);
    decalMesh.rotation.y = isRight ? Math.PI / 2 : -Math.PI / 2;
    group.add(decalMesh);

    // Recessed door handle pocket and silver pull lever
    const handlePocket = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.14), trimMat);
    handlePocket.position.set(getWaistX(-0.15) + sgn * 0.008, 0.38, -0.15);
    group.add(handlePocket);

    const handleBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.018, 0.10),
      new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.25, metalness: 0.85 })
    );
    handleBar.position.set(getWaistX(-0.15) + sgn * 0.012, 0.38, -0.15);
    group.add(handleBar);

    // B-pillar post in satin black
    const bPillar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.40, 0.05), trimMat);
    bPillar.position.set(sgn * 0.665, 0.63, -0.32);
    group.add(bPillar);

    // Window top roof-rail frame in satin black
    const windowRail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1.12), trimMat);
    windowRail.position.set(sgn * 0.655, 0.835, -0.18);
    group.add(windowRail);

    // Tinted door window glass
    const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.37, 0.64), glassMat);
    doorGlass.position.set(sgn * 0.670, 0.63, 0.04);
    doorGlass.castShadow = true;
    group.add(doorGlass);
    this.cockpitObscuringMeshes.push(doorGlass);

    // Tinted triangular rear quarter window glass
    const quarterGlass = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.34, 0.38), glassMat);
    quarterGlass.position.set(sgn * 0.665, 0.62, -0.52);
    quarterGlass.castShadow = true;
    group.add(quarterGlass);
    this.cockpitObscuringMeshes.push(quarterGlass);

    // Lower rocker accent / side exhaust outlet
    const rockerAccent = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.42), trimMat);
    rockerAccent.position.set(getWaistX(-0.10) + sgn * 0.005, 0.06, -0.10);
    group.add(rockerAccent);

    return group;
  }

  private createSolidFrontFender(isRight: boolean, bodyMat: THREE.Material, trimMat: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    const sgn = isRight ? 1 : -1;
    const zAxle = 1.35;
    const yCenter = 0.05;
    const rIn = 0.395;
    const numSegs = 12;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const xPeak = sgn * 0.940;
    const xLip = sgn * 0.920;
    const xHood = sgn * 0.740;

    // Wheel arch flare face
    for (let k = 0; k <= numSegs; k++) {
      const theta = (k * Math.PI) / numSegs;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const zIn = zAxle + rIn * cosT;
      const yIn = yCenter + rIn * sinT;

      const zMid = zAxle + (rIn + 0.05) * cosT;
      const yMid = yCenter + (rIn + 0.05) * sinT;

      const zTop = zIn;
      const uZ = (zIn - 0.74) / (1.95 - 0.74);
      const yTop = THREE.MathUtils.lerp(0.44, 0.36, uZ);

      positions.push(xLip, yIn, zIn);                  uvs.push(k / numSegs, 0.0);
      positions.push(xPeak, yMid, zMid);               uvs.push(k / numSegs, 0.5);
      positions.push(xHood, yTop, zTop);               uvs.push(k / numSegs, 1.0);
    }

    for (let k = 0; k < numSegs; k++) {
      const v0 = k * 3;
      const v1 = (k + 1) * 3;
      if (isRight) {
        indices.push(v0 + 0, v1 + 0, v1 + 1);
        indices.push(v0 + 0, v1 + 1, v0 + 1);
        indices.push(v0 + 1, v1 + 1, v1 + 2);
        indices.push(v0 + 1, v1 + 2, v0 + 2);
      } else {
        indices.push(v0 + 0, v1 + 1, v1 + 0);
        indices.push(v0 + 0, v0 + 1, v1 + 1);
        indices.push(v0 + 1, v1 + 2, v1 + 1);
        indices.push(v0 + 1, v0 + 2, v1 + 2);
      }
    }

    // Forward solid panel to front bumper (z = 1.75 to 1.95)
    const idxFrontBumper = positions.length / 3;
    positions.push(sgn * 0.880, 0.06, 1.95);  uvs.push(0, 0.0);
    positions.push(sgn * 0.880, 0.24, 1.95);  uvs.push(0, 0.5);
    positions.push(xHood, 0.36, 1.95);        uvs.push(0, 1.0);

    const f0 = 0; const f1 = 1; const f2 = 2;
    if (isRight) {
      indices.push(f0, idxFrontBumper, f1);
      indices.push(f1, idxFrontBumper, idxFrontBumper + 1);
      indices.push(f1, idxFrontBumper + 1, f2);
      indices.push(f2, idxFrontBumper + 1, idxFrontBumper + 2);
    } else {
      indices.push(f0, f1, idxFrontBumper);
      indices.push(f1, idxFrontBumper + 1, idxFrontBumper);
      indices.push(f1, f2, idxFrontBumper + 1);
      indices.push(f2, idxFrontBumper + 2, idxFrontBumper + 1);
    }

    // Aft solid panel to door shutline (z = 0.95 to 0.74)
    const idxDoorJoin = positions.length / 3;
    positions.push(sgn * 0.870, 0.04, 0.74);  uvs.push(1, 0.0);
    positions.push(sgn * 0.870, 0.24, 0.74);  uvs.push(1, 0.5);
    positions.push(xHood, 0.44, 0.74);        uvs.push(1, 1.0);

    const r0 = numSegs * 3 + 0;
    const r1 = numSegs * 3 + 1;
    const r2 = numSegs * 3 + 2;
    if (isRight) {
      indices.push(r0, r1, idxDoorJoin);
      indices.push(r1, idxDoorJoin + 1, idxDoorJoin);
      indices.push(r1, r2, idxDoorJoin + 1);
      indices.push(r2, idxDoorJoin + 2, idxDoorJoin + 1);
    } else {
      indices.push(r0, idxDoorJoin, r1);
      indices.push(r1, idxDoorJoin, idxDoorJoin + 1);
      indices.push(r1, idxDoorJoin + 1, r2);
      indices.push(r2, idxDoorJoin + 1, idxDoorJoin + 2);
    }

    const fenderGeom = new THREE.BufferGeometry();
    fenderGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    fenderGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    fenderGeom.setIndex(indices);
    fenderGeom.computeVertexNormals();

    const fenderMesh = new THREE.Mesh(fenderGeom, bodyMat);
    fenderMesh.castShadow = true;
    group.add(fenderMesh);

    // Inner wheel liner
    const linerPos: number[] = [];
    const linerIndices: number[] = [];
    for (let k = 0; k <= numSegs; k++) {
      const theta = (k * Math.PI) / numSegs;
      const zIn = zAxle + rIn * Math.cos(theta);
      const yIn = yCenter + rIn * Math.sin(theta);
      linerPos.push(xLip, yIn, zIn);
      linerPos.push(sgn * 0.48, yIn, zIn);
    }
    for (let k = 0; k < numSegs; k++) {
      const l0 = k * 2;
      const l1 = (k + 1) * 2;
      if (isRight) {
        linerIndices.push(l0 + 0, l1 + 0, l1 + 1);
        linerIndices.push(l0 + 0, l1 + 1, l0 + 1);
      } else {
        linerIndices.push(l0 + 0, l1 + 1, l1 + 0);
        linerIndices.push(l0 + 0, l0 + 1, l1 + 1);
      }
    }
    const linerGeom = new THREE.BufferGeometry();
    linerGeom.setAttribute('position', new THREE.Float32BufferAttribute(linerPos, 3));
    linerGeom.setIndex(linerIndices);
    linerGeom.computeVertexNormals();
    const linerMesh = new THREE.Mesh(linerGeom, trimMat);
    group.add(linerMesh);

    // Amber side repeater indicator lamp
    const repeater = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.03, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.5 })
    );
    repeater.position.set(sgn * 0.935, 0.28, 1.70);
    group.add(repeater);

    return group;
  }

  private createFrontFenderLedge(isRight: boolean, bodyMat: THREE.Material): THREE.Mesh {
    const sgn = isRight ? 1 : -1;
    const xInner = sgn * 0.740;
    const xOuter = sgn * 0.850;
    const zStart = 0.80;
    const zEnd = 1.85;
    const nSegs = 12;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let k = 0; k <= nSegs; k++) {
      const t = k / nSegs;
      const z = THREE.MathUtils.lerp(zStart, zEnd, t);

      // Inner edge aligns with hood shutline elevation
      const yIn = 0.42 - (z - 1.28) * 0.04;

      // Outer edge conforms to the blister arch flare shoulder
      let yOut = yIn;
      const dz = z - 1.35;
      if (Math.abs(dz) < 0.475) {
        const sinT = Math.sqrt(1 - (dz / 0.475) * (dz / 0.475));
        const yArch = Math.min(0.46, 0.05 + 0.475 * sinT);
        yOut = Math.max(yIn, yArch);
      }

      positions.push(xInner, yIn, z);
      uvs.push(0, t);

      positions.push(xOuter, yOut, z);
      uvs.push(1, t);
    }

    for (let k = 0; k < nSegs; k++) {
      const v0 = k * 2;
      const v1 = (k + 1) * 2;
      if (isRight) {
        indices.push(v0 + 0, v1 + 1, v0 + 1);
        indices.push(v0 + 0, v1 + 0, v1 + 1);
      } else {
        indices.push(v0 + 0, v0 + 1, v1 + 1);
        indices.push(v0 + 0, v1 + 1, v1 + 0);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const ledgeMesh = new THREE.Mesh(geom, bodyMat);
    ledgeMesh.castShadow = true;
    return ledgeMesh;
  }

  private createSolidRearQuarter(isRight: boolean, bodyMat: THREE.Material, trimMat: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    const sgn = isRight ? 1 : -1;
    const zAxle = -1.35;
    const yCenter = 0.05;
    const rIn = 0.395;
    const numSegs = 12;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const xPeak = sgn * 0.950;
    const xLip = sgn * 0.930;
    const xDeck = sgn * 0.710;

    // Wheel arch flare face
    for (let k = 0; k <= numSegs; k++) {
      const theta = (k * Math.PI) / numSegs;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const zIn = zAxle + rIn * cosT;
      const yIn = yCenter + rIn * sinT;

      const zMid = zAxle + (rIn + 0.06) * cosT;
      const yMid = yCenter + (rIn + 0.06) * sinT;

      const zTop = zIn;
      const yTop = 0.48;

      positions.push(xLip, yIn, zIn);                  uvs.push(k / numSegs, 0.0);
      positions.push(xPeak, yMid, zMid);               uvs.push(k / numSegs, 0.5);
      positions.push(xDeck, yTop, zTop);               uvs.push(k / numSegs, 1.0);
    }

    for (let k = 0; k < numSegs; k++) {
      const v0 = k * 3;
      const v1 = (k + 1) * 3;
      if (isRight) {
        indices.push(v0 + 0, v1 + 0, v1 + 1);
        indices.push(v0 + 0, v1 + 1, v0 + 1);
        indices.push(v0 + 1, v1 + 1, v1 + 2);
        indices.push(v0 + 1, v1 + 2, v0 + 2);
      } else {
        indices.push(v0 + 0, v1 + 1, v1 + 0);
        indices.push(v0 + 0, v0 + 1, v1 + 1);
        indices.push(v0 + 1, v1 + 2, v1 + 1);
        indices.push(v0 + 1, v0 + 2, v1 + 2);
      }
    }

    // Forward solid panel to door shutline (z = -0.95 to -0.74)
    const f0 = 0; const f1 = 1; const f2 = 2;
    const idxDoorJoin = positions.length / 3;
    positions.push(sgn * 0.870, 0.04, -0.74); uvs.push(0, 0.0);
    positions.push(sgn * 0.870, 0.24, -0.74); uvs.push(0, 0.5);
    positions.push(xDeck, 0.46, -0.74);       uvs.push(0, 1.0);

    if (isRight) {
      indices.push(f0, idxDoorJoin, f1);
      indices.push(f1, idxDoorJoin, idxDoorJoin + 1);
      indices.push(f1, idxDoorJoin + 1, f2);
      indices.push(f2, idxDoorJoin + 1, idxDoorJoin + 2);
    } else {
      indices.push(f0, f1, idxDoorJoin);
      indices.push(f1, idxDoorJoin + 1, idxDoorJoin);
      indices.push(f1, f2, idxDoorJoin + 1);
      indices.push(f2, idxDoorJoin + 2, idxDoorJoin + 1);
    }

    // Rearward solid panel to rear bumper (z = -1.75 to -1.95)
    const r0 = numSegs * 3 + 0;
    const r1 = numSegs * 3 + 1;
    const r2 = numSegs * 3 + 2;
    const idxRearJoin = positions.length / 3;
    positions.push(sgn * 0.880, 0.06, -1.95); uvs.push(1, 0.0);
    positions.push(sgn * 0.880, 0.26, -1.95); uvs.push(1, 0.5);
    positions.push(xDeck, 0.46, -1.95);       uvs.push(1, 1.0);

    if (isRight) {
      indices.push(r0, r1, idxRearJoin);
      indices.push(r1, idxRearJoin + 1, idxRearJoin);
      indices.push(r1, r2, idxRearJoin + 1);
      indices.push(r2, idxRearJoin + 2, idxRearJoin + 1);
    } else {
      indices.push(r0, idxRearJoin, r1);
      indices.push(r1, idxRearJoin, idxRearJoin + 1);
      indices.push(r1, idxRearJoin + 1, r2);
      indices.push(r2, idxRearJoin + 1, idxRearJoin + 2);
    }

    const quarterGeom = new THREE.BufferGeometry();
    quarterGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    quarterGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    quarterGeom.setIndex(indices);
    quarterGeom.computeVertexNormals();

    const quarterMesh = new THREE.Mesh(quarterGeom, bodyMat);
    quarterMesh.castShadow = true;
    group.add(quarterMesh);

    // Inner wheel liner
    const linerPos: number[] = [];
    const linerIndices: number[] = [];
    for (let k = 0; k <= numSegs; k++) {
      const theta = (k * Math.PI) / numSegs;
      const zIn = zAxle + rIn * Math.cos(theta);
      const yIn = yCenter + rIn * Math.sin(theta);
      linerPos.push(xLip, yIn, zIn);
      linerPos.push(sgn * 0.62, yIn, zIn);
    }
    for (let k = 0; k < numSegs; k++) {
      const l0 = k * 2;
      const l1 = (k + 1) * 2;
      if (isRight) {
        linerIndices.push(l0 + 0, l1 + 0, l1 + 1);
        linerIndices.push(l0 + 0, l1 + 1, l0 + 1);
      } else {
        linerIndices.push(l0 + 0, l1 + 1, l1 + 0);
        linerIndices.push(l0 + 0, l0 + 1, l1 + 1);
      }
    }
    const linerGeom = new THREE.BufferGeometry();
    linerGeom.setAttribute('position', new THREE.Float32BufferAttribute(linerPos, 3));
    linerGeom.setIndex(linerIndices);
    linerGeom.computeVertexNormals();
    const linerMesh = new THREE.Mesh(linerGeom, trimMat);
    group.add(linerMesh);

    // Ram-Air NACA Intake Scoop on top shoulder
    const nacaHousing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.24), trimMat);
    nacaHousing.position.set(sgn * 0.76, 0.50, -0.85);
    group.add(nacaHousing);

    const nacaMouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.03, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x0a0a0a })
    );
    nacaMouth.position.set(sgn * 0.76, 0.50, -0.73);
    group.add(nacaMouth);

    // Protective matte black stone guard film on forward flare face
    const stoneGuard = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.22, 0.16), trimMat);
    stoneGuard.position.set(sgn * 0.945, 0.20, -0.82);
    group.add(stoneGuard);

    return group;
  }

  private createCrownedRoof(bodyMat: THREE.Material): THREE.Mesh {
    const zFront = 0.16;
    const zRear = -0.66;
    const xHalf = 0.65;
    const nZ = 10;
    const nX = 8;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const getTopY = (x: number, z: number) => {
      const uZ = (z - (-0.22)) / 0.44;
      const yLong = 0.900 - 0.038 * (uZ * uZ);
      const uX = x / xHalf;
      const yLat = -0.020 * (uX * uX);
      return yLong + yLat;
    };

    for (let j = 0; j <= nZ; j++) {
      const z = THREE.MathUtils.lerp(zFront, zRear, j / nZ);
      for (let i = 0; i <= nX; i++) {
        const x = THREE.MathUtils.lerp(-xHalf, xHalf, i / nX);
        const y = getTopY(x, z);
        positions.push(x, y, z);
        uvs.push(i / nX, j / nZ);
      }
    }

    const rowSize = nX + 1;
    for (let j = 0; j < nZ; j++) {
      for (let i = 0; i < nX; i++) {
        const p00 = j * rowSize + i;
        const p10 = p00 + 1;
        const p01 = (j + 1) * rowSize + i;
        const p11 = p01 + 1;
        indices.push(p00, p11, p01);
        indices.push(p00, p10, p11);
      }
    }

    const botOffset = positions.length / 3;
    for (let j = 0; j <= nZ; j++) {
      const z = THREE.MathUtils.lerp(zFront, zRear, j / nZ);
      for (let i = 0; i <= nX; i++) {
        const x = THREE.MathUtils.lerp(-xHalf, xHalf, i / nX);
        const y = getTopY(x, z) - 0.035;
        positions.push(x, y, z);
        uvs.push(i / nX, j / nZ);
      }
    }

    for (let j = 0; j < nZ; j++) {
      for (let i = 0; i < nX; i++) {
        const p00 = botOffset + j * rowSize + i;
        const p10 = p00 + 1;
        const p01 = botOffset + (j + 1) * rowSize + i;
        const p11 = p01 + 1;
        indices.push(p00, p01, p11);
        indices.push(p00, p11, p10);
      }
    }

    for (let j = 0; j < nZ; j++) {
      const top0 = j * rowSize;
      const top1 = (j + 1) * rowSize;
      const bot0 = botOffset + j * rowSize;
      const bot1 = botOffset + (j + 1) * rowSize;
      indices.push(top0, bot0, bot1);
      indices.push(top0, bot1, top1);
    }
    for (let j = 0; j < nZ; j++) {
      const top0 = j * rowSize + nX;
      const top1 = (j + 1) * rowSize + nX;
      const bot0 = botOffset + j * rowSize + nX;
      const bot1 = botOffset + (j + 1) * rowSize + nX;
      indices.push(top0, top1, bot1);
      indices.push(top0, bot1, bot0);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const roofMesh = new THREE.Mesh(geom, bodyMat);
    roofMesh.castShadow = true;
    return roofMesh;
  }

  private createCrownedRoofStripe(liveryMat: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    const zFront = 0.15;
    const zRear = -0.65;
    const nSegs = 10;

    const getTopY = (x: number, z: number) => {
      const uZ = (z - (-0.22)) / 0.44;
      const yLong = 0.900 - 0.038 * (uZ * uZ);
      const uX = x / 0.65;
      const yLat = -0.020 * (uX * uX);
      return yLong + yLat + 0.003;
    };

    for (const sx of [-1, 1]) {
      const xIn = sx * 0.06;
      const xOut = sx * 0.22;
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      for (let j = 0; j <= nSegs; j++) {
        const t = j / nSegs;
        const z = THREE.MathUtils.lerp(zFront, zRear, t);
        const y0 = getTopY(xIn, z);
        const y1 = getTopY(xOut, z);
        positions.push(xIn, y0, z);  uvs.push(0, t);
        positions.push(xOut, y1, z); uvs.push(1, t);
      }

      for (let j = 0; j < nSegs; j++) {
        const s0 = j * 2;
        const s1 = (j + 1) * 2;
        if (sx > 0) {
          indices.push(s0 + 0, s1 + 1, s1 + 0);
          indices.push(s0 + 0, s0 + 1, s1 + 1);
        } else {
          indices.push(s0 + 0, s1 + 0, s1 + 1);
          indices.push(s0 + 0, s1 + 1, s0 + 1);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.setIndex(indices);
      geom.computeVertexNormals();

      group.add(new THREE.Mesh(geom, liveryMat));
    }
    return group;
  }

  private createSculptedCPillar(cx: number, bodyMat: THREE.Material): THREE.Mesh {
    const zTop = -0.66;
    const yTop = 0.835;
    const xTop = cx;

    const zBot = -1.58;
    const yBot = 0.50;
    const xBot = cx * 1.14;

    const nSegs = 6;
    const width = 0.22;
    const thickness = 0.10;
    const sgn = cx > 0 ? 1 : -1;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let j = 0; j <= nSegs; j++) {
      const t = j / nSegs;
      const z = THREE.MathUtils.lerp(zTop, zBot, t);
      const y = THREE.MathUtils.lerp(yTop, yBot, t);
      const x = THREE.MathUtils.lerp(xTop, xBot, t);

      positions.push(x, y, z);                           uvs.push(0, t);
      positions.push(x, y - thickness, z);               uvs.push(0.33, t);
      positions.push(x - sgn * width, y - thickness, z); uvs.push(0.66, t);
      positions.push(x - sgn * width, y, z);             uvs.push(1.0, t);
    }

    for (let j = 0; j < nSegs; j++) {
      const s0 = j * 4;
      const s1 = (j + 1) * 4;
      if (cx > 0) {
        indices.push(s0 + 0, s1 + 0, s1 + 1);
        indices.push(s0 + 0, s1 + 1, s0 + 1);
        indices.push(s0 + 1, s1 + 1, s1 + 2);
        indices.push(s0 + 1, s1 + 2, s0 + 2);
        indices.push(s0 + 2, s1 + 2, s1 + 3);
        indices.push(s0 + 2, s1 + 3, s0 + 3);
        indices.push(s0 + 3, s1 + 3, s1 + 0);
        indices.push(s0 + 3, s1 + 0, s0 + 0);
      } else {
        indices.push(s0 + 0, s1 + 1, s1 + 0);
        indices.push(s0 + 0, s0 + 1, s1 + 1);
        indices.push(s0 + 1, s1 + 2, s1 + 1);
        indices.push(s0 + 1, s0 + 2, s1 + 2);
        indices.push(s0 + 2, s1 + 3, s1 + 2);
        indices.push(s0 + 2, s0 + 3, s1 + 3);
        indices.push(s0 + 3, s1 + 0, s1 + 3);
        indices.push(s0 + 3, s0 + 0, s1 + 0);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, bodyMat);
    mesh.castShadow = true;
    return mesh;
  }

  private createContouredWingBlade(trimMat: THREE.Material): THREE.Mesh {
    const span = 1.420;
    const chord = 0.400;
    const zLeading = -1.850;
    const pitchRad = -5.0 * (Math.PI / 180.0);

    const nSpan = 8;
    const nChord = 12;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let j = 0; j <= nChord; j++) {
      const s = j / nChord;
      const zLocal = -s * chord * Math.cos(pitchRad);
      const zWorld = zLeading + zLocal;
      const yPitch = -s * chord * Math.sin(pitchRad);

      const camber = 0.045 * (4 * s * (1 - s));
      const thickness = 0.040 * (4 * s * (1 - s));
      const yUpper = 0.880 + yPitch + camber + thickness * 0.5;

      for (let i = 0; i <= nSpan; i++) {
        const x = THREE.MathUtils.lerp(-span / 2, span / 2, i / nSpan);
        positions.push(x, yUpper, zWorld);
        uvs.push(i / nSpan, s);
      }
    }

    const rowSize = nSpan + 1;
    for (let j = 0; j < nChord; j++) {
      for (let i = 0; i < nSpan; i++) {
        const p00 = j * rowSize + i;
        const p10 = p00 + 1;
        const p01 = (j + 1) * rowSize + i;
        const p11 = p01 + 1;
        indices.push(p00, p11, p01);
        indices.push(p00, p10, p11);
      }
    }

    const lowerOffset = positions.length / 3;
    for (let j = 0; j <= nChord; j++) {
      const s = j / nChord;
      const zLocal = -s * chord * Math.cos(pitchRad);
      const zWorld = zLeading + zLocal;
      const yPitch = -s * chord * Math.sin(pitchRad);

      const camber = 0.045 * (4 * s * (1 - s));
      const thickness = 0.040 * (4 * s * (1 - s));
      const yLower = 0.880 + yPitch + camber - thickness * 0.5;

      for (let i = 0; i <= nSpan; i++) {
        const x = THREE.MathUtils.lerp(-span / 2, span / 2, i / nSpan);
        positions.push(x, yLower, zWorld);
        uvs.push(i / nSpan, s);
      }
    }

    for (let j = 0; j < nChord; j++) {
      for (let i = 0; i < nSpan; i++) {
        const p00 = lowerOffset + j * rowSize + i;
        const p10 = p00 + 1;
        const p01 = lowerOffset + (j + 1) * rowSize + i;
        const p11 = p01 + 1;
        indices.push(p00, p01, p11);
        indices.push(p00, p11, p10);
      }
    }

    for (let i = 0; i < nSpan; i++) {
      const top0 = i;
      const top1 = i + 1;
      const bot0 = lowerOffset + i;
      const bot1 = lowerOffset + i + 1;
      indices.push(top0, bot1, bot0);
      indices.push(top0, top1, bot1);
    }

    const lastRowTop = nChord * rowSize;
    const lastRowBot = lowerOffset + nChord * rowSize;
    for (let i = 0; i < nSpan; i++) {
      const top0 = lastRowTop + i;
      const top1 = lastRowTop + i + 1;
      const bot0 = lastRowBot + i;
      const bot1 = lastRowBot + i + 1;
      indices.push(top0, bot0, bot1);
      indices.push(top0, bot1, top1);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const bladeMesh = new THREE.Mesh(geom, trimMat);
    bladeMesh.castShadow = true;
    return bladeMesh;
  }

  private createSweptPylon(px: number, trimMat: THREE.Material): THREE.Mesh {
    const zBot = -1.75;
    const yBot = 0.48;
    const zTop = -2.02;
    const yTop = 0.86;

    const chordBot = 0.22;
    const chordTop = 0.18;
    const width = 0.038;

    const x0 = px - width / 2;
    const x1 = px + width / 2;

    const pts = [
      [zBot + chordBot / 2, yBot],
      [zBot - chordBot / 2, yBot],
      [zTop - chordTop / 2, yTop],
      [zTop + chordTop / 2, yTop],
    ];

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (const pt of pts) {
      positions.push(x0, pt[1], pt[0]);
      uvs.push(0, (pt[1] - yBot) / (yTop - yBot));
    }
    for (const pt of pts) {
      positions.push(x1, pt[1], pt[0]);
      uvs.push(1, (pt[1] - yBot) / (yTop - yBot));
    }

    indices.push(0, 2, 1);
    indices.push(0, 3, 2);
    indices.push(4, 5, 6);
    indices.push(4, 6, 7);
    indices.push(0, 4, 7);
    indices.push(0, 7, 3);
    indices.push(3, 7, 6);
    indices.push(3, 6, 2);
    indices.push(2, 6, 5);
    indices.push(2, 5, 1);
    indices.push(1, 5, 4);
    indices.push(1, 4, 0);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, trimMat);
    mesh.castShadow = true;
    return mesh;
  }

  private createWingEndplate(ex: number, trimMat: THREE.Material): THREE.Mesh {
    const sgn = ex > 0 ? 1 : -1;
    const th = 0.025;

    // Swept aerodynamic fin anchored seamlessly to rear haunch shoulder (z=-1.65, y=0.50)
    const profile = [
      [-1.65, 0.50], // 0: haunch anchor
      [-1.76, 0.72], // 1: rising leading edge
      [-1.88, 0.95], // 2: top leading crest
      [-2.26, 0.94], // 3: top trailing crest
      [-2.26, 0.66], // 4: bottom trailing edge
      [-1.95, 0.48], // 5: bottom deck anchor
    ];

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const xOuter = ex;
    const xInner = ex - sgn * th;

    for (let i = 0; i < profile.length; i++) {
      positions.push(xOuter, profile[i][1], profile[i][0]);
      uvs.push((profile[i][0] + 2.26) / 0.61, (profile[i][1] - 0.48) / 0.47);
    }
    for (let i = 0; i < profile.length; i++) {
      positions.push(xInner, profile[i][1], profile[i][0]);
      uvs.push((profile[i][0] + 2.26) / 0.61, (profile[i][1] - 0.48) / 0.47);
    }

    if (ex > 0) {
      indices.push(0, 1, 2);
      indices.push(0, 2, 3);
      indices.push(0, 3, 4);
      indices.push(0, 4, 5);
      indices.push(6, 8, 7);
      indices.push(6, 9, 8);
      indices.push(6, 10, 9);
      indices.push(6, 11, 10);
    } else {
      indices.push(0, 2, 1);
      indices.push(0, 3, 2);
      indices.push(0, 4, 3);
      indices.push(0, 5, 4);
      indices.push(6, 7, 8);
      indices.push(6, 8, 9);
      indices.push(6, 9, 10);
      indices.push(6, 10, 11);
    }

    const n = profile.length;
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const o0 = i;
      const o1 = next;
      const i0 = i + n;
      const i1 = next + n;
      if (ex > 0) {
        indices.push(o0, i0, i1);
        indices.push(o0, i1, o1);
      } else {
        indices.push(o0, i1, i0);
        indices.push(o0, o1, i1);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, trimMat);
    mesh.castShadow = true;
    return mesh;
  }

  private createBeveledBumper(isFront: boolean, bodyMat: THREE.Material): THREE.Mesh {
    const zCenter = isFront ? 2.02 : -2.00;
    const yCenter = 0.17;
    const halfH = 0.15;
    const halfW = isFront ? 0.88 : 0.87;
    const halfWFlat = isFront ? 0.72 : 0.72;
    const dZBevel = isFront ? -0.12 : 0.10;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const xStations = [-halfW, -halfWFlat, halfWFlat, halfW];
    const zOffsets = [dZBevel, 0, 0, dZBevel];
    const depth = 0.22;

    for (let i = 0; i < 4; i++) {
      const x = xStations[i];
      const zF = zCenter + (isFront ? depth / 2 : -depth / 2) + zOffsets[i];
      positions.push(x, yCenter - halfH, zF); uvs.push(i / 3, 0);
      positions.push(x, yCenter + halfH, zF); uvs.push(i / 3, 1);
    }

    const backOffset = positions.length / 3;
    for (let i = 0; i < 4; i++) {
      const x = xStations[i];
      const zB = zCenter - (isFront ? depth / 2 : -depth / 2);
      positions.push(x, yCenter - halfH, zB); uvs.push(i / 3, 0);
      positions.push(x, yCenter + halfH, zB); uvs.push(i / 3, 1);
    }

    for (let i = 0; i < 3; i++) {
      const p0 = i * 2;
      const p1 = (i + 1) * 2;
      if (isFront) {
        indices.push(p0 + 0, p1 + 0, p1 + 1);
        indices.push(p0 + 0, p1 + 1, p0 + 1);
      } else {
        indices.push(p0 + 0, p1 + 1, p1 + 0);
        indices.push(p0 + 0, p0 + 1, p1 + 1);
      }
    }

    for (let i = 0; i < 3; i++) {
      const p0 = backOffset + i * 2;
      const p1 = backOffset + (i + 1) * 2;
      if (isFront) {
        indices.push(p0 + 0, p1 + 1, p1 + 0);
        indices.push(p0 + 0, p0 + 1, p1 + 1);
      } else {
        indices.push(p0 + 0, p1 + 0, p1 + 1);
        indices.push(p0 + 0, p1 + 1, p0 + 1);
      }
    }

    for (let i = 0; i < 3; i++) {
      const f0 = i * 2 + 1;
      const f1 = (i + 1) * 2 + 1;
      const b0 = backOffset + i * 2 + 1;
      const b1 = backOffset + (i + 1) * 2 + 1;
      if (isFront) {
        indices.push(f0, b0, b1);
        indices.push(f0, b1, f1);
      } else {
        indices.push(f0, b1, b0);
        indices.push(f0, f1, b1);
      }
    }

    for (let i = 0; i < 3; i++) {
      const f0 = i * 2;
      const f1 = (i + 1) * 2;
      const b0 = backOffset + i * 2;
      const b1 = backOffset + (i + 1) * 2;
      if (isFront) {
        indices.push(f0, b1, b0);
        indices.push(f0, f1, b1);
      } else {
        indices.push(f0, b0, b1);
        indices.push(f0, b1, f1);
      }
    }

    const lf0 = 0;
    const lf1 = 1;
    const lb0 = backOffset;
    const lb1 = backOffset + 1;
    if (isFront) {
      indices.push(lf0, lf1, lb1);
      indices.push(lf0, lb1, lb0);
    } else {
      indices.push(lf0, lb1, lf1);
      indices.push(lf0, lb0, lb1);
    }

    const rf0 = 6;
    const rf1 = 7;
    const rb0 = backOffset + 6;
    const rb1 = backOffset + 7;
    if (isFront) {
      indices.push(rf0, rb1, rf1);
      indices.push(rf0, rb0, rb1);
    } else {
      indices.push(rf0, rf1, rb1);
      indices.push(rf0, rb1, rb0);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, bodyMat);
    mesh.castShadow = true;
    return mesh;
  }

  private createChassisVisuals(): void {
    const carGroup = new THREE.Group();
    this.carGroup = carGroup;

    // Materials using verified sampled palette with smooth normal interpolation
    const bodyMat = new THREE.MeshStandardMaterial({
      color: THREE_PALETTE.carBodyLit,
      roughness: 0.35,
      metalness: 0.1,
      flatShading: false,
    });
    this.bodyMaterials.push(bodyMat);

    const trimMat = new THREE.MeshStandardMaterial({
      color: THREE_PALETTE.carTrimBlack,
      roughness: 0.8,
      metalness: 0.1,
      flatShading: false,
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.15,
      metalness: 0.40,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });

    this.runningLightMat = new THREE.MeshStandardMaterial({
      color: THREE_PALETTE.carTaillightRed,
      emissive: THREE_PALETTE.carTaillightRed,
      emissiveIntensity: 0.6,
      flatShading: true,
    });

    this.brakeLightMat = new THREE.MeshBasicMaterial({
      color: 0x550000,
    });

    // Glow quad behind each brake light cluster (MeshStandardMaterial with high emissive)
    this.brakeLightGlowMat = new THREE.MeshStandardMaterial({
      color: 0x550000,
      emissive: new THREE.Color(0x550000),
      emissiveIntensity: 0.0,
      transparent: true,
      opacity: 0.85,
      flatShading: true,
    });

    // PointLight for brake glow – starts off
    this.brakeLightPL = new THREE.PointLight(0xff1500, 0.0, 4.5, 2.0);
    this.brakeLightPL.position.set(0, 0.28, -2.12);
    carGroup.add(this.brakeLightPL);

    const amberLightMat = new THREE.MeshStandardMaterial({
      color: THREE_PALETTE.carTaillightAmber,
      emissive: THREE_PALETTE.carTaillightAmber,
      emissiveIntensity: 0.4,
      flatShading: true,
    });

    const whiteLightMat = new THREE.MeshStandardMaterial({
      color: THREE_PALETTE.carTaillightWhite,
      emissive: THREE_PALETTE.carTaillightWhite,
      emissiveIntensity: 0.3,
      flatShading: true,
    });

    const bashPlateMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.35,
      metalness: 0.8,
      flatShading: true,
    });

    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.2,
      metalness: 0.9,
      flatShading: true,
    });

    const exhaustBoreMat = new THREE.MeshBasicMaterial({
      color: 0x111111,
    });

    const rollCageMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.4,
      metalness: 0.5,
      flatShading: true,
    });

    // Partitioned sub-mesh groups for damage and detachment
    this.chassisMainGroup = new THREE.Group();
    this.frontBumperGroup = new THREE.Group();
    this.hoodGroup = new THREE.Group();
    this.rearWingGroup = new THREE.Group();

    carGroup.add(this.chassisMainGroup);
    carGroup.add(this.frontBumperGroup);
    carGroup.add(this.hoodGroup);
    carGroup.add(this.rearWingGroup);

    // =========================================================================
    // 1. MAIN LOWER BODY & SCULPTED CHASSIS
    // =========================================================================
    // Central cabin/engine tub with fluid coke-bottle waistline & wheel recesses
    const lowerBody = this.createSculptedLowerBody(bodyMat);
    this.chassisMainGroup.add(lowerBody);
    this.cockpitObscuringMeshes.push(lowerBody);

    // Sculpted rocker sills (bottom aerodynamic skirts conforming to coke-bottle curve)
    for (const sx of [-1, 1]) {
      const sill = this.createSculptedRockerSill(sx, trimMat);
      this.chassisMainGroup.add(sill);
    }

    // Hood / bonnet wedge sloping forward to front fascia
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.10, 1.30), bodyMat);
    hood.position.set(0, 0.37, 1.28);
    hood.rotation.x = 0.04;
    hood.castShadow = true;
    this.hoodGroup.add(hood);

    // Twin hood heat extractor louvers with aerodynamic cooling slats (CAD §5.2: 420mm L x 280mm W at X=±0.32m, Z=+0.95m)
    for (const hx of [-0.32, 0.32]) {
      // Louver recessed housing frame (280mm W x 420mm L)
      const louverFrame = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.42), trimMat);
      louverFrame.position.set(hx, 0.42, 0.95);
      this.hoodGroup.add(louverFrame);

      // Angled extractor slats inside frame
      for (let s = 0; s < 4; s++) {
        const slatZ = 0.80 + s * 0.10;
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.015, 0.04), exhaustBoreMat);
        slat.position.set(hx, 0.428, slatZ);
        slat.rotation.x = -0.35; // Angled backward for high-velocity heat extraction
        this.hoodGroup.add(slat);
      }
    }

    // Central turbo intercooler hood scoop
    const scoopMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7, flatShading: false });
    const hoodScoop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.44), scoopMat);
    hoodScoop.position.set(0, 0.43, 1.30);
    this.hoodGroup.add(hoodScoop);

    const scoopIntake = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.05), exhaustBoreMat);
    scoopIntake.position.set(0, 0.43, 1.52);
    this.hoodGroup.add(scoopIntake);

    // Rally competition livery stripes (Alpine white) with smooth shading
    const liveryMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.3,
      metalness: 0.2,
      flatShading: false,
    });
    this.stripeMaterials.push(liveryMat);

    // Twin Alpine white center racing stripes on hood
    for (const sx of [-1, 1]) {
      const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 1.28), liveryMat);
      hoodStripe.position.set(sx * 0.14, 0.422, 1.28);
      hoodStripe.rotation.x = 0.04;
      this.hoodGroup.add(hoodStripe);
    }

    const roofStripe = this.createCrownedRoofStripe(liveryMat);
    this.chassisMainGroup.add(roofStripe);
    this.cockpitObscuringMeshes.push(roofStripe);

    // Door competition lower rocker accent decals conforming to coke-bottle curve
    for (const sx of [-1, 1]) {
      const doorStripe = this.createDoorAccentStripe(sx, liveryMat);
      this.chassisMainGroup.add(doorStripe);
    }

    // Aerodynamic rally side-view mirrors with solid A-pillar sail mounts
    for (const sx of [-0.70, 0.70]) {
      const isRight = sx > 0;
      // Triangular sail base plate connecting mirror to A-pillar door corner
      const sail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.10, 0.12), trimMat);
      sail.position.set(isRight ? 0.67 : -0.67, 0.52, 0.40);
      sail.rotation.y = isRight ? -0.15 : 0.15;
      this.chassisMainGroup.add(sail);
      this.cockpitObscuringMeshes.push(sail);

      // Support stem extending outward
      const mirrorStem = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.03), trimMat);
      mirrorStem.position.set(isRight ? 0.72 : -0.72, 0.52, 0.40);
      this.chassisMainGroup.add(mirrorStem);
      this.cockpitObscuringMeshes.push(mirrorStem);

      // Streamlined aerodynamic mirror housing
      const mirrorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.15), bodyMat);
      mirrorHousing.position.set(isRight ? 0.78 : -0.78, 0.52, 0.40);
      mirrorHousing.rotation.y = isRight ? -0.12 : 0.12;
      this.chassisMainGroup.add(mirrorHousing);
      this.cockpitObscuringMeshes.push(mirrorHousing);

      // Reflective mirror glass face
      const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.07), new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.95,
        roughness: 0.05,
      }));
      mirrorGlass.position.set(isRight ? 0.822 : -0.822, 0.52, 0.40);
      mirrorGlass.rotation.y = isRight ? Math.PI / 2 - 0.12 : -Math.PI / 2 + 0.12;
      this.chassisMainGroup.add(mirrorGlass);
      this.cockpitObscuringMeshes.push(mirrorGlass);
    }

    // Polyurethane WRC mudflaps behind all four wheels with aluminum retention brackets
    const mudflapMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c, // Rally red mudflaps
      roughness: 0.6,
      metalness: 0.1,
      flatShading: true,
    });
    this.mudflapMaterials.push(mudflapMat);
    const bracketStripMat = new THREE.MeshStandardMaterial({ color: 0xa1a1aa, roughness: 0.3, metalness: 0.8, flatShading: true });

    for (const sx of [-0.89, 0.89]) {
      const frontMudflap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.02), mudflapMat);
      frontMudflap.position.set(sx, 0.04, 0.82);
      this.chassisMainGroup.add(frontMudflap);
      this.cockpitObscuringMeshes.push(frontMudflap);

      const fBracket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.025), bracketStripMat);
      fBracket.position.set(sx, 0.17, 0.82);
      this.chassisMainGroup.add(fBracket);
    }
    for (const sx of [-0.91, 0.91]) {
      const rearMudflap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.02), mudflapMat);
      rearMudflap.position.set(sx, 0.04, -1.98);
      this.chassisMainGroup.add(rearMudflap);

      const rBracket = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.025), bracketStripMat);
      rBracket.position.set(sx, 0.19, -1.98);
      this.chassisMainGroup.add(rBracket);
    }

    // =========================================================================
    // 2. COUPE GREENHOUSE & SLOPED FASTBACK REAR WINDOW
    // =========================================================================
    // Raked front windshield: slopes smoothly from cowl (Z=0.74, Y=0.44) up to roof (Z=0.16, Y=0.84)
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.04, 0.70), glassMat);
    windshield.position.set(0, 0.64, 0.45);
    windshield.rotation.x = 0.604; // ~34.6 deg rake: local +Z slopes down towards front cowl
    windshield.castShadow = true;
    this.chassisMainGroup.add(windshield);

    // Structural A-pillars
    for (const ax of [-0.67, 0.67]) {
      const apillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.71), bodyMat);
      apillar.position.set(ax, 0.64, 0.45);
      apillar.rotation.x = 0.604;
      this.chassisMainGroup.add(apillar);
      this.cockpitObscuringMeshes.push(apillar);
    }

    // Exterior Windshield Sun Visor Header Banner ("APEX RALLY")
    const bannerCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    let bannerTex = null;
    if (bannerCanvas) {
      bannerCanvas.width = 512;
      bannerCanvas.height = 64;
      const bctx = bannerCanvas.getContext('2d');
      if (bctx) {
        bctx.fillStyle = '#0f172a';
        bctx.fillRect(0, 0, 512, 64);
        bctx.fillStyle = '#f8fafc';
        bctx.font = 'bold 32px sans-serif';
        bctx.textAlign = 'center';
        bctx.textBaseline = 'middle';
        bctx.fillText('APEX RALLY', 256, 32);
        bannerTex = new THREE.CanvasTexture(bannerCanvas);
      }
    }
    const sunVisorMat = bannerTex 
      ? new THREE.MeshBasicMaterial({ map: bannerTex })
      : new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
    const sunVisorBanner = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.09, 0.02), sunVisorMat);
    sunVisorBanner.position.set(0, 0.79, 0.23);
    sunVisorBanner.rotation.x = 0.604;
    this.chassisMainGroup.add(sunVisorBanner);
    this.cockpitObscuringMeshes.push(sunVisorBanner);

    // Coupe roof cap with smooth aerodynamic longitudinal and lateral crowning
    const roof = this.createCrownedRoof(bodyMat);
    this.chassisMainGroup.add(roof);

    // Roof rally air scoop / periscope (220mm wide x 90mm tall per CAD §5.2)
    const roofScoop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.34), trimMat);
    roofScoop.position.set(0, 0.925, -0.05);
    this.chassisMainGroup.add(roofScoop);

    this.cockpitObscuringMeshes.push(roof, roofScoop, windshield);

    // SLOPED REAR FASTBACK WINDOW (Coupe Silhouette Key Element)
    // Long aerodynamic fastback glass sweeping down from roof (Z=-0.66, Y=0.84) to trunk deck (Z=-1.54, Y=0.48)
    const fastbackWindow = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.04, 0.95), glassMat);
    fastbackWindow.position.set(0, 0.66, -1.10);
    fastbackWindow.rotation.x = -0.388; // ~22.2 deg fastback rake: local +Z points up towards roof
    fastbackWindow.castShadow = true;
    this.chassisMainGroup.add(fastbackWindow);

    // 5 Aerodynamic Matte Black Engine Cooling Louver Slats across fastback glass
    for (let s = 0; s < 5; s++) {
      const t = s / 4;
      const louverZ = THREE.MathUtils.lerp(-0.78, -1.42, t);
      const louverY = THREE.MathUtils.lerp(0.80, 0.52, t) + 0.02;
      const louverSlat = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.015, 0.08), trimMat);
      louverSlat.position.set(0, louverY, louverZ);
      louverSlat.rotation.x = -0.388;
      this.chassisMainGroup.add(louverSlat);
      this.cockpitObscuringMeshes.push(louverSlat);
    }

    // Sculpted C-pillar fastback flying buttress haunches (tumblehome slope & blister blend)
    for (const cx of [-0.65, 0.65]) {
      const cpillar = this.createSculptedCPillar(cx, bodyMat);
      this.chassisMainGroup.add(cpillar);
    }

    // Rear trunk deck lid extending from base of sloped rear window to rear valence
    const trunkLid = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.10, 0.48), bodyMat);
    trunkLid.position.set(0, 0.45, -1.78);
    trunkLid.castShadow = true;
    this.chassisMainGroup.add(trunkLid);

    // Dual white competition stripes across trunk deck lid (matching reference blueprint)
    for (const sx of [-0.10, 0.10]) {
      const deckStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.006, 0.44),
        liveryMat
      );
      deckStripe.position.set(sx, 0.504, -1.76);
      deckStripe.castShadow = true;
      this.chassisMainGroup.add(deckStripe);
    }

    // Visible interior: tubular roll cage structure and bucket seat headrests
    const rollHoop = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.04, 0.04), rollCageMat);
    rollHoop.position.set(0, 0.81, -0.32);
    this.chassisMainGroup.add(rollHoop);
    this.cockpitObscuringMeshes.push(rollHoop);

    for (const rx of [-0.56, 0.56]) {
      const rollLeg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.52, 0.04), rollCageMat);
      rollLeg.position.set(rx, 0.58, -0.32);
      this.chassisMainGroup.add(rollLeg);
      this.cockpitObscuringMeshes.push(rollLeg);

      const rearStay = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.94), rollCageMat);
      rearStay.position.set(rx, 0.65, -1.10);
      rearStay.rotation.x = -0.388;
      this.chassisMainGroup.add(rearStay);
      this.cockpitObscuringMeshes.push(rearStay);
    }

    for (const seatX of [-0.32, 0.32]) {
      const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.12), trimMat);
      headrest.position.set(seatX, 0.56, -0.22);
      this.chassisMainGroup.add(headrest);
      this.cockpitObscuringMeshes.push(headrest);
    }

    // =========================================================================
    // 3. SOLID SCULPTED DOORS, FRONT FENDERS & REAR QUARTER HAUNCHES
    // =========================================================================
    for (const isRight of [false, true]) {
      // Solid contoured door with swage crease, handle, rally decal plate & window glass
      const door = this.createSolidDoor(isRight, bodyMat, trimMat, glassMat, liveryMat);
      this.chassisMainGroup.add(door);

      // Solid front flared blister fender with circular wheel cutout & inner liner
      const frontFender = this.createSolidFrontFender(isRight, bodyMat, trimMat);
      this.chassisMainGroup.add(frontFender);

      // Solid upper front fender ledge bridging hood shutline to blister shoulder
      const fenderLedge = this.createFrontFenderLedge(isRight, bodyMat);
      this.chassisMainGroup.add(fenderLedge);

      // Solid rear widebody box flare hip with ram-air scoop & stone guard
      const rearQuarter = this.createSolidRearQuarter(isRight, bodyMat, trimMat);
      this.chassisMainGroup.add(rearQuarter);
    }

    // =========================================================================
    // 4. FRONT RALLY BUMPER, SPLITTER & ALUMINUM BASH PLATE
    // =========================================================================
    // Main front bumper beam with swept aerodynamic corner bevels
    const frontBumper = this.createBeveledBumper(true, bodyMat);
    frontBumper.castShadow = true;
    this.frontBumperGroup.add(frontBumper);

    // Lower aerodynamic chin splitter
    const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.05, 0.36), trimMat);
    frontSplitter.position.set(0, 0.01, 2.06);
    this.frontBumperGroup.add(frontSplitter);

    // Twin Alpine white racing stripes on front splitter lip
    for (const sx of [-1, 1]) {
      const lipStripe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 0.22), liveryMat);
      lipStripe.position.set(sx * 0.14, 0.038, 2.06);
      this.frontBumperGroup.add(lipStripe);
    }

    // Aerodynamic front dive planes / canards & splitter support turnbuckles
    const strutMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.3, metalness: 0.8 });
    for (const cx of [-0.88, 0.88]) {
      // Upper corner canard
      const canardUpper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.18), trimMat);
      canardUpper.position.set(cx, 0.22, 2.05);
      canardUpper.rotation.set(-0.25, cx > 0 ? -0.35 : 0.35, cx > 0 ? 0.15 : -0.15);
      this.frontBumperGroup.add(canardUpper);

      // Lower corner canard
      const canardLower = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.20), trimMat);
      canardLower.position.set(cx, 0.12, 2.08);
      canardLower.rotation.set(-0.25, cx > 0 ? -0.35 : 0.35, cx > 0 ? 0.15 : -0.15);
      this.frontBumperGroup.add(canardLower);

      // Splitter tie-rod / turnbuckle strut
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 8), strutMat);
      strut.position.set(cx * 0.45, 0.08, 2.14);
      strut.rotation.x = -0.35;
      this.frontBumperGroup.add(strut);
    }

    // Front center radiator intake air dam with aluminum heat exchanger core (CAD §1.2)
    const radiatorGrille = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 0.06), exhaustBoreMat);
    radiatorGrille.position.set(0, 0.13, 2.04);
    this.frontBumperGroup.add(radiatorGrille);

    // Red APEX center badge on front grille
    const badgeMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.5 });
    const apexBadge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.045, 0.02), badgeMat);
    apexBadge.position.set(0, 0.24, 2.145);
    this.frontBumperGroup.add(apexBadge);

    // White stencil APEX plate on lower intake
    const stencilMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const stencilPlate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.02), stencilMat);
    stencilPlate.position.set(0, 0.05, 2.135);
    this.frontBumperGroup.add(stencilPlate);

    // Aluminum radiator cooling core behind grille mesh
    const radCoreMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.8, flatShading: true });
    const radCore = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.13, 0.02), radCoreMat);
    radCore.position.set(0, 0.13, 2.02);
    this.frontBumperGroup.add(radCore);

    // Aluminum underbody bash / skid plate
    const bashPlate = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.04, 0.58), bashPlateMat);
    bashPlate.position.set(0, -0.06, 1.82);
    bashPlate.rotation.x = 0.26; // Slopes up to front lip
    this.frontBumperGroup.add(bashPlate);

    // Rally tow recovery loop
    const towLoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.045, 0.015, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.6 })
    );
    towLoop.position.set(0.48, 0.04, 2.18);
    this.frontBumperGroup.add(towLoop);

    // Quad front rally pod driving lamps with yellow halogen lenses & protective stone guards
    const yellowHalogenMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: new THREE.Color(0xfacc15),
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.1,
      flatShading: true,
    });

    for (let i = -1.5; i <= 1.5; i += 1.0) {
      const px = i * 0.20; // 0.20 spacing creates a compact rally pod cluster
      const lampHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10, 0.10, 0.09, 16),
        trimMat
      );
      lampHousing.rotateX(Math.PI / 2);
      lampHousing.position.set(px, 0.24, 2.09);
      this.frontBumperGroup.add(lampHousing);

      const lampLens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.088, 0.088, 0.02, 16),
        yellowHalogenMat
      );
      lampLens.rotateX(Math.PI / 2);
      lampLens.position.set(px, 0.24, 2.14);
      this.frontBumperGroup.add(lampLens);

      // Stone guard cross-bars over lens
      const barH = new THREE.Mesh(new THREE.BoxGeometry(0.176, 0.012, 0.008), trimMat);
      barH.position.set(px, 0.24, 2.152);
      this.frontBumperGroup.add(barH);

      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.176, 0.008), trimMat);
      barV.position.set(px, 0.24, 2.152);
      this.frontBumperGroup.add(barV);
    }

    // Outer Headlamp Protective Bezels & Amber Turn Indicators (CAD Chapter 1)
    const headlampLensMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: new THREE.Color(0xf8fafc),
      emissiveIntensity: 0.9,
      roughness: 0.1,
      metalness: 0.9,
    });
    for (const lx of [-0.55, 0.55]) {
      const isRight = lx > 0;
      // Matte black aerodynamic headlamp bezel frame
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.15, 0.03), trimMat);
      bezel.position.set(lx, 0.24, 2.138);
      this.frontBumperGroup.add(bezel);

      // Circular projector headlamp lens inside bezel
      const lampRing = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02, 16), trimMat);
      lampRing.rotateX(Math.PI / 2);
      lampRing.position.set(lx, 0.24, 2.145);
      this.frontBumperGroup.add(lampRing);

      const lampBulb = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.022, 16), headlampLensMat);
      lampBulb.rotateX(Math.PI / 2);
      lampBulb.position.set(lx, 0.24, 2.15);
      this.frontBumperGroup.add(lampBulb);

      // Amber corner indicator lamp
      const indicator = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.12, 0.025),
        amberLightMat
      );
      indicator.position.set(isRight ? 0.72 : -0.72, 0.24, 2.135);
      this.frontBumperGroup.add(indicator);
    }

    // =========================================================================
    // 5. REAR RALLY BUMPER, DIFFUSER & DUAL EXHAUST PIPES
    // =========================================================================
    // Rear bumper beam with swept corner bevels
    const rearBumper = this.createBeveledBumper(false, bodyMat);
    this.chassisMainGroup.add(rearBumper);

    // Lower rear diffuser tray
    const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.04, 0.34), trimMat);
    rearDiffuser.position.set(0, -0.22, -1.98);
    this.chassisMainGroup.add(rearDiffuser);

    // Vertical diffuser strakes (4 symmetric strakes across rear valance)
    for (const dx of [-0.48, -0.16, 0.16, 0.48]) {
      const strake = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.10, 0.28), trimMat);
      strake.position.set(dx, -0.24, -1.98);
      this.chassisMainGroup.add(strake);
    }

    // Center FIA rally rain light beacon
    const rainLightMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: new THREE.Color(0xef4444),
      emissiveIntensity: 0.9,
      flatShading: true,
    });
    const rainLight = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.03), rainLightMat);
    rainLight.position.set(0, -0.16, -2.15);
    this.chassisMainGroup.add(rainLight);

    // =========================================================================
    // UNDERBODY CHASSIS PROTECTION ARMOR (CAD SPEC CHAPTER 4)
    // =========================================================================
    // Component B: Mid-Body Smooth Carbon-Kevlar Undertray with Propshaft Tunnel (z = +0.80m to -0.90m)
    const undertrayMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.85,
      metalness: 0.20,
      flatShading: true,
    });
    const undertray = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.025, 1.70), undertrayMat);
    undertray.position.set(0, -0.24, -0.05);
    this.chassisMainGroup.add(undertray);

    // Recessed central propshaft tunnel trough
    const tunnelTroughMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.9 });
    const propshaftTunnel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 1.68), tunnelTroughMat);
    propshaftTunnel.position.set(0, -0.225, -0.05);
    this.chassisMainGroup.add(propshaftTunnel);

    // Component C: Tubular 4130 Chrome-Moly Rear Differential Cradle & Rock Deflector (z = -0.90m to -1.95m)
    const cradleMat = new THREE.MeshStandardMaterial({
      color: 0x52525b,
      roughness: 0.40,
      metalness: 0.75,
      flatShading: true,
    });
    // Longitudinal cradle tubular rails
    for (const cx of [-0.38, 0.38]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.05, 8), cradleMat);
      rail.rotateX(Math.PI / 2);
      rail.position.set(cx, -0.20, -1.42);
      this.chassisMainGroup.add(rail);
    }
    // Transverse cradle cross-members
    for (const cz of [-0.95, -1.40, -1.88]) {
      const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.76, 8), cradleMat);
      cross.rotateZ(Math.PI / 2);
      cross.position.set(0, -0.20, cz);
      this.chassisMainGroup.add(cross);
    }
    // Salisbury mechanical LSD differential pumpkin casing with cooling ribs
    const diffMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.5, metalness: 0.8 });
    const diffPumpkin = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.32), diffMat);
    diffPumpkin.position.set(0, -0.08, -1.35);
    this.chassisMainGroup.add(diffPumpkin);
    // Aluminum lower rock deflector shield plate
    const deflectorPlate = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.02, 0.85), bashPlateMat);
    deflectorPlate.position.set(0, -0.22, -1.42);
    this.chassisMainGroup.add(deflectorPlate);

    // =========================================================================
    // UNDERBODY HIGH-DETAIL ADDITIONS (CAD SPEC CHAPTER 4)
    // =========================================================================

    // Component A additions: 5 longitudinal ribs on front bash plate underside
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x52525b, roughness: 0.5, metalness: 0.6, flatShading: true });
    for (const rx of [-0.40, -0.20, 0, 0.20, 0.40]) {
      const bashRib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.52), ribMat);
      bashRib.position.set(rx, -0.245, 1.82);
      bashRib.rotation.x = 0.26; // Match bash plate slope
      this.frontBumperGroup.add(bashRib);
    }
    // 8 corner bolt heads on bash plate
    const boltMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.2, metalness: 0.9, flatShading: true });
    for (const bx of [-0.46, 0.46]) {
      for (const bz of [1.56, 2.08]) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.015, 6), boltMat);
        bolt.position.set(bx, -0.23, bz);
        this.frontBumperGroup.add(bolt);
      }
    }

    // Component B additions: 3 flat aero diffusion ribs on undertray bottom
    for (const rx of [-0.35, 0, 0.35]) {
      const aeroRib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 1.60), undertrayMat);
      aeroRib.position.set(rx, -0.258, -0.05);
      this.chassisMainGroup.add(aeroRib);
    }
    // Side skirt joining brackets (forward + aft)
    const bracketMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.6, metalness: 0.5, flatShading: true });
    for (const sx of [-0.56, 0.56]) {
      for (const bz of [0.76, -0.86]) {
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.06), bracketMat);
        bracket.position.set(sx, -0.22, bz);
        this.chassisMainGroup.add(bracket);
      }
    }

    // Component C additions: diagonal triangulated braces between cradle rails
    const diagMat = new THREE.MeshStandardMaterial({ color: 0x52525b, roughness: 0.4, metalness: 0.75, flatShading: true });
    // Forward diagonal brace (left-front to right-rear)
    const diagBrace1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.52, 8), diagMat);
    diagBrace1.position.set(0, -0.20, -1.14);
    diagBrace1.rotation.z = Math.PI / 2;
    diagBrace1.rotation.x = 0.4;
    this.chassisMainGroup.add(diagBrace1);
    // Rearward diagonal brace (right-front to left-rear)
    const diagBrace2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.52, 8), diagMat);
    diagBrace2.position.set(0, -0.20, -1.65);
    diagBrace2.rotation.z = Math.PI / 2;
    diagBrace2.rotation.x = -0.4;
    this.chassisMainGroup.add(diagBrace2);

    // Diff breather stub (pointing up from diffPumpkin)
    const breatherMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.5, metalness: 0.7, flatShading: true });
    const breatherStub = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), breatherMat);
    breatherStub.position.set(0.08, 0.06, -1.35);
    this.chassisMainGroup.add(breatherStub);

    // Halfshaft stub axles (horizontal, x = ±0.14 from diff center)
    const halfshaftMat = new THREE.MeshStandardMaterial({ color: 0x71717a, roughness: 0.3, metalness: 0.85, flatShading: true });
    for (const hx of [-0.14, 0.14]) {
      const halfshaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.30, 8), halfshaftMat);
      halfshaft.position.set(hx * 2.5, -0.08, -1.35);
      halfshaft.rotation.z = Math.PI / 2;
      this.chassisMainGroup.add(halfshaft);
    }

    // Integrated ducktail lip spoiler on trunk deck
    const ducktailLip = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.06, 0.08), trimMat);
    ducktailLip.position.set(0, 0.50, -1.98);
    ducktailLip.rotation.x = -0.25;
    this.chassisMainGroup.add(ducktailLip);

    // Stainless steel heat shield above dual exhaust outlets on right side (CAD §3.2)
    const heatShield = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.12), bashPlateMat);
    heatShield.position.set(0.34, -0.10, -2.132);
    heatShield.rotation.y = Math.PI;
    this.chassisMainGroup.add(heatShield);

    // DUAL EXHAUST PIPES (Twin polished stainless steel tailpipes on right side @ X=0.35m)
    for (const ex of [0.28, 0.40]) {
      const exhaustPipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.24, 16),
        exhaustMat
      );
      exhaustPipe.rotateX(Math.PI / 2);
      exhaustPipe.position.set(ex, -0.18, -2.10);
      this.chassisMainGroup.add(exhaustPipe);

      // Dark soot interior bore
      const bore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.042, 0.05, 16),
        exhaustBoreMat
      );
      bore.rotateX(Math.PI / 2);
      bore.position.set(ex, -0.18, -2.205);
      this.chassisMainGroup.add(bore);

      // Burnt titanium blue scorch tip ring
      const tiMat = new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        roughness: 0.25,
        metalness: 0.85,
      });
      const tiRing = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.03, 16), tiMat);
      tiRing.rotateX(Math.PI / 2);
      tiRing.position.set(ex, -0.18, -2.21);
      this.chassisMainGroup.add(tiRing);
    }

    // =========================================================================
    // 5b. ADDITIONAL EXTERIOR DETAILS (CAD SPEC §3.3–3.5)
    // =========================================================================

    // Rear tow recovery hook (right side, red anodized aluminum)
    const towHookMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.3, metalness: 0.7, flatShading: true });
    const towHook = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 16), towHookMat);
    towHook.position.set(0.52, -0.16, -2.18);
    towHook.rotation.x = Math.PI / 2;
    this.chassisMainGroup.add(towHook);

    // Door sill step plates (both sides, below B-pillar)
    const stepPlateMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8, metalness: 0.3, flatShading: true });
    for (const sx of [-1, 1]) {
      const stepPlate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.60), stepPlateMat);
      stepPlate.position.set(sx * 0.88, -0.24, -0.1);
      this.chassisMainGroup.add(stepPlate);
    }

    // Rear NACA brake-cooling ducts on rear quarter arch face
    const nacaDuctMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, flatShading: true });
    for (const sx of [-0.74, 0.74]) {
      const nacaDuct = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.03), nacaDuctMat);
      nacaDuct.position.set(sx, 0.14, -1.62);
      this.chassisMainGroup.add(nacaDuct);
      // Duct opening bore
      const nacaBore = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), nacaDuctMat);
      nacaBore.position.set(sx, 0.14, -1.63);
      this.chassisMainGroup.add(nacaBore);
    }

    // Roof scoop open intake bore (dark face at front of scoop, 180mm x 70mm)
    const scoopBoreMat = new THREE.MeshBasicMaterial({ color: 0x060606 });
    const scoopBore = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.02), scoopBoreMat);
    scoopBore.position.set(0, 0.928, -0.21);
    this.chassisMainGroup.add(scoopBore);

    // =========================================================================
    // 6. REAR SPOILER WING ON TWIN SWEPT-BACK PYLONS (CAD §3.2)
    // =========================================================================
    // Dual aerodynamic swept pylons (mounted securely at X=±0.420m to bootlid hardpoints)
    for (const px of [-0.42, 0.42]) {
      const pylon = this.createSweptPylon(px, trimMat);
      this.rearWingGroup.add(pylon);

      // Mid-chord support brace between blade and pylon body
      const midBrace = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.04), trimMat);
      midBrace.position.set(px, 0.84, -2.00);
      this.rearWingGroup.add(midBrace);
    }

    // High-mounted contoured aerodynamic aerofoil wing blade (span 1,420mm, chord 0.40m, Z=-1.85 to -2.25m, pitch -5 deg)
    const wingBlade = this.createContouredWingBlade(trimMat);
    this.rearWingGroup.add(wingBlade);

    // Trailing edge Gurney flap wickerbill (width 1,420mm, height 25mm at Z=-2.25m)
    const gurneyFlap = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.025, 0.015), trimMat);
    gurneyFlap.position.set(0, 0.885, -2.250);
    this.rearWingGroup.add(gurneyFlap);

    // Conformal curved stripe ribbons along the aerofoil camber and Gurney flap (matching reference blueprint)
    const createWingStripeRibbon = (centerX: number): THREE.Mesh => {
      const chord = 0.400;
      const zLeading = -1.850;
      const pitchRad = -5.0 * (Math.PI / 180.0);
      const halfW = 0.06; // width 0.12m
      const nChord = 10;
      const positions: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];

      for (let j = 0; j <= nChord; j++) {
        const s = j / nChord;
        const zLocal = -s * chord * Math.cos(pitchRad);
        const zWorld = zLeading + zLocal;
        const yPitch = -s * chord * Math.sin(pitchRad);
        const camber = 0.045 * (4 * s * (1 - s));
        const thickness = 0.040 * (4 * s * (1 - s));
        const yUpper = 0.880 + yPitch + camber + thickness * 0.5 + 0.003;

        positions.push(centerX - halfW, yUpper, zWorld); uvs.push(0, s);
        positions.push(centerX + halfW, yUpper, zWorld); uvs.push(1, s);
      }

      for (let j = 0; j < nChord; j++) {
        const s0 = j * 2;
        const s1 = (j + 1) * 2;
        indices.push(s0 + 0, s1 + 1, s1 + 0);
        indices.push(s0 + 0, s0 + 1, s1 + 1);
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.setIndex(indices);
      geom.computeVertexNormals();

      return new THREE.Mesh(geom, liveryMat);
    };

    for (const sx of [-0.10, 0.10]) {
      const wingStripe = createWingStripeRibbon(sx);
      this.rearWingGroup.add(wingStripe);

      // Gurney flap vertical stripe facet at Z=-2.250m
      const gurneyStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.026, 0.016),
        liveryMat
      );
      gurneyStripe.position.set(sx, 0.886, -2.250);
      this.rearWingGroup.add(gurneyStripe);
    }

    // Vertical aerodynamic wing endplates (swept leading edge flowing to haunches, tips at X=±0.710m)
    for (const ex of [-0.71, 0.71]) {
      const endplate = this.createWingEndplate(ex, trimMat);
      this.rearWingGroup.add(endplate);
    }

    // =========================================================================
    // 7. TAILLIGHT CLUSTERS, GLOW QUADS & "APEX RALLY" LICENSE PLATE
    // =========================================================================
    // Full-width black rear honeycomb mesh panel with bold white "APEX" logotype (CAD §3.1)
    const rearPanelCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    let rearPanelTex: THREE.CanvasTexture | null = null;
    if (rearPanelCanvas) {
      rearPanelCanvas.width = 512;
      rearPanelCanvas.height = 128;
      const rctx = rearPanelCanvas.getContext('2d');
      if (rctx) {
        rctx.fillStyle = '#0f172a';
        rctx.fillRect(0, 0, 512, 128);
        rctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
        rctx.lineWidth = 2;
        for (let x = 0; x < 512; x += 16) {
          rctx.beginPath();
          rctx.moveTo(x, 0);
          rctx.lineTo(x, 128);
          rctx.stroke();
        }
        rctx.fillStyle = '#f8fafc';
        rctx.font = '900 48px sans-serif';
        rctx.textAlign = 'center';
        rctx.textBaseline = 'middle';
        rctx.fillText('APEX', 256, 64);
        rearPanelTex = new THREE.CanvasTexture(rearPanelCanvas);
      }
    }
    const rearPanelMat = rearPanelTex
      ? new THREE.MeshBasicMaterial({ map: rearPanelTex })
      : trimMat;
    const rearPanelMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.24), rearPanelMat);
    rearPanelMesh.position.set(0, 0.28, -2.132);
    rearPanelMesh.rotation.y = Math.PI;
    this.chassisMainGroup.add(rearPanelMesh);

    // Twin circular taillight clusters (amber turn ring + glowing red brake lamp, CAD §3.1)
    for (const lx of [-0.58, 0.58]) {
      // Outer amber turn ring
      const tlAmber = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.015, 8, 24), amberLightMat);
      tlAmber.position.set(lx, 0.28, -2.138);
      this.chassisMainGroup.add(tlAmber);

      // Inner glowing red circular brake light
      const tlRed = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 24), this.brakeLightMat);
      tlRed.rotateX(Math.PI / 2);
      tlRed.position.set(lx, 0.28, -2.138);
      this.chassisMainGroup.add(tlRed);
    }

    // Inner reverse lamps
    for (const rx of [-0.42, 0.42]) {
      const tlWhite = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), whiteLightMat);
      tlWhite.rotateX(Math.PI / 2);
      tlWhite.position.set(rx, 0.28, -2.138);
      this.chassisMainGroup.add(tlWhite);
    }

    // Vertical cooling louvers on outer rear bumper flanks (CAD §3.4)
    for (const bx of [-0.78, 0.78]) {
      for (let v = 0; v < 4; v++) {
        const vz = -2.13;
        const vx = bx + (bx > 0 ? -v * 0.035 : v * 0.035);
        const louver = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.12, 0.01), trimMat);
        louver.position.set(vx, 0.18, vz);
        this.chassisMainGroup.add(louver);
      }
    }

    // Glow quads behind each brake light cluster
    const glowGeom = new THREE.PlaneGeometry(0.42, 0.18);
    const glowL = new THREE.Mesh(glowGeom, this.brakeLightGlowMat);
    glowL.position.set(-0.58, 0.28, -2.132);
    glowL.rotation.y = Math.PI;
    this.chassisMainGroup.add(glowL);

    const glowR = new THREE.Mesh(glowGeom, this.brakeLightGlowMat);
    glowR.position.set(0.58, 0.28, -2.132);
    glowR.rotation.y = Math.PI;
    this.chassisMainGroup.add(glowR);

    // Custom License Plate: "APEX RALLY" + Bloom sprites
    if (typeof document !== 'undefined') {
      const bCanvas = document.createElement('canvas');
      bCanvas.width = 128;
      bCanvas.height = 128;
      const bctx = bCanvas.getContext('2d')!;
      const grad = bctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255, 245, 230, 1.0)');
      grad.addColorStop(0.18, 'rgba(255, 30, 0, 0.95)');
      grad.addColorStop(0.45, 'rgba(255, 10, 0, 0.60)');
      grad.addColorStop(0.75, 'rgba(220, 0, 0, 0.22)');
      grad.addColorStop(1.0, 'rgba(180, 0, 0, 0.0)');
      bctx.fillStyle = grad;
      bctx.fillRect(0, 0, 128, 128);
      const bTex = new THREE.CanvasTexture(bCanvas);

      const spriteMatL = new THREE.SpriteMaterial({
        map: bTex,
        color: 0xff1500,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.brakeLightSpriteL = new THREE.Sprite(spriteMatL);
      this.brakeLightSpriteL.scale.set(0.85, 0.50, 1);
      this.brakeLightSpriteL.position.set(-0.55, 0.30, -2.18);
      this.chassisMainGroup.add(this.brakeLightSpriteL);

      const spriteMatR = new THREE.SpriteMaterial({
        map: bTex,
        color: 0xff1500,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.brakeLightSpriteR = new THREE.Sprite(spriteMatR);
      this.brakeLightSpriteR.scale.set(0.85, 0.50, 1);
      this.brakeLightSpriteR.position.set(0.55, 0.30, -2.18);
      this.chassisMainGroup.add(this.brakeLightSpriteR);

      const plateCanvas = document.createElement('canvas');
      plateCanvas.width = 256;
      plateCanvas.height = 64;
      const pctx = plateCanvas.getContext('2d')!;
      pctx.fillStyle = '#f8fafc';
      pctx.fillRect(0, 0, 256, 64);
      pctx.strokeStyle = '#0f172a';
      pctx.lineWidth = 6;
      pctx.strokeRect(4, 4, 248, 56);
      pctx.fillStyle = '#0f172a';
      pctx.font = 'bold 36px monospace';
      pctx.textAlign = 'center';
      pctx.textBaseline = 'middle';
      pctx.fillText('APEX RALLY', 128, 34);

      const plateTex = new THREE.CanvasTexture(plateCanvas);
      const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });
      const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.14), plateMat);
      plateMesh.position.set(0, 0.18, -2.135);
      plateMesh.rotateY(Math.PI);
      this.chassisMainGroup.add(plateMesh);
    }

    this.chassisMesh.add(carGroup);
  }

  private createWheelVisuals(): void {
    const tireGeom = new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, 0.28, 16);
    tireGeom.rotateZ(Math.PI / 2);

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x1f2022,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });

    const rimGeom = new THREE.CylinderGeometry(this.wheelRadius * 0.64, this.wheelRadius * 0.64, 0.29, 16);
    rimGeom.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc, // OZ-Racing Alpine white rally rims
      roughness: 0.25,
      metalness: 0.35,
      flatShading: true,
    });
    this.rimMaterials.push(rimMat);

    const caliperMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626, // Brembo red brake calipers
      roughness: 0.3,
      metalness: 0.6,
    });
    const caliperGeom = new THREE.BoxGeometry(0.08, 0.14, 0.06);

    for (let i = 0; i < 4; i++) {
      const wheelGroup = new THREE.Group();
      const isRight = (i % 2 === 1);

      const tire = new THREE.Mesh(tireGeom, tireMat);
      tire.castShadow = true;
      wheelGroup.add(tire);

      const rim = new THREE.Mesh(rimGeom, rimMat);
      wheelGroup.add(rim);

      // Deep-dish outer rim lip
      const lipGeom = new THREE.TorusGeometry(this.wheelRadius * 0.62, 0.016, 8, 16);
      lipGeom.rotateY(Math.PI / 2);
      const lip = new THREE.Mesh(lipGeom, rimMat);
      lip.position.x = isRight ? 0.075 : -0.075;
      wheelGroup.add(lip);

      // 10 radial tarmac rally spokes (5 crossed dual-ended bars)
      const spokeGeom = new THREE.BoxGeometry(0.024, this.wheelRadius * 0.60, 0.022);
      for (let s = 0; s < 5; s++) {
        const angle = (s / 5) * Math.PI;
        const spoke = new THREE.Mesh(spokeGeom, rimMat);
        spoke.position.x = isRight ? 0.05 : -0.05;
        spoke.rotation.x = angle;
        wheelGroup.add(spoke);
      }

      // Center lug nut hub cap
      const capMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.30, 8), capMat);
      cap.rotateZ(Math.PI / 2);
      wheelGroup.add(cap);

      // Yellow motorsport tyre valve stem
      const valveMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8 });
      const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8), valveMat);
      valve.position.set(isRight ? 0.09 : -0.09, this.wheelRadius * 0.68, 0);
      valve.rotateZ(Math.PI / 2);
      wheelGroup.add(valve);

      // Ventilated drilled performance brake rotor disc
      const rotorMat = new THREE.MeshStandardMaterial({
        color: 0x27272a,
        roughness: 0.35,
        metalness: 0.85,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
      });
      this.brakeRotorMats.push(rotorMat);

      const rotorGeom = new THREE.CylinderGeometry(this.wheelRadius * 0.52, this.wheelRadius * 0.52, 0.016, 16);
      rotorGeom.rotateZ(Math.PI / 2);
      const rotor = new THREE.Mesh(rotorGeom, rotorMat);
      rotor.position.x = isRight ? 0.012 : -0.012;
      wheelGroup.add(rotor);

      // Red brake caliper sitting behind wheel
      const caliper = new THREE.Mesh(caliperGeom, caliperMat);
      caliper.position.set(isRight ? -0.06 : 0.06, 0.12, 0.0);
      wheelGroup.add(caliper);

      this.scene.add(wheelGroup);
      this.wheelMeshes.push(wheelGroup);
    }
  }

  public worldSurfaceQuery?: (worldX: number, worldZ: number) => { name: string; multiplier: number };

  public getSurfaceGripMultiplier(worldX: number, worldZ: number): { name: string; multiplier: number } {
    if (this.tuning.surfaceMode === 'tarmac') return { name: 'Tarmac', multiplier: this.tuning.gripMultiplierTarmac };
    if (this.tuning.surfaceMode === 'dirt') return { name: 'Dirt', multiplier: this.tuning.gripMultiplierDirt };
    if (this.tuning.surfaceMode === 'gravel') return { name: 'Gravel', multiplier: this.tuning.gripMultiplierGravel };
    if (this.tuning.surfaceMode === 'grass') return { name: 'Grass', multiplier: this.tuning.gripMultiplierGrass };

    if (this.worldSurfaceQuery) {
      return this.worldSurfaceQuery(worldX, worldZ);
    }

    // 'auto' mode based on world coordinates:
    // Outer perimeter beyond 75m is grass/forest edge, inner sandbox is packed dirt
    const distFromCenter = Math.hypot(worldX, worldZ);
    if (distFromCenter > 75) {
      return { name: 'Grass', multiplier: this.tuning.gripMultiplierGrass };
    }
    return { name: 'Dirt', multiplier: this.tuning.gripMultiplierDirt };
  }

  public getTelemetry(inputs: VehicleInputs): VehicleTelemetry {
    if (!this.chassisBody) {
      return {
        speedMph: 0,
        speedKmh: 0,
        rpm: 1000,
        gear: 1,
        isRwd: this.tuning.isRwd,
        throttleInput: inputs.throttle,
        brakeInput: inputs.brake,
        steerInput: inputs.steer,
        handbrakeActive: inputs.handbrake,
        wheelContacts: [false, false, false, false],
        suspensionLengths: [0.38, 0.38, 0.38, 0.38],
        suspensionForces: [0, 0, 0, 0],
        lateralG: 0,
        surfaceName: 'Dirt',
        gripMultiplier: this.tuning.gripMultiplierDirt,
        isShifting: false,
        shiftTimer: 0,
        engineTorqueMult: 1.0,
        wheelForcesLongitudinal: [0, 0, 0, 0],
        wheelForcesLateral: [0, 0, 0, 0],
        wheelForcesNormal: [0, 0, 0, 0],
        wheelSlipRatios: [0, 0, 0, 0],
        wheelSlipAnglesDeg: [0, 0, 0, 0],
        wheelSpeedsMph: [0, 0, 0, 0],
        groundSpeedsMph: [0, 0, 0, 0],
        frictionEllipseUsage: [0, 0, 0, 0],
        wheelContactPoints: [null, null, null, null],
        wheelHeadings: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1)],
        wheelLaterals: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)],
      };
    }

    const linvel = this.chassisBody.linvel();
    const speedMs = Math.hypot(linvel.x, linvel.y, linvel.z);
    const speedMph = speedMs * 2.23694;
    const speedKmh = speedMs * 3.6;

    const trans = this.chassisBody.translation();
    const surface = this.getSurfaceGripMultiplier(trans.x, trans.z);

    const groundSpeeds = [...this.lastGroundSpeedsMph];
    const wheelSpeeds = [...this.lastWheelSpeedsMph];
    const slipAnglesDeg = this.wheelSlipAngles.map((a) => THREE.MathUtils.radToDeg(a));

    return {
      speedMph,
      speedKmh,
      rpm: this.currentRpm,
      gear: this.isShifting ? 'N' : (this.currentGear === -1 ? 'R' : this.currentGear),
      isRwd: this.tuning.isRwd,
      throttleInput: inputs.throttle,
      brakeInput: inputs.brake,
      steerInput: inputs.steer,
      handbrakeActive: inputs.handbrake,
      wheelContacts: [...this.wheelInContact],
      suspensionLengths: [...this.currentSuspensionLengths],
      suspensionForces: [...this.wheelNormalForces],
      lateralG: this.lateralG,
      surfaceName: surface.name,
      gripMultiplier: surface.multiplier,

      // V1 Debug Overlay metrics
      isShifting: this.isShifting,
      shiftTimer: this.shiftTimer,
      engineTorqueMult: this.currentTorqueMult,
      wheelForcesLongitudinal: [...this.wheelLongitudinalForces],
      wheelForcesLateral: [...this.wheelLateralForces],
      wheelForcesNormal: [...this.wheelNormalForces],
      wheelSlipRatios: [...this.wheelSlipRatios],
      wheelSlipAnglesDeg: slipAnglesDeg,
      wheelSpeedsMph: wheelSpeeds,
      groundSpeedsMph: groundSpeeds,
      frictionEllipseUsage: [...this.lastFrictionEllipseUsage],
      wheelContactPoints: [...this.lastContactPoints],
      wheelHeadings: [...this.lastWheelHeadings],
      wheelLaterals: [...this.lastWheelLaterals],

      // V4 Drift & Dynamics metrics
      driftAngleDeg: this.driftAngleDeg,
      isDrifting: this.isDrifting,
      driftStateTransitions: this.driftStateTransitions,
      yawRateDeg: THREE.MathUtils.radToDeg(this.chassisBody.angvel().y),
    };
  }
}
