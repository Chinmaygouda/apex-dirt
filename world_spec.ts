// FROZEN WORLD SPECIFICATION: Baseline truth for Apex Dirt minimal test course.
// Do not modify these values. Any edit requires a corresponding architecture freeze justification.

export interface SectionSpec {
  id: number;
  type: 'STRAIGHT' | 'RIGHT' | 'LEFT';
  length?: number;
  radius?: number;
  angleDeg?: number;
}

export const WORLD_SPEC = {
  roadWidth: 8.0,
  roadWidthTol: 0.001,

  fenceLine: 6.0,
  fenceLineTol: 0.001,

  fenceColliderCentre: 6.6,
  fenceColliderCentreTol: 0.001,

  totalLength: 1468.0,
  totalLengthTol: 1.0,

  treeCount: 0,
  propCount: 0,
  randomCalls: 0,

  minSeparationNonAdjacent: 40.0, // Minimum separation in metres
  separationExclusionWindow: 150.0, // In metres along road

  endHeadingDeg: 90.0,
  endHeadingTolDeg: 0.01,

  containment: {
    maxDistFromCentreline: 7.1, // Car centre must never exceed 7.1m from centreline
    minS: -2.0,                  // Never pass start barrier at s = -2
    maxS: 1470.0,                // Never pass far barrier at s = 1470
    maxY: 1.5,                   // Max car y <= 1.5m
  },

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
  ] as const satisfies readonly SectionSpec[],

  spawnS: 20.0,
} as const;
