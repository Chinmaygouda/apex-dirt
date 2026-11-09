import math

STAGE_RAW = [
    [-650, 620], [-560, 605], [-440, 612], [-320, 585], [-200, 545], [-100, 520], [-35, 515],
    [0, 485],   # 7  H1
    [-35, 452], [-130, 435], [-240, 405], [-340, 380], [-430, 360], [-490, 335],
    [-510, 300],# 14 H2
    [-480, 265], [-390, 250], [-290, 230], [-180, 200], [-70, 170], [30, 150], [85, 125],
    [100, 92],  # 22 H3
    [65, 58], [-30, 40], [-130, 10], [-230, -20], [-330, -60], [-400, -100],
    [-420, -140],# 29 H4
    [-385, -180], [-300, -200], [-200, -230], [-90, -270], [20, -330], [120, -400], [230, -460],
    [340, -520], [440, -570], [540, -600]
]

LOOP_RAW = [
    [300, -90], [380, -120], [480, -110], [570, -80], [620, -20], [590, 50], [520, 70],
    [460, 40], [400, 60], [340, 90], [290, 40], [270, -30]
]

RIVER_CTRL = [
    [-750, 260], [-560, 170], [-380, 120], [-220, 40], [-60, -10],
    [100, 40], [220, 160], [330, 330], [520, 420], [750, 380]
]

def catmull(pts, closed, per=20):
    n = len(pts)
    out = []
    get = lambda i: pts[((i % n) + n) % n] if closed else pts[min(n - 1, max(0, i))]
    segs = n if closed else n - 1
    for i in range(segs):
        p0, p1, p2, p3 = get(i - 1), get(i), get(i + 1), get(i + 2)
        for j in range(per):
            t = j / per
            t2 = t * t
            t3 = t2 * t
            q = [
                0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t +
                       (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
                       (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
                for k in range(2)
            ]
            out.append(q)
    if not closed:
        out.append(list(pts[-1]))
    return out

def make_path(pts, closed):
    p = [list(q) for q in pts]
    if closed:
        p.append(list(p[0]))
    cum = [0.0]
    for i in range(1, len(p)):
        cum.append(cum[-1] + math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]))
    return {'pts': p, 'cum': cum, 'len': cum[-1], 'closed': closed}

def build(raw, closed, target):
    p = make_path(catmull(raw, closed, 20), closed)
    k = target / p['len']
    cx = sum(q[0] for q in raw) / len(raw)
    cz = sum(q[1] for q in raw) / len(raw)
    ctrl = [[cx + (q[0] - cx) * k, cz + (q[1] - cz) * k] for q in raw]
    p2 = make_path(catmull(ctrl, closed, 20), closed)
    return {'ctrl': ctrl, 'path': p2, 'k': k}

stage = build(STAGE_RAW, False, 2400)
loop = build(LOOP_RAW, True, 1200)

print(f"Stage raw len: {stage['path']['len']:.2f} m (scaled with k={stage['k']:.4f})")
print(f"Loop raw len: {loop['path']['len']:.2f} m (scaled with k={loop['k']:.4f})")
print(f"First stage pt: {stage['ctrl'][0]}")
print(f"Last stage pt: {stage['ctrl'][-1]}")

