import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { CourseGeometry } from './CourseGeometry';
import { WORLD_CONFIG } from './worldConfig';

export class CurveRoadWorld {
  public physicsColliders: any[] = [];
  public physicsBodies: any[] = [];

  constructor() {}

  /**
   * Builds the pure Rapier physics representation of the course.
   * Completely decoupled from Three.js: uses pure math and Rapier colliders.
   */
  public buildPhysics(physics: PhysicsWorld): void {
    const rapier = physics.rapier;
    const world = physics.world;

    // 1. Ground Collider: Flat plane cuboid whose TOP is at y = 0
    // Copied from SandboxEnvironment: friction = 0.9, restitution = 0.0
    const groundBodyDesc = rapier.RigidBodyDesc.fixed().setTranslation(350.0, -0.5, 400.0);
    const groundBody = world.createRigidBody(groundBodyDesc);
    const groundColliderDesc = rapier.ColliderDesc.cuboid(3000.0, 0.5, 3000.0)
      .setFriction(WORLD_CONFIG.groundFriction)
      .setRestitution(WORLD_CONFIG.groundRestitution);
    const groundCollider = world.createCollider(groundColliderDesc, groundBody);
    this.physicsBodies.push(groundBody);
    this.physicsColliders.push(groundCollider);

    // 2. Fence Colliders: Invisible continuous walls on each side following the road.
    // Total height: 2.0m tall, 2.0m thick, overlapping boxes every 4m of arc length (extended 0.6m beyond ends).
    // Built with an upper tier (y in [0.8, 2.0]) at 6.6m from centreline and a lower tier (y in [0.0, 0.8]) recessed
    // to 6.8m. This guarantees the chassis (y in [0.50, 1.14]) is solidly contained at 6.6m, while wheel anchors (y=0.61)
    // and downward suspension raycasts remain in clear space so discrete penetration never triggers false compression.
    const postSpacing = WORLD_CONFIG.postSpacing;
    const halfLen = (postSpacing + 2.0 * WORLD_CONFIG.fenceOverhang) * 0.5; // 2.6m
    const fenceDist = WORLD_CONFIG.fenceColliderCentre; // 6.6m

    const splitY = 0.80;
    const recess = 0.20;

    // Upper tier: y in [0.80, 2.00] (height = 1.20m, halfH = 0.60m, centerY = 1.40m)
    const upperHeight = WORLD_CONFIG.fenceHeight - splitY;
    const upperHalfH = upperHeight * 0.5;
    const upperCenterY = splitY + upperHalfH;
    const upperHalfThick = WORLD_CONFIG.fenceThickness * 0.5; // 1.0m

    // Lower tier: y in [0.00, 0.80] (height = 0.80m, halfH = 0.40m, centerY = 0.40m)
    const lowerHalfH = splitY * 0.5;
    const lowerCenterY = splitY * 0.5;
    const lowerDist = fenceDist + recess; // 6.80m
    const lowerHalfThick = WORLD_CONFIG.fenceThickness * 0.5; // 1.0m

    const startS = WORLD_CONFIG.endBarrierStartS; // -2.0m
    const endS = WORLD_CONFIG.endBarrierEndS;     // 1470.0m

    for (let s = startS; s <= endS + postSpacing * 0.5; s += postSpacing) {
      const pt = CourseGeometry.sample(s);
      const h = pt.heading;
      const cosH = Math.cos(h);
      const sinH = Math.sin(h);

      const qy = Math.sin(h * 0.5);
      const qw = Math.cos(h * 0.5);

      // Right fence - Upper
      const courseXR_up = pt.x + fenceDist * cosH;
      const courseZR_up = pt.z - fenceDist * sinH;
      const bodyR_up = world.createRigidBody(
        rapier.RigidBodyDesc.fixed()
          .setTranslation(courseXR_up + WORLD_CONFIG.rigidTransform.transX, upperCenterY, courseZR_up + WORLD_CONFIG.rigidTransform.transZ)
          .setRotation({ x: 0.0, y: qy, z: 0.0, w: qw })
      );
      const colR_up = world.createCollider(
        rapier.ColliderDesc.cuboid(upperHalfThick, upperHalfH, halfLen)
          .setFriction(WORLD_CONFIG.fenceFriction)
          .setRestitution(WORLD_CONFIG.fenceRestitution),
        bodyR_up
      );
      this.physicsBodies.push(bodyR_up);
      this.physicsColliders.push(colR_up);

      // Right fence - Lower
      const courseXR_low = pt.x + lowerDist * cosH;
      const courseZR_low = pt.z - lowerDist * sinH;
      const bodyR_low = world.createRigidBody(
        rapier.RigidBodyDesc.fixed()
          .setTranslation(courseXR_low + WORLD_CONFIG.rigidTransform.transX, lowerCenterY, courseZR_low + WORLD_CONFIG.rigidTransform.transZ)
          .setRotation({ x: 0.0, y: qy, z: 0.0, w: qw })
      );
      const colR_low = world.createCollider(
        rapier.ColliderDesc.cuboid(lowerHalfThick, lowerHalfH, halfLen)
          .setFriction(WORLD_CONFIG.fenceFriction)
          .setRestitution(WORLD_CONFIG.fenceRestitution),
        bodyR_low
      );
      this.physicsBodies.push(bodyR_low);
      this.physicsColliders.push(colR_low);

      // Left fence - Upper
      const courseXL_up = pt.x - fenceDist * cosH;
      const courseZL_up = pt.z + fenceDist * sinH;
      const bodyL_up = world.createRigidBody(
        rapier.RigidBodyDesc.fixed()
          .setTranslation(courseXL_up + WORLD_CONFIG.rigidTransform.transX, upperCenterY, courseZL_up + WORLD_CONFIG.rigidTransform.transZ)
          .setRotation({ x: 0.0, y: qy, z: 0.0, w: qw })
      );
      const colL_up = world.createCollider(
        rapier.ColliderDesc.cuboid(upperHalfThick, upperHalfH, halfLen)
          .setFriction(WORLD_CONFIG.fenceFriction)
          .setRestitution(WORLD_CONFIG.fenceRestitution),
        bodyL_up
      );
      this.physicsBodies.push(bodyL_up);
      this.physicsColliders.push(colL_up);

      // Left fence - Lower
      const courseXL_low = pt.x - lowerDist * cosH;
      const courseZL_low = pt.z + lowerDist * sinH;
      const bodyL_low = world.createRigidBody(
        rapier.RigidBodyDesc.fixed()
          .setTranslation(courseXL_low + WORLD_CONFIG.rigidTransform.transX, lowerCenterY, courseZL_low + WORLD_CONFIG.rigidTransform.transZ)
          .setRotation({ x: 0.0, y: qy, z: 0.0, w: qw })
      );
      const colL_low = world.createCollider(
        rapier.ColliderDesc.cuboid(lowerHalfThick, lowerHalfH, halfLen)
          .setFriction(WORLD_CONFIG.fenceFriction)
          .setRestitution(WORLD_CONFIG.fenceRestitution),
        bodyL_low
      );
      this.physicsBodies.push(bodyL_low);
      this.physicsColliders.push(colL_low);
    }

    // 3. End Barriers: Across corridor at s = -2 and s = 1470
    // 2m thick, 2m tall, perpendicular to local heading
    const barrierHalfWidth = WORLD_CONFIG.endBarrierWidth * 0.5; // 16.0m
    const barrierHalfThick = WORLD_CONFIG.endBarrierThickness * 0.5; // 1.0m
    const barrierHalfHeight = WORLD_CONFIG.endBarrierHeight * 0.5; // 1.0m

    // Start barrier (s = -2.0)
    const ptStart = CourseGeometry.sample(WORLD_CONFIG.endBarrierStartS);
    const startH = ptStart.heading;
    const startQy = Math.sin(startH * 0.5);
    const startQw = Math.cos(startH * 0.5);
    const startWX = ptStart.x + WORLD_CONFIG.rigidTransform.transX;
    const startWZ = ptStart.z + WORLD_CONFIG.rigidTransform.transZ;

    const startBodyDesc = rapier.RigidBodyDesc.fixed()
      .setTranslation(startWX, barrierHalfHeight, startWZ)
      .setRotation({ x: 0.0, y: startQy, z: 0.0, w: startQw });
    const startBody = world.createRigidBody(startBodyDesc);
    const startColDesc = rapier.ColliderDesc.cuboid(barrierHalfWidth, barrierHalfHeight, barrierHalfThick)
      .setFriction(WORLD_CONFIG.barrierFriction)
      .setRestitution(WORLD_CONFIG.barrierRestitution);
    const startCol = world.createCollider(startColDesc, startBody);
    this.physicsBodies.push(startBody);
    this.physicsColliders.push(startCol);

    // Far end barrier (s = 1470.0)
    const ptEnd = CourseGeometry.sample(WORLD_CONFIG.endBarrierEndS);
    const endH = ptEnd.heading;
    const endQy = Math.sin(endH * 0.5);
    const endQw = Math.cos(endH * 0.5);
    const endWX = ptEnd.x + WORLD_CONFIG.rigidTransform.transX;
    const endWZ = ptEnd.z + WORLD_CONFIG.rigidTransform.transZ;

    const endBodyDesc = rapier.RigidBodyDesc.fixed()
      .setTranslation(endWX, barrierHalfHeight, endWZ)
      .setRotation({ x: 0.0, y: endQy, z: 0.0, w: endQw });
    const endBody = world.createRigidBody(endBodyDesc);
    const endColDesc = rapier.ColliderDesc.cuboid(barrierHalfWidth, barrierHalfHeight, barrierHalfThick)
      .setFriction(WORLD_CONFIG.barrierFriction)
      .setRestitution(WORLD_CONFIG.barrierRestitution);
    const endCol = world.createCollider(endColDesc, endBody);
    this.physicsBodies.push(endBody);
    this.physicsColliders.push(endCol);
  }

  public async buildVisuals(scene: any): Promise<void> {
    // Visual implementation in commit 3
  }

  public getSurfaceAt(worldX: number, worldZ: number): { name: string; multiplier: number } {
    const courseX = worldX - WORLD_CONFIG.rigidTransform.transX;
    const courseZ = worldZ - WORLD_CONFIG.rigidTransform.transZ;
    const { distance } = CourseGeometry.distToCentreline(courseX, courseZ);
    if (distance <= WORLD_CONFIG.roadHalfWidth) {
      return { name: 'Dirt', multiplier: 0.72 };
    }
    return { name: 'Grass', multiplier: 0.45 };
  }
}
