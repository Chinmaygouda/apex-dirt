import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init();

class PhysicsWorld {
  public world: RAPIER.World;
  public rapier: typeof RAPIER;
  private accumulator = 0;
  private readonly fixedTimeStep = 1 / 120;

  constructor() {
    this.rapier = RAPIER;
    this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
  }

  public step(deltaTime: number, updatePhysicsSubstep: (dt: number) => void): void {
    this.accumulator += deltaTime;
    let substeps = 0;
    while (this.accumulator >= this.fixedTimeStep && substeps < 4) {
      updatePhysicsSubstep(this.fixedTimeStep);
      this.world.step();
      this.accumulator -= this.fixedTimeStep;
      substeps++;
    }
  }
}

async function testWithTuning() {
  const physics = new PhysicsWorld();
  const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 0.5, 5000).setFriction(0.9), groundBody);

  const { CustomRallyVehicle } = await import('./src/vehicles/CustomRallyVehicle.js');
  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, physics as any);

  // Apply new tuning
  vehicle.tuning.baseFrictionMu = 1.30;
  vehicle.tuning.gripMultiplierTarmac = 1.0;
  vehicle.tuning.gripMultiplierDirt = 0.72; // Dirt grip multiplier
  vehicle.tuning.gripMultiplierGravel = 0.58;
  vehicle.tuning.gripMultiplierGrass = 0.42;
  vehicle.tuning.surfaceMode = 'dirt'; // Default on dirt
  vehicle.tuning.downforceCLA = 0.20;  // Substantially reduced downforce
  vehicle.tuning.aeroDragCdA = 0.70;
  vehicle.tuning.loadFrictionMinClamp = 0.30;
  vehicle.tuning.loadSensitivityK = 0.00008;

  // 1. Accel, Launch Slip Ratio, & Top Speed
  vehicle.resetPosition();
  let timeTo60: number | null = null;
  let topSpeed = 0;
  const launchSlipValues: number[] = [];
  const accelInputs = { throttle: 1, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };

  for (let step = 0; step < 120 * 35; step++) {
    const t = step / 120;
    physics.step(1/120, (dt) => vehicle.updatePhysicsSubstep(dt, accelInputs));
    const telem = vehicle.getTelemetry(accelInputs);
    const rearSlip = Math.abs((vehicle as any).wheelSlipRatios[2]);
    if (telem.speedMph < 60) {
      launchSlipValues.push(rearSlip);
    }
    if (step % (120 * 2) === 0 && t <= 7.0) {
      console.log(`[Launch] t=${t.toFixed(1)}s, speed=${telem.speedMph.toFixed(1)}mph, rearSlip=${rearSlip.toFixed(3)}, rearOmega=${(vehicle as any).wheelAngularVel[2].toFixed(1)}`);
    }
    if (step % (120 * 3) === 0 && t > 7.0) {
      console.log(`t=${t.toFixed(1)}s, speed=${telem.speedMph.toFixed(1)}mph, gear=${telem.gear}, rpm=${telem.rpm.toFixed(0)}`);
    }
    if (telem.speedMph >= 60 && timeTo60 === null) {
      timeTo60 = t;
    }
    if (telem.speedMph > topSpeed) {
      topSpeed = telem.speedMph;
    }
  }
  const avgLaunchSlip = launchSlipValues.length > 0 
    ? launchSlipValues.reduce((a, b) => a + b, 0) / launchSlipValues.length 
    : 0;

  // 2. Skid Pad on Dirt
  vehicle.resetPosition();
  let skidPadGValues: number[] = [];
  const turnInputs = { throttle: 0.85, brake: 0, steer: 0.65, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
  for (let step = 0; step < 120 * 10; step++) {
    const t = step / 120;
    physics.step(1/120, (dt) => vehicle.updatePhysicsSubstep(dt, turnInputs));
    if (t > 4.0) {
      const telem = vehicle.getTelemetry(turnInputs);
      skidPadGValues.push(Math.abs(telem.lateralG));
    }
  }
  const avgG = skidPadGValues.reduce((a, b) => a + b, 0) / skidPadGValues.length;
  const maxG = Math.max(...skidPadGValues);

  // 2b. Skid Pad on Tarmac (for comparison)
  vehicle.tuning.surfaceMode = 'tarmac';
  vehicle.resetPosition();
  let tarmacGValues: number[] = [];
  for (let step = 0; step < 120 * 10; step++) {
    const t = step / 120;
    physics.step(1/120, (dt) => vehicle.updatePhysicsSubstep(dt, turnInputs));
    if (t > 4.0) {
      const telem = vehicle.getTelemetry(turnInputs);
      tarmacGValues.push(Math.abs(telem.lateralG));
    }
  }
  const avgGTarmac = tarmacGValues.reduce((a, b) => a + b, 0) / tarmacGValues.length;
  const maxGTarmac = Math.max(...tarmacGValues);
  vehicle.tuning.surfaceMode = 'dirt'; // Restore to dirt default

  // 3. Handbrake Drill at 55 mph
  vehicle.resetPosition();
  let hbInputs = { throttle: 1, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
  
  // Accelerate until 55 mph
  let speedNow = 0;
  for (let step = 0; step < 120 * 15; step++) {
    physics.step(1/120, (dt) => vehicle.updatePhysicsSubstep(dt, hbInputs));
    speedNow = vehicle.getTelemetry(hbInputs).speedMph;
    if (speedNow >= 55.0) break;
  }
  const speedAtHb = speedNow;
  const rotStart = vehicle.chassisBody.rotation();
  const qStart = new THREE.Quaternion(rotStart.x, rotStart.y, rotStart.z, rotStart.w);
  const fwdStart = new THREE.Vector3(0, 0, 1).applyQuaternion(qStart);

  // Apply Handbrake at 55 mph with full steer flick
  hbInputs = { throttle: 0, brake: 0, steer: 1.0, handbrake: true, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
  let peakSlipAngle = 0;
  let timeTo90Deg: number | null = null;
  let maxAngle = 0;

  for (let step = 0; step < 120 * 1.5; step++) {
    const tHb = step / 120;
    physics.step(1/120, (dt) => vehicle.updatePhysicsSubstep(dt, hbInputs));
    const rotNow = vehicle.chassisBody.rotation();
    const qNow = new THREE.Quaternion(rotNow.x, rotNow.y, rotNow.z, rotNow.w);
    const fwdNow = new THREE.Vector3(0, 0, 1).applyQuaternion(qNow);
    const angle = THREE.MathUtils.radToDeg(fwdStart.angleTo(fwdNow));
    if (angle > maxAngle) maxAngle = angle;

    const driftAngle = Math.abs((vehicle as any).driftAngleDeg);
    if (driftAngle > peakSlipAngle) peakSlipAngle = driftAngle;

    if (angle >= 90.0 && timeTo90Deg === null) {
      timeTo90Deg = tHb;
    }
  }

  // Recovery Phase: Release handbrake, counter-steer, apply throttle
  const recoveryInputs = { throttle: 0.8, brake: 0, steer: -0.6, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
  for (let step = 0; step < 120 * 2.0; step++) {
    physics.step(1/120, (dt) => vehicle.updatePhysicsSubstep(dt, recoveryInputs));
  }
  const finalSlipAngle = Math.abs((vehicle as any).driftAngleDeg);
  const recovered = finalSlipAngle < 15.0;

  console.log("=== MEASURED TEST RESULTS ===");
  console.log(`Time to 60 mph: ${timeTo60 ? timeTo60.toFixed(2) + ' s' : 'N/A'}`);
  console.log(`Average Launch Slip Ratio: ${avgLaunchSlip.toFixed(2)}`);
  console.log(`Top Speed: ${topSpeed.toFixed(1)} mph (in 5th gear on dirt)`);
  console.log(`Skid Pad Average Lateral G (Dirt): ${avgG.toFixed(2)} G (Peak: ${maxG.toFixed(2)} G)`);
  console.log(`Skid Pad Average Lateral G (Tarmac): ${avgGTarmac.toFixed(2)} G (Peak: ${maxGTarmac.toFixed(2)} G)`);
  console.log(`Handbrake Turn at 55 mph:`);
  console.log(`  Initiation Speed: ${speedAtHb.toFixed(1)} mph`);
  console.log(`  Peak Slip Angle: ${peakSlipAngle.toFixed(1)}°`);
  console.log(`  Time to Rotate 90°: ${timeTo90Deg ? timeTo90Deg.toFixed(2) + ' s' : 'N/A (Peak angle: ' + maxAngle.toFixed(1) + '°)'}`);
  console.log(`  Recovery Behavior: ${recovered ? 'Recovers cleanly straight (' + finalSlipAngle.toFixed(1) + '° final slip)' : 'Sticks sideways (' + finalSlipAngle.toFixed(1) + '° final slip)'}`);
}

testWithTuning();
