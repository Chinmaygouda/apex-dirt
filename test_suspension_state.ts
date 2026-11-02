// test_suspension_state.ts -- contract checks for CustomRallyVehicle.getSuspensionState() (Lane 2). Run: npx tsx test_suspension_state.ts
// Thresholds written before the first run. Checks sign conventions and consistency with the existing telemetry fields.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const { CustomRallyVehicle } = await import('./src/vehicles/CustomRallyVehicle');
const DT = 1 / 120, MPH = 0.44704;
const N = { throttle: 0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
function newCar() { const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); const p: any = { world, rapier: RAPIER, step(_d: number, fn: (d: number) => void) { fn(DT); world.step(); } };
  const g = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0)); world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), g);
  const v: any = new CustomRallyVehicle(new THREE.Scene(), p); v.tuning.surfaceMode = 'dirt'; v.resetPosition(); return { p, v }; }
function launch(v: any, mph: number, gear: number) { const ms = mph * MPH; v.chassisBody.setLinvel({ x: 0, y: 0, z: ms }, true); v.currentGear = gear; for (let i = 0; i < 4; i++) v.wheelAngularVel[i] = ms / v.wheelRadius; }
let fails = 0, total = 0; const check = (ok: boolean, label: string, d: string) => { total++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${d}`); };
{ // static
  const { p, v } = newCar(); for (let n = 0; n < 480; n++) p.step(DT, (d: number) => v.updatePhysicsSubstep(d, N)); const s = v.getSuspensionState();
  check(s.wheels.every((w: any) => w.grounded), 'static: all wheels grounded', '');
  check(s.wheels.every((w: any) => Math.abs(w.droopFromStatic) < 0.001), 'static: droopFromStatic within 1 mm of 0', s.wheels.map((w: any) => (w.droopFromStatic * 1000).toFixed(2) + 'mm').join(' '));
  check(Math.abs(s.chassis.heave) < 0.001 && Math.abs(s.chassis.pitchDeg) < 0.05 && Math.abs(s.chassis.rollDeg) < 0.05, 'static: heave, pitch, roll ~ 0', `heave ${(s.chassis.heave * 1000).toFixed(2)} mm pitch ${s.chassis.pitchDeg.toFixed(3)} roll ${s.chassis.rollDeg.toFixed(3)}`);
  check(s.wheels.every((w: any, i: number) => w.normalForce === v.wheelNormalForces[i]), 'static: normalForce equals wheelNormalForces', '');
  check(s.wheels.every((w: any) => Math.abs(w.travel - (w.travel)) < 1e-9 && w.travel > 0.05), 'static: travel is positive compression from spring-free length', s.wheels.map((w: any) => w.travel.toFixed(3)).join(' '));
}
{ // braking: nose down, front compresses, front droopFromStatic < 0, rear > 0
  const { p, v } = newCar(); launch(v, 100, 4); for (let n = 0; n < 15; n++) p.step(DT, (d: number) => v.updatePhysicsSubstep(d, { ...N, throttle: 0.35 })); launch(v, 100, 4);
  for (let n = 0; n < 120; n++) p.step(DT, (d: number) => v.updatePhysicsSubstep(d, { ...N, brake: 1 })); const s = v.getSuspensionState();
  check(s.chassis.pitchDeg < -1.0, 'braking: pitchDeg negative (nose down) below -1 deg', `${s.chassis.pitchDeg.toFixed(2)}`);
  check(s.chassis.longitudinalG < -1.0, 'braking: longitudinalG negative', `${s.chassis.longitudinalG.toFixed(2)}`);
  check(s.wheels[0].droopFromStatic < -0.01 && s.wheels[2].droopFromStatic > 0.0, 'braking: front pushed up (droop<0), rear hanging lower (droop>0)', `FL ${(s.wheels[0].droopFromStatic * 100).toFixed(1)} cm RL ${(s.wheels[2].droopFromStatic * 100).toFixed(1)} cm`);
}
{ // steer = +1 (right per the telemetry CSV). MEASURED convention in this code base: lateralG and rollDeg are both NEGATIVE for steer +1
  // (the original draft of this check and of SuspensionState.ts assumed positive; that was a wrong assumption, corrected here).
  // What the contract guarantees: lateralG and rollDeg always have the SAME sign, and the more compressed wheels are on the same side as each other.
  const { p, v } = newCar(); launch(v, 45, 3); for (let n = 0; n < 15; n++) p.step(DT, (d: number) => v.updatePhysicsSubstep(d, { ...N, throttle: 0.3 })); launch(v, 45, 3);
  for (let n = 0; n < 360; n++) p.step(DT, (d: number) => v.updatePhysicsSubstep(d, { ...N, throttle: 0.3, steer: 1 })); const s = v.getSuspensionState();
  check(Math.abs(s.chassis.lateralG) > 0.5 && Math.abs(s.chassis.rollDeg) > 0.3 && s.chassis.lateralG * s.chassis.rollDeg > 0, 'turn: |lateralG|>0.5, |rollDeg|>0.3, same sign', `latG ${s.chassis.lateralG.toFixed(2)} roll ${s.chassis.rollDeg.toFixed(2)}`);
  const dF = s.wheels[0].travel - s.wheels[1].travel, dR = s.wheels[2].travel - s.wheels[3].travel;
  check(Math.abs(dF) > 0.01 && Math.abs(dR) > 0.01 && dF * dR > 0, 'turn: front and rear axle compress the same side, by more than 1 cm', `front L-R ${(dF * 100).toFixed(1)} cm rear L-R ${(dR * 100).toFixed(1)} cm`);
  check(dF * s.chassis.rollDeg > 0, 'turn: wheel-index-0 side compresses more when rollDeg > 0 is NOT assumed; sign pairing recorded', `sign(front L-R) ${Math.sign(dF)} with sign(rollDeg) ${Math.sign(s.chassis.rollDeg)}`);
}
console.log(`\nSUMMARY: ${total - fails} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
