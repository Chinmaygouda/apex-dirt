import * as THREE from 'three';
import { ChaseCamera } from './ChaseCamera';
import { CustomRallyVehicle } from '../vehicles/CustomRallyVehicle';
import { VehicleTelemetry } from '../vehicles/RapierBaselineVehicle';

export type CameraMode = 'CHASE' | 'COCKPIT_FPV' | 'HOOD';

export class CameraManager {
  public camera: THREE.PerspectiveCamera;
  public currentMode: CameraMode = 'CHASE';

  public chaseCam: ChaseCamera;
  public get followDistance() { return this.chaseCam.followDistance; }
  public set followDistance(v: number) { this.chaseCam.followDistance = v; }
  public get followHeight() { return this.chaseCam.followHeight; }
  public set followHeight(v: number) { this.chaseCam.followHeight = v; }
  public get cameraLag() { return this.chaseCam.cameraLag; }
  public set cameraLag(v: number) { this.chaseCam.cameraLag = v; }
  public get baseFov() { return this.chaseCam.baseFov; }
  public set baseFov(v: number) { this.chaseCam.baseFov = v; }
  public get maxSpeedFov() { return this.chaseCam.maxSpeedFov; }
  public set maxSpeedFov(v: number) { this.chaseCam.maxSpeedFov = v; }
  private headLookOffset = new THREE.Vector3();

  // Cockpit local eye position (Driver seat left side, seated back in bucket seat for spacious view)
  private readonly cockpitEyeOffset = new THREE.Vector3(-0.33, 0.62, -0.28);
  // Hood local camera position (Front center bonnet)
  private readonly hoodEyeOffset = new THREE.Vector3(0.0, 0.50, 1.55);

  constructor(aspect: number) {
    this.chaseCam = new ChaseCamera(aspect);
    this.camera = this.chaseCam.camera;
  }

  public cycleMode(): CameraMode {
    if (this.currentMode === 'CHASE') {
      this.currentMode = 'COCKPIT_FPV';
    } else if (this.currentMode === 'COCKPIT_FPV') {
      this.currentMode = 'HOOD';
    } else {
      this.currentMode = 'CHASE';
    }
    return this.currentMode;
  }

  public setMode(mode: CameraMode): void {
    this.currentMode = mode;
  }

  public onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.chaseCam.onResize(width, height);
  }

  public update(vehicle: CustomRallyVehicle, dt: number, steerInput: number = 0): void {
    if (!vehicle.chassisMesh || !vehicle.chassisBody) return;

    // Ensure vehicle and cockpit hide view-obscuring meshes when in Cockpit FPV mode
    vehicle.setCockpitViewMode(this.currentMode === 'COCKPIT_FPV');

    if (this.currentMode === 'CHASE') {
      this.chaseCam.update(vehicle, dt);
      return;
    }

    const chassisPos = vehicle.chassisMesh.position;
    const chassisQuat = vehicle.chassisMesh.quaternion;

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chassisQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(chassisQuat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(chassisQuat);

    const linvel = vehicle.chassisBody.linvel();
    const speedMph = Math.hypot(linvel.x, linvel.y, linvel.z) * 2.23694;

    if (this.currentMode === 'COCKPIT_FPV') {
      if (this.camera.near !== 0.04) { this.camera.near = 0.04; this.camera.updateProjectionMatrix(); }
      // Dynamic cockpit FOV: 74 deg base for spacious peripheral view, expanding to 84 deg at speed
      const targetFov = THREE.MathUtils.lerp(74, 84, Math.min(1.0, speedMph / 120.0));
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1.0, 6.0 * dt));
      this.camera.updateProjectionMatrix();

      // Transform cockpit eye offset to world space
      const worldEye = this.cockpitEyeOffset.clone().applyQuaternion(chassisQuat).add(chassisPos);
      this.camera.position.copy(worldEye);

      // Camera orientation: rock-steady forward view locked to vehicle chassis (NO steer yaw rotation).
      // Only the steering wheel in the cockpit rotates when steering!
      // Subtle -0.90m downward pitch over 35m horizon frames windshield, track, and dashboard naturally.
      const lookTarget = worldEye.clone().addScaledVector(forward, 35.0).addScaledVector(up, -0.90);
      this.camera.lookAt(lookTarget);
      this.camera.up.copy(up);

    } else {
      if (this.camera.near !== 0.1) { this.camera.near = 0.1; this.camera.updateProjectionMatrix(); }
    }
    if (this.currentMode === 'HOOD') {
      // Hood / Bumper camera: low and fast
      const targetFov = THREE.MathUtils.lerp(66, 80, Math.min(1.0, speedMph / 120.0));
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1.0, 6.0 * dt));
      this.camera.updateProjectionMatrix();

      const worldHood = this.hoodEyeOffset.clone().applyQuaternion(chassisQuat).add(chassisPos);
      this.camera.position.copy(worldHood);

      const lookTarget = worldHood.clone().add(forward.clone().multiplyScalar(40.0)).addScaledVector(up, 0.1);
      this.camera.lookAt(lookTarget);
      this.camera.up.copy(up);
    }
  }
}
