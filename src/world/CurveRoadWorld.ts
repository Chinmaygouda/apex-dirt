import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { CourseGeometry } from './CourseGeometry';
import { WORLD_CONFIG } from './worldConfig';

export class CurveRoadWorld {
  public physicsColliders: any[] = [];

  constructor() {}

  public buildPhysics(physics: PhysicsWorld): void {
    // Stub for commit 1: colliders not created yet.
  }

  public async buildVisuals(scene: any): Promise<void> {
    // Visuals stub
  }

  public getSurfaceAt(worldX: number, worldZ: number): { name: string; multiplier: number } {
    // Convert world coordinates to course coordinates
    const courseX = worldX - WORLD_CONFIG.rigidTransform.transX;
    const courseZ = worldZ - WORLD_CONFIG.rigidTransform.transZ;
    const { distance } = CourseGeometry.distToCentreline(courseX, courseZ);
    if (distance <= WORLD_CONFIG.roadHalfWidth) {
      return { name: 'Dirt', multiplier: 0.72 };
    }
    return { name: 'Grass', multiplier: 0.45 };
  }
}
