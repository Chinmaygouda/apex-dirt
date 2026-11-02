/**
 * Non-default suspension profiles (Lane 2). Spread over `vehicle.tuning` (then call `vehicle.setCenterOfMassHeight(...)` if
 * centerOfMassHeight is set). NOT applied by default: measured against 89aa93a this profile breaks handling (test:keyboard 11/14,
 * replay 4 MATCH + 3 REGRESSION) mainly because of the lower CoG, and needs a Lane 1 retune of the tyre model before it can ship.
 * What it buys: realised ride 1.94 Hz / zeta 0.68, dive 0.96 and squat 0.99 deg/G, roll 2.6 deg/G, rear wheel extension 6.1 cm in
 * the handbrake slide, ramp landing 5.95x static load (all measured with measure_suspension.ts).
 */
export const SOFT_LOW_COG_PROFILE = {
  springStiffness: 30000, springStiffnessRear: 28500,
  damperCompression: 2284, damperRebound: 2821, damperCompressionRear: 2226, damperReboundRear: 2750,
  suspensionRestLength: 0.4562, suspensionRestLengthRear: 0.4666,
  antiRollBarStiffness: 0, antiRollBarStiffnessRear: 0,
  bumpStopLength: 0.18, bumpStopRate: 35000, bumpStopProgressM: 0.08,
  droopStopLength: 0.4593,
  centerOfMassHeight: 0.63,
};
