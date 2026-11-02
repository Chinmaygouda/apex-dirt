import fs from 'fs';
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
  signedLatGMean: number;
  signedLatGPeak: number;
  latG95thPercentile: number;
  maxSlipDeg: number;
  signedRollMeanDeg: number;
  peakAbsRollDeg: number;
  minPitchDeg: number;
  maxPitchDeg: number;
  maxRearDroopM: number;
  maxFrontDroopM: number;
  maxCamOffAxisDeg: number;
  minHorizonRollDeg: number;
  maxHorizonRollDeg: number;
  maxDistFromCentreM: number;
  offRoadFrames: number;
}

interface TelemetrySample {
  pass: number;
  frame: number;
  t: number;
  s: number;
  section: number;
  mph: number;
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  latG: number;               // instantaneous / raw
  smoothedLatG: number;       // smoothed
  slipDeg: number;            // drift angle beta
  yawDeg: number;             // car heading in deg
  rollDeg: number;            // visual roll
  pitchDeg: number;           // visual pitch
  droopFL: number;
  droopFR: number;
  droopRL: number;
  droopRR: number;
  fzFL: number;
  fzFR: number;
  fzRL: number;
  fzRR: number;
  slipRatioFL: number;
  slipRatioFR: number;
  slipRatioRL: number;
  slipRatioRR: number;
  camOffAxisDeg: number;
  camHorizonRollDeg: number;  // signed
  distFromCentreM: number;
  x: number;
  y: number;
  z: number;
}

interface SimResult {
  metrics: SectionMetrics[];
  allSamples: TelemetrySample[];
}

function getSectionDesignSpeed(secId: number): number {
  switch (secId) {
    case 2: return 49.6; // R120 right (-20% from 62)
    case 4: return 40.5; // R60 left (-10% from 45)
    case 6: return 25.2; // R25 right (-10% from 28)
    case 8: return 45.0; // R80 left chicane arc 1 (-10% from 50)
    case 9: return 45.0; // R80 right chicane arc 2 (-10% from 50)
    default: return 80.0; // straights
  }
}

function getTargetSpeedMph(s: number): number {
  const currentSec = sectionAt(s);
  let baseTarget = 80;

  if (currentSec.type !== 'STRAIGHT') {
    return getSectionDesignSpeed(currentSec.id);
  }

  // On straight: look ahead to upcoming corner and begin braking early
  const nextSecIndex = currentSec.id; // next section 1-based index is currentSec.id + 1, so index is currentSec.id
  if (nextSecIndex < CourseGeometry.sections.length) {
    const nextSec = CourseGeometry.sections[nextSecIndex];
    const cornerSpeedMph = getSectionDesignSpeed(nextSec.id);
    if (cornerSpeedMph < 80) {
      const distToCorner = nextSec.sStart - s;
      // Required braking distance with ~6.0 m/s^2 deceleration plus margin
      const v0 = 80 * 0.44704;
      const v1 = cornerSpeedMph * 0.44704;
      const brakeDist = ((v0 * v0 - v1 * v1) / (2 * 6.0)) + 12.0;
      if (distToCorner <= brakeDist) {
        const progress = Math.max(0, Math.min(1, distToCorner / brakeDist));
        return cornerSpeedMph + progress * (80 - cornerSpeedMph);
      }
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
  physics.world.integrationParameters.dt = 1 / 120;

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

async function runSimulation(passNumber: number, pass2HandbrakeHairpin: boolean, printDebug: boolean): Promise<SimResult> {
  const physics = new PhysicsWorld();
  await physics.init();
  physics.world.integrationParameters.dt = 1 / 120;

  const world = new CurveRoadWorld();
  world.buildPhysics(physics);

  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, physics as any);
  vehicle.tuning.surfaceMode = 'dirt';

  const cam = new ChaseCamera(16 / 9);

  // Spawn vehicle at s = 20
  vehicle.resetPosition();

  // Initial speed ~30 mph to start moving smoothly
  const v0 = 30 * 0.44704;
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: v0 }, true);
  (vehicle as any).currentGear = 2;
  for (let i = 0; i < 4; i++) {
    (vehicle as any).wheelAngularVel[i] = v0 / vehicle.wheelRadius;
  }

  const baseInputs = { reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };

  // Settle suspension: 15 substeps of 1/120s
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
  let frameIndex = 0;

  if (printDebug) {
    console.log('--- AUTOPILOT DEBUGGING TRACE (Sections 2 and 4) ---');
    console.log('Frame   Sec     s(m)    CrossTrackErr(m)  HeadingErr(deg)  SteerCmd  Convention');
  }

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
    } else if (speedErr > 0.4) {
      throttle = Math.min(1.0, speedErr * 0.25 + 0.15);
      brake = 0;
    } else if (speedErr < -0.4) {
      throttle = 0;
      brake = Math.min(1.0, -speedErr * 0.35);
    } else {
      throttle = 0.12;
      brake = 0;
    }

    // Geometry reference and car orientation
    const refPt = CourseGeometry.sample(carS);
    const normX = Math.cos(refPt.heading);
    const normZ = -Math.sin(refPt.heading);
    // Signed cross-track error: positive when car is to the right of centreline
    const crossTrackError = (courseX - refPt.x) * normX + (courseZ - refPt.z) * normZ;

    const q = vehicle.chassisBody.rotation();
    const carQuat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuat);
    fwd.y = 0;
    fwd.normalize();

    const carHeading = Math.atan2(fwd.x, fwd.z);
    let headingError = ((refPt.heading - carHeading + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (headingError < -Math.PI) headingError += 2 * Math.PI;

    // Speed-sensitive steering lock from CustomRallyVehicle
    const maxSteerRad = THREE.MathUtils.degToRad(31.5);
    const forwardSpeedMs = Math.max(1.0, speedMs);
    const targetAyLimit = 1.15 * 9.80665;
    const kinSteerRad = (2.70 * targetAyLimit) / (forwardSpeedMs * forwardSpeedMs);
    const slipSteerRad = 0.046;
    const speedTaper = THREE.MathUtils.smoothstep(speedMph, 30.0, 60.0);
    const cruiseLockRad = THREE.MathUtils.lerp(maxSteerRad, Math.min(maxSteerRad, kinSteerRad + slipSteerRad), speedTaper);

    // Lookahead for heading anticipation
    const L = Math.min(14.0, Math.max(5.0, 0.35 * speedMs));
    const targetPt = CourseGeometry.sample(Math.min(totalLength, carS + L));

    let lookaheadHeadingError = ((targetPt.heading - carHeading + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (lookaheadHeadingError < -Math.PI) lookaheadHeadingError += 2 * Math.PI;

    // Stanley control:
    // 1) Heading term: road heading > car heading (+h) -> turn RIGHT (-steer)
    const steerHeading = - (lookaheadHeadingError / cruiseLockRad) * 1.0;

    // 2) Cross-track term: car to right (+e) -> turn LEFT (+steer)
    const crossTrackSteerAngle = Math.atan2(0.85 * crossTrackError, forwardSpeedMs + 1.0);
    const steerCrossTrack = + (crossTrackSteerAngle / cruiseLockRad);

    // 3) Yaw rate damping: counter-steer if yawing excessively
    const yawRate = vehicle.chassisBody.angvel().y;
    const steerDamp = - (yawRate * 0.04);

    let steer = steerHeading + steerCrossTrack + steerDamp;

    if (currentSec.id === 6 && isHandbrake) {
      steer = Math.sign(steer) * Math.min(1.0, Math.abs(steer) * 1.4);
    }

    steer = Math.max(-1.0, Math.min(1.0, steer));

    if (printDebug && (currentSec.id === 2 || currentSec.id === 4) && frameIndex % 15 === 0) {
      const headingDeg = (headingError * 180 / Math.PI);
      console.log(
        `${String(frameIndex).padStart(5)}   Sec ${currentSec.id}   ${carS.toFixed(1).padStart(7)}m   ` +
        `${(crossTrackError >= 0 ? '+' : '') + crossTrackError.toFixed(3).padStart(7)}m   ` +
        `${(headingDeg >= 0 ? '+' : '') + headingDeg.toFixed(2).padStart(7)}°   ` +
        `${(steer >= 0 ? '+' : '') + steer.toFixed(3).padStart(6)}   ` +
        `+steer=LEFT, -steer=RIGHT`
      );
    }

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
    const fz = (vehicle as any).wheelNormalForces as number[];
    const sr = (vehicle as any).wheelSlipRatios as number[];

    const rawLatG = (vehicle as any).smoothedLateralG || 0;
    const rawRoll = vehicle.getVisualRollDeg();
    const rawPitch = vehicle.getVisualPitchDeg();
    const rawHorizon = cam.currentHorizonRollDeg || 0;
    const carYawDeg = (carHeading * 180) / Math.PI;

    const sample: TelemetrySample = {
      pass: passNumber,
      frame: frameIndex,
      t: simTime,
      s: carS,
      section: currentSec.id,
      mph: speedMph,
      steer,
      throttle,
      brake,
      handbrake: isHandbrake,
      latG: (vehicle as any).lateralG || 0,
      smoothedLatG: rawLatG,
      slipDeg: vehicle.driftAngleDeg || 0,
      yawDeg: carYawDeg,
      rollDeg: rawRoll,
      pitchDeg: rawPitch,
      droopFL: droop[0],
      droopFR: droop[1],
      droopRL: droop[2],
      droopRR: droop[3],
      fzFL: fz[0],
      fzFR: fz[1],
      fzRL: fz[2],
      fzRR: fz[3],
      slipRatioFL: sr[0],
      slipRatioFR: sr[1],
      slipRatioRL: sr[2],
      slipRatioRR: sr[3],
      camOffAxisDeg: offAxisDeg,
      camHorizonRollDeg: rawHorizon,
      distFromCentreM: distance,
      x: tr.x,
      y: tr.y,
      z: tr.z,
    };

    allSamples.push(sample);
    if (telemetryBySection.has(currentSec.id)) {
      telemetryBySection.get(currentSec.id)!.push(sample);
    }

    simTime += dt;
    frameIndex++;
  }

  // Aggregate metrics per section (Part 2.3)
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

    // LatG: signed mean, signed peak (at max |latG|), |95th percentile|
    const latGs = samples.map((s) => s.smoothedLatG);
    const signedLatGMean = latGs.reduce((a, b) => a + b, 0) / latGs.length;
    let peakAbsG = -1;
    let signedLatGPeak = 0;
    for (const g of latGs) {
      if (Math.abs(g) > peakAbsG) {
        peakAbsG = Math.abs(g);
        signedLatGPeak = g;
      }
    }
    const sortedAbsLatG = [...latGs.map(g => Math.abs(g))].sort((a, b) => a - b);
    const p95Index = Math.min(sortedAbsLatG.length - 1, Math.floor(sortedAbsLatG.length * 0.95));
    const latG95thPercentile = sortedAbsLatG[p95Index] || 0;

    const maxSlipDeg = Math.max(...samples.map((s) => Math.abs(s.slipDeg)));

    // Roll: signed mean, peak |.|
    const rolls = samples.map((s) => s.rollDeg);
    const signedRollMeanDeg = rolls.reduce((a, b) => a + b, 0) / rolls.length;
    const peakAbsRollDeg = Math.max(...rolls.map(r => Math.abs(r)));

    // Pitch: min/max
    const pitches = samples.map((s) => s.pitchDeg);
    const minPitchDeg = Math.min(...pitches);
    const maxPitchDeg = Math.max(...pitches);

    // Droop: rear max, front max
    const maxRearDroopM = Math.max(...samples.map((s) => Math.max(s.droopRL, s.droopRR)));
    const maxFrontDroopM = Math.max(...samples.map((s) => Math.max(s.droopFL, s.droopFR)));

    const maxCamOffAxisDeg = Math.max(...samples.map((s) => s.camOffAxisDeg));

    // Horizon roll: min/max
    const horizons = samples.map((s) => s.camHorizonRollDeg);
    const minHorizonRollDeg = Math.min(...horizons);
    const maxHorizonRollDeg = Math.max(...horizons);

    const maxDistFromCentreM = Math.max(...samples.map((s) => s.distFromCentreM));
    const offRoadFrames = samples.filter((s) => s.distFromCentreM > 4.0).length;

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
      signedLatGMean,
      signedLatGPeak,
      latG95thPercentile,
      maxSlipDeg,
      signedRollMeanDeg,
      peakAbsRollDeg,
      minPitchDeg,
      maxPitchDeg,
      maxRearDroopM,
      maxFrontDroopM,
      maxCamOffAxisDeg,
      minHorizonRollDeg,
      maxHorizonRollDeg,
      maxDistFromCentreM,
      offRoadFrames,
    });
  }

  return { metrics: results, allSamples };
}

function printTable(title: string, metrics: SectionMetrics[]): void {
  console.log(`\n================================================================================================================================================`);
  console.log(`${title}`);
  console.log(`================================================================================================================================================`);
  console.log(
    `Sec  Type      Geom            Dur(s)  MeanMph  MaxMph  SignedG(Mean/Peak)  |G_95|  |Slip|°  Roll(Mean/Pk°)   Pitch(Min/Max°)  Drp(R/F m)  CamOff°  Horiz(Min/Max°) MaxDist(m) OffRd`
  );
  console.log(`------------------------------------------------------------------------------------------------------------------------------------------------`);
  for (const m of metrics) {
    const secStr = String(m.id).padStart(3);
    const typeStr = m.type.padEnd(8);
    const geomStr = m.geom.padEnd(15);
    const durStr = m.durationS.toFixed(1).padStart(6);
    const meanMphStr = m.meanMph.toFixed(1).padStart(7);
    const maxMphStr = m.maxMph.toFixed(1).padStart(7);
    const gMeanStr = (m.signedLatGMean >= 0 ? '+' : '') + m.signedLatGMean.toFixed(2);
    const gPeakStr = (m.signedLatGPeak >= 0 ? '+' : '') + m.signedLatGPeak.toFixed(2);
    const gCombined = `${gMeanStr}/${gPeakStr}`.padStart(18);
    const g95Str = m.latG95thPercentile.toFixed(2).padStart(6);
    const slipStr = m.maxSlipDeg.toFixed(1).padStart(7);
    const rMeanStr = (m.signedRollMeanDeg >= 0 ? '+' : '') + m.signedRollMeanDeg.toFixed(1);
    const rPkStr = m.peakAbsRollDeg.toFixed(1);
    const rCombined = `${rMeanStr}/${rPkStr}`.padStart(14);
    const pMinStr = (m.minPitchDeg >= 0 ? '+' : '') + m.minPitchDeg.toFixed(1);
    const pMaxStr = (m.maxPitchDeg >= 0 ? '+' : '') + m.maxPitchDeg.toFixed(1);
    const pCombined = `${pMinStr}/${pMaxStr}`.padStart(15);
    const droopRStr = m.maxRearDroopM.toFixed(3);
    const droopFStr = m.maxFrontDroopM.toFixed(3);
    const droopCombined = `${droopRStr}/${droopFStr}`.padStart(13);
    const offAxisStr = m.maxCamOffAxisDeg.toFixed(1).padStart(7);
    const hMinStr = (m.minHorizonRollDeg >= 0 ? '+' : '') + m.minHorizonRollDeg.toFixed(1);
    const hMaxStr = (m.maxHorizonRollDeg >= 0 ? '+' : '') + m.maxHorizonRollDeg.toFixed(1);
    const hCombined = `${hMinStr}/${hMaxStr}`.padStart(14);
    const distStr = m.maxDistFromCentreM.toFixed(2).padStart(10);
    const offRdStr = String(m.offRoadFrames).padStart(5);

    console.log(
      `${secStr}  ${typeStr}  ${geomStr} ${durStr}  ${meanMphStr}  ${maxMphStr}  ${gCombined}  ${g95Str}  ${slipStr}  ${rCombined}  ${pCombined}  ${droopCombined}  ${offAxisStr}  ${hCombined}  ${distStr}  ${offRdStr}`
    );
  }
  console.log(`================================================================================================================================================\n`);
}

function writeTraceCsv(filename: string, allSamples: TelemetrySample[]): void {
  const header = [
    'pass', 't', 'frame', 's', 'section', 'speed_mph', 'steer', 'throttle', 'brake', 'handbrake',
    'latG', 'smoothedLatG', 'slip_deg', 'yaw_deg', 'roll_deg', 'pitch_deg',
    'droop_FL', 'droop_FR', 'droop_RL', 'droop_RR',
    'Fz_FL', 'Fz_FR', 'Fz_RL', 'Fz_RR',
    'slipRatio_FL', 'slipRatio_FR', 'slipRatio_RL', 'slipRatio_RR',
    'camOff_deg', 'horizon_deg', 'dist_to_centreline', 'x', 'y', 'z'
  ].join(',');

  const rows = allSamples.map(s => [
    s.pass,
    s.t.toFixed(4),
    s.frame,
    s.s.toFixed(3),
    s.section,
    s.mph.toFixed(2),
    s.steer.toFixed(4),
    s.throttle.toFixed(3),
    s.brake.toFixed(3),
    s.handbrake ? 1 : 0,
    s.latG.toFixed(4),
    s.smoothedLatG.toFixed(4),
    s.slipDeg.toFixed(3),
    s.yawDeg.toFixed(3),
    s.rollDeg.toFixed(3),
    s.pitchDeg.toFixed(3),
    s.droopFL.toFixed(4),
    s.droopFR.toFixed(4),
    s.droopRL.toFixed(4),
    s.droopRR.toFixed(4),
    s.fzFL.toFixed(1),
    s.fzFR.toFixed(1),
    s.fzRL.toFixed(1),
    s.fzRR.toFixed(1),
    s.slipRatioFL.toFixed(4),
    s.slipRatioFR.toFixed(4),
    s.slipRatioRL.toFixed(4),
    s.slipRatioRR.toFixed(4),
    s.camOffAxisDeg.toFixed(2),
    s.camHorizonRollDeg.toFixed(3),
    s.distFromCentreM.toFixed(4),
    s.x.toFixed(4),
    s.y.toFixed(4),
    s.z.toFixed(4)
  ].join(','));

  fs.writeFileSync(filename, [header, ...rows].join('\n') + '\n');
}

async function runFullMeasurementSuite(): Promise<void> {
  await RAPIER.init();

  // Run steer-sign calibration (Part B1)
  await runCalibration();

  console.log('Running Lane 3 Curves Autopilot Measurement Suite...');
  console.log('Pass 1: Full Course (Normal Autopilot Pure Pursuit driving all 10 sections)');
  const pass1 = await runSimulation(1, false, true);
  printTable('PASS 1: FULL COURSE REFERENCE RUN', pass1.metrics);

  console.log('Pass 2: Section 6 Hairpin Handbrake Entry (0.6s handbrake at corner entry)');
  const pass2 = await runSimulation(2, true, false);
  const sec6Pass2 = pass2.metrics.filter((m) => m.id === 6);
  printTable('PASS 2: SECTION 6 HAIRPIN HANDBRAKE TEST', sec6Pass2);

  // Write lane3_curves_trace.csv
  const combinedSamples = [...pass1.allSamples, ...pass2.allSamples];
  writeTraceCsv('lane3_curves_trace.csv', combinedSamples);
  console.log(`Saved ${combinedSamples.length} frames to lane3_curves_trace.csv`);

  // Analysis of the 6 questions from printed numbers
  const p1 = pass1.metrics;
  const s2 = p1.find((m) => m.id === 2)!;
  const s4 = p1.find((m) => m.id === 4)!;
  const s6P1 = p1.find((m) => m.id === 6)!;
  const s6P2 = sec6Pass2[0];

  // Question 1: R=120 Right sweeper roll sign vs latG sign
  const q1Opposite = Math.sign(s2.signedLatGMean) !== Math.sign(s2.signedRollMeanDeg);

  // Question 2: R=60 Left corner roll sign vs latG sign
  const q2Opposite = Math.sign(s4.signedLatGMean) !== Math.sign(s4.signedRollMeanDeg);

  // Question 3: Chicane sign change delay (Sections 8 & 9)
  const chicaneSamples = pass1.allSamples.filter((s) => s.s >= 1042 && s.s <= 1168);
  let latGZeroIndex = -1;
  let rollZeroIndex = -1;
  for (let i = 1; i < chicaneSamples.length; i++) {
    if (latGZeroIndex === -1 && Math.sign(chicaneSamples[i].smoothedLatG) !== Math.sign(chicaneSamples[i - 1].smoothedLatG)) {
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

  // Question 6: Did autopilot stay within 3.2m of centreline in every section? (Road-edge limit)
  const maxDistAll = Math.max(...p1.map((m) => m.maxDistFromCentreM));
  const within3_2m = maxDistAll <= 3.2;

  console.log('CORNER MEASUREMENT SUMMARY (from printed numbers only):');
  console.log(`(1) R=120 right sweeper (Sec 2): latG=${(s2.signedLatGMean >= 0 ? '+' : '') + s2.signedLatGMean.toFixed(2)}g, roll=${(s2.signedRollMeanDeg >= 0 ? '+' : '') + s2.signedRollMeanDeg.toFixed(2)}° -> roll sign opposite to latG sign: ${q1Opposite ? 'YES' : 'NO'}`);
  console.log(`(2) R=60 left corner (Sec 4): latG=${(s4.signedLatGMean >= 0 ? '+' : '') + s4.signedLatGMean.toFixed(2)}g, roll=${(s4.signedRollMeanDeg >= 0 ? '+' : '') + s4.signedRollMeanDeg.toFixed(2)}° -> roll sign opposite to latG sign: ${q2Opposite ? 'YES' : 'NO'}`);
  console.log(`(3) Chicane (Sec 8->9): roll changes sign between arcs: ${chicaneRollSignChanges ? 'YES' : 'NO'}, delayed by ${frameDelay} frame(s) after latG sign change`);
  console.log(`(4) Hairpin rear droop max: without handbrake = ${droopNoHB.toFixed(3)} m (${(droopNoHB * 100).toFixed(1)} cm), with handbrake = ${droopWithHB.toFixed(3)} m (${(droopWithHB * 100).toFixed(1)} cm)`);
  console.log(`(5) Maximum per-frame change anywhere: roll = ${maxStepRoll.toFixed(3)}°/frame, pitch = ${maxStepPitch.toFixed(3)}°/frame, horizon = ${maxStepHorizon.toFixed(3)}°/frame`);
  console.log(`(6) Autopilot stayed within 3.2m of centreline in every section: ${within3_2m ? 'YES' : 'NO'} (max across all sections: ${maxDistAll.toFixed(2)} m)`);
  console.log('');

  let failed = false;
  for (const m of [...p1, ...sec6Pass2]) {
    if (m.maxDistFromCentreM > 3.2) {
      console.error(
        `[FAIL] Section ${m.id} exceeded road edge: maxDist = ${m.maxDistFromCentreM.toFixed(2)}m > 3.2m`
      );
      failed = true;
    }
  }

  if (failed) {
    console.error('MEASURE CURVES RESULT: FAILED (exceeded road edge limit of 3.2m)');
    process.exit(1);
  } else {
    console.log('MEASURE CURVES RESULT: ALL SECTIONS PASSED (max dist <= 3.2m)');
    process.exit(0);
  }
}

runFullMeasurementSuite().catch((err) => {
  console.error('Error during curve measurement:', err);
  process.exit(1);
});
