import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from './PhysicsWorld';
import { PHYSICS_CONFIG } from '../core/Constants';

export interface ICollisionContactEvent {
  contactPoint: THREE.Vector3;
  contactNormal: THREE.Vector3;
  impulseMagnitude: number; // Ns
  collidedEntity: 'tree' | 'fence' | 'chevron' | 'terrain' | 'barrier';
  targetSubMesh?: 'front_bumper' | 'hood' | 'rear_wing' | 'chassis';
}

export interface ICollisionDispatcher {
  onCollision(listener: (event: ICollisionContactEvent) => void): void;
  drainImpulses(): void;
}

export type CollisionListener = (event: ICollisionContactEvent) => void;

export class CollisionImpulseDispatcher implements ICollisionDispatcher {
  private listeners: CollisionListener[] = [];
  private colliderEntityMap: Map<number, 'tree' | 'fence' | 'chevron' | 'terrain' | 'barrier'> = new Map();
  private carColliderHandle: number = -1;
  private carRigidBody?: RAPIER.RigidBody;

  // Reusable temporary vectors to eliminate garbage collection during 120 Hz substepping
  private readonly _tmpContactNormal = new THREE.Vector3();
  private readonly _tmpContactPoint = new THREE.Vector3();
  private readonly _tmpLocalNormal = new THREE.Vector3();
  private readonly _tmpLocalPoint = new THREE.Vector3();
  private readonly _tmpCarPos = new THREE.Vector3();
  private readonly _tmpCarQuat = new THREE.Quaternion();
  private readonly _tmpCarQuatInv = new THREE.Quaternion();

  constructor(private physics: PhysicsWorld) {}

  public registerEntity(collider: RAPIER.Collider, entity: 'tree' | 'fence' | 'chevron' | 'terrain' | 'barrier'): void {
    this.colliderEntityMap.set(collider.handle, entity);
  }

  public registerCarCollider(collider?: RAPIER.Collider, rigidBody?: RAPIER.RigidBody): void {
    if (collider) {
      this.carColliderHandle = collider.handle;
      if (!rigidBody && typeof collider.parent === 'function') {
        const parentBody = collider.parent();
        if (parentBody) {
          this.carRigidBody = parentBody;
        }
      }
    }
    if (rigidBody) {
      this.carRigidBody = rigidBody;
    }
  }

  public onCollision(listener: CollisionListener): void {
    this.listeners.push(listener);
  }

  public dispose(): void {
    this.listeners = [];
    this.colliderEntityMap.clear();
    this.carRigidBody = undefined;
    this.carColliderHandle = -1;
  }

  /**
   * Drain contact force events and dispatch impulse events.
   * Satisfies ICollisionDispatcher.drainImpulses() with optional parameters for callers.
   */
  public drainImpulses(
    substepDt: number = PHYSICS_CONFIG.SUBSTEP_DT,
    carPosition?: THREE.Vector3,
    carQuaternion?: THREE.Quaternion
  ): void {
    if (!this.physics.eventQueue) return;

    // Resolve vehicle position and orientation
    if (carPosition && carQuaternion) {
      this._tmpCarPos.copy(carPosition);
      this._tmpCarQuat.copy(carQuaternion);
    } else if (this.carRigidBody) {
      const tra = this.carRigidBody.translation();
      const rot = this.carRigidBody.rotation();
      this._tmpCarPos.set(tra.x, tra.y, tra.z);
      this._tmpCarQuat.set(rot.x, rot.y, rot.z, rot.w);
    } else if (this.carColliderHandle !== -1) {
      const col = this.physics.world.getCollider(this.carColliderHandle);
      if (col && typeof col.parent === 'function') {
        const parent = col.parent();
        if (parent) {
          this.carRigidBody = parent;
          const tra = parent.translation();
          const rot = parent.rotation();
          this._tmpCarPos.set(tra.x, tra.y, tra.z);
          this._tmpCarQuat.set(rot.x, rot.y, rot.z, rot.w);
        } else {
          return;
        }
      } else {
        return;
      }
    } else {
      return;
    }

    this._tmpCarQuatInv.copy(this._tmpCarQuat).invert();

    this.physics.eventQueue.drainContactForceEvents((event: RAPIER.TempContactForceEvent) => {
      const h1 = event.collider1();
      const h2 = event.collider2();
      if (h1 !== this.carColliderHandle && h2 !== this.carColliderHandle) {
        return;
      }

      const otherHandle = h1 === this.carColliderHandle ? h2 : h1;
      const entity = this.colliderEntityMap.get(otherHandle);
      if (!entity) {
        // Drop unmapped colliders (never default to 'barrier', e.g. unmapped road surface pads)
        return;
      }

      const forceMag = event.totalForceMagnitude();
      const impulse = forceMag * substepDt; // J = F * dt (Ns)

      // Ignore trivial sub-damage contacts (< 1500 Ns)
      if (impulse < 1500) {
        return;
      }

      const maxDir = event.maxForceDirection();
      this._tmpContactNormal.set(maxDir.x, maxDir.y, maxDir.z);

      // In Rapier, event.maxForceDirection() is the force exerted on collider1().
      // If the car is collider2(), negate to obtain the normal of force exerted ON THE CAR.
      if (h1 !== this.carColliderHandle) {
        this._tmpContactNormal.negate();
      }

      // Reject upward normal reaction forces (bottoming out over crest/ground)
      if (this._tmpContactNormal.y > 0.70) {
        return;
      }

      // Compute world contact point (from narrow-phase solver contact or geometric boundary projection)
      let contactPointResolved = false;
      const col1 = this.physics.world.getCollider(h1);
      const col2 = this.physics.world.getCollider(h2);
      if (col1 && col2) {
        this.physics.world.contactPair(col1, col2, (manifold) => {
          if (!contactPointResolved && manifold.numSolverContacts() > 0) {
            const pt = manifold.solverContactPoint(0);
            this._tmpContactPoint.set(pt.x, pt.y, pt.z);
            contactPointResolved = true;
          }
        });
      }

      if (!contactPointResolved) {
        // Fallback: project onto car bounding box perimeter along contact normal
        this._tmpContactPoint.copy(this._tmpCarPos).addScaledVector(this._tmpContactNormal, -1.1);
      }

      // Local coordinate analysis: in car space, +Z = front, -Z = rear, +Y = up, +X = right
      this._tmpLocalNormal.copy(this._tmpContactNormal).applyQuaternion(this._tmpCarQuatInv);
      this._tmpLocalPoint.copy(this._tmpContactPoint).sub(this._tmpCarPos).applyQuaternion(this._tmpCarQuatInv);

      let targetSubMesh: 'front_bumper' | 'hood' | 'rear_wing' | 'chassis' = 'chassis';
      if (this._tmpLocalNormal.z < -0.30 || this._tmpLocalPoint.z > 1.4) {
        if (this._tmpLocalPoint.y > 0.35 || this._tmpLocalNormal.y < -0.25) {
          targetSubMesh = 'hood';
        } else {
          targetSubMesh = 'front_bumper';
        }
      } else if (this._tmpLocalNormal.z > 0.30 || this._tmpLocalPoint.z < -1.4) {
        if (this._tmpLocalPoint.y > 0.50) {
          targetSubMesh = 'rear_wing';
        } else {
          targetSubMesh = 'chassis';
        }
      } else if (this._tmpLocalNormal.y < -0.35) {
        targetSubMesh = 'hood';
      } else {
        targetSubMesh = 'chassis';
      }

      const contactEvent: ICollisionContactEvent = {
        contactPoint: this._tmpContactPoint.clone(),
        contactNormal: this._tmpContactNormal.clone(),
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
