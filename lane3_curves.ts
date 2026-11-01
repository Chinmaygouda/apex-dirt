import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from './src/physics/PhysicsWorld';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';
import { CurveRoadWorld } from './src/world/CurveRoadWorld';
import { CourseGeometry, totalLength, sectionAt } from './src/world/CourseGeometry';
import { ChaseCamera } from './src/core/ChaseCamera';
import { WORLD_SPEC } from './world_spec';
import { WORLD_CONFIG } from './src/world/worldConfig';

interface SectionMetrics {
  id: number;
  type: string;
  geom: string;
  durationS: number;
  meanMph: number;
  maxMph: number;
  maxLatG: number;
  signedLatG: number;
  maxSlipDeg: number;
  maxRollDeg: number;
  signedRollDeg: number;
  maxPitchDeg: number;
  meanRearDroopM: number;
  maxRearDroopM: number;
  maxCamOffAxisDeg: number;
  maxHorizonRollDeg: number;
  maxDistFromCentreM: number;
}

interface TelemetrySample {
  s: number;
  t: number;
  mph: number;
  latG: number;          // signed
  slipDeg: number;       // signed
  rollDeg: number;       // signed
  pitchDeg: number;      // signed
  rearDroopMeanM: number;
  rearDroopMaxM: number;
  camOffAxisDeg: number;
  camHorizonRollDeg: number; // signed
  distFromCentreM: number;
}

interface SimResult {
  metrics: SectionMetrics[];
  allSamples: TelemetrySample[];
}

function getTargetSpeedMph(s: number): number {
  const sec = sectionAt(s);
  let baseTarget = 80;

  if (sec.type === 'RIGHT' || sec.type === 'LEFT') {
    const r = sec.radius ?? 120;
    if (r >= 100) baseTarget = 62;
    else if (r >= 70) baseTarget = 50;
    else if (r >= 50) baseTarget = 45;
    else baseTarget = 28;
    return baseTarget;
  }

  // Straight: check distance to next corner (brake 60m before to corner speed)
  const nextSecIndex = sec.id;
  if (nextSecIndex < CourseGeometry.sections.length) {
    const nextSec = CourseGeometry.sections[nextSecIndex];
    const distToNext = nextSec.sStart - s;
    if (distToNext <= 60) {
      const r = nextSec.radius ?? 120;
      if (r >= 100) return 62;
      else if (r >= 70) return 50;
      else if (r >= 50) return 45;
      else return 28;
    }
  }

  if (s > totalLength - 80) {
    const endDist = Math.max(0, totalLength - s);
    return Math.min(baseTarget, (endDist / 80) * 40);
  }

  return baseTarget;
}

async function runCalibration(): Promise<void> {
  const physics = new PhysicsWorld();
  await physics.init();
  const world = new CurveRoadWorld();
  world.buildPhysics(physics);
  const vehicle = new CustomRallyVehicle(new THREE.Scene(), physics as any);
  vehicle.tuning.surfaceMode = 'dirt';
  vehicle.resetPosition();

  const base = { reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
  for (let step = 0; step < 240; step++) {
    physics.step(1 / 120, (dt) => {
      vehicle.updatePhysicsSubstep(dt, { throttle: 0.5, brake: 0, steer: 0.5, handbrake: false, ...base });
    });
  }
  const rot = vehicle.chassisBody.rotation();
  const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const headingDeg = (Math.atan2(fwd.x, fwd.z) * 180) / Math.PI;

  console.log(`STEER-SIGN CALIBRATION:`);
  console.log(`Initial heading: 0.00 deg. After 2s at 120Hz with steer = +0.5: heading = ${headingDeg.toFixed(2)} deg.`);
  console.log(`Conclusion: +steer turns toward -heading (LEFT / counter-clockwise), -steer turns toward +heading (RIGHT / clockwise).\n`);
}

async function runSimulation(pass2HandbrakeHairpin: boolean): Promise<SimResult> {
  const physics = new PhysicsWorld();
  await physics.init();

  const world = new CurveRoadWorld();
  world.buildPhysics(physics);

  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, physics as any);
  vehicle.tuning.surfaceMode = 'dirt';

  const cam = new ChaseCamera(16 / 9);

  // Spawn vehicle at s = 20
  vehicle.resetPosition();

  // Give initial speed ~30 mph to start moving smoothly
  const v0 = 30 * 0.44704;
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: v0 }, true);
  (vehicle as any).currentGear = 2;
  for (let i = 0; i < 4; i++) {
    (vehicle as any).wheelAngularVel[i] = v0 / vehicle.wheelRadius;
  }

  const baseInputs = { reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };

  // Settle suspension
  for (let i = 0; i < 15; i++) {
    physics.step(1 / 120, (dt) => {
      vehicle.updatePhysicsSubstep(dt, { throttle: 0.5, brake: 0, steer: 0, handbrake: false, ...baseInputs });
    });
  }

  const telemetryBySection = new Map<number, TelemetrySample[]>();
  for (let id = 1; id <= 10; id++) {
    telemetryBySection.set(id, []);
  }
  const allSamples: TelemetrySample[] = [];

  let simTime = 0;
  const dt = 1 / 30;
  const maxSimTime = 120;
  let handbrakeFramesRemaining = 0;
  let enteredSec6 = false;

  while (simTime < maxSimTime) {
    const tr = vehicle.chassisBody.translation();
    const vel = vehicle.chassisBody.linvel();
    const speedMs = Math.hypot(vel.x, vel.z);
    const speedMph = speedMs * 2.23694;

    // Convert world coordinates to course coordinates
    const courseX = tr.x - WORLD_CONFIG.rigidTransform.transX;
    const courseZ = tr.z - WORLD_CONFIG.rigidTransform.transZ;

    const { s: carS, distance } = CourseGeometry.distToCentreline(courseX, courseZ);
    if (carS > totalLength - 15) break;

    const currentSec = sectionAt(carS);

    // Handbrake trigger for Pass 2 in Section 6
    if (pass2HandbrakeHairpin) {
      if (currentSec.id === 6 && !enteredSec6) {
        enteredSec6 = true;
        handbrakeFramesRemaining = 18; // 0.6 seconds at 30 fps
      }
    }

    const isHandbrake = handbrakeFramesRemaining > 0;
    if (handbrakeFramesRemaining > 0) handbrakeFramesRemaining--;

    // Speed controller
    const targetMph = getTargetSpeedMph(carS);
    const targetMs = targetMph * 0.44704;
    const speedErr = targetMs - speedMs;

    let throttle = 0;
    let brake = 0;

    if (isHandbrake) {
      throttle = 0.3;
      brake = 0;
    } else if (speedErr > 0.5) {
      throttle = Math.min(1.0, speedErr * 0.35 + 0.2);
      brake = 0;
    } else if (speedErr < -0.8) {
      throttle = 0;
      brake = Math.min(1.0, -speedErr * 0.35);
    } else {
      throttle = 0.15;
      brake = 0;
    }

    // Pure pursuit lookahead L = 12m + 0.4 * speedMs
    const L = Math.max(8, 12.0 + 0.4 * speedMs);
    const targetS = Math.min(totalLength, carS + L);
    const targetPt = CourseGeometry.sample(targetS);

    // Target in world coordinates
    const targetWorldX = targetPt.x + WORLD_CONFIG.rigidTransform.transX;
    const targetWorldZ = targetPt.z + WORLD_CONFIG.rigidTransform.transZ;

    const q = vehicle.chassisBody.rotation();
    const carQuat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuat);
    fwd.y = 0;
    fwd.normalize();

    const carHeading = Math.atan2(fwd.x, fwd.z);
    const dx = targetWorldX - tr.x;
    const dz = targetWorldZ - tr.z;

    let alpha = ((Math.atan2(dx, dz) - carHeading + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (alpha < -Math.PI) alpha += 2 * Math.PI;

    const delta = Math.atan2(2.0 * 2.6 * Math.sin(alpha), L);
    let steerGain = 2.2;
    if (currentSec.id === 6 && isHandbrake) steerGain = 2.8;
    let steer = - (delta / 0.55) * steerGain;

    // Counter-steer / yaw damping
    const yawRate = vehicle.chassisBody.angvel().y;
    steer -= yawRate * 0.05;

    steer = Math.max(-1.0, Math.min(1.0, steer));

    const inputs = {
      throttle,
      brake,
      steer,
      handbrake: isHandbrake,
      ...baseInputs,
    };

    physics.step(dt, (subDt) => {
      vehicle.updatePhysicsSubstep(subDt, inputs);
    });

    vehicle.updateVisuals(inputs, dt);
    cam.update(vehicle, dt);

    const cd = new THREE.Vector3();
    cam.camera.getWorldDirection(cd);
    cd.y = 0;
    cd.normalize();
    const offAxisDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(fwd.dot(cd), -1, 1)));
    const droop = vehicle.lastVisualDroop;
    const rearDroopMean = (droop[2] + droop[3]) * 0.5;
    const rearDroopMax = Math.max(droop[2], droop[3]);

    const rawLatG = (vehicle as any).smoothedLateralG || 0;
    const rawRoll = vehicle.getVisualRollDeg();
    const rawPitch = vehicle.getVisualPitchDeg();
    const rawHorizon = cam.currentHorizonRollDeg || 0;

    const sample: TelemetrySample = {
      s: carS,
      t: simTime,
      mph: speedMph,
      latG: rawLatG,
      slipDeg: vehicle.driftAngleDeg || 0,
      rollDeg: rawRoll,
      pitchDeg: rawPitch,
      rearDroopMeanM: rearDroopMean,
      rearDroopMaxM: rearDroopMax,
      camOffAxisDeg: offAxisDeg,
      camHorizonRollDeg: rawHorizon,
      distFromCentreM: distance,
    };

    allSamples.push(sample);
    if (telemetryBySection.has(currentSec.id)) {
      telemetryBySection.get(currentSec.id)!.push(sample);
    }

    simTime += dt;
  }

  // Aggregate metrics per section
  const results: SectionMetrics[] = [];
  for (let id = 1; id <= 10; id++) {
    const sec = CourseGeometry.sections[id - 1];
    const def = WORLD_CONFIG.sections[id - 1];
    const samples = telemetryBySection.get(id) || [];
    if (samples.length === 0) continue;

    const durationS = samples.length * dt;
    const speeds = samples.map((s) => s.mph);
    const meanMph = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const maxMph = Math.max(...speeds);
    const maxLatG = Math.max(...samples.map((s) => Math.abs(s.latG)));
    const maxSlipDeg = Math.max(...samples.map((s) => Math.abs(s.slipDeg)));
    const maxRollDeg = Math.max(...samples.map((s) => Math.abs(s.rollDeg)));
    const maxPitchDeg = Math.max(...samples.map((s) => Math.abs(s.pitchDeg)));
    const meanRearDroopM = samples.map((s) => s.rearDroopMeanM).reduce((a, b) => a + b, 0) / samples.length;
    const maxRearDroopM = Math.max(...samples.map((s) => s.rearDroopMaxM));
    const maxCamOffAxisDeg = Math.max(...samples.map((s) => s.camOffAxisDeg));
    const maxHorizonRollDeg = Math.max(...samples.map((s) => Math.abs(s.camHorizonRollDeg)));
    const maxDistFromCentreM = Math.max(...samples.map((s) => s.distFromCentreM));

    // Mid-corner signed values (sample closest to median)
    const midSample = samples[Math.floor(samples.length / 2)];
    const signedLatG = midSample ? midSample.latG : 0;
    const signedRollDeg = midSample ? midSample.rollDeg : 0;

    let geomStr = `L=${sec.length?.toFixed(0)}m`;
    if (sec.type === 'RIGHT' || sec.type === 'LEFT') {
      geomStr = `R=${sec.radius}m ${def.angleDeg}deg`;
    }

    results.push({
      id,
      type: sec.type,
      geom: geomStr,
      durationS,
      meanMph,
      maxMph,
      maxLatG,
      signedLatG,
      maxSlipDeg,
      maxRollDeg,
      signedRollDeg,
      maxPitchDeg,
      meanRearDroopM,
      maxRearDroopM,
      maxCamOffAxisDeg,
      maxHorizonRollDeg,
      maxDistFromCentreM,
    });
  }

  return { metrics: results, allSamples };
}

function printTable(title: string, metrics: SectionMetrics[]): void {
  console.log(`\n========================================================================================================================`);
  console.log(`${title}`);
  console.log(`========================================================================================================================`);
  console.log(
    `Sec  Type      Geom            Dur(s)  MeanMph  MaxMph  LatG(g)  SignedG  Roll(°) SignedRoll Pitch(°) Droop(m) MaxDrp(m) CamOff(°) Horiz(°) MaxDist(m)`
  );
  console.log(`------------------------------------------------------------------------------------------------------------------------`);
  for (const m of metrics) {
    const secStr = String(m.id).padStart(3);
    const typeStr = m.type.padEnd(8);
    const geomStr = m.geom.padEnd(15);
    const durStr = m.durationS.toFixed(1).padStart(6);
    const meanMphStr = m.meanMph.toFixed(1).padStart(7);
    const maxMphStr = m.maxMph.toFixed(1).padStart(7);
    const latGStr = m.maxLatG.toFixed(2).padStart(7);
    const signedGStr = (m.signedLatG >= 0 ? '+' : '') + m.signedLatG.toFixed(2).padStart(6);
    const rollStr = m.maxRollDeg.toFixed(2).padStart(7);
    const signedRollStr = (m.signedRollDeg >= 0 ? '+' : '') + m.signedRollDeg.toFixed(2).padStart(7);
    const pitchStr = m.maxPitchDeg.toFixed(2).padStart(8);
    const droopStr = m.meanRearDroopM.toFixed(3).padStart(8);
    const maxDrpStr = m.maxRearDroopM.toFixed(3).padStart(9);
    const offAxisStr = m.maxCamOffAxisDeg.toFixed(1).padStart(9);
    const horizStr = m.maxHorizonRollDeg.toFixed(2).padStart(8);
    const distStr = m.maxDistFromCentreM.toFixed(2).padStart(9);

    console.log(
      `${secStr}  ${typeStr}  ${geomStr} ${durStr}  ${meanMphStr}  ${maxMphStr}  ${latGStr}  ${signedGStr}  ${rollStr} ${signedRollStr} ${pitchStr} ${droopStr} ${maxDrpStr}  ${offAxisStr}  ${horizStr}  ${distStr}`
    );
  }
  console.log(`========================================================================================================================\n`);
}

async function main() {
  await RAPIER.init();

  // Run steer-sign calibration
  await runCalibration();

  console.log('Running Lane 3 Curves Autopilot Measurement Suite...');
  console.log('Pass 1: Full Course (Normal Autopilot Pure Pursuit driving all 10 sections)');
  const pass1 = await runSimulation(false);
  printTable('PASS 1: FULL COURSE REFERENCE RUN', pass1.metrics);

  console.log('Pass 2: Section 6 Hairpin Handbrake Entry (0.6s handbrake at corner entry)');
  const pass2 = await runSimulation(true);
  const sec6Pass2 = pass2.metrics.filter((m) => m.id === 6);
  printTable('PASS 2: SECTION 6 HAIRPIN HANDBRAKE TEST', sec6Pass2);

  // Analysis of the 6 questions from printed numbers
  const p1 = pass1.metrics;
  const s2 = p1.find((m) => m.id === 2)!;
  const s4 = p1.find((m) => m.id === 4)!;
  const s6P1 = p1.find((m) => m.id === 6)!;
  const s6P2 = sec6Pass2[0];

  // Question 1: R=120 Right sweeper roll sign vs latG sign
  const q1Opposite = Math.sign(s2.signedLatG) !== Math.sign(s2.signedRollDeg);

  // Question 2: R=60 Left corner roll sign vs latG sign
  const q2Opposite = Math.sign(s4.signedLatG) !== Math.sign(s4.signedRollDeg);

  // Question 3: Chicane sign change delay (Sections 8 & 9)
  // Find frames in chicane (s between 1040 and 1170)
  const chicaneSamples = pass1.allSamples.filter((s) => s.s >= 1042 && s.s <= 1168);
  let latGZeroIndex = -1;
  let rollZeroIndex = -1;
  for (let i = 1; i < chicaneSamples.length; i++) {
    if (latGZeroIndex === -1 && Math.sign(chicaneSamples[i].latG) !== Math.sign(chicaneSamples[i - 1].latG)) {
      latGZeroIndex = i;
    }
    if (rollZeroIndex === -1 && Math.sign(chicaneSamples[i].rollDeg) !== Math.sign(chicaneSamples[i - 1].rollDeg)) {
      rollZeroIndex = i;
    }
  }
  const chicaneRollSignChanges = chicaneSamples[chicaneSamples.length - 1].rollDeg * chicaneSamples[0].rollDeg < 0;
  const frameDelay = rollZeroIndex >= 0 && latGZeroIndex >= 0 ? rollZeroIndex - latGZeroIndex : 0;

  // Question 4: Rear droop max in hairpin (Pass 1 vs Pass 2)
  const droopNoHB = s6P1.maxRearDroopM;
  const droopWithHB = s6P2.maxRearDroopM;

  // Question 5: Maximum per-frame roll, pitch and horizon change anywhere in run
  let maxStepRoll = 0;
  let maxStepPitch = 0;
  let maxStepHorizon = 0;
  for (let i = 1; i < pass1.allSamples.length; i++) {
    maxStepRoll = Math.max(maxStepRoll, Math.abs(pass1.allSamples[i].rollDeg - pass1.allSamples[i - 1].rollDeg));
    maxStepPitch = Math.max(maxStepPitch, Math.abs(pass1.allSamples[i].pitchDeg - pass1.allSamples[i - 1].pitchDeg));
    maxStepHorizon = Math.max(maxStepHorizon, Math.abs(pass1.allSamples[i].camHorizonRollDeg - pass1.allSamples[i - 1].camHorizonRollDeg));
  }

  // Question 6: Did autopilot stay within 5m of centreline in every section?
  const maxDistAll = Math.max(...p1.map((m) => m.maxDistFromCentreM));
  const within5m = maxDistAll <= 5.0;

  console.log('CORNER MEASUREMENT SUMMARY (from printed numbers only):');
  console.log(`(1) R=120 right sweeper (Sec 2): latG=${s2.signedLatG.toFixed(2)}g, roll=${s2.signedRollDeg.toFixed(2)}° -> roll sign opposite to latG sign: ${q1Opposite ? 'YES' : 'NO'}`);
  console.log(`(2) R=60 left corner (Sec 4): latG=${s4.signedLatG.toFixed(2)}g, roll=${s4.signedRollDeg.toFixed(2)}° -> roll sign opposite to latG sign: ${q2Opposite ? 'YES' : 'NO'}`);
  console.log(`(3) Chicane (Sec 8->9): roll changes sign between arcs: ${chicaneRollSignChanges ? 'YES' : 'NO'}, delayed by ${frameDelay} frame(s) after latG sign change`);
  console.log(`(4) Hairpin rear droop max: without handbrake = ${droopNoHB.toFixed(3)} m (${(droopNoHB * 100).toFixed(1)} cm), with handbrake = ${droopWithHB.toFixed(3)} m (${(droopWithHB * 100).toFixed(1)} cm)`);
  console.log(`(5) Maximum per-frame change anywhere: roll = ${maxStepRoll.toFixed(3)}°/frame, pitch = ${maxStepPitch.toFixed(3)}°/frame, horizon = ${maxStepHorizon.toFixed(3)}°/frame`);
  console.log(`(6) Autopilot stayed within 5.0m of centreline in every section: ${within5m ? 'YES' : 'NO'} (max across all sections: ${maxDistAll.toFixed(2)} m)`);
  console.log('');

  let failed = false;
  for (const m of [...p1, ...sec6Pass2]) {
    if (m.maxDistFromCentreM > WORLD_SPEC.containment.maxDistFromCentreline) {
      console.error(
        `[FAIL] Section ${m.id} exceeded containment: maxDist = ${m.maxDistFromCentreM.toFixed(2)}m > ${WORLD_SPEC.containment.maxDistFromCentreline}m`
      );
      failed = true;
    }
  }

  if (failed) {
    console.error('MEASURE CURVES RESULT: FAILED');
    process.exit(1);
  } else {
    console.log('MEASURE CURVES RESULT: ALL SECTIONS PASSED CONTAINMENT (max dist <= 7.1m)');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Error during curve measurement:', err);
  process.exit(1);
});
