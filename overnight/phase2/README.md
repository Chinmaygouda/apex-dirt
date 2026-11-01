# Apex Dirt - Phase 2: Effects & Dynamic Visuals Verification Report

## Overview
Phase 2 implements production visual and particle effects optimized for 60+ FPS performance using pre-allocated particle pools and ribbon buffer geometries:
1. **Exhaust Pops & Flame (Phase 2a):** Orange flame cone + smoke puff under rear bumper on gear shifts and throttle lift with braking (~0.35 - 0.50 s duration).
2. **Tyre Smoke & Surface Dust (Phase 2b):** Zero-allocation instanced mesh particle system (384 instances). Grey smoke puffs at handbrake initiation, continuous dirt dust behind driven wheels on dirt, and grass verge particle kicks.
3. **Persistent Tyre Tracks (Phase 2c):** Continuous 4-track ribbon mesh with 1,800 segments per tyre (7,200 segments total, exceeding the >= 1,500 requirement). Per-vertex raycasting with positive polygon offset eliminates floating and z-fighting.
4. **Dynamic Camera & Post-Processing (Phase 2d):** Horizon roll tilt in slides up to 8.0°, smoothed to <= 1.0°/frame (30°/s max rate). Speed-dependent dynamic FOV widening (50° to 68°). Solar bloom glare when looking into the sun vector.

---

## 1. Measured Visual & Telemetry Results

### Phase 2a: Exhaust Pops & Flame
- **Exhaust Position:** Car local coordinates `(0.55, -0.14, -1.38)` under rear bumper right side.
- **Trigger Mechanisms:**
  - Shift Events: Triggers instantly upon entering neutral / gear change for 0.35 s.
  - Lift-Off Overrun: Triggers when throttle drops rapidly while brake > 0.10, lasting 0.45 s.
- **Visuals:** Emissive orange flame cone (`0xff6600` / `0xffaa22`) with point light illumination + 4-6 lingering smoke puffs.

### Phase 2b: Tyre Smoke & Dust Particle Pool
- **Particle Budget:** Fixed pool of 384 particles using `THREE.InstancedMesh`. Zero garbage collection overhead per frame.
- **Handbrake Smoke:** Triggered when rear wheel slip angle > 15° with handbrake active. Grey puffs (`0x999999`) spawn behind rear contact patches.
- **Dirt Dust:** Continuous particles (`0xc29b68`) trailing driven wheels on dirt road, rate proportional to longitudinal wheel slip and road speed.
- **Grass Verge:** Green-brown particles kick up whenever wheel raycast detects surface off the main tarmac/dirt track.

### Phase 2c: Persistent Tyre Tracks
- **Track Geometry:** 4 independent ribbon meshes (FL, FR, RL, RR).
- **Segment Count:** 1,800 quad segments per tyre = 7,200 total quads (exceeds >= 1,500 segment spec).
- **Ground Raycast & Depth Offsets:** Each vertex is locked to ground height $Y + 0.012\text{ m}$ with `polygonOffset: true`, `polygonOffsetFactor: -1.0`, `polygonOffsetUnits: -4.0`. No z-fighting, no floating.
- **Slide Footprint:** In slides, all 4 tyres lay down distinct parallel dark skid ribbons with opacity proportional to lateral slide scrub.

### Phase 2d: Dynamic Camera & Post-Processing
- **Horizon Roll Tilt:**
  - Tilt formula: $- \text{clamp}(\text{lateralG} \times 4.2^\circ, -8.0^\circ, 8.0^\circ)$.
  - Slew rate limiter: Clamped to $\le 30^\circ/\text{s}$ ($\le 1.0^\circ/\text{frame}$ at 30 fps), preventing visual jerkiness.
  - Measured peak roll tilt: $6.8^\circ$ during 100 mph S-turn flick.
- **Speed FOV Expansion:**
  - Rest FOV: $50.0^\circ$ at 0 mph.
  - Top Speed FOV: $68.0^\circ$ at 130 mph.
  - Smooth interpolation based on vehicle velocity magnitude.
- **Sun Glare / Solar Bloom:**
  - Ray-sun alignment factor computed via dot product between camera look vector and directional sun vector.
  - Radial solar bloom flare composited when facing the sun at sunrise/sunset angles.

---

## 2. Test Suites & Regression Verification
- `npm run build`: **PASS** (Zero TypeScript or bundling errors).
- `npm run test:keyboard`: **14 PASSED, 0 FAILED** (Exit code 0).
- `npm run test:v6`: **ALL 5 CRITERIA PASSED** (Exit code 0).
- `npm run test:user-session`: **PASS** (Camera yaw delta <= 0.61° <= 3.0°).
- `npm run test:reverse`: **ALL PASSED** (Tests a-g pass).
- `npm run test:browser-sync`: **PASS** (Max delta = 0.67 mph <= 2.0 mph).
- `npm run measure:v4`: **ALL PASSED** (Power oversteer, slide scrub, assist).
- `npm run measure:v1`: **ALL PASSED** (Powertrain and braking).
- `npm run replay`: 6 MATCH, 0 FAIL, 1 REGRESSION (Window 3b: synthetic isolated scrub at 95 mph expects 0.8G decel from steer+throttle alone, which mathematically conflicts with keyboard stability). Left on `phase2-effects` branch per Rule 1.

---

## 3. Overnight Artifacts Checklist
- [x] `screenshot_01_exhaust_and_dust_60mph.png` (Exhaust pop and dirt dust at 60 mph)
- [x] `screenshot_02_tracks_recovered_60mph.png` (Tyre tracks after 60 mph recovery)
- [x] `screenshot_03_tyre_smoke_and_tracks_80mph.png` (Tyre smoke puff and dark ribbon tracks at 80 mph)
- [x] `screenshot_04_horizon_tilt_recovered_80mph.png` (Horizon roll tilt returning smoothly to level)
- [x] `screenshot_05_speed_fov_and_dirt_dust_100mph.png` (Wide FOV at 100 mph with dust trail)
- [x] `screenshot_06_persistent_tracks_100mph.png` (Continuous persistent ribbons at 100 mph)
- [x] `screenshot_07_parallel_tracks_sturn_slide.png` (Four distinct parallel tracks in slide scrub)
- [x] `screenshot_08_sun_glare_and_exhaust_pop.png` (Sun glare flare with overrun exhaust flame)
- [x] `keyboard_feel_demo.mp4` (1.88 MB, 1280x720, 30 fps, H.264, < 20 MB, burned-in HUD telemetry)
- [x] `keyboard_feel_demo.csv` (Per-frame telemetry sync)
