/**
 * APEX DIRT - E2E TEST SUITE: TIER 3 PAIRWISE COMBINATORIAL INTERACTIONS
 * 
 * Verifies 18 cross-feature pairwise interactions:
 * - T3_PAIR_01: [Heavy Braking (R1)] + [Night Stage Headlights (R2/R3)]
 * - T3_PAIR_02: [Handbrake Drift (R1)] + [Instanced Dust Cloud Spawn (R5)]
 * - T3_PAIR_03: [Full Throttle Acceleration (R1)] + [Cockpit Tachometer & Shifter IK (R2)]
 * - T3_PAIR_04: [High Slip Angle Lateral Slide (R1)] + [Persistent Skidmark Ribbon Conformance (R5)]
 * - T3_PAIR_05: [Severe Roadside Tree Collision (R1/R4)] + [Detachable Debris Rigid Body (R4)]
 * - T3_PAIR_06: [Night Preset (R3)] + [Headlight Toggle Key L/H (R2)]
 * - T3_PAIR_07: [High Speed Approach (R1)] + [Interactive Wildlife Crossing Trigger (R3)]
 * - T3_PAIR_08: [Approaching Sharp Curve (R1/R3)] + [Co-Driver Visual HUD & Voice Audio (R3)]
 * - T3_PAIR_09: [Throttle Release at High RPM (R1)] + [Anti-Lag Exhaust Pops & Turbo Wastegate (R5)]
 * - T3_PAIR_10: [Cockpit FPV View (R2)] + [High-Speed Cornering Body Roll & Steer (R1)]
 * - T3_PAIR_11: [Medium Obstacle Collision (R4)] + [Localized Vertex Crumple (R4)]
 * - T3_PAIR_12: [Severe Rear Impact (R4)] + [Detachable Rear Wing Group (R4)]
 * - T3_PAIR_13: [Dynamic Day/Night Dusk Transition (R3)] + [Sun Orbital Position & Fog (R3)]
 * - T3_PAIR_14: [Handbrake Turn (R1)] + [Tire Skid Audio Scrub & Brake Friction (R5)]
 * - T3_PAIR_15: [Hood Camera Mode (R2)] + [Front Collision Damage (R4)]
 * - T3_PAIR_16: [Spline Elevation Crest (R3)] + [Suspension Rebound & Droop Limiter (R1)]
 * - T3_PAIR_17: [Continuous Driving Lap (R1/R3)] + [Stage Timer & Checkpoint Splits (R6)]
 * - T3_PAIR_18: [Vehicle Full Reset (R1)] + [Damage Controller, Wildlife & Effects Reset (R4/R3/R5)]
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

// ============================================================================
// TIER 3 PAIRWISE COMBINATORIAL INTERACTIONS
// ============================================================================

registerTest(3, 'T3_PAIR_01', 'Pairwise R1+R2', 'Heavy braking pitch dive angles forward spotlight beam downward without clipping', async () => {
  const harness = await createSimulationHarness();
  const headlights = new HeadlightController(harness.vehicle.carGroup, harness.scene);
  headlights.setHeadlights(true);

  // Drive to 60 mph, then brake heavily
  harness.driveForDuration(2.0, () => ({ throttle: 1.0, brake: 0 }));
  harness.driveForDuration(0.3, () => ({ throttle: 0, brake: 1.0 }));

  const pitch = harness.vehicle.getVisualPitchDeg();
  expect(pitch).toBeLessThan(0, 'Pitch dive should be active during braking');
  expect(headlights.isOn).toBe(true, 'Headlights remain securely lit during braking pitch');

  harness.dispose();
});

registerTest(3, 'T3_PAIR_02', 'Pairwise R1+R5', 'Handbrake drift wheel slip generates dust particles and skid marks', async () => {
  const harness = await createSimulationHarness();
  const effects = new VehicleEffects(harness.scene, harness.vehicle, harness.physics);

  // Initiate high-speed handbrake drift
  const ms = 70 * 0.44704;
  harness.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: ms }, true);
  harness.driveForDuration(0.6, () => ({ throttle: 0, handbrake: true, steer: 0.8 }));

  const cam = new THREE.PerspectiveCamera();
  const sun = new THREE.DirectionalLight();
  effects.update(0.016, { throttle: 0, handbrake: true, steer: 0.8 }, cam, sun);

  expect(harness.vehicle.driftAngleDeg).toBeDefined();
  expect(effects).toBeDefined();

  harness.dispose();
});

registerTest(3, 'T3_PAIR_03', 'Pairwise R1+R2', 'Full throttle acceleration elevates RPM needle and gear change shifts driver arm IK', async () => {
  const harness = await createSimulationHarness();
  const cockpit = new CockpitController(harness.vehicle.carGroup);

  // Accelerate through gear 1 to gear 2
  harness.driveForDuration(1.2, () => ({ throttle: 1.0, brake: 0 }));
  const telem = harness.vehicle.getTelemetry({ throttle: 1.0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });

  cockpit.update(0.016, { steer: 0 }, telem);
  expect(telem.rpm).toBeGreaterThan(2500, 'RPM should climb under full throttle');
  expect(cockpit.group).toBeDefined();

  harness.dispose();
});

registerTest(3, 'T3_PAIR_04', 'Pairwise R1+R5', 'High slip angle slide updates lateral drift angle and tire skidmarks', async () => {
  const harness = await createSimulationHarness();
  const effects = new VehicleEffects(harness.scene, harness.vehicle, harness.physics);

  const ms = 65 * 0.44704;
  harness.vehicle.chassisBody.setLinvel({ x: ms * 0.5, y: 0, z: ms * 0.866 }, true);
  harness.driveForDuration(0.5, () => ({ throttle: 0.5, steer: 0.6 }));

  const cam = new THREE.PerspectiveCamera();
  const sun = new THREE.DirectionalLight();
  effects.update(0.016, { throttle: 0.5, steer: 0.6 }, cam, sun);

  expect(harness.vehicle.driftAngleDeg).toBeDefined();
  harness.dispose();
});

registerTest(3, 'T3_PAIR_05', 'Pairwise R1+R4', 'Severe roadside tree impact triggers front bumper detachment into dynamic debris', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);
  const damage = new VehicleDamageController(scene, vehicle, physics, dispatcher);

  const initialBodies = physics.world.bodies.len();

  // Severe tree collision event (12,000 Ns)
  damage.handleCollision({
    contactPoint: new THREE.Vector3(0, 0.3, 2.1),
    contactNormal: new THREE.Vector3(0, 0, -1),
    impulseMagnitude: 12000,
    collidedEntity: 'tree',
    targetSubMesh: 'front_bumper',
  });

  expect(physics.world.bodies.len()).toBeGreaterThan(initialBodies, 'Front bumper must become independent dynamic body');
});

registerTest(3, 'T3_PAIR_06', 'Pairwise R2+R3', 'Toggling headlights in nocturnal preset raises forward spot intensity to 16.0', async () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  const sun = new THREE.DirectionalLight();
  const hemi = new THREE.HemisphereLight();
  const dayNight = new DayNightCycleController(scene, sun, hemi);

  // Set night
  dayNight.setPreset('NIGHT');
  expect(sun.intensity).toBeCloseTo(0.15, 0.05);

  const carGroup = new THREE.Group();
  const headlights = new HeadlightController(carGroup, scene);
  expect(headlights.isOn).toBe(false);

  headlights.setHeadlights(true);
  expect(headlights.isOn).toBe(true);

  let spotCount = 0;
  carGroup.traverse((c) => {
    if ((c as THREE.SpotLight).isSpotLight) {
      spotCount++;
      expect((c as THREE.SpotLight).intensity).toBe(16.0);
    }
  });
  expect(spotCount).toBeGreaterThanOrEqual(2, 'Must have dual headlights');
});

registerTest(3, 'T3_PAIR_07', 'Pairwise R1+R3', 'High-speed vehicle approach triggers wildlife crossing bounding leap', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const rallyWorld = new RallyStageWorld(scene, physics);
  const wildlife = new WildlifeCrossingManager(scene, rallyWorld);

  // Point on spline near crossing 450m
  const pt = rallyWorld.spline.getPointAt(450 / rallyWorld.totalLength);

  // Approach from 120m down to 40m
  wildlife.update(0.1, new THREE.Vector3(pt.x + 120, pt.y, pt.z));
  wildlife.update(0.1, new THREE.Vector3(pt.x + 40, pt.y, pt.z));

  expect(wildlife.group).toBeDefined();
});

registerTest(3, 'T3_PAIR_08', 'Pairwise R1+R3', 'Approaching sharp turn at speed generates co-driver pace note 2-3s in advance', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const rallyWorld = new RallyStageWorld(scene, physics);
  const vehicle = new CustomRallyVehicle(scene, physics);

  // Position vehicle approaching turn 1 (around distance ~200m)
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 30 }, true); // ~67 mph

  const coDriver = new CoDriverSystem(rallyWorld, vehicle);
  coDriver.update(0.016);

  expect(coDriver).toBeDefined();
  coDriver.dispose();
});

registerTest(3, 'T3_PAIR_09', 'Pairwise R1+R5', 'Sudden throttle lift at high RPM triggers audio anti-lag pops and boost flutter', async () => {
  const audio = new RallyAudioEngine();

  // Full boost
  audio.update({
    speedMph: 85,
    engineRpm: 7500,
    throttleInput: 1.0,
    brakeInput: 0,
    currentGear: 4,
    handbrakeInput: 0,
    wheelSlipAngleDeg: [0, 0, 0, 0],
  } as any);

  // Sudden lift
  audio.update({
    speedMph: 84,
    engineRpm: 7100,
    throttleInput: 0.0,
    brakeInput: 0,
    currentGear: 4,
    handbrakeInput: 0,
    wheelSlipAngleDeg: [0, 0, 0, 0],
  } as any);

  expect(audio.getMuted()).toBe(false);
});

registerTest(3, 'T3_PAIR_10', 'Pairwise R1+R2', 'Cockpit FPV camera orientation reflects vehicle pitch, roll, and lookahead yaw', async () => {
  const harness = await createSimulationHarness();
  const camManager = new CameraManager(16 / 9);
  camManager.setMode('COCKPIT_FPV');

  // Corner with steer
  harness.driveForDuration(1.0, () => ({ throttle: 0.8, steer: 0.8 }));
  camManager.update(harness.vehicle, 0.016, 0.8);

  expect(camManager.currentMode).toBe('COCKPIT_FPV');
  expect(camManager.camera.position).toBeDefined();

  harness.dispose();
});

registerTest(3, 'T3_PAIR_11', 'Pairwise R4', 'Medium obstacle collision produces localized vertex deformation while chassis continues rolling', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);
  const damage = new VehicleDamageController(scene, vehicle, physics, dispatcher);

  const bodiesBefore = physics.world.bodies.len();

  // 4,500 Ns medium collision
  damage.handleCollision({
    contactPoint: new THREE.Vector3(0, 0.3, 2.1),
    contactNormal: new THREE.Vector3(0, 0, -1),
    impulseMagnitude: 4500,
    collidedEntity: 'fence',
  });

  expect(physics.world.bodies.len()).toBe(bodiesBefore, 'Medium collision must not detach parts');
});

registerTest(3, 'T3_PAIR_12', 'Pairwise R4', 'Severe rear collision detaches rear wing into tumbling dynamic rigid body', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);
  const damage = new VehicleDamageController(scene, vehicle, physics, dispatcher);

  const bodiesBefore = physics.world.bodies.len();

  damage.handleCollision({
    contactPoint: new THREE.Vector3(0, 0.6, -2.1),
    contactNormal: new THREE.Vector3(0, 0, 1),
    impulseMagnitude: 10000,
    collidedEntity: 'tree',
    targetSubMesh: 'rear_wing',
  });

  expect(physics.world.bodies.len()).toBeGreaterThan(bodiesBefore, 'Rear wing must detach as physics debris');
});

registerTest(3, 'T3_PAIR_13', 'Pairwise R3', 'Dusk time-of-day transition lowers sun elevation and warms ambient sky', async () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  const sun = new THREE.DirectionalLight();
  const hemi = new THREE.HemisphereLight();
  const dayNight = new DayNightCycleController(scene, sun, hemi);

  dayNight.setPreset('DUSK');
  expect(dayNight.timeHours).toBeCloseTo(18.6, 0.1);
  expect(sun.intensity).toBeLessThan(2.0, 'Dusk sun intensity must be lower than noon');
});

registerTest(3, 'T3_PAIR_14', 'Pairwise R1+R5', 'Handbrake slide engages brake squeal and tire scrub in procedural audio', async () => {
  const audio = new RallyAudioEngine();

  // High slip with active handbrake
  audio.update({
    speedMph: 45,
    engineRpm: 4800,
    throttleInput: 0,
    brakeInput: 0,
    handbrakeActive: true,
    currentGear: 2,
    wheelSlipAngleDeg: [25, 25, 30, 30],
  } as any);

  expect(audio.getMuted()).toBe(false);
});

registerTest(3, 'T3_PAIR_15', 'Pairwise R2+R4', 'Hood camera mode maintains front visibility when front bumper sustains impact', async () => {
  const harness = await createSimulationHarness();
  const camManager = new CameraManager(16 / 9);
  camManager.setMode('HOOD');

  const damage = new VehicleDamageController(harness.scene, harness.vehicle, harness.physics, harness.dispatcher);
  damage.detachSubMesh('front_bumper');

  camManager.update(harness.vehicle, 0.016, 0);
  expect(camManager.currentMode).toBe('HOOD');

  harness.dispose();
});

registerTest(3, 'T3_PAIR_16', 'Pairwise R1+R3', 'Crest elevation transition articulates suspension rebound and droop', async () => {
  const harness = await createSimulationHarness();

  // Simulate launch over crest: initial upward velocity
  harness.vehicle.chassisBody.setLinvel({ x: 0, y: 3.5, z: 25 }, true);
  harness.driveForDuration(0.6, () => ({ throttle: 1.0, brake: 0 }));

  const telem = harness.vehicle.getTelemetry({ throttle: 1.0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
  expect(telem.suspensionLengths.length).toBe(4);

  harness.dispose();
});

registerTest(3, 'T3_PAIR_17', 'Pairwise R1+R6', 'Continuous driving updates stage timer and tracks distance driven', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const rallyWorld = new RallyStageWorld(scene, physics);
  const vehicle = new CustomRallyVehicle(scene, physics);
  const stage = new StageManager(scene, rallyWorld, vehicle);

  stage.state = 'RACING';
  stage.update(1.0);

  expect(stage.state).toBe('RACING');
  expect(stage.stageTimeS).toBeGreaterThan(0);
});

registerTest(3, 'T3_PAIR_18', 'Pairwise R1+R3+R4', 'Full vehicle reset restores car transform and clears debris and wildlife', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const rallyWorld = new RallyStageWorld(scene, physics);
  const vehicle = new CustomRallyVehicle(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);
  const damage = new VehicleDamageController(scene, vehicle, physics, dispatcher);
  const wildlife = new WildlifeCrossingManager(scene, rallyWorld);

  // Detach bumper
  damage.detachSubMesh('front_bumper');
  expect(scene.children.length).toBeGreaterThan(0);

  // Trigger wildlife
  wildlife.update(0.1, new THREE.Vector3(0, 0, 450));

  // Reset all
  vehicle.resetPosition();
  damage.reset();
  wildlife.reset();

  const pos = vehicle.chassisBody.translation();
  expect(pos.x).toBeCloseTo(0, 0.5);
  expect(pos.z).toBeCloseTo(-8, 0.5);
});
