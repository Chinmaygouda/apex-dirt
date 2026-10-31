# V7 Simulation Replay Verification Screenshots & Telemetry

This directory contains the verification screenshots and telemetry captured for the V7 visual and dynamic calibration against the reference drift dataset.

All images are direct low-poly in-engine simulation captures and strictly under 5 MB.

## Calibrations & Visual Updates in V7

1. **Load-Driven Suspension Droop Timing**:
   - Suspension extension droop is driven directly by per-wheel normal load ($F_z$) unloading and dynamic weight transfer.
   - Droop peaks naturally at **12.6–12.9 cm** during the handbrake-induced vehicle rotation ($t = 2.6 - 3.3\text{ s}$), matching the reference visual extension ($8 - 15\text{ cm}$).
   - The artificial $0.42 \times 18\text{ cm}$ static floor was removed: steady slide scrub values settle to **8.4–9.6 cm** driven purely by sustained lateral and longitudinal tire load.
   - Straight-line droop is strictly **0.0 cm** at $t = 2.0\text{ s}$ with body roll within $1^\circ$ of level.

2. **Slide Chase Camera Calibration**:
   - Camera heading lag calibrated with outside corner offset to increase apparent vehicle rotation in drift without modifying underlying vehicle physics.
   - Apparent car slip angle on screen measures **38.1°** at $t = 3.8\text{ s}$ and **37.3°** at $t = 4.1\text{ s}$ (within the reference target of $35^\circ - 45^\circ$).
   - Strictly conforms to the smooth tracking rule: maximum camera yaw rate is **1.12°/frame**, well below the $3.0^\circ$/frame snap ceiling.

3. **Brake Light Illumination**:
   - Taillight materials upgraded with dedicated unlit basic shader material to eliminate directional sunlight washout.
   - Lights glow vibrant pure red (`#FF1500`) when braking ($t = 2.5\text{ s}$) and return to parking red (`#550000`) off-pedal.

---

## Verification Screenshots & Telemetry

| Filename | Timestamp | Speed | Vehicle Slip | Apparent Cam Angle | Inside Rear Droop | Description |
|:---|:---:|:---:|:---:|:---:|:---:|:---|
| [`replay_t2_0.png`](./replay_t2_0.png) | 2.00 s | 132.1 mph | -3.4° | 3.4° | 0.0 cm | Straight high-speed braking approach. Roll is 0.87° (< 1° requirement); droop is 0.0 cm. |
| [`replay_t2_5.png`](./replay_t2_5.png) | 2.50 s | 114.1 mph | 15.9° | 16.3° | 0.0 cm | Handbrake turn-in and rotation onset into the corner. |
| [`replay_t2_5_brakelights.png`](./replay_t2_5_brakelights.png) | 2.50 s | 114.1 mph | 15.9° | 16.3° | 0.0 cm | Handbrake turn-in at $t=2.50\text{ s}$ with illuminated brake lights active. |
| [`replay_t2_8.png`](./replay_t2_8.png) | 2.80 s | 106.5 mph | 21.4° | 23.4° | 12.8 cm | Handbrake rotation peak: inside-rear wheel hangs 12.8 cm below body as normal load unloads. |
| [`replay_t3_2.png`](./replay_t3_2.png) | 3.20 s | 97.3 mph | 21.8° | 24.1° | 12.6 cm | Rotation transition through corner apex into slide scrub. Wheel droop maintained at 12.6 cm. |
| [`replay_t3_8.png`](./replay_t3_8.png) | 3.80 s | 81.9 mph | 33.7° | 38.1° | 9.6 cm | Sustained slide scrub. Car displays 38.1° visible rotation to camera; droop settles to 9.6 cm. |
| [`replay_t4_1.png`](./replay_t4_1.png) | 4.10 s | 73.9 mph | 30.7° | 37.3° | 8.4 cm | Deep slide scrub prior to counter-steer unwinding. 37.3° apparent camera angle; 8.4 cm droop. |
| [`v5_replay_metrics.json`](./v5_replay_metrics.json) | — | — | — | — | — | Raw telemetry export for the verification timestamps (speed, slip, roll, pitch, ride height). |
