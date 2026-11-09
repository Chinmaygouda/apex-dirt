import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { CollisionImpulseDispatcher } from '../src/physics/CollisionImpulseDispatcher.js';
import { RallyStageWorld } from '../src/world/RallyStageWorld.js';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle.js';
import { PHYSICS_CONFIG } from '../src/core/Constants.js';

async function test15mDrop() {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();

  const rallyWorld = new RallyStageWorld(scene, physics);
  const dispatcher = new CollisionImpulseDispatcher(physics);

  for (const item of rallyWorld.roadsideColliders) {
    dispatcher.registerEntity(item.collider, item.entity);
  }

  const vehicle = new CustomRallyVehicle(scene, physics, dispatcher);
  dispatcher.registerCarCollider(vehicle.chassisCollider, vehicle.chassisBody);

  vehicle.chassisBody.setTranslation({ x: 0, y: 15.0, z: 0 }, true);

  dispatcher.onCollision((evt) => {
    console.log('15m DROP EVENT DISPATCHED:', {
      entity: evt.collidedEntity,
      submesh: evt.targetSubMesh,
      impulse: evt.impulseMagnitude,
      normal: evt.contactNormal,
      point: evt.contactPoint,
    });
  });

  for (let s = 0; s < 240; s++) {
    physics.step(
      PHYSICS_CONFIG.SUBSTEP_DT,
      (dt) => {
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
      },
      (subDt) => dispatcher.drainImpulses(subDt)
    );
  }
}

test15mDrop();
