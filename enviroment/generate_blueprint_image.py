import os
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.gridspec import GridSpec

# Set up technical blueprint aesthetics
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'Helvetica']

fig = plt.figure(figsize=(24, 15), facecolor='#0B1526')
gs = GridSpec(2, 2, width_ratios=[1.35, 1.0], height_ratios=[1.25, 0.75], wspace=0.18, hspace=0.25)

# Color Palette (Classic Engineering Technical Blueprint)
BG_COLOR = '#0B1526'
PANEL_BG = '#0F1E36'
GRID_MAJOR = '#1E3A5F'
GRID_MINOR = '#142742'
CYAN_MAIN = '#00F0FF'
ORANGE_ACC = '#FF6B22'
YELLOW_WARN = '#FFD000'
GREEN_ZONE = '#00FF88'
TEXT_WHITE = '#E0F0FF'
TEXT_MUTED = '#7A99B8'

# ==============================================================================
# PANEL 1: TOPOGRAPHIC PLAN VIEW (1,500m x 1,500m)
# ==============================================================================
ax_plan = fig.add_subplot(gs[0, :], facecolor=PANEL_BG)
ax_plan.set_title("APEX RALLY – TOPOGRAPHIC PLAN VIEW & TRACK CORRIDORS (1,500m × 1,500m)", 
                  color=CYAN_MAIN, fontsize=16, fontweight='bold', pad=15)

# Terrain Grids ([-750, 750])
ax_plan.set_xlim(-750, 750)
ax_plan.set_ylim(-750, 750)
ax_plan.set_xlabel("World Coordinates X (meters)", color=TEXT_MUTED, fontsize=11)
ax_plan.set_ylabel("World Coordinates Z (meters)", color=TEXT_MUTED, fontsize=11)
ax_plan.tick_params(colors=TEXT_MUTED, labelsize=9)

# Grid lines
ax_plan.grid(True, which='major', color=GRID_MAJOR, linestyle='-', linewidth=0.8, alpha=0.8)
ax_plan.minorticks_on()
ax_plan.grid(True, which='minor', color=GRID_MINOR, linestyle=':', linewidth=0.5, alpha=0.6)

# Mountain Massifs Shading
# North Mountain Ridge (Z < -220)
north_ridge = patches.Rectangle((-750, -750), 1500, 500, facecolor='#162B4D', alpha=0.5, edgecolor=GRID_MAJOR, linestyle='--')
ax_plan.add_patch(north_ridge)
ax_plan.text(0, -500, "▲ NORTH MOUNTAIN RIDGE (ELEVATION +90m TO +135m LIMESTONE CLIFFS) ▲", 
             color='#587CA8', fontsize=12, fontweight='bold', ha='center', va='center')

# South Hillside Massif (Z > +250)
south_massif = patches.Rectangle((-750, 250), 1500, 500, facecolor='#162B4D', alpha=0.5, edgecolor=GRID_MAJOR, linestyle='--')
ax_plan.add_patch(south_massif)
ax_plan.text(0, 500, "▲ SOUTH HILLSIDE MASSIF (ELEVATION +70m TO +110m TERRACOTTA TERRACES) ▲", 
             color='#587CA8', fontsize=12, fontweight='bold', ha='center', va='center')

# Central Valley Basin
ax_plan.text(0, 0, "◄ CENTRAL VALLEY PASS CORRIDOR (ROAD BED CARVED BETWEEN MASSES) ►", 
             color='#294D73', fontsize=11, fontweight='bold', ha='center', va='center')

# Special Stage Knots (K00 to K24)
knots = [
    (-658, -616, "K00 Start Gantry (+12m)"),
    (-595, -563, "K01 Fast Right"),
    (-510, -520, "K02 Sweeper Left"),
    (-435, -457, "K03 Farm Approach"),
    (-372, -382, "K04 Hairpin 1 (Castelnuovo 180°, +7.5° bank)"),
    (-414, -319, "K05 Climb"),
    (-382, -234, "K06 Blind Crest 1"),
    (-319, -170, "K07 Zone 2: Packed Gravel"),
    (-234, -127, "K08 Forest Straight"),
    (-149, -159, "K09 Hairpin 2 (Roccia Alta 180°, +8° bank)"),
    (-85, -96, "K10 Ridge Ascent"),
    (0, -32, "K11 Mountain Pass Summit (+108m)"),
    (85, 42, "K12 Blind Crest 2 & Jump 1 (Viadotto)"),
    (149, 117, "K13 Aqueduct Bridge Crossing"),
    (223, 181, "K14 Hairpin 3 (Pino Solitario)"),
    (170, 255, "K15 Pine Forest Descent"),
    (96, 319, "K16 Mud Puddle 1"),
    (11, 382, "K17 Blind Crest 3"),
    (-74, 446, "K18 Hairpin 4 & Puddle 2 (Torrente Secco)"),
    (-21, 520, "K19 Zone 3: Mountain Scree"),
    (74, 574, "K20 Hillclimb"),
    (181, 605, "K21 Fast Sweeper"),
    (287, 563, "K22 Jump 2 (Cresta del Diavolo)"),
    (382, 499, "K23 Castle Approach"),
    (467, 435, "K24 Finish Arch (+96m)")
]

kx = [k[0] for k in knots]
kz = [k[1] for k in knots]

# Smooth Spline Curve through knots
from scipy.interpolate import splprep, splev
tck, u = splprep([kx, kz], s=0, k=3)
u_fine = np.linspace(0, 1, 600)
x_fine, z_fine = splev(u_fine, tck)

# Draw Road Verge Clearing Buffer (22m width)
ax_plan.plot(x_fine, z_fine, color='#1A4778', linewidth=16, alpha=0.4, label='Mountain Verge Clearing (22m Corridor)')

# Draw Special Stage Road Centerline by Friction Zones
# Zone 1 (0 - 600m): Asphalt (indices 0 to 150)
ax_plan.plot(x_fine[:150], z_fine[:150], color='#FFFFFF', linewidth=4.5, label='Zone 1: Sun-faded Asphalt (μ = 1.05)')
# Zone 2 (600 - 1800m): Gravel (indices 148 to 445)
ax_plan.plot(x_fine[148:445], z_fine[148:445], color=ORANGE_ACC, linewidth=4.5, label='Zone 2: Packed Coarse Gravel (μ = 0.72)')
# Zone 3 (1800 - 2405m): Scree (indices 443:)
ax_plan.plot(x_fine[443:], z_fine[443:], color=YELLOW_WARN, linewidth=4.5, label='Zone 3: Loose Scree over Bedrock (μ = 0.65)')

# Rallycross Closed Loop Circuit (1.2 km)
rx_knots = [
    (-200, -135), (-67, -135), (67, -120), (160, -54), (188, 54),
    (107, 147), (13, 174), (-80, 160), (-174, 94), (-241, 0), (-228, -80), (-200, -135)
]
rx_x, rx_z = zip(*rx_knots)
rx_tck, _ = splprep([rx_x, rx_z], s=0, k=3, per=True)
rx_fine_x, rx_fine_z = splev(np.linspace(0, 1, 300), rx_tck)
ax_plan.plot(rx_fine_x, rx_fine_z, color=GREEN_ZONE, linewidth=3.2, linestyle='--', label='Rallycross Circuit (1.2 km Closed Loop)')

# Joker Lap Route
joker_knots = [(-174, 94), (-250, 130), (-320, 65), (-310, -25), (-228, -80)]
jk_x, jk_z = zip(*joker_knots)
jk_tck, _ = splprep([jk_x, jk_z], s=0, k=3)
jk_fine_x, jk_fine_z = splev(np.linspace(0, 1, 150), jk_tck)
ax_plan.plot(jk_fine_x, jk_fine_z, color='#FF3366', linewidth=2.8, linestyle=':', label='Joker Lap Alternate (+2.8s Penalty)')

# Annotate Key Features & Hairpins
features = [
    (-658, -616, "START GANTRY (K00)", 10, -25),
    (-372, -382, "HAIRPIN 1 (Bank +7.5°)", -160, 15),
    (-149, -159, "HAIRPIN 2 (Cliff Drop, Bank +8°)", -180, -20),
    (0, -32, "SUMMIT PASS (Elev +108m)", 15, 20),
    (149, 117, "VIADOTTO AQUEDUCT BRIDGE", 20, -20),
    (223, 181, "HAIRPIN 3 (Pino Solitario)", 25, 15),
    (96, 319, "MUD PUDDLE 1 (Water Splash)", 20, -15),
    (-74, 446, "HAIRPIN 4 (Torrente Secco)", -160, 20),
    (287, 563, "JUMP 2 (Cresta del Diavolo)", 20, 20),
    (467, 435, "FINISH TIMING ARCH (K24)", 20, -20),
    (13, 174, "RX SPECTATOR TABLETOP JUMP", -140, 25),
]

for fx, fz, label, ox, oz in features:
    ax_plan.scatter(fx, fz, color=CYAN_MAIN, s=60, zorder=5, edgecolor='#FFFFFF', linewidth=1.2)
    ax_plan.annotate(label, (fx, fz), xytext=(fx + ox, fz + oz),
                     color=TEXT_WHITE, fontsize=8.5, fontweight='bold',
                     arrowprops=dict(arrowstyle="->", color=CYAN_MAIN, lw=1.0))

# Pastures (Wildlife Zones)
ax_plan.scatter([-475, 175], [-480, 230], color='#FFAA00', marker='s', s=80, label='Articulated Wildlife Pastures (Cows / Deer)')

# Legend
ax_plan.legend(loc='lower left', facecolor='#0D1B30', edgecolor=GRID_MAJOR, fontsize=9, labelcolor=TEXT_WHITE)

# ==============================================================================
# PANEL 2: ROAD CORRIDOR CLEARANCE & FOUNDATION CROSS-SECTION
# ==============================================================================
ax_sec = fig.add_subplot(gs[1, 0], facecolor=PANEL_BG)
ax_sec.set_title("ROAD CORRIDOR CLEARANCE & NEGATIVE FOUNDATION CARVING", color=CYAN_MAIN, fontsize=13, fontweight='bold', pad=10)
ax_sec.set_xlim(-35, 35)
ax_sec.set_ylim(-4, 18)
ax_sec.set_xlabel("Lateral Distance from Spline Centerline (meters)", color=TEXT_MUTED, fontsize=10)
ax_sec.set_ylabel("Relative Elevation (meters)", color=TEXT_MUTED, fontsize=10)
ax_sec.tick_params(colors=TEXT_MUTED, labelsize=8)
ax_sec.grid(True, color=GRID_MAJOR, linestyle='-', linewidth=0.6, alpha=0.7)

# Ground cross section
lat_x = np.linspace(-35, 35, 200)
# Terrain height profile with carved road foundation
half_w = 3.5
verge_w = 22.0
terrain_y = []
for lx in lat_x:
    dist = abs(lx)
    if dist <= half_w:
        y = -0.25 # 25cm below road deck
    elif dist < half_w + verge_w:
        t = (dist - half_w) / verge_w
        smooth = 3*t*t - 2*t*t*t
        y = (1.0 - smooth) * (-0.25) + smooth * (0.018 * dist**2)
    else:
        y = 0.018 * dist**2 + (dist - half_w - verge_w) * 0.45
    terrain_y.append(y)

# Plot Mountain Flanks & Carved Verge
ax_sec.fill_between(lat_x, -4, terrain_y, color='#1A3354', alpha=0.7, edgecolor=CYAN_MAIN, linewidth=1.5, label='Terrain Foundation Bed (Rapier TriMesh)')

# Road Deck (+0.0m elevated on foundation bed)
road_deck_x = np.linspace(-half_w, half_w, 40)
ax_sec.fill_between(road_deck_x, -0.25, 0.0, color='#857A6B', edgecolor='#FFD000', linewidth=2.0, label='Extruded Road Deck (5.5m - 8.0m Width)')

# Vehicle Silhouette
car_w = 1.85
car_h = 1.3
car_rect = patches.Rectangle((-car_w/2, 0.0), car_w, car_h, facecolor=ORANGE_ACC, edgecolor='#FFFFFF', linewidth=1.5)
ax_sec.add_patch(car_rect)
ax_sec.text(0, car_h/2, "1980s Rally Car\n(Clear Sky Above)", color='#FFFFFF', fontsize=8, fontweight='bold', ha='center', va='center')

# Clearance Dimension Annotations
ax_sec.annotate("Mountain Verge Clearing\n(22m Setback)", xy=(-14, 2.5), xytext=(-26, 7.5),
                color=CYAN_MAIN, fontsize=8.5, fontweight='bold',
                arrowprops=dict(arrowstyle="->", color=CYAN_MAIN))
ax_sec.annotate("Foundation Bed\n(Y_terrain = Y_road - 0.25m)", xy=(0, -0.25), xytext=(8, -2.5),
                color='#FFD000', fontsize=8.5, fontweight='bold',
                arrowprops=dict(arrowstyle="->", color='#FFD000'))

ax_sec.legend(loc='upper right', facecolor='#0D1B30', edgecolor=GRID_MAJOR, fontsize=8, labelcolor=TEXT_WHITE)

# ==============================================================================
# PANEL 3: ELEVATION PROFILE & SURFACE FRICTION TRANSITION (2.4 km)
# ==============================================================================
ax_elev = fig.add_subplot(gs[1, 1], facecolor=PANEL_BG)
ax_elev.set_title("SPECIAL STAGE ELEVATION PROFILE & SURFACE FRICTION ZONES (2.4 km)", color=CYAN_MAIN, fontsize=13, fontweight='bold', pad=10)
ax_elev.set_xlim(0, 2405)
ax_elev.set_ylim(0, 130)
ax_elev.set_xlabel("Stage Distance (meters)", color=TEXT_MUTED, fontsize=10)
ax_elev.set_ylabel("Elevation Y (meters)", color=TEXT_MUTED, fontsize=10)
ax_elev.tick_params(colors=TEXT_MUTED, labelsize=8)
ax_elev.grid(True, color=GRID_MAJOR, linestyle='-', linewidth=0.6, alpha=0.7)

# Knot stage distances and heights
stage_s = np.linspace(0, 2405, 300)
# Synthetic profile matching our 25 knots
elev_profile = (
    12.0 + 
    38.0 * (stage_s / 600.0) * (stage_s < 600) +
    (50.0 + 58.0 * np.sin((stage_s - 600) / 1200 * np.pi)) * ((stage_s >= 600) & (stage_s < 1800)) +
    (28.0 + 68.0 * ((stage_s - 1800) / 605.0)**0.8) * (stage_s >= 1800)
)

# Plot Elevation Line with Friction Fill
# Zone 1 (0-600m)
mask1 = stage_s <= 600
ax_elev.fill_between(stage_s[mask1], 0, elev_profile[mask1], color='#FFFFFF', alpha=0.25, label='Zone 1: Asphalt (μ=1.05)')
ax_elev.plot(stage_s[mask1], elev_profile[mask1], color='#FFFFFF', linewidth=2.5)

# Zone 2 (600-1800m)
mask2 = (stage_s >= 595) & (stage_s <= 1805)
ax_elev.fill_between(stage_s[mask2], 0, elev_profile[mask2], color=ORANGE_ACC, alpha=0.25, label='Zone 2: Gravel (μ=0.72)')
ax_elev.plot(stage_s[mask2], elev_profile[mask2], color=ORANGE_ACC, linewidth=2.5)

# Zone 3 (1800-2405m)
mask3 = stage_s >= 1800
ax_elev.fill_between(stage_s[mask3], 0, elev_profile[mask3], color=YELLOW_WARN, alpha=0.25, label='Zone 3: Scree (μ=0.65)')
ax_elev.plot(stage_s[mask3], elev_profile[mask3], color=YELLOW_WARN, linewidth=2.5)

# Callout Key Vertical Events
ax_elev.scatter([0, 890, 1150, 1720, 2405], [12, 87, 108, 28, 96], color=CYAN_MAIN, s=50, zorder=5)
ax_elev.annotate("Start (+12m)", xy=(0, 12), xytext=(40, 28), color=TEXT_WHITE, fontsize=8, arrowprops=dict(arrowstyle="->", color=CYAN_MAIN))
ax_elev.annotate("Summit Pass (+108m)", xy=(1150, 108), xytext=(1020, 118), color=TEXT_WHITE, fontsize=8, fontweight='bold', arrowprops=dict(arrowstyle="->", color=CYAN_MAIN))
ax_elev.annotate("Gully Basin (+28m)", xy=(1720, 28), xytext=(1620, 45), color=TEXT_WHITE, fontsize=8, arrowprops=dict(arrowstyle="->", color=CYAN_MAIN))
ax_elev.annotate("Flying Finish (+96m)", xy=(2405, 96), xytext=(2050, 80), color=TEXT_WHITE, fontsize=8, arrowprops=dict(arrowstyle="->", color=CYAN_MAIN))

ax_elev.legend(loc='lower right', facecolor='#0D1B30', edgecolor=GRID_MAJOR, fontsize=8, labelcolor=TEXT_WHITE)

# ==============================================================================
# TITLE BLOCK (Engineering Blueprint Header)
# ==============================================================================
title_box = patches.Rectangle((-740, -735), 440, 110, facecolor='#0D1B30', edgecolor=CYAN_MAIN, linewidth=1.5, zorder=10)
ax_plan.add_patch(title_box)
ax_plan.text(-720, -645, "APEX RALLY – ENVIRONMENT & TRACK BLUEPRINT", color=CYAN_MAIN, fontsize=10, fontweight='bold', zorder=11)
ax_plan.text(-720, -675, "SETTING: Mediterranean Mountain Pass (Sanremo / Portugal)", color=TEXT_WHITE, fontsize=8, zorder=11)
ax_plan.text(-720, -700, "SCALE: 1,500m × 1,500m Continuous Grid • Elev Relief: 140m", color=TEXT_MUTED, fontsize=7.5, zorder=11)
ax_plan.text(-720, -720, "STAGE LENGTH: 2.40 km Special Stage • 1.20 km Rallycross", color='#00FF88', fontsize=7.5, fontweight='bold', zorder=11)

# Save Blueprint Images
out_brain = r"C:\Users\Chinmaygouda\.gemini\antigravity\brain\64af6e27-64eb-45c1-8d95-50bd0eb0b905\apex_rally_environment_blueprint.png"
out_workspace = r"d:\carrr\enviroment\docs\apex_rally_environment_blueprint.png"

plt.savefig(out_brain, dpi=200, bbox_inches='tight', facecolor=fig.get_facecolor(), edgecolor='none')
plt.savefig(out_workspace, dpi=200, bbox_inches='tight', facecolor=fig.get_facecolor(), edgecolor='none')
print(f"Blueprint image successfully generated:\n- {out_brain}\n- {out_workspace}")
