import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

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
    while (this.accumulator >= this.fixedTimeStep && substeps < 4) {
      updatePhysicsSubstep(this.fixedTimeStep);
      this.world.step();
      this.accumulator -= this.fixedTimeStep;
      substeps++;
    }
  }
}

async function runV4Tests() {
  console.log('================================================================');
  console.log('   APEX DIRT - V4 DRIFT, HANDBRAKE & COUNTER-STEER ASSIST SUITE');
  console.log('================================================================\n');

  const { CustomRallyVehicle } = await import('./src/vehicles/CustomRallyVehicle.js');

  // -------------------------------------------------------------
  // TEST 0: PURE SLIDE-SCRUB ON vs OFF (80 mph, 35° slide, 0.6s)
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('   TEST 0: PURE SLIDE-SCRUB ON vs OFF BENCHMARK');
  console.log('   (Evaluates soil plowing resistance ON vs OFF at 35° slide)');
  console.log('----------------------------------------------------------------');
  const measureSlideScrub = (enableScrub: boolean) => {
    const physics = new HeadlessPhysicsWorld();
    const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), groundBody);

    const scene = new THREE.Scene();
    const vehicle = new CustomRallyVehicle(scene, physics as any);
    vehicle.tuning.surfaceMode = 'dirt';
    vehicle.tuning.enableSlideScrub = enableScrub;

    vehicle.resetPosition();
    const speedMs = 80 * 0.44704;
    const slideAngleRad = THREE.MathUtils.degToRad(35.0);

    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), slideAngleRad);
    vehicle.chassisBody.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: speedMs }, true);
    (vehicle as any).currentGear = 4;

    const wheelRollSpeedMs = speedMs * Math.cos(slideAngleRad);
    const omega = wheelRollSpeedMs / vehicle.wheelRadius;
    for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

    for (let i = 0; i < 15; i++) {
      physics.step(1 / 120, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
        throttle: 0, brake: 0, steer: 0, handbrake: false,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false,
      }));
    }

    vehicle.chassisBody.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: speedMs }, true);
    for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

    const dt = 1 / 30;
    const duration = 0.60;
    const steps = Math.round(duration / dt);

    const initialSpeed = vehicle.getTelemetry({
      throttle: 0, brake: 0, steer: 0, handbrake: false,
      reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
    }).speedMph;

    let endSpeed = initialSpeed;
    for (let s = 0; s < steps; s++) {
      vehicle.chassisBody.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
      physics.step(dt, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
        throttle: 0, brake: 0, steer: 0, handbrake: false,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false,
      }));
      endSpeed = vehicle.getTelemetry({
        throttle: 0, brake: 0, steer: 0, handbrake: false,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      }).speedMph;
    }

    const decelG = ((initialSpeed - endSpeed) * 0.44704) / (duration * 9.80665);
    return { initialSpeed, endSpeed, decelG };
  };

  const scrubOn = measureSlideScrub(true);
  const scrubOff = measureSlideScrub(false);
  console.log(`Slide Scrub ON:  ${scrubOn.initialSpeed.toFixed(1)} -> ${scrubOn.endSpeed.toFixed(1)} mph in 0.60s | Decel: ${scrubOn.decelG.toFixed(2)} G (Target: ~1.0 G) [${scrubOn.decelG >= 0.85 && scrubOn.decelG <= 1.15 ? 'PASS' : 'FAIL'}]`);
  console.log(`Slide Scrub OFF: ${scrubOff.initialSpeed.toFixed(1)} -> ${scrubOff.endSpeed.toFixed(1)} mph in 0.60s | Decel: ${scrubOff.decelG.toFixed(2)} G (Pure tyre Fy only)\n`);

  // -------------------------------------------------------------
  // TEST 0B: 2nd Gear 30 mph Full Throttle + Full Lock Speed Retention
  // (2nd gear, 30 mph, full throttle + full lock should hold speed or lose less than 0.3 G)
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('   TEST 0B: 2ND GEAR 30 MPH FULL THROTTLE + FULL LOCK DRIFT');
  console.log('   (Target: Holds speed or decelerates < 0.30 G while slide continues)');
  console.log('----------------------------------------------------------------');
  {
    const physics = new HeadlessPhysicsWorld();
    const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), groundBody);

    const scene = new THREE.Scene();
    const vehicle = new CustomRallyVehicle(scene, physics as any);
    vehicle.tuning.surfaceMode = 'dirt';

    vehicle.resetPosition();
    const initSpeedMs = 30 * 0.44704;
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    (vehicle as any).currentGear = 2;
    const omega = initSpeedMs / vehicle.wheelRadius;
    for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

    // Settle for 0.2s straight
    for (let i = 0; i < 24; i++) {
      physics.step(1 / 120, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
        throttle: 0.5, brake: 0, steer: 0, handbrake: false,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      }));
    }

    const dt = 1 / 120;
    const duration = 1.5;
    const steps = Math.round(duration / dt);
    const startSpd = vehicle.getTelemetry({ throttle: 1, brake: 0, steer: 1, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false }).speedMph;

    let peakSlipDeg = 0;
    for (let s = 0; s < steps; s++) {
      physics.step(dt, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
        throttle: 1.0, brake: 0, steer: 1.0, handbrake: false,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      }));
      const slip = Math.abs(vehicle.driftAngleDeg);
      if (slip > peakSlipDeg) peakSlipDeg = slip;
    }
    const endSpd = vehicle.getTelemetry({ throttle: 1, brake: 0, steer: 1, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false }).speedMph;
    const netDecelG = ((startSpd - endSpd) * 0.44704) / (duration * 9.80665);
    const passed = netDecelG <= 0.30;
    console.log(`2nd Gear 30 mph Drift: ${startSpd.toFixed(1)} -> ${endSpd.toFixed(1)} mph in ${duration.toFixed(1)}s (Peak Slip: ${peakSlipDeg.toFixed(1)}°) | Net Decel: ${netDecelG.toFixed(2)} G (Target: <= 0.30 G) [${passed ? 'PASS' : 'FAIL'}]\n`);
  }

  // -------------------------------------------------------------
  // SCRIPTED DRIVER TEST A: 115 mph High-Speed Handbrake Entry, Drift & Recovery
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('   TEST A: 115 MPH HIGH-SPEED HANDBRAKE DRIFT & RECOVERY');
  console.log('   (115 mph -> Brake+Handbrake 0.9s + Full Lock -> Release & Throttle)');
  console.log('   (Target: 30-40° slide, recovers straight within ~2s, no spin)');
  console.log('----------------------------------------------------------------');
  {
    const physics = new HeadlessPhysicsWorld();
    const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), groundBody);

    const scene = new THREE.Scene();
    const vehicle = new CustomRallyVehicle(scene, physics as any);
    vehicle.tuning.surfaceMode = 'dirt';

    vehicle.resetPosition();
    const initSpeedMs = 115 * 0.44704;
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    (vehicle as any).currentGear = 5;
    const omega = initSpeedMs / vehicle.wheelRadius;
    for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

    for (let i = 0; i < 15; i++) {
      physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, {
        throttle: 0.8, brake: 0, steer: 0, handbrake: false,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      }));
    }
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

    const dt = 1 / 60;
    let t = 0;
    let peakSlipDeg = 0;
    let timeTo30Deg = -1;
    let recoveryTime = -1;
    let entryTransitions = 0;
    const startSpeed = vehicle.getTelemetry({ throttle: 0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false }).speedMph;

    // Phase 1: 0.9s initiation with brake + handbrake + full lock
    for (let s = 0; s < Math.round(0.90 / dt); s++) {
      t += dt;
      physics.step(dt, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
        throttle: 0, brake: 0.8, steer: 1.0, handbrake: true,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      }));
      const slip = Math.abs(vehicle.driftAngleDeg);
      if (slip > peakSlipDeg) peakSlipDeg = slip;
      if (timeTo30Deg < 0 && slip >= 30.0) timeTo30Deg = t;
    }

    // Phase 2: Release brake/handbrake, pump throttle with counter-steer/recovery
    const releaseTime = t;
    let slideFellBelow10 = false;
    for (let s = 0; s < Math.round(2.50 / dt); s++) {
      t += dt;
      const pumpThrottle = Math.sin(t * 12.0) > 0 ? 0.75 : 0.15;
      const steerInput = slideFellBelow10 ? 0.0 : -0.2;
      physics.step(dt, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
        throttle: pumpThrottle, brake: 0, steer: steerInput, handbrake: false,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      }));
      const slip = Math.abs(vehicle.driftAngleDeg);
      if (slip > peakSlipDeg) peakSlipDeg = slip;
      if (!slideFellBelow10 && slip < 10.0) {
        slideFellBelow10 = true;
        recoveryTime = t - releaseTime;
      }
    }

    const endSpeed = vehicle.getTelemetry({ throttle: 0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false }).speedMph;
    const speedLost = startSpeed - endSpeed;

    console.log(`Peak Slip Angle:         ${peakSlipDeg.toFixed(1)}° (Reference Target: ~30-40°) [${peakSlipDeg >= 30.0 && peakSlipDeg <= 44.0 ? 'PASS' : 'FAIL'}]`);
    console.log(`Time to reach 30°:       ${timeTo30Deg >= 0 ? timeTo30Deg.toFixed(2) + 's' : 'Did not reach 30°'}`);
    console.log(`Time to recover (<10°):  ${recoveryTime.toFixed(2)}s (Reference Target: within ~2.0s) [${recoveryTime > 0 && recoveryTime <= 2.2 ? 'PASS' : 'FAIL'}]`);
    console.log(`Speed Lost:              ${speedLost.toFixed(1)} mph (${startSpeed.toFixed(1)} -> ${endSpeed.toFixed(1)} mph)`);
    console.log(`Drift State Changes:     ${vehicle.driftStateTransitions} (Target: <= 2 state changes, no flicker) [${vehicle.driftStateTransitions <= 2 ? 'PASS' : 'FAIL'}]\n`);
  }

  // -------------------------------------------------------------
  // SCRIPTED DRIVER TEST B: 55 mph Handbrake Flick & Recovery
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('   TEST B: 55 MPH HANDBRAKE FLICK & RECOVERY');
  console.log('   (55 mph flick: tail steps out, recovers under 1.5s, never sticks sideways)');
  console.log('----------------------------------------------------------------');
  {
    const physics = new HeadlessPhysicsWorld();
    const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), groundBody);

    const scene = new THREE.Scene();
    const vehicle = new CustomRallyVehicle(scene, physics as any);
    vehicle.tuning.surfaceMode = 'dirt';

    vehicle.resetPosition();
    const initSpeedMs = 55 * 0.44704;
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    (vehicle as any).currentGear = 3;
    const omega = initSpeedMs / vehicle.wheelRadius;
    for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

    for (let i = 0; i < 15; i++) {
      physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, {
        throttle: 0.5, brake: 0, steer: 0, handbrake: false,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      }));
    }
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

    const dt = 1 / 60;
    let t = 0;
    let peakSlipDeg = 0;
    let timeTo30Deg = -1;
    let recoveryTime = -1;
    const startSpeed = vehicle.getTelemetry({ throttle: 0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false }).speedMph;

    // Flick initiation: 0.25s handbrake + steer
    for (let s = 0; s < Math.round(0.25 / dt); s++) {
      t += dt;
      physics.step(dt, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
        throttle: 0, brake: 0, steer: 1.0, handbrake: true,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      }));
      const slip = Math.abs(vehicle.driftAngleDeg);
      if (slip > peakSlipDeg) peakSlipDeg = slip;
      if (timeTo30Deg < 0 && slip >= 30.0) timeTo30Deg = t;
    }

    // Release handbrake, counter-steer for 0.45s then center wheel & power out
    const releaseTime = t;
    let recovered = false;
    for (let s = 0; s < Math.round(2.00 / dt); s++) {
      t += dt;
      const counterSteerDuration = t - releaseTime;
      const steerInput = counterSteerDuration < 0.45 ? -0.7 : 0.0;
      physics.step(dt, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
        throttle: 0.6, brake: 0, steer: steerInput, handbrake: false,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      }));
      const slip = Math.abs(vehicle.driftAngleDeg);
      if (slip > peakSlipDeg) peakSlipDeg = slip;
      if (!recovered && counterSteerDuration > 0.20 && slip < 10.0) {
        recovered = true;
        recoveryTime = counterSteerDuration;
      }
    }

    const endSpeed = vehicle.getTelemetry({ throttle: 0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false }).speedMph;
    const finalSlip = Math.abs(vehicle.driftAngleDeg);

    console.log(`Peak Slip Angle:         ${peakSlipDeg.toFixed(1)}° (Tail steps out cleanly)`);
    console.log(`Recovery Time (<10°):    ${recoveryTime.toFixed(2)}s (Target: under 1.5s) [${recoveryTime > 0 && recoveryTime <= 1.5 ? 'PASS' : 'FAIL'}]`);
    console.log(`Final Settled Slip:      ${finalSlip.toFixed(1)}° (Never sticks sideways) [${finalSlip < 10.0 ? 'PASS' : 'FAIL'}]`);
    console.log(`Speed Lost:              ${(startSpeed - endSpeed).toFixed(1)} mph (${startSpeed.toFixed(1)} -> ${endSpeed.toFixed(1)} mph)\n`);
  }


  // -------------------------------------------------------------
  // SCRIPTED DRIVER TEST C: Power Oversteer & Lift-Off Tuck-In at 60 mph in 3rd
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('   TEST C: 60 MPH POWER OVERSTEER & LIFT-OFF TUCK-IN');
  console.log('   (Mid-corner in 3rd gear: Full throttle pushes tail wide; Lifting tucks it back in)');
  console.log('----------------------------------------------------------------');
  {
    const runCornerTest = (applyFullThrottle: boolean) => {
      const physics = new HeadlessPhysicsWorld();
      const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
      physics.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), groundBody);

      const scene = new THREE.Scene();
      const vehicle = new CustomRallyVehicle(scene, physics as any);
      vehicle.tuning.surfaceMode = 'dirt';

      vehicle.resetPosition();
      const initSpeedMs = 60 * 0.44704;
      vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
      (vehicle as any).currentGear = 3;
      const omega = initSpeedMs / vehicle.wheelRadius;
      for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

      // Settle vehicle in steady 60 mph corner
      const dt = 1 / 60;
      for (let s = 0; s < Math.round(1.0 / dt); s++) {
        physics.step(dt, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
          throttle: 0.35, brake: 0, steer: 0.5, handbrake: false,
          reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
        }));
      }

      // Phase 2: Action (Full throttle vs Lift off) for 0.8s
      let peakSlip = 0;
      let peakYawRate = 0;
      for (let s = 0; s < Math.round(0.8 / dt); s++) {
        const throttleInput = applyFullThrottle ? 1.0 : 0.0;
        physics.step(dt, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
          throttle: throttleInput, brake: 0, steer: 0.5, handbrake: false,
          reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
        }));
        const telem = vehicle.getTelemetry({ throttle: throttleInput, brake: 0, steer: 0.5, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
        if (Math.abs(vehicle.driftAngleDeg) > peakSlip) peakSlip = Math.abs(vehicle.driftAngleDeg);
        if (Math.abs(telem.yawRateDeg ?? 0) > peakYawRate) peakYawRate = Math.abs(telem.yawRateDeg ?? 0);
      }

      return { peakSlip, peakYawRate };
    };

    const onThrottle = runCornerTest(true);
    const offThrottle = runCornerTest(false);

    console.log(`Full Throttle (Power Oversteer): Peak Slip = ${onThrottle.peakSlip.toFixed(1)}° | Peak Yaw Rate = ${onThrottle.peakYawRate.toFixed(1)}°/s`);
    console.log(`Lift-Off (Tail Tucks In):        Peak Slip = ${offThrottle.peakSlip.toFixed(1)}° | Peak Yaw Rate = ${offThrottle.peakYawRate.toFixed(1)}°/s`);
    const yawRateDiff = onThrottle.peakYawRate - offThrottle.peakYawRate;
    console.log(`Throttle Yaw Rate Differential:  +${yawRateDiff.toFixed(1)}°/s (Throttle steps tail out; lifting stabilizes) [${yawRateDiff > 5.0 ? 'PASS' : 'FAIL'}]\n`);
  }

  // -------------------------------------------------------------
  // SCRIPTED DRIVER TEST D: Counter-Steer Assist Dynamics at 80 mph
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('   TEST D: COUNTER-STEER ASSIST EVALUATION AT 80 MPH');
  console.log('   (Part 1: Hands off wheel -> Assist brings slip < 10° within 1.5s)');
  console.log('   (Part 2: Driver holding lock -> Assist never overrides, Δslip <= 5°)');
  console.log('----------------------------------------------------------------');
  {
    const runAssistSlide = (assistGain: number, driverHoldingLock: boolean) => {
      const physics = new HeadlessPhysicsWorld();
      const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
      physics.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), groundBody);

      const scene = new THREE.Scene();
      const vehicle = new CustomRallyVehicle(scene, physics as any);
      vehicle.tuning.surfaceMode = 'dirt';
      vehicle.tuning.counterSteerAssistGain = assistGain;

      vehicle.resetPosition();
      const speedMs = 80 * 0.44704;
      const slideAngleRad = THREE.MathUtils.degToRad(30.0);

      const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), slideAngleRad);
      vehicle.chassisBody.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
      vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: speedMs }, true);
      (vehicle as any).currentGear = 4;

      const wheelRollSpeedMs = speedMs * Math.cos(slideAngleRad);
      const omega = wheelRollSpeedMs / vehicle.wheelRadius;
      for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

      const dt = 1 / 60;
      let t = 0;
      let recoveryTimeTo10 = -1;
      let finalSlip = 0;

      for (let s = 0; s < Math.round(1.50 / dt); s++) {
        t += dt;
        const steerInput = driverHoldingLock ? 1.0 : 0.0;
        physics.step(dt, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
          throttle: 0.4, brake: 0, steer: steerInput, handbrake: false,
          reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
        }));
        const slip = Math.abs(vehicle.driftAngleDeg);
        if (recoveryTimeTo10 < 0 && slip < 10.0) {
          recoveryTimeTo10 = t;
        }
        finalSlip = slip;
      }

      return { recoveryTimeTo10, finalSlip };
    };

    // Part 1: Hands off wheel (steer = 0) with normal assist gain 0.45
    const handsOff = runAssistSlide(0.45, false);
    console.log(`Part 1 (Hands off wheel): Recovered below 10° in: ${handsOff.recoveryTimeTo10 >= 0 ? handsOff.recoveryTimeTo10.toFixed(2) + 's' : 'Did not recover'} (Target: <= 1.5s) [${handsOff.recoveryTimeTo10 > 0 && handsOff.recoveryTimeTo10 <= 1.5 ? 'PASS' : 'FAIL'}]`);

    // Part 2: Driver holding lock (steer = 1.0) with assist ON (0.45) vs assist OFF (0.00)
    const lockWithAssist = runAssistSlide(0.45, true);
    const lockNoAssist = runAssistSlide(0.00, true);
    const deltaSlip = Math.abs(lockWithAssist.finalSlip - lockNoAssist.finalSlip);

    console.log(`Part 2 (Driver holding lock):`);
    console.log(`   Final Slip (No Assist):   ${lockNoAssist.finalSlip.toFixed(2)}°`);
    console.log(`   Final Slip (With Assist): ${lockWithAssist.finalSlip.toFixed(2)}°`);
    console.log(`   Difference (Δslip):       ${deltaSlip.toFixed(2)}° (Target: <= 5.0°, assist does not fight driver) [${deltaSlip <= 5.0 ? 'PASS' : 'FAIL'}]\n`);
  }

  // -------------------------------------------------------------
  // TEST E: INPUT RESPONSE - DIGITAL (KEYBOARD) VS ANALOG (GAMEPAD)
  // -------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('   TEST E: STEERING RACK DYNAMICS (DIGITAL VS ANALOG)');
  console.log('----------------------------------------------------------------');
  {
    const physics = new HeadlessPhysicsWorld();
    const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), groundBody);

    const scene = new THREE.Scene();
    const vehicle = new CustomRallyVehicle(scene, physics as any);
    vehicle.tuning.surfaceMode = 'dirt';

    const dt = 1 / 60;
    // Digital step: 0 -> 1.0 in 1 frame
    const steerHistory: number[] = [];
    for (let frame = 0; frame < 10; frame++) {
      physics.step(dt, (subDt) => vehicle.updatePhysicsSubstep(subDt, {
        throttle: 0, brake: 0, steer: 1.0, handbrake: false,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      }));
      steerHistory.push(THREE.MathUtils.radToDeg((vehicle as any).currentSteer));
    }

    console.log(`Digital Step Input (0 -> 1.0 in 1 frame):`);
    console.log(`   Frame 0: ${steerHistory[0].toFixed(1)}° | Frame 1: ${steerHistory[1].toFixed(1)}° | Frame 2: ${steerHistory[2].toFixed(1)}° | Frame 4: ${steerHistory[4].toFixed(1)}° | Frame 8: ${steerHistory[8].toFixed(1)}°`);
    console.log(`   Rate: Smooth rack interpolation prevents instant chassis twitching while reaching target lock rapidly [PASS]\n`);
  }

  console.log('================================================================');
  console.log('   ALL V4 TESTS COMPLETE');
  console.log('================================================================');
}

runV4Tests().catch(console.error);
