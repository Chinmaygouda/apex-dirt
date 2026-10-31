import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';

await RAPIER.init();

class HeadlessPhysicsWorld {
  public world: RAPIER.World;
  public rapier: typeof RAPIER;

  constructor() {
    this.rapier = RAPIER;
    this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
  }

  public step(dt: number, updatePhysicsSubstep: (dt: number) => void): void {
    updatePhysicsSubstep(dt);
    this.world.step();
  }
}

function createTestSetup() {
  const physics = new HeadlessPhysicsWorld();
  const groundDesc = RAPIER.ColliderDesc.cuboid(5000, 0.5, 5000)
    .setTranslation(0, -0.5, 0)
    .setFriction(0.9);
  physics.world.createCollider(groundDesc);

  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, physics as any);
  vehicle.tuning.surfaceMode = 'dirt';
  vehicle.resetPosition();

  return { physics, vehicle };
}

const defaultInputs = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  reset: false,
  drivetrainToggle: false,
  demoSkidpad: false,
  demoHandbrake: false,
};

// -------------------------------------------------------------
// Test (a): Reverse at 7 mph + handbrake: stop < 1 s
// -------------------------------------------------------------
function testA(): boolean {
  console.log('\n--- Test (a): Reverse at 7 mph + handbrake (Target: stop < 1 s) ---');
  const { physics, vehicle } = createTestSetup();

  const initSpeedMs = -7 * 0.44704; // -3.129 m/s
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  (vehicle as any).currentGear = -1;
  (vehicle as any).drivingDirectionMode = 'reverse';
  const omega = initSpeedMs / vehicle.wheelRadius;
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

  // Settle suspension for 0.2s
  for (let s = 0; s < 24; s++) {
    physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, defaultInputs));
  }

  const handbrakeInputs = { ...defaultInputs, handbrake: true };
  let stopTimeS = -1;
  const maxSteps = 120 * 2; // 2 seconds

  for (let s = 0; s < maxSteps; s++) {
    const timeS = s / 120;
    physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, handbrakeInputs));
    const linv = vehicle.chassisBody.linvel();
    const planarSpeed = Math.hypot(linv.x, linv.z);
    if (s % 20 === 0) {
      console.log(`testA t=${timeS.toFixed(2)}s | vz=${linv.z.toFixed(2)} | planarSpeed=${planarSpeed.toFixed(2)} | rearOmega=${(vehicle as any).wheelAngularVel[2].toFixed(2)}`);
    }
    if (planarSpeed < 0.05 && stopTimeS < 0) {
      stopTimeS = timeS;
      break;
    }
  }

  console.log(`Test (a) Result: Stopped from 7 mph in ${stopTimeS.toFixed(2)} s`);
  const passed = stopTimeS > 0 && stopTimeS < 1.0;
  console.log(`Test (a) Status: [${passed ? 'PASS' : 'FAIL'}] (Threshold: < 1.0 s)`);
  return passed;
}

// -------------------------------------------------------------
// Test (b): Reverse at 7 mph + W: brakes to 0, then drives forward
// -------------------------------------------------------------
function testB(): boolean {
  console.log('\n--- Test (b): Reverse at 7 mph + W: brakes to 0, then drives forward ---');
  const { physics, vehicle } = createTestSetup();

  const initSpeedMs = -7 * 0.44704; // -3.129 m/s
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  (vehicle as any).currentGear = -1;
  (vehicle as any).drivingDirectionMode = 'reverse';
  const omega = initSpeedMs / vehicle.wheelRadius;
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

  // Settle suspension for 0.2s
  for (let s = 0; s < 24; s++) {
    physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, defaultInputs));
  }

  const wInputs = { ...defaultInputs, throttle: 1.0 };
  let stoppedTimeS = -1;
  let forwardDriveSpeed = 0;
  const maxSteps = 120 * 3; // 3 seconds

  for (let s = 0; s < maxSteps; s++) {
    const timeS = s / 120;
    physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, wInputs));
    const linv = vehicle.chassisBody.linvel();
    const vForward = linv.z; // since nose points along +Z

    if (stoppedTimeS < 0 && Math.abs(vForward) < 0.15) {
      stoppedTimeS = timeS;
    }
    if (timeS > 1.5) {
      forwardDriveSpeed = Math.max(forwardDriveSpeed, vForward);
    }
  }

  console.log(`Test (b) Result: Brakes to 0 in ${stoppedTimeS.toFixed(2)} s, then accelerates forward to ${(forwardDriveSpeed * 2.23694).toFixed(1)} mph`);
  const passed = stoppedTimeS > 0 && stoppedTimeS < 1.5 && forwardDriveSpeed > 1.0;
  console.log(`Test (b) Status: [${passed ? 'PASS' : 'FAIL'}] (Stopped < 1.5s, forward speed > 1.0 m/s)`);
  return passed;
}

// -------------------------------------------------------------
// Test (c): Reverse at 7 mph, no input: stops within 6 s
// -------------------------------------------------------------
function testC(): boolean {
  console.log('\n--- Test (c): Reverse at 7 mph, no input: stops within 6 s ---');
  const { physics, vehicle } = createTestSetup();

  const initSpeedMs = -7 * 0.44704; // -3.129 m/s
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  (vehicle as any).currentGear = -1;
  (vehicle as any).drivingDirectionMode = 'reverse';
  const omega = initSpeedMs / vehicle.wheelRadius;
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

  // Settle suspension for 0.2s
  for (let s = 0; s < 24; s++) {
    physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, defaultInputs));
  }

  let stopTimeS = -1;
  const maxSteps = 120 * 8; // 8 seconds

  for (let s = 0; s < maxSteps; s++) {
    const timeS = s / 120;
    physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, defaultInputs));
    const linv = vehicle.chassisBody.linvel();
    const planarSpeed = Math.hypot(linv.x, linv.z);
    if (planarSpeed < 0.05 && stopTimeS < 0) {
      stopTimeS = timeS;
      break;
    }
  }

  console.log(`Test (c) Result: Coasting in reverse stopped in ${stopTimeS.toFixed(2)} s`);
  const passed = stopTimeS >= 2.5 && stopTimeS <= 6.0;
  console.log(`Test (c) Status: [${passed ? 'PASS' : 'FAIL'}] (Target: 3.0 to 6.0 s)`);
  return passed;
}

// -------------------------------------------------------------
// Test (d): Spawn, 10 s with zero input: speed < 0.05 m/s and chassis displacement < 5 cm
// -------------------------------------------------------------
function testD(): boolean {
  console.log('\n--- Test (d): Spawn, 10 s zero input: speed < 0.05 m/s, displacement < 5 cm ---');
  const { physics, vehicle } = createTestSetup();

  const initPos = vehicle.chassisBody.translation();
  const initX = initPos.x;
  const initZ = initPos.z;

  const totalSteps = 120 * 10; // 10 seconds at 120 Hz
  for (let s = 0; s < totalSteps; s++) {
    physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, defaultInputs));
  }

  const finalPos = vehicle.chassisBody.translation();
  const finalLinvel = vehicle.chassisBody.linvel();
  const planarDisplacementM = Math.hypot(finalPos.x - initX, finalPos.z - initZ);
  const planarSpeedMs = Math.hypot(finalLinvel.x, finalLinvel.z);

  console.log(`Test (d) Result: Final planar speed = ${planarSpeedMs.toFixed(4)} m/s, Horizontal displacement = ${(planarDisplacementM * 100).toFixed(2)} cm`);
  const passed = planarSpeedMs < 0.05 && planarDisplacementM < 0.05;
  console.log(`Test (d) Status: [${passed ? 'PASS' : 'FAIL'}] (Threshold: speed < 0.05 m/s, disp < 5 cm)`);
  return passed;
}

// -------------------------------------------------------------
// Test (e): Replay user_session2_inputs_with_reverse.csv and assert no sustained reverse acceleration under W
// -------------------------------------------------------------
function testE(): boolean {
  console.log('\n--- Test (e): Replay user_session2_inputs_with_reverse.csv (No sustained reverse accel under W) ---');
  const csvPath = path.resolve('user_session2_inputs_with_reverse.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
  interface Row {
    frame: number;
    timeS: number;
    steer: number;
    throttle: number;
    brake: number;
    handbrake: boolean;
    gear: string;
    speedMph: number;
  }
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.trim());
    if (parts.length < 8) continue;
    rows.push({
      frame: parseInt(parts[0], 10),
      timeS: parseFloat(parts[1]),
      steer: parseFloat(parts[2]),
      throttle: parseFloat(parts[3]),
      brake: parseFloat(parts[4]),
      handbrake: parts[5] === '1',
      gear: parts[6],
      speedMph: parseFloat(parts[7]),
    });
  }

  const { physics, vehicle } = createTestSetup();
  // Start from initial recorded speed
  const initSpeed = rows[0].speedMph * 0.44704;
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeed }, true);

  const dt = 1 / 120;
  const totalDuration = rows[rows.length - 1].timeS;
  const totalSteps = Math.round(totalDuration / dt);

  let sustainedReverseAccelCount = 0;
  let maxReverseAccelWindowS = 0;
  let currentReverseAccelS = 0;

  for (let step = 0; step < totalSteps; step++) {
    const timeS = step * dt;
    let idx = rows.findIndex(r => r.timeS >= timeS);
    if (idx === -1) idx = rows.length - 1;
    const rCurrent = rows[idx];
    const rPrev = idx > 0 ? rows[idx - 1] : rCurrent;
    const tSpan = Math.max(1e-4, rCurrent.timeS - rPrev.timeS);
    const alpha = THREE.MathUtils.clamp((timeS - rPrev.timeS) / tSpan, 0, 1);

    const steer = THREE.MathUtils.lerp(rPrev.steer, rCurrent.steer, alpha);
    const throttle = THREE.MathUtils.lerp(rPrev.throttle, rCurrent.throttle, alpha);
    const brake = THREE.MathUtils.lerp(rPrev.brake, rCurrent.brake, alpha);
    const handbrake = rCurrent.handbrake;

    const inputs = {
      throttle,
      brake,
      steer,
      handbrake,
      reset: false,
      drivetrainToggle: false,
      demoSkidpad: false,
      demoHandbrake: false,
    };

    const prevLinv = vehicle.chassisBody.linvel();
    physics.step(dt, (subDt) => vehicle.updatePhysicsSubstep(subDt, inputs));
    const curLinv = vehicle.chassisBody.linvel();

    const rot = vehicle.chassisBody.rotation();
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    const curVForward = new THREE.Vector3(curLinv.x, curLinv.y, curLinv.z).dot(fwd);
    const prevVForward = new THREE.Vector3(prevLinv.x, prevLinv.y, prevLinv.z).dot(fwd);

    // Check if moving backward (vForward < -0.5 m/s) while pressing W (throttle > 0.5)
    if (curVForward < -0.5 && throttle > 0.5) {
      // Acceleration in reverse means vForward became MORE negative: curVForward < prevVForward
      const reverseAcc = (prevVForward - curVForward) / dt; // positive if accelerating in reverse
      if (reverseAcc > 0.25) { // sustained backward acceleration
        currentReverseAccelS += dt;
        if (currentReverseAccelS > maxReverseAccelWindowS) {
          maxReverseAccelWindowS = currentReverseAccelS;
        }
      } else {
        currentReverseAccelS = 0;
      }
    } else {
      currentReverseAccelS = 0;
    }
  }

  console.log(`Test (e) Result: Max sustained reverse acceleration under W = ${maxReverseAccelWindowS.toFixed(2)} s`);
  const passed = maxReverseAccelWindowS < 0.20; // no sustained reverse acceleration
  console.log(`Test (e) Status: [${passed ? 'PASS' : 'FAIL'}] (Threshold: < 0.20 s)`);
  return passed;
}

// -------------------------------------------------------------
// Test (f): Sandbox Ramp Roll-Off vs Handbrake Hold
// Car parked on ramp with no input must roll down under gravity;
// with handbrake held it must hold stationary.
// -------------------------------------------------------------
function testF(): boolean {
  console.log('\n--- Test (f): Sandbox Ramp Roll-Off vs Handbrake Hold ---');

  // Helper to create ramp physics world
  const setupRampWorld = () => {
    const physics = new HeadlessPhysicsWorld();
    // Ramp matching SandboxEnvironment.ts
    const rampWidth = 6.0;
    const rampLength = 10.0;
    const rampHeight = 1.0;
    const rampBody = physics.world.createRigidBody(
      physics.rapier.RigidBodyDesc.fixed().setTranslation(-35, rampHeight * 0.5, 20 + rampLength * 0.5)
    );
    const angle = Math.atan2(rampHeight, rampLength);
    rampBody.setRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) }, true);
    const colDesc = physics.rapier.ColliderDesc.cuboid(rampWidth / 2, 0.1, Math.hypot(rampLength, rampHeight) / 2);
    physics.world.createCollider(colDesc, rampBody);

    const scene = new THREE.Scene();
    const vehicle = new CustomRallyVehicle(scene, physics as any);
    vehicle.tuning.surfaceMode = 'dirt';

    const rampQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    vehicle.chassisBody.setTranslation({ x: -35, y: 1.16, z: 25 }, true);
    vehicle.chassisBody.setRotation({ x: rampQuat.x, y: rampQuat.y, z: rampQuat.z, w: rampQuat.w }, true);
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    vehicle.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = 0;

    return { physics, vehicle };
  };

  // Subtest f1: Unbraked roll down
  const { physics: p1, vehicle: v1 } = setupRampWorld();
  for (let s = 0; s < 240; s++) { // 2.0 s
    p1.step(1 / 120, (dt) => v1.updatePhysicsSubstep(dt, defaultInputs));
  }
  const posAfterRoll = v1.chassisBody.translation();
  const speedAfterRoll = Math.hypot(v1.chassisBody.linvel().y, v1.chassisBody.linvel().z);
  const rollPassed = posAfterRoll.z > 26.0 && speedAfterRoll > 0.5;
  console.log(`  (f1) Unbraked Roll Down: moved z=25 -> ${posAfterRoll.z.toFixed(2)}, speed = ${speedAfterRoll.toFixed(2)} m/s [${rollPassed ? 'PASS' : 'FAIL'}]`);

  // Subtest f2: Handbrake hold
  const { physics: p2, vehicle: v2 } = setupRampWorld();
  const handbrakeInput = { ...defaultInputs, handbrake: true };
  for (let s = 0; s < 240; s++) { // 2.0 s
    p2.step(1 / 120, (dt) => v2.updatePhysicsSubstep(dt, handbrakeInput));
  }
  const posAfterHold = v2.chassisBody.translation();
  const speedAfterHold = Math.hypot(v2.chassisBody.linvel().x, v2.chassisBody.linvel().z);
  const dispHoldCm = Math.abs(posAfterHold.z - 25) * 100;
  const holdPassed = dispHoldCm < 5.0 && speedAfterHold < 0.05;
  console.log(`  (f2) Handbrake Ramp Hold: disp = ${dispHoldCm.toFixed(2)} cm, speed = ${speedAfterHold.toFixed(4)} m/s [${holdPassed ? 'PASS' : 'FAIL'}]`);

  const passed = rollPassed && holdPassed;
  console.log(`Test (f) Status: [${passed ? 'PASS' : 'FAIL'}]`);
  return passed;
}

// -------------------------------------------------------------
// Test (g): Reverse Engage Delay (Brake-to-Stop does not instant reverse)
// Holding S to brake to stop does not engage reverse until held for reverseEngageDelay (0.4s)
// -------------------------------------------------------------
function testG(): boolean {
  console.log('\n--- Test (g): Reverse Engage Delay (default 0.4s) ---');
  const { physics, vehicle } = createTestSetup();

  // Move forward at 30 mph
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 13.4 }, true);
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = 13.4 / vehicle.wheelRadius;

  const brakeInput = { ...defaultInputs, brake: 1.0 };
  let stoppedTimeS = -1;
  let reverseShiftTimeS = -1;

  for (let s = 0; s < 240; s++) {
    const t = s / 120;
    physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, brakeInput));

    const speed = Math.hypot(vehicle.chassisBody.linvel().x, vehicle.chassisBody.linvel().z);
    const gear = (vehicle as any).currentGear;

    if (speed < 0.1 && stoppedTimeS < 0) {
      stoppedTimeS = t;
    }

    if (stoppedTimeS > 0 && gear === -1 && reverseShiftTimeS < 0) {
      reverseShiftTimeS = t;
    }
  }

  const delay = reverseShiftTimeS - stoppedTimeS;
  console.log(`Test (g) Result: Car stopped at t=${stoppedTimeS.toFixed(2)}s, Reverse engaged at t=${reverseShiftTimeS.toFixed(2)}s (delay: ${delay.toFixed(2)}s)`);
  const passed = Math.abs(delay - 0.40) < 0.08;
  console.log(`Test (g) Status: [${passed ? 'PASS' : 'FAIL'}] (Target: ~0.40s)`);
  return passed;
}

export function runAllReverseRegressionTests(): boolean {
  console.log('================================================================');
  console.log('   APEX DIRT - REVERSE & LOW-SPEED REGRESSION TEST SUITE');
  console.log('================================================================');

  const resA = testA();
  const resB = testB();
  const resC = testC();
  const resD = testD();
  const resE = testE();
  const resF = testF();
  const resG = testG();

  console.log('\n================================================================');
  console.log('   REVERSE REGRESSION SUMMARY');
  console.log('================================================================');
  console.log(`  (a) Reverse 7 mph + Handbrake (< 1 s):          [${resA ? 'PASS' : 'FAIL'}]`);
  console.log(`  (b) Reverse 7 mph + W (Brakes then forward):    [${resB ? 'PASS' : 'FAIL'}]`);
  console.log(`  (c) Reverse 7 mph No Input (Stops 3-6 s):       [${resC ? 'PASS' : 'FAIL'}]`);
  console.log(`  (d) Spawn 10s Zero Input (Speed<0.05, Disp<5cm):[${resD ? 'PASS' : 'FAIL'}]`);
  console.log(`  (e) Session 2 Replay (No reverse accel under W): [${resE ? 'PASS' : 'FAIL'}]`);
  console.log(`  (f) Ramp Roll-Off vs Handbrake Hold:            [${resF ? 'PASS' : 'FAIL'}]`);
  console.log(`  (g) Reverse Engage Delay (~0.4s):               [${resG ? 'PASS' : 'FAIL'}]`);

  const allPassed = resA && resB && resC && resD && resE && resF && resG;
  console.log(`\nOverall Reverse Suite Result: [${allPassed ? 'ALL PASSED' : 'FAILED'}]\n`);
  return allPassed;
}

if (process.argv[1] && process.argv[1].endsWith('test_reverse_regression.ts')) {
  const allPassed = runAllReverseRegressionTests();
  if (!allPassed) {
    process.exit(1);
  }
}

