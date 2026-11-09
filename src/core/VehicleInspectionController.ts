import * as THREE from 'three';
import { CustomRallyVehicle } from '../vehicles/CustomRallyVehicle';

export type InspectionView = 'FRONT' | 'SIDE' | 'REAR' | 'TOP' | 'UNDERBODY' | 'ISOMETRIC';

export interface InspectionSpecItem {
  label: string;
  value: string;
}

export interface InspectionPresetConfig {
  view: InspectionView;
  title: string;
  plate: string;
  cadChapter: string;
  offset: THREE.Vector3;
  targetOffset: THREE.Vector3;
  upVector: THREE.Vector3;
  fov: number;
  specs: InspectionSpecItem[];
  notes: string;
}

export const INSPECTION_PRESETS: Record<InspectionView, InspectionPresetConfig> = {
  FRONT: {
    view: 'FRONT',
    title: 'FRONT ELEVATION [1]',
    plate: 'Plate 01: Front Elevation Blueprint',
    cadChapter: 'APX-SPEC-FINAL-001 Chapter 1',
    offset: new THREE.Vector3(0.0, 0.30, 7.80),
    targetOffset: new THREE.Vector3(0.0, 0.30, 0.0),
    upVector: new THREE.Vector3(0.0, 1.0, 0.0),
    fov: 26,
    specs: [
      { label: 'Overall Flared Width', value: '1,880 mm (Composite Blister Arches)' },
      { label: 'Front Track Width (TF)', value: '1,860 mm (Center-to-Center @ X=±0.930m)' },
      { label: 'Radiator Grille', value: '640 x 180 mm Matte Black ABS Cross-Hatch' },
      { label: 'Quad Rally Lamp Pod', value: '4x Ø180mm Halogen Spotlights (55W)' },
      { label: 'Static Camber / Toe', value: '-1.50° Camber / +0.10° Toe-Out (+2.0mm)' },
      { label: 'Front Sump Guard', value: '8.0 mm 5083-H111 Aircraft Aluminum Plate' },
    ],
    notes: 'Orthographic front elevation displaying 1,880mm widebody envelope across blister fender arches, ram-air radiator grille, quad halogen night driving lamps, and front aluminum bash plate.',
  },
  SIDE: {
    view: 'SIDE',
    title: 'SIDE PROFILE [2]',
    plate: 'Plate 02: Side Profile Elevation Blueprint',
    cadChapter: 'APX-SPEC-FINAL-001 Chapter 2',
    offset: new THREE.Vector3(-8.50, 0.30, 0.0),
    targetOffset: new THREE.Vector3(0.0, 0.30, 0.0),
    upVector: new THREE.Vector3(0.0, 1.0, 0.0),
    fov: 26,
    specs: [
      { label: 'Overall Length (L)', value: '4,200 mm (Splitter to Aerofoil)' },
      { label: 'Wheelbase (WB)', value: '2,700 mm (Front Hub to Rear Hub @ Z=±1.350m)' },
      { label: 'Roof Crest Height (H)', value: '1,340 mm Above Ground Datum' },
      { label: 'Static Ground Clearance', value: '220 mm Under Flat Undertray' },
      { label: 'Overhangs & Angles', value: 'Front 850mm (28.5°) | Rear 650mm (26.0°)' },
      { label: 'Weight Distribution', value: '52% Front / 48% Rear (CoG Z=+0.040m)' },
    ],
    notes: 'Master longitudinal elevation displaying 4,200mm Group B envelope, 2,700mm wheelbase, 22.4° breakover angle, and 52/48 weight distribution.',
  },
  REAR: {
    view: 'REAR',
    title: 'REAR ELEVATION [3]',
    plate: 'Plate 03: Rear Elevation Blueprint',
    cadChapter: 'APX-SPEC-FINAL-001 Chapter 3',
    offset: new THREE.Vector3(0.0, 0.30, -7.80),
    targetOffset: new THREE.Vector3(0.0, 0.30, 0.0),
    upVector: new THREE.Vector3(0.0, 1.0, 0.0),
    fov: 26,
    specs: [
      { label: 'Rear Track Width (TR)', value: '1,900 mm (+40mm wider than front)' },
      { label: 'High-Mount Aerofoil', value: '1,420 mm Width, Dual Pylons @ X=±0.42m' },
      { label: 'Rear Wing Downforce', value: '1,250 N @ 120 mph' },
      { label: 'Dual Exhaust Outlets', value: 'Twin Ø70mm Slash-Cut Tips @ X=±0.350m' },
      { label: 'Rear Diff Protection', value: '4130 Chrome-Moly Lattice Cradle' },
      { label: 'Static Camber / Toe', value: '-1.00° Camber / +0.20° Toe-In (+3.5mm)' },
    ],
    notes: 'Orthographic rear elevation highlighting 1,900mm rear track, high-downforce aerofoil, dual titanium-scorch exhaust outlets, and diff protective cradle.',
  },
  TOP: {
    view: 'TOP',
    title: 'TOP PLAN [4]',
    plate: 'Plate 05: Top Plan View Blueprint',
    cadChapter: 'APX-SPEC-FINAL-001 Chapter 5',
    offset: new THREE.Vector3(0.0, 8.20, -0.35),
    targetOffset: new THREE.Vector3(0.0, 0.30, -0.35),
    upVector: new THREE.Vector3(0.0, 0.0, 1.0), // +Z points UP on screen
    fov: 45,
    specs: [
      { label: 'Vehicle Envelope', value: '4,200 mm L x 1,880 mm W' },
      { label: 'Twin Hood Louvers', value: 'Two 420 x 280 mm Cooling Banks @ Z=+0.95m' },
      { label: 'Roof Ram-Air Scoop', value: '220 x 90 mm Cockpit Dust Pressurization' },
      { label: 'Greenhouse Taper', value: '1,880 mm Hips to 1,180 mm Waist (37.2%)' },
      { label: 'Aerodynamic Drag', value: 'Cd 0.38 / CdA 0.720 m²' },
      { label: 'Terminal Velocity', value: '59.5 m/s (133.1 mph) in 5th Gear' },
    ],
    notes: 'Orthographic top plan displaying hood cooling louvers, roof pressurization scoop, greenhouse tumblehome taper, and aerofoil profile.',
  },
  UNDERBODY: {
    view: 'UNDERBODY',
    title: 'BOTTOM UNDERBODY [5]',
    plate: 'Plate 04: Underbody Chassis Plan Blueprint',
    cadChapter: 'APX-SPEC-FINAL-001 Chapter 4',
    offset: new THREE.Vector3(0.0, -7.50, -0.05),
    targetOffset: new THREE.Vector3(0.0, 0.10, -0.05),
    upVector: new THREE.Vector3(0.0, 0.0, 1.0), // +Z points UP on screen
    fov: 45,
    specs: [
      { label: 'Component A (Front)', value: '8.0mm 5083-H111 Al Sump Guard (Z=+1.95 to +0.80m)' },
      { label: 'Component B (Mid)', value: '4.5mm Carbon-Kevlar Undertray (Z=+0.80 to -0.90m)' },
      { label: 'Component C (Rear)', value: '4130 Cr-Mo Diff Cradle (Z=-0.90 to -1.95m)' },
      { label: 'Propshaft Tunnel', value: 'Recessed Channel 240mm W x 1,680mm L' },
      { label: 'Ground Clearance', value: '220 mm Datum / 145 MPa Yield Strength' },
      { label: 'Ground Effect Downforce', value: 'Flat Floor Venturi, 380 N @ 100 mph' },
    ],
    notes: 'Plan view detailing complete 3-stage underbody chassis armor: Front Sump Guard (Component A), Carbon-Kevlar Undertray (Component B), and Rear Differential Cradle (Component C). Ground plane automatically hidden for unobstructed sightline.',
  },
  ISOMETRIC: {
    view: 'ISOMETRIC',
    title: '3/4 ISOMETRIC PERSPECTIVE [6]',
    plate: 'Plate 06: Complete 3D Technical Cutaway Blueprint',
    cadChapter: 'APX-SPEC-FINAL-001 Chapter 6',
    offset: new THREE.Vector3(-4.20, 2.60, 4.20),
    targetOffset: new THREE.Vector3(0.0, 0.30, 0.0),
    upVector: new THREE.Vector3(0.0, 1.0, 0.0),
    fov: 40,
    specs: [
      { label: 'Tubular Roll Cage', value: 'Integrated T45 Steel (Main Hoop Ø45x2.5mm)' },
      { label: 'Torsional Rigidity', value: '28,500 N·m/deg (+340% over unibody)' },
      { label: 'Turbocharged Engine', value: '2,130 cc I4 Dry Sump, 340 bhp / 480 N·m' },
      { label: '4WD Drivetrain', value: '5-Speed Dog-Box, Epicyclic 50/50 Center Diff' },
      { label: 'Steering Rack', value: 'Quick-Ratio Mechanical (2.1 Turns Lock-to-Lock)' },
      { label: 'Suspension Travel', value: '200 mm Long-Travel Gravel Spec' },
    ],
    notes: 'Elevated front 3/4 technical perspective displaying composite bodywork over structural T45 roll cage, drivetrain, and long-travel suspension.',
  },
};

export const INSPECTION_ORDER: InspectionView[] = [
  'FRONT',
  'SIDE',
  'REAR',
  'TOP',
  'UNDERBODY',
  'ISOMETRIC',
];

export class VehicleInspectionController {
  public isActive = false;
  public activeView: InspectionView = 'FRONT';
  public activePresetIndex = 0;

  // Dedicated Inspection Studio Lighting Rig
  public readonly lightingRig: THREE.Group;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private underbodyLightFront: THREE.DirectionalLight;
  private underbodyLightRear: THREE.DirectionalLight;
  private studioAmbient: THREE.AmbientLight;

  // Reference to ground object for occlusion hiding
  private groundObject: THREE.Object3D | null = null;
  private groundWasVisible = true;

  // Reference to vehicle for exterior mesh visibility management
  private targetVehicle: CustomRallyVehicle | null = null;

  // Transition and camera math helpers
  private tempPos = new THREE.Vector3();
  private tempTarget = new THREE.Vector3();
  private tempUp = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  private isTransitioning = false;

  // Listeners
  public onViewChanged?: (config: InspectionPresetConfig) => void;
  public onActiveChanged?: (active: boolean) => void;

  constructor(scene: THREE.Scene) {
    this.lightingRig = new THREE.Group();
    this.lightingRig.name = 'InspectionStudioLightingRig';
    this.lightingRig.visible = false;

    // 1. Key directional light (neutral 5500K studio key)
    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    this.keyLight.position.set(12, 18, 14);
    this.keyLight.castShadow = false;
    this.lightingRig.add(this.keyLight);
    this.lightingRig.add(this.keyLight.target);

    // 2. Soft fill directional light
    this.fillLight = new THREE.DirectionalLight(0xf1f5f9, 1.2);
    this.fillLight.position.set(-14, 12, -10);
    this.lightingRig.add(this.fillLight);
    this.lightingRig.add(this.fillLight.target);

    // 2b. Front and rear studio fill lights for clean elevations
    const frontFill = new THREE.DirectionalLight(0xffffff, 1.6);
    frontFill.position.set(0, 4.0, 10.0);
    frontFill.target.position.set(0, 0.3, 0);
    this.lightingRig.add(frontFill);
    this.lightingRig.add(frontFill.target);

    const rearFill = new THREE.DirectionalLight(0xffffff, 1.6);
    rearFill.position.set(0, 4.0, -10.0);
    rearFill.target.position.set(0, 0.3, 0);
    this.lightingRig.add(rearFill);
    this.lightingRig.add(rearFill.target);

    // 3. Dedicated underbody upward-facing illuminators
    // Light A: Illuminates front sump guard and mid undertray
    this.underbodyLightFront = new THREE.DirectionalLight(0xffffff, 2.4);
    this.underbodyLightFront.position.set(0, -6.0, 1.0);
    this.underbodyLightFront.target.position.set(0, 0, 1.0);
    this.lightingRig.add(this.underbodyLightFront);
    this.lightingRig.add(this.underbodyLightFront.target);

    // Light B: Illuminates rear differential cradle, suspension arms, and exhaust
    this.underbodyLightRear = new THREE.DirectionalLight(0xffffff, 2.4);
    this.underbodyLightRear.position.set(0, -6.0, -1.2);
    this.underbodyLightRear.target.position.set(0, 0, -1.2);
    this.lightingRig.add(this.underbodyLightRear);
    this.lightingRig.add(this.underbodyLightRear.target);

    // 4. Studio neutral ambient fill
    this.studioAmbient = new THREE.AmbientLight(0xffffff, 0.85);
    this.lightingRig.add(this.studioAmbient);

    scene.add(this.lightingRig);
  }

  public setGroundObject(obj: THREE.Object3D | null): void {
    this.groundObject = obj;
    if (obj) {
      this.groundWasVisible = obj.visible;
    }
  }

  public setVehicle(vehicle: CustomRallyVehicle | null): void {
    this.targetVehicle = vehicle;
  }

  public toggle(force?: boolean, vehicle?: CustomRallyVehicle): boolean {
    const nextState = force !== undefined ? force : !this.isActive;
    if (nextState) {
      this.enter(vehicle);
    } else {
      this.exit();
    }
    return this.isActive;
  }

  public enter(vehicle?: CustomRallyVehicle): void {
    if (this.isActive) return;
    this.isActive = true;
    if (vehicle) {
      this.targetVehicle = vehicle;
    }
    if (this.targetVehicle) {
      this.targetVehicle.setCockpitViewMode(false);
    }
    this.lightingRig.visible = true;
    this.isTransitioning = true;
    this.applyOcclusion();
    this.onActiveChanged?.(true);
    this.onViewChanged?.(this.getActiveConfig());
  }

  public exit(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.lightingRig.visible = false;
    this.restoreOcclusion();
    this.onActiveChanged?.(false);
  }

  public setPreset(view: InspectionView, immediate = false): void {
    const idx = INSPECTION_ORDER.indexOf(view);
    if (idx >= 0) {
      this.activePresetIndex = idx;
      this.activeView = view;
      this.isTransitioning = !immediate;
      this.applyOcclusion();
      this.onViewChanged?.(this.getActiveConfig());
    }
  }

  public setPresetByIndex(index: number, immediate = false): void {
    const safeIdx = ((index % INSPECTION_ORDER.length) + INSPECTION_ORDER.length) % INSPECTION_ORDER.length;
    this.setPreset(INSPECTION_ORDER[safeIdx], immediate);
  }

  public cyclePreset(forward = true, immediate = false): InspectionView {
    const delta = forward ? 1 : -1;
    const nextIdx = (this.activePresetIndex + delta + INSPECTION_ORDER.length) % INSPECTION_ORDER.length;
    this.setPresetByIndex(nextIdx, immediate);
    return this.activeView;
  }

  public getActiveConfig(): InspectionPresetConfig {
    return INSPECTION_PRESETS[this.activeView];
  }

  private applyOcclusion(): void {
    if (this.groundObject) {
      if (this.isActive && this.activeView === 'UNDERBODY') {
        this.groundObject.visible = false;
      } else {
        this.groundObject.visible = this.groundWasVisible;
      }
    }
  }

  private restoreOcclusion(): void {
    if (this.groundObject) {
      this.groundObject.visible = this.groundWasVisible;
    }
  }

  public update(camera: THREE.PerspectiveCamera, vehicle: CustomRallyVehicle, dt: number): void {
    if (!this.isActive || !vehicle.chassisMesh) return;

    this.targetVehicle = vehicle;
    vehicle.setCockpitViewMode(false);

    const carPos = vehicle.chassisMesh.position;
    const carQuat = vehicle.chassisMesh.quaternion;

    // Sync inspection lighting rig to vehicle transform
    this.lightingRig.position.copy(carPos);
    this.lightingRig.quaternion.copy(carQuat);

    // Ensure underbody lights point upward along vehicle local +Y
    this.underbodyLightFront.target.position.set(0, 0, 1.0);
    this.underbodyLightRear.target.position.set(0, 0, -1.2);

    const config = this.getActiveConfig();

    // Compute target camera world position, look-at point, and up vector
    const targetPos = this.tempPos.copy(config.offset).applyQuaternion(carQuat).add(carPos);
    const targetLookAt = this.tempTarget.copy(config.targetOffset).applyQuaternion(carQuat).add(carPos);
    const targetUp = this.tempUp.copy(config.upVector).applyQuaternion(carQuat).normalize();

    if (this.isTransitioning) {
      // Smooth exponential interpolation for buttery transitions
      const lerpSpeed = Math.min(1.0, Math.max(0.01, dt * 14.0));
      camera.position.lerp(targetPos, lerpSpeed);
      this.currentLookAt.lerp(targetLookAt, lerpSpeed);
      camera.up.lerp(targetUp, lerpSpeed).normalize();
      camera.lookAt(this.currentLookAt);
      camera.fov = THREE.MathUtils.lerp(camera.fov, config.fov, lerpSpeed);
      camera.updateProjectionMatrix();

      if (camera.position.distanceTo(targetPos) < 0.02 && this.currentLookAt.distanceTo(targetLookAt) < 0.02) {
        this.isTransitioning = false;
      }
    } else {
      camera.position.copy(targetPos);
      this.currentLookAt.copy(targetLookAt);
      camera.up.copy(targetUp);
      camera.lookAt(this.currentLookAt);
      camera.fov = config.fov;
      camera.updateProjectionMatrix();
    }
  }
}
