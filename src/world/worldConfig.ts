// FROZEN. Changing these values requires editing world_spec.ts in the same commit and explaining why.

export interface CourseSectionDef {
  readonly id: number;
  readonly type: 'STRAIGHT' | 'RIGHT' | 'LEFT';
  readonly length?: number;
  readonly radius?: number;
  readonly angleDeg?: number;
}

export const WORLD_CONFIG = {
  // Course layout
  roadWidth: 8.0,
  roadHalfWidth: 4.0,
  fenceLine: 6.0,
  fenceColliderCentre: 6.6,
  fenceThickness: 2.0,
  fenceHeight: 2.0,
  fenceOverhang: 0.6,
  postSpacing: 4.0,
  postHeight: 1.0,
  railHeights: [0.45, 0.90] as const,

  // End barriers
  endBarrierStartS: -2.0,
  endBarrierEndS: 1470.0,
  endBarrierThickness: 2.0,
  endBarrierHeight: 2.0,
  endBarrierWidth: 32.0,

  // Physics properties
  groundFriction: 0.9,
  groundRestitution: 0.0,
  fenceFriction: 0.2,
  fenceRestitution: 0.0,
  barrierFriction: 0.2,
  barrierRestitution: 0.0,

  // Spawn and rigid alignment transform
  // Spawn is at vehicle.resetPosition(): (0, 0.6593, -8) heading 0 (+Z)
  // Centreline point s = 20 is at course (0, 20) heading 0 (+Z)
  // Rigid transform: course (x, z) -> world (x, z - 28)
  spawnS: 20.0,
  rigidTransform: {
    rotY: 0.0,
    transX: 0.0,
    transY: 0.0,
    transZ: -28.0,
  },

  // Gameplay flags
  gatesEnabled: false,

  // Frozen course sections
  sections: [
    { id: 1, type: 'STRAIGHT', length: 400.0 },
    { id: 2, type: 'RIGHT', radius: 120.0, angleDeg: 60.0 },
    { id: 3, type: 'STRAIGHT', length: 150.0 },
    { id: 4, type: 'LEFT', radius: 60.0, angleDeg: 90.0 },
    { id: 5, type: 'STRAIGHT', length: 100.0 },
    { id: 6, type: 'RIGHT', radius: 25.0, angleDeg: 120.0 },
    { id: 7, type: 'STRAIGHT', length: 120.0 },
    { id: 8, type: 'LEFT', radius: 80.0, angleDeg: 45.0 },
    { id: 9, type: 'RIGHT', radius: 80.0, angleDeg: 45.0 },
    { id: 10, type: 'STRAIGHT', length: 300.0 },
  ] as const satisfies readonly CourseSectionDef[],
} as const;
