import * as THREE from 'three';
import { VehicleTelemetry } from './RapierBaselineVehicle';

/**
 * CockpitController handles:
 * 1. Cabin interior (dashboard, center console, sequential shifter lever, roll cage)
 * 2. Rotating steering wheel (+-180 deg) with rally alignment marker
 * 3. Working analog dashboard gauges (Tachometer 0-240 deg, Speedometer 0-220 deg)
 * 4. Driver model with 2-bone arm IK gripping the wheel and animated gear shifting
 */
export class CockpitController {
  public group = new THREE.Group();

  // Cockpit sub-elements
  private steeringWheelGroup = new THREE.Group();
  private tachoNeedle!: THREE.Mesh;
  private speedoNeedle!: THREE.Mesh;
  private shifterLever!: THREE.Mesh;

  // Driver body parts
  private driverTorso!: THREE.Mesh;
  private driverHead!: THREE.Mesh;

  // Left Arm (grips 9 o'clock)
  private leftUpperArm!: THREE.Mesh;
  private leftForearm!: THREE.Mesh;
  private leftHand!: THREE.Mesh;

  // Right Arm (grips 3 o'clock, shifts gears)
  private rightUpperArm!: THREE.Mesh;
  private rightForearm!: THREE.Mesh;
  private rightHand!: THREE.Mesh;

  // Shift animation state
  private isShiftingAnim = false;
  private shiftTimer = 0;
  private shiftDuration = 0.16; // 160ms flick
  private prevGear: number | string = 1;

  // Positions relative to car chassis origin
  // Driver sits on left: x = -0.32, y = 0.42, z = -0.15
  private readonly driverPos = new THREE.Vector3(-0.32, 0.44, -0.18);
  private readonly wheelCenter = new THREE.Vector3(-0.32, 0.58, 0.22);
  private readonly shifterPos = new THREE.Vector3(0.0, 0.32, 0.12);

  // Arm joint anchor offsets from driver torso
  private readonly leftShoulder = new THREE.Vector3(-0.48, 0.62, -0.16);
  private readonly rightShoulder = new THREE.Vector3(-0.16, 0.62, -0.16);

  // Fixed 2-bone lengths
  private readonly upperArmLen = 0.28;
  private readonly forearmLen = 0.26;

  constructor(private carGroup: THREE.Group) {
    this.buildCockpitInterior();
    this.buildSteeringWheel();
    this.buildAnalogGauges();
    this.buildDriverRig();

    this.carGroup.add(this.group);
  }

  private buildCockpitInterior(): void {
    const dashMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true,
    });

    const consoleMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
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

    // 1. Dashboard structure spanning beneath windshield
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.24, 0.42), dashMat);
    dash.position.set(0, 0.52, 0.36);
    dash.rotation.x = -0.15;
    this.group.add(dash);

    // Instrument binnacle cowl over driver side (x = -0.32)
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.26), dashMat);
    cowl.position.set(-0.32, 0.62, 0.30);
    cowl.rotation.x = -0.18;
    this.group.add(cowl);

    // 2. Center console sloping down between bucket seats
    const centerConsole = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.72), consoleMat);
    centerConsole.position.set(0, 0.26, 0.05);
    centerConsole.rotation.x = -0.25;
    this.group.add(centerConsole);

    // 3. Sequential gear shifter pedestal & lever
    const shifterBase = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 8), consoleMat);
    shifterBase.position.copy(this.shifterPos);
    this.group.add(shifterBase);

    this.shifterLever = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), metalMat);
    this.shifterLever.position.set(this.shifterPos.x, this.shifterPos.y + 0.10, this.shifterPos.z);
    this.shifterLever.rotation.x = 0.12;

    const shiftKnob = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.2 })
    );
    shiftKnob.position.set(0, 0.11, 0);
    this.shifterLever.add(shiftKnob);
    this.group.add(this.shifterLever);

    // Hydraulic handbrake vertical wand next to shifter
    const ebrake = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.26, 8), metalMat);
    ebrake.position.set(0.09, 0.42, 0.08);
    ebrake.rotation.x = -0.22;
    this.group.add(ebrake);
  }

  private buildSteeringWheel(): void {
    // Steering column angled toward driver
    const columnGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8);
    const columnMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
    const col = new THREE.Mesh(columnGeom, columnMat);
    col.position.set(this.wheelCenter.x, this.wheelCenter.y - 0.07, this.wheelCenter.z + 0.08);
    col.rotation.x = Math.PI / 3.2;
    this.group.add(col);

    // Steering wheel group placed at wheel center, angled back ~28 degrees
    this.steeringWheelGroup.position.copy(this.wheelCenter);
    this.steeringWheelGroup.rotation.x = -Math.PI / 6.5; // Angled facing driver

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.6,
      metalness: 0.1,
    });

    const spokeMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.3,
      metalness: 0.8,
    });

    // Torus rim (diameter ~34 cm -> radius 0.17m)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 10, 24), rimMat);
    this.steeringWheelGroup.add(rim);

    // 3 spokes (left, right, bottom)
    for (const angle of [0, Math.PI, -Math.PI / 2]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 0.008), spokeMat);
      spoke.position.set((Math.cos(angle) * 0.14) / 2, (Math.sin(angle) * 0.14) / 2, 0);
      spoke.rotation.z = angle;
      this.steeringWheelGroup.add(spoke);
    }

    // Center horn hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.02, 12), spokeMat);
    hub.rotateX(Math.PI / 2);
    this.steeringWheelGroup.add(hub);

    // Rally yellow top centering stripe at 12 o'clock
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 })
    );
    stripe.position.set(0, 0.16, 0);
    this.steeringWheelGroup.add(stripe);

    this.group.add(this.steeringWheelGroup);
  }

  private buildAnalogGauges(): void {
    const dialFaceMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x71717a, roughness: 0.4, metalness: 0.8 });
    const needleMat = new THREE.MeshBasicMaterial({ color: 0xef4444 }); // Fluorescent red

    // Gauges sitting in instrument cluster behind wheel (z = 0.32)
    // 1. Tachometer (Left, x = -0.38, y = 0.60)
    const tachoBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.015, 16), bezelMat);
    tachoBezel.rotateX(Math.PI / 2.3);
    tachoBezel.position.set(-0.38, 0.60, 0.33);
    this.group.add(tachoBezel);

    const tachoFace = new THREE.Mesh(new THREE.CircleGeometry(0.048, 16), dialFaceMat);
    tachoFace.position.set(0, 0.009, 0);
    tachoFace.rotateX(-Math.PI / 2);
    tachoBezel.add(tachoFace);

    // Tachometer Needle (pivot at center)
    const tachoNeedleGeom = new THREE.ConeGeometry(0.005, 0.038, 3);
    tachoNeedleGeom.translate(0, 0.019, 0); // Pivot at base
    this.tachoNeedle = new THREE.Mesh(tachoNeedleGeom, needleMat);
    this.tachoNeedle.position.set(0, 0.011, 0);
    this.tachoNeedle.rotation.x = -Math.PI / 2;
    tachoBezel.add(this.tachoNeedle);

    // 2. Speedometer (Right, x = -0.26, y = 0.60)
    const speedoBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.015, 16), bezelMat);
    speedoBezel.rotateX(Math.PI / 2.3);
    speedoBezel.position.set(-0.26, 0.60, 0.33);
    this.group.add(speedoBezel);

    const speedoFace = new THREE.Mesh(new THREE.CircleGeometry(0.048, 16), dialFaceMat);
    speedoFace.position.set(0, 0.009, 0);
    speedoFace.rotateX(-Math.PI / 2);
    speedoBezel.add(speedoFace);

    // Speedometer Needle
    const speedoNeedleGeom = new THREE.ConeGeometry(0.005, 0.038, 3);
    speedoNeedleGeom.translate(0, 0.019, 0);
    this.speedoNeedle = new THREE.Mesh(speedoNeedleGeom, needleMat);
    this.speedoNeedle.position.set(0, 0.011, 0);
    this.speedoNeedle.rotation.x = -Math.PI / 2;
    speedoBezel.add(this.speedoNeedle);
  }

  private buildDriverRig(): void {
    const suitMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a, // Rally navy blue racing suit
      roughness: 0.75,
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

    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // High-grip amber suede gloves
      roughness: 0.8,
      flatShading: true,
    });

    // Driver Torso seated in bucket seat
    this.driverTorso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 0.28), suitMat);
    this.driverTorso.position.set(this.driverPos.x, this.driverPos.y + 0.18, this.driverPos.z);
    this.driverTorso.rotation.x = -0.18; // Lean slightly back in bucket seat
    this.group.add(this.driverTorso);

    // Driver Racing Helmet & Visor
    this.driverHead = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), helmetMat);
    this.driverHead.position.set(this.driverPos.x, this.driverPos.y + 0.46, this.driverPos.z + 0.02);
    this.group.add(this.driverHead);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.09), visorMat);
    visor.position.set(0, 0.01, 0.08);
    this.driverHead.add(visor);

    // Left Arm Setup
    this.leftUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, this.upperArmLen, 6), suitMat);
    this.leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, this.forearmLen, 6), suitMat);
    this.leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.06), gloveMat);
    this.group.add(this.leftUpperArm);
    this.group.add(this.leftForearm);
    this.group.add(this.leftHand);

    // Right Arm Setup
    this.rightUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, this.upperArmLen, 6), suitMat);
    this.rightForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, this.forearmLen, 6), suitMat);
    this.rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.06), gloveMat);
    this.group.add(this.rightUpperArm);
    this.group.add(this.rightForearm);
    this.group.add(this.rightHand);
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
    handMesh: THREE.Mesh,
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
    handMesh.position.copy(targetHand);
    handMesh.quaternion.copy(forearmMesh.quaternion);
  }

  /**
   * Update cockpit, steering wheel, gauges, and driver arms every frame
   */
  public update(dt: number, telemetry: VehicleTelemetry, steerInput: number): void {
    // 1. Rotate Steering Wheel (up to +-180 deg / +-PI)
    const targetWheelRot = -steerInput * Math.PI;
    this.steeringWheelGroup.rotation.z = THREE.MathUtils.lerp(
      this.steeringWheelGroup.rotation.z,
      targetWheelRot,
      Math.min(1.0, 18.0 * dt)
    );

    // 2. Animate Analog Dashboard Needles
    // Tachometer: 0 to 8,500 RPM maps to 0 to 240 deg (start at -120 deg, sweep +240 deg)
    const rpm = Math.max(0, telemetry.rpm || 0);
    const rpmFraction = Math.min(1.0, rpm / 8500);
    const tachoAngle = (rpmFraction * 240.0 - 120.0) * (Math.PI / 180.0);
    if (this.tachoNeedle) {
      this.tachoNeedle.rotation.z = -tachoAngle;
    }

    // Speedometer: 0 to 140 mph maps to 0 to 220 deg
    const speedMph = Math.max(0, telemetry.speedMph || 0);
    const speedFraction = Math.min(1.0, speedMph / 140.0);
    const speedoAngle = (speedFraction * 220.0 - 110.0) * (Math.PI / 180.0);
    if (this.speedoNeedle) {
      this.speedoNeedle.rotation.z = -speedoAngle;
    }

    // 3. Gear Shifting Flick Detection
    if (telemetry.gear !== this.prevGear || telemetry.isShifting) {
      this.isShiftingAnim = true;
      this.shiftTimer = 0;
      this.prevGear = telemetry.gear;
    }

    if (this.isShiftingAnim) {
      this.shiftTimer += dt;
      if (this.shiftTimer >= this.shiftDuration) {
        this.isShiftingAnim = false;
        this.shifterLever.rotation.x = 0.12;
      } else {
        // Flick lever back then forward
        const t = this.shiftTimer / this.shiftDuration;
        const flick = Math.sin(t * Math.PI) * 0.35;
        this.shifterLever.rotation.x = 0.12 + flick;
      }
    }

    // 4. Update Driver Arm IK
    // Find world positions of 9 o'clock and 3 o'clock grips on the rotating wheel rim
    const rimRadius = 0.155;
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
        this.shifterPos.y + 0.22,
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
      this.leftHand,
      new THREE.Vector3(-0.6, 0.4, -0.4) // Outward elbow bend
    );

    this.solveTwoBoneIK(
      this.rightShoulder,
      activeRightTarget,
      this.rightUpperArm,
      this.rightForearm,
      this.rightHand,
      new THREE.Vector3(0.5, 0.3, -0.4)
    );

    // Subtle head tilt into turns (lookahead)
    const targetHeadYaw = -steerInput * 0.22;
    this.driverHead.rotation.y = THREE.MathUtils.lerp(
      this.driverHead.rotation.y,
      targetHeadYaw,
      Math.min(1.0, 10.0 * dt)
    );
  }
}
