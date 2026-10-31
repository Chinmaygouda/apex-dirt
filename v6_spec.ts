/**
 * V6 FULL INTEGRATION MANEUVER SPECIFICATION
 * 
 * Frozen validation criteria and threshold definitions.
 * All thresholds are defined and frozen here before test execution.
 */

export interface V6Thresholds {
  // Phase 1: 130 mph Straight Approach
  straightMinSpeedMph: number;
  straightMaxYawDevDeg: number;
  straightMaxRollDeg: number;
  straightMaxDroopCm: number;

  // Phase 2: Heavy Straight Braking (Original spec: 1.7 - 2.1 G)
  brakingMinDecelG: number;
  brakingMaxDecelG: number;
  brakingMinPitchDiveDeg: number;
  brakingMaxPitchDiveDeg: number;

  // Phase 3: Handbrake Turn-in & Rotation (Original spec: 30 - 40 deg at ~115 mph)
  handbrakeEntrySpeedMinMph: number;
  handbrakeEntrySpeedMaxMph: number;
  handbrakeMinSlipAngleDeg: number;
  handbrakeMaxSlipAngleDeg: number;
  handbrakeMinYawChangeDeg: number;
  handbrakeMinRearDroopCm: number;

  // Phase 4: Sustained Drift & Slide Scrub (Original spec: ~1.0 G)
  slideScrubMinDecelG: number;
  slideScrubMaxDecelG: number;
  slideScrubMinRollDeg: number;
  slideScrubMaxRollDeg: number;

  // Phase 5: Power-Out Straight Exit Acceleration
  powerOutMinSpeedGainMph: number;
  powerOutMaxFinalSlipDeg: number;
}

export const V6_FROZEN_SPEC: V6Thresholds = {
  // Phase 1: Straight Approach (t = 0.5s to 1.1s)
  straightMinSpeedMph: 129.0,
  straightMaxYawDevDeg: 1.0,
  straightMaxRollDeg: 1.0,      // Body within 1 deg of level on straight (steer within +/-0.25)
  straightMaxDroopCm: 0.05,     // No droop on straight (< 0.5 mm)

  // Phase 2: Straight Braking (t = 1.20s to 1.55s)
  brakingMinDecelG: 1.70,       // Original spec: 1.7 - 2.1 G
  brakingMaxDecelG: 2.10,       // Original spec: 1.7 - 2.1 G
  brakingMinPitchDiveDeg: -1.5, // Fairly level from behind (between -0.5° and -1.5°)
  brakingMaxPitchDiveDeg: -0.5,

  // Phase 3: Handbrake Turn-in & Rotation (t = 1.55s to 2.00s)
  handbrakeEntrySpeedMinMph: 110.0, // At ~115 mph entry
  handbrakeEntrySpeedMaxMph: 118.0,
  handbrakeMinSlipAngleDeg: 30.0,   // Original spec: 30 - 40 deg
  handbrakeMaxSlipAngleDeg: 40.0,   // Original spec: 30 - 40 deg
  handbrakeMinYawChangeDeg: 25.0,
  handbrakeMinRearDroopCm: 5.0,     // Inside rear wheel visibly droops

  // Phase 4: Sustained Drift & Slide Scrub (t = 2.00s to 2.90s)
  slideScrubMinDecelG: 0.85,    // Original spec: ~1.0 G (matches Run 0 pure slide scrub 0.85-1.15 G)
  slideScrubMaxDecelG: 1.15,    // Original spec: ~1.0 G
  slideScrubMinRollDeg: 4.0,    // Visible outward body lean
  slideScrubMaxRollDeg: 8.5,

  // Phase 5: Power Out Straight Exit (t = 2.90s to 5.40s)
  powerOutMinSpeedGainMph: 15.0, // Original spec: >= 15 mph gain
  powerOutMaxFinalSlipDeg: 2.0,  // Straight exit (< 2 deg slip)
};
