import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CourseGeometry, totalLength, sectionAt } from './src/world/CourseGeometry';
import { WORLD_CONFIG } from './src/world/worldConfig';
import { WORLD_SPEC } from './world_spec';
import { CurveRoadWorld } from './src/world/CurveRoadWorld';
import { PhysicsWorld } from './src/physics/PhysicsWorld';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';

let hasFailure = false;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    hasFailure = true;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

console.log('======================================================================');
console.log('PART 1: CourseGeometry Mathematical & Geometric Contract Verification');
console.log('======================================================================');

// 1. Total length
const lenDiff = Math.abs(totalLength - WORLD_SPEC.totalLength);
assert(
  lenDiff <= WORLD_SPEC.totalLengthTol,
  `Total length ${totalLength.toFixed(3)} m matches spec ${WORLD_SPEC.totalLength} m (+/- ${WORLD_SPEC.totalLengthTol} m)`
);

// 2. Section list and start distances
const expectedStartDistances = [0, 400, 526, 676, 770, 870, 922, 1042, 1105, 1168];
for (let i = 0; i < CourseGeometry.sections.length; i++) {
  const sec = CourseGeometry.sections[i];
  const specSec = WORLD_SPEC.sections[i];
  assert(sec.id === specSec.id, `Section ${i + 1} id matches spec: ${sec.id}`);
  assert(sec.type === specSec.type, `Section ${i + 1} type matches spec: ${sec.type}`);
  const roundedStart = Math.round(sec.sStart);
  assert(
    Math.abs(roundedStart - expectedStartDistances[i]) <= 1,
    `Section ${i + 1} start distance ${sec.sStart.toFixed(1)} m matches expected ~${expectedStartDistances[i]} m`
  );
}

// 3. End heading
const endSample = CourseGeometry.sample(totalLength);
const endHeadingDeg = (endSample.heading * 180.0) / Math.PI;
assert(
  Math.abs(endHeadingDeg - WORLD_SPEC.endHeadingDeg) <= WORLD_SPEC.endHeadingTolDeg,
  `End heading ${endHeadingDeg.toFixed(2)} deg matches spec ${WORLD_SPEC.endHeadingDeg} deg`
);

// 4. Min separation non-adjacent by brute force (>150m along road)
let minSeparation = Infinity;
let minSepS1 = 0;
let minSepS2 = 0;
const sampleStep = 1.0;
const sampledPoints: Array<{ s: number; x: number; z: number }> = [];

for (let s = 0.0; s <= totalLength; s += sampleStep) {
  const pt = CourseGeometry.sample(s);
  sampledPoints.push({ s, x: pt.x, z: pt.z });
}

for (let i = 0; i < sampledPoints.length; i++) {
  for (let j = i + 1; j < sampledPoints.length; j++) {
    const sDist = Math.abs(sampledPoints[j].s - sampledPoints[i].s);
    if (sDist > WORLD_SPEC.separationExclusionWindow) {
      const d = Math.hypot(sampledPoints[j].x - sampledPoints[i].x, sampledPoints[j].z - sampledPoints[i].z);
      if (d < minSeparation) {
        minSeparation = d;
        minSepS1 = sampledPoints[i].s;
        minSepS2 = sampledPoints[j].s;
      }
    }
  }
}

assert(
  minSeparation >= WORLD_SPEC.minSeparationNonAdjacent,
  `Non-adjacent centreline separation ${minSeparation.toFixed(2)} m >= ${WORLD_SPEC.minSeparationNonAdjacent} m (min between s=${minSepS1.toFixed(1)} and s=${minSepS2.toFixed(1)})`
);

console.log('\n======================================================================');
console.log('PART 2: Static Checks (Zero Procedural Randomness / Zero Trees)');
console.log('======================================================================');

const filesToCheck = [
  'src/world/worldConfig.ts',
  'src/world/CourseGeometry.ts',
  'src/world/CurveRoadWorld.ts',
];

for (const relPath of filesToCheck) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) continue;
  const content = fs.readFileSync(fullPath, 'utf8');

  const hasMathRandom = content.includes('Math.random');
  const hasTreeWord = /\btree\b|\btrees\b/i.test(content);

  assert(!hasMathRandom, `${relPath} contains no Math.random()`);
  assert(!hasTreeWord, `${relPath} contains no tree / Tree`);
}

console.log('\n======================================================================');
console.log('PART 3: Physics Vehicle Containment Verification (Headless Rapier)');
console.log('======================================================================');

await RAPIER.init();

// Helper to run a test and monitor containment
interface ContainmentResult {
  testName: string;
  maxDist: number;
  minS: number;
  maxS: number;
  maxY: number;
  pass: boolean;
}

async function runContainmentTest(
  name: string,
  setupFn: (vehicle: CustomRallyVehicle, physics: PhysicsWorld) => { durationS: number; getInputs: (t: number) => any }
): Promise<ContainmentResult> {
  const physics = new PhysicsWorld();
  await physics.init();

  const world = new CurveRoadWorld();
  world.buildPhysics(physics);

  const vehicle = new CustomRallyVehicle(new THREE.Scene(), physics as any);
  vehicle.tuning.surfaceMode = 'dirt';

  const { durationS, getInputs } = setupFn(vehicle, physics);

  let maxDist = 0.0;
  let minS = Infinity;
  let maxS = -Infinity;
  let maxY = -Infinity;

  const dt = 1.0 / 120.0;
  const totalSteps = Math.ceil(durationS / dt);

  for (let step = 0; step < totalSteps; step++) {
    const t = step * dt;
    const inputs = getInputs(t);

    physics.step(dt, (subDt) => {
      vehicle.updatePhysicsSubstep(subDt, inputs);
    });

    const tr = vehicle.chassisBody.translation();
    maxY = Math.max(maxY, tr.y);

    // Transform world to course coordinates
    const courseX = tr.x - WORLD_CONFIG.rigidTransform.transX;
    const courseZ = tr.z - WORLD_CONFIG.rigidTransform.transZ;

    const res = CourseGeometry.distToCentreline(courseX, courseZ);
    maxDist = Math.max(maxDist, res.distance);
    minS = Math.min(minS, res.s);
    maxS = Math.max(maxS, res.s);
  }

  const passDist = maxDist <= WORLD_SPEC.containment.maxDistFromCentreline;
  const passMinS = minS >= WORLD_SPEC.containment.minS - 1.0; // within barrier thickness
  const passMaxS = maxS <= WORLD_SPEC.containment.maxS + 1.0;
  const passY = maxY <= WORLD_SPEC.containment.maxY;
  const pass = passDist && passMinS && passMaxS && passY;

  const status = pass ? 'PASS' : 'FAIL';
  console.log(
    `${name}: maxDist=${maxDist.toFixed(2)}m (<= ${WORLD_SPEC.containment.maxDistFromCentreline}m), ` +
    `sRange=[${minS.toFixed(1)}, ${maxS.toFixed(1)}], maxY=${maxY.toFixed(2)}m (<= ${WORLD_SPEC.containment.maxY}m) -> ${status}`
  );

  if (!pass) {
    hasFailure = true;
  }

  return { testName: name, maxDist, minS, maxS, maxY, pass };
}

// 3a. RUN-OFF per arc (sections 2, 4, 6, 8, 9)
const arcSections = CourseGeometry.sections.filter((s) => s.type === 'RIGHT' || s.type === 'LEFT');

for (const arc of arcSections) {
  await runContainmentTest(`RUN-OFF Section ${arc.id} (${arc.type} R=${arc.radius})`, (vehicle, physics) => {
    // Start at arc entry on centreline, heading along entry tangent, 70 mph
    const entryPt = CourseGeometry.sample(arc.sStart);
    const worldX = entryPt.x + WORLD_CONFIG.rigidTransform.transX;
    const worldZ = entryPt.z + WORLD_CONFIG.rigidTransform.transZ;
    const heading = entryPt.heading;

    vehicle.resetPosition();
    vehicle.chassisBody.setTranslation({ x: worldX, y: 0.6593, z: worldZ }, true);
    vehicle.chassisBody.setRotation({ x: 0, y: Math.sin(heading / 2.0), z: 0, w: Math.cos(heading / 2.0) }, true);

    const speedMs = 70.0 * 0.44704;
    const vx = speedMs * Math.sin(heading);
    const vz = speedMs * Math.cos(heading);
    vehicle.chassisBody.setLinvel({ x: vx, y: 0, z: vz }, true);
    vehicle.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

    (vehicle as any).currentGear = 5;
    const omega = speedMs / vehicle.wheelRadius;
    for (let i = 0; i < 4; i++) {
      (vehicle as any).wheelAngularVel[i] = omega;
    }

    // Pre-settle 10 substeps then reset velocity
    const base = { reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
    for (let i = 0; i < 10; i++) {
      physics.step(1.0 / 120.0, (subDt) => {
        vehicle.updatePhysicsSubstep(subDt, { throttle: 0, brake: 0, steer: 0, handbrake: false, ...base });
      });
    }
    vehicle.chassisBody.setLinvel({ x: vx, y: 0, z: vz }, true);
    for (let i = 0; i < 4; i++) {
      (vehicle as any).wheelAngularVel[i] = omega;
    }

    return {
      durationS: 6.0,
      getInputs: () => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, ...base }),
    };
  });
}

// 3b. END BARRIER test: from spawn, full throttle for 60s
await runContainmentTest('END BARRIER (60s Full Throttle)', (vehicle) => {
  vehicle.resetPosition();
  const base = { reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
  return {
    durationS: 60.0,
    getInputs: () => ({ throttle: 1.0, brake: 0, steer: 0, handbrake: false, ...base }),
  };
});

// 3c. START BARRIER test: from spawn, full reverse for 20s
await runContainmentTest('START BARRIER (20s Full Reverse)', (vehicle) => {
  vehicle.resetPosition();
  const base = { reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
  return {
    durationS: 20.0,
    getInputs: () => ({ throttle: 0, brake: 1.0, steer: 0, handbrake: false, ...base }),
  };
});

// 3d. REPLAY: hardpack_reference_telemetry.csv inputs 0-20s
const lines = fs.readFileSync('hardpack_reference_telemetry.csv', 'utf8').trim().split('\n');
const replayRows: any[] = [];
for (let i = 1; i < lines.length; i++) {
  const p = lines[i].split(',').map((x) => x.trim());
  if (p.length < 10) continue;
  replayRows.push({
    t: parseFloat(p[1]),
    mph: parseFloat(p[3]),
    throttle: parseFloat(p[5]),
    brake: parseFloat(p[6]),
    steer: parseFloat(p[8]),
    hb: parseInt(p[9], 10) === 1,
  });
}

await runContainmentTest('REPLAY (0-20s hardpack_reference_telemetry.csv)', (vehicle, physics) => {
  vehicle.resetPosition();
  const v0 = replayRows[0].mph * 0.44704;
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: v0 }, true);
  (vehicle as any).currentGear = 5;
  for (let i = 0; i < 4; i++) {
    (vehicle as any).wheelAngularVel[i] = v0 / vehicle.wheelRadius;
  }

  const base = { reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
  for (let i = 0; i < 15; i++) {
    physics.step(1.0 / 120.0, (subDt) => {
      vehicle.updatePhysicsSubstep(subDt, {
        throttle: replayRows[0].throttle,
        brake: 0,
        steer: 0,
        handbrake: false,
        ...base,
      });
    });
  }
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: v0 }, true);
  for (let i = 0; i < 4; i++) {
    (vehicle as any).wheelAngularVel[i] = v0 / vehicle.wheelRadius;
  }

  return {
    durationS: 20.0,
    getInputs: (t: number) => {
      // Find row closest to t
      const r = replayRows.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), replayRows[0]);
      return {
        throttle: r.throttle,
        brake: r.brake,
        steer: r.steer,
        handbrake: r.hb,
        ...base,
      };
    },
  };
});

console.log('\n======================================================================');
if (hasFailure) {
  console.error('TEST WORLD CONTRACT RESULT: FAILED');
  process.exit(1);
} else {
  console.log('TEST WORLD CONTRACT RESULT: ALL PASSED');
  process.exit(0);
}
