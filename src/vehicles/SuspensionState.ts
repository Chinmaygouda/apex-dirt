/**
 * SuspensionState: the contract between Lane 2 (suspension physics, producer) and Lane 3 (body motion and camera,
 * consumer). Produced by CustomRallyVehicle.getSuspensionState(). Everything here is a PHYSICAL quantity read from
 * the Rapier rigid body and the raycast suspension; none of it is a visual offset.
 *
 * Wheel order everywhere: [FL, FR, RL, RR] (anchor x = -halfWidth for FL/RL, +halfWidth for FR/RR). Forward = +Z, up = +Y.
 *
 * Sign conventions (these are part of the contract and must not change without telling the other lanes):
 *   travel          metres, + = compression. Measured from that corner's spring-free length (suspensionRestLength for
 *                   the front axle, suspensionRestLengthRear for the rear). 0 = fully extended with no spring force,
 *                   negative = the wheel is hanging past that point (only possible with a droop stop beyond rest).
 *   travelVelocity  m/s, + = compressing.
 *   normalForce     N, the vertical tyre load used by the tyre model this substep. 0 when the wheel is airborne.
 *   grounded        true when the wheel ray found ground within reach of the droop stop.
 *   droopFromStatic metres the wheel hangs lower than it does at the static ride (+ = lower, - = pushed up into the body).
 *                   This is the physical droop Lane 3 should draw; it replaces the scripted lastVisualDroop.
 *   heave           metres, + = body higher than at the static ride (mean of droopFromStatic over the four wheels).
 *   pitchDeg        degrees, + = nose up. Physical chassis angle.
 *   rollDeg         degrees, asin of the chassis +X axis world Y. MEASURED: steer = +1 (right per the telemetry CSV) gives rollDeg < 0.
 *                   Only the sign pairing is guaranteed: rollDeg and lateralG always have the same sign.
 *   lateralG        smoothed. MEASURED: steer = +1 gives lateralG < 0 (the sign is the existing smoothedLateralG convention, unchanged).
 *   longitudinalG   smoothed, + = acceleration forward (braking is negative).
 *
 * Existing public/private fields (wheelNormalForces, currentSuspensionLengths, smoothedLateralG,
 * smoothedLongitudinalG, getTelemetry().suspensionLengths) keep their names and meanings.
 */
export interface WheelSuspensionState {
  travel: number;
  travelVelocity: number;
  normalForce: number;
  grounded: boolean;
  droopFromStatic: number;
}

export interface ChassisSuspensionState {
  heave: number;
  pitchDeg: number;
  rollDeg: number;
  lateralG: number;
  longitudinalG: number;
}

export interface SuspensionState {
  wheels: [WheelSuspensionState, WheelSuspensionState, WheelSuspensionState, WheelSuspensionState];
  chassis: ChassisSuspensionState;
  /** Static-ride wheel length (m) that droopFromStatic and heave are referenced to. */
  staticLength: number;
}

/** Wheel length (hub below anchor, m) at the settled static ride. Matches resetPosition() and the settled spawn pose. */
export const SUSPENSION_STATIC_LENGTH = 0.2593;
