/**
 * Ground Truth World Geometry & Blueprint Sheet 01 Specifications
 * Contains Catmull-Rom splines, elevation field, zones, furniture, and seeded vegetation
 */

export const WORLD = 750;
export const STAGE_TARGET = 2400;
export const LOOP_TARGET = 1200;

export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hash2(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, z: number): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) {
    s += a * vnoise(x * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

export interface PathData {
  pts: Array<[number, number]>;
  cum: number[];
  len: number;
  closed: boolean;
}

export interface SplineSample {
  x: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
}

export function catmull(pts: Array<[number, number]>, closed: boolean, per: number = 20): Array<[number, number]> {
  const n = pts.length, out: Array<[number, number]> = [];
  const get = (i: number) => (closed ? pts[((i % n) + n) % n] : pts[Math.min(n - 1, Math.max(0, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      const q: [number, number] = [
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ];
      out.push(q);
    }
  }
  if (!closed) out.push([pts[n - 1][0], pts[n - 1][1]]);
  return out;
}

export function makePath(pts: Array<[number, number]>, closed: boolean): PathData {
  const p = pts.map(q => [q[0], q[1]] as [number, number]);
  if (closed) p.push([p[0][0], p[0][1]]);
  const cum = [0];
  for (let i = 1; i < p.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  }
  return { pts: p, cum, len: cum[cum.length - 1], closed };
}

export function at(path: PathData, s: number): SplineSample {
  s = path.closed ? ((s % path.len) + path.len) % path.len : Math.min(path.len, Math.max(0, s));
  let lo = 0, hi = path.cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (path.cum[m] <= s) lo = m;
    else hi = m;
  }
  const a = path.pts[lo], b = path.pts[hi];
  const seg = (path.cum[hi] - path.cum[lo]) || 1;
  const t = (s - path.cum[lo]) / seg;
  const tx = (b[0] - a[0]) / seg, tz = (b[1] - a[1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx, tz, nx: -tz, nz: tx };
}

export function nearestS(path: PathData, x: number, z: number): { s: number; d: number; i: number } {
  let best = 1e18, bi = 0;
  for (let i = 0; i < path.pts.length; i++) {
    const d = (path.pts[i][0] - x) ** 2 + (path.pts[i][1] - z) ** 2;
    if (d < best) { best = d; bi = i; }
  }
  return { s: path.cum[bi], d: Math.sqrt(best), i: bi };
}

export function headingChange(path: PathData, s: number, w: number): number {
  const a = at(path, s - w), b = at(path, s + w);
  return Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz));
}

export function straightest(path: PathData, target: number, win: number): number {
  let best = 1e9, bs = target;
  for (let s = target - win; s <= target + win; s += 10) {
    if (s < 40 || s > path.len - 40) continue;
    const c = headingChange(path, s, 30);
    if (c < best) { best = c; bs = s; }
  }
  return bs;
}

export function build(raw: Array<[number, number]>, closed: boolean, target: number): { ctrl: Array<[number, number]>; path: PathData; k: number } {
  const per = 20;
  let p = makePath(catmull(raw, closed, per), closed);
  const k = target / p.len;
  const c: [number, number] = [
    raw.reduce((a, q) => a + q[0], 0) / raw.length,
    raw.reduce((a, q) => a + q[1], 0) / raw.length
  ];
  const ctrl = raw.map(q => [c[0] + (q[0] - c[0]) * k, c[1] + (q[1] - c[1]) * k] as [number, number]);
  p = makePath(catmull(ctrl, closed, per), closed);
  return { ctrl, path: p, k };
}

export const STAGE_RAW: Array<[number, number]> = [
  [-650, 620], [-560, 605], [-440, 612], [-320, 585], [-200, 545], [-100, 520], [-35, 515],
  [0, 485],   /* 7  H1 */
  [-35, 452], [-130, 435], [-240, 405], [-340, 380], [-430, 360], [-490, 335],
  [-510, 300],/* 14 H2 */
  [-480, 265], [-390, 250], [-290, 230], [-180, 200], [-70, 170], [30, 150], [85, 125],
  [100, 92],  /* 22 H3 */
  [65, 58], [-30, 40], [-130, 10], [-230, -20], [-330, -60], [-400, -100],
  [-420, -140],/* 29 H4 */
  [-385, -180], [-300, -200], [-200, -230], [-90, -270], [20, -330], [120, -400], [230, -460],
  [340, -520], [440, -570], [540, -600]
];

export const HAIRPIN_IDX = [7, 14, 22, 29];

export const LOOP_RAW: Array<[number, number]> = [
  [300, -90], [380, -120], [480, -110], [570, -80], [620, -20], [590, 50], [520, 70],
  [460, 40], [400, 60], [340, 90], [290, 40], [270, -30]
];

export const RIVER_CTRL: Array<[number, number]> = [
  [-750, 260], [-560, 170], [-380, 120], [-220, 40], [-60, -10],
  [100, 40], [220, 160], [330, 330], [520, 420], [750, 380]
];

export const STAGE = build(STAGE_RAW, false, STAGE_TARGET);
export const LOOP = build(LOOP_RAW, true, LOOP_TARGET);
export const stage = STAGE.path;
export const loop = LOOP.path;
export const river = makePath(catmull(RIVER_CTRL, false, 12), false);
export const riverCoarse = river.pts.filter((_, i) => i % 3 === 0);
export const LOOP_C: [number, number] = [
  LOOP.ctrl.reduce((a, q) => a + q[0], 0) / LOOP.ctrl.length,
  LOOP.ctrl.reduce((a, q) => a + q[1], 0) / LOOP.ctrl.length
];

export function rawH(x: number, z: number): number {
  const g = (cx: number, cz: number, r: number, a: number) => a * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * r * r));
  return (
    g(-480, -420, 300, 1.0) +
    g(520, 480, 290, 0.9) +
    g(-80, 80, 240, 0.5) +
    g(280, -560, 240, 0.45) +
    g(-600, 560, 200, 0.25) +
    0.38 * fbm(x / 240 + 11, z / 240 + 7)
  );
}

let HMIN = 1e9, HMAX = -1e9;
for (let i = 0; i <= 60; i++) {
  for (let j = 0; j <= 60; j++) {
    const v = rawH(-750 + i * 25, -750 + j * 25);
    if (v < HMIN) HMIN = v;
    if (v > HMAX) HMAX = v;
  }
}

export function riverDist(x: number, z: number): number {
  let b = 1e18;
  for (let i = 0; i < riverCoarse.length; i++) {
    const d = (riverCoarse[i][0] - x) ** 2 + (riverCoarse[i][1] - z) ** 2;
    if (d < b) b = d;
  }
  return Math.sqrt(b);
}

export function heightAt(x: number, z: number): number {
  let h = 140 * (rawH(x, z) - HMIN) / (HMAX - HMIN);
  const w = 1 - smoothstep(150, 330, Math.hypot(x - LOOP_C[0], z - LOOP_C[1]));
  h += (16 + 4 * fbm(x / 90, z / 90) - h) * w;
  const dr = riverDist(x, z);
  h -= 10 * Math.exp(-(dr * dr) / (2 * 30 * 30));
  return Math.max(0, Math.min(140, h));
}

export const ZONES = [
  { id: 'Z1', from: 0, to: 600, name: 'Sun-faded asphalt', mu: 1.05 },
  { id: 'Z2', from: 600, to: 1800, name: 'Packed rally gravel', mu: 0.72 },
  { id: 'Z3', from: 1800, to: 2400, name: 'Fine dust and scree', mu: 0.65 }
];

export function zoneOf(s: number): number {
  return s < 600 ? 0 : s < 1800 ? 1 : 2;
}

export const hairpins = HAIRPIN_IDX.map((idx, n) => {
  const c = STAGE.ctrl[idx];
  const r = nearestS(stage, c[0], c[1]);
  const a = at(stage, r.s - 30), b = at(stage, r.s + 30);
  const cross = a.tx * b.tz - a.tz * b.tx;
  return { id: 'H' + (n + 1), s: r.s, x: c[0], z: c[1], outer: cross > 0 ? -1 : 1 };
});

export const crests = [420, 1180, 2050].map((t, n) => ({ id: 'C' + (n + 1), s: straightest(stage, t, 90) }));
export const jumps = [900, 1930].map((t, n) => ({ id: 'J' + (n + 1), s: straightest(stage, t, 90) }));
export const puddles = [1010, 1400].map((s, n) => ({ id: 'P' + (n + 1), s }));

export function roadWidth(s: number): number {
  let w = 5.5;
  for (const h of hairpins) {
    w = Math.max(w, 5.5 + 2.5 * Math.exp(-(((s - h.s) / 50) ** 2)));
  }
  return w;
}

export const bridge = (() => {
  let best = { d: 1e9, s: 0, ri: 1 };
  river.pts.forEach((q, ri) => {
    const r = nearestS(stage, q[0], q[1]);
    if (r.d < best.d) best = { d: r.d, s: r.s, ri };
  });
  return best;
})();

export const aqueduct = (() => {
  const ri = Math.max(2, bridge.ri - 16);
  const a = river.pts[ri - 1], b = river.pts[ri + 1], c = river.pts[ri];
  const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / tl, nz = (b[0] - a[0]) / tl;
  return { x1: c[0] - nx * 40, z1: c[1] - nz * 40, x2: c[0] + nx * 40, z2: c[1] + nz * 40 };
})();

export function offsetPt(path: PathData, s: number, side: number, dist: number): { x: number; z: number; p: SplineSample } {
  const p = at(path, s);
  return { x: p.x + p.nx * side * dist, z: p.z + p.nz * side * dist, p };
}

export const marshals = [160, 720, 1290, 1930, 2330].map((s, i) => ({ s, side: i % 2 ? -1 : 1, flag: i % 2 ? 'yellow' : 'green' }));

export const runs = {
  fences: [[240, 380, 1], [1230, 1380, -1], [100, 200, -1]],
  walls: [[680, 830, -1], [1560, 1640, 1], [2300, 2380, 1]],
  guardrails: [[1950, 2060, 1], [2160, 2270, -1]]
};

export const farm = (() => {
  const s = 1300, p = at(stage, s);
  // Pick side with maximum track clearance (avoiding adjacent hairpin loops)
  const candidate1 = { x: p.x + p.nx * 72, z: p.z + p.nz * 72 };
  const candidate2 = { x: p.x - p.nx * 72, z: p.z - p.nz * 72 };
  const d1 = nearestS(stage, candidate1.x, candidate1.z).d;
  const d2 = nearestS(stage, candidate2.x, candidate2.z).d;
  const side = d1 >= d2 ? 1 : -1;
  const pos = (along: number, off: number) => ({ x: p.x + p.tx * along + p.nx * side * off, z: p.z + p.tz * along + p.nz * side * off });
  return { s, side, cottage: pos(0, 72), barn: pos(38, 82), pump: pos(-32, 50) };
})();

export const tableS = straightest(loop, 820, 160);

export const grand = (() => {
  const p = at(loop, tableS);
  const a = { x: p.x + p.nx * 34, z: p.z + p.nz * 34 }, b = { x: p.x - p.nx * 34, z: p.z - p.nz * 34 };
  const side = Math.hypot(a.x - LOOP_C[0], a.z - LOOP_C[1]) > Math.hypot(b.x - LOOP_C[0], b.z - LOOP_C[1]) ? 1 : -1;
  return { side, s: tableS };
})();

export const joker = (() => {
  const A = LOOP.ctrl[2], B = LOOP.ctrl[6];
  const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
  const pts: Array<[number, number]> = [
    A,
    [A[0] + dx * 0.35 + nx * 14, A[1] + dz * 0.35 + nz * 14],
    [A[0] + dx * 0.65 - nx * 14, A[1] + dz * 0.65 - nz * 14],
    B
  ];
  const path = makePath(catmull(pts, false, 10), false);
  const sa = nearestS(loop, A[0], A[1]).s, sb = nearestS(loop, B[0], B[1]).s;
  return { path, sa, sb, len: path.len };
})();

export const loopKerbs = [4, 10].map((i) => nearestS(loop, LOOP.ctrl[i][0], LOOP.ctrl[i][1]).s);

export const herds = [
  { kind: 'cow', s: 760, side: 1, n: 4 },
  { kind: 'deer', s: 1120, side: -1, n: 2 },
  { kind: 'cow', s: 1500, side: 1, n: 3 },
  { kind: 'deer', s: 2090, side: -1, n: 3 }
].map((h, hi) => {
  const rnd = mulberry32(900 + hi), p = at(stage, h.s), animals: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < h.n; i++) {
    const off = 46 + rnd() * 10, along = (rnd() - 0.5) * 22;
    animals.push({ x: p.x + p.tx * along + p.nx * h.side * off, z: p.z + p.tz * along + p.nz * h.side * off });
  }
  return { ...h, road: { x: p.x, z: p.z }, animals };
});

export const trees = (() => {
  const rnd = mulberry32(2026), cyp: Array<[number, number]> = [], pine: Array<[number, number]> = [];
  const ok = (x: number, z: number) => {
    if (Math.abs(x) > WORLD - 8 || Math.abs(z) > WORLD - 8) return false;
    if (nearestS(stage, x, z).d < 13) return false;
    if (nearestS(loop, x, z).d < 16) return false;
    if (Math.hypot(x - LOOP_C[0], z - LOOP_C[1]) < 150) return false;
    if (riverDist(x, z) < 9) return false;
    for (const f of [farm.cottage, farm.barn, farm.pump]) {
      if (Math.hypot(x - f.x, z - f.z) < 22) return false;
    }
    return true;
  };
  const place = (arr: Array<[number, number]>, count: number, nearBias: number, minOff: number, maxOff: number) => {
    let guard = 0;
    while (arr.length < count && guard++ < 60000) {
      let x: number, z: number;
      if (rnd() < nearBias) {
        const p = at(stage, rnd() * stage.len);
        const side = rnd() < 0.5 ? -1 : 1;
        const off = minOff + rnd() * (maxOff - minOff);
        x = p.x + p.nx * side * off;
        z = p.z + p.nz * side * off;
      } else {
        x = (rnd() * 2 - 1) * WORLD;
        z = (rnd() * 2 - 1) * WORLD;
      }
      if (ok(x, z)) arr.push([x, z]);
    }
  };
  place(cyp, 1200, 0.62, 14, 95);
  place(pine, 800, 0.4, 30, 170);
  return { cyp, pine };
})();

