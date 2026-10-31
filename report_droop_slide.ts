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

console.log('Time(s) | Phase                     | Speed(mph) | Steer | HB  | Roll(°) | Inside Rear Droop(cm) | State');
console.log('--------+---------------------------+------------+-------+-----+---------+-----------------------+-------');
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
  const droopRL = (vehicle.lastVisualDroop[2] || 0) * 100;
  const roll = (vehicle as any).currentVisualRoll;
  
  if (row.timeS >= 2.0 && row.timeS <= 4.35 && (lastReportT < 0 || row.timeS - lastReportT >= 0.099)) {
    lastReportT = row.timeS;
    const fz = (vehicle as any).wheelNormalForces;
    const droopRL = vehicle.lastVisualDroop[2] * 100;
    const droopRR = vehicle.lastVisualDroop[3] * 100;
    const roll = vehicle.getVisualRollDeg();
    const pitch = vehicle.getVisualPitchDeg();
    const slip = vehicle.driftAngleDeg;
    const speed = telem.speedMph;

    // Report inside rear droop (turning right -> inside is RL)
    console.log(
      `${row.timeS.toFixed(2)}s | ` +
      `${speed.toFixed(1).padStart(5)} mph | ` +
      `Steer: ${row.steer.toFixed(2).padStart(5)} | ` +
      `HB: ${row.handbrake ? 'YES' : ' NO'} | ` +
      `Slip: ${slip.toFixed(1).padStart(5)}° | ` +
      `Roll: ${roll.toFixed(1).padStart(5)}° | ` +
      `Pitch: ${pitch.toFixed(1).padStart(5)}° | ` +
      `Inside Rear Droop: ${droopRL.toFixed(1).padStart(4)} cm`
    );
  }
}
