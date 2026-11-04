# E2E Test Infra: Apex Dirt

## Test Philosophy
- Opaque-box, requirement-driven derived from ORIGINAL_REQUEST.md and MASTER_RALLY_BLUEPRINT.md.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.
- Multi-tier verification: deterministic headless physics runs + headless/in-browser automation executing real inputs on Vite dev server.

## Test Architecture
- **Test Runners**:
  1. `npm run test:keyboard`: 14 digital steering, throttle, and body roll response invariants.
  2. `npm run test:v6`: 5 high-speed integration criteria (130 mph stability, 2.01G braking, handbrake rotation, slide scrub, power-out).
  3. `npm run test:user-session`: 22.47s 120Hz session replay verifying camera and telemetry continuity.
  4. `npm run test:browser-sync`: Headless vs browser synchronization within 2.0 mph.
  5. `npm run test:e2e`: Comprehensive automated end-to-end suite exercising all 4 tiers.
- **Directory Layout**:
  - `test/`
    - `e2e_runner.ts`: Central test runner for Tiers 1-4.
    - `tier1_features.test.ts`: Feature coverage tests (>=5 per feature).
    - `tier2_boundaries.test.ts`: Boundary value and corner case tests (>=5 per feature).
    - `tier3_pairwise.test.ts`: Cross-feature combinations.
    - `tier4_scenarios.test.ts`: Real-world application scenarios.
    - `browser_playtest.ts`: In-browser Puppeteer/Playwright/DevTools automation script.

## Coverage Thresholds
Given 6 core requirement areas (R1 Physics, R2 Cockpit & Lights, R3 Track & Environment, R4 Damage, R5 Audio/VFX, R6 In-Browser):
- **Tier 1 (Feature Coverage)**: >= 30 test cases (>= 5 per requirement area).
- **Tier 2 (Boundary & Corner Cases)**: >= 30 test cases (limits, zero/max inputs, extreme slip angles, edge collisions).
- **Tier 3 (Cross-Feature Combinations)**: >= 15 pairwise interaction test cases.
- **Tier 4 (Real-World Scenarios)**: >= 6 realistic application scenarios (Full Stage Rally Run, Night Stage with Headlights, High-Speed Tree Crash & Debris Scatter, Wildlife Encounter Near-Miss, Handbrake Hairpin Drift with Co-Driver Audio, Cockpit FPV Shifter Lap).
- **Total Minimum Test Cases**: >= 81 test cases.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Pass Criteria |
|---|----------|--------------------|---------------|
| 1 | Full Stage High-Speed Rally Run | 120Hz physics, suspension, weight transfer, audio, HUD | Completes checkpoint sequence with stable physics and valid split times |
| 2 | Nocturnal Stage Navigation | Day/night cycle at night, headlight toggle, spot light illumination | Visibility verified with forward illumination; headlights toggle on/off |
| 3 | Severe Roadside Obstacle Collision | Rapier contact impulse, vertex crumple, detachable bumper/hood/wing | Sub-mesh detaches into tumbling dynamic rigid body; localized vertices dent |
| 4 | Wildlife Track Crossing Encounter | Wildlife AI crossing trigger, spline proximity, co-driver alert | Deer crosses track as vehicle approaches within 50-75m |
| 5 | Hairpin Drift & Handbrake Slide | Handbrake rear lockup, slide scrub, dust cloud, skidmark ribbon, audio pops | Peak slip angle 30-40°, gravel scrub decel 0.85-1.15G, dust spawned |
| 6 | Cockpit First-Person Driver Experience | Key 'C' cycling, 180° wheel, driver arm IK, gear shift flick, dials | View switches to driver eyes, wheel turns with steer, right hand shifts |
