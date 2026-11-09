import * as THREE from 'three';
import { LapData, SectorTiming } from '../types/rally';
import { RallyStageWorld } from '../world/RallyStageWorld';

export interface StageCheckpoint {
  index: number;
  distance: number;
  position: THREE.Vector3;
  passed: boolean;
  sectorTime: number;
  note: string;
}

export class StageTimingController {
  public worldEngine: RallyStageWorld;

  // Race State
  public isRacing = false;
  public stageTime = 0;
  public currentSector = 0;
  public currentLap = 1;
  public totalLaps = 3;
  public tookJokerThisHeat = false;

  // Special Stage Checkpoints (2.4 km)
  public specialStageCheckpoints: StageCheckpoint[] = [];

  // Lap Records
  public currentLapTime = 0;
  public bestLapTime = Infinity;
  public completedLaps: LapData[] = [];

  // Pace Note Callbacks
  public onPaceNote?: (note: string) => void;
  public onTimingUpdate?: (status: {
    stageTime: number;
    lapTime: number;
    lap: number;
    sector: number;
    delta: number;
    jokerStatus: string;
  }) => void;
  public onStageFinish?: (totalTime: number, results: LapData[]) => void;

  private lastDistance = 0;
  private paceNoteQueue: Array<{ distance: number; note: string; called: boolean }> = [];

  constructor(worldEngine: RallyStageWorld) {
    this.worldEngine = worldEngine;
  }

  public init(circuitMode: 'special_stage' | 'rallycross'): void {
    this.stageTime = 0;
    this.currentLapTime = 0;
    this.currentLap = 1;
    this.currentSector = 0;
    this.tookJokerThisHeat = false;
    this.completedLaps = [];
    this.isRacing = true;

    if (circuitMode === 'special_stage') {
      this.initSpecialStagePaceNotes();
    } else {
      this.initRallycrossCheckpoints();
    }
  }

  private initSpecialStagePaceNotes(): void {
    this.specialStageCheckpoints = [
      { index: 0, distance: 0, position: new THREE.Vector3(-488, 47, 453), passed: false, sectorTime: 0, note: 'Start Gantry' },
      { index: 1, distance: 600, position: new THREE.Vector3(-190, 42, 330), passed: false, sectorTime: 0, note: 'Split 1 (Asphalt to Gravel)' },
      { index: 2, distance: 1800, position: new THREE.Vector3(-240, 95, -100), passed: false, sectorTime: 0, note: 'Split 2 (Gravel to Mountain Scree)' },
      { index: 3, distance: 2400, position: new THREE.Vector3(308, 49, -363), passed: false, sectorTime: 0, note: 'Finish Timing Gate' }
    ];

    this.paceNoteQueue = [
      { distance: 20, note: 'Ready... GO! 100 flat right into medium left', called: false },
      { distance: 420, note: 'Caution! Hairpin 1 Right 180 uphill, banking positive 8 degrees', called: false },
      { distance: 580, note: 'Surface change: Packed Gravel, grip dropping', called: false },
      { distance: 800, note: 'Hairpin 2 Left cliffside, watch the drop!', called: false },
      { distance: 1120, note: 'Wildlife hazard area: Watch for mountain deer!', called: false },
      { distance: 1250, note: 'Hairpin 3 Right, Pino Solitario!', called: false },
      { distance: 1300, note: 'Farm cluster: stone cottage and barn on right verge', called: false },
      { distance: 1480, note: 'Narrow stone bridge river crossing ahead!', called: false },
      { distance: 1650, note: 'Hairpin 4 Torrente Secco, banking positive', called: false },
      { distance: 1780, note: 'Surface change: Bedrock and scree, loose over hard', called: false },
      { distance: 2100, note: 'Jump 2! Cresta del Diavolo, flat out to finish!', called: false },
      { distance: 2380, note: 'Flying finish! Hard braking past timing gate!', called: false }
    ];
  }

  private initRallycrossCheckpoints(): void {
    this.paceNoteQueue = [
      { distance: 30, note: 'GREEN LIGHT! Launch straight into Turn 1 gravel', called: false },
      { distance: 280, note: 'Tabletop spectator jump ahead in 40 meters!', called: false },
      { distance: 680, note: 'Joker Lap decision point coming up! Standard inside or Joker wide?', called: false },
      { distance: 1180, note: 'Finish line crossing! Lap complete', called: false }
    ];
  }

  /**
   * Main per-frame timing update loop
   */
  public update(deltaTime: number, carPosition: THREE.Vector3): void {
    if (!this.isRacing) return;

    this.stageTime += deltaTime;
    this.currentLapTime += deltaTime;

    // Project car onto track spline
    const proj = this.worldEngine.getSplineProjection(carPosition);
    const dist = proj.distance;

    // Check Pace Notes
    for (const pn of this.paceNoteQueue) {
      if (!pn.called && dist >= pn.distance) {
        pn.called = true;
        if (this.onPaceNote) {
          this.onPaceNote(pn.note);
        }
      }
    }

    // Check Special Stage Splits
    for (let i = 0; i < this.specialStageCheckpoints.length; i++) {
      const cp = this.specialStageCheckpoints[i];
      if (!cp.passed && dist >= cp.distance) {
        cp.passed = true;
        cp.sectorTime = this.stageTime;
        this.currentSector = i;

        // Finish detection
        if (i === this.specialStageCheckpoints.length - 1) {
          this.isRacing = false;
          if (this.onStageFinish) {
            this.onStageFinish(this.stageTime, this.completedLaps);
          }
        }
      }
    }

    // Check Joker lap route proximity
    const jokerBranchPos = new THREE.Vector3(-190, 21, 100);
    if (!this.tookJokerThisHeat && carPosition.distanceTo(jokerBranchPos) < 18.0) {
      this.tookJokerThisHeat = true;
      if (this.onPaceNote) {
        this.onPaceNote('Joker Lap Taken! +2.8s penalty sector');
      }
    }

    // Report HUD timing telemetry
    if (this.onTimingUpdate) {
      this.onTimingUpdate({
        stageTime: this.stageTime,
        lapTime: this.currentLapTime,
        lap: this.currentLap,
        sector: this.currentSector + 1,
        delta: this.stageTime - (this.currentSector * 45.0),
        jokerStatus: this.tookJokerThisHeat ? 'COMPLETED' : 'REQUIRED'
      });
    }

    this.lastDistance = dist;
  }

  /**
   * Completes a lap in Rallycross mode
   */
  public completeLap(): void {
    const lapData: LapData = {
      lapNumber: this.currentLap,
      lapTime: this.currentLapTime,
      sectors: [this.currentLapTime * 0.4, this.currentLapTime * 0.6],
      tookJokerLap: this.tookJokerThisHeat,
      isValid: true
    };

    this.completedLaps.push(lapData);
    if (this.currentLapTime < this.bestLapTime) {
      this.bestLapTime = this.currentLapTime;
    }

    if (this.currentLap >= this.totalLaps) {
      this.isRacing = false;
      if (this.onStageFinish) {
        this.onStageFinish(this.stageTime, this.completedLaps);
      }
    } else {
      this.currentLap++;
      this.currentLapTime = 0;
      // Reset pace notes for next lap
      for (const pn of this.paceNoteQueue) {
        pn.called = false;
      }
    }
  }
}

