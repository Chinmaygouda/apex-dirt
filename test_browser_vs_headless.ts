import fs from 'fs';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';
import { PhysicsWorld } from './src/physics/PhysicsWorld';

await RAPIER.init();

interface TelemetryRow {
  timeS: number;
  refSpeedMph: number;
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

// 1. Load Reference Telemetry
const csvText = fs.readFileSync('hardpack_reference_telemetry.csv', 'utf8');
const lines = csvText.trim().split('\n');
const rows: TelemetryRow[] = [];
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(',').map(p => p.trim());
  if (parts.length < 10) continue;
  rows.push({
    timeS: parseFloat(parts[1]),
    refSpeedMph: parseFloat(parts[3]),
    throttle: parseFloat(parts[5]),
    brake: parseFloat(parts[6]),
    steer: parseFloat(parts[8]),
    handbrake: parseInt(parts[9], 10) === 1,
  });
}

// Run 1: Headless Replay (Fixed 1/30s frames)
async function runHeadlessReplay() {
  const physics = new PhysicsWorld();
  await physics.init();
  const ground = physics.world.createRigidBody(physics.rapier.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), ground);

  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, physics as any);
  vehicle.tuning.surfaceMode = 'dirt';

  vehicle.resetPosition();
  const initSpeedMs = rows[0].refSpeedMph * 0.44704;
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  (vehicle as any).currentGear = 5;
  const omega = initSpeedMs / vehicle.wheelRadius;
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

  // Pre-settle
  for (let i = 0; i < 15; i++) {
    physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, {
      throttle: rows[0].throttle, brake: 0, steer: 0, handbrake: false,
      reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false,
    }));
  }
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

  const records: { timeS: number; speedMph: number; yawDeg: number; slipDeg: number; substeps: number }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.timeS > 4.5) break;
    const inputs = {
      throttle: row.throttle, brake: row.brake, steer: row.steer, handbrake: row.handbrake,
      reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false,
    };

    let substepCount = 0;
    physics.step(1 / 30, (dt) => {
      vehicle.updatePhysicsSubstep(dt, inputs);
      substepCount++;
    });
    vehicle.updateVisuals(inputs, 1 / 30);
    const telem = vehicle.getTelemetry(inputs);

    const rot = vehicle.chassisBody.rotation();
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
    const yawDeg = THREE.MathUtils.radToDeg(euler.y);

    records.push({
      timeS: row.timeS,
      speedMph: telem.speedMph,
      yawDeg,
      slipDeg: vehicle.driftAngleDeg,
      substeps: substepCount,
    });
  }

  return records;
}

// Run 2: Browser Game Loop Simulation (Variable requestAnimationFrame dt with typical 60Hz jitter)
async function runBrowserGameLoopReplay() {
  const physics = new PhysicsWorld();
  await physics.init();
  const ground = physics.world.createRigidBody(physics.rapier.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), ground);

  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, physics as any);
  vehicle.tuning.surfaceMode = 'dirt';

  vehicle.resetPosition();
  const initSpeedMs = rows[0].refSpeedMph * 0.44704;
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  (vehicle as any).currentGear = 5;
  const omega = initSpeedMs / vehicle.wheelRadius;
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

  // Pre-settle
  for (let i = 0; i < 15; i++) {
    physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, {
      throttle: rows[0].throttle, brake: 0, steer: 0, handbrake: false,
      reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false,
    }));
  }
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

  const records: { timeS: number; speedMph: number; yawDeg: number; slipDeg: number; substeps: number }[] = [];

  let simTime = 0;
  let frame = 0;
  // Jitter sequence simulating realistic browser requestAnimationFrame frame times (60Hz nominal with micro-stalls)
  const jitterPatterns = [0.0166, 0.0167, 0.0142, 0.0191, 0.0166, 0.0333, 0.0167, 0.0150, 0.0180];

  while (simTime < 4.5) {
    const frameDt = jitterPatterns[frame % jitterPatterns.length];
    simTime += frameDt;
    frame++;

    // Linearly interpolate continuous input telemetry across variable frame times
    const rawIdx = simTime / (1 / 30);
    const i0 = Math.min(rows.length - 1, Math.max(0, Math.floor(rawIdx)));
    const i1 = Math.min(rows.length - 1, i0 + 1);
    const frac = rawIdx - i0;
    const r0 = rows[i0];
    const r1 = rows[i1];

    const inputs = {
      throttle: r0.throttle + (r1.throttle - r0.throttle) * frac,
      brake: r0.brake + (r1.brake - r0.brake) * frac,
      steer: r0.steer + (r1.steer - r0.steer) * frac,
      handbrake: frac < 0.5 ? r0.handbrake : r1.handbrake,
      reset: false,
      drivetrainToggle: false,
      demoSkidpad: false,
      demoHandbrake: false,
    };

    let substepCount = 0;
    physics.step(frameDt, (dt) => {
      vehicle.updatePhysicsSubstep(dt, inputs);
      substepCount++;
    });
    vehicle.updateVisuals(inputs, frameDt);
    const telem = vehicle.getTelemetry(inputs);

    const rot = vehicle.chassisBody.rotation();
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
    const yawDeg = THREE.MathUtils.radToDeg(euler.y);

    records.push({
      timeS: simTime,
      speedMph: telem.speedMph,
      yawDeg,
      slipDeg: vehicle.driftAngleDeg,
      substeps: substepCount,
    });
  }

  return records;
}

async function main() {
  console.log('================================================================');
  console.log('   APEX DIRT - BROWSER GAME LOOP VS HEADLESS HARNESS SYNC TEST');
  console.log('================================================================\n');

  const headlessRecords = await runHeadlessReplay();
  const browserRecords = await runBrowserGameLoopReplay();

  console.log('Time(s) | Headless | Browser  | Speed Δ | HeadlessYaw | BrowserYaw | Yaw Δ | HeadlessSlip | BrowserSlip | Steps(H/B)');
  console.log('--------+----------+----------+---------+-------------+------------+-------+--------------+-------------+-----------');

  const sampleTimes = [0.5, 1.0, 1.5, 2.0, 2.37, 2.5, 2.8, 3.2, 3.5, 3.8, 4.1];
  let maxSpeedDelta = 0;
  let maxYawDelta = 0;

  for (const t of sampleTimes) {
    const h = headlessRecords.find(r => Math.abs(r.timeS - t) < 0.018);
    const b = browserRecords.find(r => Math.abs(r.timeS - t) < 0.018);

    if (h && b) {
      const speedDelta = Math.abs(h.speedMph - b.speedMph);
      const yawDelta = Math.abs(h.yawDeg - b.yawDeg);
      if (speedDelta > maxSpeedDelta) maxSpeedDelta = speedDelta;
      if (yawDelta > maxYawDelta) maxYawDelta = yawDelta;

      console.log(
        `${t.toFixed(2).padStart(7)} | ` +
        `${(h.speedMph.toFixed(1) + ' mph').padStart(8)} | ` +
        `${(b.speedMph.toFixed(1) + ' mph').padStart(8)} | ` +
        `${(speedDelta.toFixed(2) + ' mph').padStart(7)} | ` +
        `${(h.yawDeg.toFixed(1) + '°').padStart(11)} | ` +
        `${(b.yawDeg.toFixed(1) + '°').padStart(10)} | ` +
        `${(yawDelta.toFixed(1) + '°').padStart(5)} | ` +
        `${(h.slipDeg.toFixed(1) + '°').padStart(12)} | ` +
        `${(b.slipDeg.toFixed(1) + '°').padStart(11)} | ` +
        `${h.substeps}/${b.substeps}`.padStart(9)
      );
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`Peak Speed Divergence across replay: ${maxSpeedDelta.toFixed(2)} mph (Threshold: <= 2.00 mph)`);
  console.log(`Peak Yaw Divergence across replay:   ${maxYawDelta.toFixed(2)}°`);
  console.log('----------------------------------------------------------------\n');

  // Render ASCII Difference Plot
  console.log('SPEED DIFFERENCE PLOT (Browser vs Headless):');
  const width = 60;
  const height = 8;
  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(' '));

  for (let col = 0; col < width; col++) {
    const t = (col / (width - 1)) * 4.2;
    const h = headlessRecords.find(r => Math.abs(r.timeS - t) < 0.04);
    const b = browserRecords.find(r => Math.abs(r.timeS - t) < 0.04);
    if (h && b) {
      const delta = Math.abs(h.speedMph - b.speedMph);
      const row = Math.round((1 - Math.min(1, delta / 2.0)) * (height - 1));
      if (row >= 0 && row < height) {
        grid[row][col] = '*';
      }
    }
  }

  for (let r = 0; r < height; r++) {
    const val = 2.0 * (1 - r / (height - 1));
    console.log(`  ${val.toFixed(1).padStart(3)} mph | ${grid[r].join('')}`);
  }
  console.log('         +' + '-'.repeat(width));
  console.log('          t=0.0s' + ' '.repeat(width - 14) + 't=4.2s\n');

  if (maxSpeedDelta > 2.0) {
    console.error(`[FAIL] Browser and Headless diverged by ${maxSpeedDelta.toFixed(2)} mph (limit: 2.0 mph)`);
    process.exit(1);
  } else {
    console.log(`[PASS] Browser game loop and Headless harness in perfect sync (Max Δ = ${maxSpeedDelta.toFixed(2)} mph <= 2.0 mph)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
