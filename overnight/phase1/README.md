# Phase 1: Keyboard Feel + Body Motion Verification Report

## 1. Executive Summary
Phase 1 eliminates keyboard snap breakaway at cruise speeds, slows the rack rate for digital inputs at speed, restores faster centring, provides an understeer gradient to prevent mid-corner spin, and derives visual body roll purely from smoothed lateral acceleration while making rear suspension droop symmetric and load-driven.

All 14 test cases in `npm run test:keyboard` pass with zero failures.

---

## 2. Test Matrix & Results

### A. Keyboard Feel Suite (`npm run test:keyboard`)
| Test Case | Conditions | Metric Threshold | Measured Value | Result |
| :--- | :--- | :--- | :--- | :---: |
| **60 mph Tap Right** | 0.3s digital Right tap, W held | Peak slip $\le 9.0^\circ$, Yaw $\Delta \le 10^\circ$, Recov $\le 0.8\text{ s}$ | Peak slip: $7.9^\circ$, Yaw $\Delta$: $6.3^\circ$, Recov: $0.63\text{ s}$ | **PASS** |
| **60 mph Tap Left** | 0.3s digital Left tap, W held | Peak slip $\le 9.0^\circ$, Yaw $\Delta \le 10^\circ$, Recov $\le 0.8\text{ s}$ | Peak slip: $7.9^\circ$, Yaw $\Delta$: $6.3^\circ$, Recov: $0.63\text{ s}$ | **PASS** |
| **80 mph Tap Right** | 0.3s digital Right tap, W held | Peak slip $\le 9.0^\circ$, Yaw $\Delta \le 10^\circ$, Recov $\le 0.8\text{ s}$ | Peak slip: $1.3^\circ$, Yaw $\Delta$: $2.2^\circ$, Recov: $0.03\text{ s}$ | **PASS** |
| **80 mph Tap Left** | 0.3s digital Left tap, W held | Peak slip $\le 9.0^\circ$, Yaw $\Delta \le 10^\circ$, Recov $\le 0.8\text{ s}$ | Peak slip: $1.3^\circ$, Yaw $\Delta$: $2.2^\circ$, Recov: $0.03\text{ s}$ | **PASS** |
| **100 mph Tap Right** | 0.3s digital Right tap, W held | Peak slip $\le 6.0^\circ$, Yaw $\Delta \le 10^\circ$, Recov $\le 0.8\text{ s}$ | Peak slip: $1.3^\circ$, Yaw $\Delta$: $1.7^\circ$, Recov: $0.03\text{ s}$ | **PASS** |
| **100 mph Tap Left** | 0.3s digital Left tap, W held | Peak slip $\le 6.0^\circ$, Yaw $\Delta \le 10^\circ$, Recov $\le 0.8\text{ s}$ | Peak slip: $1.3^\circ$, Yaw $\Delta$: $1.7^\circ$, Recov: $0.03\text{ s}$ | **PASS** |
| **120 mph Tap Right** | 0.3s digital Right tap, W held | Peak slip $\le 6.0^\circ$, Yaw $\Delta \le 10^\circ$, Recov $\le 0.8\text{ s}$ | Peak slip: $1.4^\circ$, Yaw $\Delta$: $1.5^\circ$, Recov: $0.03\text{ s}$ | **PASS** |
| **120 mph Tap Left** | 0.3s digital Left tap, W held | Peak slip $\le 6.0^\circ$, Yaw $\Delta \le 10^\circ$, Recov $\le 0.8\text{ s}$ | Peak slip: $1.4^\circ$, Yaw $\Delta$: $1.5^\circ$, Recov: $0.03\text{ s}$ | **PASS** |
| **60 mph Hold 1.0s** | 1.0s Right hold, then release | Peak slip $\le 12.0^\circ$, Yaw $\Delta \le 40^\circ$, Recov $\le 1.5\text{ s}$ | Peak slip: $11.9^\circ$, Yaw $\Delta$: $16.1^\circ$, Recov: $0.37\text{ s}$ | **PASS** |
| **80 mph Hold 1.0s** | 1.0s Right hold, then release | Peak slip $\le 12.0^\circ$, Yaw $\Delta \le 40^\circ$, Recov $\le 1.5\text{ s}$ | Peak slip: $1.5^\circ$, Yaw $\Delta$: $8.2^\circ$, Recov: $0.03\text{ s}$ | **PASS** |
| **100 mph Hold 1.0s** | 1.0s Right hold, then release | Peak slip $\le 12.0^\circ$, Yaw $\Delta \le 40^\circ$, Recov $\le 1.5\text{ s}$ | Peak slip: $1.5^\circ$, Yaw $\Delta$: $6.5^\circ$, Recov: $0.03\text{ s}$ | **PASS** |
| **L/R Symmetry** | 80 mph Tap Left vs Right | Delta peak slip $\le 1.0^\circ$ | Right: $1.3^\circ$, Left: $1.3^\circ$ ($\Delta = 0.0^\circ$) | **PASS** |
| **Roll Follows Lat G** | 70 mph Hold 1.0s then release | Roll stays $\ge 40\%$ pre-release while $\|a_y\| > 0.6\text{ G}$ | Pre-release: $3.0^\circ$, Min while sliding: $2.8^\circ$ ($\ge 1.2^\circ$) | **PASS** |
| **Roll Smoothness** | Max per-frame roll jump | Frame $\Delta \text{roll} \le 1.0^\circ$ at 30 fps | Measured max frame jump: $0.37^\circ$ | **PASS** |

**Summary**: 14 PASSED, 0 FAILED.

---

### B. Full Maneuver V6 Integration (`npm run test:v6`)
- **130 mph Straight**: Speed 132.1 mph ($\ge 129$), Yaw Dev 0.00° ($< 1^\circ$), Roll 0.00° ($\le 1^\circ$), Droop 0.00 cm ($\le 0.05\text{ cm}$) -> **PASS**
- **Heavy Straight Braking**: Decel 2.01 G (1.7-2.1 G), Pitch Dive -0.98° (-1.5° to -0.5°) -> **PASS**
- **Handbrake Turn-in & Rotation**: Entry Speed 116.9 mph (~115 mph), Peak Slip 32.8° (30-40°), Yaw $\Delta$ 33.9° ($\ge 25^\circ$), Rear Droop 13.0 cm ($\ge 5\text{ cm}$) -> **PASS**
- **Drift Out & Slide Scrub**: Decel 1.11 G (0.85-1.15 G), Outward Roll 6.78° (4.0°-8.5°) -> **PASS**
- **Power Out Acceleration**: Speed Gain +25.3 mph ($\ge 15\text{ mph}$), Final Slip 0.0° ($\le 2^\circ$) -> **PASS**

---

### C. Other Core Regression Suites
- `npm run test:user-session`: **PASS** (Camera yaw $\Delta \le 0.65^\circ \le 3.0^\circ$, full throttle $\le 0.91\text{ s} \le 1.0\text{ s}$).
- `npm run test:reverse`: **ALL PASSED** (Tests a through g pass).
- `npm run test:browser-sync`: **PASS** (Peak speed divergence: $0.56\text{ mph} \le 2.0\text{ mph}$).
- `npm run measure:v4`: **ALL PASSED** (Power oversteer differential $+14.2^\circ/\text{s}$, slide scrub decel 0.91 G).
- `npm run measure:v1`: **ALL PASSED**.

---

## 3. Physical Conflict Report: Window 3b Isolated Scrub vs High-Speed Keyboard Stability

Per Rule 2 ("If a new check conflicts with a reference replay window, report the conflict with numbers"), the following physical conflict exists between `test:keyboard` Section 2 and `replay_harness.ts` Window 3b:

| Characteristic | `keyboard_feel_test.ts` (Section 2) | `replay_harness.ts` (Window 3b Isolated) |
| :--- | :--- | :--- |
| **Initial State** | Straight-line cruise at $80 - 100\text{ mph}$ | Resets straight at $95\text{ mph}$ ($v_x=42.5\text{ m/s}$, slip = $0^\circ$) |
| **Driver Inputs** | Steer held 1.0s under full throttle ($W = 1.0$) | Steer = 0.98 held under throttle ($W \approx 0.8 - 0.95$) |
| **Test Demand** | **Must NOT break away into a spin/slide**.<br>Demands peak slip $\le 12.0^\circ$ (steady-state cornering). | **Demands $0.80\text{ G}$ mean deceleration** purely from slide scrub drag. |
| **Physics Conflict** | Decelerating at $95\text{ mph}$ on dirt under forward engine power requires a broadside slide ($\beta \ge 25^\circ - 35^\circ$) to produce soil plowing resistance. Limiting high-speed lock prevents breakaway, keeping slip at $\sim 1.5^\circ - 2.0^\circ$. |
| **Measured Numbers** | **PASS** (Peak slip $1.5^\circ \le 12.0^\circ$) | **Sim Decel: -0.00 G** vs Ref: 0.80 G<br>**MAE: 13.10 mph** (Threshold $\le 3.0\text{ mph}$)<br>**Peak $\Delta$: 30.52 mph** (Threshold $\le 6.0\text{ mph}$) |

*Continuous Context Note:* In continuous driving (Run 7 of `replay_harness.ts`), Window 3b enters directly from the preceding handbrake slide ($t = 2.37 - 3.23\text{ s}$), where the vehicle is already sideways at $\beta = 29.5^\circ$, and soil scrub continues naturally. The conflict only manifests in `runIsolated('Window 3b')` because the isolated harness resets the chassis to straight-ahead alignment at $95\text{ mph}$.

---

## 4. Visual Verification Artifacts

All artifacts are generated at 1280x720 with burned-in telemetry HUD and saved in this directory:

- **Video**: `keyboard_feel_demo.mp4` (1.46 MB, 1280x720, 30 fps, H.264, yuv420p)
- **Telemetry CSV**: `keyboard_feel_demo.csv` (390 rows @ 30 fps)
- **Screenshots**:
  1. `screenshot_01_60mph_tap_peak.png` (t = 1.0s, 60 mph tap peak)
  2. `screenshot_02_60mph_recovered.png` (t = 2.0s, 60 mph recovered)
  3. `screenshot_03_80mph_tap_peak.png` (t = 4.0s, 80 mph tap peak)
  4. `screenshot_04_80mph_recovered.png` (t = 5.0s, 80 mph recovered)
  5. `screenshot_05_100mph_tap_peak.png` (t = 7.0s, 100 mph tap peak)
  6. `screenshot_06_100mph_recovered.png` (t = 8.0s, 100 mph recovered)
  7. `screenshot_07_sturn_left_flick.png` (t = 10.0s, S-turn left flick)
  8. `screenshot_08_sturn_right_flick.png` (t = 11.5s, S-turn right flick)
