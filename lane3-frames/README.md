# Lane 3 Deterministic Render Verification

Deterministic browser renders from our own game engine on `CurveRoadWorld` (`render_lane3.html` / `render_lane3_entry.ts`).
Rendered at Portrait 720x1280 (9:16 aspect ratio, FOV 50-68°, pixel ratio 1) using headless Chrome with D3D11 ANGLE WebGL.

## 1. Six Reel-Comparison Frames (Part 3.3)
Replayed per `lane3_frames.ts` initial state (gear 5, wheel spin matched, 15 settling substeps) and 30 fps replay of `hardpack_reference_telemetry.csv` inputs with 4 physics substeps of 1/120s per frame:
- **lane3_f_2.0.png** / **lane3_f_2.0.json**: t = 2.0 s (Approach straight, 133 mph)
- **lane3_f_2.5.png** / **lane3_f_2.5.json**: t = 2.5 s (Braking and turn-in transition, 110 mph, rear droop 0.171 m)
- **lane3_f_2.8.png** / **lane3_f_2.8.json**: t = 2.8 s (Slide developing, 100 mph, slip 21.6°, rear droop 0.147 m)
- **lane3_f_3.2.png** / **lane3_f_3.2.json**: t = 3.2 s (Mid-slide framing, 96 mph, slip 24.5°, camera off-axis 21.2°)
- **lane3_f_3.8.png** / **lane3_f_3.8.json**: t = 3.8 s (Deep angle slide, 82 mph)
- **lane3_f_4.1.png** / **lane3_f_4.1.json**: t = 4.1 s (Slide exit recovery, 80 mph)
- **lane3_contact_sheet.png**: 3x2 tiled contact sheet of all six comparison frames.

## 2. Four Corner Frames from Fixed Autopilot (Part 3.6)
Rendered from the fixed Stanley road-staying autopilot driving `CurveRoadWorld`:
- **lane3_c_r120_sweeper.png** / **lane3_c_r120_sweeper.json**: Middle of Section 2 (R=120m right sweeper, s ~ 463m, speed 50.4 mph)
- **lane3_c_r60_left.png** / **lane3_c_r60_left.json**: Middle of Section 4 (R=60m left corner, s ~ 723m, speed 41.3 mph)
- **lane3_c_chicane_switch.png** / **lane3_c_chicane_switch.json**: Chicane transition point between Section 8 left and Section 9 right (s ~ 1105m, speed 45.9 mph)
- **lane3_c_hairpin_handbrake.png** / **lane3_c_hairpin_handbrake.json**: Section 6 hairpin with handbrake flick at peak slip angle (slip 17.6°, rear droop 0.178 m)

## 3. SHA256 Determinism Verification
Both render passes yielded 100% byte-for-byte identical files across all PNG and JSON outputs:
| Artifact | SHA256 Hash |
| :--- | :--- |
| lane3_f_2.0.json | `676147668bb67f3bcb9c1716f7ae2e220701fbe134d5ddaf2d13626caeebb74d` |
| lane3_f_2.0.png | `875e06025b97067fb78e765666c688ba1993fca9f796fc9632e8900e6dc747a5` |
| lane3_f_2.5.json | `f3950054eb25d89a4012442015bbe24a30dfc02df1c20e21763800206ad0784d` |
| lane3_f_2.5.png | `ee094bbc23b86a3c3402dbd492176639754c756a2f921b4e0b1b5a65d85fa6d7` |
| lane3_f_2.8.json | `3db043ef084a3f77c75f7df24e6cb66fbf826fa8fe77d7f8bd6b8f6a250810c8` |
| lane3_f_2.8.png | `bcf37f75f52a95e7fccfeb12fe6fed4b5f5496ac67aab4ac4b8a6a40cf2eb8ca` |
| lane3_f_3.2.json | `4b3b6d965a7edc27b45e6cb66dbb93753726ea14aa084323e19960bb66714ad0` |
| lane3_f_3.2.png | `db41d441d9001c749db254e37ece6584d8db167b2b012aa420faf0155f5863d8` |
| lane3_f_3.8.json | `e9398b8757c5e014acc3b5d50957f12d865b176804e7530e5fd573785c57011e` |
| lane3_f_3.8.png | `7d3d5c1a8b0445a6d5c1d90d19042533e2fa2e856affb8f9bcacbf23319c6190` |
| lane3_f_4.1.json | `542070e5b5d9c68d0268f0420f34f19657622f7aebb4b07c66fb26476aae3b62` |
| lane3_f_4.1.png | `d15deb2ae1d518184cd83cfb79e5f190a67c503610462da7b7d3be40ad1b8b95` |
| lane3_contact_sheet.png | `1e603f9845fc51387c3dc0984fb2a468d3c294d550082b9d94f35021a77aeabb` |
| lane3_c_r120_sweeper.json | `7e12ea1c02eb5988a29b8096620d4e09345512043b94a6cd9e74998541810ac3` |
| lane3_c_r120_sweeper.png | `20d30eaffff38232f42adea21da6a09efa79e752d7034ad7aeb5abf0f0c4a610` |
| lane3_c_r60_left.json | `0651a668d4ec08c8801c8ddefd1f47b0b1e6510d546b0815df6b9650f519592b` |
| lane3_c_r60_left.png | `3fe09447bdc4d976dd19fa95fd409988bbd35f0deab6ce52dbf2db5343177c3c` |
| lane3_c_chicane_switch.json | `c28e99ad51bae4023918ef8ee054f183e6e2d414811b2285071c4f9d555b1129` |
| lane3_c_chicane_switch.png | `1303c8eb7627ee7ba41e48f38abf3ee72595f0ffb6d62833611a2c521bb01188` |
| lane3_c_hairpin_handbrake.json | `211e8c080c4e765787a87d1831a1a41835770a2f8ff05d1411077df4e783913e` |
| lane3_c_hairpin_handbrake.png | `598364351839349b469d14a33544c610cc3cd0dafb48b988e81a31d5e819acaf` |
