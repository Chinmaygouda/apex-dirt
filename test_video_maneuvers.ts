import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import fs from 'fs';
import path from 'path';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle.js';

await RAPIER.init();

class HeadlessPhysicsWorld {
  public world: RAPIER.World;
  public rapier: typeof RAPIER;
  constructor() {
    this.rapier = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }
  public step(dt: number, updateSubstep: (dt: number) => void): void {
    updateSubstep(dt);
    this.world.step();
  }
}

function parseCsv(csvText: string) {
  const lines = csvText.trim().split('\n');
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',').map(s => s.trim());
    if (p.length < 10) continue;
    rows.push({
      timeS: parseFloat(p[1]),
      refSpeedMph: parseFloat(p[3]),
      refGear: p[4],
      throttle: parseFloat(p[5]),
      brake: parseFloat(p[6]),
      steer: parseFloat(p[8]),
      handbrake: parseInt(p[9], 10) === 1,
    });
  }
  return rows;
}

// ----------------------------------------------------------------
// Test Maneuver B: 10s keyboard-style low-speed drift
// ----------------------------------------------------------------
function testClipB() {
  console.log('\n--- Testing Clip B: 10s Keyboard Drift (steer -1/0/+1, full throttle) ---');
  const physics = new HeadlessPhysicsWorld();
  const ground = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 0.5, 5000).setFriction(0.9), ground);

  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, physics as any);
  vehicle.tuning.surfaceMode = 'dirt';
  vehicle.resetPosition();

  // Start in 2nd gear at 25 mph
  const initSpeedMs = 25.0 * 0.44704;
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  (vehicle as any).currentGear = 2;
  const omega = initSpeedMs / vehicle.wheelRadius;
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

  // Settle 0.2s
  for (let s = 0; s < 24; s++) {
    physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, {
      throttle: 1.0, brake: 0, steer: 0, handbrake: false,
      reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
    }));
  }

  const dt = 1 / 30; // 30 fps
  const totalFrames = 300; // 10s
  let minSpeed = 999, maxSpeed = 0, peakSlip = 0;

  for (let f = 0; f < totalFrames; f++) {
    const t = f * dt;
    // Keyboard steer inputs strictly -1, 0, or +1:
    // Alternating keyboard taps to sustain a low-speed drift circle:
    let steer: -1 | 0 | 1 = 1;
    // Rhythmic counter-steer taps when slip gets high
    const currentSlip = Math.abs(vehicle.driftAngleDeg);
    if (t < 0.8) {
      steer = 1; // turn in hard
    } else {
      // Counter-steer cadence: tap 0 or -1 when slip > 22 deg, tap +1 when slip < 16 deg
      const cycle = Math.floor(t * 4) % 3;
      if (currentSlip > 22.0) {
        steer = cycle === 0 ? -1 : 0;
      } else if (currentSlip < 15.0) {
        steer = 1;
      } else {
        steer = cycle === 1 ? 1 : 0;
      }
    }

    const inputs = {
      throttle: 1.0, // full throttle continuous
      brake: 0.0,
      steer: steer,
      handbrake: false,
      reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
    };

    // 4 substeps @ 120 Hz
    for (let s = 0; s < 4; s++) {
      physics.step(1 / 120, (subDt) => vehicle.updatePhysicsSubstep(subDt, inputs));
    }
    vehicle.updateVisuals(inputs, dt);
    const telem = vehicle.getTelemetry(inputs);

    if (telem.speedMph < minSpeed) minSpeed = telem.speedMph;
    if (telem.speedMph > maxSpeed) maxSpeed = telem.speedMph;
    if (Math.abs(vehicle.driftAngleDeg) > peakSlip) peakSlip = Math.abs(vehicle.driftAngleDeg);

    if (f % 60 === 0 || f === totalFrames - 1) {
      console.log(`  f=${f.toString().padStart(3)} | t=${t.toFixed(1)}s | Spd=${telem.speedMph.toFixed(1)} mph | Gear=${telem.gear} | Steer=${steer.toString().padStart(2)} | Slip=${vehicle.driftAngleDeg.toFixed(1)}° | Droop=${(vehicle.lastVisualDroop[2]*100).toFixed(1)}cm`);
    }
  }

  console.log(`Clip B Results: Speed range: ${minSpeed.toFixed(1)} - ${maxSpeed.toFixed(1)} mph | Peak Slip: ${peakSlip.toFixed(1)}°`);
}

// ----------------------------------------------------------------
// Test Maneuver C: Brake to stop, reverse, W to brake, handbrake
// ----------------------------------------------------------------
function testClipC() {
  console.log('\n--- Testing Clip C: Brake to stop, reverse, W to brake, handbrake ---');
  const physics = new HeadlessPhysicsWorld();
  const ground = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 0.5, 5000).setFriction(0.9), ground);

  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, physics as any);
  vehicle.tuning.surfaceMode = 'dirt';
  vehicle.resetPosition();

  // Start moving forward in 2nd gear at 30 mph
  const initSpeedMs = 30.0 * 0.44704;
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  (vehicle as any).currentGear = 2;
  const omega = initSpeedMs / vehicle.wheelRadius;
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

  const dt = 1 / 30; // 30 fps
  const totalFrames = 300; // 10s

  for (let f = 0; f < totalFrames; f++) {
    const t = f * dt;
    let throttle = 0;
    let brake = 0;
    let steer = 0;
    let handbrake = false;

    if (t < 1.5) {
      // Phase 1: Forward drive
      throttle = 0.8;
      brake = 0;
    } else if (t < 3.2) {
      // Phase 2: Brake to stop
      throttle = 0;
      brake = 1.0;
    } else if (t < 5.8) {
      // Phase 3: Reverse
      (vehicle as any).drivingDirectionMode = 'reverse';
      (vehicle as any).currentGear = -1;
      throttle = 0;
      brake = 0.95; // In reverse mode, brake pedal drives reverse
    } else if (t < 7.2) {
      // Phase 4: W to brake reverse!
      throttle = 1.0; // W key brakes reverse motion
      brake = 0;
    } else if (t < 8.5) {
      // Phase 5: Reverse again
      (vehicle as any).drivingDirectionMode = 'reverse';
      (vehicle as any).currentGear = -1;
      throttle = 0;
      brake = 0.95;
    } else {
      // Phase 6: Handbrake stop!
      throttle = 0;
      brake = 0;
      handbrake = true;
    }

    const inputs = {
      throttle, brake, steer, handbrake,
      reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
    };

    for (let s = 0; s < 4; s++) {
      physics.step(1 / 120, (subDt) => vehicle.updatePhysicsSubstep(subDt, inputs));
    }
    vehicle.updateVisuals(inputs, dt);
    const telem = vehicle.getTelemetry(inputs);

    if (f % 45 === 0 || f === totalFrames - 1) {
      console.log(`  f=${f.toString().padStart(3)} | t=${t.toFixed(1)}s | Spd=${telem.speedMph.toFixed(1)} mph | Gear=${telem.gear} | Thr=${throttle.toFixed(2)} | Brk=${brake.toFixed(2)} | HB=${handbrake?'ON ':'OFF'} | Slip=${vehicle.driftAngleDeg.toFixed(1)}°`);
    }
  }
}

testClipB();
testClipC();
