import * as THREE from 'three';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { CollisionImpulseDispatcher } from './physics/CollisionImpulseDispatcher';
import { InputManager } from './core/InputManager';
import { CustomRallyVehicle, RALLY_LIVERIES } from './vehicles/CustomRallyVehicle';
import { CameraManager } from './core/CameraManager';
import { CockpitController } from './vehicles/CockpitController';
import { HeadlightController } from './vehicles/HeadlightController';
import { DayNightCycleController } from './world/DayNightCycleController';
import { VehicleDamageController } from './vehicles/VehicleDamageController';
import { TelemetryHUD } from './ui/TelemetryHUD';
import { VehicleDebugOverlay } from './ui/VehicleDebugOverlay';
import { TuningPanel } from './ui/TuningPanel';
import { THREE_PALETTE } from './core/Constants';
import { RallyStageWorld, STAGE_PALETTE } from './world/RallyStageWorld';
import { SandboxEnvironment } from './world/SandboxEnvironment';
import { WildlifeCrossingManager } from './world/WildlifeCrossingManager';
import { CoDriverSystem } from './gameplay/CoDriverSystem';
import { StageManager } from './gameplay/StageManager';
import { ProvingGroundWorld } from './world/ProvingGroundWorld';
import { ReplayVisualizer } from './replay/ReplayVisualizer';
import { VehicleInspectionController } from './core/VehicleInspectionController';

async function initGame() {
  (window as any).THREE = THREE;
  // 1. Renderer Setup
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  // 2. Scene Setup: Clean Horizon for Vehicle Dynamics Proving Ground
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x94a3b8);
  scene.fog = new THREE.FogExp2(new THREE.Color(0x94a3b8), 0.0008);

  // 3. Lighting: Crisp Proving Ground Directional Sun
  const hemiLight = new THREE.HemisphereLight(new THREE.Color(0xe2e8f0), new THREE.Color(0x334155), 0.95);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(new THREE.Color(0xffffff), 2.4);
  sunLight.position.set(50, 60, -40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.bias = -0.0005;

  const shadowCamSize = 45;
  sunLight.shadow.camera.left = -shadowCamSize;
  sunLight.shadow.camera.right = shadowCamSize;
  sunLight.shadow.camera.top = shadowCamSize;
  sunLight.shadow.camera.bottom = -shadowCamSize;
  sunLight.shadow.camera.near = 5;
  sunLight.shadow.camera.far = 240;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // 4. Procedural Low-Poly Drifting Sky Clouds
  createSkyAndClouds(scene);

  // 5. Physics Initialization (Rapier3D WASM)
  const physics = new PhysicsWorld();
  await physics.init();

  // 6. World Proving Ground: Flat 2,000m x 2,000m Test Plane with Checkerboard Grid
  // 0 trees, 0 green terrain meshes, 0 obstacle bodies
  const provingGround = new ProvingGroundWorld(scene, physics);

  // 7. Custom Tyre Model Vehicle
  const vehicle = new CustomRallyVehicle(scene, physics);
  vehicle.worldSurfaceQuery = (x, z) => provingGround.getSurfaceAt(x, z);

  // 7b. Vehicle Effects (exhaust pops, tyre smoke, dust particles, skid marks)
  const { VehicleEffects } = await import('./effects/VehicleEffects');
  const vehicleEffects = new VehicleEffects(scene, vehicle, physics);

  // 7c. Vehicle Dynamics Test Manager (0-60 timer, distance tracking, 0 gate post clutter)
  const { ProvingGroundManager } = await import('./gameplay/ProvingGroundManager');
  const stageManager = new ProvingGroundManager(scene, vehicle);

  // 7d. Procedural Rally Audio Engine
  const { RallyAudioEngine } = await import('./audio/RallyAudioEngine');
  const audioEngine = new RallyAudioEngine();
  vehicleEffects.onExhaustPop = () => audioEngine.triggerExhaustPop();

  // 8. Multi-Camera Manager (Chase, Cockpit FPV, Hood)
  const camera = new CameraManager(window.innerWidth / window.innerHeight);

  // 8b. Cockpit Interior & Driver IK Rig
  const cockpit = new CockpitController(vehicle.carGroup);

  // 8c. Headlights Controller
  const headlightController = new HeadlightController(vehicle.carGroup, scene);

  // 8d. Dynamic Day/Night Lighting Cycle
  const dayNightCycle = new DayNightCycleController(scene, sunLight, hemiLight);

  // 8e. Vehicle Damage Controller (localized crumple + detachable debris)
  const { CollisionImpulseDispatcher } = await import('./physics/CollisionImpulseDispatcher');
  const collisionDispatcher = new CollisionImpulseDispatcher(physics);
  collisionDispatcher.registerCarCollider(vehicle.chassisCollider);
  const damageController = new VehicleDamageController(scene, vehicle, physics, collisionDispatcher);
  damageController.vehicleEffects = vehicleEffects;
  damageController.onDamage = (severity, impulse) => audioEngine.triggerCollision(severity, impulse);
  vehicleEffects.onGroundScrape = (speed) => audioEngine.playSkidPlateScrape(speed);

  // Wire Gamepad Haptics (Collision Dual-Rumble)
  collisionDispatcher.onCollision((event) => {
    const intensity = Math.min(1.0, event.impulseMagnitude / 9000);
    inputManager.playRumble(intensity, 0.5, 200);
  });

  // 9. Input & UI with Demo Automation
  const inputManager = new InputManager();
  const hud = new TelemetryHUD();
  hud.onToggleAudio = () => audioEngine.toggleMute();
  hud.onToggleLivery = () => {
    const liv = vehicle.cycleLivery();
    return RALLY_LIVERIES[liv].name;
  };

  // 9b. Multi-View Vehicle Inspection Controller (6 CAD Primary Viewpoints & Dedicated Studio Lighting)
  const inspectionController = new VehicleInspectionController(scene);
  inspectionController.setGroundObject(provingGround.group);
  inspectionController.setVehicle(vehicle);
  hud.onToggleInspection = () => {
    vehicle.setCockpitViewMode(false);
    inspectionController.toggle(undefined, vehicle);
  };
  hud.onSelectInspectionPreset = (idx) => inspectionController.setPresetByIndex(idx);
  hud.onCycleInspectionPreset = (fwd) => inspectionController.cyclePreset(fwd);
  hud.onExitInspection = () => inspectionController.exit();
  inspectionController.onActiveChanged = (active) => hud.showInspectionMode(active);
  inspectionController.onViewChanged = (preset) => hud.updateInspectionView(preset);

  let demoMode: 'skidpad' | 'handbrake' | 'testA' | null = null;
  let demoTimer = 0;
  let testAShotTaken = false;

  const runSkidpadTest = () => {
    vehicle.resetPosition();
    demoMode = 'skidpad';
    demoTimer = 0;
  };

  const runHandbrakeTest = () => {
    vehicle.resetPosition();
    demoMode = 'handbrake';
    demoTimer = 0;
  };

  const runTestA = () => {
    debugOverlay.setVisible(true);
    vehicle.tuning.showDebugOverlays = true;
    vehicle.resetPosition();
    const initSpeedMs = 115 * 0.44704;
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    (vehicle as any).currentGear = 5;
    const omega = initSpeedMs / vehicle.wheelRadius;
    for (let i = 0; i < 4; i++) {
      (vehicle as any).wheelAngularVel[i] = omega;
    }

    // Pre-settle suspension on ground
    for (let i = 0; i < 15; i++) {
      physics.step(1 / 120, (dt) => {
        vehicle.updatePhysicsSubstep(dt, {
          throttle: 0.8,
          brake: 0,
          steer: 0,
          handbrake: false,
          reset: false,
          drivetrainToggle: false,
          demoSkidpad: false,
          demoHandbrake: false,
        });
      });
    }

    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    for (let i = 0; i < 4; i++) {
      (vehicle as any).wheelAngularVel[i] = omega;
    }
    camera.update(vehicle, 0.05);

    demoMode = 'testA';
    demoTimer = 0;
    testAShotTaken = false;
  };

  (window as any).runSkidpadTest = runSkidpadTest;
  (window as any).runHandbrakeTest = runHandbrakeTest;
  (window as any).runTestA = runTestA;

  const debugOverlay = new VehicleDebugOverlay(scene);

  const tuningPanel = new TuningPanel(
    vehicle,
    camera.chaseCam,
    runSkidpadTest,
    runHandbrakeTest,
    (show) => debugOverlay.setVisible(show)
  );

  window.addEventListener('keydown', (e) => {
    if (e.key === 'o' || e.key === 'O') {
      vehicle.tuning.showDebugOverlays = debugOverlay.visible;
    }
  });

  // Replay Visualizer & Screenshot Capture
  const replayVisualizer = new ReplayVisualizer(scene, physics, vehicle, camera.chaseCam, renderer, sunLight);
  (window as any).runVisualReplay = () => replayVisualizer.runAndCaptureScreenshots();

  // Deterministic Video Recorder
  const { DeterministicVideoRecorder } = await import('./video/DeterministicVideoRecorder');
  const videoRecorder = new DeterministicVideoRecorder(scene, physics, vehicle, camera.chaseCam, renderer, sunLight, stageManager as any);
  (window as any).renderAllVideos = () => videoRecorder.renderAllClips();
  (window as any).renderKeyboardVideo = () => videoRecorder.renderClipKeyboardFeel();
  (window as any).stageManager = stageManager;
  (window as any).restartStage = () => stageManager.restart();
  (window as any).cameraManager = camera;
  (window as any).cockpitController = cockpit;
  (window as any).cockpit = cockpit;
  (window as any).headlightController = headlightController;
  (window as any).dayNightCycle = dayNightCycle;
  (window as any).damageController = damageController;
  (window as any).audioEngine = audioEngine;
  (window as any).provingGround = provingGround;
  (window as any).vehicle = vehicle;
  (window as any).vehicleEffects = vehicleEffects;
  (window as any).collisionDispatcher = collisionDispatcher;
  (window as any).inspectionController = inspectionController;
  (window as any).setInspectionView = (view: any) => inspectionController.setPreset(view, true);
  (window as any).toggleInspection = (force?: boolean) => {
    vehicle.setCockpitViewMode(false);
    return inspectionController.toggle(force, vehicle);
  };
  (window as any).scene = scene;
  (window as any).physics = physics;
  (window as any).hud = hud;
  (window as any).telemetryHud = hud;

  if (window.location.search.includes('test_a=true')) {
    setTimeout(() => {
      console.log('Automated Test A Triggered via query param');
      runTestA();
    }, 500);
  }

  if (window.location.search.includes('replay=true')) {
    setTimeout(async () => {
      console.log('Automated Replay Triggered via query param');
      const files = await replayVisualizer.runAndCaptureScreenshots();
      (window as any).__replayFinished = true;
      (window as any).__savedScreenshots = files;
    }, 600);
  }

  if (window.location.search.includes('render_videos=true')) {
    setTimeout(async () => {
      console.log('Automated 4-Clip Deterministic Video Render Triggered via query param');
      const results = await videoRecorder.renderAllClips();
      (window as any).__videoRenderFinished = true;
      (window as any).__videoResults = results;
      console.log('All video clips rendered & finished successfully:', results);
    }, 600);
  }

  if (window.location.search.includes('render_keyboard=true')) {
    setTimeout(async () => {
      console.log('Automated Keyboard Video Render Triggered via query param');
      const result = await videoRecorder.renderClipKeyboardFeel();
      (window as any).__videoRenderFinished = true;
      (window as any).__videoResults = [result];
      console.log('Keyboard video clip rendered & finished successfully:', result);
    }, 600);
  }

  // 10. Window resize handling
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.onResize(w, h);
    renderer.setSize(w, h);
  });

  // 11. Main Loop (Render at 60-120+ FPS, Substep Physics at 120 Hz)
  let prevTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);

    if ((window as any).__isReplaying) {
      return;
    }

    const now = performance.now();
    const frameDt = Math.min((now - prevTime) / 1000, 0.1);
    prevTime = now;

    // Get current inputs
    let inputs = inputManager.update();

    if (inputs.inspectToggle) {
      vehicle.setCockpitViewMode(false);
      inspectionController.toggle(undefined, vehicle);
    }
    if (inputs.inspectExit && inspectionController.isActive) {
      inspectionController.exit();
    }

    if (inspectionController.isActive) {
      if (inputs.inspectHudToggle) {
        hud.toggleInspectionHud();
      }
      if (inputs.cameraCycle) {
        inspectionController.cyclePreset(true);
      }
      if (typeof inputs.inspectDigit === 'number' && inputs.inspectDigit >= 1 && inputs.inspectDigit <= 6) {
        inspectionController.setPresetByIndex(inputs.inspectDigit - 1);
      }
      inputs = {
        throttle: 0,
        brake: 1.0,
        steer: 0,
        handbrake: true,
        reset: false,
        drivetrainToggle: false,
        demoSkidpad: false,
        demoHandbrake: false,
      };
    } else {
      if (inputs.cameraCycle) {
        const mode = camera.cycleMode();
        vehicle.setCockpitViewMode(mode === 'COCKPIT_FPV');
        cockpit.setCockpitViewMode(mode === 'COCKPIT_FPV');
        hud.setCameraMode?.(mode);
      }
      if (inputs.demoSkidpad) {
        runSkidpadTest();
      } else if (inputs.demoHandbrake) {
        runHandbrakeTest();
      }
    }

    if (inputs.headlightToggle) {
      const on = headlightController.toggle();
      hud.setHeadlights?.(on);
    }
    if (inputs.liveryCycle) {
      const liv = vehicle.cycleLivery();
      hud.setLivery?.(RALLY_LIVERIES[liv].name);
    }
    if (inputs.dayNightToggle) {
      const preset = dayNightCycle.togglePreset();
      hud.setTimeOfDay?.(preset);
    }
    if (inputs.throttle > 0 || inputs.brake > 0 || Math.abs(inputs.steer) > 0 || inputs.handbrake) {
      demoMode = null;
      (window as any).__testAPeakFrozen = false;
    }

    if ((window as any).__testAPeakFrozen) {
      const frozenInputs = { throttle: 0, brake: 0.8, steer: 1.0, handbrake: true, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
      vehicle.updateVisuals(frozenInputs);
      const telemetry = vehicle.getTelemetry(frozenInputs);
      hud.update(telemetry);
      debugOverlay.update(telemetry);
      renderer.render(scene, camera.camera);
      return;
    }

    if (demoMode === 'skidpad') {
      demoTimer += frameDt;
      if (demoTimer < 1.4) {
        // Accelerate straight out of start gate
        inputs = { throttle: 1.0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
      } else if (demoTimer < 2.2) {
        // Turn right towards skid pad at x=45
        inputs = { throttle: 0.85, brake: 0, steer: 0.8, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
      } else if (demoTimer < 2.6) {
        // Flick handbrake to initiate drift
        inputs = { throttle: 0.2, brake: 0, steer: 0.9, handbrake: true, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
      } else {
        // Continuous circular power slide around skid pad with counter-steer assist
        inputs = { throttle: 0.92, brake: 0, steer: 0.55, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
      }
    } else if (demoMode === 'handbrake') {
      demoTimer += frameDt;
      if (demoTimer < 5.2) {
        // Accelerate straight to 55 mph
        inputs = { throttle: 1.0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
      } else if (demoTimer < 6.0) {
        // Yank handbrake + hard steer flick at 55 mph to rotate 90°
        inputs = { throttle: 0.0, brake: 0, steer: 1.0, handbrake: true, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
      } else if (demoTimer < 8.0) {
        // Counter-steer and power out to recover straight
        inputs = { throttle: 0.8, brake: 0, steer: -0.6, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
      } else {
        inputs = { throttle: 1.0, brake: 0, steer: 0.0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
      }
    } else if (demoMode === 'testA') {
      demoTimer += frameDt;
      if (demoTimer < 0.15) {
        inputs = { throttle: 0.8, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
      } else if (demoTimer < 1.05) {
        // 0.9s initiation with brake 0.8, handbrake true, steer 1.0
        inputs = { throttle: 0, brake: 0.8, steer: 1.0, handbrake: true, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };

        if (demoTimer >= 0.78 && !testAShotTaken) {
          testAShotTaken = true;
          (window as any).__captureTestAPeak = true;
          (window as any).__testAPeakFrozen = true;
        }
      } else if (demoTimer < 3.0) {
        // Hold drift pose with counter-steer & pumped throttle
        const pump = Math.sin(demoTimer * 12.0) > 0 ? 0.75 : 0.15;
        const slip = Math.abs(vehicle.driftAngleDeg);
        inputs = { throttle: pump, brake: 0, steer: slip < 10 ? 0 : -0.2, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
      } else {
        inputs = { throttle: 1.0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false };
      }
    }

    // 120 Hz Physics Substepping
    physics.step(frameDt, (substepDt) => {
      vehicle.updatePhysicsSubstep(substepDt, inputs);
      if (vehicle.chassisMesh) {
        collisionDispatcher.drainImpulses(substepDt, vehicle.chassisMesh.position, vehicle.chassisMesh.quaternion);
      }
    });

    // Update Visuals & Sync Meshes
    vehicle.updateVisuals(inputs);

    // Update Chase Camera
    damageController.update(frameDt);

    const telemetry = vehicle.getTelemetry(inputs);
    if (inspectionController.isActive) {
      vehicle.setCockpitViewMode(false);
      cockpit.setCockpitViewMode(false);
      cockpit.update(frameDt, telemetry, 0);
      dayNightCycle.update(frameDt, vehicle.chassisMesh ? vehicle.chassisMesh.position : undefined);
      inspectionController.update(camera.camera, vehicle, frameDt);
    } else {
      const isCockpit = camera.currentMode === 'COCKPIT_FPV';
      vehicle.setCockpitViewMode(isCockpit);
      cockpit.setCockpitViewMode(isCockpit);
      cockpit.update(frameDt, telemetry, inputs.steer);
      dayNightCycle.update(frameDt, vehicle.chassisMesh ? vehicle.chassisMesh.position : undefined);
      if (!(window as any).__debugFreeCam) {
        camera.update(vehicle, frameDt, inputs.steer);
      }
    }

    // Update Vehicle Effects (Phase 2: exhaust, tyre smoke, tracks, sun glare)
    vehicleEffects.update(frameDt, inputs, camera.camera, sunLight);

    // Dynamic Gamepad Vibration (Gravel slide scrub & handbrake drift)
    if (Math.abs(vehicle.driftAngleDeg) > 12 || inputs.handbrake) {
      inputManager.playRumble(0.06, Math.min(0.5, Math.abs(vehicle.driftAngleDeg) / 45), 70);
    }

    if (inputs.reset) {
      stageManager.restart();
      damageController.reset();
    }
    stageManager.update(frameDt);

    // Update Telemetry HUD & Debug Overlay
    hud.update(telemetry, stageManager as any);
    debugOverlay.update(telemetry);

    // Update Procedural Audio Engine (Phase 5)
    audioEngine.update(frameDt, telemetry);

    // Render Scene
    renderer.render(scene, camera.camera);

    if ((window as any).__captureTestAPeak) {
      (window as any).__captureTestAPeak = false;
      const dataUrl = renderer.domElement.toDataURL('image/png');
      fetch('/api/save-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'v4_test_a_peak_drift.png', dataUrl }),
      }).then(() => {
        console.log('[Test A] Captured v4_test_a_peak_drift.png at peak of slide');
        (window as any).__testAFinished = true;
      });
    }
  }

  requestAnimationFrame(animate);
}

function createSkyAndClouds(scene: THREE.Scene): void {
  // Low-poly drifting cloud clusters
  const cloudsGroup = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: THREE_PALETTE.cloudWhite,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  });

  const cloudGeom = new THREE.IcosahedronGeometry(1, 0); // Faceted icosahedron

  for (let c = 0; c < 14; c++) {
    const singleCloud = new THREE.Group();
    const numPuffs = 4 + Math.floor(Math.random() * 5);
    for (let p = 0; p < numPuffs; p++) {
      const puff = new THREE.Mesh(cloudGeom, cloudMat);
      const scale = 5 + Math.random() * 8;
      puff.scale.set(scale * 1.5, scale * 0.7, scale * 1.2);
      puff.position.set(
        (p - numPuffs / 2) * 5 + (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 4
      );
      singleCloud.add(puff);
    }
    singleCloud.position.set(
      (Math.random() - 0.5) * 350,
      45 + Math.random() * 25,
      (Math.random() - 0.5) * 350
    );
    cloudsGroup.add(singleCloud);
  }

  scene.add(cloudsGroup);
}

// Start game
initGame().catch(console.error);
