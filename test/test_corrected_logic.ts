import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';

// Test simulation with corrected normal orientation:
// if (h1 === carColliderHandle) { _tmpContactNormal.negate(); }
async function testCorrectedLogic() {
  const physics = new PhysicsWorld();
  await physics.init();

  // Test Head-on crash (car moving +Z into barrier at z=10)
  const bCar = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.8, 0));
  const cCar = physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.85, 0.32, 2.05).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
    bCar
  );

  const bWall = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 1.0, 10.0));
  const cWall = physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(5.0, 2.0, 0.5).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
    bWall
  );

  bCar.setLinvel({ x: 0, y: 0, z: 58.115 }, true);

  for (let s = 0; s < 60; s++) {
    physics.world.step(physics.eventQueue);
    physics.eventQueue.drainContactForceEvents((evt) => {
      const h1 = evt.collider1();
      const h2 = evt.collider2();
      if (h1 !== cCar.handle && h2 !== cCar.handle) return;

      const rawDir = evt.maxForceDirection();
      const normal = new THREE.Vector3(rawDir.x, rawDir.y, rawDir.z);

      // CORRECT LOGIC:
      // In Rapier, rawDir points from h1 to h2.
      // If car is h1, rawDir points from car to obstacle. Force ON car is -rawDir.
      // If car is h2, rawDir points from obstacle to car. Force ON car is +rawDir.
      if (h1 === cCar.handle) {
        normal.negate();
      }

      console.log('Corrected Head-on Normal:', {
        h1,
        carHandle: cCar.handle,
        rawDir: [rawDir.x, rawDir.y, rawDir.z],
        normalOnCar: [normal.x, normal.y, normal.z],
      });

      // Local coordinate analysis
      // Car is aligned along Z (quat identity)
      const localNormal = normal.clone();
      console.log('localNormal.z:', localNormal.z, '(should be < -0.30 for front impact)');
    });
  }
}

testCorrectedLogic();
