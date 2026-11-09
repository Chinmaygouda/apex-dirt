import * as THREE from 'three';
import { WildlifeAssetFactory } from '../assets/WildlifeAssetFactory';
import { WildlifeEntity, WildlifeState } from '../types/rally';
import { RallyStageWorld } from './RallyStageWorld';
import * as BP from './BlueprintStageGeometry';

export class WildlifeCrossingManager {
  public scene: THREE.Scene;
  public worldEngine: RallyStageWorld;
  public entities: WildlifeEntity[] = [];

  // Co-driver warning callback
  public onWarning?: (message: string) => void;
  private hasWarnedRecently = false;
  private warningCooldown = 0;

  constructor(scene: THREE.Scene, worldEngine: RallyStageWorld) {
    this.scene = scene;
    this.worldEngine = worldEngine;
  }

  public init(): void {
    this.entities = [];
    BP.herds.forEach((h, herdIdx) => {
      const pRoad = BP.at(BP.stage, h.s);
      h.animals.forEach((a, aIdx) => {
        const id = `${h.kind}_h${herdIdx}_${aIdx}`;
        const y = this.worldEngine.getTerrainHeight(a.x, a.z);
        const pos = new THREE.Vector3(a.x, y, a.z);
        const entity = h.kind === 'cow'
          ? WildlifeAssetFactory.createCow(id, pos)
          : WildlifeAssetFactory.createDeer(id, pos);

        // Target position across to the opposite verge
        const targetX = pRoad.x - pRoad.nx * h.side * 40;
        const targetZ = pRoad.z - pRoad.nz * h.side * 40;
        const targetY = this.worldEngine.getTerrainHeight(targetX, targetZ);
        entity.targetPosition = new THREE.Vector3(targetX, targetY, targetZ);

        this.entities.push(entity);
        this.scene.add(entity.mesh);
      });
    });
  }

  /**
   * Main per-frame update loop driven by vehicle position and time delta
   */
  public update(deltaTime: number, time: number, carPosition: THREE.Vector3): void {
    // Warning cooldown timer
    if (this.warningCooldown > 0) {
      this.warningCooldown -= deltaTime;
    } else {
      this.hasWarnedRecently = false;
    }

    for (const entity of this.entities) {
      this.updateEntityState(entity, carPosition, deltaTime);
      this.animateEntity(entity, time, deltaTime);
    }
  }

  /**
   * Evaluates proximity transitions between GRAZING, ALERT, CROSSING, and SAFE
   */
  private updateEntityState(entity: WildlifeEntity, carPos: THREE.Vector3, deltaTime: number): void {
    const distToCar = entity.mesh.position.distanceTo(carPos);

    switch (entity.state) {
      case 'GRAZING': {
        // Car approaches within 70m -> ALERT
        if (distToCar < 70.0) {
          entity.state = 'ALERT';
          entity.stateTimer = 0;
          if (!this.hasWarnedRecently && this.onWarning) {
            this.onWarning(entity.type === 'cow' ? 'Caution! Livestock on track verge!' : 'Careful! Mountain deer ahead!');
            this.hasWarnedRecently = true;
            this.warningCooldown = 15.0; // 15s debounce
          }
        }
        break;
      }

      case 'ALERT': {
        entity.stateTimer += deltaTime;

        // If car is very close (< 35m) -> trigger PANIC / CROSSING
        if (distToCar < 35.0) {
          entity.state = 'CROSSING';
          entity.stateTimer = 0;
        } else if (distToCar > 90.0) {
          // Car backed away or stopped -> back to GRAZING
          entity.state = 'GRAZING';
        }
        break;
      }

      case 'CROSSING': {
        // Sprint towards target across track
        const target = entity.targetPosition;
        const toTarget = new THREE.Vector3().subVectors(target, entity.mesh.position);
        toTarget.y = 0;
        const distToTarget = toTarget.length();

        const speed = entity.type === 'deer' ? 9.5 : 4.2; // m/s sprint speed

        if (distToTarget > 0.8) {
          toTarget.normalize();
          entity.velocity.copy(toTarget).multiplyScalar(speed);
          entity.mesh.position.addScaledVector(entity.velocity, deltaTime);

          // Update terrain ground height
          entity.mesh.position.y = this.worldEngine.getTerrainHeight(entity.mesh.position.x, entity.mesh.position.z);

          // Face movement direction
          const targetAngle = Math.atan2(toTarget.x, toTarget.z);
          entity.mesh.rotation.y = THREE.MathUtils.lerp(entity.mesh.rotation.y, targetAngle, deltaTime * 8.0);
        } else {
          // Reached opposite verge safely
          entity.state = 'SAFE';
          entity.stateTimer = 0;
        }
        break;
      }

      case 'SAFE': {
        entity.stateTimer += deltaTime;

        // Trot toward deep forest cover
        const retreatTarget = entity.targetPosition.clone().add(new THREE.Vector3(15, 0, 15));
        const toCover = new THREE.Vector3().subVectors(retreatTarget, entity.mesh.position);
        toCover.y = 0;
        if (toCover.length() > 0.5) {
          toCover.normalize();
          entity.mesh.position.addScaledVector(toCover, (entity.type === 'deer' ? 4.0 : 1.8) * deltaTime);
          entity.mesh.position.y = this.worldEngine.getTerrainHeight(entity.mesh.position.x, entity.mesh.position.z);
        }

        // Once car passes and distance > 45m, calm down and reset to GRAZING
        if (distToCar > 45.0 && entity.stateTimer > 4.0) {
          entity.state = 'GRAZING';
          entity.homePosition.copy(entity.mesh.position);
        }
        break;
      }
    }
  }

  /**
   * Animates articulated 3D mesh limbs, head, and ears based on active state
   */
  private animateEntity(entity: WildlifeEntity, time: number, deltaTime: number): void {
    const { headPivot, leftEar, rightEar, tailPivot, legs } = entity;

    if (entity.state === 'GRAZING') {
      // Gentle idle head bobbing
      if (headPivot) {
        headPivot.rotation.x = Math.sin(time * 1.8) * 0.12 + 0.15;
        headPivot.rotation.y = Math.sin(time * 0.8) * 0.08;
      }
      // Tail swish
      if (tailPivot) {
        tailPivot.rotation.z = Math.cos(time * 3.2) * 0.35;
      }
      // Stances resting
      for (const leg of legs) {
        leg.rotation.x = 0;
      }
    } else if (entity.state === 'ALERT') {
      // Head snaps up and tenses
      if (headPivot) {
        headPivot.rotation.x = -0.25; // Snapped alert posture
        headPivot.rotation.y = Math.sin(time * 1.5) * 0.18;
      }
      // High-frequency ear twitches (12 Hz jitter)
      if (leftEar && rightEar) {
        const earJitter = Math.sin(time * 24.0) * 0.25;
        leftEar.rotation.z = earJitter;
        rightEar.rotation.z = -earJitter;
      }
      for (const leg of legs) {
        leg.rotation.x = 0;
      }
    } else if (entity.state === 'CROSSING' || entity.state === 'SAFE') {
      // 4-Phase Running Gait (trot / gallop)
      const runFreq = entity.type === 'deer' ? 14.0 : 8.0;
      const legAmplitude = entity.type === 'deer' ? 0.75 : 0.45;

      const legFL = legs[0];
      const legFR = legs[1];
      const legRL = legs[2];
      const legRR = legs[3];

      const gaitPhase = time * runFreq;
      legFL.rotation.x = Math.sin(gaitPhase) * legAmplitude;
      legFR.rotation.x = Math.sin(gaitPhase + Math.PI) * legAmplitude;
      legRL.rotation.x = Math.sin(gaitPhase + Math.PI) * legAmplitude;
      legRR.rotation.x = Math.sin(gaitPhase) * legAmplitude;

      if (headPivot) {
        headPivot.rotation.x = Math.sin(gaitPhase) * 0.12 - 0.1;
      }
    }
  }
}

