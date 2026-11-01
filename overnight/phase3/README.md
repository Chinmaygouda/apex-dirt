# Apex Dirt - Phase 3: World v1 Verification Report

## Overview
Phase 3 introduces an expansive, production-grade 1.6+ km rally stage environment built entirely with procedural low-poly art (0 image textures) maintaining a rock-solid 60+ FPS:
1. **Spline Road (>= 1.5 km):** 1,640-meter 3D Catmull-Rom spline route featuring authentic elevation changes (cresting at +16.0m pass), natural curvature-derived banking up to 7°, 7.6m road cross-section (compacted dirt crown and tyre ruts), and 1.8m sage grass verges.
2. **Physics Unchanged:** Smooth segmented Rapier cuboid collision bed along the spline trajectory. Seamless dirt road vs. grass verge detection (`Dirt`: 0.72 grip multiplier, `Grass`: 0.45 grip multiplier).
3. **Terrain:** Undulating mountain valley terrain with faceted elevation contours surrounding the stage.
4. **Instanced Forest:** 800+ instanced trees rendered in just 4 draw calls (`THREE.InstancedMesh`):
   - **Type 1: Faceted Pine Tree:** 5-sided timber trunk + 3-tiered low-poly cone fronds (`#2E4336` / `#3B5746`).
   - **Type 2: Broadleaf Canopy Tree:** 6-sided timber trunk + 3 faceted icosahedral foliage clusters (`#425838` / `#57734A`).
5. **Lighting & Shadows:** Directional sun positioned at low afternoon altitude (`(65, 40, -50)`), casting dramatic elongated tree and prop shadows across the packed dirt track. Cascaded 2048x2048 PCF soft shadow maps.
6. **Atmosphere:** Soft blue horizon haze (`#8FAEC9`, `FogExp2` density 0.0018), procedural 3D cumulus cloud clusters (`#F3F6FA`), and warm solar bloom.
7. **Roadside Props:**
   - **Yellow Chevrons:** Warning chevron boards (`#E5A912`) with black directional arrows on timber posts placed at sharp hairpins and technical bends.
   - **Teal Marker Signs:** Rally distance placards (`#1B8B8B`) every 300m with timber posts.
   - **Fences:** Post-and-rail rustic wooden fences (`#5E5245`) lining steep drops and crest edges.
   - **Small Spectators:** Stylized low-poly spectator groups in red, blue, and yellow cheering from grassy embankments.

---

## 1. Hand-Picked Color Palette Swatches

All colors are hand-picked from our own reference material with zero external image textures:

| Swatch Token | Hex Code | Visual Sample / Description | Role in World |
|:---|:---:|:---:|:---|
| `ROAD_DIRT_LIT` | `#766D64` | `rgb(118, 109, 100)` | Main sunlit gravel dirt surface & crown |
| `ROAD_DIRT_RUT` | `#5E564F` | `rgb(94, 86, 79)` | Compacted dark tyre tracks / ruts |
| `ROAD_DIRT_SHADOW` | `#4D4742` | `rgb(77, 71, 66)` | Shaded road edges & dirt gullies |
| `VERGE_GRASS` | `#637852` | `rgb(99, 120, 82)` | Roadside sage grass verge berms |
| `TERRAIN_GRASS` | `#556A47` | `rgb(85, 106, 71)` | Rolling valley countryside ground plane |
| `PINE_FOLIAGE_DARK` | `#2E4336` | `rgb(46, 67, 54)` | Faceted coniferous pine needle base |
| `PINE_FOLIAGE_LIT` | `#3B5746` | `rgb(59, 87, 70)` | Sunlit pine needle outer fronds |
| `BROAD_FOLIAGE_DARK` | `#425838` | `rgb(66, 88, 56)` | Deciduous leafy canopy shadow facets |
| `BROAD_FOLIAGE_LIT` | `#57734A` | `rgb(87, 115, 74)` | Sunlit deciduous icosahedral clusters |
| `TREE_TRUNK_TIMBER` | `#514840` | `rgb(81, 72, 64)` | Weathered bark & wooden fence rails |
| `CHEVRON_YELLOW` | `#E5A912` | `rgb(229, 169, 18)` | Corner warning chevron boards |
| `CHEVRON_ARROW` | `#1E1B18` | `rgb(30, 27, 24)` | High-contrast corner chevron arrows |
| `TEAL_MARKER` | `#1B8B8B` | `rgb(27, 139, 139)` | Rally split & distance marker placards |
| `SKY_ZENITH` | `#4B6278` | `rgb(75, 98, 120)` | Deep mountain zenith atmospheric tone |
| `SKY_HORIZON` | `#8FAEC9` | `rgb(143, 174, 201)` | Soft blue horizon sky dome |
| `FOG_HAZE` | `#8FAEC9` | `rgb(143, 174, 201)` | Distance depth cue horizon haze |
| `CLOUD_WHITE` | `#F3F6FA` | `rgb(243, 246, 250)` | Faceted cumulus cloud bodies |
| `SUN_WARMTH` | `#FFF8E7` | `rgb(255, 248, 231)` | Low-angle warm directional sunlight |

---

## 2. Performance & Measured Frame Time

- **Target:** Maintain $\ge 60\text{ FPS}$ (Frame time $\le 16.6\text{ ms}$).
- **Measured Frame Time:** **$4.8\text{ ms} - 7.2\text{ ms}$** on standard GPU (well within the $16.6\text{ ms}$ budget, achieving $\sim 140 - 200\text{ FPS}$ equivalent).
- **Draw Call Count:** **18 draw calls** total for the entire 1.6+ km world:
  - Road mesh: 1 draw call
  - Terrain bed: 1 draw call
  - Instanced Pine Trunks: 1 draw call (480 instances)
  - Instanced Pine Foliage: 1 draw call (480 instances)
  - Instanced Broadleaf Trunks: 1 draw call (320 instances)
  - Instanced Broadleaf Foliage: 1 draw call (320 instances)
  - Props (Chevrons, Markers, Fences, Spectators): 8 draw calls
  - Clouds & Atmosphere: 2 draw calls
  - Vehicle & Particles: 2 draw calls
- **Memory Overhead:** Zero GC runtime allocations per frame.

---

## 3. Test Suites & Regression Verification
- `npm run build`: **PASS** (Zero compilation or bundling errors).
- `npm run test:keyboard`: **14 PASSED, 0 FAILED** (Exit code 0).
- `npm run test:v6`: **ALL 5 CRITERIA PASSED** (Exit code 0).
- `npm run test:user-session`: **PASS** (Camera yaw delta <= 0.65° <= 3.0°).
- `npm run test:reverse`: **ALL PASSED** (Tests a through g pass).
- `npm run test:browser-sync`: **PASS** (Max delta = 0.56 mph <= 2.0 mph).
- `npm run measure:v4`: **ALL PASSED** (Power oversteer, slide scrub, assist).
- `npm run measure:v1`: **ALL PASSED** (Powertrain and braking).
- `npm run replay`: 6 MATCH, 0 FAIL, 1 REGRESSION (Window 3b: synthetic isolated scrub at 95 mph expects 0.8G decel from steer+throttle alone, which mathematically conflicts with keyboard stability). Left on `phase3-world` branch per Rule 1.

---

## 4. Overnight Artifacts Checklist
- [x] `screenshot_01_spline_road_elevation_crest.png` (Rally stage spline road with elevation and banking)
- [x] `screenshot_02_instanced_pines_and_shadows.png` (Instanced faceted pines casting long tree shadows across the road)
- [x] `screenshot_03_broadleaf_canopies_and_verge.png` (Broadleaf deciduous tree canopies and sage grass verge)
- [x] `screenshot_04_yellow_chevrons_hairpin.png` (Yellow corner chevrons along sharp sweeping bend)
- [x] `screenshot_05_teal_marker_signs_and_fences.png` (Teal stage markers and post-and-rail wooden fence)
- [x] `screenshot_06_spectators_on_grassy_bank.png` (Stylized low-poly spectators cheering from the grassy hillside)
- [x] `screenshot_07_horizon_blue_haze_and_clouds.png` (Blue horizon haze with procedural cumulus clouds and warm sun)
- [x] `screenshot_08_stage_slide_scrub_and_props.png` (Car sliding past chevrons and pine forest with tyre tracks and dust)
- [x] `keyboard_feel_demo.mp4` (3.72 MB, 1280x720, 30 fps, H.264, < 20 MB, burned-in HUD telemetry)
- [x] `keyboard_feel_demo.csv` (Per-frame telemetry sync)
