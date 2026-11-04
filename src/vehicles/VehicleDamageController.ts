import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CustomRallyVehicle } from './CustomRallyVehicle';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CollisionImpulseDispatcher, ICollisionContactEvent } from '../physics/CollisionImpulseDispatcher';

interface DebrisPart {
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  age: number;
}

export class VehicleDamageController {
  private isFrontBumperDetached = false;
  private isHoodDetached = false;
  private isRearWingDetached = false;

  private debrisList: DebrisPart[] = [];
  public onDamage?: (severity: 'minor' | 'medium' | 'severe', impulse: number) => void;

  // Radiator steam effect if front takes heavy damage
  private radiatorSteamMesh?: THREE.Points;
  private steamPositions?: Float32Array;
  private steamVelocities?: Float32Array;
  private isRadiatorPunctured = false;

  constructor(
    private scene: THREE.Scene,
    private vehicle: CustomRallyVehicle,
    private physics: PhysicsWorld,
    private dispatcher: CollisionImpulseDispatcher
  ) {
    this.dispatcher.onCollision((event) => this.handleCollision(event));
    this.createRadiatorSteam();
  }

  private createRadiatorSteam(): void {
    const count = 48;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 0.4;
      positions[i * 3 + 1] = 0.2 + Math.random() * 0.2;
      positions[i * 3 + 2] = 1.9 + Math.random() * 0.2;

      velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.6;
      velocities[i * 3 + 1] = 1.2 + Math.random() * 1.5;
      velocities[i * 3 + 2] = -0.5 - Math.random() * 1.0;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    let pTexture: THREE.CanvasTexture | undefined;
    if (typeof document !== 'undefined') {
      const pCanvas = document.createElement('canvas');
      pCanvas.width = 32;
      pCanvas.height = 32;
      const pCtx = pCanvas.getContext('2d')!;
      const grad = pCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      grad.addColorStop(0.4, 'rgba(230, 230, 230, 0.4)');
      grad.addColorStop(1, 'rgba(200, 200, 200, 0.0)');
      pCtx.fillStyle = grad;
      pCtx.fillRect(0, 0, 32, 32);
      pTexture = new THREE.CanvasTexture(pCanvas);
    }

    const mat = new THREE.PointsMaterial({
      color: 0xeeeeee,
      size: 0.35,
      map: pTexture,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.radiatorSteamMesh = new THREE.Points(geom, mat);
    if (this.vehicle.chassisMesh) {
      this.vehicle.chassisMesh.add(this.radiatorSteamMesh);
    }
    this.steamPositions = positions;
    this.steamVelocities = velocities;
  }

  public handleCollision(event: ICollisionContactEvent): void {
    // Normal road driving or ground contacts must NEVER puncture radiator or detach car body panels
    if (event.collidedEntity === 'terrain' || !event.collidedEntity) return;

    const J = event.impulseMagnitude;
    if (J < 1800) return;

    if (J >= 9000) {
      this.onDamage?.('severe', J);
      this.deformLocalMesh(event.contactPoint, event.contactNormal, J);
      this.detachSubMesh(event.targetSubMesh || 'front_bumper');
    } else {
      this.onDamage?.('medium', J);
      this.deformLocalMesh(event.contactPoint, event.contactNormal, J);
    }
  }

  /**
   * Localized vertex crumple deformation within radius R ~ 0.65m
   */
  private deformLocalMesh(worldContactPoint: THREE.Vector3, worldContactNormal: THREE.Vector3, impulse: number): void {
    if (!this.vehicle.chassisMesh) return;

    const carInvMatrix = this.vehicle.chassisMesh.matrixWorld.clone().invert();
    const localHitPoint = worldContactPoint.clone().applyMatrix4(carInvMatrix);

    const normalQuat = this.vehicle.chassisMesh.quaternion.clone().invert();
    const localNormal = worldContactNormal.clone().applyQuaternion(normalQuat).normalize();

    // Inward deformation direction (crumple into car center)
    const deformDir = localNormal.clone().negate().multiplyScalar(0.7).add(
      new THREE.Vector3(-localHitPoint.x, 0, -localHitPoint.z).normalize().multiplyScalar(0.3)
    ).normalize();

    const radius = 0.75;
    const maxDisplacement = Math.min(0.24, (impulse / 15000.0) * 0.24);

    // Target candidate groups to crumple
    const groupsToDeform: THREE.Group[] = [
      this.vehicle.frontBumperGroup,
      this.vehicle.hoodGroup,
      this.vehicle.chassisMainGroup,
      this.vehicle.rearWingGroup,
    ].filter(Boolean);

    for (const group of groupsToDeform) {
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const geom = mesh.geometry;
          if (!geom || !geom.attributes.position) return;

          // Convert localHitPoint to mesh's local coordinate space
          const meshInv = mesh.matrix.clone().invert();
          const meshHitPoint = localHitPoint.clone().applyMatrix4(meshInv);
          const meshDeformDir = deformDir.clone().transformDirection(meshInv).normalize();

          const posAttr = geom.attributes.position;
          let changed = false;

          for (let i = 0; i < posAttr.count; i++) {
            const vx = posAttr.getX(i);
            const vy = posAttr.getY(i);
            const vz = posAttr.getZ(i);

            const dx = vx - meshHitPoint.x;
            const dy = vy - meshHitPoint.y;
            const dz = vz - meshHitPoint.z;
            const dist = Math.hypot(dx, dy, dz);

            if (dist < radius) {
              const falloff = 1.0 - dist / radius;
              const push = falloff * maxDisplacement;

              posAttr.setXYZ(
                i,
                vx + meshDeformDir.x * push,
                vy + meshDeformDir.y * push * 0.5,
                vz + meshDeformDir.z * push
              );
              changed = true;
            }
          }

          if (changed) {
            posAttr.needsUpdate = true;
            geom.computeVertexNormals();
          }
        }
      });
    }
  }

  /**
   * Detaches sub-mesh into dynamic Rapier rigid body debris
   */
  public detachSubMesh(target: 'front_bumper' | 'hood' | 'rear_wing' | 'chassis'): void {
    if (!this.vehicle.chassisMesh || !this.vehicle.chassisBody) return;

    let groupToDetach: THREE.Group | null = null;
    let halfExtents: [number, number, number] = [0.8, 0.15, 0.2];
    let partMass = 25;

    if (target === 'front_bumper' && !this.isFrontBumperDetached) {
      groupToDetach = this.vehicle.frontBumperGroup;
      this.isFrontBumperDetached = true;
      this.isRadiatorPunctured = true;
      halfExtents = [0.85, 0.15, 0.2];
      partMass = 20;
    } else if ((target === 'hood' || (this.isFrontBumperDetached && target === 'front_bumper')) && !this.isHoodDetached) {
      groupToDetach = this.vehicle.hoodGroup;
      this.isHoodDetached = true;
      halfExtents = [0.72, 0.08, 0.65];
      partMass = 28;
    } else if (target === 'rear_wing' && !this.isRearWingDetached) {
      groupToDetach = this.vehicle.rearWingGroup;
      this.isRearWingDetached = true;
      halfExtents = [0.88, 0.12, 0.22];
      partMass = 15;
    }

    if (!groupToDetach) return;

    // 1. Get world transform of the group
    groupToDetach.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    groupToDetach.matrixWorld.decompose(worldPos, worldQuat, worldScale);

    // 2. Remove from car hierarchy and attach directly to scene
    groupToDetach.removeFromParent();
    groupToDetach.position.copy(worldPos);
    groupToDetach.quaternion.copy(worldQuat);
    groupToDetach.scale.copy(worldScale);
    this.scene.add(groupToDetach);

    // 3. Create dynamic Rapier rigid body
    const rapier = this.physics.rapier;
    const bodyDesc = rapier.RigidBodyDesc.dynamic()
      .setTranslation(worldPos.x, worldPos.y, worldPos.z)
      .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w })
      .setLinearDamping(0.05)
      .setAngularDamping(0.3);

    const debrisBody = this.physics.world.createRigidBody(bodyDesc);

    // Inherit car linear velocity + scatter impulse
    const carLinvel = this.vehicle.chassisBody.linvel();
    debrisBody.setLinvel(
      {
        x: carLinvel.x + (Math.random() - 0.5) * 4.0,
        y: Math.max(1.5, carLinvel.y + 2.5 + Math.random() * 2.0),
        z: carLinvel.z + (Math.random() - 0.5) * 4.0,
      },
      true
    );

    // Tumbling angular momentum
    debrisBody.setAngvel(
      {
        x: (Math.random() - 0.5) * 12.0,
        y: (Math.random() - 0.5) * 14.0,
        z: (Math.random() - 0.5) * 10.0,
      },
      true
    );

    const colDesc = rapier.ColliderDesc.cuboid(halfExtents[0], halfExtents[1], halfExtents[2])
      .setMass(partMass)
      .setFriction(0.65)
      .setRestitution(0.35);

    const debrisCollider = this.physics.world.createCollider(colDesc, debrisBody);

    this.debrisList.push({
      mesh: groupToDetach,
      body: debrisBody,
      collider: debrisCollider,
      age: 0,
    });
  }

  public update(dt: number): void {
    // Sync detached debris meshes with their physics bodies
    for (let i = this.debrisList.length - 1; i >= 0; i--) {
      const debris = this.debrisList[i];
      debris.age += dt;

      const trans = debris.body.translation();
      const rot = debris.body.rotation();

      debris.mesh.position.set(trans.x, trans.y, trans.z);
      debris.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    }

    // Update radiator steam if front is punctured
    if (this.isRadiatorPunctured && this.radiatorSteamMesh && this.steamPositions && this.steamVelocities) {
      const posAttr = this.radiatorSteamMesh.geometry.attributes.position as THREE.BufferAttribute;
      const count = posAttr.count;
      const mat = this.radiatorSteamMesh.material as THREE.PointsMaterial;
      mat.opacity = Math.min(0.75, mat.opacity + dt * 0.8);

      for (let i = 0; i < count; i++) {
        let y = posAttr.getY(i) + this.steamVelocities[i * 3 + 1] * dt;
        let x = posAttr.getX(i) + this.steamVelocities[i * 3 + 0] * dt;
        let z = posAttr.getZ(i) + this.steamVelocities[i * 3 + 2] * dt;

        if (y > 2.0 || z < 0.5) {
          // Reset particle
          x = (Math.random() - 0.5) * 0.4;
          y = 0.15 + Math.random() * 0.15;
          z = 1.95 + Math.random() * 0.15;
        }

        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;
    }
  }

  public reset(): void {
    // Note: Re-attaching detached parts can be done on full vehicle reset
    for (const debris of this.debrisList) {
      this.physics.world.removeCollider(debris.collider, false);
      this.physics.world.removeRigidBody(debris.body);
      this.scene.remove(debris.mesh);
    }
    this.debrisList = [];
    this.isFrontBumperDetached = false;
    this.isHoodDetached = false;
    this.isRearWingDetached = false;
    this.isRadiatorPunctured = false;
  }
}
