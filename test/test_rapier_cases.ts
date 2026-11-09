import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';

async function testBothCases() {
  const physics = new PhysicsWorld();
  await physics.init();

  // Test 1: create Box 1 first, then Box 2
  // Box 1 moves +Z into Box 2
  const b1 = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, 0));
  const c1 = physics.world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 1).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS), b1);

  const b2 = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 3));
  const c2 = physics.world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 1).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS), b2);

  b1.setLinvel({ x: 0, y: 0, z: 20 }, true);

  for (let s = 0; s < 15; s++) {
    physics.world.step(physics.eventQueue);
    physics.eventQueue.drainContactForceEvents((e) => {
      console.log(`Test 1: h1=${e.collider1()} (c1=${c1.handle}), h2=${e.collider2()} (c2=${c2.handle}), dir=[${e.maxForceDirection().x}, ${e.maxForceDirection().y}, ${e.maxForceDirection().z}]`);
    });
  }

  // Test 2: create Fixed Box at z=3 FIRST, then Moving Box at z=0 SECOND
  const physics2 = new PhysicsWorld();
  await physics2.init();

  const bFixed = physics2.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 3));
  const cFixed = physics2.world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 1).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS), bFixed);

  const bMoving = physics2.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, 0));
  const cMoving = physics2.world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 1).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS), bMoving);

  bMoving.setLinvel({ x: 0, y: 0, z: 20 }, true);

  for (let s = 0; s < 15; s++) {
    physics2.world.step(physics2.eventQueue);
    physics2.eventQueue.drainContactForceEvents((e) => {
      console.log(`Test 2: h1=${e.collider1()} (cFixed=${cFixed.handle}), h2=${e.collider2()} (cMoving=${cMoving.handle}), dir=[${e.maxForceDirection().x}, ${e.maxForceDirection().y}, ${e.maxForceDirection().z}]`);
    });
  }
}

testBothCases();
