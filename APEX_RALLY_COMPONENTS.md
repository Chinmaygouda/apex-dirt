# APEX RALLY — 3D Asset Hierarchy & Component Specification

## 1. Asset Overview
- **Vehicle Type**: 1980s Group B Rally Coupe
- **Target Environment**: WebGL / Three.js / React Three Fiber & Unreal Engine 5
- **Master Project**: [`APEX_RALLY_MASTER.blend`](file:///d:/carrr/APEX_RALLY_MASTER.blend)
- **Exported Web Asset**: [`APEX_RALLY.glb`](file:///d:/carrr/APEX_RALLY.glb)
- **Texture Directory**: [`APEX_RALLY_TEXTURES/`](file:///d:/carrr/APEX_RALLY_TEXTURES/)
- **Hero Preview**: [`APEX_RALLY_PREVIEW.png`](file:///d:/carrr/APEX_RALLY_PREVIEW.png)

## 2. Metric Dimensions
- **Overall Length**: 4,300 mm (Y: -2.15m to +2.15m)
- **Overall Width**: 1,900 mm over blister flares (X: -0.95m to +0.95m)
- **Wheelbase**: 2,500 mm (Front Axle Y: +1.25m, Rear Axle Y: -1.25m)
- **Overall Height**: 1,380 mm from ground plane (Z: 0.00m to 1.38m)
- **Track Width**: 1,650 mm (X: ±0.825m)
- **Wheel Outer Diameter**: 700 mm (R = 0.35m), Tyre Width: 280 mm

## 3. Object Hierarchy & Collection Structure
```
APEX_RALLY (Master Collection)
├── BODY
│   ├── Main_Body (Monocoque unibody, roof, sills, pillars, quarter panels)
│   ├── Bonnet (Forward-hinged hood with twin NACA ducts and white stripes)
│   ├── Front_Bumper (Deep rally apron with radiator cutout and lip)
│   ├── Rear_Bumper (Aerodynamic rear fascia with diffuser cutouts)
│   ├── Door_L & Door_R (Independent door skins with recessed handles)
│   ├── Skid_Plate (8mm brushed aluminium underbody armor plate)
│   ├── SideSkirt_L & SideSkirt_R (Aero rocker panels)
│   ├── Roof_Scoop (Ram-air induction scoop on roof crown)
│   └── Windshield_Front / Rear / Side_L / Side_R (Tinted glass)
├── WHEELS
│   ├── Wheel_FL (Pivot: +0.825, +1.250, 0.350)
│   ├── Wheel_FR (Pivot: -0.825, +1.250, 0.350)
│   ├── Wheel_RL (Pivot: +0.825, -1.250, 0.350)
│   ├── Wheel_RR (Pivot: -0.825, -1.250, 0.350)
│   └── (Each wheel contains Tyre_*, Rim_*, BrakeDisc_*, BrakeCaliper_*)
├── SUSPENSION
│   ├── Spring_FL / FR / RL / RR (3D mathematical helical coil springs)
│   ├── Shock_FL / FR / RL / RR (Inverted monotube damper bodies)
│   └── ControlArm_FL / FR / RL / RR (Tubular lower A-arm wishbones)
├── LIGHTS
│   ├── Headlight_L & Headlight_R (Main composite rectangular lenses)
│   ├── Auxiliary_Lamp_1..4 (Quad 150mm round rally driving pods)
│   ├── FogLamp_L & FogLamp_R (Lower bumper amber fog lamps)
│   └── Tail_Lights (Full-width smoked ruby red lightbar)
├── INTERIOR
│   ├── Dashboard (Flocked rally dash with instrument binnacle)
│   ├── Instrument_Cluster (Analog speedometer, tachometer, boost gauges)
│   ├── Steering_Wheel (Pivot along steering column axis at 22° rake)
│   ├── Steering_Column (Chromoly steering shaft)
│   ├── Seat_Driver & Seat_Navigator (FIA racing buckets with 5-point harnesses)
│   ├── RollCage_* (45mm tubular steel safety cage with X-bracing)
│   ├── Shifter_Lever & Handbrake_Lever (Sequential rally shifter & e-brake)
│   └── Pedal_Throttle / Brake / Clutch (Aluminium floor pedal box)
├── AERODYNAMICS
│   ├── Rear_Spoiler (Inverted camber aerodynamic airfoil blade)
│   ├── SpoilerEndplate_L & SpoilerEndplate_R (3D endplates)
│   ├── SpoilerPylon_L & SpoilerPylon_R (Twin swept carbon pylons)
│   ├── Front_Splitter (Chassis-mounted carbon splitter with turnbuckles)
│   └── Rear_Diffuser (4-tunnel aerodynamic carbon diffuser with strakes)
└── EXHAUST
    ├── Exhaust_Side (Right rocker exit oval tip)
    └── Exhaust_Rear_L & Exhaust_Rear_R (Dual 76mm stainless tips)
```

## 4. PBR Material Manifest (14 Materials)
1. `Apex_Red_Paint` — Glossy red automotive clearcoat finish (`#D11919`).
2. `Racing_White` — Alpine white racing stripes (`#F8F8FA`).
3. `Tyre_Rubber` — Asymmetric rally block tread with sidewall typography.
4. `Rim_White` — 15-spoke rally alloy gloss finish.
5. `Brake_Metal` — Cross-drilled machined rotor steel.
6. `Caliper_Material` — Brembo racing red 4-piston calipers.
7. `Carbon_Fibre` — 2x2 twill weave carbon fiber.
8. `Window_Glass` — High-transparency dark smoke automotive glass.
9. `Light_Glass` — Fluted clear glass prism headlight covers.
10. `Rear_Light_Red` — Smoked ruby red tail lamp lens.
11. `Aluminium` — Brushed metal for skid plate and suspension struts.
12. `Black_Plastic` — Satin textured black trim and seals.
13. `Interior_Material` — Flocked dashboard with analog gauges.
14. `Exhaust_Metal` — Heat-blued stainless steel.

## 5. WebGL / Three.js Loading Example
```typescript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const loader = new GLTFLoader();
loader.load('APEX_RALLY.glb', (gltf) => {
  const car = gltf.scene;
  scene.add(car);
  
  // Access independent moving components:
  const wheelFL = car.getObjectByName('Wheel_FL');
  const wheelFR = car.getObjectByName('Wheel_FR');
  const steeringWheel = car.getObjectByName('Steering_Wheel');
  const bonnet = car.getObjectByName('Bonnet');
  const frontBumper = car.getObjectByName('Front_Bumper');
  const rearSpoiler = car.getObjectByName('Rear_Spoiler');
});
```
