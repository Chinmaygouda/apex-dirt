import fs from 'fs';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';
import { PhysicsWorld } from './src/physics/PhysicsWorld';

await RAPIER.init();
const csvText = fs.readFileSync('hardpack_reference_telemetry.csv', 'utf8');
const lines = csvText.trim().split('\n');
const rows: any[] = [];
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

for (let i = 0; i < 15; i++) {
  physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, {
    throttle: rows[0].throttle, brake: 0, steer: 0, handbrake: false,
    reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false,
  }));
}
vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

console.log('Time(s)  Speed(mph)  Steer   HB    Slip°    FzRL(N)  FzRR(N)  DroopRL(cm) DroopRR(cm)  Roll°   Pitch°');
console.log('-------  ----------  ------  ----  -------  -------  -------  ----------- -----------  ------  ------');
let lastReportT = -1;
for (const row of rows) {
  if (row.timeS > 4.5) break;
  const inputs = {
    throttle: row.throttle, brake: row.brake, steer: row.steer, handbrake: row.handbrake,
    reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false,
  };
  physics.step(1 / 30, (dt) => vehicle.updatePhysicsSubstep(dt, inputs));
  vehicle.updateVisuals(inputs, 1 / 30);
  const telem = vehicle.getTelemetry(inputs);

  if (row.timeS >= 2.0 && row.timeS <= 4.35 && (lastReportT < 0 || row.timeS - lastReportT >= 0.099)) {
    lastReportT = row.timeS;
    const fz = (vehicle as any).wheelNormalForces as number[];
    const droopRL = vehicle.lastVisualDroop[2] * 100;
    const droopRR = vehicle.lastVisualDroop[3] * 100;
    const roll = vehicle.getVisualRollDeg();
    const pitch = vehicle.getVisualPitchDeg();
    const slip = vehicle.driftAngleDeg;
    const speed = telem.speedMph;
    const fzRL = Math.round(fz[2] || 0);
    const fzRR = Math.round(fz[3] || 0);

    console.log(
      `${row.timeS.toFixed(2)}s    ` +
      `${speed.toFixed(1).padStart(7)} mph  ` +
      `${row.steer.toFixed(2).padStart(5)}  ` +
      `${row.handbrake ? ' YES' : '  NO'}  ` +
      `${slip.toFixed(1).padStart(6)}°  ` +
      `${String(fzRL).padStart(7)}  ` +
      `${String(fzRR).padStart(7)}  ` +
      `${droopRL.toFixed(1).padStart(10)} cm` +
      `${droopRR.toFixed(1).padStart(10)} cm` +
      `  ${roll.toFixed(1).padStart(5)}°` +
      `  ${pitch.toFixed(1).padStart(5)}°`
    );
  }
}

// Also print slip at the four key times
console.log('\n--- KEY SLIP ANGLES (with speed-limited steer) ---');
const vehicle2 = new CustomRallyVehicle(scene, physics as any);
vehicle2.tuning.surfaceMode = 'dirt';
vehicle2.resetPosition();
vehicle2.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
(vehicle2 as any).currentGear = 5;
for (let i = 0; i < 4; i++) (vehicle2 as any).wheelAngularVel[i] = omega;
for (let i = 0; i < 15; i++) {
  physics.step(1 / 120, (dt) => vehicle2.updatePhysicsSubstep(dt, {
    throttle: rows[0].throttle, brake: 0, steer: 0, handbrake: false,
    reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false,
  }));
}
vehicle2.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
for (let i = 0; i < 4; i++) (vehicle2 as any).wheelAngularVel[i] = omega;

const keyTimes = [2.2, 2.4, 2.6, 2.8];
let lastReportT2 = -1;
for (const row of rows) {
  if (row.timeS > 3.0) break;
  const inputs = {
    throttle: row.throttle, brake: row.brake, steer: row.steer, handbrake: row.handbrake,
    reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false,
  };
  physics.step(1 / 30, (dt) => vehicle2.updatePhysicsSubstep(dt, inputs));
  vehicle2.updateVisuals(inputs, 1 / 30);
  const telem2 = vehicle2.getTelemetry(inputs);
  
  if (keyTimes.some(t => Math.abs(row.timeS - t) < 0.018)) {
    if (lastReportT2 < 0 || row.timeS - lastReportT2 > 0.1) {
      lastReportT2 = row.timeS;
      const linv2 = vehicle2.chassisBody.linvel();
      const speedMph2 = Math.hypot(linv2.x, linv2.z) * 2.23694;
      console.log(`  t=${row.timeS.toFixed(2)}s | Speed=${speedMph2.toFixed(1)} mph | Steer=${row.steer.toFixed(2)} | HB=${row.handbrake?'YES':'NO'} | Slip=${vehicle2.driftAngleDeg.toFixed(1)}°`);
    }
  }
}
