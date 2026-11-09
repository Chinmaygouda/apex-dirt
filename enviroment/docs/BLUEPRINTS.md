# APEX RALLY: ENVIRONMENT, DYNAMIC TRACK & VFX WORLD ENGINE
## Architectural Blueprints, Technical Specifications & Mathematical Models

---

## 1. WORLD THEME, SCALE & TERRAIN ARCHITECTURE

### 1.1 Geographic & Atmospheric Setting
- **Location**: Mediterranean / Southern European Hillside (inspired by Rally Sanremo & Rally de Portugal).
- **Sun & Solar Position**: Golden hour late afternoon (17:45), solar elevation $\theta_{sun} = 22^\circ$, azimuth $\phi_{sun} = 235^\circ$ (South-West).
- **Color Palette**:
  - Sky Zenith: `#385273` (Deep alpine blue)
  - Sky Horizon / Twilight Glow: `#E8A87C` (Warm golden peach)
  - Sun Direct Illumination: `#FFF3D6` (Golden warm sunlight, intensity = 3.2)
  - Ambient / Fill Haze: `#8A6B53` (Warm terracotta dust backscatter)
  - Terrain Terracotta Earth: `#8C5338` (Sun-baked Tuscan clay)
  - Packed Gravel Road: `#857A6B` (Worn limestone and basalt gravel)
  - Asphalt Road: `#3D3B3A` (Weathered sun-faded bituminous macadam)
  - Sage Roadside Verge: `#6B7853` (Semi-arid Mediterranean scrub grass)

### 1.2 World Scale & Coordinate System
- **Spatial Bounds**: $X \in [-750\,\text{m}, +750\,\text{m}]$, $Z \in [-750\,\text{m}, +750\,\text{m}]$ (continuous $1,500\,\text{m} \times 1,500\,\text{m}$ area).
- **Elevation Span**: $Y \in [0\,\text{m}, 140\,\text{m}]$ ($140\,\text{m}$ vertical relief).
- **Heightfield Resolution**: $256 \times 256$ grid points ($5.88\,\text{m}$ spatial vertex pitch), with adaptive bicubic / bilinear interpolation for physics contact and procedural road verges.

### 1.3 Procedural Terrain Mathematical Formulation
The continuous elevation $H(x, z)$ combines multi-octave Simplex noise with directional ridge folding, dry riverbed carving, and road bed grading:

$$H(x, z) = H_{\text{macro}}(x, z) + H_{\text{ridge}}(x, z) + H_{\text{micro}}(x, z) - D_{\text{gully}}(x, z)$$

#### A. Macro Elevation (Mountain Massif & Valley Floor)
$$H_{\text{macro}}(x, z) = 140 \cdot \left[ \frac{1 + \sin\left(\frac{x}{350} + 0.3\right) \cdot \cos\left(\frac{z}{400}\right)}{2} \right]^{1.4}$$

#### B. Ridges and Cliff Outcroppings (Erosion Ridges)
Using absolute noise inversion for sharp mountainous ridge lines:
$$N_{\text{ridge}}(x, z) = 1.0 - \left| \text{Simplex}\left(\frac{x}{180}, \frac{z}{180}\right) \right|$$
$$H_{\text{ridge}}(x, z) = 38.0 \cdot \left( N_{\text{ridge}}(x, z) \right)^{2.2}$$

#### C. Micro Terracing & Rolling Verges
$$H_{\text{micro}}(x, z) = 8.0 \cdot \text{Simplex}\left(\frac{x}{65}, \frac{z}{65}\right) + 2.5 \cdot \text{Simplex}\left(\frac{x}{20}, \frac{z}{20}\right)$$

#### D. Dry Riverbed Gully Carving
A dry river gully meanders through the valley basin:
$$z_{\text{gully}}(x) = 60 \cdot \sin\left(\frac{x}{120}\right) - 40$$
$$\text{dist}_{\text{gully}}(x, z) = \left| z - z_{\text{gully}}(x) \right|$$
$$D_{\text{gully}}(x, z) = 16.0 \cdot \exp\left( - \frac{\text{dist}_{\text{gully}}^2(x, z)}{2 \cdot 18.0^2} \right)$$

### 1.4 Road Corridor Flattening & Verge Blending
To prevent terrain from puncturing through the road surface, terrain height is softly blended with road centerlines:
$$\Delta d = \text{distanceToSplineCenterline}(x, z)$$
For road half-width $W_{\text{half}} = 4.0\,\text{m}$ and transition verge $W_{\text{verge}} = 7.0\,\text{m}$:
$$t = \text{clamp}\left( \frac{\Delta d - W_{\text{half}}}{W_{\text{verge}}}, 0.0, 1.0 \right)$$
$$S(t) = 3t^2 - 2t^3 \quad (\text{smoothstep})$$
$$H_{\text{final}}(x, z) = (1 - S(t)) \cdot Y_{\text{road}}(x, z) + S(t) \cdot H(x, z)$$

### 1.5 Physics Collider Specification
- **Collider Type**: Rapier 3D `Heightfield` or high-performance `TriMesh` ground collider.
- **Physical Friction**: $\mu_{\text{ground}} = 0.85$ (coarse natural terrain off-road).
- **Physical Restitution**: $e = 0.05$ (dead non-bouncy impact absorption).
- **Collision Group**: Group `0x0001` (Terrain/World), colliding with Group `0x0002` (Vehicle Chassis & Wheels) and Group `0x0004` (Debris/Props).

---

## 2. TRACK DESIGN & ROAD SURFACE DYNAMICS

### 2.1 Special Stage (Point-to-Point Time Trial)
- **Total Stage Length**: $\approx 2,420\,\text{m}$ continuous uphill and downhill sprint.
- **Vertical Profile**: Starts at $Y = 12\,\text{m}$ in lower orchard valley, ascends to mountain ridge pass at $Y = 118\,\text{m}$, descends into riverbed gulch at $Y = 28\,\text{m}$, and sprints up to high castle plateau finish at $Y = 96\,\text{m}$.
- **Road Width Variation**: Dynamic parametric width:
  - Tight mountain pass corridors: $5.5\,\text{m}$
  - Standard rally roadway: $6.5\,\text{m}$
  - Sweeping hairpins: $8.0\,\text{m}$
- **Geometric Signatures**:
  1. **Hairpin 1 (Castelnuovo)**: $180^\circ$ right uphill, banking $+7.5^\circ$ inward camber.
  2. **Hairpin 2 (Roccia Alta)**: $180^\circ$ left downhill, banking $+8.0^\circ$ inward camber.
  3. **Hairpin 3 (Pino Solitario)**: $175^\circ$ right off-camber crest entry into $+6.5^\circ$ bowl.
  4. **Hairpin 4 (Torrente Secco)**: $180^\circ$ left crossing stone aqueduct, $+7.0^\circ$ banking.
  5. **Blind Crest 1**: $s = 480\,\text{m}$, vertical apex curvature $R_v = 45\,\text{m}$, zero sightline ahead.
  6. **Blind Crest 2**: $s = 1,120\,\text{m}$, off-axis crest breaking left.
  7. **Blind Crest 3**: $s = 1,690\,\text{m}$, downhill compression entry.
  8. **Jump 1 (Viadotto Jump)**: $s = 890\,\text{m}$, $14^\circ$ ramp takeoff over stone aqueduct, creates $18\,\text{m}$ airborne flight at $130\,\text{km/h}$.
  9. **Jump 2 (Cresta del Diavolo)**: $s = 2,150\,\text{m}$, crest takeoff before finish straight.

### 2.2 Surface Transitions & Tire Friction Model
The stage is partitioned into 3 dynamic friction zones with continuous cosine smoothing over $30\,\text{m}$ blend boundaries:

| Zone | Stage Distance $s$ | Surface Material | Friction Coeff $\mu$ | Rolling Resistance $C_{rr}$ | Visual Texture / Color | Audio Acoustic Profile |
|---|---|---|---|---|---|---|
| **Zone 1** | $0\,\text{m} - 600\,\text{m}$ | Sun-faded asphalt | **1.05** | 0.015 | Charcoal bituminous with tar cracks | High tire hum, sharp squeal |
| **Zone 2** | $600\,\text{m} - 1,800\,\text{m}$ | Packed coarse gravel | **0.72** | 0.038 | Terracotta stone gravel with wheel ruts | Constant gravel chatter & chink |
| **Zone 3** | $1,800\,\text{m} - 2,420\,\text{m}$| Loose scree over bedrock | **0.65** | 0.052 | Bleached limestone dust, loose stones | Deep loose gravel hiss & roost |

Smooth blend formula at transition distance $s_0$:
$$\mu(s) = \mu_A + (\mu_B - \mu_A) \cdot \left[ \frac{1}{2} - \frac{1}{2} \cos\left( \pi \cdot \text{clamp}\left( \frac{s - (s_0 - 15)}{30}, 0, 1 \right) \right) \right]$$

### 2.3 Special Stage Spline Knot Table (2.4 km)

```
Index | Pos X (m) | Pos Y (m) | Pos Z (m) | Width (m) | Camber (deg) | Zone | Feature Note
-------------------------------------------------------------------------------------------------
K00   |  -620.0   |   12.0    |  -580.0   |   6.5     |    0.0       |  Z1  | Start Gantry
K01   |  -560.0   |   14.0    |  -530.0   |   6.5     |   +1.0       |  Z1  | Fast gentle right
K02   |  -480.0   |   18.0    |  -490.0   |   6.2     |   -1.5       |  Z1  | Sweeper left
K03   |  -410.0   |   25.0    |  -430.0   |   6.0     |   +2.0       |  Z1  | Village approach
K04   |  -350.0   |   34.0    |  -360.0   |   8.0     |   +7.5       |  Z1  | Hairpin 1 (Right 180°)
K05   |  -390.0   |   42.0    |  -300.0   |   6.5     |   -1.0       |  Z1  | Hairpin exit climbing
K06   |  -360.0   |   51.0    |  -220.0   |   5.8     |    0.0       |  Z1  | Blind Crest 1 (Asphalt transition)
K07   |  -300.0   |   58.0    |  -160.0   |   6.0     |   +2.0       |  Z2  | Transition to Packed Gravel
K08   |  -220.0   |   69.0    |  -120.0   |   6.2     |   -2.5       |  Z2  | High-speed forest straight
K09   |  -140.0   |   82.0    |  -150.0   |   7.8     |   +8.0       |  Z2  | Hairpin 2 (Left 180° cliffside)
K10   |  -080.0   |   94.0    |  -090.0   |   6.0     |   +1.5       |  Z2  | Ridge ascent
K11   |   000.0   |  108.0    |  -030.0   |   5.5     |    0.0       |  Z2  | Narrow Mountain Pass Summit
K12   |   080.0   |  101.0    |   040.0   |   6.0     |   -2.0       |  Z2  | Blind Crest 2 & Jump 1 Takeoff
K13   |   140.0   |   87.0    |   110.0   |   6.5     |    0.0       |  Z2  | Aqueduct Bridge Crossing
K14   |   210.0   |   74.0    |   170.0   |   7.6     |   +6.5       |  Z2  | Hairpin 3 (Right 175°)
K15   |   160.0   |   60.0    |   240.0   |   6.2     |   -1.5       |  Z2  | Pine forest descent
K16   |   090.0   |   46.0    |   300.0   |   6.0     |   +1.0       |  Z2  | Puddle 1 (Mud Splash)
K17   |   010.0   |   34.0    |   360.0   |   5.8     |    0.0       |  Z2  | Blind Crest 3
K18   |  -070.0   |   28.0    |   420.0   |   7.8     |   +7.0       |  Z3  | Hairpin 4 (Torrente Secco) & Puddle 2
K19   |  -020.0   |   39.0    |   490.0   |   6.2     |   +2.0       |  Z3  | Bedrock Transition
K20   |   070.0   |   55.0    |   540.0   |   6.0     |   -2.0       |  Z3  | Scree hillclimb
K21   |   170.0   |   73.0    |   570.0   |   6.2     |   +1.5       |  Z3  | Fast rocky sweeper
K22   |   270.0   |   89.0    |   530.0   |   6.0     |    0.0       |  Z3  | Jump 2 (Cresta del Diavolo)
K23   |   360.0   |   95.0    |   470.0   |   6.5     |   -1.0       |  Z3  | Castle approach
K24   |   440.0   |   96.0    |   410.0   |   7.0     |    0.0       |  Z3  | Finish Timing Arch
```

### 2.4 Rallycross Super-Stage (Closed Loop Circuit)
- **Total Circuit Length**: $1,215\,\text{m}$ closed loop ($3$ laps per race).
- **Track Layout**: Mixed asphalt launch straight ($35\%$) and packed dirt infield ($65\%$).
- **Features**:
  - **Tabletop Spectator Jump**: $s = 320\,\text{m}$, ramp up $+2.2\,\text{m}$, flat plateau $12\,\text{m}$, ramp down $-2.2\,\text{m}$ located right in front of main grandstands.
  - **Joker Lap Split**: Branch at $s = 740\,\text{m}$. Standard path takes an inside sweeper ($180\,\text{m}$); Joker route takes an extended wide perimeter loose-dirt hairpin ($245\,\text{m}$), engineered to penalize exactly $+2.8\,\text{seconds}$.
  - Re-merge at $s = 960\,\text{m}$ with dedicated merge sightlines and warning flag station.

---

## 3. ENVIRONMENTAL PROPS & ARCHITECTURAL ASSETS

### 3.1 Procedural Geometry & Model Specifications

```
Prop Category          | Asset Type                 | Polycount | Materials / Shaders        | Dynamic Physics
-------------------------------------------------------------------------------------------------------------------
Roadside Furniture     | Apex Kerb Strip            | 48 tris   | Red/White Striped Glossy   | Static TriMesh (curb roll)
                       | Breakable Wooden Fence     | 92 tris   | Weathered Chestnut Timber  | Dynamic Compound (Breakable)
                       | Breakable Dry-Stone Wall   | 140 tris  | Rough Terracotta Basalt    | Dynamic Multi-Block Detach
                       | Corner Chevron Board       | 36 tris   | Fluorescent Yellow/Black   | Kinetic Knockdown Pivot
                       | Steel Highway Guardrail    | 120 tris  | Galvanized Zinc Steel      | High-friction Rigid Static
-------------------------------------------------------------------------------------------------------------------
Rally Infrastructure   | APEX Inflatable Gantry     | 480 tris  | Saturated Orange PVC Fab   | Static Arch Trigger
                       | Digital Finish Timing Arch | 540 tris  | Aluminum Truss + 7-Seg LED | Sector Timing Trigger
                       | Spectator Warning Tape     | 24 tris   | Bright Yellow Banner Ribbon| Wind-flutter vertex shader
                       | Marshal Post & Flag        | 160 tris  | Treated Pine + Cloth Flag  | Animated Flag Flutter
-------------------------------------------------------------------------------------------------------------------
Architecture           | Tuscan Stone Cottage       | 680 tris  | Terracotta Masonry + Tile  | Static Kinematic Shell
                       | Timber Barn Structure      | 720 tris  | Weathered Slatted Wood     | Static Kinematic Shell
                       | Mountain Water Pump        | 220 tris  | Cast Iron + Stone Basin    | Static Obstacle
                       | Stone Viaduct / Aqueduct   | 1,100 tris| Roman Masonry Arches       | Static Bridge TriMesh
-------------------------------------------------------------------------------------------------------------------
GPU Vegetation         | Mediterranean Cypress      | 180 tris  | Slender Columnar Foliage   | InstancedMesh (1,200 units)
                       | Italian Stone Pine         | 340 tris  | Umbrella Canopy Foliage    | InstancedMesh (800 units)
                       | Sage Scrub Tufts & Rocks   | 42 tris   | Low Sage + River Granite   | InstancedMesh (3,000 units)
```

### 3.2 Breakable Physics Model (Fences & Stone Walls)
- **Normal State**: Objects are anchored via kinematic / fixed joints with impulse yield threshold $J_{\text{break}} = 4,200\,\text{N}\cdot\text{s}$.
- **Collision Impulse Detection**:
  When vehicle contacts fence or wall at velocity $v > 8.5\,\text{m/s}$ ($30.6\,\text{km/h}$):
  $$\vec{J}_{\text{impact}} = m_{\text{vehicle}} \cdot \Delta \vec{v}$$
  If $|\vec{J}_{\text{impact}}| > J_{\text{break}}$:
  1. Unpin joint: convert post/rail or stone blocks into active dynamic rigid bodies.
  2. Apply velocity impulse in direction of vehicle travel: $\vec{v}_{\text{debris}} = 0.45 \vec{v}_{\text{vehicle}} + \vec{v}_{\text{shatterRandom}}$.
  3. Emit wood splinter / stone dust particle burst.
  4. Fade debris colliders after $6.0\,\text{seconds}$.

---

## 4. DYNAMIC LIVESTOCK & WILDLIFE HAZARDS (COWS & DEER)

### 4.1 Wildlife Behavioral State Machine (FSM)

```
        +-------------------------------------------------------------+
        |                                                             |
        v                                                             |
+---------------+   dist < 70m   +---------------+   dist < 35m   +-------------------+
|    GRAZING    | -------------> |     ALERT     | -------------> |  CROSSING / PANIC |
|  (Head Bob &  |                |  (Head Snaps  |                | (Full Gallop/Trot |
| Tail Swish)   | <------------- |  Ears Twitch) |                | Across Road Bed)  |
+---------------+   dist > 90m   +---------------+                +-------------------+
                                         |                                  |
                                         | car passes & dist > 40m          | reach opposite
                                         v                                  | verge
                                 +---------------+                          |
                                 | SAFE / RETREAT|<-------------------------+
                                 | (Escape into  |
                                 |  Pines/Brush) |
                                 +---------------+
```

### 4.2 State Transition Specifications & Timers
1. **`GRAZING`**:
   - Idle head pitch oscillation $\theta_{\text{head}}(t) = 0.12 \sin(1.8 t)$ rad.
   - Tail swish roll $\theta_{\text{tail}}(t) = 0.35 \cos(3.2 t)$ rad.
   - Leg stances planted, minor body sway.
2. **`ALERT`** (Trigger: Euclidean distance to car $d < 70\,\text{m}$):
   - Head snaps to car position: $\vec{u}_{\text{car}} = \frac{\vec{p}_{\text{car}} - \vec{p}_{\text{animal}}}{\|\vec{p}_{\text{car}} - \vec{p}_{\text{animal}}\|}$.
   - Ears pitch forward $+15^\circ$, jitter frequency $12\,\text{Hz}$.
   - Body tenses, respiration rate doubles.
   - Co-driver audio triggers: `"Careful! Livestock ahead!"`.
3. **`CROSSING / PANIC`** (Trigger: $d < 35\,\text{m}$ & crossing vector active):
   - Animal transitions into running cycle: 4 articulated legs oscillate in quad trot/gallop phase ($\phi_1 = 0, \phi_2 = \pi, \phi_3 = \pi, \phi_4 = 0$).
   - Linear sprint across road at $v_{\text{deer}} = 9.5\,\text{m/s}$ or $v_{\text{cow}} = 4.2\,\text{m/s}$.
   - Hoof impact dust puffs emitted at ground contact points ($Y = 0$).
4. **`SAFE / RETREAT`** (Trigger: Reached target verge or car has passed and $d > 40\,\text{m}$):
   - Animal trots toward deep cover (cypress/pine cluster at distance $> 18\,\text{m}$ from road).
   - Once in cover, resets to `GRAZING`.

---

## 5. REAL-TIME VEHICLE PARTICLE & VFX ENGINES

### 5.1 Dual-Tier Wheel Roost Dust System

```
Vehicle Telemetry Inputs:
- Wheel Angular Velocity: omega_i (rad/s)
- Longitudinal Slip Ratio: s_long = (omega * r - v_x) / max(|v_x|, 0.1)
- Lateral Slip Velocity: v_lat = v_car . normal_wheel
- Surface Type: Asphalt | Gravel | Scree
```

#### Tier 1: Dense High-Velocity Pebble Roost
- **Particles Count**: 600 recycled billboard quads.
- **Emission Trigger**: $|s_{\text{long}}| > 0.12$ or $|v_{\text{lat}}| > 1.8\,\text{m/s}$ on gravel/scree.
- **Initial Velocity**:
  $$\vec{v}_{\text{pebble}} = -1.1 \cdot \vec{v}_{\text{wheelTangential}} + \vec{\eta}_{\text{cone}}(\pm 18^\circ)$$
  $$\vec{a}_{\text{gravity}} = [0, -14.8, 0]\,\text{m/s}^2$$
- **Lifetime**: $0.65\,\text{seconds}$.
- **Appearance**: Sharp, high-contrast, angular pebble grains bouncing off wheel arches.

#### Tier 2: Volumetric Atmospheric Dust Clouds
- **Particles Count**: 1,200 soft particle quads with smooth depth fading.
- **Expansion Rate**: Initial radius $r_0 = 0.4\,\text{m} \to r_{\text{final}} = 4.8\,\text{m}$ over $3.5\,\text{seconds}$.
- **Atmospheric Golden Hour Lighting**:
  Dust particles calculate Henyey-Greenstein forward scattering to catch the low sun:
  $$I_{\text{scatter}}(\theta) = I_{\text{sun}} \cdot \frac{1 - g^2}{(1 + g^2 - 2g \cos\theta)^{3/2}} \quad (g = 0.65)$$
  Creates bright glowing golden dust clouds in the rearview camera.

### 5.2 Tire Smoke Plumes (Asphalt Power Slides)
- **Emission Trigger**: Surface = Asphalt AND lateral scrub speed $|v_{\text{lat}}| > 3.8\,\text{m/s}$.
- **Appearance**: Dense, curling white/light-gray vapor puffs rising with thermal buoyancy ($+1.8\,\text{m/s}$ upward drift).
- **Lifetime**: $1.8\,\text{seconds}$.

### 5.3 Puddle Water Splash
- **Locations**: Two shallow mud puddle sections along Zone 2 gravel track.
- **Sheet Velocity**: Lateral fan angle $\pm 55^\circ$ outwards from left/right tires.
- **Droplet Mist**: 300 micro droplets cascading with gravity and air resistance.
- **Acoustic Hook**: Sharp hydraulic water sheet slap audio.

### 5.4 Exhaust Backfire Sparks & Flames
- **Trigger**: Sudden deceleration or downshift while engine RPM $> 5,500$.
- **Flame Burst**: 3 concentric glowing cones (inner core `#00F0FF`, middle `#FFAA00`, outer `#FF2200`), lasting $0.14\,\text{s}$.
- **Embers**: 25 glowing sparks ejected backward with turbulent noise trajectory, fading over $0.4\,\text{s}$.

### 5.5 Dynamic Skid Mark Ribbon Mesh
- **Geometry**: Continuous extruded strip quad mesh connected to wheel contact points.
- **Opacity / Alpha**: $\alpha = \text{clamp}\left( \frac{|v_{\text{lat}}| - 1.5}{4.0}, 0.0, 0.85 \right)$.
- **Surface Clamping**: Vertices offset $+0.02\,\text{m}$ along road normal to prevent z-fighting.

---

## 6. SKYBOX, LIGHTING & POST-PROCESSING SPECIFICATIONS

### 6.1 Sun & Shadow Pipeline
- **Directional Sun Light**:
  - Position: $\vec{L}_{\text{pos}} = [-350, 240, -420]$ (normalized $\to$ altitude $22^\circ$).
  - Color: `#FFF3D6` (Golden warm sunshine).
  - Intensity: $3.2$.
  - Shadow Map: $2048 \times 2048$, PCFSoft, shadow bias $-0.00035$.
  - Shadow Frustum: Cascaded bounds centered on vehicle / camera up to $140\,\text{m}$ radius.
- **Hemisphere Fill Light**:
  - Sky: `#4A6D94` (Atmospheric blue ambient).
  - Ground: `#5C4433` (Warm terracotta bounce).
  - Intensity: $0.85$.

### 6.2 Atmospheric Fog & Sky Dome
- **Sky Dome**: Procedural shader hemispherical dome interpolating:
  - Zenith: `#385273`
  - Horizon Golden Band: `#E8A87C`
  - Sun Glare Disk: `#FFF8EB`
- **Atmospheric Fog**: Exponential squared depth fog:
  - Color: `#D4A373` (Golden dust haze)
  - Density: $0.00075\,\text{m}^{-1}$ (Preserves crisp foreground while softly veiling distant mountain ridges).

### 6.3 Post-Processing Pipeline
- **Tone Mapping**: `THREE.ACESFilmicToneMapping` with exposure $1.12$.
- **Bloom Pass**: Threshold $0.88$, strength $0.45$, radius $0.35$ (highlights exhaust flame pops and sun glints).
- **Vignette & Chromatic Aberration**: Subtle edge darkening and $1.5\,\text{px}$ radial color fringing at speeds $> 100\,\text{km/h}$.

---

## 7. MODULAR TS ARCHITECTURE & COMPONENT INTERFACES

```
+---------------------------------------------------------------------------------------+
|                                    RallyStageWorld                                    |
|                                                                                       |
|  - Generates 1,500m x 1,500m terrain mesh & Rapier TriMesh/Heightfield Collider       |
|  - Builds Special Stage (2.4km) & Rallycross (1.2km) Catmull-Rom splines               |
|  - Extrudes banked road ribbon with camber, drainage verges, and kerbs                |
|  - Exposes query methods: getSurfaceAt(x, z), getSplineProjection(point)              |
+---------------------------------------------------------------------------------------+
            |                                           |
            v                                           v
+-------------------------------+           +-------------------------------------------+
|       StagePropsManager       |           |          WildlifeCrossingManager          |
|                               |           |                                           |
| - 1,200 Cypress trees         |           | - Cow & Deer herds at designated pastures |
| - 800 Stone Pine trees        |           | - 4-state FSM: Grazing, Alert, Cross, Safe|
| - Breakable fences & walls    |           | - Articulated legs, neck, ears, tail      |
| - Chevrons, guardrails, tape  |           | - Audio cues & dust puff emission         |
| - Cottage, barn, bridge arch  |           +-------------------------------------------+
+-------------------------------+                       |
            |                                           |
            v                                           v
+-------------------------------+           +-------------------------------------------+
|         EnvironmentVFX        |           |           StageTimingController           |
|                               |           |                                           |
| - Dual-tier dust roost        |           | - Checkpoints, splits, sector deltas      |
| - Asphalt tire smoke plumes   |           | - Joker lap branching & time penalty      |
| - Puddle water spray fans     |           | - Best lap / current lap delta tracking   |
| - Exhaust backfire flames     |           | - Race progression HUD data feed          |
| - Dynamic skid mark ribbons   |           +-------------------------------------------+
+-------------------------------+
```

---
*Document Version: 1.0.0 (Production Blueprint Approval)*
