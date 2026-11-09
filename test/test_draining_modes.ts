import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { CollisionImpulseDispatcher, ICollisionContactEvent } from '../src/physics/CollisionImpulseDispatcher.js';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle.js';
import { PHYSICS_CONFIG } from '../src/core/Constants.js';

async function testDrainingModes() {
  const fps = 15; // 8 substeps per frame
  const frameDt = 1 / fps;

  // MODE A: onAfterSubstep (substep post-step drain)
  let countA = 0;
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const vehicle = new CustomRallyVehicle(scene, physics, dispatcher);
    dispatcher.registerCarCollider(vehicle.chassisCollider, vehicle.chassisBody);

    const b = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.8, 5.0));
    const c = physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(3, 2, 0.5).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
      b
    );
    dispatcher.registerEntity(c, 'barrier');

    vehicle.chassisBody.setTranslation({ x: 0, y: 0.8, z: 0 }, true);
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 30.0 }, true);

    dispatcher.onCollision(() => countA++);

    for (let f = 0; f < 15; f++) {
      physics.step(
        frameDt,
        () => {},
        (subDt) => dispatcher.drainImpulses(subDt)
      );
    }
  }

  // MODE B: onSubstep (pre-step drain, as currently in src/main.ts)
  let countB = 0;
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const vehicle = new CustomRallyVehicle(scene, physics, dispatcher);
    dispatcher.registerCarCollider(vehicle.chassisCollider, vehicle.chassisBody);

    const b = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.8, 5.0));
    const c = physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(3, 2, 0.5).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
      b
    );
    dispatcher.registerEntity(c, 'barrier');

    vehicle.chassisBody.setTranslation({ x: 0, y: 0.8, z: 0 }, true);
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 30.0 }, true);

    dispatcher.onCollision(() => countB++);

    for (let f = 0; f < 15; f++) {
      physics.step(
        frameDt,
        (subDt) => dispatcher.drainImpulses(subDt), // inside onSubstep
        undefined
      );
    }
  }

  // MODE C: Once-per-frame drain (outside substep loop)
  let countC = 0;
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const vehicle = new CustomRallyVehicle(scene, physics, dispatcher);
    dispatcher.registerCarCollider(vehicle.chassisCollider, vehicle.chassisBody);

    const b = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.8, 5.0));
    const c = physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(3, 2, 0.5).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
      b
    );
    dispatcher.registerEntity(c, 'barrier');

    vehicle.chassisBody.setTranslation({ x: 0, y: 0.8, z: 0 }, true);
    vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 30.0 }, true);

    dispatcher.onCollision(() => countC++);

    for (let f = 0; f < 15; f++) {
      physics.step(frameDt, () => {});
      dispatcher.drainImpulses(frameDt); // outside loop once per frame
    }
  }

  console.log(`Draining Results at 15 FPS:`);
  console.log(`  Mode A (onAfterSubstep): ${countA} events`);
  console.log(`  Mode B (onSubstep):      ${countB} events`);
  console.log(`  Mode C (once-per-frame): ${countC} events`);
}

testDrainingModes();
