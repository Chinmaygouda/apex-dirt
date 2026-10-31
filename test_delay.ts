import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';

async function testReverseDelay() {
  await RAPIER.init();
  const rapier = RAPIER;
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  const groundBody = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(rapier.ColliderDesc.cuboid(5000, 0.5, 5000).setFriction(0.9), groundBody);

  const scene = new THREE.Scene();
  const physics = { rapier, world };
  const vehicle = new CustomRallyVehicle(scene, physics as any);

  // Start vehicle moving forward at 30 mph (13.4 m/s)
  vehicle.resetPosition();
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 13.4 }, true);
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = 13.4 / vehicle.wheelRadius;

  console.log('--- TEST REVERSE ENGAGE DELAY ---');
  // Brake to stop holding S (brake: 1.0, throttle: 0)
  const brakeInput = { throttle: 0, brake: 1.0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };

  let stoppedTimeS = -1;
  let reverseShiftTimeS = -1;

  for (let step = 0; step < 240; step++) { // 2.0 seconds
    const t = step / 120;
    vehicle.updatePhysicsSubstep(1 / 120, brakeInput);
    world.step();

    const speed = Math.hypot(vehicle.chassisBody.linvel().x, vehicle.chassisBody.linvel().z);
    const gear = (vehicle as any).currentGear;
    const mode = (vehicle as any).drivingDirectionMode;
    const vz = vehicle.chassisBody.linvel().z;

    if (speed < 0.1 && stoppedTimeS < 0) {
      stoppedTimeS = t;
      console.log(`Car stopped at t=${t.toFixed(3)}s | gear=${gear} | mode=${mode} | speed=${speed.toFixed(3)} m/s`);
    }

    if (stoppedTimeS > 0 && gear === -1 && reverseShiftTimeS < 0) {
      reverseShiftTimeS = t;
      const delay = reverseShiftTimeS - stoppedTimeS;
      console.log(`Reverse engaged at t=${t.toFixed(3)}s (delay since stop: ${delay.toFixed(3)}s) | gear=${gear} | mode=${mode} | vz=${vz.toFixed(3)} m/s`);
    }
  }

  const delayMeasured = reverseShiftTimeS - stoppedTimeS;
  console.log(`Measured reverse engage delay: ${delayMeasured.toFixed(3)} s (Expected: ~0.40s)`);
  const passed = Math.abs(delayMeasured - 0.40) < 0.05;
  console.log(`Reverse Delay Status: [${passed ? 'PASS' : 'FAIL'}]`);
}

testReverseDelay();
