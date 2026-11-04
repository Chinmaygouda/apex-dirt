# Project: Apex Dirt Rally Simulation Showcase

## Architecture
Apex Dirt is a high-fidelity retro-modern rally simulation running in the browser.
It is architected as 6 decoupled subsystems interacting via typed TypeScript contracts:
1. **Module 1: Physics Engine (`src/physics/`)**: 120 Hz Rapier3D substepping, 4-corner raycast suspension, dynamic weight transfer (dive, squat, roll), Pacejka & friction ellipse tire model, gravel slide-scrub soil plowing, and `CollisionImpulseDispatcher` utilizing Rapier `TempContactForceEvent`.
2. **Module 2: Track & Environment (`src/world/`)**: Catmull-Rom 3D spline stage (1.64 km, elevation to +16m, banked turns up to 7°), road mesh extrusion, segmented colliders, instanced pine/broadleaf forest with road-border colliders, `DayNightCycleController` (dynamic sun/moon/fog transitions), and `WildlifeCrossingManager` (interactive crossing deer/animals).
3. **Module 3: Vehicle Presentation & Cockpit (`src/vehicles/`)**: Modular Group B rally coupe assembly with detachable sub-meshes (`FrontBumperGroup`, `HoodGroup`, `RearWingGroup`), `VehicleDamageController` (localized vertex crumpling for medium impacts, dynamic rigid body physics debris for severe impacts), `CockpitController` (interior dashboard, analog dials, ±180° steering wheel, 2-bone driver arm IK with shifter flick animation), and `HeadlightController` (dual high-intensity spot lights).
4. **Module 4: Audio & Visual Effects (`src/audio/`, `src/effects/`)**: 100% procedural Web Audio synthesizer (7-harmonic engine ladder, turbo boost whine, wastegate flutter, anti-lag pops, gravel chatter, brake squeal), zero-GC instanced dust particle pool, and persistent elevation-conforming skidmark ribbons.
5. **Module 5: Game Loop, Co-Driver & HUD (`src/core/`, `src/gameplay/`, `src/ui/`)**: Fixed-timestep accumulator game loop, `CameraManager` (Key 'C' cycling Chase, Cockpit FPV, Hood), `CoDriverSystem` (spline lookahead with synchronized audio callouts and visual HUD icons 2-3s in advance), and `TelemetryHUD` (speedometer, tachometer, stage timer, split pills).
6. **Module 6: E2E Verification & Browser Automation (`test/`, scripts)**: Headless physics telemetry runners and Playwright/Puppeteer browser automation verifying canvas render, input controls, camera views, day/night headlights, collisions, and audio.

---

## Feature Inventory
Every feature extracted from specifications and requirements is assigned to a concrete milestone below:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 120 Hz Substepping Physics Loop | Fixed 1/120s substepping decoupled from browser render framerate | M1 | Blueprint §1 |
| 2 | Four-Wheel Raycast Suspension | Independent suspension raycasts with calibrated spring stiffness ($k_f=42\text{k}, k_r=54.6\text{k}$) | M1 | Blueprint §3 |
| 3 | Asymmetric Compression & Rebound Damping | Two-way damping with digressive curves ($c_{\text{comp}}=2,774/3,163, c_{\text{reb}}=3,426/3,906$) | M1 | Blueprint §3 |
| 4 | Progressive Bump Stops & Droop Limiters | Bump stop active in final 15 cm of travel (35,000 N/m); droop stop limiting axle hang | M1 | Blueprint §3 |
| 5 | Anti-Roll Bars (ARB) | Cross-axle anti-roll bar stiffness (Front 16,000 N/m, Rear 8,000 N/m) | M1 | Blueprint §3 |
| 6 | Braking Pitch Dive | Dynamic load transfer producing nose pitch dive under heavy braking (-0.98° to -1.5°) | M1 | Blueprint §4 |
| 7 | Acceleration Squat | Rearward load transfer producing rear squat under throttle (+0.8° to +1.2°) | M1 | Blueprint §4 |
| 8 | Cornering Outward Body Roll | Lateral load transfer producing outward chassis roll proportional to lateral G (4.0° - 8.5°) | M1 | Blueprint §4 |
| 9 | Pacejka & Friction Ellipse Grip | Non-linear tire traction circle clamping combined longitudinal and lateral grip | M1 | Blueprint §5 |
| 10 | Gravel Slide-Scrub Soil Plowing | Lateral plowing deceleration (0.85 - 1.15 G) under high slip angles (15° - 40°) | M1 | Blueprint §6 |
| 11 | Handbrake Slide & Yaw Rotation | Rear axle lockup inducing immediate yaw rotation and drift initiation | M1 | Blueprint §6 |
| 12 | Rapier Contact Force Event Draining | EventQueue draining TempContactForceEvents to measure collision impulses | M1 | Blueprint §8 |
| 13 | Roadside Obstacle Colliders | Static Rapier colliders on tree trunks, fences, and chevrons bordering the track | M1 | Blueprint §8 |
| 14 | Modular Detachable Vehicle Hierarchy | Vehicle mesh partitioned into FrontBumper, Hood, RearWing, and ChassisMain | M2 | Blueprint §8 |
| 15 | Localized Vertex Mesh Deformation | Mesh vertex displacement along contact normal within 0.65m radius for $2\text{k}-9\text{k}\text{ Ns}$ impacts | M2 | Blueprint §8 |
| 16 | Detachable Dynamic Rigid Body Debris | Severe impacts ($J \ge 9\text{k}\text{ Ns}$) detach bumper/hood/wing into tumbling Rapier rigid bodies | M2 | Blueprint §8 |
| 17 | Multi-Camera View Cycling (Key 'C') | Seamless cycling between Chase Camera, First-Person Cockpit FPV, and Hood/Bumper Camera | M3 | Blueprint §9 |
| 18 | First-Person Cockpit Geometry | Interior cabin with roll cage, sport bucket seats, center console, and sequential shifter | M3 | Blueprint §9 |
| 19 | Functional Dashboard Gauges | Analog tachometer needle (0-240° for 0-8500 RPM) and speedometer needle (0-220°) | M3 | Blueprint §9 |
| 20 | 3D Rotating Steering Wheel | Steering wheel rotating up to $\pm 180^\circ$ matching player steering rack angle | M3 | Blueprint §9 |
| 21 | Rigged Driver Model & Arm IK | Analytical 2-bone arm IK keeping hands gripped to wheel rim at 9 and 3 o'clock | M3 | Blueprint §9 |
| 22 | Driver Gear Shift Animation | Right arm releases wheel, flicks sequential shifter lever (120-170 ms), and returns | M3 | Blueprint §9 |
| 23 | Player-Controlled Headlights Toggle | Toggle key ('L'/'H') switching dual high-intensity SpotLights with 65-85m forward reach | M3 | Blueprint §9 |
| 24 | Catmull-Rom 3D Spline Track | 1,640m stage route with 34 control points, rolling crests up to +16m elevation | M4 | Blueprint §7 |
| 25 | Road Camber & Banking | Banked road cross-section (4° to 7°) dynamically oriented along spline curvature | M4 | Blueprint §7 |
| 26 | Dense Forest Instanced Vegetation | >800 instanced pine and broadleaf trees populating track surroundings | M4 | Blueprint §7 |
| 27 | Dynamic Day/Night Lighting Cycle | Continuous time-of-day transition: noon sunlight $\leftrightarrow$ dusk amber $\leftrightarrow$ night obsidian | M4 | Blueprint §7 |
| 28 | Interactive Crossing Wildlife AI | 3D deer/animal mesh crossing and leaping across track corridor on vehicle approach (50-75m) | M4 | Blueprint §7 |
| 29 | Co-Driver Spline Lookahead Evaluator | Spline curvature analysis 60-100m ahead classifying upcoming corner severity | M4 | Blueprint §10 |
| 30 | Co-Driver Visual HUD Pace Notes | Colored banner with corner number, arrow icon, and crest alerts 2-3s in advance | M4 | Blueprint §10 |
| 31 | Co-Driver Synthesized Voice Audio | Procedural audio callouts announcing upcoming pacenotes 2-3s before entry | M4 | Blueprint §10 |
| 32 | Zero-GC Instanced Dust Particle System | 384 pooled billboard particles scaled by wheel slip velocity and surface dryness | M5 | Blueprint §11 |
| 33 | Persistent Elevation-Conforming Skidmarks | 4 ribbon meshes (1800 segs/tyre) conforming to road elevation without Z-fighting | M5 | Blueprint §11 |
| 34 | 7-Voice Engine Harmonic Ladder | Procedural audio oscillator ladder ($f_0 = \text{RPM}/30$) with throttle lowpass brightness | M5 | Blueprint §12 |
| 35 | Turbo Whine & Wastegate Flutter | Whistling boost oscillator and multi-pulse FM flutter burst on high-RPM throttle lift | M5 | Blueprint §12 |
| 36 | 3-Component Anti-Lag Exhaust Pops | Click transient + 120 Hz sub-bass thump + crackle cluster on throttle release/downshift | M5 | Blueprint §12 |
| 37 | Surface Gravel Chatter & Wind Sound | Bandpass-filtered surface noise modulated by vehicle speed and dirt roughness | M5 | Blueprint §12 |
| 38 | Tire Skid & Brake Friction Audio | Bandpass-filtered tire scrub proportional to slip angle; metallic brake squeal | M5 | Blueprint §12 |
| 39 | AudioContext Gesture Auto-Unlock | Automatic user gesture listener unlocking Web Audio API on first interaction | M5 | Blueprint §12 |
| 40 | Telemetry HUD & Stage Timer | Digital speedometer, rev gauge, input bars, stage timer, and split-time pills | M5 | Blueprint §10 |
| 41 | Headless Regression Test Suite | Automated regression testing for keyboard feel, 130mph straight, reverse, and drift | M6 | Blueprint §13 |
| 42 | Browser Automation Test Suite | In-browser test runner testing WebGL canvas, driving inputs, and camera views | M6 | Blueprint §13 |
| 43 | In-Browser Headlight & Day/Night Verification | Automated verification of headlight illumination across day and night conditions | M6 | Blueprint §13 |
| 44 | In-Browser Collision & Damage Verification | Automated crash test verifying vertex crumpling and detached physics debris in browser | M6 | Blueprint §13 |
| 45 | Zero Fatal Errors & Clean Build Verification | Vite build and browser console reporting 0 uncaught fatal errors | M6 | Blueprint §13 |

All 45 features from the Feature Inventory are accounted for with assigned milestones.

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Physics Collision & Impulse Dispatcher | Enable Rapier ActiveEvents.CONTACT_FORCE_EVENTS and EventQueue drain; compute contact impulses $J=F\cdot\Delta t$; wire roadside colliders (trees, fences, chevrons) in track boundary; preserve 100% of existing physics invariants and regression suites | none | COMPLETE |
| M2 | Vehicle Mesh Damage & Detachable Debris | Modular vehicle hierarchy (FrontBumper, Hood, RearWing, ChassisMain); localized vertex crumple deformation ($R=0.65$m) for medium impacts; dynamic Rapier rigid body debris detachment with tumbling angular momentum for severe impacts | M1 | COMPLETE |
| M3 | Interactive Cockpit, Multi-Camera & Driver Rig | CameraManager (Chase, Cockpit FPV, Hood cycling on 'C'); interior cockpit dashboard with working analog dials; ±180° rotating steering wheel; 2-bone driver arm IK with sequential gear shift flick animation; player-controlled dual SpotLight headlights toggle on 'L'/'H' | M1 | COMPLETE |
| M4 | Track Environment Polish, Day/Night & Wildlife | Dynamic DayNightCycleController (noon $\leftrightarrow$ dusk $\leftrightarrow$ night ambient/fog/sky transitions); WildlifeCrossingManager (3D deer crossing track ahead of car); Co-driver pace note lookahead with visual HUD icons and procedural audio voice callouts | M1 | COMPLETE |
| M5 | VFX Hardening & Procedural Audio Engine | Procedural Web Audio polish: turbo boost whistle and multi-pulse wastegate flutter, anti-lag pops, continuous RPM engine harmonics, gravel chatter; instanced dust particle pool and persistent skid ribbons elevation conformity | M1 | COMPLETE |
| M6 | Final Integration & In-Browser E2E Acceptance | Full game loop integration in `main.ts`; 100% pass on E2E test suite (Tiers 1-4); Tier 5 adversarial hardening; in-browser playtesting verification (dev server, canvas, driving, headlights, damage, cameras, zero console errors) | M1, M2, M3, M4, M5, TEST_READY.md | COMPLETE |

---

## Interface Contracts

### Module 1: Physics Engine ↔ Vehicle Presentation & Damage
```typescript
export interface ICollisionContactEvent {
  contactPoint: THREE.Vector3;
  contactNormal: THREE.Vector3;
  impulseMagnitude: number; // Ns
  collidedEntity: 'tree' | 'fence' | 'chevron' | 'terrain' | 'barrier';
  targetSubMesh?: 'front_bumper' | 'hood' | 'rear_wing' | 'chassis';
}

export interface ICollisionDispatcher {
  onCollision(listener: (event: ICollisionContactEvent) => void): void;
  drainImpulses(): void;
}
```

### Module 1 & 5: Vehicle Telemetry ↔ Cockpit, Audio, VFX & HUD
```typescript
export interface IVehicleTelemetry {
  speedMph: number;
  engineRpm: number;
  currentGear: number;
  isShifting: boolean;
  throttleInput: number;
  brakeInput: number;
  steeringInput: number;
  handbrakeInput: number;
  bodyRollDeg: number;
  bodyPitchDeg: number;
  wheelSlipRatio: [number, number, number, number];
  wheelSlipAngleDeg: [number, number, number, number];
  wheelSuspensionLength: [number, number, number, number];
  headlightsOn: boolean;
}
```

### Module 2: Track & Environment ↔ Co-Driver & Wildlife
```typescript
export interface IPaceNote {
  distanceMeters: number;
  severity: 1 | 2 | 3 | 4 | 5 | 6 | 'hairpin' | 'crest' | 'flat';
  direction: 'left' | 'right' | 'straight';
  calloutText: string;
  audioClip?: string;
}

export interface ITrackQuery {
  getElevationAt(distanceArc: number): number;
  getCurvatureAt(distanceArc: number): number;
  getPaceNoteAhead(currentArc: number, lookaheadMeters: number): IPaceNote | null;
}
```

### Module 3: Camera Cycling Contract
```typescript
export type CameraMode = 'CHASE' | 'COCKPIT_FPV' | 'HOOD';

export interface ICameraManager {
  currentMode: CameraMode;
  cycleMode(): CameraMode;
  update(delta: number, carTransform: THREE.Object3D, telemetry: IVehicleTelemetry): void;
}
```

---

## Code Layout
- `src/physics/`: Rapier3D physics world, raycast suspension, tire friction, collision dispatcher.
- `src/vehicles/`: Vehicle chassis hierarchy, detachable parts, vertex deformer, cockpit, driver arm IK, headlights.
- `src/world/`: Spline track generator, road extrusion, instanced vegetation, day/night cycle, wildlife manager.
- `src/audio/`: Procedural Web Audio synthesizer (harmonics, turbo flutter, backfire pops, gravel, speech).
- `src/effects/`: Dust particle pool, persistent skidmark ribbons.
- `src/core/`: Input manager, camera manager, game loop controller.
- `src/gameplay/`: Stage manager, co-driver evaluator, checkpoint system.
- `src/ui/`: Telemetry HUD, analog gauges, pace note overlay.
- `test/`: Deterministic headless tests, integration suites, and browser automation scripts.
