import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from './PhysicsWorld';

export interface ICollisionContactEvent {
  contactPoint: THREE.Vector3;
  contactNormal: THREE.Vector3;
  impulseMagnitude: number; // Ns
  collidedEntity: 'tree' | 'fence' | 'chevron' | 'terrain' | 'barrier';
  targetSubMesh?: 'front_bumper' | 'hood' | 'rear_wing' | 'chassis';
}

export type CollisionListener = (event: ICollisionContactEvent) => void;

export class CollisionImpulseDispatcher {
  private listeners: CollisionListener[] = [];
  private colliderEntityMap: Map<number, 'tree' | 'fence' | 'chevron' | 'terrain' | 'barrier'> = new Map();
  private carColliderHandle: number = -1;

  constructor(private physics: PhysicsWorld) {}

  public registerEntity(collider: RAPIER.Collider, entity: 'tree' | 'fence' | 'chevron' | 'terrain' | 'barrier'): void {
    this.colliderEntityMap.set(collider.handle, entity);
  }

  public registerCarCollider(collider?: RAPIER.Collider): void {
    if (collider) {
      this.carColliderHandle = collider.handle;
    }
  }

  public onCollision(listener: CollisionListener): void {
    this.listeners.push(listener);
  }

  public drainImpulses(substepDt: number, carPosition: THREE.Vector3, carQuaternion: THREE.Quaternion): void {
    if (!this.physics.eventQueue) return;

    this.physics.eventQueue.drainContactForceEvents((event: RAPIER.TempContactForceEvent) => {
      const h1 = event.collider1();
      const h2 = event.collider2();
      if (h1 !== this.carColliderHandle && h2 !== this.carColliderHandle) {
        return;
      }

      const otherHandle = h1 === this.carColliderHandle ? h2 : h1;
      const entity = this.colliderEntityMap.get(otherHandle) || 'barrier';

      const forceMag = event.totalForceMagnitude();
      const impulse = forceMag * substepDt; // J = F * dt (Ns)

      if (impulse < 1500) {
        // Minor vibration/touch below damage threshold
        return;
      }

      const maxDir = event.maxForceDirection();
      const contactNormal = new THREE.Vector3(maxDir.x, maxDir.y, maxDir.z);
      if (h1 !== this.carColliderHandle) {
        contactNormal.negate();
      }

      // Approximate contact point in world coordinates:
      const contactPoint = carPosition.clone().addScaledVector(contactNormal, -1.0);

      // Determine target sub-mesh based on local contact direction
      // In local car space: +Z = front, -Z = rear, +Y = up, +X = right
      const localNormal = contactNormal.clone().applyQuaternion(carQuaternion.clone().invert());
      let targetSubMesh: 'front_bumper' | 'hood' | 'rear_wing' | 'chassis' = 'chassis';
      if (localNormal.z < -0.25) {
        targetSubMesh = 'front_bumper';
      } else if (localNormal.z > 0.25) {
        targetSubMesh = 'rear_wing';
      } else if (localNormal.y < -0.2) {
        targetSubMesh = 'hood';
      }

      const contactEvent: ICollisionContactEvent = {
        contactPoint,
        contactNormal,
        impulseMagnitude: impulse,
        collidedEntity: entity,
        targetSubMesh,
      };

      for (const listener of this.listeners) {
        listener(contactEvent);
      }
    });
  }
}
