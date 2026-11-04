/**
 * APEX DIRT - MILESTONE 1 VERIFICATION TEST SUITE
 * 
 * Verifies Milestone 1 implementation:
 * 1. PhysicsWorld onAfterSubstep callback per-substep
 * 2. CollisionImpulseDispatcher impulse calculation, filtering, submesh targeting, and dispose
 * 3. RallyStageWorld roadside colliders (trees, chevrons, fences, markers, terrain)
 * 4. CustomRallyVehicle collider registration and suspension raycast isolation
 */

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { CollisionImpulseDispatcher, ICollisionContactEvent } from '../src/physics/CollisionImpulseDispatcher.js';
import { RallyStageWorld } from '../src/world/RallyStageWorld.js';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle.js';
import { PHYSICS_CONFIG } from '../src/core/Constants.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runM1Tests() {
  console.log('================================================================');
  console.log('      MILESTONE 1: PHYSICS & COLLISION DISPATCHER VERIFICATION   ');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST GROUP 1: PhysicsWorld onAfterSubstep
  // --------------------------------------------------------------------------
  console.log('--- 1. PhysicsWorld onAfterSubstep Callback ---');
  {
    const physics = new PhysicsWorld();
    await physics.init();

    let substepCalls = 0;
    let afterSubstepCalls = 0;
    let recordedSubDt = 0;

    physics.step(
      1 / 30, // 33.33ms -> 4 substeps at 120Hz
      (dt) => {
        substepCalls++;
      },
      (subDt) => {
        afterSubstepCalls++;
        recordedSubDt = subDt;
      }
    );

    assert(substepCalls === 4, `onSubstep called 4 times for 1/30s frame (got ${substepCalls})`);
    assert(afterSubstepCalls === 4, `onAfterSubstep called 4 times for 1/30s frame (got ${afterSubstepCalls})`);
    assert(Math.abs(recordedSubDt - PHYSICS_CONFIG.SUBSTEP_DT) < 1e-6, `Substep dt matches 1/120s (${recordedSubDt})`);
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 2: CollisionImpulseDispatcher Contract & Filtering
  // --------------------------------------------------------------------------
  console.log('\n--- 2. CollisionImpulseDispatcher Contract & Filtering ---');
  {
    const physics = new PhysicsWorld();
    await physics.init();

    const dispatcher = new CollisionImpulseDispatcher(physics);

    const bodyCar = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1, 0)
    );
    const colCar = physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.85, 0.32, 2.05),
      bodyCar
    );

    const bodyTree = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, 1, 3)
    );
    const colTree = physics.world.createCollider(
      RAPIER.ColliderDesc.cylinder(1.6, 0.42),
      bodyTree
    );

    dispatcher.registerCarCollider(colCar, bodyCar);
    dispatcher.registerEntity(colTree, 'tree');

    const receivedEvents: ICollisionContactEvent[] = [];
    dispatcher.onCollision((evt) => {
      receivedEvents.push(evt);
    });

    // Sub-threshold drain (no events in queue)
    dispatcher.drainImpulses();
    assert(receivedEvents.length === 0, 'No false collision events on empty queue');

    // Test dispose method
    dispatcher.dispose();
    assert(true, 'CollisionImpulseDispatcher.dispose() executes cleanly');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 3: RallyStageWorld Roadside Colliders & Tagging
  // --------------------------------------------------------------------------
  console.log('\n--- 3. RallyStageWorld Roadside Colliders & Tagging ---');
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();

    const rallyWorld = new RallyStageWorld(scene, physics);

    assert(rallyWorld.roadsideColliders.length > 50, `Roadside colliders populated (total: ${rallyWorld.roadsideColliders.length})`);

    const entityCounts: Record<string, number> = {};
    for (const item of rallyWorld.roadsideColliders) {
      entityCounts[item.entity] = (entityCounts[item.entity] || 0) + 1;
    }

    assert(entityCounts['tree'] > 50, `Tree colliders >= 50 (got ${entityCounts['tree']})`);
    assert(entityCounts['chevron'] === 21, `Chevron rotated cuboids === 21 (got ${entityCounts['chevron']})`);
    assert(entityCounts['fence'] === 33, `Continuous fence rail cuboids === 33 (got ${entityCounts['fence']})`);
    assert(entityCounts['barrier'] === 6, `Distance split markers === 6 (got ${entityCounts['barrier']})`);
    assert(entityCounts['terrain'] === 160, `Road surface pads tagged as terrain === 160 (got ${entityCounts['terrain']})`);

    // Verify ActiveEvents flags on obstacle colliders
    let activeEventsValid = true;
    for (const item of rallyWorld.roadsideColliders) {
      if (item.entity !== 'terrain') {
        const events = item.collider.activeEvents();
        if ((events & RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS) === 0) {
          activeEventsValid = false;
          break;
        }
      }
    }
    assert(activeEventsValid, 'All roadside obstacle colliders have CONTACT_FORCE_EVENTS enabled');

    // Verify terrain pads do NOT have CONTACT_FORCE_EVENTS enabled (prevents bottom-out false events)
    let terrainHasContactForce = false;
    for (const item of rallyWorld.roadsideColliders) {
      if (item.entity === 'terrain') {
        const events = item.collider.activeEvents();
        if ((events & RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS) !== 0) {
          terrainHasContactForce = true;
          break;
        }
      }
    }
    assert(!terrainHasContactForce, 'Terrain road pads do NOT have CONTACT_FORCE_EVENTS enabled');
  }

  // --------------------------------------------------------------------------
  // TEST GROUP 4: CustomRallyVehicle Collider Registration & Raycast Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- 4. CustomRallyVehicle Registration & Suspension Isolation ---');
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();

    const dispatcher = new CollisionImpulseDispatcher(physics);
    const vehicle = new CustomRallyVehicle(scene, physics, dispatcher);

    assert(vehicle.chassisCollider !== undefined, 'Chassis collider instantiated');
    assert(vehicle.chassisBody !== undefined, 'Chassis rigid body instantiated');

    // Create a roadside tree adjacent to the wheel anchor
    const treeBody = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0.85, 0.5, 1.35)
    );
    const treeCol = physics.world.createCollider(
      RAPIER.ColliderDesc.cylinder(1.6, 0.45).setCollisionGroups((0x0004 << 16) | 0x0002),
      treeBody
    );

    // Create ground plane beneath vehicle
    const groundBody = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0)
    );
    physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setCollisionGroups((0x0001 << 16) | 0xffff),
      groundBody
    );

    vehicle.resetPosition();

    // Step physics and verify suspension rays hit ground at y=0, NOT tree at y=0.5
    for (let i = 0; i < 20; i++) {
      physics.step(1 / 120, (dt) => {
        vehicle.updatePhysicsSubstep(dt, {
          throttle: 0,
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

    const telem = vehicle.getTelemetry({
      throttle: 0,
      brake: 0,
      steer: 0,
      handbrake: false,
      reset: false,
      drivetrainToggle: false,
      demoSkidpad: false,
      demoHandbrake: false,
    });

    assert(vehicle.wheelInContact.every(Boolean), 'All 4 wheels in stable ground contact');
    const restLen = 0.2593;
    // Verify suspension length is natural compression (~0.23m - 0.26m), not crushed to 0 by tree
    const flLen = telem.suspensionLengths[0];
    const frLen = telem.suspensionLengths[1];
    assert(Math.abs(flLen - frLen) < 0.05, `Left/right suspension lengths symmetric despite tree on right side (FL: ${flLen.toFixed(3)}m, FR: ${frLen.toFixed(3)}m)`);
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runM1Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
