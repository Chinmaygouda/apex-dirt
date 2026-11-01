import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { THREE_PALETTE, PALETTE } from '../core/Constants';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { VehicleInputs } from '../core/InputManager';
import { VehicleTelemetry } from './RapierBaselineVehicle';

export interface CustomVehicleTuning {
  // Suspension
  springStiffness: number;
  damperCompression: number;
  damperRebound: number;
  suspensionRestLength: number;
  antiRollBarStiffness: number;

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

export class CustomRallyVehicle {
  public chassisMesh: THREE.Group;
  public wheelMeshes: THREE.Group[] = [];
  public chassisBody!: RAPIER.RigidBody;
  public drivingDirectionMode: 'forward' | 'reverse' = 'forward';

  // Visual materials
  private brakeLightMat!: THREE.MeshBasicMaterial;
  private brakeLightGlowMat!: THREE.MeshStandardMaterial;
  private brakeLightPL!: THREE.PointLight;
  private brakeLightSpriteL?: THREE.Sprite;
  private brakeLightSpriteR?: THREE.Sprite;
  private runningLightMat!: THREE.MeshStandardMaterial;

  // Vehicle Parameters
  public tuning: CustomVehicleTuning = {
    springStiffness: 42000,       // N/m
    damperCompression: 3400,      // Ns/m
    damperRebound: 4200,          // Ns/m
    suspensionRestLength: 0.40,   // m (ensures continuous tyre road contact under heavy braking)
    antiRollBarStiffness: 16000,  // N/m (keeps body level and prevents rollover during hard cornering)

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

  constructor(private scene: THREE.Scene, private physics: PhysicsWorld) {
    this.chassisMesh = new THREE.Group();
    this.setupWheelAnchors();
    this.createChassisVisuals();
    this.createWheelVisuals();
    this.initPhysics();
    this.scene.add(this.chassisMesh);
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
      .setTranslation(0, 0.16, 0);

    this.physics.world.createCollider(colDesc, this.chassisBody);
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
    const rayLength = this.tuning.suspensionRestLength + this.wheelRadius + 0.15;
    const rayDir = upVec.clone().negate();

    const compressions = [0, 0, 0, 0];
    const hitPoints: (THREE.Vector3 | null)[] = [null, null, null, null];
    const hitNormals: THREE.Vector3[] = [upVec.clone(), upVec.clone(), upVec.clone(), upVec.clone()];

    for (let i = 0; i < 4; i++) {
      const localAnchor = this.wheelAnchors[i];
      const worldAnchor = localAnchor.clone().applyQuaternion(chassisQuat).add(worldChassisPos);

      // Cast ray with Rapier
      const ray = new rapier.Ray(
        { x: worldAnchor.x, y: worldAnchor.y, z: worldAnchor.z },
        { x: rayDir.x, y: rayDir.y, z: rayDir.z }
      );

      // Hit filter excluding chassis itself
      const hit = this.physics.world.castRayAndGetNormal(
        ray,
        rayLength,
        true,
        undefined,
        undefined,
        undefined,
        this.chassisBody
      );

      if (hit && hit.timeOfImpact < rayLength) {
        this.wheelInContact[i] = true;
        const currentLength = hit.timeOfImpact - this.wheelRadius;
        this.currentSuspensionLengths[i] = currentLength;
        compressions[i] = Math.max(0, this.tuning.suspensionRestLength - currentLength);

        const hp = worldAnchor.clone().add(rayDir.clone().multiplyScalar(hit.timeOfImpact));
        hitPoints[i] = hp;
        hitNormals[i] = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
      } else {
        this.wheelInContact[i] = false;
        this.prevWheelInContact[i] = false;
        this.currentSuspensionLengths[i] = this.tuning.suspensionRestLength;
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
    const arbRear = (compressions[2] - compressions[3]) * this.tuning.antiRollBarStiffness;

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

      const damperCoeff = suspVelocity >= 0 ? this.tuning.damperCompression : this.tuning.damperRebound;
      let Fz = deltaX * this.tuning.springStiffness + suspVelocity * damperCoeff;

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

  private createChassisVisuals(): void {
    const carGroup = new THREE.Group();

    // Materials using verified sampled palette
    const bodyMat = new THREE.MeshStandardMaterial({
      color: THREE_PALETTE.carBodyLit,
      roughness: 0.35,
      metalness: 0.1,
      flatShading: true,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: THREE_PALETTE.carTrimBlack,
      roughness: 0.8,
      metalness: 0.1,
      flatShading: true,
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1a2634,
      roughness: 0.1,
      metalness: 0.6,
      flatShading: true,
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

    // 1. Main Lower Body
    const lowerBodyGeom = new THREE.BoxGeometry(1.7, 0.45, 4.1);
    const lowerBody = new THREE.Mesh(lowerBodyGeom, bodyMat);
    lowerBody.position.y = 0.2;
    lowerBody.castShadow = true;
    carGroup.add(lowerBody);

    // 2. Cabin / Greenhouse
    const cabinGeom = new THREE.BoxGeometry(1.4, 0.48, 2.0);
    const cabin = new THREE.Mesh(cabinGeom, glassMat);
    cabin.position.set(0, 0.64, -0.2);
    cabin.castShadow = true;
    carGroup.add(cabin);

    // Roof cap
    const roofGeom = new THREE.BoxGeometry(1.36, 0.08, 1.7);
    const roof = new THREE.Mesh(roofGeom, bodyMat);
    roof.position.set(0, 0.9, -0.2);
    roof.castShadow = true;
    carGroup.add(roof);

    // 3. Flared Wheel Arches
    const flareGeom = new THREE.BoxGeometry(0.12, 0.38, 0.9);
    for (const [x, z] of [[-0.88, 1.2], [0.88, 1.2], [-0.88, -1.2], [0.88, -1.2]]) {
      const flare = new THREE.Mesh(flareGeom, bodyMat);
      flare.position.set(x, 0.18, z);
      carGroup.add(flare);
    }

    // 4. Rear Spoiler on Twin Pylons
    const wingPylonGeom = new THREE.BoxGeometry(0.06, 0.32, 0.15);
    const pylonL = new THREE.Mesh(wingPylonGeom, trimMat);
    pylonL.position.set(-0.6, 0.56, -1.85);
    carGroup.add(pylonL);

    const pylonR = new THREE.Mesh(wingPylonGeom, trimMat);
    pylonR.position.set(0.6, 0.56, -1.85);
    carGroup.add(pylonR);

    const wingBladeGeom = new THREE.BoxGeometry(1.75, 0.06, 0.45);
    const wingBlade = new THREE.Mesh(wingBladeGeom, trimMat);
    wingBlade.position.set(0, 0.72, -1.9);
    wingBlade.castShadow = true;
    carGroup.add(wingBlade);

    // 5. 3-Tier Taillights (Red, Amber, Reverse White matching sampled pixel data)
    // Left cluster
    const tlRedL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.10, 0.05), this.brakeLightMat);
    tlRedL.position.set(-0.55, 0.30, -2.06);
    carGroup.add(tlRedL);

    const tlAmberL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.05), amberLightMat);
    tlAmberL.position.set(-0.63, 0.19, -2.06);
    carGroup.add(tlAmberL);

    const tlWhiteL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.05), whiteLightMat);
    tlWhiteL.position.set(-0.47, 0.19, -2.06);
    carGroup.add(tlWhiteL);

    // Right cluster
    const tlRedR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.10, 0.05), this.brakeLightMat);
    tlRedR.position.set(0.55, 0.30, -2.06);
    carGroup.add(tlRedR);

    const tlAmberR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.05), amberLightMat);
    tlAmberR.position.set(0.63, 0.19, -2.06);
    carGroup.add(tlAmberR);

    const tlWhiteR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.05), whiteLightMat);
    tlWhiteR.position.set(0.47, 0.19, -2.06);
    carGroup.add(tlWhiteR);

    // Glow quads behind each brake light cluster (larger soft emissive backing plates)
    const glowGeom = new THREE.PlaneGeometry(0.42, 0.18);
    const glowL = new THREE.Mesh(glowGeom, this.brakeLightGlowMat);
    glowL.position.set(-0.55, 0.30, -2.062);
    glowL.rotation.y = Math.PI;
    carGroup.add(glowL);

    const glowR = new THREE.Mesh(glowGeom, this.brakeLightGlowMat);
    glowR.position.set(0.55, 0.30, -2.062);
    glowR.rotation.y = Math.PI;
    carGroup.add(glowR);

    // 6. Custom License Plate: "APEX RALLY" (Replaced WISHLIST as requested!)
    if (typeof document !== 'undefined') {
      // Soft radial bloom sprites for brake lights
      const bCanvas = document.createElement('canvas');
      bCanvas.width = 128;
      bCanvas.height = 128;
      const bctx = bCanvas.getContext('2d')!;
      const grad = bctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255, 245, 230, 1.0)'); // white-hot emitter core
      grad.addColorStop(0.18, 'rgba(255, 30, 0, 0.95)');  // vibrant pure red
      grad.addColorStop(0.45, 'rgba(255, 10, 0, 0.60)');  // rich saturated bloom
      grad.addColorStop(0.75, 'rgba(220, 0, 0, 0.22)');   // soft outer aura
      grad.addColorStop(1.0, 'rgba(180, 0, 0, 0.0)');     // transparent
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
      this.brakeLightSpriteL.position.set(-0.55, 0.30, -2.12);
      carGroup.add(this.brakeLightSpriteL);

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
      this.brakeLightSpriteR.position.set(0.55, 0.30, -2.12);
      carGroup.add(this.brakeLightSpriteR);

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
      plateMesh.position.set(0, 0.18, -2.065);
      plateMesh.rotateY(Math.PI);
      carGroup.add(plateMesh);
    }

    // 7. Exhaust Pipe
    const exhaustGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.25, 8);
    exhaustGeom.rotateX(Math.PI / 2);
    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });
    const exhaust = new THREE.Mesh(exhaustGeom, exhaustMat);
    exhaust.position.set(0.48, -0.02, -2.08);
    carGroup.add(exhaust);

    // 8. Quad Front Rally Pods
    for (let i = -1.5; i <= 1.5; i += 1.0) {
      const lampGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8);
      lampGeom.rotateX(Math.PI / 2);
      const lampMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.6,
        flatShading: true,
      });
      const lamp = new THREE.Mesh(lampGeom, lampMat);
      lamp.position.set(i * 0.32, 0.22, 2.06);
      carGroup.add(lamp);
    }

    this.chassisMesh.add(carGroup);
  }

  private createWheelVisuals(): void {
    const tireGeom = new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, 0.28, 12);
    tireGeom.rotateZ(Math.PI / 2);

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x1f2022,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });

    const rimGeom = new THREE.CylinderGeometry(this.wheelRadius * 0.62, this.wheelRadius * 0.62, 0.29, 8);
    rimGeom.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.3,
      metalness: 0.7,
      flatShading: true,
    });

    for (let i = 0; i < 4; i++) {
      const wheelGroup = new THREE.Group();
      const tire = new THREE.Mesh(tireGeom, tireMat);
      tire.castShadow = true;
      wheelGroup.add(tire);

      const rim = new THREE.Mesh(rimGeom, rimMat);
      wheelGroup.add(rim);

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
