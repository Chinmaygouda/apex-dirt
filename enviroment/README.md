# APEX RALLY – 3D Environment, Dynamic Track & VFX World Engine

A standalone, high-performance, immersive WebGL / Three.js and Rapier 3D physics rally racing environment with procedural particle systems, realistic track geometry, environmental architecture, interactive wildlife AI, atmospheric lighting, and plug-and-play vehicle integration.

---

## 📸 Visual References & Blueprints

- **Interactive Technical Blueprint**: [`docs/apex_rally_environment_blueprint.png`](docs/apex_rally_environment_blueprint.png)
- **Topographic & Cross-Section Specifications**: [`docs/BLUEPRINTS.md`](docs/BLUEPRINTS.md)
- **3-Panel Visual Storyboard**: [`docs/rally_journey_visual_storyboard.png`](docs/rally_journey_visual_storyboard.png)
- **Reference Renders**:
  - Shot 1 (Middle of Road Pass): [`docs/group_b_rally_action_straight_1794217696255.jpg`](docs/group_b_rally_action_straight_1794217696255.jpg)
  - Shot 2 (Banked Hairpin Drift & Roost): [`docs/group_b_rally_hairpin_drift_1794217720417.jpg`](docs/group_b_rally_hairpin_drift_1794217720417.jpg)
  - Shot 3 (Overall Aerial Journey Map): [`docs/group_b_rally_stage_aerial_map_1794217744777.jpg`](docs/group_b_rally_stage_aerial_map_1794217744777.jpg)

---

## 🌟 Key Subsystems

### 1. World Theme & Terrain Architecture
- **Setting**: Mediterranean / Southern European Hillside Rally (Sanremo / Portugal).
- **World Bounds**: $1,500\text{m} \times 1,500\text{m}$ continuous terrain ($X, Z \in [-750\text{m}, +750\text{m}]$).
- **Elevation Relief**: $140\text{m}$ vertical change (valley basin at $Y = 0\text{m}$, pass summit at $Y = 108\text{m}$).
- **Mountain Corridor Clearance**: Valley corridor carved between North Mountain Ridge and South Hillside Massif with $22\text{m}$ verge setback and negative foundation bed carving ($Y_{\text{terrain}} = Y_{\text{road}} - 0.25\text{m}$), guaranteeing the road is never submerged under mountains.
- **Physics Collider**: Static Rapier 3D `TriMesh` ground collider ($\mu = 0.85$, $e = 0.05$).

### 2. Driving Circuits (< 10 km)
- **Special Stage (Point-to-Point Time Trial)**:
  - **Length**: $2.40\text{ km}$ ($2,404.9\text{ m}$).
  - **Width**: Variable between $5.5\text{m}$ (mountain pass) and $8.0\text{m}$ (hairpins).
  - **Features**: 4 tight $180^\circ$ hairpins with positive camber banking (up to $+8^\circ$), 3 blind crests, 2 high-speed jumps, 2 mud puddles with lateral spray fans, and a Roman stone viaduct bridge.
  - **Surface Transitions**:
    - Zone 1 ($0–600\text{m}$): Sun-faded asphalt ($\mu = 1.05$).
    - Zone 2 ($600–1800\text{m}$): Packed coarse gravel ($\mu = 0.72$).
    - Zone 3 ($1800–2405\text{m}$): Loose scree over mountain bedrock ($\mu = 0.65$).
- **Rallycross Super-Stage (Closed Loop Circuit)**:
  - **Length**: $1.20\text{ km}$ ($1,197.2\text{ m}$), 3 laps per race.
  - **Features**: Spectator tabletop jump in front of grandstands and a Joker Lap alternate route ($+2.8\text{s}$ penalty).

### 3. GPU Instanced Props & Architecture
- **Vegetation**: Single-drawcall `InstancedMesh` rendering for **1,200 Mediterranean Cypress trees**, **800 Italian Stone Pines**, **2,400 sage scrub tufts**, and **600 river stones**.
- **Roadside Furniture**: Red-and-white apex kerbs, warning chevrons, steel guardrails.
- **Breakable Physics**: Wooden post-and-rail fences and rustic dry-stone walls that shatter upon high-speed collision ($> 8.5\text{ m/s}$) into active dynamic Rapier 3D rigid bodies.
- **Architecture**: Weathered stone cottage, rustic timber barn, water pump station, and stone aqueduct.

### 4. Interactive Wildlife AI (Cows & Deer)
- **Articulated Rigs**: Low-poly Holstein dairy cows and mountain deer with articulated head, ears, 4 legs, and tail.
- **4-State State Machine**:
  - `GRAZING`: Slow head bobbing and tail swishing.
  - `ALERT`: Triggered when vehicle is within $70\text{m}$; head snaps toward car, ears twitch at $12\text{ Hz}$, co-driver callout triggers.
  - `CROSSING`: Triggered when vehicle is within $35\text{m}$; animal trots across track in 4-phase gait ($4.2\text{ m/s}$ cow, $9.5\text{ m/s}$ deer).
  - `SAFE`: Animal retreats into forest cover once the car passes.

### 5. Vehicle Particle & VFX Engine
- **Dual-Tier Wheel Roost**: Tier 1 rapid pebble kickback + Tier 2 volumetric golden dust clouds expanding over 3.5 seconds.
- **Tire Smoke**: White curling smoke plumes when asphalt lateral scrub exceeds $3.8\text{ m/s}$.
- **Puddle Splash**: Twin lateral fan sheets of water spray and droplet mist.
- **Exhaust Backfire**: Concentric cyan/orange flame bursts and 25 glowing sparks on hard deceleration while RPM $> 5,500$.
- **Skid Marks**: Continuous ribbon mesh decals offset $+0.02\text{m}$ above the road.

### 6. Procedural Audio & Co-Driver Voice
- **Web Audio Engine**: Procedural 5-cylinder Group B engine roar, turbocharger spool whine, gravel chatter against wheel wells, water puddle splash, and backfire pops.
- **Spoken Co-Driver Voice**: Uses Web Speech API to vocalize rally pace-notes in real time with urgent cadence.

### 7. Plug-and-Play Integration Contract (`CustomRallyVehicleAdapter`)
Connect your external 1980s Group B rally car project using [`src/vehicle/CustomRallyVehicleAdapter.ts`](src/vehicle/CustomRallyVehicleAdapter.ts):
```typescript
import { CustomRallyVehicleAdapter } from './src/vehicle/CustomRallyVehicleAdapter';

const adapter = new CustomRallyVehicleAdapter(
  worldEngine,
  propsManager,
  wildlifeManager,
  vfxEngine,
  timingController
);

adapter.mountVehicle(myCustomRallyVehicle);

// In render loop:
adapter.update(deltaTime, elapsedTime);
```

---

## 🎮 Controls & Keybindings

| Key | Action |
|---|---|
| **`W` / `A` / `S` / `D`** or **Arrows** | Drive vehicle (Throttle, Brake, Steer) |
| **`Spacebar`** | Handbrake power-slide drift |
| **`1`** | **Shot 1 View**: Middle of road pass perspective |
| **`2`** | **Shot 2 View**: Banked hairpin drift & roost view |
| **`3`** | **Shot 3 View**: Overall aerial top-down journey view |
| **`C`** | Cycle camera modes (Chase, Flythrough, Helicopter TV) |
| **`T`** | Toggle driving circuit (Special Stage 2.4 km vs Rallycross 1.2 km) |
| **`V`** | Toggle spoken Co-Driver voice announcements |
| **`M`** | Toggle audio mute |

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Interactive Dev Server
```bash
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in any modern WebGL2 browser.

### 3. Run Automated Physics Test Suite
```bash
npm test
```
Verifies all 25 physics collision, spline projection, surface friction, breakable prop, and wildlife AI tests.

### 4. Build Production Bundle
```bash
npm run build
```
Creates optimized production assets in `dist/`.

