import * as THREE from 'three';
import { RapierBaselineVehicle } from '../vehicles/RapierBaselineVehicle';
import { CustomRallyVehicle } from '../vehicles/CustomRallyVehicle';

type AnyRallyVehicle = RapierBaselineVehicle | CustomRallyVehicle;

export class ChaseCamera {
  public camera: THREE.PerspectiveCamera;
  public followDistance = 5.2;
  public followHeight = 1.95;
  public cameraLag = 0.08; // Smooth interpolation factor
  public baseFov = 50;
  public maxSpeedFov = 62;

  public cameraMode: 'chase_follow' | 'chase_slide' = 'chase_follow';

  private currentTarget = new THREE.Vector3();
  private currentCameraPos = new THREE.Vector3();
  private currentCamDir = new THREE.Vector3(0, 0, 1);
  private currentLookDir = new THREE.Vector3(0, 0, 1);

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.1, 1000);
    this.camera.position.set(0, 4, -8);
  }

  public update(vehicle: AnyRallyVehicle, dt: number): void {
    if (!vehicle.chassisMesh || !vehicle.chassisBody) return;

    const chassisPos = vehicle.chassisMesh.position;
    const chassisQuat = vehicle.chassisMesh.quaternion;

    // Vehicle forward (+Z) and up (+Y) vectors in world space
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(chassisQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(chassisQuat);

    // Speed calculation
    const linvel = vehicle.chassisBody.linvel();
    const speedMs = Math.hypot(linvel.x, linvel.y, linvel.z);
    const speedMph = speedMs * 2.23694;

    // Dynamic FOV based on speed
    const fovRatio = Math.min(1.0, speedMph / 110.0);
    const targetFov = THREE.MathUtils.lerp(this.baseFov, this.maxSpeedFov, fovRatio);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1.0, 5.0 * dt));
    this.camera.updateProjectionMatrix();

    // Desired camera direction: smoothly blends behind velocity vector during slides over a wide speed range
    const velVec = new THREE.Vector3(linvel.x, 0, linvel.z);
    const vPlanar = velVec.length();

    // Continuous smooth transition over wide speed range (3 m/s ~ 6.7 mph to 18 m/s ~ 40 mph)
    const speedFactor = THREE.MathUtils.smoothstep(vPlanar, 3.0, 18.0);

    let slideFactor = 0;
    let normVel = forward.clone();
    if (vPlanar > 0.1) {
      normVel = velVec.clone().multiplyScalar(1 / vPlanar);
      const forwardDot = THREE.MathUtils.clamp(forward.dot(normVel), -1, 1);
      const slideAngleRad = Math.acos(forwardDot);
      slideFactor = THREE.MathUtils.smoothstep(slideAngleRad, THREE.MathUtils.degToRad(3.0), THREE.MathUtils.degToRad(25.0));
    }

    const slideBlend = 0.50 * speedFactor * slideFactor;
    this.cameraMode = slideBlend > 0.12 ? 'chase_slide' : 'chase_follow';

    const targetCamDir = forward.clone();
    if (slideBlend > 0.001) {
      targetCamDir.lerp(normVel, slideBlend).normalize();
    }

    // Continuous frame-to-frame direction smoothing eliminates any 1-frame yaw jumps
    if (this.currentCamDir.lengthSq() < 0.1) {
      this.currentCamDir.copy(targetCamDir);
    } else {
      this.currentCamDir.lerp(targetCamDir, Math.min(1.0, 10.0 * dt)).normalize();
    }

    const desiredPos = chassisPos.clone()
      .sub(this.currentCamDir.clone().multiplyScalar(this.followDistance))
      .add(new THREE.Vector3(0, this.followHeight, 0));

    // Smooth position interpolation
    const lerpFactor = Math.min(1.0, (1.0 - Math.pow(this.cameraLag, dt * 60)));
    this.camera.position.lerp(desiredPos, lerpFactor);

    // Look-ahead target smoothly blended towards travel direction
    const lookAheadBlend = 0.25 * speedFactor * slideFactor;
    const targetLookDir = forward.clone();
    if (lookAheadBlend > 0.001) {
      targetLookDir.lerp(normVel, lookAheadBlend).normalize();
    }

    if (this.currentLookDir.lengthSq() < 0.1) {
      this.currentLookDir.copy(targetLookDir);
    } else {
      this.currentLookDir.lerp(targetLookDir, Math.min(1.0, 10.0 * dt)).normalize();
    }

    const lookAhead = this.currentLookDir.clone().multiplyScalar(4.0);
    const desiredTarget = chassisPos.clone().add(new THREE.Vector3(0, 1.0, 0)).add(lookAhead);
    this.currentTarget.lerp(desiredTarget, lerpFactor);

    this.camera.lookAt(this.currentTarget);
  }

  public onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
