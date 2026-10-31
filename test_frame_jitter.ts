import fs from 'fs';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';

await RAPIER.init();

// Old Physics World implementation
class OldPhysicsWorld {
  public world: RAPIER.World;
  public rapier: typeof RAPIER = RAPIER;
  private timeAccumulator = 0;
  private dt = 1 / 120;
  private maxSubsteps = 4;

  constructor() {
    this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
  }

  public step(frameDt: number, onSubstep: (dt: number) => void): number {
    const clampedFrameDt = Math.min(frameDt, 0.1);
    this.timeAccumulator += clampedFrameDt;
    let substeps = 0;
    while (this.timeAccumulator >= this.dt && substeps < this.maxSubsteps) {
      onSubstep(this.dt);
      this.world.step();
      this.timeAccumulator -= this.dt;
      substeps++;
    }
    if (this.timeAccumulator > this.dt) {
      this.timeAccumulator = 0;
    }
    return substeps;
  }
}

// Fixed Physics World implementation
class RobustPhysicsWorld {
  public world: RAPIER.World;
  public rapier: typeof RAPIER = RAPIER;
  private timeAccumulator = 0;
  private dt = 1 / 120;
  private maxSubsteps = 10;

  constructor() {
    this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
  }

  public step(frameDt: number, onSubstep: (dt: number) => void): number {
    const clampedFrameDt = Math.min(frameDt, 0.1);
    this.timeAccumulator += clampedFrameDt;
    let substeps = 0;
    while (this.timeAccumulator >= this.dt && substeps < this.maxSubsteps) {
      onSubstep(this.dt);
      this.world.step();
      this.timeAccumulator -= this.dt;
      substeps++;
    }
    // Prevent death spiral if frozen for > 150ms, but don't discard normal remainder
    if (this.timeAccumulator > 0.15) {
      this.timeAccumulator = this.dt;
    }
    return substeps;
  }
}

const csvText = fs.readFileSync('hardpack_reference_telemetry.csv', 'utf8');
const lines = csvText.trim().split('\n');
const rows: any[] = [];
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(',').map(p => p.trim());
  if (parts.length < 10) continue;
  rows.push({
    timeS: parseFloat(parts[1]),
    refSpeedMph: parseFloat(parts[3]),
    refGear: parts[4],
    throttle: parseFloat(parts[5]),
    brake: parseFloat(parts[6]),
    steer: parseFloat(parts[8]),
    handbrake: parseInt(parts[9], 10) === 1,
  });
}

function runJitterTest(PhysicsClass: any, name: string) {
  const physicsFixed = new PhysicsClass();
  const groundF = physicsFixed.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  physicsFixed.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), groundF);
  const vehicleFixed = new CustomRallyVehicle(new THREE.Scene(), physicsFixed as any);
  vehicleFixed.tuning.surfaceMode = 'dirt';

  const physicsJitter = new PhysicsClass();
  const groundJ = physicsJitter.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  physicsJitter.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), groundJ);
  const vehicleJitter = new CustomRallyVehicle(new THREE.Scene(), physicsJitter as any);
  vehicleJitter.tuning.surfaceMode = 'dirt';

  const initSpeed = rows[0].refSpeedMph * 0.44704;
  for (const v of [vehicleFixed, vehicleJitter]) {
    v.resetPosition();
    v.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeed }, true);
    (v as any).currentGear = 5;
    const omega = initSpeed / v.wheelRadius;
    for (let i = 0; i < 4; i++) (v as any).wheelAngularVel[i] = omega;
  }

  // Pre-settle
  for (let i = 0; i < 15; i++) {
    const inputs = { throttle: rows[0].throttle, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
    physicsFixed.step(1 / 120, (dt: number) => vehicleFixed.updatePhysicsSubstep(dt, inputs));
    physicsJitter.step(1 / 120, (dt: number) => vehicleJitter.updatePhysicsSubstep(dt, inputs));
  }

  // Fixed 30 FPS replay
  const fixedSpeeds: { t: number; speed: number; substeps: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].timeS > 4.5) break;
    const r = rows[i];
    const inputs = { throttle: r.throttle, brake: r.brake, steer: r.steer, handbrake: r.handbrake, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
    const steps = physicsFixed.step(1 / 30, (dt: number) => vehicleFixed.updatePhysicsSubstep(dt, inputs));
    const telem = vehicleFixed.getTelemetry(inputs);
    fixedSpeeds.push({ t: r.timeS, speed: telem.speedMph, substeps: steps });
  }

  // Variable frame rate (jittering 45-75 FPS like typical real browser rAF)
  const jitterSpeeds: { t: number; speed: number; substeps: number }[] = [];
  let simTime = 0;
  let frame = 0;
  while (simTime < 4.5) {
    // Alternate 14ms, 18ms, 22ms, 38ms (mimicking rAF jitter)
    const jitterDts = [0.014, 0.018, 0.016, 0.022, 0.038, 0.015];
    const frameDt = jitterDts[frame % jitterDts.length];
    simTime += frameDt;
    frame++;

    // Interpolate input row at simTime
    const rowIdx = Math.min(rows.length - 1, Math.max(0, Math.floor(simTime / (1 / 30))));
    const r = rows[rowIdx];
    const inputs = { throttle: r.throttle, brake: r.brake, steer: r.steer, handbrake: r.handbrake, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
    const steps = physicsJitter.step(frameDt, (dt: number) => vehicleJitter.updatePhysicsSubstep(dt, inputs));
    const telem = vehicleJitter.getTelemetry(inputs);
    jitterSpeeds.push({ t: simTime, speed: telem.speedMph, substeps: steps });
  }

  console.log(`\n=== RESULTS FOR ${name} ===`);
  const checkTimes = [1.0, 2.0, 2.5, 2.8, 3.2, 3.8, 4.1];
  let maxDiff = 0;
  for (const t of checkTimes) {
    const f = fixedSpeeds.find(x => Math.abs(x.t - t) < 0.02);
    const j = jitterSpeeds.find(x => Math.abs(x.t - t) < 0.02);
    if (f && j) {
      const diff = Math.abs(f.speed - j.speed);
      if (diff > maxDiff) maxDiff = diff;
      console.log(`t=${t.toFixed(1)}s | Fixed=${f.speed.toFixed(1)} mph (substeps=${f.substeps}) | Jitter=${j.speed.toFixed(1)} mph (substeps=${j.substeps}) | Diff=${diff.toFixed(2)} mph`);
    }
  }
  console.log(`Max Divergence: ${maxDiff.toFixed(2)} mph`);
}

runJitterTest(OldPhysicsWorld, 'OLD PHYSICS WORLD (MAX_SUBSTEPS=4, discard > dt)');
runJitterTest(RobustPhysicsWorld, 'ROBUST PHYSICS WORLD (MAX_SUBSTEPS=10, preserved accumulator)');
