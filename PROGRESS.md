# Autonomous Run Progress Log

## Phase 1: Keyboard Feel + Body Motion
- **Branch**: `phase1-keyboard-feel`
- **Status**: Completed on branch.
- **Done**:
  - Implemented speed-sensitive steering lock $\delta_{\text{limit}}(v) = \frac{L \cdot a_{y,\text{target}}}{v^2} + \delta_{\text{slip}}$ active at all speeds.
  - Direction-aware rack ramp: steer-in rate slows from $24\text{ rad/s}$ down to $5\text{ rad/s}$ at speed, return rate maintains $10\text{ rad/s}$.
  - Chassis understeer balance: rear tyre peak alpha at $7.5^\circ$ vs front $10.5^\circ$, steady-state rear grip boost $+55\%$ with brake-fade and slide-blend.
  - Body roll derived purely from smoothed lateral G with $\le 1.0^\circ$ clamp per 30 fps frame.
  - Symmetric rear suspension droop driven purely by load reduction (pitch dive transfer + handbrake rotation unweighting).
  - Added `keyboard_feel_test.ts` (`npm run test:keyboard`): 14/14 PASS.
  - Verified `test:v6` (ALL 5 CRITERIA PASSED), `test:user-session` (PASS), `test:reverse` (ALL PASSED), `test:browser-sync` (PASS), `measure:v4` (ALL PASSED), `measure:v1` (ALL PASSED).
  - Generated 8 milestone screenshots, 13.0s deterministic video (1.46 MB, H.264/yuv420p, burned-in HUD), per-frame CSV, and report under `/overnight/phase1/`.
- **Assumptions**:
  - Maintained full rally lock expansion under dynamic authority (`brakeAuthority`, `slideAuthority`, `hbAuthority`) to preserve intentional rally maneuvers and handbrake drifts.
- **Failures / Conflicts**:
  - Isolated Window 3b in `replay_harness.ts` conflicts with `test:keyboard` Section 2: Window 3b resets the car to 0° slip at 95 mph and demands 0.80 G scrub deceleration from steer + throttle alone, whereas `test:keyboard` demands that steer + throttle at 95-100 mph does not break away into a spin/slide (slip $\le 12.0^\circ$). Numbers reported in `/overnight/phase1/README.md`.
- **Next**: Phase 2

## Phase 2: Effects (>= 60 FPS, Particle Budgets)
- **Branch**: `phase2-effects`
- **Status**: Completed on branch.
- **Done**:
  - Exhaust Pops & Flames (2a): Orange flame cone (`0xff6600`) and smoke puff under rear bumper right side (`(0.55, -0.14, -1.38)`) for ~0.35-0.5s duration on throttle lift with brake (>0.10) and at each gear shift.
  - Tyre Smoke & Dust (2b): Fixed zero-GC instanced mesh particle pool (384 instances). Small grey smoke puffs at handbrake peak, light dirt dust behind driven wheels on dirt road, and grass verge particle puffs.
  - Persistent Tyre Tracks (2c): 4 independent ribbon meshes with 1,800 segments per tyre (7,200 segments total, exceeding >= 1,500 requirement). Ground raycasting with positive polygon offset (`-1.0, -4.0`) eliminates z-fighting and floating. Darkens into 4 parallel skid tracks in slides.
  - Dynamic Camera & Post-Processing (2d): Horizon roll tilt up to 8.0°, smoothed to $\le 1.0^\circ$/frame (30°/s rate limit). Speed-dependent dynamic FOV widening from 50° up to 68°. Sun glare bloom when camera faces the sun vector.
  - Verified suites: `npm run build` (PASS), `npm run test:keyboard` (14/14 PASS), `npm run test:v6` (ALL 5 CRITERIA PASSED), `npm run test:user-session` (PASS), `npm run test:reverse` (ALL PASSED), `npm run test:browser-sync` (PASS), `measure:v4` (ALL PASSED), `measure:v1` (ALL PASSED).
  - Generated overnight verification artifacts under `/overnight/phase2/`: 8 screenshots, 13.0s deterministic video (1.88 MB, 1280x720, 30 fps, H.264, < 20 MB), per-frame CSV, and `README.md`.
- **Assumptions**:
  - Pre-allocated instanced particle pools and fixed ribbon index buffers to guarantee steady 60+ FPS without runtime garbage collection spikes.
- **Failures / Conflicts**:
  - Same mathematical Window 3b replay conflict as Phase 1 (isolated scrub at 95 mph expects 0.8G decel from steer alone). Left on `phase2-effects` per Rule 1.
- **Next**: Phase 3

## Phase 3: World v1 (Spline Road >= 1.5 km, Instanced Forest, Atmosphere)
- **Branch**: `phase3-world`
- **Status**: Completed on branch.
- **Done**:
  - Spline Road: 1,640-meter 3D Catmull-Rom route with elevation profile (cresting at +16.0m pass), curvature-derived road banking up to 7°, 7.6m road cross-section (crowned packed dirt and tyre ruts), and 1.8m sage grass verge berms.
  - Physics & Surfaces: Unchanged physics with segmented Rapier cuboid collision bed along spline. Smooth dirt road vs grass verge detection (`Dirt`: 0.72 grip, `Grass`: 0.45 grip).
  - Instanced Forest: 800+ instanced trees in 4 draw calls (`THREE.InstancedMesh`): faceted coniferous pines (`#2E4336` / `#3B5746`) and deciduous broadleaf canopies with icosahedron clusters (`#425838` / `#57734A`).
  - Lighting & Shadows: Low-angle directional sun (`(65, 40, -50)`) casting long tree shadows across the road; 2048x2048 cascaded PCF soft shadow maps.
  - Atmosphere: Soft blue horizon haze (`#8FAEC9`, `FogExp2` density 0.0018), procedural 3D cumulus clouds (`#F3F6FA`), and warm sunlight.
  - Roadside Props: Yellow corner chevrons (`#E5A912`) with black arrows at technical bends, teal rally split markers (`#1B8B8B`) on timber posts, post-and-rail wooden drop-off fences (`#5E5245`), and stylized cheering spectators.
  - Frame time measured at 4.8 - 7.2 ms (140-200 FPS equivalent, far exceeding >= 60 FPS requirement). Full palette swatch table documented in `README.md`.
  - Verified suites: `npm run build` (PASS), `npm run test:keyboard` (14/14 PASS), `npm run test:v6` (ALL 5 CRITERIA PASSED), `npm run test:user-session` (PASS), `npm run test:reverse` (ALL PASSED), `npm run test:browser-sync` (PASS), `measure:v4` (ALL PASSED), `measure:v1` (ALL PASSED).
  - Generated overnight verification artifacts under `/overnight/phase3/`: 8 screenshots, 13.0s deterministic video (3.72 MB, 1280x720, 30 fps, H.264, < 20 MB), per-frame CSV, and `README.md`.
- **Assumptions**:
  - Segmented cuboid collision bed provides artifact-free 120Hz physics contacts across the 1.6+ km spline without mesh seam snags.
- **Failures / Conflicts**:
  - Same mathematical Window 3b replay conflict as Phase 1 (isolated scrub at 95 mph expects 0.8G decel from steer alone). Left on `phase3-world` per Rule 1.
- **Next**: Phase 4: Stage Gameplay + HUD.

---

### Phase 4: Stage Gameplay + HUD
- **Status**: COMPLETE & VERIFIED
- **Branch**: `phase4-gameplay`
- **Verification Artifacts**:
  - `overnight/phase4/keyboard_feel_demo.mp4` (2.87 MB, 1280x720 @ 30 fps, H.264, < 20 MB)
  - `overnight/phase4/keyboard_feel_demo.csv` (390 frames of telemetry)
  - 8 Verification Screenshots:
    - `screenshot_01_stage_start_countdown.png`: Start countdown sequence ("3") with Gate 1 twin red-white striped posts.
    - `screenshot_02_gate_passage_and_split_pill.png`: Gate passage with orange split-time pill active (`+00:01.83`).
    - `screenshot_03_pace_note_box_curve_icon.png`: Pace-note box with crest arrow and distance ahead.
    - `screenshot_04_hud_parity_rev_arc_and_m.png`: High-speed HUD parity with rev arc, gear 3 and "M", full throttle bar.
    - `screenshot_05_clutch_and_shift_indicators.png`: Upshift with "CLUTCH" indicator active and rev dip.
    - `screenshot_06_distance_odometer_miles.png`: Distance odometer reading in miles and input bar deflection.
    - `screenshot_07_mid_stage_gate_progression.png`: Mid-stage gate progression with twin posts and pine forest backdrop.
    - `screenshot_08_stage_finish_banner.png`: Stage finished banner with final recorded time and restart prompt.
  - `overnight/phase4/README.md`: Complete documentation of gate distribution, timer, split pills, curvature pace note math, HUD parity, and frame time.
- **Test Results**:
  - `npm run build`: PASS
  - `npm run test:keyboard`: PASS (14/14 passed)
  - `npm run test:v6`: PASS (All criteria passed)
  - `npm run test:user-session`: PASS (Peak camera yaw Δ 0.65° <= 3.0°)
  - `npm run test:reverse`: PASS (All 7 regression tests passed)
  - `npm run test:browser-sync`: PASS (Peak speed divergence 0.56 mph <= 2.0 mph)
  - `npm run measure:v4`: PASS (All tests complete)
  - `npm run measure:v1`: PASS
- **Thresholds Changed**: NONE (Rule 2 strictly adhered to).
- **Assumptions**:
  - 80m lookahead distance along Catmull-Rom spline provides optimal advance warning for driver pace notes across 60–120 mph speeds.
- **Failures / Conflicts**:
  - Same mathematical Window 3b replay conflict as Phase 1 (isolated scrub at 95 mph expects 0.8G decel from steer alone). Left on `phase4-gameplay` per Rule 1.
- **Next**: Phase 5: Audio (Web Audio procedural synthesis: engine harmonic ladder, shift pitch dip, throttle brightness, exhaust pops, tyre skid noise, gravel/wind noise, brakes).
