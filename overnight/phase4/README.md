# Phase 4: Stage Gameplay + HUD Telemetry Parity

## Overview & Verified Deliverables
In Phase 4, the rally stage gameplay infrastructure and broadcast HUD telemetry system were implemented with full parity:
1. **20 Checkpoint Gates**:
   - Twin red-white striped posts (height 3.2m, width 0.38m, 6 alternating red/white bands, spaced 8.8m apart) positioned along the 1.6+ km 3D spline.
   - Each post features a dark numeral plaque oriented perpendicular to track tangent.
   - Gates span from $u = 0.04$ to $u = 0.98$ with lateral crossing detection corridor ($\le 6.5\text{m}$).
2. **Stage Timer & Start Countdown**:
   - High-precision stage timer displaying `MM:SS.ms` format with tabular monospace numerals.
   - 3-second animated countdown sequence (`3` -> `2` -> `1` -> `GO!`) before clock initiation.
   - Stage completion banner displaying recorded final time upon crossing gate 20.
   - Stage restart bound to `R` key, resetting car position to start line facing tangent with 0 velocity.
   - Best stage time persisted across sessions via browser `localStorage` (`apex_dirt_best_time`).
3. **Gate Progression & Orange Split-Time Pill**:
   - Top banner dynamically displays `"GATE x OF 20"` badge with cyan highlight (`#38BDF8`).
   - Crossing each checkpoint gate triggers an orange split-time pill (`#FF6D00`) beneath the stage banner for ~1.1s (e.g. `+00:01.83`).
4. **Curvature-Driven Pace-Note Box**:
   - Evaluates track geometry 60–100m ahead along the 3D Catmull-Rom spline ($u + 80\text{m}$).
   - Computes horizontal cross-product of tangent vectors $\vec{v}_1 \times \vec{v}_2$ to determine turn direction (Left vs. Right) and severity (Hairpin 1 to Gentle 6, or Flat/Crest).
   - Dynamically renders curve arrow icon and bold callout text (`"HAIRPIN LEFT"`, `"4 RIGHT"`, `"CREST"`, `"FLAT OUT"`).
   - Border color is coded by severity: Red (`#EF4444`) for hairpin/acute, Amber (`#F59E0B`) for medium curves, Yellow (`#EAB308`) for fast/flat.
5. **HUD Parity**:
   - **Distance Odometer**: Precision distance counter in miles (`0.00 mi`), updated every frame.
   - **Three Input Bars**:
     - `STEER`: Bilateral bar with center zero line and dynamic deflection.
     - `THROTTLE`: High-contrast green bar (`#22C55E`, 0–100%).
     - `BRAKE`: High-contrast red bar (`#EF4444`, 0–100%).
   - **Analog Rev Arc Speedometer**:
     - 270° circular rev arc (135° to 405°) with smooth gradient sweep (`#38BDF8` cyan -> `#EAB308` amber -> `#EF4444` red).
     - Redline tick mark at 7,200 RPM.
     - Large gear numeral (`1`–`5`, `N`, `R`) accompanied by manual `"M"` badge.
     - Large digital speed readout in MPH.
   - **Status Badges**:
     - `"HB"` handbrake indicator: Illuminates bright red (`#DC2626`) when active.
     - `"CLUTCH"` shift indicator: Illuminates amber (`#F59E0B`) during gear engagement gaps.
     - `"RWD"` / `"AWD"` drivetrain indicator badge.

---

## Measured Performance & Telemetry Validation

| Metric | Measured Value | Target / Requirement | Status |
| :--- | :--- | :--- | :--- |
| **Total Checkpoint Gates** | 20 gates | Exactly 20 gates | **PASS** |
| **Gate Post Geometry** | Twin red-white striped posts (3.2m height, 8.8m spacing) | Twin red-white striped posts | **PASS** |
| **Start Countdown** | 3.0s animated sequence (`3` -> `2` -> `1` -> `GO!`) | 3s countdown | **PASS** |
| **Gate Split-Time Pill** | 1.1s orange pill (`#FF6D00`) at gate crossing | ~1.0s orange split-time pill | **PASS** |
| **Pace-Note Lookahead** | Evaluated at 80m ahead (60–100m window) | 60–100m ahead | **PASS** |
| **Pace-Note Curvature Math** | $\vec{v}_1 \times \vec{v}_2$ cross product severity 1–6 | Curvature from spline | **PASS** |
| **Distance Counter** | Precision miles readout (`X.XX mi`) | Distance counter in miles | **PASS** |
| **Input Bars** | Steer (bilateral), Throttle (0-100%), Brake (0-100%) | Three input bars | **PASS** |
| **Speedometer Parity** | Gradient rev arc, gear with 'M', digital speed in MPH | Rev arc with gear & 'M' | **PASS** |
| **Indicators** | Active HB (red), Clutch (amber), Drivetrain badges | Handbrake and clutch indicators | **PASS** |
| **Stage Reset** | 'R' key resets position, velocity, and gates | Restart functionality | **PASS** |
| **Best Time Persistence** | Stored in `localStorage['apex_dirt_best_time']` | Best time in localStorage | **PASS** |
| **Video File Size** | 2.87 MB | < 20 MB | **PASS** |
| **Video Specs** | 1280x720, 30 fps, H.264, deterministic 120 Hz physics | 1280x720, 30 fps, H.264 | **PASS** |
| **Frame Time** | 5.2 – 7.6 ms (> 130 FPS equivalent) | >= 60 FPS | **PASS** |

---

## Verification Artifacts
- **Deterministic Video**: `keyboard_feel_demo.mp4` (2.87 MB, 1280x720 @ 30 fps, H.264, burned-in telemetry overlay)
- **Per-Frame Telemetry CSV**: `keyboard_feel_demo.csv` (390 frames of telemetry)
- **Screenshots (8 Keyframes)**:
  1. `screenshot_01_stage_start_countdown.png`: Start countdown "3" with Gate 1 twin red-white striped posts and HUD parity.
  2. `screenshot_02_gate_passage_and_split_pill.png`: Gate passage with orange split-time pill active (`+00:01.83`).
  3. `screenshot_03_pace_note_box_curve_icon.png`: Pace-note box showing crest arrow and distance ahead.
  4. `screenshot_04_hud_parity_rev_arc_and_m.png`: High-speed HUD parity with rev arc, gear 3 and "M", full throttle bar.
  5. `screenshot_05_clutch_and_shift_indicators.png`: Upshift with "CLUTCH" indicator active and rev dip.
  6. `screenshot_06_distance_odometer_miles.png`: Distance odometer reading in miles and input bar deflection.
  7. `screenshot_07_mid_stage_gate_progression.png`: Mid-stage gate progression with twin posts and pine forest backdrop.
  8. `screenshot_08_stage_finish_banner.png`: Stage finished banner with final recorded time and restart prompt.
