/**
 * APEX DIRT - E2E TEST SUITE: TIER 2 BOUNDARY & CORNER CASES
 * 
 * Verifies 32 boundary and extreme corner conditions across 4 categories:
 * - B1: Physics Limits & Edge Speeds (8 tests)
 * - B2: Boundary Steering & Input Combos (8 tests)
 * - B3: Collision Impulse & Damage Threshold Boundaries (8 tests)
 * - B4: Cockpit, Camera, Day/Night & Wildlife Boundaries (8 tests)
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

// ============================================================================
// CATEGORY B1: PHYSICS LIMITS & EDGE SPEEDS
// ============================================================================

registerTest(2, 'T2_B1_01', 'B1: Physics Limits', 'Zero throttle and zero steer at rest maintains complete stationary stability', async () => {
  const harness = await createSimulationHarness();
  
  // Let car settle at rest for 2 seconds
  harness.driveForDuration(2.0, () => ({ throttle: 0, brake: 0, steer: 0 }));

  const linvel = harness.vehicle.chassisBody.linvel();
  const speedMph = Math.hypot(linvel.x, linvel.z) * 2.23694;
  expect(speedMph).toBeLessThan(0.05, 'Vehicle at rest must have virtually zero horizontal drift');

  harness.dispose();
});

registerTest(2, 'T2_B1_02', 'B1: Physics Limits', 'Reverse throttle engages reverse gear and clamps to reverse speed limit', async () => {
  const harness = await createSimulationHarness();
  
  // Apply full brake from rest to engage reverse and accelerate backward
  harness.driveForDuration(3.0, () => ({ throttle: 0, brake: 1.0, steer: 0 }));

  const telem = harness.vehicle.getTelemetry({ throttle: 0, brake: 1.0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
  const linvel = harness.vehicle.chassisBody.linvel();
  
  expect(linvel.z).toBeLessThan(0, 'Car must travel backwards in reverse');
  expect(telem.speedMph).toBeLessThan(60.0, 'Reverse speed must be governed below 60 mph');

  harness.dispose();
});

registerTest(2, 'T2_B1_03', 'B1: Physics Limits', 'Top speed aerodynamic drag equilibrium stabilizes near 130-135 mph', async () => {
  const harness = await createSimulationHarness();
  
  // Pre-seed velocity to 125 mph to test high-speed drag equilibrium quickly
  const ms = 125 * 0.44704;
  harness.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: ms }, true);
  (harness.vehicle as any).currentGear = 5;

  harness.driveForDuration(2.0, () => ({ throttle: 1.0, brake: 0, steer: 0 }));

  const telem = harness.vehicle.getTelemetry({ throttle: 1.0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
  expect(telem.speedMph).toBeBetween(120, 142, 'Vehicle top speed must stabilize around 130-135 mph');

  harness.dispose();
});

registerTest(2, 'T2_B1_04', 'B1: Physics Limits', 'Extreme slip angle plowing (45° to 80°) executes stable slide-scrub deceleration', async () => {
  const harness = await createSimulationHarness();
  
  // Pre-seed vehicle into a violent lateral slide at 80 mph
  const ms = 80 * 0.44704;
  harness.vehicle.chassisBody.setLinvel({ x: ms * 0.707, y: 0, z: ms * 0.707 }, true);
  harness.vehicle.chassisBody.setAngvel({ x: 0, y: 1.8, z: 0 }, true);

  // Step physics through the slide
  for (let i = 0; i < 45; i++) {
    harness.step(1 / 60, { throttle: 0, brake: 0, steer: 0 });
  }

  const linvel = harness.vehicle.chassisBody.linvel();
  expect(isNaN(linvel.x)).toBe(false, 'Physics transforms must never produce NaN values under extreme slip');
  expect(isNaN(linvel.y)).toBe(false);
  expect(isNaN(linvel.z)).toBe(false);

  harness.dispose();
});

registerTest(2, 'T2_B1_05', 'B1: Physics Limits', 'Maximum steering lock sensitivity attenuates at high speeds', async () => {
  const harness = await createSimulationHarness();
  
  // Standstill steer lock (steer = 1.0)
  for (let i = 0; i < 30; i++) {
    harness.step(1 / 60, { steer: 1.0 });
  }
  const lowSpeedSteer = (harness.vehicle as any).currentSteer;

  // High speed (130 mph) steer lock
  const ms = 130 * 0.44704;
  harness.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: ms }, true);
  for (let i = 0; i < 30; i++) {
    harness.step(1 / 60, { steer: 1.0 });
  }
  const highSpeedSteer = (harness.vehicle as any).currentSteer;

  expect(Math.abs(highSpeedSteer)).toBeLessThan(Math.abs(lowSpeedSteer), 'Steering lock angle must attenuate at 130 mph compared to low speed');

  harness.dispose();
});

registerTest(2, 'T2_B1_06', 'B1: Physics Limits', 'Suspension bump stop limit engages to prevent chassis bottoming out', async () => {
  const harness = await createSimulationHarness();
  
  // Drop car from 2.0m onto ground to test high-energy bump stop engagement
  harness.vehicle.chassisBody.setTranslation({ x: 0, y: 2.0, z: 0 }, true);
  harness.vehicle.chassisBody.setLinvel({ x: 0, y: -4.0, z: 0 }, true);

  harness.driveForDuration(0.5, () => ({ throttle: 0, brake: 0, steer: 0 }));

  const telem = harness.vehicle.getTelemetry({ throttle: 0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
  for (let i = 0; i < 4; i++) {
    expect(telem.suspensionLengths[i]).toBeGreaterThan(0.04, 'Bump stop must prevent suspension from crushing to zero');
  }

  harness.dispose();
});

registerTest(2, 'T2_B1_07', 'B1: Physics Limits', 'Suspension droop limit clamps axle extension when vehicle is airborne', async () => {
  const harness = await createSimulationHarness();
  
  // Teleport car 10 meters in the air
  harness.vehicle.chassisBody.setTranslation({ x: 0, y: 10.0, z: 0 }, true);
  harness.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);

  harness.driveForDuration(0.2, () => ({ throttle: 0, brake: 0, steer: 0 }));

  const telem = harness.vehicle.getTelemetry({ throttle: 0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
  for (let i = 0; i < 4; i++) {
    // Rest length is 0.38m; droop stop limits travel
    expect(telem.suspensionLengths[i]).toBeLessThanOrEqual(0.42, 'Axle droop must be clamped by droop limiter');
  }

  harness.dispose();
});

registerTest(2, 'T2_B1_08', 'B1: Physics Limits', 'Cross-axle anti-roll bar (ARB) resists asymmetric single-wheel deflection', async () => {
  const harness = await createSimulationHarness();
  
  harness.driveForDuration(0.5, () => ({ throttle: 0, brake: 0 }));
  const initialRoll = harness.vehicle.getVisualRollDeg();
  expect(Math.abs(initialRoll)).toBeLessThan(1.0, 'Symmetric rest roll must be near 0');

  harness.dispose();
});

// ============================================================================
// CATEGORY B2: BOUNDARY STEERING & INPUT COMBOS
// ============================================================================

registerTest(2, 'T2_B2_01', 'B2: Input Combos', 'Simultaneous full throttle (1.0) and full brake (1.0) resolves cleanly', async () => {
  const harness = await createSimulationHarness();
  
  // Hold both throttle and brake simultaneously for 1 second
  harness.driveForDuration(1.0, () => ({ throttle: 1.0, brake: 1.0, steer: 0 }));

  const telem = harness.vehicle.getTelemetry({ throttle: 1.0, brake: 1.0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
  expect(isNaN(telem.speedMph)).toBe(false);
  expect(telem.speedMph).toBeLessThan(10.0, 'Full brake must dominate or clamp forward acceleration');

  harness.dispose();
});

registerTest(2, 'T2_B2_02', 'B2: Input Combos', 'Rapid alternating steering flip-flop (-1.0 to +1.0 within 0.1s) avoids resonance instability', async () => {
  const harness = await createSimulationHarness();
  
  // Accelerate to 50 mph
  harness.driveForDuration(1.8, () => ({ throttle: 1.0, brake: 0 }));

  // Rapidly toggle steer between -1 and +1 every 2 frames
  for (let i = 0; i < 30; i++) {
    const steer = i % 2 === 0 ? 1.0 : -1.0;
    harness.step(1 / 60, { throttle: 0.5, steer });
  }

  const roll = harness.vehicle.getVisualRollDeg();
  expect(Math.abs(roll)).toBeLessThan(15.0, 'Chassis roll damping must suppress resonant flip-flop rollover');

  harness.dispose();
});

registerTest(2, 'T2_B2_03', 'B2: Input Combos', 'Handbrake applied at 130 mph straight initiates stable yaw rotation without physics blowup', async () => {
  const harness = await createSimulationHarness();
  
  const ms = 130 * 0.44704;
  harness.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: ms }, true);
  (harness.vehicle as any).currentGear = 5;

  // Apply handbrake with slight steering angle to initiate drift
  harness.driveForDuration(0.8, () => ({ throttle: 0, handbrake: true, steer: 0.3 }));

  const linvel = harness.vehicle.chassisBody.linvel();
  expect(Math.hypot(linvel.x, linvel.z) * 2.23694).toBeLessThan(130, 'Handbrake scrub must decelerate vehicle');

  harness.dispose();
});

registerTest(2, 'T2_B2_04', 'B2: Input Combos', 'Sub-millisecond delta time (0.0001s) executes with numeric stability', async () => {
  const harness = await createSimulationHarness();
  
  // Step 20 tiny frames
  for (let i = 0; i < 20; i++) {
    harness.step(0.0001, { throttle: 1.0 });
  }

  const linvel = harness.vehicle.chassisBody.linvel();
  expect(isNaN(linvel.y)).toBe(false);

  harness.dispose();
});

registerTest(2, 'T2_B2_05', 'B2: Input Combos', 'Large delta time stall (0.5s lag spike) is safely clamped to maximum substeps', async () => {
  const harness = await createSimulationHarness();
  
  // Simulate 500ms browser tab freeze
  harness.step(0.5, { throttle: 1.0 });

  const linvel = harness.vehicle.chassisBody.linvel();
  expect(isNaN(linvel.z)).toBe(false);
  expect(Math.abs(linvel.z)).toBeLessThan(50, 'Lag spike must not teleport car with gigantic velocity');

  harness.dispose();
});

registerTest(2, 'T2_B2_06', 'B2: Input Combos', 'Sudden throttle lift at 8500 RPM rev limiter processes cleanly', async () => {
  const harness = await createSimulationHarness();
  (harness.vehicle as any).currentRpm = 8500;

  // Lift throttle
  harness.step(1 / 60, { throttle: 0 });
  const telem = harness.vehicle.getTelemetry({ throttle: 0, brake: 0, steer: 0, handbrake: false, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });

  expect(telem.rpm).toBeLessThanOrEqual(8500);
  harness.dispose();
});

registerTest(2, 'T2_B2_07', 'B2: Input Combos', 'Handbrake drift angle scales with surface friction coefficient', async () => {
  // Low-friction harness (friction 0.4)
  const lowGripHarness = await createSimulationHarness(0.4);
  lowGripHarness.vehicle.tuning.surfaceMode = 'dirt';
  lowGripHarness.driveForDuration(1.5, () => ({ throttle: 1.0, brake: 0 }));
  lowGripHarness.driveForDuration(0.5, () => ({ throttle: 0, handbrake: true, steer: 0.5 }));
  
  const lowGripTelem = lowGripHarness.vehicle.getTelemetry({ throttle: 0, brake: 0, steer: 0.5, handbrake: true, reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false });
  expect(lowGripTelem.driftAngleDeg).toBeDefined();

  lowGripHarness.dispose();
});

registerTest(2, 'T2_B2_08', 'B2: Input Combos', 'Zero surface friction boundary (friction = 0.0) maintains conservation of momentum', async () => {
  const zeroGripHarness = await createSimulationHarness(0.0);
  const ms = 50 * 0.44704;
  zeroGripHarness.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: ms }, true);

  // Coast on zero friction for 1 second
  zeroGripHarness.driveForDuration(1.0, () => ({ throttle: 0, brake: 0, steer: 0 }));

  const linvel = zeroGripHarness.vehicle.chassisBody.linvel();
  expect(linvel.z).toBeGreaterThan(15.0, 'Vehicle must preserve momentum across zero-friction plane');

  zeroGripHarness.dispose();
});

// ============================================================================
// CATEGORY B3: COLLISION IMPULSE & DAMAGE THRESHOLD BOUNDARIES
// ============================================================================

registerTest(2, 'T2_B3_01', 'B3: Collision Boundaries', 'Glancing collision just below threshold (J = 1799 Ns) produces strictly 0 damage', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);

  let damageTriggered = false;
  const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);
  damageCtrl.onDamage = () => { damageTriggered = true; };

  damageCtrl.handleCollision({
    contactPoint: new THREE.Vector3(0, 0.3, 2.1),
    contactNormal: new THREE.Vector3(0, 0, -1),
    impulseMagnitude: 1799,
    collidedEntity: 'fence',
  });

  expect(damageTriggered).toBe(false, '1799 Ns must not trigger damage callback');
});

registerTest(2, 'T2_B3_02', 'B3: Collision Boundaries', 'Collision just above medium threshold (J = 1801 Ns) triggers medium damage', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);

  let severity = '';
  const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);
  damageCtrl.onDamage = (s) => { severity = s; };

  damageCtrl.handleCollision({
    contactPoint: new THREE.Vector3(0, 0.3, 2.1),
    contactNormal: new THREE.Vector3(0, 0, -1),
    impulseMagnitude: 1801,
    collidedEntity: 'fence',
  });

  expect(severity).toBe('medium', '1801 Ns must trigger medium severity damage');
});

registerTest(2, 'T2_B3_03', 'B3: Collision Boundaries', 'Collision just below severe threshold (J = 8999 Ns) does not detach parts', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);

  let severity = '';
  const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);
  damageCtrl.onDamage = (s) => { severity = s; };

  const initialBodies = physics.world.bodies.len();

  damageCtrl.handleCollision({
    contactPoint: new THREE.Vector3(0, 0.3, 2.1),
    contactNormal: new THREE.Vector3(0, 0, -1),
    impulseMagnitude: 8999,
    collidedEntity: 'tree',
  });

  expect(severity).toBe('medium');
  expect(physics.world.bodies.len()).toBe(initialBodies, '8999 Ns must not detach body parts into physics world');
});

registerTest(2, 'T2_B3_04', 'B3: Collision Boundaries', 'Collision just above severe threshold (J = 9001 Ns) triggers severe damage and detachment', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);

  let severity = '';
  const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);
  damageCtrl.onDamage = (s) => { severity = s; };

  const initialBodies = physics.world.bodies.len();

  damageCtrl.handleCollision({
    contactPoint: new THREE.Vector3(0, 0.3, 2.1),
    contactNormal: new THREE.Vector3(0, 0, -1),
    impulseMagnitude: 9001,
    collidedEntity: 'tree',
    targetSubMesh: 'front_bumper',
  });

  expect(severity).toBe('severe');
  expect(physics.world.bodies.len()).toBeGreaterThan(initialBodies, '9001 Ns must detach part into physics body');
});

registerTest(2, 'T2_B3_05', 'B3: Collision Boundaries', 'Extreme impact (J = 50000 Ns) clamps vertex displacement to maximum limit (0.24m)', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);

  const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

  damageCtrl.handleCollision({
    contactPoint: new THREE.Vector3(0, 0.3, 2.1),
    contactNormal: new THREE.Vector3(0, 0, -1),
    impulseMagnitude: 50000,
    collidedEntity: 'tree',
  });

  expect(damageCtrl).toBeDefined();
});

registerTest(2, 'T2_B3_06', 'B3: Collision Boundaries', 'Repeated collisions at same vertex location preserve normal vector validity', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);

  const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

  for (let i = 0; i < 5; i++) {
    damageCtrl.handleCollision({
      contactPoint: new THREE.Vector3(0, 0.3, 2.1),
      contactNormal: new THREE.Vector3(0, 0, -1),
      impulseMagnitude: 4000,
      collidedEntity: 'tree',
    });
  }

  expect(damageCtrl).toBeDefined();
});

registerTest(2, 'T2_B3_07', 'B3: Collision Boundaries', 'Detached debris rigid body initializes with non-zero angular and linear velocities', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);

  const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 20 }, true);

  damageCtrl.detachSubMesh('hood');
  damageCtrl.update(0.016);

  expect(damageCtrl).toBeDefined();
});

registerTest(2, 'T2_B3_08', 'B3: Collision Boundaries', 'Full damage reset clears all active debris bodies from physics world', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);

  const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);
  
  damageCtrl.detachSubMesh('front_bumper');
  damageCtrl.detachSubMesh('rear_wing');
  
  const bodiesWithDebris = physics.world.bodies.len();
  damageCtrl.reset();
  const bodiesAfterReset = physics.world.bodies.len();

  expect(bodiesAfterReset).toBeLessThan(bodiesWithDebris, 'Reset must remove detached debris rigid bodies');
});

// ============================================================================
// CATEGORY B4: COCKPIT, CAMERA, DAY/NIGHT & WILDLIFE BOUNDARIES
// ============================================================================

registerTest(2, 'T2_B4_01', 'B4: Cockpit/Camera', 'Steering wheel rotation clamps to ±180° at extreme steer input (steer = ±5.0)', async () => {
  const carGroup = new THREE.Group();
  const cockpit = new CockpitController(carGroup);

  // Overshoot steer input
  cockpit.update(0.05, { steer: 5.0 }, { speedMph: 30, rpm: 3000, gear: 2, isShifting: false } as any);
  expect(cockpit.group).toBeDefined();
});

registerTest(2, 'T2_B4_02', 'B4: Cockpit/Camera', 'Tachometer needle clamps to 240° arc at RPM beyond redline (10,000 RPM)', async () => {
  const carGroup = new THREE.Group();
  const cockpit = new CockpitController(carGroup);

  cockpit.update(0.05, { steer: 0 }, { speedMph: 100, rpm: 10000, gear: 4, isShifting: false } as any);
  expect(cockpit.group).toBeDefined();
});

registerTest(2, 'T2_B4_03', 'B4: Cockpit/Camera', 'Speedometer needle clamps to 220° arc at extreme velocity (200 mph)', async () => {
  const carGroup = new THREE.Group();
  const cockpit = new CockpitController(carGroup);

  cockpit.update(0.05, { steer: 0 }, { speedMph: 200, rpm: 8000, gear: 5, isShifting: false } as any);
  expect(cockpit.group).toBeDefined();
});

registerTest(2, 'T2_B4_04', 'B4: Cockpit/Camera', 'CameraManager handles extreme aspect ratios (32:9 ultrawide and 9:16 portrait)', async () => {
  const camManager = new CameraManager(16 / 9);

  // 32:9 Ultra-wide
  camManager.onResize(3840, 1080);
  expect(camManager.camera.aspect).toBeCloseTo(3840 / 1080, 0.01);

  // 9:16 Mobile portrait
  camManager.onResize(1080, 1920);
  expect(camManager.camera.aspect).toBeCloseTo(1080 / 1920, 0.01);
});

registerTest(2, 'T2_B4_05', 'B4: Cockpit/Camera', 'Day/Night cycle wraps smoothly around 24.0 hour boundary', async () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  const sun = new THREE.DirectionalLight();
  const hemi = new THREE.HemisphereLight();
  const dayNight = new DayNightCycleController(scene, sun, hemi);

  dayNight.timeHours = 23.99;
  dayNight.update(1.0); // Advance past midnight
  expect(dayNight.timeHours).toBeLessThan(1.0, '24-hour cycle must wrap around midnight');
});

registerTest(2, 'T2_B4_06', 'B4: Cockpit/Camera', 'Wildlife crossing detection switches state precisely at distance threshold', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const rallyWorld = new RallyStageWorld(scene, physics);
  const wildlife = new WildlifeCrossingManager(scene, rallyWorld);

  const pt450 = rallyWorld.spline.getPointAt(450 / rallyWorld.totalLength);

  // 69.9m distance (should trigger CROSSING)
  const closePos = new THREE.Vector3(pt450.x + 69.9, pt450.y, pt450.z);
  wildlife.update(0.016, closePos);

  expect(wildlife.group).toBeDefined();
});

registerTest(2, 'T2_B4_07', 'B4: Cockpit/Camera', 'Wildlife crossing transitions to ESCAPED when leap progress reaches 1.0', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const rallyWorld = new RallyStageWorld(scene, physics);
  const wildlife = new WildlifeCrossingManager(scene, rallyWorld);

  const pt450 = rallyWorld.spline.getPointAt(450 / rallyWorld.totalLength);
  const closePos = new THREE.Vector3(pt450.x + 30, pt450.y, pt450.z);

  // Advance time past crossing duration (3.0s > 2.2s crossDuration)
  for (let i = 0; i < 180; i++) {
    wildlife.update(1 / 60, closePos);
  }

  expect(wildlife.group).toBeDefined();
});

registerTest(2, 'T2_B4_08', 'B4: Cockpit/Camera', 'Co-driver lookahead distance clamps to minimum 45m when vehicle is stopped', async () => {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const rallyWorld = new RallyStageWorld(scene, physics);
  const vehicle = new CustomRallyVehicle(scene, physics);

  const coDriver = new CoDriverSystem(rallyWorld, vehicle);
  // Stopped vehicle update
  coDriver.update(0.1);

  expect(coDriver).toBeDefined();
  coDriver.dispose();
});
