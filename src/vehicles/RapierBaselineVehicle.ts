import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { THREE_PALETTE, PALETTE } from '../core/Constants';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { VehicleInputs } from '../core/InputManager';

export interface VehicleTelemetry {
  speedMph: number;
  speedKmh: number;
  rpm: number;
  gear: number | string;
  isRwd: boolean;
  throttleInput: number;
  brakeInput: number;
  steerInput: number;
  handbrakeActive: boolean;
  wheelContacts: boolean[];
  suspensionLengths: number[];
  suspensionForces: number[];
  lateralG: number;
  surfaceName?: string;
  gripMultiplier?: number;

  // V1 Debug Overlay metrics
  isShifting?: boolean;
  shiftTimer?: number;
  engineTorqueMult?: number;
  wheelForcesLongitudinal?: number[];
  wheelForcesLateral?: number[];
  wheelForcesNormal?: number[];
  wheelSlipRatios?: number[];
  wheelSlipAnglesDeg?: number[];
  wheelSpeedsMph?: number[];
  groundSpeedsMph?: number[];
  frictionEllipseUsage?: number[];
  wheelContactPoints?: (THREE.Vector3 | null)[];
  wheelHeadings?: THREE.Vector3[];
  wheelLaterals?: THREE.Vector3[];

  // V4 Drift & Dynamics metrics
  driftAngleDeg?: number;
  isDrifting?: boolean;
  driftStateTransitions?: number;
  yawRateDeg?: number;
}

export interface VehicleTuningParams {
  suspensionStiffness: number;
  suspensionCompression: number;
  suspensionRelaxation: number;
  maxSuspensionTravel: number;
  maxSuspensionForce: number;
  frictionSlip: number;
  sideFrictionStiffness: number;
  maxEngineForce: number;
  maxBrakeForce: number;
  handbrakeForce: number;
  maxSteerAngleDeg: number;
  isRwd: boolean;
  // Load sensitivity clamp parameters (for Phase 2 preview)
  loadFrictionMinClamp: number;
  loadSensitivityFactor: number;
}

export class RapierBaselineVehicle {
  public chassisMesh: THREE.Group;
  public wheelMeshes: THREE.Group[] = [];
  public vehicleController!: RAPIER.DynamicRayCastVehicleController;
  public chassisBody!: RAPIER.RigidBody;

  // Visual sub-elements
  private brakeLightMat!: THREE.MeshStandardMaterial;
  private runningLightMat!: THREE.MeshStandardMaterial;

  // Drivetrain simulation
  public tuning: VehicleTuningParams = {
    suspensionStiffness: 45.0,
    suspensionCompression: 4.5,
    suspensionRelaxation: 5.5,
    maxSuspensionTravel: 0.35,
    maxSuspensionForce: 16000.0,
    frictionSlip: 3.2,
    sideFrictionStiffness: 4.5,
    maxEngineForce: 2800.0,
    maxBrakeForce: 1400.0,
    handbrakeForce: 2200.0,
    maxSteerAngleDeg: 32.0,
    isRwd: true,
    loadFrictionMinClamp: 0.25,
    loadSensitivityFactor: 0.00008,
  };

  private currentGear = 1;
  private currentRpm = 1000;
  private gearRatios = [3.4, 2.1, 1.45, 1.1, 0.82];
  private finalDrive = 3.8;
  private wheelRadius = 0.35;
  private wheelBase = 2.4;
  private trackWidth = 1.65;

  private steerAngle = 0;
  private prevVelocity = new THREE.Vector3();
  private lateralG = 0;

  constructor(private scene: THREE.Scene, private physics: PhysicsWorld) {
    this.chassisMesh = new THREE.Group();
    this.createChassisVisuals();
    this.createWheelVisuals();
    this.initPhysics();
    this.scene.add(this.chassisMesh);
  }

  private initPhysics(): void {
    const rapier = this.physics.rapier;

    // 1. Dynamic Rigid Body for Chassis (Mass ~ 1150 kg)
    const startY = 1.2;
    const bodyDesc = rapier.RigidBodyDesc.dynamic()
      .setTranslation(0, startY, -8)
      .setLinearDamping(0.04)
      .setAngularDamping(0.2)
      .setCanSleep(false);

    this.chassisBody = this.physics.world.createRigidBody(bodyDesc);

    // Chassis Box Collider (width=1.7, height=0.6, length=4.1)
    const halfWidth = 0.85;
    const halfHeight = 0.3;
    const halfLength = 2.05;
    const colDesc = rapier.ColliderDesc.cuboid(halfWidth, halfHeight, halfLength)
      .setDensity(250) // Gives ~1100-1200kg
      .setFriction(0.4)
      .setRestitution(0.05);

    this.physics.world.createCollider(colDesc, this.chassisBody);

    // 2. Create DynamicRayCastVehicleController
    this.vehicleController = this.physics.world.createVehicleController(this.chassisBody);
    this.vehicleController.indexUpAxis = 1; // Y is UP
    this.vehicleController.setIndexForwardAxis = 2; // +Z is FORWARD

    const suspensionRestLength = 0.38;
    const wheelRadius = this.wheelRadius;
    const halfTrack = this.trackWidth / 2;
    const halfWb = this.wheelBase / 2;
    const connY = -0.15; // Suspension top anchor point relative to chassis center

    const dirDown = { x: 0, y: -1, z: 0 };
    const axleX = { x: -1, y: 0, z: 0 };

    // Wheel 0: Front Left (FL)
    this.vehicleController.addWheel(
      { x: -halfTrack, y: connY, z: halfWb },
      dirDown,
      axleX,
      suspensionRestLength,
      wheelRadius
    );

    // Wheel 1: Front Right (FR)
    this.vehicleController.addWheel(
      { x: halfTrack, y: connY, z: halfWb },
      dirDown,
      axleX,
      suspensionRestLength,
      wheelRadius
    );

    // Wheel 2: Rear Left (RL)
    this.vehicleController.addWheel(
      { x: -halfTrack, y: connY, z: -halfWb },
      dirDown,
      axleX,
      suspensionRestLength,
      wheelRadius
    );

    // Wheel 3: Rear Right (RR)
    this.vehicleController.addWheel(
      { x: halfTrack, y: connY, z: -halfWb },
      dirDown,
      axleX,
      suspensionRestLength,
      wheelRadius
    );

    this.applyTuning();
  }

  public applyTuning(): void {
    if (!this.vehicleController) return;

    for (let i = 0; i < 4; i++) {
      this.vehicleController.setWheelSuspensionStiffness(i, this.tuning.suspensionStiffness);
      this.vehicleController.setWheelSuspensionCompression(i, this.tuning.suspensionCompression);
      this.vehicleController.setWheelSuspensionRelaxation(i, this.tuning.suspensionRelaxation);
      this.vehicleController.setWheelMaxSuspensionTravel(i, this.tuning.maxSuspensionTravel);
      this.vehicleController.setWheelMaxSuspensionForce(i, this.tuning.maxSuspensionForce);
      this.vehicleController.setWheelFrictionSlip(i, this.tuning.frictionSlip);
      this.vehicleController.setWheelSideFrictionStiffness(i, this.tuning.sideFrictionStiffness);
    }
  }

  private createChassisVisuals(): void {
    const carGroup = new THREE.Group();

    // Materials
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
      emissiveIntensity: 0.5,
      flatShading: true,
    });

    this.brakeLightMat = new THREE.MeshStandardMaterial({
      color: 0xff1e00,
      emissive: 0xff1e00,
      emissiveIntensity: 1.5,
      flatShading: true,
    });

    const amberLightMat = new THREE.MeshStandardMaterial({
      color: THREE_PALETTE.carTaillightAmber,
      emissive: THREE_PALETTE.carTaillightAmber,
      emissiveIntensity: 0.3,
      flatShading: true,
    });

    // 1. Main Lower Body (Wedge proportions)
    const lowerBodyGeom = new THREE.BoxGeometry(1.7, 0.45, 4.1);
    const lowerBody = new THREE.Mesh(lowerBodyGeom, bodyMat);
    lowerBody.position.y = 0.2;
    lowerBody.castShadow = true;
    carGroup.add(lowerBody);

    // 2. Cabin / Roof (Narrowed greenhouse)
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

    // 3. Flared Wheel Arches (Iconic Group B box flares)
    const flareMat = bodyMat;
    const flareGeom = new THREE.BoxGeometry(0.12, 0.38, 0.9);

    const flFlare = new THREE.Mesh(flareGeom, flareMat);
    flFlare.position.set(-0.88, 0.18, 1.2);
    carGroup.add(flFlare);

    const frFlare = new THREE.Mesh(flareGeom, flareMat);
    frFlare.position.set(0.88, 0.18, 1.2);
    carGroup.add(frFlare);

    const rlFlare = new THREE.Mesh(flareGeom, flareMat);
    rlFlare.position.set(-0.88, 0.18, -1.2);
    carGroup.add(rlFlare);

    const rrFlare = new THREE.Mesh(flareGeom, flareMat);
    rrFlare.position.set(0.88, 0.18, -1.2);
    carGroup.add(rrFlare);

    // 4. Rear Spoiler (Mounted on twin wing pylons)
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

    // 5. Taillight Cluster (Left and Right matching screenshots)
    // Left cluster
    const tlRedL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), this.runningLightMat);
    tlRedL.position.set(-0.55, 0.28, -2.06);
    carGroup.add(tlRedL);

    const tlAmberL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), amberLightMat);
    tlAmberL.position.set(-0.74, 0.28, -2.06);
    carGroup.add(tlAmberL);

    // Right cluster
    const tlRedR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), this.runningLightMat);
    tlRedR.position.set(0.55, 0.28, -2.06);
    carGroup.add(tlRedR);

    const tlAmberR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), amberLightMat);
    tlAmberR.position.set(0.74, 0.28, -2.06);
    carGroup.add(tlAmberR);

    // 6. License Plate ("WISHLIST" as in Screenshot 1)
    const plateGeom = new THREE.BoxGeometry(0.5, 0.14, 0.04);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5, flatShading: true });
    const plate = new THREE.Mesh(plateGeom, plateMat);
    plate.position.set(0, 0.18, -2.06);
    carGroup.add(plate);

    // 7. Exhaust Pipe on bottom right
    const exhaustGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.25, 8);
    exhaustGeom.rotateX(Math.PI / 2);
    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.2 });
    const exhaust = new THREE.Mesh(exhaustGeom, exhaustMat);
    exhaust.position.set(0.48, -0.02, -2.08);
    carGroup.add(exhaust);

    // 8. Quad Front Rally Pods (Bumper lights)
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

  /**
   * Called on every 120 Hz physics substep.
   */
  public updatePhysicsSubstep(dt: number, inputs: VehicleInputs): void {
    if (!this.vehicleController || !this.chassisBody) return;

    // Handle reset trigger
    if (inputs.reset) {
      this.resetPosition();
      return;
    }

    // Toggle RWD / AWD
    if (inputs.drivetrainToggle) {
      this.tuning.isRwd = !this.tuning.isRwd;
    }

    const currentSpeed = this.vehicleController.currentVehicleSpeed(); // m/s
    const speedMph = Math.abs(currentSpeed) * 2.23694;

    // 1. Steering with speed-dependent attenuation
    const maxSteerRad = THREE.MathUtils.degToRad(this.tuning.maxSteerAngleDeg);
    // Attenuate steering at high speed to prevent twitchiness
    const speedFactor = Math.min(1.0, 30 / Math.max(15, speedMph));
    const targetSteer = -inputs.steer * maxSteerRad * speedFactor;

    // Smooth steering rack
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1.0, 18.0 * dt);
    this.vehicleController.setWheelSteering(0, this.steerAngle);
    this.vehicleController.setWheelSteering(1, this.steerAngle);

    // 2. Engine Force & Gearbox (RWD by default, AWD optional)
    let engineForce = inputs.throttle * this.tuning.maxEngineForce;
    if (inputs.throttle > 0 && currentSpeed < -0.5) {
      // Reversing to forward brake
      engineForce = 0;
    }

    // Reverse gear if braking while nearly stopped
    if (inputs.brake > 0 && Math.abs(currentSpeed) < 1.0) {
      engineForce = -inputs.brake * this.tuning.maxEngineForce * 0.6;
      this.currentGear = -1;
    } else {
      this.simulateGearbox(currentSpeed);
    }

    const isRwd = this.tuning.isRwd;
    if (isRwd) {
      // Rear wheels only (wheels 2 and 3)
      this.vehicleController.setWheelEngineForce(0, 0);
      this.vehicleController.setWheelEngineForce(1, 0);
      this.vehicleController.setWheelEngineForce(2, engineForce);
      this.vehicleController.setWheelEngineForce(3, engineForce);
    } else {
      // AWD 40/60 split
      this.vehicleController.setWheelEngineForce(0, engineForce * 0.4);
      this.vehicleController.setWheelEngineForce(1, engineForce * 0.4);
      this.vehicleController.setWheelEngineForce(2, engineForce * 0.6);
      this.vehicleController.setWheelEngineForce(3, engineForce * 0.6);
    }

    // 3. Normal Braking
    const brakeForce = inputs.brake * this.tuning.maxBrakeForce;
    for (let i = 0; i < 4; i++) {
      this.vehicleController.setWheelBrake(i, brakeForce);
    }

    // 4. Handbrake Dynamics (clamps rear wheels without full lock)
    if (inputs.handbrake) {
      // Rear wheels (2 and 3) receive strong handbrake force
      this.vehicleController.setWheelBrake(2, this.tuning.handbrakeForce);
      this.vehicleController.setWheelBrake(3, this.tuning.handbrakeForce);
      // Reduce rear friction slip dynamically to initiate drift swing
      this.vehicleController.setWheelFrictionSlip(2, this.tuning.frictionSlip * 0.35);
      this.vehicleController.setWheelFrictionSlip(3, this.tuning.frictionSlip * 0.35);
    } else {
      this.vehicleController.setWheelFrictionSlip(2, this.tuning.frictionSlip);
      this.vehicleController.setWheelFrictionSlip(3, this.tuning.frictionSlip);
    }

    // Update Rapier vehicle controller
    this.vehicleController.updateVehicle(dt);

    // Calculate lateral G-force
    const vel = this.chassisBody.linvel();
    const currentVelVec = new THREE.Vector3(vel.x, vel.y, vel.z);
    const accelVec = currentVelVec.clone().sub(this.prevVelocity).divideScalar(dt);
    this.prevVelocity.copy(currentVelVec);
    this.lateralG = accelVec.length() / 9.81;
  }

  private simulateGearbox(speedMs: number): void {
    const speedMph = Math.abs(speedMs) * 2.23694;
    // Simple 5-speed automatic gear selection based on speed thresholds
    if (speedMph < 18) this.currentGear = 1;
    else if (speedMph < 38) this.currentGear = 2;
    else if (speedMph < 65) this.currentGear = 3;
    else if (speedMph < 95) this.currentGear = 4;
    else this.currentGear = 5;

    // RPM derived from gear ratio and speed
    const ratio = this.gearRatios[Math.max(0, this.currentGear - 1)] * this.finalDrive;
    const wheelRpm = (Math.abs(speedMs) / (2 * Math.PI * this.wheelRadius)) * 60;
    this.currentRpm = Math.min(7500, Math.max(1000, wheelRpm * ratio));
  }

  /**
   * Called on every render frame (60-120 FPS) to sync visual Three.js meshes to Rapier.
   */
  public updateVisuals(inputs: VehicleInputs): void {
    if (!this.chassisBody || !this.vehicleController) return;

    // 1. Synchronize chassis transform
    const trans = this.chassisBody.translation();
    const rot = this.chassisBody.rotation();

    this.chassisMesh.position.set(trans.x, trans.y, trans.z);
    this.chassisMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

    // 2. Synchronize 4 wheel transforms
    const chassisQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const chassisPos = new THREE.Vector3(trans.x, trans.y, trans.z);

    for (let i = 0; i < 4; i++) {
      const wheelMesh = this.wheelMeshes[i];
      if (!wheelMesh) continue;

      // Local connection point
      const conn = this.vehicleController.wheelChassisConnectionPointCs(i);
      const suspLen = this.vehicleController.wheelSuspensionLength(i) ?? 0.38;
      const dir = this.vehicleController.wheelDirectionCs(i);

      if (!conn || !dir) continue;

      // Wheel position in chassis space = conn + dir * suspLen
      const localWheelPos = new THREE.Vector3(
        conn.x + dir.x * suspLen,
        conn.y + dir.y * suspLen,
        conn.z + dir.z * suspLen
      );

      // Convert to world space
      localWheelPos.applyQuaternion(chassisQuat);
      wheelMesh.position.copy(chassisPos).add(localWheelPos);

      // Wheel rotation: combine chassis rotation, steering (front wheels), and wheel roll
      const steering = (i < 2) ? this.steerAngle : 0;
      const wheelRot = this.vehicleController.wheelRotation(i) ?? 0;

      wheelMesh.quaternion.copy(chassisQuat);
      const steerQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steering);
      const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), wheelRot);

      wheelMesh.quaternion.multiply(steerQuat).multiply(rollQuat);
    }

    // 3. Update brake light visuals
    const isBraking = inputs.brake > 0.05 || inputs.handbrake;
    if (this.brakeLightMat) {
      this.brakeLightMat.emissiveIntensity = isBraking ? 2.2 : 0.4;
      this.brakeLightMat.color.setHex(isBraking ? 0xff1e00 : 0xaa0000);
    }
  }

  public resetPosition(): void {
    if (!this.chassisBody) return;
    this.chassisBody.setTranslation({ x: 0, y: 1.2, z: -8 }, true);
    this.chassisBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steerAngle = 0;
    this.prevVelocity.set(0, 0, 0);
  }

  public getTelemetry(inputs: VehicleInputs): VehicleTelemetry {
    const speedMs = this.vehicleController ? this.vehicleController.currentVehicleSpeed() : 0;
    const speedMph = Math.abs(speedMs) * 2.23694;
    const speedKmh = Math.abs(speedMs) * 3.6;

    const contacts: boolean[] = [];
    const lengths: number[] = [];
    const forces: number[] = [];

    if (this.vehicleController) {
      for (let i = 0; i < 4; i++) {
        contacts.push(!!this.vehicleController.wheelIsInContact(i));
        lengths.push(this.vehicleController.wheelSuspensionLength(i) ?? 0);
        forces.push(this.vehicleController.wheelSuspensionForce(i) ?? 0);
      }
    }

    return {
      speedMph,
      speedKmh,
      rpm: this.currentRpm,
      gear: this.currentGear === -1 ? 'R' : this.currentGear,
      isRwd: this.tuning.isRwd,
      throttleInput: inputs.throttle,
      brakeInput: inputs.brake,
      steerInput: inputs.steer,
      handbrakeActive: inputs.handbrake,
      wheelContacts: contacts,
      suspensionLengths: lengths,
      suspensionForces: forces,
      lateralG: this.lateralG,
    };
  }
}
