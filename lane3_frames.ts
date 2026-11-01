// Lane 3 measurement + verification. Run: npx tsx lane3_frames.ts   (exit code 1 if any frozen-spec check fails)
import fs from 'fs';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';
import { PhysicsWorld } from './src/physics/PhysicsWorld';
import { ChaseCamera } from './src/core/ChaseCamera';
import { LANE3_SPEC as S, LANE3_SPEC_V2 as S2 } from './lane3_spec';

await RAPIER.init();
const lines = fs.readFileSync('hardpack_reference_telemetry.csv', 'utf8').trim().split('\n');
const rows: any[] = [];
for (let i = 1; i < lines.length; i++) {
  const p = lines[i].split(',').map(x => x.trim()); if (p.length < 10) continue;
  rows.push({ t: parseFloat(p[1]), mph: parseFloat(p[3]), throttle: parseFloat(p[5]), brake: parseFloat(p[6]), steer: parseFloat(p[8]), hb: parseInt(p[9], 10) === 1 });
}
type Frame = { t: number; roll: number; pitch: number; droop: number[]; fz: number[]; slip: number; latG: number; offAxis: number; horizon: number; camPos: THREE.Vector3; carPos: THREE.Vector3 };

async function run(flipVisualHandbrake: boolean, trunks: { x: number; z: number; r: number }[] = []): Promise<Frame[]> {
  const physics = new PhysicsWorld(); await physics.init();
  const ground = physics.world.createRigidBody(physics.rapier.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  physics.world.createCollider(physics.rapier.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), ground);
  const vehicle = new CustomRallyVehicle(new THREE.Scene(), physics as any);
  vehicle.tuning.surfaceMode = 'dirt';
  const cam = new ChaseCamera(9 / 16); cam.setTrunkObstacles(trunks);
  vehicle.resetPosition();
  const v0 = rows[0].mph * 0.44704;
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: v0 }, true);
  (vehicle as any).currentGear = 5;
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = v0 / vehicle.wheelRadius;
  const base = { reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
  for (let i = 0; i < 15; i++) physics.step(1 / 120, dt => vehicle.updatePhysicsSubstep(dt, { throttle: rows[0].throttle, brake: 0, steer: 0, handbrake: false, ...base }));
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: v0 }, true);
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = v0 / vehicle.wheelRadius;
  const out: Frame[] = [];
  for (const r of rows) {
    if (r.t > 4.6) break;
    const inputs = { throttle: r.throttle, brake: r.brake, steer: r.steer, handbrake: r.hb, ...base };
    physics.step(1 / 30, dt => vehicle.updatePhysicsSubstep(dt, inputs));
    vehicle.updateVisuals(flipVisualHandbrake ? { ...inputs, handbrake: !inputs.handbrake } : inputs, 1 / 30);
    cam.update(vehicle, 1 / 30);
    const q = vehicle.chassisBody.rotation();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w)); fwd.y = 0; fwd.normalize();
    const cd = new THREE.Vector3(); cam.camera.getWorldDirection(cd); cd.y = 0; cd.normalize();
    const tr = vehicle.chassisBody.translation();
    out.push({
      t: r.t, roll: vehicle.getVisualRollDeg(), pitch: vehicle.getVisualPitchDeg(), droop: [...vehicle.lastVisualDroop],
      fz: [...((vehicle as any).wheelNormalForces as number[])], slip: vehicle.driftAngleDeg, latG: (vehicle as any).smoothedLateralG,
      offAxis: THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(fwd.dot(cd), -1, 1))), horizon: cam.currentHorizonRollDeg,
      camPos: cam.camera.position.clone(), carPos: new THREE.Vector3(tr.x, tr.y, tr.z),
    });
  }
  return out;
}
const near = (f: Frame[], t: number) => f.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a);
const A = await run(false), B = await run(true);
// trunk test: a trunk placed 0.3 m in front of where the camera would have been at 3.8 s (i.e. between camera and car)
const c38 = near(A, 3.8), dirToCar = c38.carPos.clone().sub(c38.camPos).setY(0).normalize();
const trunk = { x: c38.camPos.x + dirToCar.x * 0.3, z: c38.camPos.z + dirToCar.z * 0.3, r: 0.5 };
const C = await run(false, [trunk]);

console.log('t(s)  speed slip   latG   roll   pitch  droop FL/FR/RL/RR (m)        Fz FL/FR/RL/RR (N)           camOff  horizon');
for (const t of S.frameTimesS) {
  const f = near(A, t);
  console.log(`${t.toFixed(1)}  ${rows.find(r => r.t >= t)!.mph.toFixed(0).padStart(5)} ${f.slip.toFixed(1).padStart(6)} ${f.latG.toFixed(2).padStart(6)} ${f.roll.toFixed(2).padStart(6)} ${f.pitch.toFixed(2).padStart(6)}  ${f.droop.map(d => d.toFixed(3)).join(' ')}   ${f.fz.map(z => String(Math.round(z)).padStart(5)).join(' ')}   ${f.offAxis.toFixed(1).padStart(5)}  ${f.horizon.toFixed(2).padStart(6)}`);
}
const res: [string, boolean, string][] = [];
const chk = (n: string, ok: boolean, d: string) => res.push([n, ok, d]);
let sr = 0, sp = 0, sh = 0;
for (let i = 1; i < A.length; i++) { sr = Math.max(sr, Math.abs(A[i].roll - A[i - 1].roll)); sp = Math.max(sp, Math.abs(A[i].pitch - A[i - 1].pitch)); sh = Math.max(sh, Math.abs(A[i].horizon - A[i - 1].horizon)); }
chk('bodyStep', Math.max(sr, sp) <= S.bodyStepMaxDegPerFrame + 1e-9, `roll ${sr.toFixed(3)} pitch ${sp.toFixed(3)} deg/frame`);
chk('horizonMax', Math.max(...A.map(f => Math.abs(f.horizon))) <= S.horizonRollMaxDeg + 1e-9, `${Math.max(...A.map(f => Math.abs(f.horizon))).toFixed(2)} deg`);
chk('horizonStep', sh <= S.horizonRollStepMaxDegPerFrame + 1e-9, `${sh.toFixed(3)} deg/frame`);
for (const t of S.offAxisDeg.atTimesS) { const o = near(A, t).offAxis; chk(`offAxis@${t}`, o >= S.offAxisDeg.min && o <= S.offAxisDeg.max, `${o.toFixed(1)} deg`); }
for (const t of S.outwardRollDeg.atTimesS) { const f = near(A, t), o = -Math.sign(f.latG) * f.roll; chk(`outwardRoll@${t} [v1 1-6, superseded, kept failing]`, o >= S.outwardRollDeg.min && o <= S.outwardRollDeg.max, `${o.toFixed(2)} deg (latG ${f.latG.toFixed(2)})`); }
for (const t of S2.outwardRollDeg.atTimesS) { const f = near(A, t), o = -Math.sign(f.latG) * f.roll; chk(`outwardRoll@${t} [v6-aligned 4-8.5]`, o >= S2.outwardRollDeg.min && o <= S2.outwardRollDeg.max, `${o.toFixed(2)} deg`); }
{ const w = A.filter(f => f.t >= S.levelBraking.fromS && f.t <= S.levelBraking.toS); const r = Math.max(...w.map(f => Math.abs(f.roll))), p = Math.max(...w.map(f => Math.abs(f.pitch)));
  chk('levelBraking', r <= S.levelBraking.maxAbsRollDeg && p <= S.levelBraking.maxAbsPitchDeg, `max |roll| ${r.toFixed(2)} max |pitch| ${p.toFixed(2)}`); }
for (const t of S.rearDroopVisibleM.atTimesS) { const d = near(A, t).droop, m = (d[2] + d[3]) / 2; chk(`rearDroop@${t}`, m >= S.rearDroopVisibleM.minMeanRearM, `RL ${d[2].toFixed(3)} RR ${d[3].toFixed(3)} mean ${m.toFixed(3)} m`); }
{ const d = near(A, S.rearDroopRelaxed.atS).droop; chk('droopRelaxed', Math.max(d[2], d[3]) <= S.rearDroopRelaxed.maxM, `RL ${d[2].toFixed(3)} RR ${d[3].toFixed(3)} m @${S.rearDroopRelaxed.atS}s`); }
{ const w = A.filter(f => f.t >= S.frontDroopQuiet.fromS && f.t <= S.frontDroopQuiet.toS); const m = Math.max(...w.flatMap(f => [f.droop[0], f.droop[1]])); chk('frontDroopQuiet', m <= S.frontDroopQuiet.maxM, `max front droop ${m.toFixed(3)} m`); }
{ let m = 0; for (let i = 0; i < A.length; i++) m = Math.max(m, Math.abs(A[i].roll - B[i].roll), Math.abs(A[i].pitch - B[i].pitch), ...A[i].droop.map((d, k) => Math.abs(d - B[i].droop[k])));
  chk('handbrakeIndependence', m <= S.handbrakeIndependenceTol, `max visual difference when only the handbrake flag differs: ${m.toExponential(2)}`); }
{ const w = C.filter(f => f.t >= 3.8 && f.t <= 4.5); const clr = Math.min(...w.map(f => Math.hypot(f.camPos.x - trunk.x, f.camPos.z - trunk.z) - trunk.r));
  const dist = Math.min(...w.map(f => Math.hypot(f.camPos.x - f.carPos.x, f.camPos.z - f.carPos.z)));
  chk('cameraClearance', clr >= S.cameraClearanceM, `min camera-to-trunk-surface ${clr.toFixed(2)} m (without avoidance the camera would have been inside it)`);
  chk('cameraMinFollow', dist >= S.cameraMinFollowM, `min planar camera-to-car ${dist.toFixed(2)} m`); }
console.log(''); for (const [n, ok, d] of res) console.log(`${ok ? 'PASS' : 'FAIL'} ${n}: ${d}`);
process.exit(res.some(r => !r[1]) ? 1 : 0);
