import * as THREE from 'three';
import { RallyStageWorld } from './RallyStageWorld';

interface AnimalCrossing {
  group: THREE.Group;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  currentPos: THREE.Vector3;
  facingAngle: number;
  roadDistance: number;
  state: 'IDLE' | 'ALERT' | 'CROSSING' | 'ESCAPED';
  crossProgress: number;
  crossDuration: number;
  legMeshes: THREE.Mesh[];
  neckGroup: THREE.Group;
}

/**
 * WildlifeCrossingManager
 * Controls interactive forest wildlife (low-poly stags/deer) that leap and
 * sprint across the rally stage as the player's car approaches within 50 - 75m.
 */
export class WildlifeCrossingManager {
  public group = new THREE.Group();
  private animals: AnimalCrossing[] = [];

  constructor(private scene: THREE.Scene, private rallyWorld: RallyStageWorld) {
    this.buildWildlifeCrossings();
    this.scene.add(this.group);
  }

  private buildWildlifeCrossings(): void {
    // 3 strategic forest locations along the 1.6+ km stage
    const crossingDistances = [450, 960, 1380];

    for (let i = 0; i < crossingDistances.length; i++) {
      const dist = crossingDistances[i];
      const u = dist / this.rallyWorld.totalLength;

      const pt = this.rallyWorld.spline.getPointAt(u);
      const tang = this.rallyWorld.spline.getTangentAt(u).normalize();
      const binormal = new THREE.Vector3().crossVectors(tang, new THREE.Vector3(0, 1, 0)).normalize();

      // Start on left verge, cross to right verge (or vice versa)
      const startSide = i % 2 === 0 ? 1 : -1;
      const startDist = 9.5 * startSide;
      const targetDist = -12.0 * startSide;

      const startPos = new THREE.Vector3(
        pt.x + binormal.x * startDist,
        pt.y + 0.1,
        pt.z + binormal.z * startDist
      );

      const targetPos = new THREE.Vector3(
        pt.x + binormal.x * targetDist,
        pt.y + 0.1,
        pt.z + binormal.z * targetDist
      );

      const facingDir = targetPos.clone().sub(startPos).normalize();
      const facingAngle = Math.atan2(facingDir.x, facingDir.z);

      const { animalGroup, legMeshes, neckGroup } = this.createDeerModel();
      animalGroup.position.copy(startPos);
      animalGroup.rotation.y = facingAngle;
      this.group.add(animalGroup);

      this.animals.push({
        group: animalGroup,
        startPos,
        targetPos,
        currentPos: startPos.clone(),
        facingAngle,
        roadDistance: dist,
        state: 'IDLE',
        crossProgress: 0,
        crossDuration: 2.2, // ~2.2 seconds to leap across 20m corridor
        legMeshes,
        neckGroup,
      });
    }
  }

  private createDeerModel(): { animalGroup: THREE.Group; legMeshes: THREE.Mesh[]; neckGroup: THREE.Group } {
    const deerGroup = new THREE.Group();
    const coatMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b, // Chestnut brown stag coat
      roughness: 0.85,
      flatShading: true,
    });
    const underbellyMat = new THREE.MeshStandardMaterial({
      color: 0xd4b895, // Pale tan underbelly
      roughness: 0.9,
      flatShading: true,
    });
    const antlerMat = new THREE.MeshStandardMaterial({
      color: 0x4a3728, // Dark antler horn
      roughness: 0.7,
      flatShading: true,
    });

    // 1. Torso body
    const bodyGeom = new THREE.BoxGeometry(0.38, 0.48, 0.95);
    const body = new THREE.Mesh(bodyGeom, coatMat);
    body.position.set(0, 0.95, 0);
    body.castShadow = true;
    deerGroup.add(body);

    const bellyGeom = new THREE.BoxGeometry(0.32, 0.22, 0.80);
    const belly = new THREE.Mesh(bellyGeom, underbellyMat);
    belly.position.set(0, 0.80, 0);
    deerGroup.add(belly);

    // 2. Neck and Head Assembly
    const neckGroup = new THREE.Group();
    neckGroup.position.set(0, 1.15, 0.40);

    const neckGeom = new THREE.CylinderGeometry(0.12, 0.18, 0.45, 6);
    neckGeom.rotateX(-0.5);
    const neck = new THREE.Mesh(neckGeom, coatMat);
    neck.position.set(0, 0.18, 0.08);
    neckGroup.add(neck);

    const headGeom = new THREE.ConeGeometry(0.14, 0.38, 6);
    headGeom.rotateX(Math.PI / 2);
    const head = new THREE.Mesh(headGeom, coatMat);
    head.position.set(0, 0.35, 0.22);
    neckGroup.add(head);

    // Ears
    for (const ex of [-0.12, 0.12]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), coatMat);
      ear.position.set(ex, 0.44, 0.14);
      ear.rotation.z = ex > 0 ? -0.4 : 0.4;
      neckGroup.add(ear);
    }

    // Antlers (Majestic 6-point stag rack)
    for (const ax of [-0.09, 0.09]) {
      const mainBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.52, 5), antlerMat);
      mainBeam.position.set(ax, 0.58, 0.14);
      mainBeam.rotation.z = ax > 0 ? -0.35 : 0.35;
      mainBeam.rotation.x = -0.25;
      neckGroup.add(mainBeam);

      const tine1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.22, 4), antlerMat);
      tine1.position.set(ax * 1.5, 0.64, 0.18);
      tine1.rotation.z = ax > 0 ? 0.3 : -0.3;
      neckGroup.add(tine1);
    }
    deerGroup.add(neckGroup);

    // 3. Legs (4 slender limbs)
    const legGeom = new THREE.CylinderGeometry(0.045, 0.035, 0.85, 6);
    legGeom.translate(0, -0.42, 0);

    const legPositions = [
      [-0.14, 0.85, 0.34],  // Front Left
      [0.14, 0.85, 0.34],   // Front Right
      [-0.14, 0.85, -0.34], // Rear Left
      [0.14, 0.85, -0.34],  // Rear Right
    ];

    const legMeshes: THREE.Mesh[] = [];
    for (const lp of legPositions) {
      const leg = new THREE.Mesh(legGeom, coatMat);
      leg.position.set(lp[0], lp[1], lp[2]);
      leg.castShadow = true;
      deerGroup.add(leg);
      legMeshes.push(leg);
    }

    return { animalGroup: deerGroup, legMeshes, neckGroup };
  }

  public update(dt: number, carPosition: THREE.Vector3): void {
    for (const animal of this.animals) {
      const distToCar = animal.currentPos.distanceTo(carPosition);

      // Trigger detection: Car within 65m
      if (animal.state === 'IDLE' || animal.state === 'ALERT') {
        if (distToCar < 70) {
          animal.state = 'CROSSING';
        } else if (distToCar < 110) {
          animal.state = 'ALERT';
          // Head perks up
          animal.neckGroup.rotation.x = 0.25;
        } else {
          // Gentle grazing head bob
          animal.neckGroup.rotation.x = Math.sin(performance.now() * 0.002) * 0.15 - 0.2;
        }
      }

      if (animal.state === 'CROSSING') {
        animal.crossProgress += dt / animal.crossDuration;

        if (animal.crossProgress >= 1.0) {
          animal.crossProgress = 1.0;
          animal.state = 'ESCAPED';
        }

        const p = animal.crossProgress;
        animal.currentPos.lerpVectors(animal.startPos, animal.targetPos, p);

        // Bounding leap trajectory: arching parabola over road crown
        const leapHeight = Math.sin(p * Math.PI) * 1.1 + Math.sin(p * Math.PI * 3) * 0.25;
        animal.group.position.set(
          animal.currentPos.x,
          animal.currentPos.y + Math.max(0, leapHeight),
          animal.currentPos.z
        );

        // Gallop leg animation cycle
        const runCycle = p * 25.0; // Fast gallop strides
        if (animal.legMeshes.length === 4) {
          animal.legMeshes[0].rotation.x = Math.sin(runCycle) * 0.75;
          animal.legMeshes[1].rotation.x = Math.sin(runCycle + Math.PI) * 0.75;
          animal.legMeshes[2].rotation.x = Math.sin(runCycle + Math.PI * 0.5) * 0.85;
          animal.legMeshes[3].rotation.x = Math.sin(runCycle + Math.PI * 1.5) * 0.85;
        }

        // Forward leaping neck tilt
        animal.neckGroup.rotation.x = -0.35 + Math.sin(runCycle) * 0.2;
      }
    }
  }

  public reset(): void {
    for (const animal of this.animals) {
      animal.state = 'IDLE';
      animal.crossProgress = 0;
      animal.currentPos.copy(animal.startPos);
      animal.group.position.copy(animal.startPos);
      animal.group.rotation.y = animal.facingAngle;
      for (const leg of animal.legMeshes) {
        leg.rotation.x = 0;
      }
    }
  }
}
