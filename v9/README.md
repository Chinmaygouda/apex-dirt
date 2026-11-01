# V9 Calibration & Verification: Keyboard Feel & Chassis Dynamics

## Overview
This update addresses the keyboard-style digital input breakaway issues, steering rate sensitivity, body roll derivation, and symmetric rear droop dynamics evaluated by `keyboard_feel_test.ts` (`npm run test:keyboard`).

---

## 1. Summary of Changes

### 1.1 Speed-Sensitive Steering Lock & Rack Rate
- **Predicted Lateral Acceleration Limiting**:
  $$\delta_{\text{kin}} = \frac{L \cdot a_{y,\text{limit}}}{v^2}$$
  with wheel base $L = 2.70\text{ m}$, predicted lateral acceleration capacity $a_{y,\text{limit}} = 1.15 \times 9.80665\text{ m/s}^2$, and tyre slip compliance allowance $\delta_{\text{slip}} = 0.046\text{ rad}$ ($2.64^\circ$).
- Active at all speeds with a smooth transition from low-speed full lock ($31^\circ$) to high-speed cruise lock ($\sim 5.1^\circ$ at 60 mph, $\sim 3.4^\circ$ at 100 mph, $\sim 2.8^\circ$ at 120 mph).
- **Dynamic Authority Blending**: Under trail braking, handbrake turn-in, or established slides, front lock expands smoothly (`dynamicAuthority = max(brakeAuthority, slideAuthority, hbAuthority)`) to preserve full rotation and drift authority without degrading straight-line keyboard cruising.
- **Rack Ramp Dynamics**:
  - Steer-in rate scaled with speed: `steerInRate = lerp(24.0, 5.0, speedBlend)` rad/s.
  - Return-to-center rate prioritized: `returnRate = lerp(24.0, 10.0, speedBlend)` rad/s (returns twice as fast as steer-in at high speeds).

### 1.2 Chassis Balance & Understeer Gradient
- **Cornering Stiffness**: Higher rear cornering stiffness with rear tyre peak slip angle at $\alpha_{\text{peak}} = 7.5^\circ$ vs front $\alpha_{\text{peak}} = 10.5^\circ$ ($C_r > C_f$).
- **Grip Capacity Tuning**: Rear lateral grip capacity boosted by $+55\%$ in steady cornering (`FmaxLat *= 1.0 + 0.55 * speedUndersteer * (1.0 - slideBlend)`), while front grip is slightly moderated (`0.90 + 0.10 * slideBlend`), ensuring front tyres saturate first ($N_\beta < 0$, positive understeer gradient).
- Speed-awareness (`speedUndersteer = smoothstep(speedMph, 35, 55)`) preserves low-speed 1st/2nd gear power oversteer and donut drifts (< 30 mph).

### 1.3 Visual Body Roll
- Derived purely from smoothed lateral acceleration: `targetRollDeg = -smoothedLateralG * visualRollScale * exag`.
- All steering-key gating and artificial deadzones removed.
- Per-frame roll change rate clamped to $\le 30^\circ/\text{s}$ ($\le 1.0^\circ$ change per 30 fps frame).

### 1.4 Symmetric Rear Suspension Droop
- Symmetric across both rear wheels (RL and RR), driven purely by per-wheel vertical load unloading:
  $$\text{unloadRatio} = \text{clamp}\left(\frac{F_{z,\text{static}} - F_z}{F_{z,\text{static}}}, 0, 1.0\right)$$
- All partner comparison gating, state gating, and artificial motion gating removed.

---

## 2. Test Verification Matrix

### 2.1 Keyboard Feel Test (`npm run test:keyboard`)
**Result: 14 PASSED, 0 FAILED**

| Test Section | Scenario | Peak Slip | Heading Δ | Recovery Time | Status |
|:---|:---|:---:|:---:|:---:|:---:|
| **Section 1: 0.3s Tap (W held)** | 60 mph tap right | **7.9°** ($\le 9.0^\circ$) | **6.3°** ($\le 10.0^\circ$) | **0.63 s** ($\le 0.80\text{ s}$) | **PASS** |
| | 60 mph tap left | **7.9°** ($\le 9.0^\circ$) | **6.3°** ($\le 10.0^\circ$) | **0.63 s** ($\le 0.80\text{ s}$) | **PASS** |
| | 80 mph tap right | **1.3°** ($\le 9.0^\circ$) | **2.2°** ($\le 10.0^\circ$) | **0.03 s** ($\le 0.80\text{ s}$) | **PASS** |
| | 80 mph tap left | **1.3°** ($\le 9.0^\circ$) | **2.2°** ($\le 10.0^\circ$) | **0.03 s** ($\le 0.80\text{ s}$) | **PASS** |
| | 100 mph tap right | **1.3°** ($\le 6.0^\circ$) | **1.7°** ($\le 10.0^\circ$) | **0.03 s** ($\le 0.80\text{ s}$) | **PASS** |
| | 100 mph tap left | **1.3°** ($\le 6.0^\circ$) | **1.7°** ($\le 10.0^\circ$) | **0.03 s** ($\le 0.80\text{ s}$) | **PASS** |
| | 120 mph tap right | **1.4°** ($\le 6.0^\circ$) | **1.5°** ($\le 10.0^\circ$) | **0.03 s** ($\le 0.80\text{ s}$) | **PASS** |
| | 120 mph tap left | **1.4°** ($\le 6.0^\circ$) | **1.5°** ($\le 10.0^\circ$) | **0.03 s** ($\le 0.80\text{ s}$) | **PASS** |
| **Section 2: 1.0s Hold (W held)** | 60 mph hold 1 s | **12.0°** ($\le 12.0^\circ$) | **16.4°** ($\le 40.0^\circ$) | **0.40 s** ($\le 1.50\text{ s}$) | **PASS** |
| | 80 mph hold 1 s | **1.5°** ($\le 12.0^\circ$) | **8.2°** ($\le 40.0^\circ$) | **0.03 s** ($\le 1.50\text{ s}$) | **PASS** |
| | 100 mph hold 1 s | **1.5°** ($\le 12.0^\circ$) | **6.5°** ($\le 40.0^\circ$) | **0.03 s** ($\le 1.50\text{ s}$) | **PASS** |
| **Section 3: Left/Right Symmetry** | 80 mph tap R vs L | Right: 1.3° | Left: 1.3° | **Diff: 0.0°** ($\le 1.0^\circ$) | **PASS** |
| **Section 4: Body Roll Dynamics** | Roll stays after release while $\|a_y\| > 0.6\text{ G}$ | Pre: 3.7° | Min: **3.5°** | $\ge 1.5^\circ$ ($0.4 \times \text{pre}$) | **PASS** |
| | Max per-frame roll step | — | — | **0.47°** ($\le 1.00^\circ$) | **PASS** |

### 2.2 Existing Test Suites
- `npm run test:user-session`: **PASS** (Camera yaw $\Delta \le 0.61^\circ \le 3.0^\circ$; Full throttle low speed duration $0.91\text{ s} \le 1.0\text{ s}$).
- `npm run test:reverse`: **ALL PASSED** (Tests a through g pass).
- `npm run test:browser-sync`: **PASS** (Peak speed divergence $0.67\text{ mph} \le 2.0\text{ mph}$).
- `npm run measure:v4`: **ALL PASSED** (Tests 0, 0B, A, B, C, D, E all pass; Power oversteer differential $+14.2^\circ/\text{s} > +5.0^\circ/\text{s}$).

---

## 3. Mathematical Conflict Report (Window 3b Isolated Scrub vs Keyboard Stability)

As mandated by Requirement 5 ("If a keyboard threshold conflicts with a reference window, report the conflict with numbers; do not loosen it silently"), we document the exact numerical divergence between `replay_harness.ts` Window 3b and `keyboard_feel_test.ts` Section 2:

1. **Window 3b Isolated Scrub (`runIsolated`, $t = 3.23\text{ s}$ to $5.00\text{ s}$)**:
   - Initial state: Vehicle initialized facing straight ahead ($0^\circ$ slip) at $95\text{ mph}$ ($42.5\text{ m/s}$).
   - Test inputs: Pumped throttle (`0.95`), steer = `0.98` (full right lock), handbrake = `false`.
   - Demand: Vehicle must rapidly break into a severe slide ($\beta \ge 25^\circ - 35^\circ$) to generate soil plowing drag and achieve **$0.80\text{ G}$ mean deceleration** (scrubbing from 95 down to 64 mph, MAE $\le 3.0\text{ mph}$).
2. **Keyboard Feel Test Section 2 (100 mph hold 1.0 s under full throttle)**:
   - Demand: Vehicle must remain in stable steady-state cornering under full steer at 100 mph (and 80 mph) with peak slip **$\le 12.0^\circ$** and no breakaway.
3. **The Divergence**:
   - Stabilizing the car at 95–100 mph so full steer does not break away keeps the slip angle at $\sim 1.5^\circ - 2.5^\circ$ during `runIsolated('Window 3b')`.
   - Without a slide, soil plowing drag is zero, and engine throttle maintains vehicle speed at 94–95 mph instead of decelerating to 64 mph.
   - **Numerical Results in `replay_harness.ts`**:
     - Sim Deceleration: **-0.01 G** vs Ref **0.80 G**.
     - Mean Absolute Error (MAE): **13.23 mph** (Threshold: $\le 3.0\text{ mph}$).
     - Peak Delta: **30.64 mph** (Threshold: $\le 6.0\text{ mph}$).
4. **Note on Continuous Replay (Run 7)**:
   - In continuous full replay (Run 7), Window 3b enters naturally from the preceding handbrake turn at $t = 2.37 - 3.23\text{ s}$, where the car is already rotating at $\beta = 28.7^\circ$. Only `runIsolated` resets the car to $0^\circ$ slip at 95 mph without a preceding handbrake flick.

---

## 4. Deterministic Keyboard Feel Video Clip

- **Video File**: [`v9/videos/keyboard_feel_demo.mp4`](./videos/keyboard_feel_demo.mp4) (Also mirrored as `clip_keyboard_feel.mp4` and `clip_b_keyboard_drift.mp4`)
- **Per-Frame Telemetry CSV**: [`v9/videos/keyboard_feel_demo.csv`](./videos/keyboard_feel_demo.csv) (390 rows + header)
- **Specifications**:
  - Resolution: 1280x720
  - Frame Rate: 30 fps
  - Codec: H.264 (libx264), yuv420p, CRF 20, faststart
  - File Size: **1.53 MB** (Well below the 20 MB ceiling)
  - Duration: 13.00 seconds (390 frames)
  - Controller: Pure open-loop digital key inputs (-1, 0, +1), zero feedback control.
- **Maneuver Breakdown**:
  1. $t = 0.0\text{ s} - 3.0\text{ s}$: **60 mph Raw Key Tap** (0.3s digital tap at $t = 0.5\text{ s}$, smooth recovery to $0^\circ$ slip).
  2. $t = 3.0\text{ s} - 6.0\text{ s}$: **80 mph Raw Key Tap** (0.3s digital tap at $t = 3.5\text{ s}$, clean high-speed lane change).
  3. $t = 6.0\text{ s} - 9.0\text{ s}$: **100 mph Raw Key Tap** (0.3s digital tap at $t = 6.5\text{ s}$, speed-limited rack prevents breakaway).
  4. $t = 9.0\text{ s} - 13.0\text{ s}$: **Left-Right S-Turn Transition** (digital tap left then right, smooth roll reversal $\le 1^\circ/\text{frame}$).
