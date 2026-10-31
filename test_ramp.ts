import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';

async function testRampPhysics() {
  await RAPIER.init();
  const rapier = RAPIER;
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });

  const rampWidth = 6.0;
  const rampLength = 10.0;
  const rampHeight = 1.0;
  const rampBody = world.createRigidBody(
    rapier.RigidBodyDesc.fixed().setTranslation(-35, rampHeight * 0.5, 20 + rampLength * 0.5)
  );
  const angle = Math.atan2(rampHeight, rampLength);
  rampBody.setRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) }, true);
  const colDesc = rapier.ColliderDesc.cuboid(rampWidth / 2, 0.1, Math.hypot(rampLength, rampHeight) / 2);
  world.createCollider(colDesc, rampBody);

  const scene = new THREE.Scene();
  const physics = { rapier, world };
  const vehicle = new CustomRallyVehicle(scene, physics as any);

  const rampQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);

  // Subtest 1: NO HANDBRAKE, NO INPUT -> MUST ROLL DOWN
  vehicle.chassisBody.setTranslation({ x: -35, y: 1.16, z: 25 }, true);
  vehicle.chassisBody.setRotation({ x: rampQuat.x, y: rampQuat.y, z: rampQuat.z, w: rampQuat.w }, true);
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  vehicle.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

  const noInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };

  console.log('--- SUBTEST 1: UNBRAKED ON RAMP (SHOULD ROLL DOWN) ---');
  for (let s = 0; s < 240; s++) { // 2.0 seconds
    vehicle.updatePhysicsSubstep(1 / 120, noInput);
    world.step();
  }
  const posAfterRoll = vehicle.chassisBody.translation();
  const speedAfterRoll = Math.hypot(vehicle.chassisBody.linvel().y, vehicle.chassisBody.linvel().z);
  console.log(`Unbraked roll: moved from z=25 to z=${posAfterRoll.z.toFixed(3)}, speed = ${speedAfterRoll.toFixed(3)} m/s`);
  const rollPassed = posAfterRoll.z > 26.0 && speedAfterRoll > 0.5;
  console.log(`Subtest 1 Status: [${rollPassed ? 'PASS' : 'FAIL'}]`);

  // Subtest 2: HANDBRAKE HELD -> MUST HOLD
  vehicle.chassisBody.setTranslation({ x: -35, y: 1.16, z: 25 }, true);
  vehicle.chassisBody.setRotation({ x: rampQuat.x, y: rampQuat.y, z: rampQuat.z, w: rampQuat.w }, true);
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  vehicle.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

  const handbrakeInput = { ...noInput, handbrake: true };

  console.log('--- SUBTEST 2: HANDBRAKE ON RAMP (SHOULD HOLD) ---');
  for (let s = 0; s < 240; s++) { // 2.0 seconds
    vehicle.updatePhysicsSubstep(1 / 120, handbrakeInput);
    world.step();
  }
  const posAfterHold = vehicle.chassisBody.translation();
  const speedAfterHold = Math.hypot(vehicle.chassisBody.linvel().x, vehicle.chassisBody.linvel().z);
  const dispHold = Math.abs(posAfterHold.z - 25);
  console.log(`Handbrake hold: z delta = ${(dispHold * 100).toFixed(2)} cm, speed = ${speedAfterHold.toFixed(4)} m/s`);
  const holdPassed = dispHold < 0.05 && speedAfterHold < 0.05;
  console.log(`Subtest 2 Status: [${holdPassed ? 'PASS' : 'FAIL'}]`);
}

testRampPhysics();
