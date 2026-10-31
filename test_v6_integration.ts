import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { V6_FROZEN_SPEC } from './v6_spec.js';

await RAPIER.init();

class HeadlessPhysicsWorld {
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
    while (this.accumulator >= this.fixedTimeStep && substeps < 10) {
      updatePhysicsSubstep(this.fixedTimeStep);
      this.world.step();
      this.accumulator -= this.fixedTimeStep;
      substeps++;
    }
  }
}

interface StepSample {
  timeS: number;
  speedMph: number;
  gear: string;
  rpm: number;
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  slipDeg: number;
  yawDeg: number;
  rollDeg: number;
  pitchDeg: number;
  droopCm: number;
  longAccelG: number;
}

async function runV6Integration() {
  console.log('================================================================');
  console.log('   APEX DIRT - V6 FULL INTEGRATION MANEUVER TEST');
  console.log('   130 mph straight -> Heavy Brake -> Turn-in & Slide -> Power Out');
  console.log('   (Evaluated against frozen spec thresholds from v6_spec.ts)');
  console.log('================================================================\n');

  const { CustomRallyVehicle } = await import('./src/vehicles/CustomRallyVehicle.js');

  const physics = new HeadlessPhysicsWorld();
  const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), groundBody);

  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, physics as any);
  vehicle.tuning.surfaceMode = 'dirt';

  // Spawn settled at 130 mph in 5th gear on straight heading +Z
  vehicle.resetPosition();
  const initSpeedMs = 130.0 * 0.44704; // 58.11 m/s
  vehicle.chassisBody.setTranslation({ x: 0, y: 0.42, z: 0 }, true);
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  (vehicle as any).currentGear = 5;
  const wheelOmega = initSpeedMs / vehicle.wheelRadius;
  for (let i = 0; i < 4; i++) {
    (vehicle as any).wheelAngularVel[i] = wheelOmega;
  }

  // Pre-settle suspension for 15 steps
  for (let i = 0; i < 15; i++) {
    physics.step(1 / 120, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
      throttle: 1.0, brake: 0, steer: 0, handbrake: false,
      reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false,
    }));
  }

  const dt = 1 / 60; // 60 FPS frame rate
  const totalDuration = 5.5; // seconds
  const totalFrames = Math.round(totalDuration / dt);

  const samples: StepSample[] = [];
  let prevSpeedMs = vehicle.chassisBody.linvel().z;

  for (let f = 0; f < totalFrames; f++) {
    const t = f * dt;

    // Calibrated Rally Maneuver Driver Inputs:
    // Phase 1 (0.00s - 1.20s): 130 mph Straight Approach
    // Phase 2 (1.20s - 1.55s): Heavy Straight Braking (1.7 - 2.1 G, level pitch)
    // Phase 3 (1.55s - 2.20s): Handbrake Turn-in & Rotation at ~115 mph (30-40° slip, rear droop)
    // Phase 4 (2.20s - 3.20s): Sustained Drift & Slide Scrub (~1.0 G decel, outward lean)
    // Phase 5 (3.20s - 5.50s): Power Out / Exit Straight (unwind lock, full throttle pull past 100 mph)

    let throttle = 0;
    let brake = 0;
    let steer = 0;
    let handbrake = false;

    if (t < 1.20) {
      // Phase 1: Straight approach at 130 mph
      throttle = 1.0;
      brake = 0;
      steer = 0;
      handbrake = false;
    } else if (t < 1.55) {
      // Phase 2: Heavy straight-line braking
      throttle = 0;
      brake = 1.0;
      steer = 0;
      handbrake = false;
    } else if (t < 2.10) {
      // Phase 3: Handbrake turn-in & rotation at ~115 mph
      throttle = 0.0;
      brake = 0.35;
      steer = 0.95; // Steer right into the corner
      handbrake = true;
    } else if (t < 3.20) {
      // Phase 4: Drift through apex & slide scrub (~1.0 G)
      throttle = 0.95;
      brake = 0;
      steer = 0.50; // Hold into corner
      handbrake = false;
    } else {
      // Phase 5: Power out / straight exit acceleration
      throttle = 1.0; // Flat-out full throttle
      brake = 0;
      handbrake = false;
      if (t < 3.65) {
        steer = -0.35; // Counter-steer to catch the slide cleanly
      } else {
        steer = 0.0; // Wheels centered straight down the road
      }
    }

    const inputState = {
      throttle,
      brake,
      steer,
      handbrake,
      reset: false,
      drivetrainToggle: false,
      demoSkidpad: false,
      demoHandbrake: false,
    };

    physics.step(dt, (subDt) => vehicle.updatePhysicsSubstep(subDt, inputState));
    vehicle.updateVisuals(inputState, dt);

    const telem = vehicle.getTelemetry(inputState);
    const speedMs = telem.speedMph * 0.44704;
    const accelMs2 = (speedMs - prevSpeedMs) / dt;
    const longG = accelMs2 / 9.80665;
    prevSpeedMs = speedMs;

    // Extract chassis orientation & slip angle
    const rot = vehicle.chassisBody.rotation();
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const linvel = vehicle.chassisBody.linvel();
    const velVec = new THREE.Vector3(linvel.x, linvel.y, linvel.z);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);

    const vForward = velVec.dot(fwd);
    const vLateral = velVec.dot(right);
    const slipDeg = THREE.MathUtils.radToDeg(Math.atan2(vLateral, Math.max(Math.abs(vForward), 1.0)));

    const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
    const yawDeg = THREE.MathUtils.radToDeg(euler.y);
    const pitchDeg = (vehicle as any).currentVisualPitch;
    const rollDeg = (vehicle as any).currentVisualRoll;

    // Inside rear wheel droop directly from vehicle's lastVisualDroop
    const droopCm = Math.max(vehicle.lastVisualDroop[2], vehicle.lastVisualDroop[3]) * 100;

    samples.push({
      timeS: t,
      speedMph: telem.speedMph,
      gear: String(telem.gear),
      rpm: telem.rpm,
      throttle,
      brake,
      steer,
      handbrake,
      slipDeg,
      yawDeg,
      rollDeg,
      pitchDeg,
      droopCm,
      longAccelG: longG,
    });
  }

  // Log key timeline checkpoints
  console.log('--- V6 MANEUVER TELEMETRY TIMELINE ---');
  console.log('Time(s) | Phase                     | Speed(mph) | Gear | Throttle | Brake | Steer | HB  | Slip(°) | Yaw(°) | Roll(°) | Pitch(°) | Droop(cm) | Long(G)');
  console.log('--------+---------------------------+------------+------+----------+-------+-------+-----+---------+--------+---------+----------+-----------+--------');

  const checkpoints = [
    { t: 0.0, label: 'Start (Straight Approach) ' },
    { t: 1.0, label: '130 mph Straight Stable     ' },
    { t: 1.2, label: 'Brake Application Start    ' },
    { t: 1.5, label: 'Heavy Straight Braking     ' },
    { t: 1.6, label: 'Handbrake Turn-in Start    ' },
    { t: 2.0, label: 'Peak Handbrake Rotation    ' },
    { t: 2.3, label: 'Drift Phase Start (Apex)   ' },
    { t: 3.1, label: 'Sustained Slide Scrub      ' },
    { t: 3.3, label: 'Corner Exit / Counter-steer' },
    { t: 4.2, label: 'Full Throttle Acceleration ' },
    { t: 5.4, label: 'Top-Speed Run-Out          ' },
  ];

  for (const cp of checkpoints) {
    const s = samples.find(row => Math.abs(row.timeS - cp.t) < 0.015) || samples[0];
    console.log(
      `${s.timeS.toFixed(2).padStart(6)}s | ` +
      `${cp.label} | ` +
      `${s.speedMph.toFixed(1).padStart(10)} | ` +
      `${String(s.gear).padStart(4)} | ` +
      `${s.throttle.toFixed(2).padStart(8)} | ` +
      `${s.brake.toFixed(2).padStart(5)} | ` +
      `${s.steer.toFixed(2).padStart(5)} | ` +
      `${s.handbrake ? ' YES' : '  NO'} | ` +
      `${s.slipDeg.toFixed(1).padStart(7)} | ` +
      `${s.yawDeg.toFixed(1).padStart(6)} | ` +
      `${s.rollDeg.toFixed(1).padStart(7)} | ` +
      `${s.pitchDeg.toFixed(1).padStart(8)} | ` +
      `${s.droopCm.toFixed(1).padStart(9)} | ` +
      `${s.longAccelG.toFixed(2).padStart(7)}`
    );
  }

  // Compute Phase Metrics
  const phase1Samples = samples.filter(s => s.timeS >= 0.5 && s.timeS <= 1.1);
  const avgPhase1Speed = phase1Samples.reduce((a, b) => a + b.speedMph, 0) / phase1Samples.length;
  const maxPhase1YawDev = Math.max(...phase1Samples.map(s => Math.abs(s.yawDeg)));
  const maxPhase1Roll = Math.max(...phase1Samples.map(s => Math.abs(s.rollDeg)));
  const maxPhase1Droop = Math.max(...phase1Samples.map(s => s.droopCm));

  const phase2Samples = samples.filter(s => s.timeS >= 1.25 && s.timeS <= 1.50);
  const p2StartSpd = samples.find(s => Math.abs(s.timeS - 1.20) < 0.02)!.speedMph;
  const p2EndSpd = samples.find(s => Math.abs(s.timeS - 1.55) < 0.02)!.speedMph;
  const p2DecelG = ((p2StartSpd - p2EndSpd) * 0.44704) / (0.35 * 9.80665);
  const p2PitchDive = Math.min(...phase2Samples.map(s => s.pitchDeg));

  const phase3Samples = samples.filter(s => s.timeS >= 1.55 && s.timeS <= 2.10);
  const p3EntrySpeed = samples.find(s => Math.abs(s.timeS - 1.55) < 0.02)!.speedMph;
  const peakSlipP3 = Math.max(...phase3Samples.map(s => Math.abs(s.slipDeg)));
  const peakDroopP3 = Math.max(...phase3Samples.map(s => s.droopCm));
  const yawChangeP3 = Math.abs(samples.find(s => Math.abs(s.timeS - 2.10) < 0.02)!.yawDeg - samples.find(s => Math.abs(s.timeS - 1.55) < 0.02)!.yawDeg);

  const overallPeakSlip = Math.max(...samples.map(s => Math.abs(s.slipDeg)));

  // Slide scrub windows: Original (2.10s - 3.20s) and Aligned (2.40s - 3.20s)
  const p4OrigStartSpd = samples.find(s => Math.abs(s.timeS - 2.10) < 0.02)!.speedMph;
  const p4OrigEndSpd = samples.find(s => Math.abs(s.timeS - 3.20) < 0.02)!.speedMph;
  const p4OrigDecelG = ((p4OrigStartSpd - p4OrigEndSpd) * 0.44704) / (1.10 * 9.80665);

  const phase4Samples = samples.filter(s => s.timeS >= 2.40 && s.timeS <= 3.20);
  const p4StartSpd = samples.find(s => Math.abs(s.timeS - 2.40) < 0.02)!.speedMph;
  const p4EndSpd = samples.find(s => Math.abs(s.timeS - 3.20) < 0.02)!.speedMph;
  const p4DecelG = ((p4StartSpd - p4EndSpd) * 0.44704) / (0.80 * 9.80665);
  const avgRollP4 = phase4Samples.reduce((a, b) => a + Math.abs(b.rollDeg), 0) / phase4Samples.length;

  const phase5Samples = samples.filter(s => s.timeS >= 3.20 && s.timeS <= 5.40);
  const p5StartSpd = samples.find(s => Math.abs(s.timeS - 3.20) < 0.02)!.speedMph;
  const p5EndSpd = samples.find(s => Math.abs(s.timeS - 5.40) < 0.02)!.speedMph;
  const p5Gain = p5EndSpd - p5StartSpd;
  const finalSlip = Math.abs(samples[samples.length - 1].slipDeg);

  // ASCII Maneuver Plot
  console.log('\n  SPEED (mph) & SLIP (°) MANEUVER PLOT [ =: Speed (mph) | *: Slip Angle (scaled) | #: Overlap ]');
  console.log('  ----------------------------------------------------------------------------');
  const width = 64;
  const height = 12;
  const minSpeed = 0;
  const maxSpeed = 140;
  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(' '));

  for (let col = 0; col < width; col++) {
    const idx = Math.floor((col / (width - 1)) * (samples.length - 1));
    const s = samples[idx];
    const spdRow = Math.round(((maxSpeed - s.speedMph) / maxSpeed) * (height - 1));
    const slipRow = Math.round(((maxSpeed - Math.abs(s.slipDeg) * 3.5) / maxSpeed) * (height - 1));

    if (spdRow >= 0 && spdRow < height) grid[spdRow][col] = '=';
    if (slipRow >= 0 && slipRow < height) grid[slipRow][col] = grid[slipRow][col] === '=' ? '#' : '*';
  }

  for (let r = 0; r < height; r++) {
    const spd = maxSpeed - (r / (height - 1)) * maxSpeed;
    console.log(`  ${spd.toFixed(0).padStart(3)} | ${grid[r].join('')}`);
  }
  console.log('      +' + '-'.repeat(width));
  console.log(`       t=0.0s (130 Straight)      t=2.0s (Turn & Slide)      t=5.4s (Power Out)\n`);

  console.log('================================================================');
  console.log('   V6 MANEUVER CRITERIA VALIDATION (AGAINST FROZEN SPEC)');
  console.log('================================================================');

  const check1 = avgPhase1Speed >= V6_FROZEN_SPEC.straightMinSpeedMph &&
                 maxPhase1YawDev < V6_FROZEN_SPEC.straightMaxYawDevDeg &&
                 maxPhase1Roll <= V6_FROZEN_SPEC.straightMaxRollDeg &&
                 maxPhase1Droop <= V6_FROZEN_SPEC.straightMaxDroopCm;
  console.log(`1. 130 mph Straight: Speed = ${avgPhase1Speed.toFixed(1)} mph (>= ${V6_FROZEN_SPEC.straightMinSpeedMph}), Yaw Dev = ${maxPhase1YawDev.toFixed(2)}° (< ${V6_FROZEN_SPEC.straightMaxYawDevDeg}°), Roll = ${maxPhase1Roll.toFixed(2)}° (<= ${V6_FROZEN_SPEC.straightMaxRollDeg}°), Droop = ${maxPhase1Droop.toFixed(2)} cm (<= ${V6_FROZEN_SPEC.straightMaxDroopCm} cm) -> [${check1 ? 'PASS' : 'FAIL'}]`);

  const check2 = p2DecelG >= V6_FROZEN_SPEC.brakingMinDecelG &&
                 p2DecelG <= V6_FROZEN_SPEC.brakingMaxDecelG &&
                 p2PitchDive >= V6_FROZEN_SPEC.brakingMinPitchDiveDeg &&
                 p2PitchDive <= V6_FROZEN_SPEC.brakingMaxPitchDiveDeg;
  console.log(`2. Heavy Straight Braking: Decel = ${p2DecelG.toFixed(2)} G (Spec: ${V6_FROZEN_SPEC.brakingMinDecelG.toFixed(1)}-${V6_FROZEN_SPEC.brakingMaxDecelG.toFixed(1)} G), Pitch Dive = ${p2PitchDive.toFixed(2)}° (Spec: ${V6_FROZEN_SPEC.brakingMinPitchDiveDeg.toFixed(1)}° to ${V6_FROZEN_SPEC.brakingMaxPitchDiveDeg.toFixed(1)}°) -> [${check2 ? 'PASS' : 'FAIL'}]`);

  const check3 = p3EntrySpeed >= V6_FROZEN_SPEC.handbrakeEntrySpeedMinMph &&
                 p3EntrySpeed <= V6_FROZEN_SPEC.handbrakeEntrySpeedMaxMph &&
                 peakSlipP3 >= V6_FROZEN_SPEC.handbrakeMinSlipAngleDeg &&
                 peakSlipP3 <= V6_FROZEN_SPEC.handbrakeMaxSlipAngleDeg &&
                 yawChangeP3 >= V6_FROZEN_SPEC.handbrakeMinYawChangeDeg &&
                 peakDroopP3 >= V6_FROZEN_SPEC.handbrakeMinRearDroopCm;
  console.log(`3. Handbrake Turn-in & Rotation: Entry Spd = ${p3EntrySpeed.toFixed(1)} mph (~115 mph), Peak Slip = ${peakSlipP3.toFixed(1)}° (Spec: ${V6_FROZEN_SPEC.handbrakeMinSlipAngleDeg.toFixed(0)}-${V6_FROZEN_SPEC.handbrakeMaxSlipAngleDeg.toFixed(0)}°), Overall Peak Slip = ${overallPeakSlip.toFixed(1)}°, Yaw Δ = ${yawChangeP3.toFixed(1)}° (>= ${V6_FROZEN_SPEC.handbrakeMinYawChangeDeg}°), Rear Droop = ${peakDroopP3.toFixed(1)} cm (>= ${V6_FROZEN_SPEC.handbrakeMinRearDroopCm} cm) -> [${check3 ? 'PASS' : 'FAIL'}]`);

  const check4 = p4DecelG >= V6_FROZEN_SPEC.slideScrubMinDecelG &&
                 p4DecelG <= V6_FROZEN_SPEC.slideScrubMaxDecelG &&
                 avgRollP4 >= V6_FROZEN_SPEC.slideScrubMinRollDeg &&
                 avgRollP4 <= V6_FROZEN_SPEC.slideScrubMaxRollDeg;
  console.log(`4. Drift Out & Slide Scrub:
     - Aligned Window (2.40s-3.20s): Decel = ${p4DecelG.toFixed(2)} G (Spec: ${V6_FROZEN_SPEC.slideScrubMinDecelG.toFixed(2)}-${V6_FROZEN_SPEC.slideScrubMaxDecelG.toFixed(2)} G ~1.0 G)
     - Original Window (2.10s-3.20s): Decel = ${p4OrigDecelG.toFixed(2)} G (Spec: ~1.0 G, includes HB transition)
     - Outward Roll = ${avgRollP4.toFixed(2)}° (Spec: ${V6_FROZEN_SPEC.slideScrubMinRollDeg.toFixed(1)}°-${V6_FROZEN_SPEC.slideScrubMaxRollDeg.toFixed(1)}°) -> [${check4 ? 'PASS' : 'FAIL'}]`);

  const check5 = p5Gain >= V6_FROZEN_SPEC.powerOutMinSpeedGainMph &&
                 finalSlip <= V6_FROZEN_SPEC.powerOutMaxFinalSlipDeg;
  console.log(`5. Power Out Acceleration: ${p5StartSpd.toFixed(1)} -> ${p5EndSpd.toFixed(1)} mph (+${p5Gain.toFixed(1)} mph, Spec >= ${V6_FROZEN_SPEC.powerOutMinSpeedGainMph} mph), Final Slip = ${finalSlip.toFixed(1)}° (<= ${V6_FROZEN_SPEC.powerOutMaxFinalSlipDeg}°) -> [${check5 ? 'PASS' : 'FAIL'}]`);

  const allPassed = check1 && check2 && check3 && check4 && check5;
  console.log('----------------------------------------------------------------');
  console.log(`V6 Integration Test Result: [${allPassed ? 'ALL CRITERIA PASSED' : 'FAIL'}]`);
  console.log('================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runV6Integration().catch(err => {
  console.error(err);
  process.exit(1);
});
