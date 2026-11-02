/**
 * LANE 2 SUSPENSION SPECIFICATION (FROZEN)
 *
 * Written BEFORE any suspension measurement or tuning run. Do not edit a value to make a run pass.
 * If a definition turns out to be wrong, supersede this file with suspension_spec_v2.ts, keep this one,
 * and report both results.
 *
 * Every number below is a PHYSICAL (Rapier rigid-body) quantity. None of them read currentVisualPitch,
 * currentVisualRoll or lastVisualDroop; those belong to Lane 3.
 *
 * Sign conventions (used by measure_suspension.ts):
 *   pitchDeg : + = nose up    (asin of the chassis forward vector's world Y)
 *   rollDeg  : + = right side up (asin of the chassis right vector's world Y); a normal outward roll in a
 *              right-hand turn (latG > 0) is therefore +, so rollGradient = rollDeg / latG is positive.
 *   travel   : metres, + = compression, measured from the fully extended length (suspensionRestLength)
 *   heave    : metres, + = body up, relative to the settled static ride
 *
 * Where the numbers come from:
 *   - Real rally car on gravel: ride frequency 1.5-2.2 Hz, roll gradient ~1.5-3.5 deg/G, dive ~0.5-1.25 deg/G,
 *     squat a little less than dive, CoG height 0.45-0.65 m for a ~1200 kg coupe (wheel radius here is 0.35 m).
 *   - Brief: braking from ~130 mph is ~2 G; body "roughly level from behind" under straight braking; rear
 *     wheels visibly hang at ~2.7-3.4 s in the reel (estimated by eye, not measured); landing from the
 *     sandbox ramp settles within about 2 bounces; no jitter at standstill.
 */

export interface SuspensionSpec {
  // ---- A. Static ride and standstill quality (no input, flat ground, 3 s after reset) ----
  staticSettleSeconds: number;
  staticMaxHeaveDriftMmPerS: number;     // |heave change| over the last 1 s
  staticMaxHeavePtPMm: number;           // peak-to-peak heave over the last 1 s
  staticMaxPitchRollPtPDeg: number;      // peak-to-peak pitch and roll over the last 1 s
  staticMaxWheelFzPtPN: number;          // per-wheel peak-to-peak normal force over the last 1 s
  staticWeightSumTolPct: number;         // |sum Fz - m g| / m g
  staticFrontShareMinPct: number;        // front axle share of static weight
  staticFrontShareMaxPct: number;
  staticSagMinCm: number;                // restLength - settled length, per wheel
  staticSagMaxCm: number;
  staticMaxLeftRightFzDiffPct: number;   // |FzL - FzR| / mean, per axle

  // ---- B. Ride frequency and damping (derived from parameters; independent of the sim) ----
  rideFreqMinHz: number;
  rideFreqMaxHz: number;
  dampingRatioMin: number;               // compression and rebound both inside this band
  dampingRatioMax: number;

  // ---- C. Weight transfer (steady states on flat dirt, physical chassis angles) ----
  brakeDecelGMin: number;                // sampling window: smoothed decel between these
  brakeDecelGMax: number;
  diveGradMinDegPerG: number;            // nose-down pitch per G of braking
  diveGradMaxDegPerG: number;
  brakeMinRearWheelFzN: number;          // no rear wheel unloaded to nothing at ~2 G braking
  squatAccelGMin: number;                // sampling window: smoothed accel between these
  squatAccelGMax: number;
  squatGradMinDegPerG: number;           // nose-up pitch per G of acceleration
  squatGradMaxDegPerG: number;
  rollLatGMin: number;                   // sampling window: smoothed |latG| between these
  rollLatGMax: number;
  rollGradMinDegPerG: number;
  rollGradMaxDegPerG: number;
  lltdFrontMinPct: number;               // front share of lateral load transfer
  lltdFrontMaxPct: number;
  maxLeftRightAsymmetryDeg: number;      // |roll(right turn)| vs |roll(left turn)| at matched speed and steer

  // ---- D. Travel limits and unloading ----
  minBumpTravelFromStaticCm: number;     // room left to compress from static ride before the bump stop
  minDroopTravelFromStaticCm: number;    // room to extend from static ride before the droop stop
  maxNormalBumpUseFraction: number;      // in braking/cornering runs, peak compression / bump room
  handbrakeRearInsideExtensionMinCm: number; // physical rear wheel extension from static in the handbrake slide
  handbrakeRearInsideFzMaxPctOfStatic: number; // that wheel unloads to at most this share of its static Fz

  // ---- E. Landing (sandbox ramp launch and a plain 0.5 m drop) ----
  maxBouncesAfterLanding: number;        // distinct upward heave peaks above +1 cm after first touchdown
  maxSettleSeconds: number;              // until |heave| < 2 cm and |vertical speed| < 0.1 m/s, held 0.3 s
  minWheelLengthAfterLandingM: number;   // wheel length (hub to anchor) must not go below this (no bottoming through)
  maxPeakWheelFzOverStaticFactor: number; // peak per-wheel Fz on landing / static Fz

  // ---- F. Interaction gates for the existing suites (report, never relax) ----
  keyboardMustPass: number;              // test:keyboard passes out of total
  keyboardTotal: number;
  replayMaxRegressions: number;          // baseline has 1 (Window 3b); may not increase
  replayMaxFails: number;
}

export const SUSPENSION_SPEC: SuspensionSpec = {
  // A
  staticSettleSeconds: 3.0,
  staticMaxHeaveDriftMmPerS: 1.0,
  staticMaxHeavePtPMm: 1.0,
  staticMaxPitchRollPtPDeg: 0.05,
  staticMaxWheelFzPtPN: 60,
  staticWeightSumTolPct: 1.5,
  staticFrontShareMinPct: 46,
  staticFrontShareMaxPct: 56,
  staticSagMinCm: 5,
  staticSagMaxCm: 9,
  staticMaxLeftRightFzDiffPct: 2.0,

  // B
  rideFreqMinHz: 1.5,
  rideFreqMaxHz: 2.2,
  dampingRatioMin: 0.30,
  dampingRatioMax: 0.75,

  // C
  brakeDecelGMin: 1.8,
  brakeDecelGMax: 2.2,
  diveGradMinDegPerG: 0.5,
  diveGradMaxDegPerG: 1.25,
  brakeMinRearWheelFzN: 300,
  squatAccelGMin: 0.6,
  squatAccelGMax: 1.0,
  squatGradMinDegPerG: 0.3,
  squatGradMaxDegPerG: 1.1,
  rollLatGMin: 0.7,
  rollLatGMax: 1.3,
  rollGradMinDegPerG: 1.5,
  rollGradMaxDegPerG: 3.5,
  lltdFrontMinPct: 45,
  lltdFrontMaxPct: 62,
  maxLeftRightAsymmetryDeg: 0.15,

  // D
  minBumpTravelFromStaticCm: 7,
  minDroopTravelFromStaticCm: 8,
  maxNormalBumpUseFraction: 0.85,
  handbrakeRearInsideExtensionMinCm: 6,
  handbrakeRearInsideFzMaxPctOfStatic: 25,

  // E
  maxBouncesAfterLanding: 2,
  maxSettleSeconds: 1.5,
  minWheelLengthAfterLandingM: 0.0,
  maxPeakWheelFzOverStaticFactor: 6.0,

  // F
  keyboardMustPass: 14,
  keyboardTotal: 14,
  replayMaxRegressions: 1,
  replayMaxFails: 0,
};
