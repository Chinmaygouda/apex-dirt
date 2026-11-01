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
- **Next**:
  - Phase 2: Effects (exhaust pops, tyre smoke and dust, persistent tyre tracks, camera horizon tilt, FOV, sun glare).
