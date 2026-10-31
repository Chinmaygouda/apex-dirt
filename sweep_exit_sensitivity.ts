import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle.js';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init();

const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), ground);
const scene = new THREE.Scene();
const vehicle = new CustomRallyVehicle(scene, { rapier: RAPIER, world, step: () => {} } as any);
vehicle.tuning.surfaceMode = 'dirt';

function runManeuver(hbRelease: number, driftThrottle: number, csSteer: number, csEnd: number) {
  vehicle.resetPosition();
  const initSpeedMs = 130 * 0.44704;
  vehicle.chassisBody.setTranslation({ x: 0, y: 0.42, z: 0 }, true);
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  (vehicle as any).currentGear = 5;
  const wheelOmega = initSpeedMs / vehicle.wheelRadius;
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = wheelOmega;
  
  for (let i = 0; i < 15; i++) {
    let acc = 1/120;
    vehicle.updatePhysicsSubstep(acc, { throttle: 1, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
    world.step();
  }
  
  const dt = 1/60;
  const totalFrames = Math.round(5.40 / dt);
  for (let f = 0; f < totalFrames; f++) {
    const t = f * dt;
    let throttle = 0, brake = 0, steer = 0, handbrake = false;
    if (t < 1.20) { throttle = 1.0; }
    else if (t < 1.55) { brake = 1.0; }
    else if (t < hbRelease) { brake = 0.35; steer = 0.95; handbrake = true; }
    else if (t < 3.20) { throttle = driftThrottle; steer = 0.50; handbrake = false; }
    else {
      throttle = 1.0;
      steer = t < csEnd ? csSteer : 0.0;
    }
    
    let acc = dt;
    while (acc >= 1/120) {
      vehicle.updatePhysicsSubstep(1/120, { throttle, brake, steer, handbrake, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
      world.step();
      acc -= 1/120;
    }
    vehicle.updateVisuals({ throttle, brake, steer, handbrake, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false }, dt);
  }
  
  const telem = vehicle.getTelemetry({ throttle: 1, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
  const rot = vehicle.chassisBody.rotation();
  const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  const linvel = vehicle.chassisBody.linvel();
  const velVec = new THREE.Vector3(linvel.x, linvel.y, linvel.z);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
  const vForward = velVec.dot(fwd);
  const vLateral = velVec.dot(right);
  const finalSlip = THREE.MathUtils.radToDeg(Math.atan2(vLateral, Math.max(Math.abs(vForward), 1.0)));
  return { speedMph: telem.speedMph, finalSlipDeg: Math.abs(finalSlip) };
}

console.log('HB_Rel | DriftThr | CS_Steer | CS_End | Speed(5.4s) | FinalSlip(5.4s) | Status');
console.log('-------+----------+----------+--------+-------------+-----------------+--------');

const results: any[] = [];
let above5Count = 0;
let totalCount = 0;

for (const hb of [1.95, 2.05, 2.15]) {
  for (const thr of [0.70, 0.85, 1.00]) {
    for (const cs of [-0.20, -0.35, -0.50, -0.70]) {
      for (const end of [3.4, 3.65, 3.9, 4.2]) {
        const res = runManeuver(hb, thr, cs, end);
        totalCount++;
        const isAbove5 = res.finalSlipDeg > 5.0;
        if (isAbove5) above5Count++;
        const row = {
          hb,
          thr,
          cs,
          end,
          speedMph: res.speedMph,
          finalSlipDeg: res.finalSlipDeg,
          status: isAbove5 ? 'HIGH_SLIP' : 'RECOVERED'
        };
        results.push(row);
        console.log(`${hb.toFixed(2).padStart(6)} | ${thr.toFixed(2).padStart(8)} | ${cs.toFixed(2).padStart(8)} | ${end.toFixed(2).padStart(6)} | ${res.speedMph.toFixed(1).padStart(7)} mph | ${res.finalSlipDeg.toFixed(2).padStart(11)}° | [${row.status}]`);
      }
    }
  }
}

console.log('-------------------------------------------------------------------------------');
console.log(`Sensitivity Sweep Summary: ${totalCount - above5Count}/${totalCount} RECOVERED (${(((totalCount - above5Count)/totalCount)*100).toFixed(1)}%), ${above5Count}/${totalCount} HIGH_SLIP (${((above5Count/totalCount)*100).toFixed(1)}%)`);

import fs from 'fs';
const mdRows: string[] = [
  '| Handbrake Release | Drift Throttle | Counter-Steer | CS End Time | Speed @ 5.4s | Slip @ 5.4s | Exit Status |',
  '|:-----------------:|:--------------:|:-------------:|:-----------:|:------------:|:-----------:|:-----------:|'
];
for (const r of results) {
  mdRows.push(`| ${r.hb.toFixed(2)} s | ${r.thr.toFixed(2)} | ${r.cs.toFixed(2)} | ${r.end.toFixed(2)} s | ${r.speedMph.toFixed(1)} mph | ${r.finalSlipDeg.toFixed(2)}° | ${r.status === 'RECOVERED' ? '**RECOVERED**' : 'HIGH_SLIP'} |`);
}
fs.writeFileSync('sweep_table.md', mdRows.join('\n'));
console.log('Exported sweep_table.md successfully.');

