# Project: Apex Rally Vehicle Overhaul & Blueprint Alignment

## Architecture
This project overhauls the 3D procedural vehicle model in `src/vehicles/CustomRallyVehicle.ts` and prepares clean reference blueprint views in `scratch/` matching the APEX Rally specifications.
Key subsystems involved:
1. **Reference Asset Extraction (`scratch/`)**: High-fidelity Python OpenCV/NumPy segmentation extracting 4 orthographic elevations (`ref_side.png`, `ref_front.png`, `ref_rear.png`, `ref_top.png`) from `apex_rally_reference_blueprint.jpg` onto clean white backgrounds with crisp black annotations.
2. **Vehicle Geometry & Chassis Architecture (`src/vehicles/CustomRallyVehicle.ts`)**: Procedural Three.js model featuring:
   - Chassis & Underbody: 170mm ground clearance datum, rocker sills, underbody undertray.
   - Front Fascia: 1900mm wide stance, circular 7" headlights, recessed black honeycomb grille with APEX badge, lower air intake with APEX stencil, 5-rib brushed aluminum skid plate.
   - Rear Assembly: Full-width black honeycomb panel with white APEX stencil, dual round combination lights (amber turn over red brake with chrome trim), exposed 4130 chromoly tubular differential cradle, 4-strake carbon diffuser, dual burnt blue titanium exhaust tips.
   - Suspension & Wheels: Four independent double-wishbone / MacPherson coilover struts with red springs, hub uprights, halfshafts, and tie-rods; tucked tires into wheel arches with 20-30mm clearance and zero floating gap.
3. **Inspection & Verification Harness (`test/browser_playtest.ts`, `src/core/VehicleInspectionController.ts`)**: CDP automated headless browser test generating `browser_inspect_front.png`, `browser_inspect_side.png`, `browser_inspect_rear.png`, and `browser_inspect_top.png`.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Reference Image Background Cleaning | Extract 4 blueprint views onto clean pure white background | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Side View Suspension & Wheel Attachment | 3D lower A-arms, coilovers with red springs, uprights, halfshafts eliminating floating gaps | M2 | ORIGINAL_REQUEST §R2 |
| 3 | Side View 170mm Ground Clearance & Tire Tuck | 170mm underbody clearance and tight 20-30mm tire-to-arch tuck | M2 | ORIGINAL_REQUEST §R2 |
| 4 | Front View 1900mm Stance Expansion | Expand front bumper, blister fenders, and splitter to 1900mm width | M2 | ORIGINAL_REQUEST §R3 |
| 5 | Front Circular 7" Headlights | 7" (178mm diameter) headlights with chrome reflector bowls and fluted lenses | M2 | ORIGINAL_REQUEST §R3 |
| 6 | Front Honeycomb Grille & APEX Badge | Recessed black honeycomb grille pocket with 3D red/chrome APEX badge | M2 | ORIGINAL_REQUEST §R3 |
| 7 | Front Lower Intake with APEX Stencil | Lower intake with intercooler core mesh and bold white APEX stencil | M2 | ORIGINAL_REQUEST §R3 |
| 8 | Front 5-Rib Brushed Aluminum Skid Plate | Up-swept skid plate with 5 extruded vertical strengthening ribs in brushed aluminum | M2 | ORIGINAL_REQUEST §R3 |
| 9 | Rear Full-Width Honeycomb Panel & Stencil | 1.78m wide black honeycomb rear panel with bold white APEX stencil | M2 | ORIGINAL_REQUEST §R4 |
| 10 | Rear Dual Round Combo Lights | Vertically stacked round lights (amber turn over red brake) in chrome bezel | M2 | ORIGINAL_REQUEST §R4 |
| 11 | Rear Exposed Chromoly Diff Cradle | Prominently visible triangulated 4130 chromoly tubular cage surrounding diff | M2 | ORIGINAL_REQUEST §R4 |
| 12 | Rear 4-Strake Carbon Diffuser | Upswept aerodynamic diffuser with 4 vertical strakes in carbon fiber finish | M2 | ORIGINAL_REQUEST §R4 |
| 13 | Rear Dual Burnt Blue Titanium Exhaust | Dual slash-cut exhaust tips with burnt blue-violet-straw iridescent gradient | M2 | ORIGINAL_REQUEST §R4 |
| 14 | CAD Inspection View Generation | Automated execution of inspection scripts generating updated PNG inspection views | M3 | ORIGINAL_REQUEST §R5 |
| 15 | Build & Test Health | TypeScript compilation without errors, E2E test suite passing | M3 | ORIGINAL_REQUEST Acceptance |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Blueprint Reference Extraction | Extract `scratch/ref_side.png`, `ref_front.png`, `ref_rear.png`, `ref_top.png` onto pure white background via Python OpenCV script | none | DONE |
| M2 | CustomRallyVehicle.ts Overhaul | Implement R2, R3, R4 in `src/vehicles/CustomRallyVehicle.ts` | M1 | DONE |
| M3 | Inspection Render & Full Verification | Execute `npm run test:browser` to generate inspection PNGs, run build and E2E suites | M2 | DONE |

---

## Interface Contracts
- **Blueprint Outputs**: `scratch/ref_side.png` ($798\times 384$), `scratch/ref_front.png` ($578\times 384$), `scratch/ref_rear.png` ($578\times 384$), `scratch/ref_top.png` ($798\times 384$), clean white background ($RGB = 255, 255, 255$).
- **Vehicle Model**: All visual changes self-contained in `src/vehicles/CustomRallyVehicle.ts`. Mesh group hierarchy (`chassisMainGroup`, `frontBumperGroup`, `hoodGroup`, `rearWingGroup`) preserved for damage detachment physics.
- **Inspection Script**: `npm run test:browser` generates `browser_inspect_front.png`, `browser_inspect_side.png`, `browser_inspect_rear.png`, `browser_inspect_top.png` in project root with zero console exceptions.

---

## Code Layout
- `scripts/`: Utility scripts (e.g., `scripts/extract_clean_blueprints.py`).
- `scratch/`: Reference blueprint views (`ref_side.png`, `ref_front.png`, `ref_rear.png`, `ref_top.png`).
- `src/vehicles/CustomRallyVehicle.ts`: Core procedural vehicle 3D model and physics integration.
- `src/core/VehicleInspectionController.ts`: Camera presets and studio lighting for CAD inspection.
- `test/browser_playtest.ts`: CDP in-browser CAD capture and playtest harness.
