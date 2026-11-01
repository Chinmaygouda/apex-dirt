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
  maxSlipDeg: number;
  maxRollDeg: number;
  maxPitchDeg: number;
  meanRearDroopM: number;
  maxCamOffAxisDeg: number;
  maxHorizonRollDeg: number;
  maxDistFromCentreM: number;
}

interface TelemetrySample {
  s: number;
  t: number;
  mph: number;
  latG: number;
  slipDeg: number;
  rollDeg: number;
  pitchDeg: number;
  rearDroopM: number;
  camOffAxisDeg: number;
  camHorizonRollDeg: number;
  distFromCentreM: number;
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

async function runSimulation(pass2HandbrakeHairpin: boolean): Promise<SectionMetrics[]> {
  await RAPIER.init();
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

    const sample: TelemetrySample = {
      s: carS,
      t: simTime,
      mph: speedMph,
      latG: Math.abs((vehicle as any).smoothedLateralG || 0),
      slipDeg: Math.abs(vehicle.driftAngleDeg || 0),
      rollDeg: Math.abs(vehicle.getVisualRollDeg()),
      pitchDeg: Math.abs(vehicle.getVisualPitchDeg()),
      rearDroopM: rearDroopMean,
      camOffAxisDeg: offAxisDeg,
      camHorizonRollDeg: Math.abs(cam.currentHorizonRollDeg || 0),
      distFromCentreM: distance,
    };

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
    const maxLatG = Math.max(...samples.map((s) => s.latG));
    const maxSlipDeg = Math.max(...samples.map((s) => s.slipDeg));
    const maxRollDeg = Math.max(...samples.map((s) => s.rollDeg));
    const maxPitchDeg = Math.max(...samples.map((s) => s.pitchDeg));
    const meanRearDroopM = samples.map((s) => s.rearDroopM).reduce((a, b) => a + b, 0) / samples.length;
    const maxCamOffAxisDeg = Math.max(...samples.map((s) => s.camOffAxisDeg));
    const maxHorizonRollDeg = Math.max(...samples.map((s) => s.camHorizonRollDeg));
    const maxDistFromCentreM = Math.max(...samples.map((s) => s.distFromCentreM));

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
      maxSlipDeg,
      maxRollDeg,
      maxPitchDeg,
      meanRearDroopM,
      maxCamOffAxisDeg,
      maxHorizonRollDeg,
      maxDistFromCentreM,
    });
  }

  return results;
}

function printTable(title: string, metrics: SectionMetrics[]): void {
  console.log(`\n================================================================================================================`);
  console.log(`${title}`);
  console.log(`================================================================================================================`);
  console.log(
    `Sec  Type      Geom            Dur(s)  MeanMph  MaxMph  LatG(g)  Slip(deg)  Roll(deg) Pitch(deg) Droop(m) CamOff(deg) Horiz(deg) MaxDist(m)`
  );
  console.log(`----------------------------------------------------------------------------------------------------------------`);
  for (const m of metrics) {
    const secStr = String(m.id).padStart(3);
    const typeStr = m.type.padEnd(8);
    const geomStr = m.geom.padEnd(15);
    const durStr = m.durationS.toFixed(1).padStart(6);
    const meanMphStr = m.meanMph.toFixed(1).padStart(7);
    const maxMphStr = m.maxMph.toFixed(1).padStart(7);
    const latGStr = m.maxLatG.toFixed(2).padStart(7);
    const slipStr = m.maxSlipDeg.toFixed(1).padStart(9);
    const rollStr = m.maxRollDeg.toFixed(2).padStart(9);
    const pitchStr = m.maxPitchDeg.toFixed(2).padStart(9);
    const droopStr = m.meanRearDroopM.toFixed(3).padStart(8);
    const offAxisStr = m.maxCamOffAxisDeg.toFixed(1).padStart(10);
    const horizStr = m.maxHorizonRollDeg.toFixed(2).padStart(9);
    const distStr = m.maxDistFromCentreM.toFixed(2).padStart(9);

    console.log(
      `${secStr}  ${typeStr}  ${geomStr} ${durStr}  ${meanMphStr}  ${maxMphStr}  ${latGStr}  ${slipStr}  ${rollStr}  ${pitchStr} ${droopStr}  ${offAxisStr}  ${horizStr}  ${distStr}`
    );
  }
  console.log(`================================================================================================================\n`);
}

async function main() {
  console.log('Running Lane 3 Curves Autopilot Measurement Suite...');
  console.log('Pass 1: Full Course (Normal Autopilot Pure Pursuit driving all 10 sections)');
  const pass1 = await runSimulation(false);
  printTable('PASS 1: FULL COURSE REFERENCE RUN', pass1);

  console.log('Pass 2: Section 6 Hairpin Handbrake Entry (0.6s handbrake at corner entry)');
  const pass2 = await runSimulation(true);
  const sec6Pass2 = pass2.filter((m) => m.id === 6);
  printTable('PASS 2: SECTION 6 HAIRPIN HANDBRAKE TEST', sec6Pass2);

  let failed = false;
  for (const m of [...pass1, ...pass2]) {
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
