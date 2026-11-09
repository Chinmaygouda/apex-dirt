import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PropAssetFactory } from '../assets/PropAssetFactory';
import { RallyStageWorld } from './RallyStageWorld';
import * as BP from './BlueprintStageGeometry';

export interface BreakableProp {
  id: string;
  type: 'fence' | 'stone_wall';
  group: THREE.Group;
  pieces: Array<{
    mesh: THREE.Mesh;
    rigidBody?: RAPIER.RigidBody;
    collider?: RAPIER.Collider;
    initialPos: THREE.Vector3;
    initialRot: THREE.Euler;
  }>;
  isBroken: boolean;
  breakThreshold: number; // Impulse in N*s
  bounds: THREE.Box3;
}

export class StagePropsManager {
  public scene: THREE.Scene;
  public rapierWorld: RAPIER.World;
  public worldEngine: RallyStageWorld;

  // Instanced Meshes for GPU rendering
  public cypressInstancedMesh!: THREE.InstancedMesh;
  public pineInstancedMesh!: THREE.InstancedMesh;
  public scrubInstancedMesh!: THREE.InstancedMesh;
  public stoneInstancedMesh!: THREE.InstancedMesh;

  // Breakable props array
  public breakableProps: BreakableProp[] = [];

  // Animated elements (flags, spectator tape)
  public animatedFlags: THREE.Mesh[] = [];

  // Count constants
  public static readonly CYPRESS_COUNT = 1200;
  public static readonly PINE_COUNT = 800;
  public static readonly SCRUB_COUNT = 2400;
  public static readonly STONE_COUNT = 600;

  constructor(scene: THREE.Scene, rapierWorld: RAPIER.World, worldEngine: RallyStageWorld) {
    this.scene = scene;
    this.rapierWorld = rapierWorld;
    this.worldEngine = worldEngine;
  }

  public async init(): Promise<void> {
    // 1. Build and distribute GPU instanced vegetation
    this.buildInstancedVegetation();

    // 2. Build architectural assets (cottage, barn, pump station, stone aqueduct)
    this.buildArchitecture();

    // 3. Build rally infrastructure (start gantry, finish arch, spectator barriers, marshal posts)
    this.buildInfrastructure();

    // 4. Build roadside safety furniture (kerbs, chevrons, guardrails, breakable fences, stone walls)
    this.buildRoadsideFurniture();
  }

  /**
   * Builds GPU InstancedMeshes for 1,200 Cypress trees, 800 Stone Pines, and scrubs/stones
   */
  private buildInstancedVegetation(): void {
    const dummy = new THREE.Object3D();

    // 1. Cypress Trees (1,200 units)
    const cypressTemplate = PropAssetFactory.createCypressTree();
    // Extract merged geometry for single-drawcall InstancedMesh
    const cypressFoliageGeo = new THREE.ConeGeometry(0.9, 9.5, 7);
    const cypressFoliageMat = new THREE.MeshStandardMaterial({
      color: 0x223c24, // Tuscan Cypress deep green
      roughness: 0.9,
      flatShading: true
    });
    this.cypressInstancedMesh = new THREE.InstancedMesh(
      cypressFoliageGeo,
      cypressFoliageMat,
      StagePropsManager.CYPRESS_COUNT
    );
    this.cypressInstancedMesh.name = 'InstancedCypressTrees';
    this.cypressInstancedMesh.castShadow = true;
    this.cypressInstancedMesh.receiveShadow = true;

    // Distribute 1,200 Cypress trees from Blueprint Sheet 01 seeded layout
    for (let i = 0; i < BP.trees.cyp.length; i++) {
      const [x, z] = BP.trees.cyp[i];
      const y = this.worldEngine.getTerrainHeight(x, z);
      const scale = 0.85 + ((i % 17) / 17.0) * 0.45;
      dummy.position.set(x, y + 4.75 * scale, z);
      dummy.rotation.y = ((i * 1.37) % 1.0) * Math.PI * 2;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.cypressInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    this.cypressInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.cypressInstancedMesh);

    // 2. Italian Stone Pines (800 units from Blueprint Sheet 01 seeded layout)
    const pineCanopyGeo = new THREE.CylinderGeometry(4.2, 4.5, 2.5, 9);
    const pineCanopyMat = new THREE.MeshStandardMaterial({
      color: 0x36522c,
      roughness: 0.85,
      flatShading: true
    });
    this.pineInstancedMesh = new THREE.InstancedMesh(
      pineCanopyGeo,
      pineCanopyMat,
      StagePropsManager.PINE_COUNT
    );
    this.pineInstancedMesh.name = 'InstancedStonePines';
    this.pineInstancedMesh.castShadow = true;
    this.pineInstancedMesh.receiveShadow = true;

    for (let i = 0; i < BP.trees.pine.length; i++) {
      const [x, z] = BP.trees.pine[i];
      const y = this.worldEngine.getTerrainHeight(x, z);
      const scale = 0.85 + ((i % 13) / 13.0) * 0.45;
      dummy.position.set(x, y + 13.0 * scale, z);
      dummy.rotation.y = ((i * 2.19) % 1.0) * Math.PI * 2;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.pineInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    this.pineInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.pineInstancedMesh);

    // 3. Sage Scrub Tufts (2,400 units)
    const scrubGeo = new THREE.ConeGeometry(0.5, 0.9, 5);
    const scrubMat = new THREE.MeshStandardMaterial({
      color: 0x5b6d47,
      roughness: 0.95,
      flatShading: true
    });
    this.scrubInstancedMesh = new THREE.InstancedMesh(
      scrubGeo,
      scrubMat,
      StagePropsManager.SCRUB_COUNT
    );
    this.scrubInstancedMesh.name = 'InstancedSageScrubs';

    for (let i = 0; i < StagePropsManager.SCRUB_COUNT; i++) {
      const sp = this.worldEngine.specialStagePoints[Math.floor(Math.random() * this.worldEngine.specialStagePoints.length)];
      const lateralDist = (sp.width * 0.5 + 1.2 + Math.random() * 8.0) * (Math.random() > 0.5 ? 1 : -1);
      const pos = sp.point.clone().add(sp.binormal.clone().multiplyScalar(lateralDist));
      pos.y = this.worldEngine.getTerrainHeight(pos.x, pos.z) + 0.45;

      const s = 0.6 + Math.random() * 0.7;
      dummy.position.copy(pos);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();

      this.scrubInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    this.scrubInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.scrubInstancedMesh);

    // 4. River Stones (600 units along dry gully)
    const stoneGeo = new THREE.DodecahedronGeometry(0.75, 1);
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x766e63,
      roughness: 0.9
    });
    this.stoneInstancedMesh = new THREE.InstancedMesh(
      stoneGeo,
      stoneMat,
      StagePropsManager.STONE_COUNT
    );
    this.stoneInstancedMesh.name = 'InstancedRiverStones';

    for (let i = 0; i < StagePropsManager.STONE_COUNT; i++) {
      const x = (Math.random() - 0.5) * 1100;
      const gullyZ = 60.0 * Math.sin(x / 120.0) - 40.0 + (Math.random() - 0.5) * 22;
      const y = this.worldEngine.getTerrainHeight(x, gullyZ) + 0.3;

      const s = 0.5 + Math.random() * 1.1;
      dummy.position.set(x, y, gullyZ);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.scale.set(s, s * 0.6, s);
      dummy.updateMatrix();

      this.stoneInstancedMesh.setMatrixAt(i, dummy.matrix);
    }
    this.stoneInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.stoneInstancedMesh);
  }

  /**
   * Builds architectural landmarks positioned from Blueprint Sheet 01
   */
  private buildArchitecture(): void {
    // 1. Weathered Stone Cottage at Farm cluster (ch. 1300m)
    const cottagePos = new THREE.Vector3(BP.farm.cottage.x, this.worldEngine.getTerrainHeight(BP.farm.cottage.x, BP.farm.cottage.z), BP.farm.cottage.z);
    const cottage = PropAssetFactory.createTuscanCottage();
    cottage.position.copy(cottagePos);
    cottage.rotation.y = 0.65;
    this.scene.add(cottage);
    this.addStaticBoxCollider(cottage.position, new THREE.Vector3(8.5, 4.5, 11.0));

    // 2. Rustic Timber Barn at Farm cluster
    const barnPos = new THREE.Vector3(BP.farm.barn.x, this.worldEngine.getTerrainHeight(BP.farm.barn.x, BP.farm.barn.z), BP.farm.barn.z);
    const barn = PropAssetFactory.createTimberBarn();
    barn.position.copy(barnPos);
    barn.rotation.y = -0.4;
    this.scene.add(barn);
    this.addStaticBoxCollider(barn.position, new THREE.Vector3(9.0, 5.0, 13.0));

    // 3. Mountain Water Pump Station at Farm cluster
    const pumpPos = new THREE.Vector3(BP.farm.pump.x, this.worldEngine.getTerrainHeight(BP.farm.pump.x, BP.farm.pump.z), BP.farm.pump.z);
    const pump = PropAssetFactory.createWaterPump();
    pump.position.copy(pumpPos);
    pump.rotation.y = 1.2;
    this.scene.add(pump);

    // 4. Roman Stone Aqueduct (upstream crossing)
    const aqMidX = (BP.aqueduct.x1 + BP.aqueduct.x2) * 0.5;
    const aqMidZ = (BP.aqueduct.z1 + BP.aqueduct.z2) * 0.5;
    const aqY = this.worldEngine.getTerrainHeight(aqMidX, aqMidZ);
    const aqueduct = PropAssetFactory.createStoneAqueduct(4, 15.0, 24.0, 8.0);
    aqueduct.position.set(aqMidX, aqY + 12.0, aqMidZ);
    const aqAngle = Math.atan2(BP.aqueduct.z2 - BP.aqueduct.z1, BP.aqueduct.x2 - BP.aqueduct.x1);
    aqueduct.rotation.y = aqAngle;
    this.scene.add(aqueduct);
    this.addStaticBoxCollider(aqueduct.position, new THREE.Vector3(60.0, 2.0, 8.0));

    // 5. Historic Stone Bridge at stage river crossing (ch. 1506m)
    const bridgeSample = BP.at(BP.stage, BP.bridge.s);
    const bridgeY = this.worldEngine.getTerrainHeight(bridgeSample.x, bridgeSample.z) + 0.35;
    const bridgeMesh = PropAssetFactory.createStoneAqueduct(2, 6.0, 10.0, 8.5);
    bridgeMesh.position.set(bridgeSample.x, bridgeY - 3.5, bridgeSample.z);
    bridgeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(bridgeSample.tx, 0, bridgeSample.tz));
    this.scene.add(bridgeMesh);
  }

  /**
   * Builds Rally Infrastructure (Gantry, Timing Arch, Marshal Posts, Spectator Tape)
   */
  private buildInfrastructure(): void {
    // 1. Start Gantry at K00
    const startPoint = this.worldEngine.specialStagePoints[0];
    const gantry = PropAssetFactory.createStartGantry();
    gantry.position.copy(startPoint.point);
    gantry.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), startPoint.tangent);
    this.scene.add(gantry);

    // 2. Finish Timing Arch at K24
    const finishPoint = this.worldEngine.specialStagePoints[this.worldEngine.specialStagePoints.length - 1];
    const finishArch = PropAssetFactory.createFinishArch();
    finishArch.position.copy(finishPoint.point);
    finishArch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), finishPoint.tangent);
    this.scene.add(finishArch);

    // 3. Marshal Posts with animated flags along hairpins
    const marshalLocations = [
      new THREE.Vector3(-340, 34.2, -370), // Hairpin 1
      new THREE.Vector3(-130, 82.2, -160), // Hairpin 2
      new THREE.Vector3(220, 74.2, 180),   // Hairpin 3
      new THREE.Vector3(-80, 28.2, 430)    // Hairpin 4
    ];

    for (let i = 0; i < marshalLocations.length; i++) {
      const postGroup = new THREE.Group();
      postGroup.position.copy(marshalLocations[i]);

      // Timber post
      const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 2.8, 6);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2d, roughness: 0.9 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.y = 1.4;
      postGroup.add(post);

      // Cloth Flag (Green, Yellow, Chequered)
      const flagGeo = new THREE.PlaneGeometry(0.9, 0.6, 6, 4);
      const flagMat = new THREE.MeshStandardMaterial({
        color: i === 0 ? 0x00cc44 : (i === 3 ? 0xffffff : 0xffdd00),
        roughness: 0.6,
        side: THREE.DoubleSide
      });
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(0.45, 2.5, 0);
      postGroup.add(flag);
      this.animatedFlags.push(flag);

      this.scene.add(postGroup);
    }

    // 4. Spectator Yellow Warning Ribbon along outside hairpins
    this.buildSpectatorRibbons();
  }

  /**
   * Builds roadside safety furniture: kerbs, chevrons, guardrails, breakable fences and walls
   */
  private buildRoadsideFurniture(): void {
    // Apex kerbs on asphalt hairpin (Castelnuovo)
    const hp1Index = Math.floor(this.worldEngine.specialStagePoints.length * 0.16);
    for (let k = -6; k <= 6; k++) {
      const sp = this.worldEngine.specialStagePoints[hp1Index + k];
      if (!sp) continue;
      const kerb = PropAssetFactory.createApexKerb(2.2, 0.7, 0.12);
      const insideOffset = sp.binormal.clone().multiplyScalar(-sp.width * 0.5 - 0.2);
      kerb.position.copy(sp.point).add(insideOffset);
      kerb.position.y += 0.06;
      kerb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sp.tangent);
      this.scene.add(kerb);
    }

    // Chevron boards on blind turns
    const chevronIndices = [
      Math.floor(this.worldEngine.specialStagePoints.length * 0.15),
      Math.floor(this.worldEngine.specialStagePoints.length * 0.36),
      Math.floor(this.worldEngine.specialStagePoints.length * 0.58),
      Math.floor(this.worldEngine.specialStagePoints.length * 0.74)
    ];
    for (const idx of chevronIndices) {
      const sp = this.worldEngine.specialStagePoints[idx];
      if (!sp) continue;
      const chevron = PropAssetFactory.createChevronBoard();
      const outsideOffset = sp.binormal.clone().multiplyScalar(sp.width * 0.5 + 1.8);
      chevron.position.copy(sp.point).add(outsideOffset);
      chevron.position.y = this.worldEngine.getTerrainHeight(chevron.position.x, chevron.position.z);
      chevron.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sp.tangent);
      this.scene.add(chevron);
    }

    // Steel guardrails on cliff drop sections (near K09 and K11)
    const guardrailStartIndex = Math.floor(this.worldEngine.specialStagePoints.length * 0.34);
    for (let g = 0; g < 14; g++) {
      const sp = this.worldEngine.specialStagePoints[guardrailStartIndex + g * 2];
      if (!sp) continue;
      const rail = PropAssetFactory.createGuardrail(3.6, 0.85);
      const cliffOffset = sp.binormal.clone().multiplyScalar(sp.width * 0.5 + 0.6);
      rail.position.copy(sp.point).add(cliffOffset);
      rail.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), sp.tangent);
      this.scene.add(rail);
      this.addStaticBoxCollider(rail.position, new THREE.Vector3(3.6, 0.85, 0.3));
    }

    // Breakable Wooden Fences and Dry-Stone Walls
    this.buildBreakableProps();
  }

  /**
   * Builds breakable fences and stone walls with Rapier collision detection
   */
  private buildBreakableProps(): void {
    // 1. Breakable Wooden Fence Section along farm corridor
    const fenceCenter = new THREE.Vector3(-380, 24.5, -420);
    const fenceGroup = PropAssetFactory.createBreakableFence(3.2, 1.1);
    fenceGroup.position.copy(fenceCenter);
    fenceGroup.rotation.y = 0.45;
    this.scene.add(fenceGroup);

    const fencePieces: BreakableProp['pieces'] = [];
    fenceGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        fencePieces.push({
          mesh: child,
          initialPos: child.position.clone(),
          initialRot: child.rotation.clone()
        });
      }
    });

    const fenceBox = new THREE.Box3().setFromObject(fenceGroup);
    this.breakableProps.push({
      id: 'BreakableFence_01',
      type: 'fence',
      group: fenceGroup,
      pieces: fencePieces,
      isBroken: false,
      breakThreshold: 4200, // Impulse threshold (N*s)
      bounds: fenceBox
    });

    // 2. Breakable Dry-Stone Wall Section
    const wallCenter = new THREE.Vector3(-150, 81.5, -140);
    const wallGroup = PropAssetFactory.createBreakableDryStoneWall(2.8, 0.95, 0.5);
    wallGroup.position.copy(wallCenter);
    wallGroup.rotation.y = -0.55;
    this.scene.add(wallGroup);

    const wallPieces: BreakableProp['pieces'] = [];
    wallGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        wallPieces.push({
          mesh: child,
          initialPos: child.position.clone(),
          initialRot: child.rotation.clone()
        });
      }
    });

    const wallBox = new THREE.Box3().setFromObject(wallGroup);
    this.breakableProps.push({
      id: 'BreakableWall_01',
      type: 'stone_wall',
      group: wallGroup,
      pieces: wallPieces,
      isBroken: false,
      breakThreshold: 5400,
      bounds: wallBox
    });
  }

  /**
   * Helper to add a static box collider to the physics world
   */
  private addStaticBoxCollider(pos: THREE.Vector3, halfExtents: THREE.Vector3): void {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
    const rb = this.rapierWorld.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x * 0.5, halfExtents.y * 0.5, halfExtents.z * 0.5);
    this.rapierWorld.createCollider(colDesc, rb);
  }

  /**
   * Spectator barrier tape ribbon
   */
  private buildSpectatorRibbons(): void {
    const tapeMat = new THREE.MeshBasicMaterial({
      color: 0xffea00, // Safety tape yellow
      side: THREE.DoubleSide
    });

    const ribbonGeo = new THREE.PlaneGeometry(28.0, 0.18, 14, 1);
    const ribbon = new THREE.Mesh(ribbonGeo, tapeMat);
    ribbon.position.set(-335, 35.2, -380);
    ribbon.rotation.y = -0.6;
    this.scene.add(ribbon);
  }

  /**
   * Checks vehicle collision against breakable fences and walls
   */
  public checkBreakableImpacts(carPos: THREE.Vector3, carVelocity: THREE.Vector3, carMass = 1180): void {
    const speed = carVelocity.length();
    const impulse = carMass * speed;

    for (const prop of this.breakableProps) {
      if (prop.isBroken) continue;

      if (prop.bounds.containsPoint(carPos) || prop.group.position.distanceTo(carPos) < 2.5) {
        if (impulse > prop.breakThreshold || speed > 8.5) {
          this.breakProp(prop, carVelocity);
        }
      }
    }
  }

  /**
   * Shatters a breakable prop into active dynamic physics debris
   */
  private breakProp(prop: BreakableProp, impactVelocity: THREE.Vector3): void {
    prop.isBroken = true;

    for (const piece of prop.pieces) {
      const worldPos = new THREE.Vector3();
      piece.mesh.getWorldPosition(worldPos);

      // Create dynamic Rapier rigid body for the flying fragment
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(worldPos.x, worldPos.y, worldPos.z)
        .setCcdEnabled(true);
      const rb = this.rapierWorld.createRigidBody(bodyDesc);

      // Random shatter scatter vector
      const scatter = new THREE.Vector3(
        (Math.random() - 0.5) * 3.5,
        Math.random() * 4.2 + 1.5,
        (Math.random() - 0.5) * 3.5
      );
      const fragVel = impactVelocity.clone().multiplyScalar(0.4).add(scatter);
      rb.setLinvel(new RAPIER.Vector3(fragVel.x, fragVel.y, fragVel.z), true);
      rb.setAngvel(new RAPIER.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), true);

      const colDesc = RAPIER.ColliderDesc.cuboid(0.15, 0.15, 0.15)
        .setFriction(0.65)
        .setRestitution(0.25);
      const col = this.rapierWorld.createCollider(colDesc, rb);

      piece.rigidBody = rb;
      piece.collider = col;
    }
  }

  /**
   * Per-frame animation updates for flags and shattered debris physics sync
   */
  public update(deltaTime: number, time: number): void {
    // 1. Animate marshal flags flutter
    for (let i = 0; i < this.animatedFlags.length; i++) {
      const flag = this.animatedFlags[i];
      flag.rotation.y = Math.sin(time * 6.5 + i) * 0.25;
      flag.rotation.z = Math.cos(time * 5.0 + i) * 0.12;
    }

    // 2. Sync broken fragments from Rapier to Three.js
    for (const prop of this.breakableProps) {
      if (!prop.isBroken) continue;
      for (const piece of prop.pieces) {
        if (piece.rigidBody) {
          const t = piece.rigidBody.translation();
          const r = piece.rigidBody.rotation();
          piece.mesh.position.set(t.x - prop.group.position.x, t.y - prop.group.position.y, t.z - prop.group.position.z);
          piece.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        }
      }
    }
  }
}

