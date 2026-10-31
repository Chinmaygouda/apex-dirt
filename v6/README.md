# V6 Simulation Replay Verification Screenshots & Telemetry

This directory contains the simulation verification screenshots and telemetry captured for the V6 rally drift maneuver, verifying body pitch/roll dynamics, suspension droop calibration, and cornering attitude against the reference dataset.

All images are direct low-poly in-engine simulation captures and strictly under 5 MB.

## Files & Descriptions

| Filename | Timestamp | Speed | Slip Angle | Roll Lean | Description |
|:---|:---:|:---:|:---:|:---:|:---|
| [`replay_t2_0.png`](./replay_t2_0.png) | 2.00 s | 132.1 mph | -3.4° | 0.0° | Straight high-speed braking approach. Verifies level body attitude (< 1° roll) and zero droop (0.0 cm) on straights. |
| [`replay_t2_5.png`](./replay_t2_5.png) | 2.50 s | 114.1 mph | 15.9° | 0.6° | Handbrake turn-in and rotation onset into the right-hand corner. |
| [`replay_t2_8.png`](./replay_t2_8.png) | 2.80 s | 106.5 mph | 21.4° | 0.6° | Dynamic rotation development with transient inside-rear wheel suspension extension. |
| [`replay_t3_2.png`](./replay_t3_2.png) | 3.20 s | 97.3 mph | 21.8° | 0.1° | Corner apex transition into the soil-plowing slide scrub phase. |
| [`replay_t3_8.png`](./replay_t3_8.png) | 3.80 s | 81.9 mph | 33.7° | 6.2° | Sustained dirt slide scrub showing calibrated steady suspension droop (7.6 cm settled) and outward body roll lean. |
| [`replay_t4_1.png`](./replay_t4_1.png) | 4.10 s | 73.9 mph | 30.7° | 6.9° | Full slide scrub scrub progression prior to counter-steer unwinding and power exit. |
| [`v5_replay_metrics.json`](./v5_replay_metrics.json) | — | — | — | — | Exact telemetry export across the 6 key verification timestamps (speed, slip, roll, pitch, ride height). |
