// Lane 3 FROZEN SPEC. Written before the first run of lane3_frames.ts. Never edit a value to make a run pass;
// tune VISUAL_* constants / camera parameters instead. New thresholds go in a new, dated block below.
export const LANE3_SPEC = {
  fps: 30,
  bodyStepMaxDegPerFrame: 1.0,            // roll and pitch
  horizonRollMaxDeg: 8.0,
  horizonRollStepMaxDegPerFrame: 3.0,
  offAxisDeg: { min: 35, max: 45, atTimesS: [3.8, 4.1] },
  outwardRollDeg: { min: 1.0, max: 6.0, atTimesS: [3.8, 4.1] },   // lean outward (opposite to lateral G)
  levelBraking: { fromS: 2.0, toS: 2.45, maxAbsRollDeg: 1.0, maxAbsPitchDeg: 3.0 },
  rearDroopVisibleM: { atTimesS: [2.8, 3.2], minMeanRearM: 0.06 },
  rearDroopRelaxed: { atS: 3.6, maxM: 0.02 },
  frontDroopQuiet: { fromS: 2.0, toS: 2.6, maxM: 0.03 },
  handbrakeIndependenceTol: 1e-9,         // visuals identical when only the handbrake flag passed to updateVisuals differs
  cameraClearanceM: 0.4,                  // camera centre to trunk surface
  cameraMinFollowM: 1.5,
  frameTimesS: [2.0, 2.5, 2.8, 3.2, 3.8, 4.1],
} as const;

// ---- 2026-11-01 v2 CORRECTION BLOCK (added after the first real run; v1 values above are NOT changed) ----
// v1 outwardRollDeg {1.0, 6.0} was my own estimate and conflicts with the project's existing frozen v6_spec.ts
// (slideScrubMinRollDeg 4.0 / slideScrubMaxRollDeg 8.5). lane3_frames.ts now reports BOTH; the v1 check stays
// recorded and failing, and the v6-aligned check is the one that scores.
export const LANE3_SPEC_V2 = {
  outwardRollDeg: { min: 4.0, max: 8.5, atTimesS: [3.8, 4.1], source: 'v6_spec.ts slideScrubMin/MaxRollDeg' },
} as const;

// ---- 2026-11-01 v3 BLOCK (written BEFORE the run that scores it; chosen after reading the lane3-clean TRACE) ----
// The reel shows a level body with planted wheels during plain braking before the handbrake (estimated by eye).
// TRACE showed rear droop 0.135-0.179 m at 2.1-2.3 s while mean rear slip ratio was only -0.10..-0.22 (handbrake not yet on).
// Window ends at 2.30 s because the TRACE shows rear lock starting at 2.40 s.
export const LANE3_SPEC_V3 = {
  rearDroopQuietBeforeHandbrake: { fromS: 2.05, toS: 2.30, maxM: 0.03 },
} as const;

