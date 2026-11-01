import * as THREE from 'three';
import { RallyStageWorld, RoadSample } from '../world/RallyStageWorld';
import { CustomRallyVehicle } from '../vehicles/CustomRallyVehicle';

export type StageState = 'COUNTDOWN' | 'RACING' | 'FINISHED';

export interface GateData {
  index: number;
  u: number;
  distance: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  binormal: THREE.Vector3;
  passed: boolean;
  splitTimeS: number;
}

export interface PaceNote {
  code: string;           // e.g. "4 RIGHT", "HAIRPIN LEFT", "CREST", "FLAT"
  severity: number;       // 1 (hairpin) to 6 (gentle), 0 (flat/crest)
  direction: 'left' | 'right' | 'straight';
  isCrest: boolean;
  distanceAheadM: number;
}

export class StageManager {
  public group = new THREE.Group();
  public state: StageState = 'COUNTDOWN';
  public currentGateIndex: number = 0; // 0 to 19 (for 20 gates)
  public readonly totalGates: number = 20;
  public gates: GateData[] = [];

  // Stage Timers
  public stageTimeS: number = 0;
  public countdownTimerS: number = 3.0; // 3.. 2.. 1.. GO!
  public bestTimeS: number | null = null;
  public lastSplitPill: { text: string; timerS: number } | null = null;
  public totalDistanceDrivenM: number = 0;

  private prevCarPos = new THREE.Vector3();
  private gateGroup = new THREE.Group();

  constructor(
    private scene: THREE.Scene,
    private rallyWorld: RallyStageWorld,
    private vehicle: CustomRallyVehicle
  ) {
    this.loadBestTime();
    this.createGates();
    this.scene.add(this.group);
    this.group.add(this.gateGroup);
  }

  private loadBestTime(): void {
    try {
      const stored = localStorage.getItem('apex_dirt_best_time');
      if (stored) {
        this.bestTimeS = parseFloat(stored);
      }
    } catch {
      this.bestTimeS = null;
    }
  }

  private saveBestTime(timeS: number): void {
    try {
      if (this.bestTimeS === null || timeS < this.bestTimeS) {
        this.bestTimeS = timeS;
        localStorage.setItem('apex_dirt_best_time', timeS.toFixed(3));
      }
    } catch {
      // localStorage unavailable in some test runners
    }
  }

  /**
   * Generates 20 checkpoint gates with twin red-white striped posts along the spline
   */
  private createGates(): void {
    this.gates = [];
    const spline = this.rallyWorld.spline;
    const totalLength = this.rallyWorld.totalLength;

    // Distribute 20 gates evenly from u = 0.04 to u = 0.98
    for (let i = 0; i < this.totalGates; i++) {
      const u = 0.04 + (i / (this.totalGates - 1)) * 0.94;
      const pt = spline.getPointAt(u);
      const tangent = spline.getTangentAt(u).normalize();
      const binormal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();

      this.gates.push({
        index: i + 1,
        u,
        distance: u * totalLength,
        position: pt,
        tangent,
        binormal,
        passed: false,
        splitTimeS: 0,
      });

      // Twin red-white striped posts (width 0.4m, height 3.2m, spaced 8.8m apart)
      const postDistance = 4.4;
      this.createTwinStripedPosts(pt, binormal, tangent, postDistance, i + 1);
    }
  }

  private createTwinStripedPosts(
    center: THREE.Vector3,
    binormal: THREE.Vector3,
    tangent: THREE.Vector3,
    offset: number,
    gateNum: number
  ): void {
    const postHeight = 3.2;
    const postWidth = 0.38;
    const numStripes = 6;
    const stripeH = postHeight / numStripes;

    const redMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.5, flatShading: true });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, flatShading: true });

    const makeSinglePost = (side: 1 | -1) => {
      const postGroup = new THREE.Group();
      const px = center.x + binormal.x * (side * offset);
      const py = center.y;
      const pz = center.z + binormal.z * (side * offset);
      postGroup.position.set(px, py, pz);

      for (let s = 0; s < numStripes; s++) {
        const isRed = s % 2 === 0;
        const geom = new THREE.BoxGeometry(postWidth, stripeH, postWidth);
        const mesh = new THREE.Mesh(geom, isRed ? redMat : whiteMat);
        mesh.position.y = (s + 0.5) * stripeH;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        postGroup.add(mesh);
      }

      // Small gate number plaque
      const plaqueGeom = new THREE.BoxGeometry(0.5, 0.4, 0.05);
      const plaqueMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
      const plaque = new THREE.Mesh(plaqueGeom, plaqueMat);
      plaque.position.set(0, postHeight - 0.25, 0.2);
      plaque.rotation.y = Math.atan2(tangent.x, tangent.z);
      postGroup.add(plaque);

      this.gateGroup.add(postGroup);
    };

    makeSinglePost(1);
    makeSinglePost(-1);
  }

  /**
   * Main gameplay update loop (called at 60 Hz or per render frame)
   */
  public update(dt: number): void {
    if (!this.vehicle.chassisMesh) return;
    const carPos = this.vehicle.chassisMesh.position;

    // Track total odometer distance
    if (this.prevCarPos.lengthSq() > 0) {
      const stepDist = carPos.distanceTo(this.prevCarPos);
      if (stepDist < 10.0) {
        this.totalDistanceDrivenM += stepDist;
      }
    }
    this.prevCarPos.copy(carPos);

    // 1. Stage State Handling
    if (this.state === 'COUNTDOWN') {
      this.countdownTimerS -= dt;
      if (this.countdownTimerS <= 0) {
        this.state = 'RACING';
        this.countdownTimerS = 0;
        this.stageTimeS = 0;
      }
    } else if (this.state === 'RACING') {
      this.stageTimeS += dt;

      // Check current gate passage
      if (this.currentGateIndex < this.totalGates) {
        const gate = this.gates[this.currentGateIndex];
        const toCar = carPos.clone().sub(gate.position);
        const forwardDist = toCar.dot(gate.tangent);
        const lateralDist = Math.abs(toCar.dot(gate.binormal));

        // When car crosses the gate plane within the road corridor (<= 6.0m lateral)
        if (forwardDist >= 0 && lateralDist <= 6.5) {
          gate.passed = true;
          gate.splitTimeS = this.stageTimeS;

          // Trigger orange split-time pill
          const splitText = `+${this.formatTime(this.stageTimeS)}`;
          this.lastSplitPill = { text: splitText, timerS: 1.1 };

          this.currentGateIndex++;

          // Final gate reached: Finish stage!
          if (this.currentGateIndex >= this.totalGates) {
            this.state = 'FINISHED';
            this.saveBestTime(this.stageTimeS);
          }
        }
      }
    }

    // Split pill countdown
    if (this.lastSplitPill) {
      this.lastSplitPill.timerS -= dt;
      if (this.lastSplitPill.timerS <= 0) {
        this.lastSplitPill = null;
      }
    }
  }

  /**
   * Reset / Restart stage
   */
  public restart(): void {
    this.state = 'COUNTDOWN';
    this.countdownTimerS = 3.0;
    this.stageTimeS = 0;
    this.currentGateIndex = 0;
    this.lastSplitPill = null;
    this.gates.forEach(g => {
      g.passed = false;
      g.splitTimeS = 0;
    });

    // Reset car at start line
    this.vehicle.resetPosition();
    const splineStart = this.rallyWorld.spline.getPointAt(0.01);
    const startTang = this.rallyWorld.spline.getTangentAt(0.01).normalize();
    const angleY = Math.atan2(startTang.x, startTang.z);

    this.vehicle.chassisBody.setTranslation({ x: splineStart.x, y: splineStart.y + 0.65, z: splineStart.z }, true);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleY);
    this.vehicle.chassisBody.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.vehicle.chassisBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /**
   * Evaluates pace notes from spline curvature 60 to 100 meters ahead
   */
  public getPaceNoteAhead(): PaceNote {
    if (!this.vehicle.chassisMesh) {
      return { code: 'FLAT', severity: 6, direction: 'straight', isCrest: false, distanceAheadM: 80 };
    }

    const carPos = this.vehicle.chassisMesh.position;
    const spline = this.rallyWorld.spline;

    // Approximate car's current progress u along spline
    // Sample nearest sample point
    let bestU = 0;
    let minDistSq = Infinity;
    for (let k = 0; k < 100; k++) {
      const u = k / 100;
      const pt = spline.getPointAt(u);
      const dSq = carPos.distanceToSquared(pt);
      if (dSq < minDistSq) {
        minDistSq = dSq;
        bestU = u;
      }
    }

    // Look 80m ahead (80 / totalLength)
    const uAhead = (bestU + 80.0 / this.rallyWorld.totalLength) % 1.0;
    const uPrev = (uAhead - 0.01 + 1.0) % 1.0;
    const uNext = (uAhead + 0.01) % 1.0;

    const ptAhead = spline.getPointAt(uAhead);
    const ptPrev = spline.getPointAt(uPrev);
    const ptNext = spline.getPointAt(uNext);

    const v1 = ptAhead.clone().sub(ptPrev).normalize();
    const v2 = ptNext.clone().sub(ptAhead).normalize();

    // 2D horizontal cross product gives turn direction & curvature
    const crossY = v1.x * v2.z - v1.z * v2.x;
    const elevationDelta = ptAhead.y - carPos.y;
    const isCrest = elevationDelta > 3.0;

    const absCurvature = Math.abs(crossY) * 50.0;
    const isLeft = crossY < -0.005;
    const isRight = crossY > 0.005;

    let severity = 6;
    let code = 'FLAT';
    let dir: 'left' | 'right' | 'straight' = 'straight';

    if (isLeft) {
      dir = 'left';
      if (absCurvature > 0.85) { severity = 1; code = 'HAIRPIN LEFT'; }
      else if (absCurvature > 0.60) { severity = 2; code = '2 LEFT'; }
      else if (absCurvature > 0.40) { severity = 3; code = '3 LEFT'; }
      else if (absCurvature > 0.22) { severity = 4; code = '4 LEFT'; }
      else if (absCurvature > 0.10) { severity = 5; code = '5 LEFT'; }
      else { severity = 6; code = '6 LEFT'; }
    } else if (isRight) {
      dir = 'right';
      if (absCurvature > 0.85) { severity = 1; code = 'HAIRPIN RIGHT'; }
      else if (absCurvature > 0.60) { severity = 2; code = '2 RIGHT'; }
      else if (absCurvature > 0.40) { severity = 3; code = '3 RIGHT'; }
      else if (absCurvature > 0.22) { severity = 4; code = '4 RIGHT'; }
      else if (absCurvature > 0.10) { severity = 5; code = '5 RIGHT'; }
      else { severity = 6; code = '6 RIGHT'; }
    } else {
      if (isCrest) {
        code = 'CREST';
      } else {
        code = 'FLAT OUT';
      }
    }

    return {
      code,
      severity,
      direction: dir,
      isCrest,
      distanceAheadM: 80,
    };
  }

  public formatTime(timeS: number): string {
    const mins = Math.floor(timeS / 60);
    const secs = Math.floor(timeS % 60);
    const ms = Math.floor((timeS % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
}
