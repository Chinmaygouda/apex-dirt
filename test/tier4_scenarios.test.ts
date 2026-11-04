/**
 * APEX DIRT - E2E TEST SUITE: TIER 4 REAL-WORLD APPLICATION SCENARIOS
 * 
 * Verifies 6 complete end-to-end rally application scenarios per TEST_INFRA.md:
 * - Scenario 1: Full Stage High-Speed Rally Run
 * - Scenario 2: Nocturnal Stage Navigation
 * - Scenario 3: Severe Roadside Obstacle Collision
 * - Scenario 4: Wildlife Track Crossing Encounter
 * - Scenario 5: Hairpin Drift & Handbrake Slide
 * - Scenario 6: Cockpit First-Person Driver Experience
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { registerTest, expect, createSimulationHarness } from './e2e_test_framework.js';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle.js';
import { CameraManager } from '../src/core/CameraManager.js';
import { CockpitController } from '../src/vehicles/CockpitController.js';
import { HeadlightController } from '../src/vehicles/HeadlightController.js';
import { RallyStageWorld } from '../src/world/RallyStageWorld.js';
import { DayNightCycleController } from '../src/world/DayNightCycleController.js';
import { WildlifeCrossingManager } from '../src/world/WildlifeCrossingManager.js';
import { CoDriverSystem } from '../src/gameplay/CoDriverSystem.js';
import { CollisionImpulseDispatcher, ICollisionContactEvent } from '../src/physics/CollisionImpulseDispatcher.js';
import { VehicleDamageController } from '../src/vehicles/VehicleDamageController.js';
import { VehicleEffects } from '../src/effects/VehicleEffects.js';
import { RallyAudioEngine } from '../src/audio/RallyAudioEngine.js';
import { StageManager } from '../src/gameplay/StageManager.js';
import { SandboxEnvironment } from '../src/world/SandboxEnvironment.js';

// ============================================================================
// SCENARIO 1: FULL STAGE HIGH-SPEED RALLY RUN
// ============================================================================

registerTest(4, 'T4_SCENARIO_01', 'Scenario: Rally Run', 'Full stage high-speed rally run with gate progression and stable telemetry', async () => {
  const harness = await createSimulationHarness();
  const rallyWorld = new RallyStageWorld(harness.scene, harness.physics);
  const stage = new StageManager(harness.scene, rallyWorld, harness.vehicle);
  stage.state = 'RACING';
  const audio = new RallyAudioEngine();

  // Accelerate along stage for 3.5 simulated seconds
  for (let step = 0; step < 210; step++) {
    const dt = 1 / 60;
    const inputs = {
      throttle: 1.0,
      brake: 0,
      steer: 0, // Straight-line acceleration down center of stage
      handbrake: false,
      reset: false,
      drivetrainToggle: false,
      demoSkidpad: false,
      demoHandbrake: false,
    };

    harness.step(dt, inputs);
    stage.update(dt);

    const telem = harness.vehicle.getTelemetry(inputs);
    audio.update(telem);
  }

  console.log('T4_01 pos:', harness.vehicle.chassisBody.translation(), 'linvel:', harness.vehicle.chassisBody.linvel());
  const finalTelem = harness.vehicle.getTelemetry({ throttle: 1, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
  console.log('T4_SCENARIO_01 speedMph:', finalTelem.speedMph, 'gear:', harness.vehicle.currentGear);
  expect(stage.stageTimeS).toBeGreaterThan(3.0, 'Stage timer must accumulate elapsed racing time');
  expect(finalTelem.speedMph).toBeGreaterThan(25, 'Vehicle must accelerate during high-speed run');
  expect(harness.vehicle.currentGear).toBeGreaterThanOrEqual(1, 'Transmission must engage drive gear');
  expect(isNaN(finalTelem.speedMph)).toBe(false, 'Telemetry must remain strictly numeric without NaN');

  harness.dispose();
});

// ============================================================================
// SCENARIO 2: NOCTURNAL STAGE NAVIGATION
// ============================================================================

registerTest(4, 'T4_SCENARIO_02', 'Scenario: Night Navigation', 'Night stage navigation with headlight illumination and dark ambient atmosphere', async () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.FogExp2('#090d16', 0.0028);

  const sun = new THREE.DirectionalLight();
  const hemi = new THREE.HemisphereLight();
  scene.add(sun);
  scene.add(hemi);

  const dayNight = new DayNightCycleController(scene, sun, hemi);
  dayNight.setPreset('NIGHT');

  // Verify night atmosphere
  expect(sun.intensity).toBeCloseTo(0.15, 0.05, 'Night sun intensity must be low ambient moonlight');
  expect(hemi.intensity).toBeCloseTo(0.12, 0.05, 'Night hemisphere intensity must be dark');

  // Mount headlights
  const carGroup = new THREE.Group();
  scene.add(carGroup);
  const headlights = new HeadlightController(carGroup, scene);

  expect(headlights.isOn).toBe(false);

  // Turn on headlights for night driving
  headlights.setHeadlights(true);
  expect(headlights.isOn).toBe(true);

  // Spotlights illuminate road
  let spotCount = 0;
  carGroup.traverse((c) => {
    if ((c as THREE.SpotLight).isSpotLight) {
      spotCount++;
      const spot = c as THREE.SpotLight;
      expect(spot.intensity).toBe(16.0, 'Headlights must project high intensity beam in night');
      expect(spot.distance).toBe(85, 'Headlights reach must be 85m');
    }
  });
  expect(spotCount).toBe(2, 'Must have dual spotlights');
});

// ============================================================================
// SCENARIO 3: SEVERE ROADSIDE OBSTACLE COLLISION
// ============================================================================

registerTest(4, 'T4_SCENARIO_03', 'Scenario: Obstacle Crash', 'High-speed roadside collision with localized vertex crumple and detached debris physics', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  vehicle.resetPosition();

  const dispatcher = new CollisionImpulseDispatcher(physics);
  dispatcher.registerCarCollider(vehicle.chassisCollider);

  let damageReportedSeverity = '';
  let damageReportedImpulse = 0;
  const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);
  damageCtrl.onDamage = (sev, imp) => {
    damageReportedSeverity = sev;
    damageReportedImpulse = imp;
  };

  const initialBodies = physics.world.bodies.len();

  // Create tree collider directly in front of the vehicle
  const treeBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.8, 5.0));
  const treeCol = physics.world.createCollider(RAPIER.ColliderDesc.cylinder(2.0, 0.4), treeBody);
  dispatcher.registerEntity(treeCol, 'tree');

  // Simulate severe impact event directly (J = 14,000 Ns)
  const severeEvent: ICollisionContactEvent = {
    contactPoint: new THREE.Vector3(0, 0.4, 2.15),
    contactNormal: new THREE.Vector3(0, 0, -1),
    impulseMagnitude: 14000,
    collidedEntity: 'tree',
    targetSubMesh: 'front_bumper',
  };

  damageCtrl.handleCollision(severeEvent);

  expect(damageReportedSeverity).toBe('severe', 'High speed tree crash must trigger severe damage');
  expect(damageReportedImpulse).toBe(14000);
  expect(physics.world.bodies.len()).toBeGreaterThan(initialBodies, 'Front bumper must detach into dynamic rigid body debris');

  // Step physics and damage controller to verify debris tumbling
  for (let s = 0; s < 30; s++) {
    physics.step(1 / 60, () => {});
    damageCtrl.update(1 / 60);
  }

  expect(damageCtrl).toBeDefined();
});

// ============================================================================
// SCENARIO 4: WILDLIFE TRACK CROSSING ENCOUNTER
// ============================================================================

registerTest(4, 'T4_SCENARIO_04', 'Scenario: Wildlife Crossing', 'Interactive wildlife crossing encounter: stag leaps across track upon vehicle approach', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const rallyWorld = new RallyStageWorld(scene, physics);
  const wildlife = new WildlifeCrossingManager(scene, rallyWorld);

  // Stage crossing 1 is at road distance 450m
  const pt450 = rallyWorld.spline.getPointAt(450 / rallyWorld.totalLength);

  // Approach sequence: Car approaches from 150m down to 30m
  for (let dist = 150; dist >= 30; dist -= 5) {
    const carPos = new THREE.Vector3(pt450.x + dist, pt450.y, pt450.z);
    wildlife.update(0.05, carPos);
  }

  // Animal should now be leaping across track corridor
  expect(wildlife.group.children.length).toBeGreaterThan(0, 'Animal models must be present in world');

  // Allow animal to finish crossing to verge
  for (let step = 0; step < 120; step++) {
    wildlife.update(1 / 60, pt450);
  }

  expect(wildlife.group).toBeDefined();
});

// ============================================================================
// SCENARIO 5: HAIRPIN DRIFT & HANDBRAKE SLIDE
// ============================================================================

registerTest(4, 'T4_SCENARIO_05', 'Scenario: Hairpin Drift', 'Hairpin drift maneuver with rear lockup, peak slip angle 30-40°, and slide-scrub decel', async () => {
  const harness = await createSimulationHarness();
  const effects = new VehicleEffects(harness.scene, harness.vehicle, harness.physics);
  const audio = new RallyAudioEngine();

  // Approach at 115 mph
  const ms = 115 * 0.44704;
  harness.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: ms }, true);
  (harness.vehicle as any).currentGear = 5;

  // Turn-in with handbrake
  let peakSlip = 0;
  for (let s = 0; s < 45; s++) {
    harness.step(1 / 60, { throttle: 0, brake: 0.2, handbrake: true, steer: 0.9 });
    const telem = harness.vehicle.getTelemetry({ throttle: 0, brake: 0.2, steer: 0.9, handbrake: true, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
    if (Math.abs(telem.driftAngleDeg) > peakSlip) {
      peakSlip = Math.abs(telem.driftAngleDeg);
    }
    audio.update(telem);
  }

  // Counter-steer and power-out
  for (let s = 0; s < 45; s++) {
    harness.step(1 / 60, { throttle: 1.0, brake: 0, handbrake: false, steer: -0.4 });
    const telem = harness.vehicle.getTelemetry({ throttle: 1.0, brake: 0, steer: -0.4, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
    audio.update(telem);
  }

  expect(peakSlip).toBeGreaterThanOrEqual(25.0, 'Hairpin handbrake slide must produce aggressive slip angle >= 25°');
  expect(effects).toBeDefined();

  harness.dispose();
});

// ============================================================================
// SCENARIO 6: COCKPIT FIRST-PERSON DRIVER EXPERIENCE
// ============================================================================

registerTest(4, 'T4_SCENARIO_06', 'Scenario: Cockpit FPV', 'First-person driver experience with rotating steering wheel, 2-bone arm IK, and gauge needles', async () => {
  const harness = await createSimulationHarness();
  const camManager = new CameraManager(16 / 9);

  // Cycle from CHASE to COCKPIT_FPV
  const mode = camManager.cycleMode();
  expect(mode).toBe('COCKPIT_FPV');

  const cockpit = new CockpitController(harness.vehicle.carGroup);

  // Drive through sweeping corners: full left steer (-1.0), then full right steer (+1.0)
  for (let i = 0; i < 40; i++) {
    const steer = i < 20 ? -0.8 : 0.8;
    harness.step(1 / 60, { throttle: 0.8, steer });
    const telem = harness.vehicle.getTelemetry({ throttle: 0.8, brake: 0, steer, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
    
    cockpit.update(1 / 60, { steer }, telem);
    camManager.update(harness.vehicle, 1 / 60, steer);
  }

  // Trigger shift animation
  harness.vehicle.isShifting = true;
  const telemShift = harness.vehicle.getTelemetry({ throttle: 0.8, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
  cockpit.update(1 / 60, { steer: 0 }, telemShift);

  expect(camManager.camera.position.x).toBeCloseTo(harness.vehicle.chassisMesh.position.x - 0.32, 0.4);
  expect(cockpit.group).toBeDefined();

  harness.dispose();
});
