import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';
import { ChaseCamera } from './src/core/ChaseCamera';

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

interface UserInputRow {
  frame: number;
  timeS: number;
  steer: number;
  throttle: number;
  brake: number;
  refGear: string;
  refSpeedMph: number;
}

function parseUserInputs(filePath: string): UserInputRow[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const rows: UserInputRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((p) => p.trim());
    if (parts.length < 7) continue;

    rows.push({
      frame: parseInt(parts[0], 10),
      timeS: parseFloat(parts[1]),
      steer: parseFloat(parts[2]),
      throttle: parseFloat(parts[3]),
      brake: parseFloat(parts[4]),
      refGear: parts[5],
      refSpeedMph: parseFloat(parts[6]),
    });
  }
  return rows;
}

function wrapAngleDeg(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

export interface SessionRecordRow {
  frame: number;
  timeS: number;
  camYawDeg: number;
  deltaCamYawDeg: number;
  carYawDeg: number;
  yawRateDegS: number;
  slipAngleDeg: number;
  speedMph: number;
  gear: string | number;
  rpm: number;
  assistFactor: number;
  cameraMode: string;
}

export function runUserSessionTest(verbose = true) {
  const csvPath = path.resolve('user_session_inputs.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const inputRows = parseUserInputs(csvPath);
  const totalDuration = inputRows[inputRows.length - 1].timeS;

  const physics = new HeadlessPhysicsWorld();
  // Ground plane
  const groundDesc = RAPIER.ColliderDesc.cuboid(500, 0.5, 500)
    .setTranslation(0, -0.5, 0);
  physics.world.createCollider(groundDesc);

  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, physics as any);
  vehicle.tuning.surfaceMode = 'dirt';
  const chaseCam = new ChaseCamera(16 / 9);

  // Position vehicle initially
  vehicle.resetPosition();

  // Match initial speed ~ 1 mph in 1st gear
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 0.45 }, true);
  (vehicle as any).currentGear = 1;

  const dt = 1 / 120; // 120 Hz
  const totalSteps = Math.round(totalDuration / dt);

  let maxDeltaCamYaw = 0;
  let maxDeltaCamYawFrame = 0;
  let maxDeltaCamYawTime = 0;
  let prevCamYaw = 0;

  let fullThrottleLowSpeedDuration = 0;
  let maxFullThrottleLowSpeedDuration = 0;
  let maxLowSpeedTimeRange = '';

  const sessionLog: SessionRecordRow[] = [];

  for (let step = 0; step < totalSteps; step++) {
    const timeS = step * dt;

    // Interpolate input from 30 Hz CSV
    let inputIdx = inputRows.findIndex((r) => r.timeS >= timeS);
    if (inputIdx === -1) inputIdx = inputRows.length - 1;
    const rCurrent = inputRows[inputIdx];
    const rPrev = inputIdx > 0 ? inputRows[inputIdx - 1] : rCurrent;
    const tSpan = Math.max(1e-4, rCurrent.timeS - rPrev.timeS);
    const alpha = THREE.MathUtils.clamp((timeS - rPrev.timeS) / tSpan, 0, 1);

    const steer = THREE.MathUtils.lerp(rPrev.steer, rCurrent.steer, alpha);
    const throttle = THREE.MathUtils.lerp(rPrev.throttle, rCurrent.throttle, alpha);
    const brake = THREE.MathUtils.lerp(rPrev.brake, rCurrent.brake, alpha);

    const inputs = {
      throttle,
      brake,
      steer,
      handbrake: false,
      reset: false,
      drivetrainToggle: false,
      demoSkidpad: false,
      demoHandbrake: false,
    };

    // Step physics substep
    physics.step(dt, (subDt) => {
      vehicle.updatePhysicsSubstep(subDt, inputs);
    });

    // Sync mesh visuals and camera
    vehicle.updateVisuals(inputs);
    chaseCam.update(vehicle, dt);

    // Camera yaw in degrees (atan2 of camera forward vector)
    const camQuat = chaseCam.camera.quaternion;
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
    const camYawDeg = THREE.MathUtils.radToDeg(Math.atan2(camFwd.x, camFwd.z));

    let deltaCamYaw = 0;
    if (step > 0) {
      deltaCamYaw = Math.abs(wrapAngleDeg(camYawDeg - prevCamYaw));
      if (deltaCamYaw > maxDeltaCamYaw) {
        maxDeltaCamYaw = deltaCamYaw;
        maxDeltaCamYawFrame = step;
        maxDeltaCamYawTime = timeS;
      }
    }
    prevCamYaw = camYawDeg;

    // Car metrics
    const telemetry = vehicle.getTelemetry(inputs);
    const carRot = vehicle.chassisBody.rotation();
    const carQuat = new THREE.Quaternion(carRot.x, carRot.y, carRot.z, carRot.w);
    const carFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuat);
    const carYawDeg = THREE.MathUtils.radToDeg(Math.atan2(carFwd.x, carFwd.z));
    const yawRateDegS = THREE.MathUtils.radToDeg(vehicle.chassisBody.angvel().y);
    const slipAngleDeg = vehicle.driftAngleDeg;
    const speedMph = telemetry.speedMph;

    // Assist factor
    const driverSteerMag = Math.abs(inputs.steer);
    const assistFactor = (vehicle as any).isDrifting ? Math.max(0, 1.0 - driverSteerMag * 1.25) : 0;
    const cameraMode = (chaseCam as any).cameraMode || (vehicle.isDrifting ? 'chase_slide' : 'chase_follow');

    // Check full throttle below 20 mph duration
    if (throttle >= 0.90 && speedMph < 20.0) {
      fullThrottleLowSpeedDuration += dt;
      if (fullThrottleLowSpeedDuration > maxFullThrottleLowSpeedDuration) {
        maxFullThrottleLowSpeedDuration = fullThrottleLowSpeedDuration;
        maxLowSpeedTimeRange = `ended @ t=${timeS.toFixed(2)}s, speed=${speedMph.toFixed(1)} mph, gear=${telemetry.gear}`;
      }
    } else {
      fullThrottleLowSpeedDuration = 0;
    }

    sessionLog.push({
      frame: step,
      timeS,
      camYawDeg,
      deltaCamYawDeg: deltaCamYaw,
      carYawDeg,
      yawRateDegS,
      slipAngleDeg,
      speedMph,
      gear: telemetry.gear,
      rpm: telemetry.rpm,
      assistFactor,
      cameraMode,
    });
  }

  const camYawPassed = maxDeltaCamYaw <= 3.0;
  const throttleSpeedPassed = maxFullThrottleLowSpeedDuration <= 1.0;

  if (verbose) {
    console.log('================================================================');
    console.log('   APEX DIRT - 120 HZ USER SESSION REPLAY TEST');
    console.log('================================================================\n');
    console.log(`Duration: ${totalDuration.toFixed(2)}s | Total Steps (120 Hz): ${totalSteps}`);
    console.log(`Peak Camera Yaw Δ per frame: ${maxDeltaCamYaw.toFixed(2)}° (Time: ${maxDeltaCamYawTime.toFixed(2)}s, Frame ${maxDeltaCamYawFrame})`);
    console.log(`   Threshold: <= 3.0° | Status: [${camYawPassed ? 'PASS' : 'FAIL'}]`);
    console.log(`Max Duration at Full Throttle (< 20 mph): ${maxFullThrottleLowSpeedDuration.toFixed(2)}s (${maxLowSpeedTimeRange})`);
    console.log(`   Threshold: <= 1.0s | Status: [${throttleSpeedPassed ? 'PASS' : 'FAIL'}]`);

    // Print samples during 13.0s - 19.0s
    console.log('\n--- SAMPLES FROM 13.0s - 19.0s ---');
    console.log('Time(s) | Spd(mph) | RefSpd | Gear | RPM  | Slip(°) | CarYaw(°) | CamYaw(°) | ΔCamYaw');
    const sampleRows = sessionLog.filter(r => r.timeS >= 13.0 && r.timeS <= 19.0 && r.frame % 30 === 0);
    for (const r of sampleRows) {
      const inputR = inputRows.find(ir => Math.abs(ir.timeS - r.timeS) < 0.02);
      console.log(`${r.timeS.toFixed(2).padStart(7)} | ${r.speedMph.toFixed(1).padStart(8)} | ${(inputR?.refSpeedMph.toFixed(0) || '').padStart(6)} | ${String(r.gear).padStart(4)} | ${Math.round(r.rpm).toString().padStart(5)} | ${r.slipAngleDeg.toFixed(1).padStart(7)} | ${r.carYawDeg.toFixed(1).padStart(9)} | ${r.camYawDeg.toFixed(1).padStart(9)} | ${r.deltaCamYawDeg.toFixed(2).padStart(7)}`);
    }

    // Write 120 Hz session log to CSV
    const csvHeader = 'frame,time_s,camera_yaw_deg,car_yaw_deg,yaw_rate_deg_s,slip_angle_deg,speed_mph,gear,rpm,assist_factor,camera_mode\n';
    const csvLines = sessionLog.map(r =>
      `${r.frame},${r.timeS.toFixed(4)},${r.camYawDeg.toFixed(2)},${r.carYawDeg.toFixed(2)},${r.yawRateDegS.toFixed(2)},${r.slipAngleDeg.toFixed(2)},${r.speedMph.toFixed(2)},${r.gear},${Math.round(r.rpm)},${r.assistFactor.toFixed(3)},${r.cameraMode}`
    ).join('\n');
    fs.writeFileSync(path.resolve('user_session_120hz_log.csv'), csvHeader + csvLines);
    console.log(`\nExported 120 Hz session log (${sessionLog.length} frames) to user_session_120hz_log.csv`);

    console.log(`\nOverall Test Result: [${camYawPassed && throttleSpeedPassed ? 'PASS' : 'FAIL'}]\n`);
  }

  return {
    maxDeltaCamYaw,
    maxFullThrottleLowSpeedDuration,
    camYawPassed,
    throttleSpeedPassed,
    sessionLog,
  };
}

if (process.argv[1] && process.argv[1].endsWith('test_user_session.ts')) {
  const result = runUserSessionTest(true);
  if (!result.camYawPassed || !result.throttleSpeedPassed) {
    process.exit(1);
  }
}
