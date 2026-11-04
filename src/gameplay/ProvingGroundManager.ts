import * as THREE from 'three';
import { CustomRallyVehicle } from '../vehicles/CustomRallyVehicle';
import { StageState, PaceNote, GateData } from './StageManager';

/**
 * ProvingGroundManager:
 * Dedicated vehicle dynamics test session manager.
 * Tracks elapsed test time, distance driven in meters/miles,
 * 0-60 mph acceleration timing, and 60-0 mph braking distance.
 * Zero 3D obstacle gates spawned in the scene.
 */
export class ProvingGroundManager {
  public group = new THREE.Group();
  public state: StageState = 'RACING';
  public currentGateIndex: number = 0;
  public readonly totalGates: number = 0;
  public gates: GateData[] = [];

  public stageTimeS: number = 0;
  public countdownTimerS: number = 0;
  public bestTimeS: number | null = null;
  public lastSplitPill: { text: string; timerS: number } | null = null;
  public totalDistanceDrivenM: number = 0;

  // Vehicle dynamics metrics
  public zeroToSixtyTimeS: number | null = null;
  public brakingDistance60to0M: number | null = null;

  private isAccelTiming = false;
  private accelStartTime = 0;
  private isBrakingTiming = false;
  private brakeStartDist = 0;
  private prevCarPos = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private vehicle: CustomRallyVehicle
  ) {
    this.scene.add(this.group);
  }

  public formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  public getPaceNoteAhead(): PaceNote {
    return {
      code: '',
      severity: 0,
      direction: 'straight',
      isCrest: false,
      distanceAheadM: 999,
    };
  }

  public update(dt: number): void {
    this.stageTimeS += dt;

    if (this.vehicle.chassisMesh && this.vehicle.chassisBody) {
      const pos = this.vehicle.chassisMesh.position;
      if (this.prevCarPos.lengthSq() === 0) {
        this.prevCarPos.copy(pos);
      } else {
        const delta = this.prevCarPos.distanceTo(pos);
        this.totalDistanceDrivenM += delta;
        this.prevCarPos.copy(pos);
      }

      const linvel = this.vehicle.chassisBody.linvel();
      const speedMph = Math.hypot(linvel.x, linvel.y, linvel.z) * 2.23694;

      // 0-60 MPH Acceleration Timer
      if (speedMph < 1.0) {
        this.isAccelTiming = false;
      } else if (!this.isAccelTiming && speedMph >= 1.0 && speedMph < 12.0) {
        this.isAccelTiming = true;
        this.accelStartTime = this.stageTimeS;
      } else if (this.isAccelTiming && speedMph >= 60.0) {
        this.zeroToSixtyTimeS = this.stageTimeS - this.accelStartTime;
        this.isAccelTiming = false;
      }

      // 60-0 MPH Braking Distance Tracker
      if (speedMph >= 58.0) {
        this.isBrakingTiming = true;
        this.brakeStartDist = this.totalDistanceDrivenM;
      } else if (this.isBrakingTiming && speedMph <= 1.0) {
        this.brakingDistance60to0M = this.totalDistanceDrivenM - this.brakeStartDist;
        this.isBrakingTiming = false;
      }
    }
  }

  public restart(): void {
    this.stageTimeS = 0;
    this.totalDistanceDrivenM = 0;
    this.zeroToSixtyTimeS = null;
    this.brakingDistance60to0M = null;
    this.isAccelTiming = false;
    this.isBrakingTiming = false;
    this.prevCarPos.set(0, 0, 0);
    this.vehicle.resetPosition();
  }
}
