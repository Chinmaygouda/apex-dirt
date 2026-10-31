import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';

async function run() {
  await RAPIER.init();
  const rapier = RAPIER;
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  const groundBody = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(rapier.ColliderDesc.cuboid(5000, 0.5, 5000).setFriction(0.9), groundBody);

  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, { rapier, world } as any);

  // Set translation to static settled height 0.6593m
  vehicle.chassisBody.setTranslation({ x: 0, y: 0.6593, z: -8 }, true);
  for (let i = 0; i < 4; i++) {
    (vehicle as any).prevSuspensionLengths[i] = 0.2593;
    (vehicle as any).currentSuspensionLengths[i] = 0.2593;
  }

  // Initial step world so broadphase is warm
  world.step();

  const inputs = { throttle: 0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };

  let maxPitch = 0;
  let minH = 999;
  let maxH = -999;

  for (let step = 0; step <= 360; step++) {
    const t = step / 120;
    vehicle.updatePhysicsSubstep(1 / 120, inputs);
    world.step();

    const tr = vehicle.chassisBody.translation();
    const rot = vehicle.chassisBody.rotation();
    const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w));
    const pitchDeg = THREE.MathUtils.radToDeg(euler.x);

    if (Math.abs(pitchDeg) > maxPitch) maxPitch = Math.abs(pitchDeg);
    if (tr.y < minH) minH = tr.y;
    if (tr.y > maxH) maxH = tr.y;

    if (step % 20 === 0) {
      console.log(`t=${t.toFixed(2)}s | y=${tr.y.toFixed(4)}m | pitch=${pitchDeg.toFixed(3)}°`);
    }
  }

  console.log(`Height delta = ${(maxH - minH).toFixed(4)}m, max pitch = ${maxPitch.toFixed(3)}°`);
}

run();
