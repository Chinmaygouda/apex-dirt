import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle.js';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init();

function evaluateSweep(config: {
  comZ: number;
  angDamping: number;
  pneumaticTrail: number;
  downshiftFix: boolean;
}) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), ground);
  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, { rapier: RAPIER, world, step: () => {} } as any);
  vehicle.tuning.surfaceMode = 'dirt';

  // Apply tested physical config
  vehicle.chassisBody.setAngularDamping(config.angDamping);

  function runManeuver(hbRelease: number, driftThrottle: number, csSteer: number, csEnd: number) {
    vehicle.resetPosition();
    const initSpeedMs = 130 * 0.44704;
    vehicle.chassisBody.setTranslation({ x: 0, y: 0.42, z: 0 }, true);
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    (vehicle as any).currentGear = 5;
    const wheelOmega = initSpeedMs / vehicle.wheelRadius;
    for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = wheelOmega;
    
    for (let i = 0; i < 15; i++) {
      let acc = 1/120;
      vehicle.updatePhysicsSubstep(acc, { throttle: 1, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
      world.step();
    }
    
    const dt = 1/60;
    const totalFrames = Math.round(5.40 / dt);
    for (let f = 0; f < totalFrames; f++) {
      const t = f * dt;
      let throttle = 0, brake = 0, steer = 0, handbrake = false;
      if (t < 1.20) { throttle = 1.0; }
      else if (t < 1.55) { brake = 1.0; }
      else if (t < hbRelease) { brake = 0.35; steer = 0.95; handbrake = true; }
      else if (t < 3.20) { throttle = driftThrottle; steer = 0.50; handbrake = false; }
      else {
        throttle = 1.0;
        steer = t < csEnd ? csSteer : 0.0;
      }
      
      let acc = dt;
      while (acc >= 1/120) {
        vehicle.updatePhysicsSubstep(1/120, { throttle, brake, steer, handbrake, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
        world.step();
        acc -= 1/120;
      }
      vehicle.updateVisuals({ throttle, brake, steer, handbrake, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false }, dt);
    }
    
    const telem = vehicle.getTelemetry({ throttle: 1, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
    const rot = vehicle.chassisBody.rotation();
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const linvel = vehicle.chassisBody.linvel();
    const velVec = new THREE.Vector3(linvel.x, linvel.y, linvel.z);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const vForward = velVec.dot(fwd);
    const vLateral = velVec.dot(right);
    const finalSlip = THREE.MathUtils.radToDeg(Math.atan2(vLateral, Math.max(Math.abs(vForward), 1.0)));
    return { speedMph: telem.speedMph, finalSlipDeg: Math.abs(finalSlip) };
  }

  let total = 0, passed = 0;
  for (const hb of [1.95, 2.05, 2.15]) {
    for (const thr of [0.70, 0.85, 1.00]) {
      for (const cs of [-0.20, -0.35, -0.50, -0.70]) {
        for (const end of [3.4, 3.65, 3.9, 4.2]) {
          const res = runManeuver(hb, thr, cs, end);
          total++;
          if (res.finalSlipDeg <= 5.0) passed++;
        }
      }
    }
  }
  return { passed, total, pct: (passed / total) * 100 };
}

console.log('Evaluating baseline...');
const baseline = evaluateSweep({ comZ: 0, angDamping: 0.3, pneumaticTrail: 0, downshiftFix: false });
console.log(`Baseline Recovery: ${baseline.passed}/${baseline.total} (${baseline.pct.toFixed(1)}%)`);

for (const angDamp of [0.4, 0.5, 0.6, 0.8, 1.0]) {
  const res = evaluateSweep({ comZ: 0, angDamping: angDamp, pneumaticTrail: 0, downshiftFix: false });
  console.log(`angDamping=${angDamp}: ${res.passed}/${res.total} (${res.pct.toFixed(1)}%)`);
}

