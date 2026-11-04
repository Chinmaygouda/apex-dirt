// measure_suspension.ts -- Lane 2 suspension measurement + frozen-spec check.
// Run: npx tsx measure_suspension.ts [--json out.json]     (exit code 1 if any spec check fails)
// Reads suspension_spec.ts (frozen). Measures PHYSICAL chassis angles from the Rapier rigid body, never the
// visual offsets (currentVisualPitch / currentVisualRoll / lastVisualDroop belong to Lane 3).
import fs from 'fs';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { SUSPENSION_SPEC as S } from './suspension_spec';
import { SUSPENSION_SPEC_V2 as S2 } from './suspension_spec_v2';
import { SUSPENSION_SPEC_V3 as S3 } from './suspension_spec_v3';

await RAPIER.init();
const { CustomRallyVehicle } = await import('./src/vehicles/CustomRallyVehicle');

const D2R = Math.PI / 180, R2D = 180 / Math.PI, G = 9.80665, MPH = 0.44704, DT = 1 / 120;
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const TUNE: { tuning?: Record<string, number>; comOffset?: number } = process.argv.includes('--tune') ? JSON.parse(process.argv[process.argv.indexOf('--tune') + 1]) : {};
const QUIET = process.argv.includes('--quiet');
if (QUIET) { const l = console.log; console.log = () => {}; (console as any).raw = l; }

// ---------------------------------------------------------------- world / vehicle helpers
class HW {
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); rapier = RAPIER;
  step(_dt: number, fn: (d: number) => void) { fn(DT); this.world.step(); }
}
function newCar(withRamp = false) {
  const p = new HW();
  const g = p.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  p.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), g);
  if (withRamp) { // identical geometry to SandboxEnvironment.createSuspensionRamps
    const rb = p.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-35, 0.5, 25));
    const a = Math.atan2(1.0, 10.0);
    rb.setRotation({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) }, true);
    p.world.createCollider(RAPIER.ColliderDesc.cuboid(3, 0.1, Math.hypot(10, 1) / 2), rb);
  }
  const v: any = new CustomRallyVehicle(new THREE.Scene(), p as any);
  v.tuning.surfaceMode = 'dirt';
  if (TUNE.tuning) Object.assign(v.tuning, TUNE.tuning);   // sweep hook: --tune '{"tuning":{"springStiffness":30000},"comOffset":0.1}'
  if (v.tuning.centerOfMassHeight !== undefined) v.setCenterOfMassHeight(v.tuning.centerOfMassHeight);
  v.resetPosition();
  return { p, v };
}
const NOINPUT = { throttle: 0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
const gearFor = (m: number) => (m > 113 ? 5 : m > 100 ? 4 : m > 60 ? 3 : m > 26 ? 2 : 1);
function launch(v: any, mph: number, gear = gearFor(mph)) {
  const ms = mph * MPH;
  v.chassisBody.setLinvel({ x: 0, y: 0, z: ms }, true); v.currentGear = gear;
  for (let i = 0; i < 4; i++) v.wheelAngularVel[i] = ms / v.wheelRadius;
}
function sub(p: HW, v: any, inp: any) { p.step(DT, (d) => v.updatePhysicsSubstep(d, inp)); }

interface Snap { t: number; y: number; pitch: number; roll: number; fz: number[]; len: number[]; latG: number; lonG: number; vy: number; contact: boolean[]; }
function snap(v: any, t: number): Snap {
  const r = v.chassisBody.rotation(); const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q), rt = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  return {
    t, y: v.chassisBody.translation().y, pitch: Math.asin(THREE.MathUtils.clamp(f.y, -1, 1)) * R2D,
    roll: Math.asin(THREE.MathUtils.clamp(rt.y, -1, 1)) * R2D, fz: [...v.wheelNormalForces], len: [...v.currentSuspensionLengths],
    latG: v.smoothedLateralG, lonG: v.smoothedLongitudinalG, vy: v.chassisBody.linvel().y, contact: [...v.wheelInContact],
  };
}
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const ptp = (a: number[]) => Math.max(...a) - Math.min(...a);

// ---------------------------------------------------------------- result bookkeeping
const results: { id: string; label: string; ok: boolean; detail: string }[] = [];
const metrics: Record<string, any> = {};
function check(id: string, label: string, ok: boolean, detail: string) { results.push({ id, label, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(4)} ${label.padEnd(46)} ${detail}`); }
const travelLog: Record<string, { min: number[]; max: number[] }> = {};
function logTravel(name: string, snaps: Snap[]) {
  travelLog[name] = { min: [0, 1, 2, 3].map(i => Math.min(...snaps.map(s => s.len[i]))), max: [0, 1, 2, 3].map(i => Math.max(...snaps.map(s => s.len[i]))) };
}

// ================================================================ A. STATIC
console.log('=== A. STATIC RIDE AND STANDSTILL (3 s settle + 1 s measured) ===');
let staticLen = [0, 0, 0, 0], staticFz = [0, 0, 0, 0], staticY = 0, vMass = 0, cogH = 0;
{
  const { p, v } = newCar(); const all: Snap[] = [];
  for (let n = 0; n < Math.round((S.staticSettleSeconds + 1.0) / DT); n++) { sub(p, v, NOINPUT); all.push(snap(v, (n + 1) * DT)); }
  const w = all.filter(s => s.t > S.staticSettleSeconds);
  vMass = v.chassisBody.mass(); cogH = v.chassisBody.worldCom().y;
  staticLen = [0, 1, 2, 3].map(i => mean(w.map(s => s.len[i]))); staticFz = [0, 1, 2, 3].map(i => mean(w.map(s => s.fz[i]))); staticY = mean(w.map(s => s.y));
  const drift = Math.abs(w[w.length - 1].y - w[0].y) * 1000 / 1.0, pp = ptp(w.map(s => s.y)) * 1000;
  const ppA = Math.max(ptp(w.map(s => s.pitch)), ptp(w.map(s => s.roll))); const ppF = Math.max(...[0, 1, 2, 3].map(i => ptp(w.map(s => s.fz[i]))));
  const sum = staticFz.reduce((a, b) => a + b, 0), weight = vMass * 9.81, front = (staticFz[0] + staticFz[1]) / sum * 100;
  const sag = staticLen.map(l => (v.tuning.suspensionRestLength - l) * 100);
  const lrF = Math.abs(staticFz[0] - staticFz[1]) / mean([staticFz[0], staticFz[1]]) * 100, lrR = Math.abs(staticFz[2] - staticFz[3]) / mean([staticFz[2], staticFz[3]]) * 100;
  Object.assign(metrics, { mass: vMass, cogHeightM: cogH, staticY, staticLenM: staticLen, staticFzN: staticFz, staticSagCm: sag, staticFrontSharePct: front, staticSumPctOfWeight: sum / weight * 100 });
  console.log(`   mass ${vMass.toFixed(0)} kg, CoG height ${cogH.toFixed(3)} m, settled y ${staticY.toFixed(4)}, wheel lengths ${staticLen.map(x => x.toFixed(4)).join(' ')}, Fz ${staticFz.map(x => x.toFixed(0)).join(' ')} N`);
  check('A1', 'heave drift over last 1 s (mm/s)', drift <= S.staticMaxHeaveDriftMmPerS, `${drift.toFixed(3)} (<=${S.staticMaxHeaveDriftMmPerS})`);
  check('A2', 'heave peak-to-peak (mm)', pp <= S.staticMaxHeavePtPMm, `${pp.toFixed(3)} (<=${S.staticMaxHeavePtPMm})`);
  check('A3', 'pitch/roll peak-to-peak (deg)', ppA <= S.staticMaxPitchRollPtPDeg, `${ppA.toFixed(4)} (<=${S.staticMaxPitchRollPtPDeg})`);
  check('A4', 'per-wheel Fz peak-to-peak (N)', ppF <= S.staticMaxWheelFzPtPN, `${ppF.toFixed(1)} (<=${S.staticMaxWheelFzPtPN})`);
  check('A5', 'sum of Fz vs m g (%)', Math.abs(sum - weight) / weight * 100 <= S.staticWeightSumTolPct, `${(Math.abs(sum - weight) / weight * 100).toFixed(2)} (<=${S.staticWeightSumTolPct})`);
  check('A6', 'front axle weight share (%)', front >= S.staticFrontShareMinPct && front <= S.staticFrontShareMaxPct, `${front.toFixed(1)} (${S.staticFrontShareMinPct}-${S.staticFrontShareMaxPct})`);
  check('A7', 'static sag, all four wheels (cm)', sag.every(x => x >= S.staticSagMinCm && x <= S.staticSagMaxCm), `${sag.map(x => x.toFixed(1)).join(' ')} (${S.staticSagMinCm}-${S.staticSagMaxCm})`);
  check('A8', 'left/right static Fz difference (%)', Math.max(lrF, lrR) <= S.staticMaxLeftRightFzDiffPct, `front ${lrF.toFixed(2)} rear ${lrR.toFixed(2)} (<=${S.staticMaxLeftRightFzDiffPct})`);
}

// ================================================================ B. RIDE FREQUENCY AND DAMPING (from parameters + measured corner mass)
console.log('\n=== B. RIDE FREQUENCY AND DAMPING (parameters + measured corner mass) ===');
{
  const { v } = newCar(); const t = v.tuning;
  const rates = typeof v.getAxleSuspensionRates === 'function' ? v.getAxleSuspensionRates()
    : { front: { k: t.springStiffness, cc: t.damperCompression, cr: t.damperRebound }, rear: { k: t.springStiffness, cc: t.damperCompression, cr: t.damperRebound } };
  // true sprung mass per corner = chassis mass x axle share / 2 (NOT Fz/g: static Fz is 2x weight in this time base)
  const shareF = (staticFz[0] + staticFz[1]) / staticFz.reduce((a, b) => a + b, 0);
  const mF = vMass * shareF / 2, mR = vMass * (1 - shareF) / 2;
  const out: any = {};
  for (const [ax, r, m] of [['front', rates.front, mF], ['rear', rates.rear, mR]] as const) {
    const f = Math.sqrt(r.k / m) / (2 * Math.PI), zc = r.cc / (2 * Math.sqrt(r.k * m)), zr = r.cr / (2 * Math.sqrt(r.k * m));
    out[ax] = { k: r.k, cornerMassKg: m, freqHz: f, zetaComp: zc, zetaReb: zr };
    check('B' + (ax === 'front' ? '1' : '2'), `${ax} ride freq (Hz) / damping ratio`, f >= S.rideFreqMinHz && f <= S.rideFreqMaxHz && zc >= S.dampingRatioMin && zr <= S.dampingRatioMax && zr >= S.dampingRatioMin && zc <= S.dampingRatioMax,
      `${f.toFixed(2)} Hz (${S.rideFreqMinHz}-${S.rideFreqMaxHz}), zeta comp ${zc.toFixed(2)} reb ${zr.toFixed(2)} (${S.dampingRatioMin}-${S.dampingRatioMax})`);
  }
  metrics.ride = out;
}
{ // B3/B4 realised ring-down (wall-clock motion the player sees): push the settled body down, release, no input
  const { p, v } = newCar(); for (let n = 0; n < Math.round(3.0 / DT); n++) sub(p, v, NOINPUT);
  const y0 = v.chassisBody.translation().y;
  // Pin the body 3 cm low for 0.5 s (zero velocity every substep) so the damper sees no length change, then release from rest.
  // Teleporting without the hold gives the damper a one-substep 3.6 m/s spike that kicks the body upward (measured), so the
  // release would not be from rest.
  for (let n = 0; n < 60; n++) { v.chassisBody.setTranslation({ x: 0, y: y0 - S2.ringDownPushCm / 100, z: -8 }, true); v.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true); v.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true); sub(p, v, NOINPUT); }
  const ys: number[] = []; for (let n = 0; n < Math.round(3.0 / DT); n++) { sub(p, v, NOINPUT); ys.push(v.chassisBody.translation().y); }
  const yeq = mean(ys.slice(-60)); const h = ys.map(y => y - yeq); const peaks: { i: number; a: number }[] = [];
  { // v3 half-cycle estimator (suspension_spec_v3.ts): release from rest at x0, first overshoot a1, time to that peak t1
    const x0 = -(y0 - S2.ringDownPushCm / 100 - yeq); let i1 = -1, a1 = 0;
    for (let i = 1; i < h.length - 1; i++) if (h[i] > 0 && h[i] > h[i - 1] && h[i] >= h[i + 1]) { i1 = i; a1 = h[i]; break; }
    if (i1 < 0 || a1 * 1000 < S3.minResolvablePeakMm) { metrics.ringDownV3 = { zeta: NaN, note: 'no resolvable overshoot' }; check('B3v3', 'realised ride frequency, half-cycle (Hz)', false, `no overshoot above ${S3.minResolvablePeakMm} mm: zeta_r >= ~0.8 [v3]`); check('B4v3', 'realised damping ratio, half-cycle', false, 'see B3v3'); }
    else { const d = Math.log(Math.abs(x0) / a1), zeta = d / Math.sqrt(Math.PI * Math.PI + d * d), fd = 1 / (2 * (i1 + 1) * DT);
      metrics.ringDownV3 = { freqHz: fd, zeta, x0Mm: x0 * 1000, firstOvershootMm: a1 * 1000 };
      check('B3v3', 'realised ride frequency, half-cycle (Hz)', fd >= S3.realizedRideFreqMinHz && fd <= S3.realizedRideFreqMaxHz, `${fd.toFixed(2)} (${S3.realizedRideFreqMinHz}-${S3.realizedRideFreqMaxHz}) [v3]`);
      check('B4v3', 'realised damping ratio, half-cycle', zeta >= S3.realizedZetaMin && zeta <= S3.realizedZetaMax, `${zeta.toFixed(2)} (${S3.realizedZetaMin}-${S3.realizedZetaMax}) x0 ${(x0 * 1000).toFixed(1)} mm, first overshoot ${(a1 * 1000).toFixed(2)} mm [v3]`); } }
  for (let i = 1; i < h.length - 1; i++) if (h[i] > h[i - 1] && h[i] >= h[i + 1] && h[i] > 0.0005) peaks.push({ i, a: h[i] });
  if (peaks.length < 2) { check('B3', 'realised ride frequency (Hz)', false, `fewer than 2 overshoot peaks above 0.5 mm (${peaks.length}): overdamped or no ring-down`); check('B4', 'realised damping ratio', false, 'see B3'); metrics.ringDown = { peaks: peaks.length }; }
  else {
    const T = (peaks[1].i - peaks[0].i) * DT, f = 1 / T, delta = Math.log(peaks[0].a / peaks[1].a), zeta = delta / Math.sqrt(4 * Math.PI * Math.PI + delta * delta);
    metrics.ringDown = { freqHz: f, zeta, firstOvershootMm: peaks[0].a * 1000, peaks: peaks.length };
    check('B3', 'realised ride frequency (Hz)', f >= S2.realizedRideFreqMinHz && f <= S2.realizedRideFreqMaxHz, `${f.toFixed(2)} (${S2.realizedRideFreqMinHz}-${S2.realizedRideFreqMaxHz}) [v2]`);
    check('B4', 'realised damping ratio', zeta >= S2.realizedZetaMin && zeta <= S2.realizedZetaMax, `${zeta.toFixed(2)} (${S2.realizedZetaMin}-${S2.realizedZetaMax}) first overshoot ${(peaks[0].a * 1000).toFixed(1)} mm [v2]`);
  }
}

// ================================================================ C. WEIGHT TRANSFER
console.log('\n=== C. WEIGHT TRANSFER (physical chassis angles, flat dirt) ===');
let bumpUseCm = 0; // peak compression from static across braking + cornering runs
function peakCompressionCm(snaps: Snap[]) { return Math.max(...snaps.flatMap(s => [0, 1, 2, 3].map(i => (staticLen[i] - s.len[i]) * 100))); }
{ // C1 braking
  const { p, v } = newCar(); launch(v, 100, 4);
  const run: Snap[] = []; const hold = { ...NOINPUT, throttle: 0.35 }; const brk = { ...NOINPUT, brake: 1.0 };
  for (let n = 0; n < 15; n++) sub(p, v, hold); launch(v, 100, 4);
  const T0 = 0.6; for (let n = 0; n < Math.round(T0 / DT); n++) { sub(p, v, hold); run.push(snap(v, n * DT)); }
  const basePitch = mean(run.slice(-24).map(s => s.pitch));
  const tb: Snap[] = []; for (let n = 0; n < Math.round(3.0 / DT); n++) { sub(p, v, brk); tb.push(snap(v, T0 + n * DT)); }
  logTravel('brake 100 mph', [...run, ...tb]); bumpUseCm = Math.max(bumpUseCm, peakCompressionCm(tb));
  const w = tb.filter(s => -s.lonG >= S.brakeDecelGMin && -s.lonG <= S.brakeDecelGMax);
  if (w.length < 6) check('C1', 'dive gradient at ~2 G braking (deg/G)', false, `only ${w.length} samples with decel in ${S.brakeDecelGMin}-${S.brakeDecelGMax} G`);
  else {
    const gM = mean(w.map(s => -s.lonG)), dPitch = mean(w.map(s => s.pitch)) - basePitch, grad = -dPitch / gM, minRear = Math.min(...w.flatMap(s => [s.fz[2], s.fz[3]]));
    const fzF = mean(w.map(s => s.fz[0] + s.fz[1])), fzR = mean(w.map(s => s.fz[2] + s.fz[3]));
    Object.assign(metrics, { brake: { decelG: gM, pitchDeltaDeg: dPitch, diveGradDegPerG: grad, pitchAt2GDeg: -grad * 2, minRearFzN: minRear, frontFzN: fzF, rearFzN: fzR, samples: w.length } });
    console.log(`   braking: ${gM.toFixed(2)} G, physical pitch change ${dPitch.toFixed(2)} deg, axle Fz front ${fzF.toFixed(0)} rear ${fzR.toFixed(0)} N`);
    check('C1', 'dive gradient at ~2 G braking (deg/G)', grad >= S.diveGradMinDegPerG && grad <= S.diveGradMaxDegPerG, `${grad.toFixed(2)} (${S.diveGradMinDegPerG}-${S.diveGradMaxDegPerG}) => pitch at 2 G ${(-grad * 2).toFixed(2)} deg`);
    check('C2', 'min rear wheel Fz at ~2 G braking (N)', minRear >= S.brakeMinRearWheelFzN, `${minRear.toFixed(0)} (>=${S.brakeMinRearWheelFzN})`);
  }
}
{ // C3 squat
  const { p, v } = newCar(); launch(v, 30, 2);
  const hold = { ...NOINPUT, throttle: 0.0 }; const wot = { ...NOINPUT, throttle: 1.0 }; const run: Snap[] = [];
  for (let n = 0; n < 15; n++) sub(p, v, hold); launch(v, 30, 2);
  for (let n = 0; n < Math.round(0.5 / DT); n++) { sub(p, v, hold); run.push(snap(v, n * DT)); }
  const basePitch = mean(run.slice(-24).map(s => s.pitch)); const ta: Snap[] = [];
  for (let n = 0; n < Math.round(2.5 / DT); n++) { sub(p, v, wot); ta.push(snap(v, 0.5 + n * DT)); }
  logTravel('accel 30 mph WOT', [...run, ...ta]);
  const w = ta.filter(s => s.lonG >= S.squatAccelGMin && s.lonG <= S.squatAccelGMax);
  if (w.length < 6) check('C3', 'squat gradient at ~0.8 G accel (deg/G)', false, `only ${w.length} samples with accel in ${S.squatAccelGMin}-${S.squatAccelGMax} G`);
  else {
    const gM = mean(w.map(s => s.lonG)), dPitch = mean(w.map(s => s.pitch)) - basePitch, grad = dPitch / gM;
    metrics.squat = { accelG: gM, pitchDeltaDeg: dPitch, squatGradDegPerG: grad, pitchAt0p8GDeg: grad * 0.8, samples: w.length };
    console.log(`   accel: ${gM.toFixed(2)} G, physical pitch change ${dPitch.toFixed(2)} deg`);
    check('C3', 'squat gradient at ~0.8 G accel (deg/G)', grad >= S.squatGradMinDegPerG && grad <= S.squatGradMaxDegPerG, `${grad.toFixed(2)} (${S.squatGradMinDegPerG}-${S.squatGradMaxDegPerG}) => pitch at 0.8 G ${(grad * 0.8).toFixed(2)} deg`);
  }
}
{ // C4/C5 cornering: sweep speeds and both directions
  const samples: { g: number; roll: number; lltd: number; side: number; mph: number }[] = []; const peaks: Snap[] = [];
  const sideRoll: Record<string, number[]> = {};
  for (const mph of [25, 35, 45, 55, 65]) for (const side of [1, -1]) {
    const { p, v } = newCar(); launch(v, mph); const inp = { ...NOINPUT, throttle: 0.3, steer: side }; const run: Snap[] = [];
    for (let n = 0; n < 15; n++) sub(p, v, { ...NOINPUT, throttle: 0.3 }); launch(v, mph);
    for (let n = 0; n < Math.round(5.0 / DT); n++) { sub(p, v, inp); run.push(snap(v, n * DT)); }
    peaks.push(...run); logTravel(`corner ${mph} mph ${side > 0 ? 'R' : 'L'}`, run);
    for (const s of run) if (s.t > 1.5 && Math.abs(s.latG) >= S.rollLatGMin && Math.abs(s.latG) <= S.rollLatGMax) {
      const outF = s.latG > 0 ? s.fz[0] - s.fz[1] : s.fz[1] - s.fz[0], outR = s.latG > 0 ? s.fz[2] - s.fz[3] : s.fz[3] - s.fz[2];
      samples.push({ g: Math.abs(s.latG), roll: s.latG > 0 ? s.roll : -s.roll, lltd: outF / Math.max(1e-6, outF + outR) * 100, side, mph });
      (sideRoll[`${mph}_${side}`] ||= []).push(Math.abs(s.roll));
    }
  }
  bumpUseCm = Math.max(bumpUseCm, peakCompressionCm(peaks));
  if (samples.length < 20) check('C4', 'roll gradient at ~1 G lateral (deg/G)', false, `only ${samples.length} samples with |latG| in ${S.rollLatGMin}-${S.rollLatGMax}`);
  else {
    const grad = samples.reduce((a, s) => a + s.roll * s.g, 0) / samples.reduce((a, s) => a + s.g * s.g, 0), lltd = mean(samples.map(s => s.lltd)), gM = mean(samples.map(s => s.g));
    metrics.corner = { samples: samples.length, meanLatG: gM, rollGradDegPerG: grad, rollAt1GDeg: grad, lltdFrontPct: lltd };
    console.log(`   cornering: ${samples.length} samples, mean ${gM.toFixed(2)} G`);
    check('C4', 'roll gradient at ~1 G lateral (deg/G)', grad >= S.rollGradMinDegPerG && grad <= S.rollGradMaxDegPerG, `${grad.toFixed(2)} (${S.rollGradMinDegPerG}-${S.rollGradMaxDegPerG}) => roll at 1 G ${grad.toFixed(2)} deg`);
    check('C5', 'front share of lateral load transfer (%)', lltd >= S.lltdFrontMinPct && lltd <= S.lltdFrontMaxPct, `${lltd.toFixed(1)} (${S.lltdFrontMinPct}-${S.lltdFrontMaxPct})`);
  }
  // C6 symmetry at matched speeds: compare mean |roll| right vs left for every speed that has samples on both sides
  let worst = 0, pairs = 0; for (const mph of [25, 35, 45, 55, 65]) { const a = sideRoll[`${mph}_1`], b = sideRoll[`${mph}_-1`]; if (a?.length > 10 && b?.length > 10) { worst = Math.max(worst, Math.abs(mean(a) - mean(b))); pairs++; } }
  check('C6', 'left/right roll asymmetry (deg)', pairs > 0 && worst <= S.maxLeftRightAsymmetryDeg, pairs ? `${worst.toFixed(3)} over ${pairs} speeds (<=${S.maxLeftRightAsymmetryDeg})` : 'no speed had samples on both sides');
}

// ================================================================ D. TRAVEL AND UNLOADING (handbrake slide from the reel inputs)
console.log('\n=== D. TRAVEL LIMITS AND UNLOADING ===');
{
  const t = newCar().v.tuning; const bumpStop = (t as any).bumpStopLength ?? 0, droopStop = (t as any).droopStopLength ?? (t.suspensionRestLength + 0.15);
  const bumpRoom = Math.min(...staticLen.map(l => (l - bumpStop) * 100)), droopRoom = Math.min(...staticLen.map(l => (droopStop - l) * 100));
  Object.assign(metrics, { bumpRoomCm: bumpRoom, droopRoomCm: droopRoom, bumpStopLengthM: bumpStop, droopStopLengthM: droopStop, peakBumpUseCm: bumpUseCm });
  check('D1', 'bump room from static (cm)', bumpRoom >= S.minBumpTravelFromStaticCm, `${bumpRoom.toFixed(1)} (>=${S.minBumpTravelFromStaticCm}) [stop at length ${bumpStop.toFixed(3)} m${(t as any).bumpStopLength === undefined ? ', none defined' : ''}]`);
  check('D2', 'droop room from static (cm)', droopRoom >= S.minDroopTravelFromStaticCm, `${droopRoom.toFixed(1)} (>=${S.minDroopTravelFromStaticCm}) [stop at length ${droopStop.toFixed(3)} m${(t as any).droopStopLength === undefined ? ', none defined' : ''}]`);
  check('D3', 'peak bump use in braking+cornering (fraction)', bumpUseCm / bumpRoom <= S.maxNormalBumpUseFraction, `${(bumpUseCm / bumpRoom).toFixed(2)} = ${bumpUseCm.toFixed(1)} of ${bumpRoom.toFixed(1)} cm (<=${S.maxNormalBumpUseFraction})`);
}
{ // replay the first 5 s of the reel inputs
  const rows = fs.readFileSync('hardpack_reference_telemetry.csv', 'utf8').trim().split('\n').slice(1).map(l => { const c = l.split(','); return { t: +c[1], thr: +c[5], brk: +c[6], steer: +c[8], hb: +c[9] === 1, mph: +c[3] }; });
  const { p, v } = newCar(); launch(v, rows[0].mph, 5);
  for (let n = 0; n < 15; n++) sub(p, v, { ...NOINPUT, throttle: rows[0].thr });
  const all: Snap[] = []; const marks = [2.0, 2.5, 2.8, 3.2, 3.8, 4.1]; const atMark: any[] = [];
  for (const r of rows) { if (r.t > 5.0) break; const inp = { ...NOINPUT, throttle: r.thr, brake: r.brk, steer: r.steer, handbrake: r.hb };
    for (let n = 0; n < 4; n++) sub(p, v, inp); const s = snap(v, r.t); all.push(s);
    for (const m of marks) if (Math.abs(r.t - m) < 0.017) atMark.push({ t: m, pitchDeg: +s.pitch.toFixed(2), rollDeg: +s.roll.toFixed(2), extCm: s.len.map((l, i) => +((l - staticLen[i]) * 100).toFixed(1)), fzN: s.fz.map(x => Math.round(x)) }); }
  logTravel('reel inputs 0-5 s', all); metrics.reelMarks = atMark;
  console.log('   physical state at reel timestamps (ext = wheel extension from static ride, + = hanging lower):');
  for (const m of atMark) console.log(`   t=${m.t.toFixed(1)}  pitch ${m.pitchDeg.toString().padStart(6)}  roll ${m.rollDeg.toString().padStart(6)}  ext[cm] ${m.extCm.map((x: number) => x.toString().padStart(6)).join(' ')}  Fz ${m.fzN.map((x: number) => x.toString().padStart(6)).join(' ')}`);
  const w = all.filter(s => s.t >= 2.4 && s.t <= 3.6);
  let best = { ext: -1e9, fzPct: 100, wheel: -1 };
  for (const i of [2, 3]) { const ext = Math.max(...w.map(s => (s.len[i] - staticLen[i]) * 100)), fzPct = Math.min(...w.map(s => s.fz[i])) / staticFz[i] * 100; if (ext > best.ext) best = { ext, fzPct, wheel: i }; }
  metrics.handbrakeRear = best;
  check('D4', 'rear wheel extension in handbrake slide (cm)', best.ext >= S.handbrakeRearInsideExtensionMinCm, `${best.ext.toFixed(1)} on wheel ${best.wheel} (>=${S.handbrakeRearInsideExtensionMinCm})`);
  check('D5', 'that wheel unloads to (% of static Fz)', best.fzPct <= S.handbrakeRearInsideFzMaxPctOfStatic, `${best.fzPct.toFixed(1)} (<=${S.handbrakeRearInsideFzMaxPctOfStatic})`);
}

// ================================================================ E. LANDING
console.log('\n=== E. LANDING ===');
function landing(name: string, snaps: Snap[], iTouch: number) {
  const tail = snaps.slice(-Math.round(0.5 / DT)); const yRest = mean(tail.map(s => s.y));
  const seg = snaps.slice(iTouch); let bounces = 0, above = false;
  for (const s of seg) { const h = s.y - yRest; if (!above && h > 0.01) { bounces++; above = true; } if (above && h < 0.0) above = false; }
  let settle = Infinity, held = 0; for (const s of seg) { if (Math.abs(s.y - yRest) < 0.02 && Math.abs(s.vy) < 0.1) { held += DT; if (held >= 0.3) { settle = s.t - seg[0].t - 0.3 + DT; break; } } else held = 0; }
  const minLen = Math.min(...seg.flatMap(s => s.len)), peakFz = Math.max(...seg.flatMap(s => s.fz)), peakFzF = peakFz / Math.max(...staticFz);
  logTravel(name, snaps); metrics[name] = { bounces, settleS: settle, minWheelLenM: minLen, peakWheelFzN: peakFz, peakFzOverStatic: peakFzF, restY: yRest };
  const tag = name === 'drop' ? 'E1' : 'E2';
  check(tag + 'a', `${name}: bounces after first touchdown`, bounces <= S.maxBouncesAfterLanding, `${bounces} (<=${S.maxBouncesAfterLanding})`);
  check(tag + 'b', `${name}: settle time (s)`, settle <= S.maxSettleSeconds, `${settle === Infinity ? 'never' : settle.toFixed(2)} (<=${S.maxSettleSeconds})`);
  check(tag + 'c', `${name}: min wheel length (m)`, minLen >= S.minWheelLengthAfterLandingM, `${minLen.toFixed(3)} (>=${S.minWheelLengthAfterLandingM})`);
  check(tag + 'd', `${name}: peak wheel Fz / static Fz`, peakFzF <= S.maxPeakWheelFzOverStaticFactor, `${peakFzF.toFixed(2)} = ${peakFz.toFixed(0)} N (<=${S.maxPeakWheelFzOverStaticFactor})`);
}
{ // E1 plain 0.5 m drop
  const { p, v } = newCar(); const snaps: Snap[] = []; v.chassisBody.setTranslation({ x: 0, y: staticY + 0.5, z: -8 }, true);
  for (let n = 0; n < Math.round(4.0 / DT); n++) { sub(p, v, NOINPUT); snaps.push(snap(v, n * DT)); }
  let iT = snaps.findIndex(s => s.len.some((l, i) => l < staticLen[i] - 0.01)); if (iT < 0) iT = 0; landing('drop', snaps, iT);
}
{ // E2 sandbox ramp launch at 50 mph, landing on flat ground. The ramp COLLIDER slopes up toward -z (its high end is at
  // z = 20; the mesh is mirrored), so the car approaches from +z heading -z and leaves the high end at z ~ 20.
  const { p, v } = newCar(true); const snaps: Snap[] = [];
  v.chassisBody.setTranslation({ x: -35, y: 0.7, z: 52 }, true); v.chassisBody.setRotation({ x: 0, y: 1, z: 0, w: 0 }, true);
  { const ms = 50 * MPH; v.chassisBody.setLinvel({ x: 0, y: 0, z: -ms }, true); v.currentGear = 3; for (let i = 0; i < 4; i++) v.wheelAngularVel[i] = ms / v.wheelRadius; }
  const inp = { ...NOINPUT, throttle: 0.35 }; let tRamp = -1; let maxAir = 0;
  for (let n = 0; n < Math.round(7.0 / DT); n++) { sub(p, v, inp); const s = snap(v, n * DT); snaps.push(s); const z = v.chassisBody.translation().z; if (tRamp < 0 && z < 19.7) tRamp = n; if (tRamp >= 0) maxAir = Math.max(maxAir, s.y); }
  let iT = -1; if (tRamp >= 0) for (let n = tRamp; n < snaps.length; n++) if (snaps[n].len.every((l, i) => l < staticLen[i] - 0.01)) { iT = n; break; }
  if (iT < 0) check('E2a', 'ramp: landing detected', false, tRamp < 0 ? 'car never reached the end of the ramp' : 'no touchdown found');
  else {
    // restY is the mean over the last 0.5 s of the run; the car is rolling forward at ~50 mph so heave is measured against that
    landing('ramp', snaps, iT); metrics.ramp.apexYM = maxAir;
  }
}

// ================================================================ summary
console.log('\n=== PER-WHEEL TRAVEL RANGE (wheel length m, min..max; static ' + staticLen.map(x => x.toFixed(3)).join(' ') + ') ===');
for (const [name, r] of Object.entries(travelLog)) console.log(`   ${name.padEnd(20)} ` + [0, 1, 2, 3].map(i => `${['FL', 'FR', 'RL', 'RR'][i]} ${r.min[i].toFixed(3)}..${r.max[i].toFixed(3)}`).join('   '));
metrics.travelLog = travelLog;
const blocked = results.filter(r => !r.ok && S2.blockedByTimeBase.includes(r.id));
const failed = results.filter(r => !r.ok && !S2.blockedByTimeBase.includes(r.id));
console.log(`\nSUSPENSION SPEC: ${results.length - failed.length - blocked.length} passed, ${failed.length} failed, ${blocked.length} blocked by time base` + (failed.length ? `  [failed: ${failed.map(f => f.id).join(', ')}]` : '') + (blocked.length ? `  [blocked: ${blocked.map(f => f.id).join(', ')}]` : ''));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ metrics, results }, null, 2));
process.exit(failed.length ? 1 : 0);
