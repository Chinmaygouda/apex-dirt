/**
 * LANE 2 SUSPENSION SPECIFICATION, ADDENDUM v3 (FROZEN)
 *
 * suspension_spec.ts (v1) and suspension_spec_v2.ts are NOT edited and remain in force. No numeric band is changed here.
 * This file only replaces the ESTIMATOR used for checks B3/B4, and was written after the v2 estimator had been run on the
 * unmodified baseline and on a first 96-run design sweep, and before any tuned design was chosen.
 *
 * Why (measured, not assumed):
 *   - The v2 estimator needs two upward overshoot peaks above 0.5 mm after a 3 cm push. With the realised damping ratio
 *     zeta_r (zeta_r = sqrt(2) x the design ratio in this time base, confirmed on a damper-scale sweep: 0.56 / 0.39 / 0.27 at
 *     scales 0.707 / 0.5 / 0.35), the second peak is 30 mm x exp(-2 delta) with delta = pi zeta_r / sqrt(1 - zeta_r^2).
 *     That drops below 0.5 mm once zeta_r is above about 0.35 (design zeta about 0.25), so v2 B3/B4 can only ever pass for a
 *     design whose damping ratio is BELOW the v1 B1/B2 minimum of 0.30. v1 B1/B2 and v2 B3/B4 are therefore mutually
 *     exclusive, which is a defect of the estimator, not of the suspension.
 *   - The v2 header says the realised damping ratio is the design ratio divided by sqrt(2). The measurements say it is
 *     multiplied by sqrt(2). The realised frequency statement (x sqrt(2)) is correct.
 *
 * Procedure fix (applies to the v2 and v3 estimators alike): the ring-down used to teleport the body 3 cm down and release it
 * in the same substep. The damper then sees a one-substep length change of 3 cm / (1/120 s) = 3.6 m/s, which kicks the body
 * upward, so the release was not from rest (measured: first overshoot peak after 0.125 s, implying 3.75 Hz at zeta 0.61, which
 * contradicts the 2.66 Hz undamped frequency). The body is now pinned 3 cm low for 0.5 s with zero velocity before release.
 *
 * v3 estimator (same bands as v2: realised f 1.5-2.2 Hz, realised zeta 0.30-0.75):
 *   Release from rest at offset x0 below the settled ride (the release point is a true extremum of the response), then find
 *   the first overshoot peak a1 above the settled ride. Half-cycle log decrement d = ln(x0 / a1);
 *   zeta_r = d / sqrt(pi^2 + d^2); damped frequency f_d = 1 / (2 t1) where t1 is the time from release to that peak.
 *   a1 only needs to exceed 0.02 mm (heave is noise-free in this deterministic simulation), which resolves zeta_r up to 0.8.
 *   If there is no overshoot at all above 0.02 mm the system is reported as zeta_r >= 0.8 (fails the band).
 */
export const SUSPENSION_SPEC_V3 = {
  realizedRideFreqMinHz: 1.5,   // identical to v2
  realizedRideFreqMaxHz: 2.2,
  realizedZetaMin: 0.30,
  realizedZetaMax: 0.75,
  ringDownPushCm: 3.0,
  minResolvablePeakMm: 0.02,
};
