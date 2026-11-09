import os
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.gridspec import GridSpec
from scipy.interpolate import splprep, splev

# -----------------------------------------------------------------------------
# HIGH-FIDELITY RALLY VISUAL STORYBOARD:
# Panel 1: Vehicle Driving in Middle of Road (Corridor Mountain Pass Perspective)
# Panel 2: Vehicle Drifting / Turning Through Banked Hairpin (Roost & Smoke Action)
# Panel 3: Overall Top-Down Journey Map (Full 2.4 km Stage Route & Milestones)
# -----------------------------------------------------------------------------

plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'Helvetica']

fig = plt.figure(figsize=(26, 14), facecolor='#080F1E')
gs = GridSpec(2, 2, width_ratios=[1.15, 1.0], height_ratios=[1.0, 1.0], wspace=0.18, hspace=0.22)

# Colors
BG_DARK = '#0A1424'
ACCENT_CYAN = '#00F0FF'
ACCENT_ORANGE = '#FF5500'
ACCENT_GOLD = '#FFB700'
TEXT_LIGHT = '#F0F6FC'
TEXT_MUTED = '#8B949E'
LINE_GRID = '#162842'

# ==============================================================================
# PANEL 1: VEHICLE GOING IN MIDDLE OF THE ROAD (CINEMATIC CHASE PERSPECTIVE)
# ==============================================================================
ax1 = fig.add_subplot(gs[0, 0], facecolor='#0D1B2E')
ax1.set_title("1. REFERENCE VIEW: VEHICLE DRIVING IN MIDDLE OF ROAD PASS", color=ACCENT_CYAN, fontsize=14, fontweight='bold', pad=12)
ax1.set_xlim(-12, 12)
ax1.set_ylim(0, 14)
ax1.axis('off')

# Sky Gradient (Golden hour late afternoon 17:45)
sky_y = np.linspace(5, 14, 50)
for sy in sky_y:
    t = (sy - 5) / 9.0
    r = (1 - t) * 0.9 + t * 0.22
    g = (1 - t) * 0.65 + t * 0.32
    b = (1 - t) * 0.45 + t * 0.48
    ax1.axhspan(sy, sy + 0.2, color=(r, g, b), alpha=0.9, zorder=1)

# Low Sun Disk (22° altitude)
sun_circle = patches.Circle((-3.5, 9.2), radius=1.4, facecolor='#FFF8E7', edgecolor='#FFD79E', linewidth=3, alpha=0.95, zorder=2)
ax1.add_patch(sun_circle)

# Mountain Silhouettes Flanking the Road (North Ridge on Left, South Massif on Right)
# Left Mountain Slope
mount_l_x = [-12, -12, -8, -5, -2, -12]
mount_l_y = [5, 11, 10, 7.5, 5, 5]
ax1.fill(mount_l_x, mount_l_y, color='#2B3D54', zorder=3)

# Right Mountain Slope
mount_r_x = [12, 12, 8, 5, 2, 12]
mount_r_y = [5, 10.5, 9.8, 7.2, 5, 5]
ax1.fill(mount_r_x, mount_r_y, color='#243347', zorder=3)

# Mediterranean Cypress Trees along the Hillside
for cx, cy, ch in [(-8.5, 7.2, 2.2), (-6.2, 6.0, 1.8), (-4.5, 5.4, 1.5), (5.5, 5.5, 1.6), (7.8, 6.5, 2.0)]:
    trunk = patches.Rectangle((cx - 0.05, cy), 0.1, ch * 0.25, facecolor='#3A281A', zorder=4)
    cone = patches.Polygon([[cx - 0.35, cy + ch * 0.2], [cx + 0.35, cy + ch * 0.2], [cx, cy + ch]], facecolor='#1E3622', zorder=4)
    ax1.add_patch(trunk)
    ax1.add_patch(cone)

# Ground and Vanishing Road Perspective
road_poly = patches.Polygon([[-1.2, 5.0], [1.2, 5.0], [7.5, 0], [-7.5, 0]], facecolor='#6E5A47', edgecolor='#8C735B', linewidth=1.5, zorder=5)
ax1.add_patch(road_poly)

# Natural Verge Slopes (Terracotta Earth)
verge_l = patches.Polygon([[-7.5, 0], [-1.2, 5.0], [-12, 5.0], [-12, 0]], facecolor='#824E36', zorder=4)
verge_r = patches.Polygon([[7.5, 0], [1.2, 5.0], [12, 5.0], [12, 0]], facecolor='#824E36', zorder=4)
ax1.add_patch(verge_l)
ax1.add_patch(verge_r)

# Road Tire Wear Ruts (twin dark grooves down the center of the road)
ax1.plot([-0.45, -2.8], [5.0, 0], color='#4A3B2E', linewidth=3.5, alpha=0.7, zorder=6)
ax1.plot([0.45, 2.8], [5.0, 0], color='#4A3B2E', linewidth=3.5, alpha=0.7, zorder=6)

# The Group B Rally Car (Centered in the Middle of Road Deck)
# Chassis Body
car_x, car_y = 0.0, 1.8
car_body = patches.Rectangle((car_x - 1.8, car_y), 3.6, 1.35, facecolor=ACCENT_ORANGE, edgecolor='#FFFFFF', linewidth=2.0, zorder=8)
ax1.add_patch(car_body)

# Cabin & Rear Window
car_cabin = patches.Polygon([[car_x - 1.35, car_y + 1.35], [car_x + 1.35, car_y + 1.35], [car_x + 1.1, car_y + 2.3], [car_x - 1.1, car_y + 2.3]],
                            facecolor='#112233', edgecolor='#888888', linewidth=1.5, zorder=9)
ax1.add_patch(car_cabin)

# Group B Rear Downforce Wing
ax1.fill([car_x - 1.9, car_x + 1.9, car_x + 1.9, car_x - 1.9], [car_y + 2.45, car_y + 2.45, car_y + 2.3, car_y + 2.3], color='#111111', zorder=10)

# Twin Red Taillights
ax1.add_patch(patches.Rectangle((car_x - 1.6, car_y + 0.65), 0.55, 0.3, facecolor='#FF1100', zorder=10))
ax1.add_patch(patches.Rectangle((car_x + 1.05, car_y + 0.65), 0.55, 0.3, facecolor='#FF1100', zorder=10))

# Wide Rally Tires
ax1.add_patch(patches.Rectangle((car_x - 1.95, car_y - 0.4), 0.7, 0.9, facecolor='#151515', zorder=7))
ax1.add_patch(patches.Rectangle((car_x + 1.25, car_y - 0.4), 0.7, 0.9, facecolor='#151515', zorder=7))

# Volumetric Golden Dust Trail hanging in the air
for dx, dy, dr in [(-1.5, 0.8, 1.2), (1.5, 0.9, 1.3), (-2.8, 1.8, 1.8), (2.5, 2.0, 1.9), (0.0, 2.5, 2.2)]:
    dust = patches.Circle((dx, dy), radius=dr, facecolor='#D8A66C', alpha=0.35, zorder=6)
    ax1.add_patch(dust)

ax1.text(0, 0.35, "CORRIDOR CLEARANCE: OPEN SKY ABOVE • NO TERRAIN OVERHANGS", 
         color='#FFFFFF', fontsize=9.5, fontweight='bold', ha='center', bbox=dict(boxstyle='round,pad=0.4', facecolor='#0B1526', edgecolor=ACCENT_CYAN, alpha=0.9))

# ==============================================================================
# PANEL 2: VEHICLE TURNING / POWER-SLIDING IN BANKED HAIRPIN
# ==============================================================================
ax2 = fig.add_subplot(gs[0, 1], facecolor='#0D1B2E')
ax2.set_title("2. REFERENCE VIEW: VEHICLE TURNING IN BANKED HAIRPIN (DRIFT & ROOST)", color=ACCENT_CYAN, fontsize=14, fontweight='bold', pad=12)
ax2.set_xlim(-10, 10)
ax2.set_ylim(-2, 14)
ax2.axis('off')

# Banked Hairpin Road Curve (Right 180° turn with inward camber banking)
arc_theta = np.linspace(np.pi * 0.1, np.pi * 0.95, 100)
rad_outer = 9.0
rad_inner = 3.5

outer_x = rad_outer * np.cos(arc_theta)
outer_y = rad_outer * np.sin(arc_theta)
inner_x = rad_inner * np.cos(arc_theta)
inner_y = rad_inner * np.sin(arc_theta)

hairpin_poly = patches.Polygon(np.concatenate([np.column_stack([outer_x, outer_y]), np.column_stack([inner_x[::-1], inner_y[::-1]])]),
                               facecolor='#706050', edgecolor='#8A7562', linewidth=2.0, zorder=2)
ax2.add_patch(hairpin_poly)

# Red & White Apex Kerb along inner apex
for i in range(12):
    t0 = np.pi * 0.35 + i * 0.045
    t1 = t0 + 0.045
    col = '#E62211' if i % 2 == 0 else '#FFFFFF'
    kx = [3.5 * np.cos(t0), 3.9 * np.cos(t0), 3.9 * np.cos(t1), 3.5 * np.cos(t1)]
    ky = [3.5 * np.sin(t0), 3.9 * np.sin(t0), 3.9 * np.sin(t1), 3.5 * np.sin(t1)]
    ax2.fill(kx, ky, color=col, zorder=4)

# Ribbon Skid Mark Decals on Road Surface
skid_theta = np.linspace(np.pi * 0.3, np.pi * 0.65, 50)
ax2.plot(5.8 * np.cos(skid_theta), 5.8 * np.sin(skid_theta) + 0.2, color='#1A1715', linewidth=4.0, alpha=0.85, zorder=3)
ax2.plot(6.7 * np.cos(skid_theta), 6.7 * np.sin(skid_theta) + 0.2, color='#1A1715', linewidth=4.0, alpha=0.85, zorder=3)

# The Drifting Rally Car (Angled in dynamic countersteer)
car_drift_center = (-0.5, 6.2)
angle_deg = 24.0  # Drift yaw angle
t_rot = patches.Affine2D().rotate_deg_around(car_drift_center[0], car_drift_center[1], angle_deg) + ax2.transData

car_d_body = patches.Rectangle((car_drift_center[0] - 1.8, car_drift_center[1] - 0.7), 3.6, 1.4,
                               facecolor=ACCENT_ORANGE, edgecolor='#FFFFFF', linewidth=1.8, transform=t_rot, zorder=6)
ax2.add_patch(car_d_body)

# Halogen Yellow Headlights illuminating apex
ax2.add_patch(patches.Circle((car_drift_center[0] + 1.8, car_drift_center[1] + 0.4), radius=0.25, facecolor='#FFE655', transform=t_rot, zorder=7))
ax2.add_patch(patches.Circle((car_drift_center[0] + 1.8, car_drift_center[1] - 0.4), radius=0.25, facecolor='#FFE655', transform=t_rot, zorder=7))

# Tier 1 Gravel Roost Ejection (Pebble Scatter)
for p in range(65):
    px = car_drift_center[0] - 2.2 - np.random.rand() * 4.5
    py = car_drift_center[1] - 1.5 + (np.random.rand() - 0.5) * 3.2
    ax2.scatter(px, py, color='#E0D4C3', s=np.random.rand() * 25 + 5, zorder=8)

# Tier 2 Volumetric Soft Dust Plumes & Tire Smoke
for s in range(16):
    sx = car_drift_center[0] - 1.8 - np.random.rand() * 5.0
    sy = car_drift_center[1] - 1.0 + (np.random.rand() - 0.5) * 4.0
    s_rad = 1.0 + np.random.rand() * 1.8
    dust_puff = patches.Circle((sx, sy), radius=s_rad, facecolor='#E0B078', alpha=0.28, zorder=7)
    ax2.add_patch(dust_puff)

# Tire White Smoke Cloud
for w in range(8):
    wx = car_drift_center[0] - 1.2 - np.random.rand() * 2.5
    wy = car_drift_center[1] + (np.random.rand() - 0.5) * 2.0
    smoke = patches.Circle((wx, wy), radius=0.8 + np.random.rand() * 1.0, facecolor='#E8EAED', alpha=0.35, zorder=8)
    ax2.add_patch(smoke)

# Corner Warning Chevron Indicator Arrow Board
ax2.add_patch(patches.Rectangle((4.5, 8.8), 2.2, 1.1, facecolor='#F5C800', edgecolor='#111111', linewidth=1.5, zorder=5))
ax2.text(5.6, 9.35, ">> >>", color='#111111', fontsize=14, fontweight='bold', ha='center', va='center', zorder=6)

ax2.text(0, -1.0, "DYNAMIC DRIFT: COUNTERSTEER • POSITIVE CAMBER BANKING • PEBBLE ROOST & TIRE SMOKE",
         color='#FFFFFF', fontsize=9.5, fontweight='bold', ha='center', bbox=dict(boxstyle='round,pad=0.4', facecolor='#0B1526', edgecolor=ACCENT_CYAN, alpha=0.9))

# ==============================================================================
# PANEL 3: OVERALL TOP VIEW OF THE MAP & COMPLETE STAGE JOURNEY (2.4 km)
# ==============================================================================
ax3 = fig.add_subplot(gs[1, :], facecolor='#0D1B2E')
ax3.set_title("3. OVERALL TOP VIEW OF MAP & COMPLETE STAGE JOURNEY (2.4 km CONTINUOUS RALLY RUN)", color=ACCENT_CYAN, fontsize=14, fontweight='bold', pad=12)
ax3.set_xlim(-750, 750)
ax3.set_ylim(-700, 700)
ax3.set_xlabel("East-West Dimension X (meters)", color=TEXT_MUTED, fontsize=10)
ax3.set_ylabel("North-South Dimension Z (meters)", color=TEXT_MUTED, fontsize=10)
ax3.tick_params(colors=TEXT_MUTED, labelsize=8.5)
ax3.grid(True, color=LINE_GRID, linestyle='-', linewidth=0.7)

# Background Mountain Massifs
ax3.add_patch(patches.Rectangle((-750, -700), 1500, 420, facecolor='#12253D', alpha=0.6))
ax3.text(0, -480, "▲ NORTH LIMESTONE MOUNTAIN RIDGE (ELEVATION UP TO +135m) ▲", color='#4A6F96', fontsize=11, fontweight='bold', ha='center')

ax3.add_patch(patches.Rectangle((-750, 280), 1500, 420, facecolor='#12253D', alpha=0.6))
ax3.text(0, 480, "▲ SOUTH TERRACOTTA HILLSIDE MASSIF (ELEVATION UP TO +110m) ▲", color='#4A6F96', fontsize=11, fontweight='bold', ha='center')

# Central Carved Valley Corridor
ax3.text(0, -20, "◄ NATURAL OPEN VALLEY PASS (NO OVERHANGING MOUNTAINS) ►", color='#234B73', fontsize=10, fontweight='bold', ha='center')

# Spline Data
knots = [
    (-658, -616), (-595, -563), (-510, -520), (-435, -457), (-372, -382),
    (-414, -319), (-382, -234), (-319, -170), (-234, -127), (-149, -159),
    (-85, -96), (0, -32), (85, 42), (149, 117), (223, 181),
    (170, 255), (96, 319), (11, 382), (-74, 446), (-21, 520),
    (74, 574), (181, 605), (287, 563), (382, 499), (467, 435)
]
kx, kz = zip(*knots)
tck, _ = splprep([kx, kz], s=0, k=3)
u_vals = np.linspace(0, 1, 500)
sx, sz = splev(u_vals, tck)

# 22m Mountain Verge Buffer Corridor
ax3.plot(sx, sz, color='#1A446E', linewidth=18, alpha=0.4, label='Mountain Verge Corridor (22m Width)')

# Plot Journey Track Segments
# Zone 1 (0-600m)
ax3.plot(sx[:125], sz[:125], color='#FFFFFF', linewidth=5.0, label='Zone 1 (0-600m): Asphalt (μ=1.05)')
# Zone 2 (600-1800m)
ax3.plot(sx[123:375], sz[123:375], color=ACCENT_ORANGE, linewidth=5.0, label='Zone 2 (600-1800m): Packed Gravel (μ=0.72)')
# Zone 3 (1800-2405m)
ax3.plot(sx[373:], sz[373:], color=ACCENT_GOLD, linewidth=5.0, label='Zone 3 (1800-2405m): Mountain Scree (μ=0.65)')

# Milestones & Checkpoints along the Journey
milestones = [
    (-658, -616, "KM 0.0 - START GANTRY (Elev +12m)", '#00FF88'),
    (-372, -382, "KM 0.4 - HAIRPIN 1 (Castelnuovo 180°)", '#00F0FF'),
    (-319, -170, "KM 0.6 - SPLIT 1 (Gravel Transition)", '#FF6B22'),
    (-149, -159, "KM 1.1 - HAIRPIN 2 (Cliffside Drop)", '#00F0FF'),
    (0, -32, "KM 1.4 - MOUNTAIN PASS SUMMIT (Elev +108m)", '#FFD700'),
    (149, 117, "KM 1.6 - AQUEDUCT VIADUCT BRIDGE CROSSING", '#00F0FF'),
    (96, 319, "KM 1.8 - SPLIT 2 (Mud Puddle Splash)", '#00F0FF'),
    (-74, 446, "KM 2.0 - HAIRPIN 4 (Torrente Secco & Scree)", '#00F0FF'),
    (287, 563, "KM 2.2 - JUMP 2 (Cresta del Diavolo Takeoff)", '#FF3366'),
    (467, 435, "KM 2.4 - FLYING FINISH TIMING ARCH (Elev +96m)", '#00FF88')
]

for mx, mz, mlabel, mcol in milestones:
    ax3.scatter(mx, mz, color=mcol, s=85, edgecolor='#FFFFFF', linewidth=1.5, zorder=6)
    offset_x = 25 if mx > 0 else -25
    offset_z = 25 if mz > 0 else -25
    ha_val = 'left' if offset_x > 0 else 'right'
    ax3.annotate(mlabel, (mx, mz), xytext=(mx + offset_x, mz + offset_z),
                 color=TEXT_LIGHT, fontsize=8.5, fontweight='bold', ha=ha_val,
                 bbox=dict(boxstyle='round,pad=0.25', facecolor='#0D1B2E', edgecolor=mcol, alpha=0.9),
                 arrowprops=dict(arrowstyle="->", color=mcol, lw=1.2))

# Direction of Travel Arrows along Stage
for u_step in [0.08, 0.22, 0.42, 0.62, 0.82]:
    ax_x, ax_z = splev(u_step, tck)
    ax_nx, ax_nz = splev(u_step + 0.02, tck)
    dx = ax_nx - ax_x
    dz = ax_nz - ax_z
    length = np.sqrt(dx*dx + dz*dz)
    if length > 0:
        ax3.arrow(ax_x, ax_z, (dx/length)*22, (dz/length)*22, head_width=18, head_length=15, fc='#00FFCC', ec='#FFFFFF', zorder=7)

ax3.legend(loc='lower left', facecolor='#0D1B2E', edgecolor=LINE_GRID, fontsize=9, labelcolor=TEXT_LIGHT)

# Save high-resolution storyboard
out_brain = r"C:\Users\Chinmaygouda\.gemini\antigravity\brain\64af6e27-64eb-45c1-8d95-50bd0eb0b905\rally_journey_visual_storyboard.png"
out_workspace = r"d:\carrr\enviroment\docs\rally_journey_visual_storyboard.png"

plt.savefig(out_brain, dpi=200, bbox_inches='tight', facecolor=fig.get_facecolor(), edgecolor='none')
plt.savefig(out_workspace, dpi=200, bbox_inches='tight', facecolor=fig.get_facecolor(), edgecolor='none')
print(f"Journey visual storyboard generated successfully:\n- {out_brain}\n- {out_workspace}")
