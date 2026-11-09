import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RallyStageWorld } from './world/RallyStageWorld';
import { StagePropsManager } from './world/StagePropsManager';
import { WildlifeCrossingManager } from './world/WildlifeCrossingManager';
import { EnvironmentVFX } from './effects/EnvironmentVFX';
import { StageTimingController } from './gameplay/StageTimingController';
import { AtmospherePipeline } from './effects/AtmospherePipeline';
import { MockRallyVehicle } from './vehicle/MockRallyVehicle';
import { RallyAudioEngine } from './audio/RallyAudioEngine';
import { CoDriverVoice } from './audio/CoDriverVoice';

class ApexRallyApp {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock: THREE.Clock;

  // Engine Subsystems
  private rapierWorld!: RAPIER.World;
  private worldEngine!: RallyStageWorld;
  private propsManager!: StagePropsManager;
  private wildlifeManager!: WildlifeCrossingManager;
  private vfxEngine!: EnvironmentVFX;
  private timingController!: StageTimingController;
  private atmosphere!: AtmospherePipeline;
  private vehicle!: MockRallyVehicle;
  private audio: RallyAudioEngine = new RallyAudioEngine();
  private coDriverVoice: CoDriverVoice = new CoDriverVoice();

  // Camera Management
  private cameraMode: 'chase' | 'shot1_corridor' | 'shot2_hairpin' | 'shot3_aerial' | 'flythrough' | 'helicopter' = 'chase';
  private flythroughProgress = 0;

  // Circuit Mode
  private circuitMode: 'special_stage' | 'rallycross' = 'special_stage';

  // HUD Elements
  private timerEl!: HTMLElement;
  private sectorEl!: HTMLElement;
  private jokerEl!: HTMLElement;
  private pacenoteEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private rpmBarEl!: HTMLElement;
  private surfaceEl!: HTMLElement;
  private frictionEl!: HTMLElement;
  private scrubEl!: HTMLElement;
  private camEl!: HTMLElement;

  private pacenoteTimeout: number | null = null;

  constructor() {
    this.container = document.getElementById('canvas-container')!;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.2, 2500);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.clock = new THREE.Clock();

    this.initHUD();
    this.setupWindowEvents();
  }

  private initHUD(): void {
    this.timerEl = document.getElementById('stage-timer')!;
    this.sectorEl = document.getElementById('sector-display')!;
    this.jokerEl = document.getElementById('joker-display')!;
    this.pacenoteEl = document.getElementById('pacenote-banner')!;
    this.speedEl = document.getElementById('speed-display')!;
    this.rpmBarEl = document.getElementById('rpm-bar')!;
    this.surfaceEl = document.getElementById('tel-surface')!;
    this.frictionEl = document.getElementById('tel-friction')!;
    this.scrubEl = document.getElementById('tel-scrub')!;
    this.camEl = document.getElementById('tel-cam')!;
  }

  public async start(): Promise<void> {
    // 1. Initialize Rapier 3D Physics engine
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0);
    this.rapierWorld = new RAPIER.World(gravity);

    // 2. Setup Three.js Renderer
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // 3. Atmosphere, Golden Hour Lighting, Sky Dome & Fog
    this.atmosphere = new AtmospherePipeline(this.scene, this.renderer, this.camera);
    this.atmosphere.init();

    // 4. World Engine (Terrain, Splines, Banked Road Geometry)
    this.worldEngine = new RallyStageWorld(this.scene, this.rapierWorld);
    await this.worldEngine.init();

    // 5. Environmental Props (Vegetation, Architecture, Breakable Fences & Walls)
    this.propsManager = new StagePropsManager(this.scene, this.rapierWorld, this.worldEngine);
    await this.propsManager.init();

    // 6. Interactive Wildlife AI (Cows & Deer)
    this.wildlifeManager = new WildlifeCrossingManager(this.scene, this.worldEngine);
    this.wildlifeManager.init();
    this.wildlifeManager.onWarning = (msg) => this.showPaceNote(msg);

    // 7. Real-Time Vehicle VFX (Roost dust, tire smoke, puddles, flames, skid marks)
    this.vfxEngine = new EnvironmentVFX(this.scene);
    this.vfxEngine.init();
    this.vfxEngine.onPuddleSplashAudio = () => this.audio.playWaterSplash();

    // 8. Vehicle Simulation Harness (Group B Rally Car)
    this.vehicle = new MockRallyVehicle(this.worldEngine, this.rapierWorld);
    this.scene.add(this.vehicle.mesh);

    // Audio unlock on user gesture
    const unlockAudio = () => {
      this.audio.init();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // 9. Stage Timing Controller
    this.timingController = new StageTimingController(this.worldEngine);
    this.timingController.init(this.circuitMode);
    this.timingController.onPaceNote = (note) => this.showPaceNote(note);
    this.timingController.onTimingUpdate = (info) => {
      const minutes = Math.floor(info.stageTime / 60);
      const seconds = (info.stageTime % 60).toFixed(2).padStart(5, '0');
      this.timerEl.innerText = `${String(minutes).padStart(2, '0')}:${seconds}`;
      this.sectorEl.innerText = `SECTOR ${info.sector} • DELTA ${info.delta >= 0 ? '+' : ''}${info.delta.toFixed(2)}s`;
      this.jokerEl.innerText = `JOKER: ${info.jokerStatus}`;
    };

    // Begin Animation Loop
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private setupWindowEvents(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('keydown', (e) => {
      // Direct Shot 1, 2, 3 Reference Cameras
      if (e.key === '1') {
        this.cameraMode = 'shot1_corridor';
        this.camEl.innerText = 'Shot 1: Middle of Road Pass';
        this.showPaceNote('Camera: Shot 1 (Middle of Road Pass)');
      }
      if (e.key === '2') {
        this.cameraMode = 'shot2_hairpin';
        this.camEl.innerText = 'Shot 2: Banked Hairpin Drift';
        this.showPaceNote('Camera: Shot 2 (Hairpin Drift & Roost)');
      }
      if (e.key === '3') {
        this.cameraMode = 'shot3_aerial';
        this.camEl.innerText = 'Shot 3: Overall Aerial Journey';
        this.showPaceNote('Camera: Shot 3 (Top-Down Aerial Journey Map)');
      }

      // Toggle Camera Mode (C)
      if (e.key === 'c' || e.key === 'C') {
        if (this.cameraMode === 'chase') {
          this.cameraMode = 'shot1_corridor';
          this.camEl.innerText = 'Shot 1: Middle of Road';
        } else if (this.cameraMode === 'shot1_corridor') {
          this.cameraMode = 'shot2_hairpin';
          this.camEl.innerText = 'Shot 2: Hairpin Drift';
        } else if (this.cameraMode === 'shot2_hairpin') {
          this.cameraMode = 'shot3_aerial';
          this.camEl.innerText = 'Shot 3: Aerial Map';
        } else if (this.cameraMode === 'shot3_aerial') {
          this.cameraMode = 'flythrough';
          this.camEl.innerText = 'Cinematic Flythrough';
        } else if (this.cameraMode === 'flythrough') {
          this.cameraMode = 'helicopter';
          this.camEl.innerText = 'Helicopter TV Cam';
        } else {
          this.cameraMode = 'chase';
          this.camEl.innerText = 'Chase Cam';
        }
      }

      // Switch Circuit (T)
      if (e.key === 't' || e.key === 'T') {
        this.circuitMode = this.circuitMode === 'special_stage' ? 'rallycross' : 'special_stage';
        this.timingController.init(this.circuitMode);
        this.showPaceNote(`Switched Circuit: ${this.circuitMode === 'special_stage' ? 'Special Stage (2.4km)' : 'Rallycross (1.2km)'}`);
      }
      // Toggle Co-Driver Voice (V)
      if (e.key === 'v' || e.key === 'V') {
        const enabled = this.coDriverVoice.toggle();
        this.showPaceNote(enabled ? 'Co-Driver Voice Enabled' : 'Co-Driver Voice Muted');
      }
    });
  }

  private showPaceNote(note: string): void {
    this.audio.playRadioChirp();
    this.coDriverVoice.speakPaceNote(note);
    this.pacenoteEl.innerText = note;
    this.pacenoteEl.classList.add('active');
    if (this.pacenoteTimeout) {
      window.clearTimeout(this.pacenoteTimeout);
    }
    this.pacenoteTimeout = window.setTimeout(() => {
      this.pacenoteEl.classList.remove('active');
    }, 3800);
  }

  private tick(): void {
    const deltaTime = Math.min(this.clock.getDelta(), 0.05); // Cap for physics stability
    const elapsedTime = this.clock.getElapsedTime();

    // 1. Step Rapier 3D Physics
    this.rapierWorld.step();

    // 2. Update Vehicle Simulation & Telemetry
    const telemetry = this.vehicle.update(deltaTime);

    // 2.1 Update Synthesized Web Audio
    this.audio.update(
      telemetry.engineRpm,
      telemetry.throttle,
      telemetry.speedKmh,
      telemetry.currentSurface.type !== 'asphalt'
    );

    // 3. Update Vehicle Particles & VFX
    this.vfxEngine.update(deltaTime, telemetry);

    // 4. Update Environmental Props & Breakable Collisions
    this.propsManager.checkBreakableImpacts(telemetry.position, telemetry.velocity);
    this.propsManager.update(deltaTime, elapsedTime);

    // 5. Update Wildlife AI State Machine
    this.wildlifeManager.update(deltaTime, elapsedTime, telemetry.position);

    // 6. Update Timing Controller
    this.timingController.update(deltaTime, telemetry.position);

    // 7. Update Atmosphere Sun Target & Sky
    this.atmosphere.update(telemetry.position);

    // 8. Update Camera
    this.updateCamera(deltaTime, telemetry);

    // 9. Update HUD
    this.speedEl.innerText = Math.round(telemetry.speedKmh).toString();
    const rpmPercent = Math.min(100, (telemetry.engineRpm / 8400) * 100);
    this.rpmBarEl.style.width = `${rpmPercent}%`;
    this.surfaceEl.innerText = telemetry.currentSurface.name;
    this.frictionEl.innerText = telemetry.currentSurface.friction.toFixed(2);
    this.scrubEl.innerText = `${Math.abs(telemetry.lateralSpeed).toFixed(1)} m/s`;

    // 10. Render
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(dt: number, telemetry: any): void {
    if (this.cameraMode === 'shot1_corridor') {
      // Shot 1: Dramatic Low-Angle Road Pass View (Vehicle Centered in Corridor)
      this.camera.fov = 56;
      this.camera.updateProjectionMatrix();
      const chaseOffset = telemetry.forward.clone().multiplyScalar(-5.4).add(new THREE.Vector3(0, 1.45, 0));
      const targetCamPos = telemetry.position.clone().add(chaseOffset);
      this.camera.position.lerp(targetCamPos, dt * 8.0);
      const lookTarget = telemetry.position.clone().add(telemetry.forward.clone().multiplyScalar(16.0)).add(new THREE.Vector3(0, 1.1, 0));
      this.camera.lookAt(lookTarget);
    } else if (this.cameraMode === 'shot2_hairpin') {
      // Shot 2: Trackside Apex Dynamic Camera at Banked Hairpin
      this.camera.fov = 65;
      this.camera.updateProjectionMatrix();
      const tracksideOffset = telemetry.forward.clone().multiplyScalar(12.0).add(new THREE.Vector3(-12, 5.5, 8));
      const hpPos = telemetry.position.clone().add(tracksideOffset);
      this.camera.position.lerp(hpPos, dt * 5.0);
      this.camera.lookAt(telemetry.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
    } else if (this.cameraMode === 'shot3_aerial') {
      // Shot 3: High-Altitude Birds-Eye Aerial View of Complete Stage Pass
      this.camera.fov = 52;
      this.camera.updateProjectionMatrix();
      const aerialPos = new THREE.Vector3(0, 580, 220);
      this.camera.position.lerp(aerialPos, dt * 4.0);
      this.camera.lookAt(new THREE.Vector3(0, 45, 0));
    } else if (this.cameraMode === 'chase') {
      // Dynamic rally chase camera with speed FOV kick
      const targetFov = 60 + (telemetry.speedKmh / 160) * 15;
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 4.0);
      this.camera.updateProjectionMatrix();

      const chaseOffset = telemetry.forward.clone().multiplyScalar(-6.8).add(new THREE.Vector3(0, 2.4, 0));
      const targetCamPos = telemetry.position.clone().add(chaseOffset);
      this.camera.position.lerp(targetCamPos, dt * 6.5);

      const lookTarget = telemetry.position.clone().add(telemetry.forward.clone().multiplyScalar(4.0)).add(new THREE.Vector3(0, 0.8, 0));
      this.camera.lookAt(lookTarget);
    } else if (this.cameraMode === 'flythrough') {
      // Smooth cinematic camera gliding along the 2.4km track spline
      const spline = this.worldEngine.specialStageSpline;
      const totalLen = spline.getLength();
      this.flythroughProgress = (this.flythroughProgress + (35.0 / totalLen) * dt) % 1.0;

      const camSplinePoint = spline.getPointAt(this.flythroughProgress);
      this.camera.position.set(camSplinePoint.x + 8.0, camSplinePoint.y + 7.5, camSplinePoint.z + 8.0);

      const lookAheadU = (this.flythroughProgress + 0.04) % 1.0;
      const lookPoint = spline.getPointAt(lookAheadU);
      this.camera.lookAt(lookPoint);
    } else if (this.cameraMode === 'helicopter') {
      // High-angle TV broadcast camera tracking car from above
      const heliPos = telemetry.position.clone().add(new THREE.Vector3(25, 38, 25));
      this.camera.position.lerp(heliPos, dt * 2.5);
      this.camera.lookAt(telemetry.position);
    }
  }
}

// Start Application on Load
window.addEventListener('DOMContentLoaded', () => {
  const app = new ApexRallyApp();
  app.start().catch((err) => {
    console.error('Failed to start Apex Rally Engine:', err);
  });
});

