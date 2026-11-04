/**
 * LANE 2 SUSPENSION SPECIFICATION, ADDENDUM v2 (FROZEN)
 *
 * suspension_spec.ts (v1) is NOT edited and remains in force. This file only ADDS checks. It was written after the
 * baseline run exposed two definition problems, and before any tuning or any change to src/:
 *
 *  1. The Rapier world steps at its default 1/60 s while CustomRallyVehicle applies forces with dt = 1/120 s.
 *     Static wheel load is therefore 2.00x the car's weight, so v1 checks A5 (sum Fz = m g) and A7 (sag 5-9 cm,
 *     which would be 7.05 cm at correct load, but is 14.1 cm here) cannot pass from inside the suspension code.
 *     They are reported but classified BLOCKED_BY_TIME_BASE and are not part of this lane's pass count.
 *  2. v1 check B derives ride frequency from parameters. In this time base the realised frequency is
 *     sqrt(2) times the design value and the realised damping ratio is 1/sqrt(2) times the design value. What the
 *     player sees is the realised motion, so B3/B4 below measure it from a ring-down.
 *  3. The sandbox ramp collider is mirrored relative to its mesh (the high end is at z = 20, not z = 30). E2 is
 *     therefore run approaching from +z, heading -z, up the slope the collider really has.
 *
 * Same numeric bands as v1 B, applied to the realised ring-down (wall-clock) motion.
 */
export const SUSPENSION_SPEC_V2 = {
  realizedRideFreqMinHz: 1.5,
  realizedRideFreqMaxHz: 2.2,
  realizedZetaMin: 0.30,
  realizedZetaMax: 0.75,
  ringDownPushCm: 3.0,          // push body down this far from settled static ride, release, no input
  blockedByTimeBase: ['A5', 'A7'] as string[],
};
