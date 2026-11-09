import * as THREE from 'three';
import { VehicleTelemetry, SurfaceProperties } from '../types/rally';
import { RallyStageWorld } from '../world/RallyStageWorld';
import { StagePropsManager } from '../world/StagePropsManager';
import { WildlifeCrossingManager } from '../world/WildlifeCrossingManager';
import { EnvironmentVFX } from '../effects/EnvironmentVFX';
import { StageTimingController } from '../gameplay/StageTimingController';

/**
 * Standard interface that the external 1980s Group B CustomRallyVehicle project
 * implements for plug-and-play integration.
 */
export interface ICustomRallyVehicle {
  getChassisMesh(): THREE.Object3D;
  getWorldPosition(): THREE.Vector3;
  getLinearVelocity(): THREE.Vector3;
  getForwardVector(): THREE.Vector3;
  getUpVector(): THREE.Vector3;
  getSpeedKmh(): number;
  getLateralScrubSpeed(): number;
  getLongitudinalSlip(): number;
  getEngineRpm(): number;
  getThrottleInput(): number;
  getBrakeInput(): number;
  isHardDecelerating(): boolean;
  getWheelContactPoints(): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  getWheelGroundedStates(): [boolean, boolean, boolean, boolean];
  applyGroundFriction(frictionCoeff: number, rollingResistance: number): void;
}

/**
 * CustomRallyVehicleAdapter connects an external CustomRallyVehicle instance
 * seamlessly to the RallyStageWorld, StagePropsManager, WildlifeCrossingManager,
 * EnvironmentVFX, and StageTimingController.
 */
export class CustomRallyVehicleAdapter {
  public worldEngine: RallyStageWorld;
  public propsManager: StagePropsManager;
  public wildlifeManager: WildlifeCrossingManager;
  public vfxEngine: EnvironmentVFX;
  public timingController: StageTimingController;

  private vehicle: ICustomRallyVehicle | null = null;

  constructor(
    worldEngine: RallyStageWorld,
    propsManager: StagePropsManager,
    wildlifeManager: WildlifeCrossingManager,
    vfxEngine: EnvironmentVFX,
    timingController: StageTimingController
  ) {
    this.worldEngine = worldEngine;
    this.propsManager = propsManager;
    this.wildlifeManager = wildlifeManager;
    this.vfxEngine = vfxEngine;
    this.timingController = timingController;
  }

  /**
   * Mounts the external Group B CustomRallyVehicle into the rally stage
   */
  public mountVehicle(vehicle: ICustomRallyVehicle): void {
    this.vehicle = vehicle;
    const chassis = vehicle.getChassisMesh();
    this.worldEngine.scene.add(chassis);
  }

  /**
   * Main per-frame integration step
   */
  public update(deltaTime: number, elapsedTime: number): VehicleTelemetry | null {
    if (!this.vehicle) return null;

    const pos = this.vehicle.getWorldPosition();
    const vel = this.vehicle.getLinearVelocity();
    const fwd = this.vehicle.getForwardVector();
    const up = this.vehicle.getUpVector();
    const speed = this.vehicle.getSpeedKmh();
    const latSpeed = this.vehicle.getLateralScrubSpeed();
    const slip = this.vehicle.getLongitudinalSlip();
    const rpm = this.vehicle.getEngineRpm();
    const throttle = this.vehicle.getThrottleInput();
    const brake = this.vehicle.getBrakeInput();
    const isHardDecel = this.vehicle.isHardDecelerating();
    const wheels = this.vehicle.getWheelContactPoints();
    const grounded = this.vehicle.getWheelGroundedStates();

    // 1. Query track surface properties at car position
    const surface: SurfaceProperties = this.worldEngine.getSurfaceAt(pos.x, pos.z);

    // 2. Feed physics friction & rolling resistance back to vehicle dynamics
    this.vehicle.applyGroundFriction(surface.friction, surface.rollingResistance);

    // 3. Construct unified telemetry packet
    const telemetry: VehicleTelemetry = {
      position: pos,
      velocity: vel,
      forward: fwd,
      up,
      speedKmh: speed,
      lateralSpeed: latSpeed,
      longitudinalSlip: slip,
      engineRpm: rpm,
      throttle,
      brake,
      isDeceleratingHard: isHardDecel,
      wheelPositions: wheels,
      wheelGrounded: grounded,
      currentSurface: surface
    };

    // 4. Update Particle Systems directly from vehicle telemetry
    this.vfxEngine.update(deltaTime, telemetry);

    // 5. Check breakable fence/wall impact impulses
    this.propsManager.checkBreakableImpacts(pos, vel);

    // 6. Update Wildlife AI alertness and crossing reactions
    this.wildlifeManager.update(deltaTime, elapsedTime, pos);

    // 7. Update Split timing and checkpoint triggers
    this.timingController.update(deltaTime, pos);

    return telemetry;
  }
}

