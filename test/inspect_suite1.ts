import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { CollisionImpulseDispatcher } from '../src/physics/CollisionImpulseDispatcher.js';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle.js';
import { PHYSICS_CONFIG } from '../src/core/Constants.js';

async function testInspect() {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();

  const dispatcher = new CollisionImpulseDispatcher(physics);
  const vehicle = new CustomRallyVehicle(scene, physics, dispatcher);
  dispatcher.registerCarCollider(vehicle.chassisCollider, vehicle.chassisBody);

  const barrierBody = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, 1.0, 10.0)
  );
  const barrierCol = physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(5.0, 2.0, 0.5)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
    barrierBody
  );
  dispatcher.registerEntity(barrierCol, 'barrier');

  vehicle.chassisBody.setTranslation({ x: 0, y: 0.8, z: 0 }, true);
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 58.115 }, true);

  dispatcher.onCollision((evt) => {
    console.log('EVENT DISPATCHED:', {
      collidedEntity: evt.collidedEntity,
      targetSubMesh: evt.targetSubMesh,
      impulse: evt.impulseMagnitude,
      contactPoint: evt.contactPoint,
      contactNormal: evt.contactNormal,
    });
  });

  for (let s = 0; s < 60; s++) {
    physics.step(PHYSICS_CONFIG.SUBSTEP_DT, () => {}, (dt) => dispatcher.drainImpulses(dt));
  }
}

testInspect();
