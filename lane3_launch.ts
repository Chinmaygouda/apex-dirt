import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from './src/physics/PhysicsWorld';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';

interface Sample {
  t: number;
  speedMph: number;
  gear: number;
  longG: number;
  pitchDeg: number;
  fz: number[];
  droop: number[];
  frontUnload: number;
  rearUnload: number;
}

async function runLaunchTest(): Promise<void> {
  await RAPIER.init();
  const physics = new PhysicsWorld();
  await physics.init();

  // Open ground as used in lane3_frames.ts: cuboid(50000, 0.5, 50000) at y = -0.5
  const ground = physics.world.createRigidBody(physics.rapier.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), ground);

  const vehicle = new CustomRallyVehicle(new THREE.Scene(), physics as any);
  vehicle.tuning.surfaceMode = 'dirt';
  vehicle.resetPosition();

  const dt = 1 / 30;
  const totalDurationS = 8.0;
  const totalFrames = Math.round(totalDurationS / dt);

  const inputs = {
    throttle: 1.0,
    brake: 0.0,
    steer: 0.0,
    handbrake: false,
    reset: false,
    drivetrainToggle: false,
    demoSkidpad: false,
    demoHandbrake: false,
  };

  let steadyFz: number[] | null = null;
  const samples: Sample[] = [];
  let prevSpeedMps = 0;

  for (let frame = 0; frame <= totalFrames; frame++) {
    const t = frame * dt;

    if (frame > 0) {
      physics.step(dt, (substepDt) => {
        vehicle.updatePhysicsSubstep(substepDt, inputs);
      });
      vehicle.updateVisuals(inputs, dt);
    }

    const currentFz = [...((vehicle as any).wheelNormalForces as number[])];
    const currentDroop = [...vehicle.lastVisualDroop];
    const lv = vehicle.chassisBody.linvel();
    const speedMps = Math.hypot(lv.x, lv.z);
    const speedMph = speedMps / 0.44704;
    const longG = frame > 0 ? (speedMps - prevSpeedMps) / (dt * 9.81) : 0;
    prevSpeedMps = speedMps;

    // Capture steadyFz at t = 0.2 s
    if (Math.abs(t - 0.2) < 0.001 || (t >= 0.2 && steadyFz === null)) {
      steadyFz = [...currentFz];
    }

    // Record sample every 0.5 s
    const isReportFrame = Math.abs(t % 0.5) < 0.005 || Math.abs(t % 0.5 - 0.5) < 0.005 || frame === totalFrames;
    if (isReportFrame) {
      const fzFL = currentFz[0];
      const fzFR = currentFz[1];
      const fzRL = currentFz[2];
      const fzRR = currentFz[3];

      const frontMeanFz = (fzFL + fzFR) * 0.5;
      const rearMeanFz = (fzRL + fzRR) * 0.5;

      const steadyFront = steadyFz ? (steadyFz[0] + steadyFz[1]) * 0.5 : frontMeanFz;
      const steadyRear = steadyFz ? (steadyFz[2] + steadyFz[3]) * 0.5 : rearMeanFz;

      const frontUnload = steadyFz && steadyFront > 0 && frame > 0 ? 1 - frontMeanFz / steadyFront : 0;
      const rearUnload = steadyFz && steadyRear > 0 && frame > 0 ? 1 - rearMeanFz / steadyRear : 0;

      samples.push({
        t,
        speedMph,
        gear: (vehicle as any).currentGear,
        longG,
        pitchDeg: vehicle.getVisualPitchDeg(),
        fz: [fzFL, fzFR, fzRL, fzRR],
        droop: currentDroop,
        frontUnload,
        rearUnload,
      });
    }
  }

  console.log('========================================================================================================================');
  console.log('STANDING-START FULL-THROTTLE LAUNCH (8.0 s on Open Ground, Current Game Time Base)');
  console.log(`steadyFz (captured at t = 0.2s): FL=${steadyFz![0].toFixed(0)} N, FR=${steadyFz![1].toFixed(0)} N, RL=${steadyFz![2].toFixed(0)} N, RR=${steadyFz![3].toFixed(0)} N`);
  console.log('========================================================================================================================');
  console.log(
    ' t(s)  Speed(mph) Gear   LongG  Pitch(°)     Fz FL/FR/RL/RR (N)            Droop FL/FR/RL/RR (m)      FrontUnload  RearUnload'
  );
  console.log('------------------------------------------------------------------------------------------------------------------------');

  for (const s of samples) {
    const tStr = s.t.toFixed(1).padStart(5);
    const spdStr = s.speedMph.toFixed(1).padStart(10);
    const gearStr = String(s.gear).padStart(4);
    const longGStr = (s.longG >= 0 ? '+' : '') + s.longG.toFixed(2).padStart(6);
    const pitchStr = (s.pitchDeg >= 0 ? '+' : '') + s.pitchDeg.toFixed(2).padStart(7);
    const fzStr = s.fz.map(f => String(Math.round(f)).padStart(5)).join(' ');
    const droopStr = s.droop.map(d => d.toFixed(3)).join(' ');
    const frontUnloadStr = (s.frontUnload >= 0 ? '+' : '') + (s.frontUnload * 100).toFixed(1).padStart(6) + '%';
    const rearUnloadStr = (s.rearUnload >= 0 ? '+' : '') + (s.rearUnload * 100).toFixed(1).padStart(6) + '%';

    console.log(
      `${tStr}  ${spdStr} ${gearStr}  ${longGStr}  ${pitchStr}   ${fzStr}   ${droopStr}      ${frontUnloadStr}     ${rearUnloadStr}`
    );
  }
  console.log('========================================================================================================================\n');
}

runLaunchTest().catch(err => {
  console.error('[Launch Test Error]', err);
  process.exit(1);
});
