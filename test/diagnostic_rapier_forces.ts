import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';

async function diagnose() {
  const physics = new PhysicsWorld();
  await physics.init();

  // Create Body A (moving in +Z)
  const bodyA = physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1, 0));
  const colA = physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(1, 1, 1).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
    bodyA
  );

  // Create Body B (fixed at z = 4)
  const bodyB = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 1, 4));
  const colB = physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(1, 1, 1).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
    bodyB
  );

  console.log(`colA handle: ${colA.handle}, colB handle: ${colB.handle}`);

  bodyA.setLinvel({ x: 0, y: 0, z: 20 }, true);

  for (let step = 0; step < 20; step++) {
    physics.world.step(physics.eventQueue);

    physics.eventQueue.drainContactForceEvents((evt) => {
      const h1 = evt.collider1();
      const h2 = evt.collider2();
      const dir = evt.maxForceDirection();
      const mag = evt.totalForceMagnitude();
      console.log(`Step ${step}: h1=${h1}, h2=${h2}, totalForce=${mag.toFixed(1)}, maxForceDir=[${dir.x.toFixed(3)}, ${dir.y.toFixed(3)}, ${dir.z.toFixed(3)}]`);

      physics.world.contactPair(colA, colB, (manifold) => {
        console.log(`  numSolverContacts=${manifold.numSolverContacts()}`);
        if (manifold.numSolverContacts() > 0) {
          const pt = manifold.solverContactPoint(0);
          console.log(`  solverContactPoint=[${pt.x.toFixed(3)}, ${pt.y.toFixed(3)}, ${pt.z.toFixed(3)}]`);
        }
      });
    });
  }
}

diagnose();
