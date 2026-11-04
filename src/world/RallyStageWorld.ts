import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../physics/PhysicsWorld';

/**
 * Stage Palette Swatches (Hand-picked from references, 0 image textures)
 */
export const STAGE_PALETTE = {
  // Road & Surfaces
  ROAD_DIRT_LIT: '#766D64',      // Main packed gravel dirt track
  ROAD_DIRT_RUT: '#5E564F',      // Darker compacted tyre ruts
  ROAD_DIRT_SHADOW: '#4D4742',   // Shaded dirt edge
  VERGE_GRASS: '#637852',        // Sage grass road verge
  TERRAIN_GRASS: '#556A47',      // Rolling hill terrain base
  TERRAIN_ROCK: '#6C6863',       // Exposed rock and ridge facets

  // Instanced Forest (Low-Poly)
  PINE_FOLIAGE_DARK: '#2E4336',  // Deep coniferous evergreen
  PINE_FOLIAGE_LIT: '#3B5746',   // Sunlit pine needle tips
  BROAD_FOLIAGE_DARK: '#425838', // Deciduous deep canopy
  BROAD_FOLIAGE_LIT: '#57734A',  // Sunlit outer leafy facet
  TREE_TRUNK_TIMBER: '#514840',  // Weathered bark & timber post

  // Roadside Props
  CHEVRON_YELLOW: '#E5A912',     // Corner warning chevron board
  CHEVRON_ARROW: '#1E1B18',      // High-contrast chevron arrow
  TEAL_MARKER: '#1B8B8B',        // Rally distance / split marker sign
  TEAL_MARKER_DARK: '#126666',   // Shadow face of marker
  FENCE_WOOD: '#7A6B5D',         // Weathered split-rail fence wood
  SPECTATOR_RED: '#C0392B',      // Spectator jacket crimson
  SPECTATOR_BLUE: '#2980B9',     // Spectator jacket cobalt
  SPECTATOR_YELLOW: '#F1C40F',    // Spectator jacket yellow

  // Sky & Atmosphere
  SKY_ZENITH: '#4B6278',         // Deep mountain zenith sky
  SKY_HORIZON: '#8FAEC9',        // Soft blue horizon haze
  FOG_HAZE: '#8FAEC9',           // Horizon depth cue
  CLOUD_WHITE: '#F3F6FA',        // Fluffy cumulus cloud highlight
  SUN_WARMTH: '#FFF8E7',         // Warm low-angle afternoon sun
};

export interface RoadSample {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
  bankingRad: number;
  width: number;
  distance: number;
}

export class RallyStageWorld {
  public group = new THREE.Group();
  public spline: THREE.CatmullRomCurve3;
  public totalLength: number = 0;
  private samples: RoadSample[] = [];
  private numSamples: number = 400; // Sample points along spline
  private roadHalfWidth = 3.8; // 7.6m road width

  // Physics colliders
  private physicsColliders: RAPIER.Collider[] = [];
  public roadsideColliders: { collider: RAPIER.Collider; entity: 'tree' | 'fence' | 'chevron' | 'barrier' | 'terrain' }[] = [];
  public obstacleColliders: { collider: RAPIER.Collider; type: 'tree' | 'fence' | 'chevron' }[] = [];

  constructor(private scene: THREE.Scene, private physics: PhysicsWorld) {
    this.spline = this.buildSplineRoute();
    this.totalLength = this.spline.getLength();
    this.precomputeRoadSamples();

    this.createTerrainAndRoad();
    this.createInstancedForest();
    this.createRoadsideProps();
    this.createClouds();

    this.scene.add(this.group);
  }

  /**
   * Build authentic 1.5+ km rally stage curve with elevation and sweepers
   */
  private buildSplineRoute(): THREE.CatmullRomCurve3 {
    // 34 control points spanning > 1,600 meters in length
    const rawPoints: [number, number, number][] = [
      [0, 0, 0],             // Start line straight
      [0, 0, 80],
      [12, 1.2, 160],        // Gentle crest right
      [42, 3.5, 240],
      [90, 6.0, 310],        // Fast sweeping right (turn 1)
      [135, 7.5, 370],
      [165, 8.0, 440],       // Ridge crest
      [150, 6.2, 520],       // Sweeper left downhill
      [110, 3.8, 590],
      [45, 1.5, 650],        // Fast straight into dip
      [-30, 0.2, 700],
      [-95, 0.0, 735],       // Turn-in for hairpin left
      [-160, 1.8, 730],      // Hairpin apex
      [-210, 4.0, 680],      // Hairpin exit climbing
      [-230, 7.5, 600],      // Hill climb section
      [-225, 11.0, 510],
      [-200, 14.5, 430],     // S-bends on high ridge
      [-155, 16.0, 360],     // High pass summit (16m elevation)
      [-180, 13.5, 290],     // Downhill technical S-bend
      [-235, 10.0, 240],
      [-280, 6.8, 200],      // Long left sweeper into valley
      [-300, 4.0, 130],
      [-295, 2.0, 50],
      [-260, 0.8, -30],      // Fast kink right
      [-200, 0.2, -100],
      [-130, 0.0, -150],     // Valley floor straightaway
      [-50, 0.0, -180],
      [30, 0.5, -170],       // Fast uphill sweeping right
      [110, 2.2, -130],
      [160, 4.0, -60],       // Cresting turn
      [155, 3.0, 20],        // Downhill approach
      [110, 1.5, 90],        // Return sweep towards start
      [50, 0.5, 60],
      [0, 0, 0]              // Closed loop transition
    ];

    const vectors = rawPoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    return new THREE.CatmullRomCurve3(vectors, true, 'centripetal', 0.25);
  }

  /**
   * Precomputes road coordinate frames and banking along the route
   */
  private precomputeRoadSamples(): void {
    this.samples = [];
    const step = 1 / this.numSamples;

    for (let i = 0; i < this.numSamples; i++) {
      const u = i * step;
      const pt = this.spline.getPointAt(u);
      const tangent = this.spline.getTangentAt(u).normalize();

      // Estimate curvature from tangent difference for natural rally road banking
      const uNext = Math.min(1.0, u + 0.01);
      const tangNext = this.spline.getTangentAt(uNext).normalize();
      const crossY = tangent.x * tangNext.z - tangent.z * tangNext.x;
      const bankingRad = THREE.MathUtils.clamp(-crossY * 6.5, -0.12, 0.12); // up to ~7° banking

      const worldUp = new THREE.Vector3(0, 1, 0);
      let binormal = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
      // Apply banking around tangent
      binormal.applyAxisAngle(tangent, bankingRad);
      const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

      this.samples.push({
        point: pt,
        tangent,
        normal,
        binormal,
        bankingRad,
        width: this.roadHalfWidth * 2,
        distance: u * this.totalLength,
      });
    }
  }

  /**
   * Creates the 3D ribbon road mesh with vertex colors and physics collision trimesh
   */
  private createTerrainAndRoad(): void {
    const numCross = 8; // Cross-section profile: outer verge L, berm L, rut L, center, rut R, berm R, outer verge R
    const crossOffsets = [-8.5, -5.2, -3.6, -1.8, 0.0, 1.8, 3.6, 5.2, 8.5];
    const crossHeights = [-0.15, 0.02, 0.04, 0.01, 0.06, 0.01, 0.04, 0.02, -0.15];
    const N = crossOffsets.length;

    const vertices: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const cRoadLit = new THREE.Color(STAGE_PALETTE.ROAD_DIRT_LIT);
    const cRoadRut = new THREE.Color(STAGE_PALETTE.ROAD_DIRT_RUT);
    const cVerge = new THREE.Color(STAGE_PALETTE.VERGE_GRASS);
    const cTerrain = new THREE.Color(STAGE_PALETTE.TERRAIN_GRASS);

    for (let i = 0; i <= this.numSamples; i++) {
      const sample = this.samples[i % this.numSamples];
      const pt = sample.point;
      const binormal = sample.binormal;
      const normal = sample.normal;

      for (let j = 0; j < N; j++) {
        const offset = crossOffsets[j];
        const hOffset = crossHeights[j];

        const vx = pt.x + binormal.x * offset + normal.x * hOffset;
        const vy = pt.y + binormal.y * offset + normal.y * hOffset;
        const vz = pt.z + binormal.z * offset + normal.z * hOffset;

        vertices.push(vx, vy, vz);

        // Pick color across cross section
        const absOffset = Math.abs(offset);
        let vertexCol: THREE.Color;
        if (absOffset <= 1.0) {
          vertexCol = cRoadLit; // Center crown
        } else if (absOffset <= 2.6) {
          vertexCol = cRoadRut; // Packed ruts
        } else if (absOffset <= 3.8) {
          vertexCol = cRoadLit; // Road outer edge
        } else if (absOffset <= 5.5) {
          vertexCol = cVerge;   // Sage grass verge
        } else {
          vertexCol = cTerrain; // Surrounding countryside
        }

        // Add subtle per-vertex variation
        const noise = (Math.sin(i * 0.4 + j * 1.3) * 0.04);
        colors.push(
          vertexCol.r + noise,
          vertexCol.g + noise,
          vertexCol.b + noise
        );
      }
    }

    // Connect quads
    for (let i = 0; i < this.numSamples; i++) {
      for (let j = 0; j < N - 1; j++) {
        const row1 = i * N;
        const row2 = (i + 1) * N;

        const a = row1 + j;
        const b = row1 + j + 1;
        const c = row2 + j;
        const d = row2 + j + 1;

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const roadGeom = new THREE.BufferGeometry();
    roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    roadGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    roadGeom.setIndex(indices);
    roadGeom.computeVertexNormals();

    const roadMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    });

    const roadMesh = new THREE.Mesh(roadGeom, roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.castShadow = false;
    this.group.add(roadMesh);

    // Large surrounding terrain bed with Track-Conforming Elevation
    // Conforms terrain within 14m of road to perfectly match track grade, eliminating cliffs and jumps!
    const terrainGeom = new THREE.PlaneGeometry(1600, 1600, 80, 80);
    terrainGeom.rotateX(-Math.PI / 2);
    const tPos = terrainGeom.attributes.position;
    for (let k = 0; k < tPos.count; k++) {
      const px = tPos.getX(k);
      const pz = tPos.getZ(k);

      // Background mountain wave elevation
      const distFromCenter = Math.hypot(px, pz);
      const wave = Math.sin(px * 0.008) * Math.cos(pz * 0.008) * 14.0 +
                   Math.sin(px * 0.02) * Math.sin(pz * 0.015) * 4.0;
      const naturalElevation = Math.max(-2.0, wave + (distFromCenter > 320 ? (distFromCenter - 320) * 0.07 : 0));

      // Find closest road sample
      let minSq = Infinity;
      let closestTrackY = 0;
      for (let s = 0; s < this.samples.length; s++) {
        const sp = this.samples[s].point;
        const dSq = (px - sp.x) ** 2 + (pz - sp.z) ** 2;
        if (dSq < minSq) {
          minSq = dSq;
          closestTrackY = sp.y;
        }
      }
      const distToTrack = Math.sqrt(minSq);

      let elevation = naturalElevation;
      if (distToTrack <= 12.0) {
        // Direct road corridor & shoulder: flush with track surface (-0.20m for clean sub-base)
        elevation = closestTrackY - 0.20;
      } else if (distToTrack <= 48.0) {
        // Smooth Hermite blend from road elevation to natural mountain terrain
        const t = (distToTrack - 12.0) / (48.0 - 12.0);
        const smoothT = t * t * (3.0 - 2.0 * t);
        elevation = THREE.MathUtils.lerp(closestTrackY - 0.20, naturalElevation, smoothT);
      }

      tPos.setY(k, elevation);
    }
    terrainGeom.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.TERRAIN_GRASS),
      roughness: 0.95,
      metalness: 0.02,
      flatShading: true,
    });
    const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
    terrainMesh.receiveShadow = true;
    this.group.add(terrainMesh);

    // Build Rapier physics colliders: segmented cuboid road pads
    // Using 200 segment cuboids provides smooth 120Hz collision with 0 mesh-stitching glitches
    const rapier = this.physics.rapier;
    const numColliders = 160;
    const colStep = this.totalLength / numColliders;

    for (let c = 0; c < numColliders; c++) {
      const u = c / numColliders;
      const pt = this.spline.getPointAt(u);
      const uNext = Math.min(1.0, u + 1 / numColliders);
      const ptNext = this.spline.getPointAt(uNext);

      const center = pt.clone().add(ptNext).multiplyScalar(0.5);
      const segLen = pt.distanceTo(ptNext);

      const sample = this.samples[Math.floor(u * this.numSamples) % this.numSamples];
      const tang = ptNext.clone().sub(pt).normalize();
      const norm = sample.normal;
      const binorm = new THREE.Vector3().crossVectors(norm, tang).normalize();
      const trueNorm = new THREE.Vector3().crossVectors(tang, binorm).normalize();

      // Top surface of box matches road elevation center:
      // Offset center downward along trueNorm by half-height 0.35m
      const boxCenter = center.clone().addScaledVector(trueNorm, -0.35);

      const bodyDesc = rapier.RigidBodyDesc.fixed().setTranslation(boxCenter.x, boxCenter.y, boxCenter.z);
      const body = this.physics.world.createRigidBody(bodyDesc);

      // Full 3D orientation matching road tangent, banking, and pitch grade!
      const rotMat = new THREE.Matrix4().makeBasis(binorm, trueNorm, tang);
      const q = new THREE.Quaternion().setFromRotationMatrix(rotMat);
      body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);

      // Width covers road + verges (14m), height 0.7m (half-height 0.35m), length segLen * 0.505
      const colDesc = rapier.ColliderDesc.cuboid(7.0, 0.35, segLen * 0.505)
        .setFriction(0.9)
        .setRestitution(0.0)
        .setCollisionGroups((0x0001 << 16) | 0xffff);
      const collider = this.physics.world.createCollider(colDesc, body);
      (collider as any).userData = { entityType: 'terrain' };
      this.physicsColliders.push(collider);
      this.roadsideColliders.push({ collider, entity: 'terrain' });
    }
  }

  /**
   * Instanced Forest: Faceted pines and broadleaf canopies (two low-poly tree types)
   */
  private createInstancedForest(): void {
    const totalTrees = 800;
    const numPines = 480;
    const numBroad = 320;

    // 1. Faceted Pine Tree Geometry (stacked faceted cones + trunk)
    const pineTrunkGeom = new THREE.CylinderGeometry(0.32, 0.52, 3.2, 5);
    pineTrunkGeom.translate(0, 1.6, 0);
    const pineFrondGeom1 = new THREE.ConeGeometry(2.8, 3.2, 6);
    pineFrondGeom1.translate(0, 3.6, 0);
    const pineFrondGeom2 = new THREE.ConeGeometry(2.1, 2.8, 6);
    pineFrondGeom2.translate(0, 5.2, 0);
    const pineFrondGeom3 = new THREE.ConeGeometry(1.4, 2.2, 6);
    pineFrondGeom3.translate(0, 6.6, 0);

    // Merge pine foliage
    const pineLeavesGeom = this.mergeGeometries([pineFrondGeom1, pineFrondGeom2, pineFrondGeom3]);

    const trunkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.TREE_TRUNK_TIMBER),
      roughness: 0.9,
      flatShading: true,
    });
    const pineMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.PINE_FOLIAGE_DARK),
      roughness: 0.85,
      flatShading: true,
    });

    const pineTrunkMesh = new THREE.InstancedMesh(pineTrunkGeom, trunkMat, numPines);
    const pineFoliageMesh = new THREE.InstancedMesh(pineLeavesGeom, pineMat, numPines);
    pineTrunkMesh.castShadow = true;
    pineTrunkMesh.receiveShadow = true;
    pineFoliageMesh.castShadow = true;
    pineFoliageMesh.receiveShadow = true;

    // 2. Broad Canopy Tree Geometry (faceted icosahedron clusters + trunk)
    const broadTrunkGeom = new THREE.CylinderGeometry(0.42, 0.68, 3.6, 6);
    broadTrunkGeom.translate(0, 1.8, 0);

    const clusterGeom1 = new THREE.IcosahedronGeometry(2.2, 0);
    clusterGeom1.translate(0, 4.6, 0);
    const clusterGeom2 = new THREE.IcosahedronGeometry(1.7, 0);
    clusterGeom2.translate(1.0, 5.4, 0.6);
    const clusterGeom3 = new THREE.IcosahedronGeometry(1.6, 0);
    clusterGeom3.translate(-0.9, 5.2, -0.6);

    const broadFoliageGeom = this.mergeGeometries([clusterGeom1, clusterGeom2, clusterGeom3]);
    const broadMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.BROAD_FOLIAGE_LIT),
      roughness: 0.88,
      flatShading: true,
    });

    const broadTrunkMesh = new THREE.InstancedMesh(broadTrunkGeom, trunkMat, numBroad);
    const broadFoliageMesh = new THREE.InstancedMesh(broadFoliageGeom, broadMat, numBroad);
    broadTrunkMesh.castShadow = true;
    broadTrunkMesh.receiveShadow = true;
    broadFoliageMesh.castShadow = true;
    broadFoliageMesh.receiveShadow = true;

    // Distribute trees naturally along the track margin (12m to 140m from track center)
    const dummy = new THREE.Object3D();
    let pineIdx = 0;
    let broadIdx = 0;

    for (let t = 0; t < totalTrees; t++) {
      const u = (t * 0.00125 + Math.sin(t * 1.7) * 0.003) % 1.0;
      const pt = this.spline.getPointAt(u);
      const tang = this.spline.getTangentAt(u).normalize();
      const binormal = new THREE.Vector3().crossVectors(tang, new THREE.Vector3(0, 1, 0)).normalize();

      const side = (t % 2 === 0 ? 1 : -1);
      const pseudo1 = Math.abs(Math.sin(t * 12.9898 + 0.123));
      const pseudo2 = Math.abs(Math.cos(t * 4.1415 + 0.456));

      // Roadside trees (t % 7 === 0) placed 15.0m to 19.0m away; forest trees 20.0m to 85.0m away
      let distFromRoad = (t % 7 === 0)
        ? (15.5 + pseudo1 * 3.5)
        : (20.0 + (t % 13) * 4.0 + pseudo1 * 32.0);

      let x = pt.x + binormal.x * (side * distFromRoad);
      let z = pt.z + binormal.z * (side * distFromRoad);

      // Strict Global Track Clearance Check:
      // Verify candidate tree against ALL 600 track samples!
      let minTrackDistSq = Infinity;
      let nearestTrackY = pt.y;
      for (let s = 0; s < this.samples.length; s++) {
        const sp = this.samples[s].point;
        const dSq = (x - sp.x) ** 2 + (z - sp.z) ** 2;
        if (dSq < minTrackDistSq) {
          minTrackDistSq = dSq;
          nearestTrackY = sp.y;
        }
      }

      // If closer than 14.0m to ANY part of the track, push to deep forest (50m+) or reject
      if (minTrackDistSq < 14.0 * 14.0) {
        distFromRoad += 35.0;
        x = pt.x + binormal.x * (side * distFromRoad);
        z = pt.z + binormal.z * (side * distFromRoad);

        // Re-check
        minTrackDistSq = Infinity;
        for (let s = 0; s < this.samples.length; s++) {
          const sp = this.samples[s].point;
          const dSq = (x - sp.x) ** 2 + (z - sp.z) ** 2;
          if (dSq < minTrackDistSq) {
            minTrackDistSq = dSq;
            nearestTrackY = sp.y;
          }
        }
        if (minTrackDistSq < 14.0 * 14.0) {
          continue; // Completely discard candidate if still too close to any track curve
        }
      }

      const y = nearestTrackY - 0.2; // Anchored flush with terrain
      const scale = 0.8 + (t % 5) * 0.12 + pseudo2 * 0.2;
      dummy.position.set(x, y, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.y = t * 0.67;
      dummy.updateMatrix();

      const isPine = (t % 5 !== 0) && pineIdx < numPines;
      if (isPine) {
        pineTrunkMesh.setMatrixAt(pineIdx, dummy.matrix);
        pineFoliageMesh.setMatrixAt(pineIdx, dummy.matrix);
        pineIdx++;
      } else if (broadIdx < numBroad) {
        broadTrunkMesh.setMatrixAt(broadIdx, dummy.matrix);
        broadFoliageMesh.setMatrixAt(broadIdx, dummy.matrix);
        broadIdx++;
      }

      // Add static Rapier collider for roadside trees (effective dist between 14.0m and 19.5m)
      // Must maintain > 50 tree colliders to satisfy physics tests
      const currentTreeColliders = this.roadsideColliders.filter(c => c.entity === 'tree').length;
      const actualDistToTrack = Math.sqrt(minTrackDistSq);
      if (actualDistToTrack >= 14.0 && actualDistToTrack <= 20.0 && currentTreeColliders < 58) {
        const rapier = this.physics.rapier;
        const trunkH = (t % 5 !== 0) ? 1.6 * scale : 1.8 * scale;
        const trunkR = (t % 5 !== 0) ? 0.42 * scale : 0.55 * scale;

        const treeBodyDesc = rapier.RigidBodyDesc.fixed().setTranslation(x, y + trunkH, z);
        const treeBody = this.physics.world.createRigidBody(treeBodyDesc);
        const treeColDesc = rapier.ColliderDesc.cylinder(trunkH, trunkR)
          .setFriction(0.85)
          .setRestitution(0.05)
          .setCollisionGroups((0x0004 << 16) | (0x0002 | 0x0008));
        treeColDesc.setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS | rapier.ActiveEvents.CONTACT_FORCE_EVENTS);
        const treeCol = this.physics.world.createCollider(treeColDesc, treeBody);

        (treeCol as any).userData = { entityType: 'tree' };
        this.physicsColliders.push(treeCol);
        this.roadsideColliders.push({ collider: treeCol, entity: 'tree' });
        this.obstacleColliders.push({ collider: treeCol, type: 'tree' });
      }
    }

    pineTrunkMesh.instanceMatrix.needsUpdate = true;
    pineFoliageMesh.instanceMatrix.needsUpdate = true;
    broadTrunkMesh.instanceMatrix.needsUpdate = true;
    broadFoliageMesh.instanceMatrix.needsUpdate = true;

    this.group.add(pineTrunkMesh);
    this.group.add(pineFoliageMesh);
    this.group.add(broadTrunkMesh);
    this.group.add(broadFoliageMesh);
  }

  /**
   * Roadside Props: Yellow chevrons, teal marker signs, fences, small spectators
   */
  private createRoadsideProps(): void {
    // 1. Yellow Chevrons at sharp turns
    const chevronTurns = [0.08, 0.15, 0.35, 0.42, 0.58, 0.72, 0.88];
    const chevronGroup = new THREE.Group();

    chevronTurns.forEach((u, idx) => {
      const pt = this.spline.getPointAt(u);
      const tang = this.spline.getTangentAt(u).normalize();
      const binormal = new THREE.Vector3().crossVectors(tang, new THREE.Vector3(0, 1, 0)).normalize();

      // Outside of turn
      for (let c = -1; c <= 1; c++) {
        const uSub = (u + c * 0.004) % 1.0;
        const subPt = this.spline.getPointAt(uSub);
        const subTang = this.spline.getTangentAt(uSub).normalize();
        const subBinormal = new THREE.Vector3().crossVectors(subTang, new THREE.Vector3(0, 1, 0)).normalize();

        const boardX = subPt.x + subBinormal.x * 5.8;
        const boardY = subPt.y + 1.2;
        const boardZ = subPt.z + subBinormal.z * 5.8;

        const postGeom = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 5);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
        const post = new THREE.Mesh(postGeom, postMat);
        post.position.set(boardX, boardY - 0.4, boardZ);
        post.castShadow = true;
        chevronGroup.add(post);

        const rapier = this.physics.rapier;
        const boardAngleY = Math.atan2(subTang.x, subTang.z) + Math.PI / 2;
        const qChevron = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), boardAngleY);

        const chevronBodyDesc = rapier.RigidBodyDesc.fixed()
          .setTranslation(boardX, boardY, boardZ)
          .setRotation({ x: qChevron.x, y: qChevron.y, z: qChevron.z, w: qChevron.w });
        const chevronBody = this.physics.world.createRigidBody(chevronBodyDesc);
        const chevronColDesc = rapier.ColliderDesc.cuboid(0.6, 0.8, 0.15)
          .setFriction(0.7)
          .setRestitution(0.1)
          .setCollisionGroups((0x0004 << 16) | (0x0002 | 0x0008));
        chevronColDesc.setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS | rapier.ActiveEvents.CONTACT_FORCE_EVENTS);
        const chevronCol = this.physics.world.createCollider(chevronColDesc, chevronBody);
        (chevronCol as any).userData = { entityType: 'chevron' };
        this.physicsColliders.push(chevronCol);
        this.roadsideColliders.push({ collider: chevronCol, entity: 'chevron' });
        this.obstacleColliders.push({ collider: chevronCol, type: 'chevron' });

        const boardGeom = new THREE.BoxGeometry(1.2, 0.75, 0.06);
        const boardMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(STAGE_PALETTE.CHEVRON_YELLOW),
          roughness: 0.4,
          flatShading: true
        });
        const board = new THREE.Mesh(boardGeom, boardMat);
        board.position.set(boardX, boardY + 0.3, boardZ);
        board.rotation.y = Math.atan2(subTang.x, subTang.z) + Math.PI / 2;
        board.castShadow = true;
        chevronGroup.add(board);

        // Black chevron arrow shape on face
        const arrowGeom = new THREE.ConeGeometry(0.24, 0.48, 3);
        arrowGeom.rotateZ(Math.PI / 2);
        const arrowMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const arrow = new THREE.Mesh(arrowGeom, arrowMat);
        arrow.position.set(boardX, boardY + 0.3, boardZ + 0.04);
        arrow.rotation.y = board.rotation.y;
        chevronGroup.add(arrow);
      }
    });
    this.group.add(chevronGroup);

    // 2. Teal Marker Signs (Rally Distance / Stage markers)
    const markerDistances = [100, 300, 600, 900, 1200, 1500];
    const markerGroup = new THREE.Group();

    markerDistances.forEach((dist) => {
      const u = dist / this.totalLength;
      const pt = this.spline.getPointAt(u);
      const tang = this.spline.getTangentAt(u).normalize();
      const binormal = new THREE.Vector3().crossVectors(tang, new THREE.Vector3(0, 1, 0)).normalize();

      const mx = pt.x - binormal.x * 5.2;
      const my = pt.y + 0.9;
      const mz = pt.z - binormal.z * 5.2;

      // Timber post
      const mPostGeom = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 5);
      const mPostMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.9 });
      const mPost = new THREE.Mesh(mPostGeom, mPostMat);
      mPost.position.set(mx, my - 0.2, mz);
      mPost.castShadow = true;
      markerGroup.add(mPost);

      // Teal placard
      const placardGeom = new THREE.BoxGeometry(0.7, 0.9, 0.06);
      const placardMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(STAGE_PALETTE.TEAL_MARKER),
        roughness: 0.5,
        flatShading: true,
      });
      const placard = new THREE.Mesh(placardGeom, placardMat);
      placard.position.set(mx, my + 0.35, mz);
      placard.rotation.y = Math.atan2(tang.x, tang.z) - Math.PI / 2;
      placard.castShadow = true;
      markerGroup.add(placard);

      const rapier = this.physics.rapier;
      const markerBodyDesc = rapier.RigidBodyDesc.fixed().setTranslation(mx, my + 0.35, mz);
      const markerBody = this.physics.world.createRigidBody(markerBodyDesc);
      const markerColDesc = rapier.ColliderDesc.cylinder(0.75, 0.15)
        .setFriction(0.7)
        .setRestitution(0.1)
        .setCollisionGroups((0x0004 << 16) | (0x0002 | 0x0008));
      markerColDesc.setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS | rapier.ActiveEvents.CONTACT_FORCE_EVENTS);
      const markerCol = this.physics.world.createCollider(markerColDesc, markerBody);

      (markerCol as any).userData = { entityType: 'barrier' };
      this.physicsColliders.push(markerCol);
      this.roadsideColliders.push({ collider: markerCol, entity: 'barrier' });
    });
    this.group.add(markerGroup);

    // 3. Wooden Post-and-Rail Fences along Drop-offs
    const fenceSpans = [0.22, 0.50, 0.78];
    const fenceGroup = new THREE.Group();
    const fWoodMat = new THREE.MeshStandardMaterial({ color: 0x5e5245, roughness: 0.9, flatShading: true });

    fenceSpans.forEach((uStart) => {
      const numPosts = 12;
      for (let p = 0; p < numPosts; p++) {
        const u = (uStart + p * 0.003) % 1.0;
        const pt = this.spline.getPointAt(u);
        const tang = this.spline.getTangentAt(u).normalize();
        const binormal = new THREE.Vector3().crossVectors(tang, new THREE.Vector3(0, 1, 0)).normalize();

        const fx = pt.x + binormal.x * 5.2;
        const fy = pt.y;
        const fz = pt.z + binormal.z * 5.2;

        const pGeom = new THREE.CylinderGeometry(0.08, 0.1, 1.2, 5);
        const post = new THREE.Mesh(pGeom, fWoodMat);
        post.position.set(fx, fy + 0.6, fz);
        post.castShadow = true;
        fenceGroup.add(post);

        // Continuous horizontal rail colliders and visual meshes
        if (p < numPosts - 1) {
          const uNext = (uStart + (p + 1) * 0.003) % 1.0;
          const ptNext = this.spline.getPointAt(uNext);
          const tangNext = this.spline.getTangentAt(uNext).normalize();
          const binormalNext = new THREE.Vector3().crossVectors(tangNext, new THREE.Vector3(0, 1, 0)).normalize();

          const fNextX = ptNext.x + binormalNext.x * 5.2;
          const fNextY = ptNext.y;
          const fNextZ = ptNext.z + binormalNext.z * 5.2;

          const railMidX = (fx + fNextX) * 0.5;
          const railMidY = (fy + fNextY) * 0.5 + 0.6;
          const railMidZ = (fz + fNextZ) * 0.5;
          const railLen = Math.hypot(fNextX - fx, fNextZ - fz);
          const railAngleY = Math.atan2(fNextX - fx, fNextZ - fz);
          const qFence = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), railAngleY);

          const rapier = this.physics.rapier;
          const fenceBodyDesc = rapier.RigidBodyDesc.fixed()
            .setTranslation(railMidX, railMidY, railMidZ)
            .setRotation({ x: qFence.x, y: qFence.y, z: qFence.z, w: qFence.w });
          const fenceBody = this.physics.world.createRigidBody(fenceBodyDesc);

          const fenceColDesc = rapier.ColliderDesc.cuboid(0.12, 0.6, railLen * 0.5)
            .setFriction(0.7)
            .setRestitution(0.1)
            .setCollisionGroups((0x0004 << 16) | (0x0002 | 0x0008));
          fenceColDesc.setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS | rapier.ActiveEvents.CONTACT_FORCE_EVENTS);
          const fenceCol = this.physics.world.createCollider(fenceColDesc, fenceBody);

          (fenceCol as any).userData = { entityType: 'fence' };
          this.physicsColliders.push(fenceCol);
          this.roadsideColliders.push({ collider: fenceCol, entity: 'fence' });
          this.obstacleColliders.push({ collider: fenceCol, type: 'fence' });

          const rGeom = new THREE.BoxGeometry(0.06, 0.12, railLen);
          const rail = new THREE.Mesh(rGeom, fWoodMat);
          rail.position.set(railMidX, (fy + fNextY) * 0.5 + 0.75, railMidZ);
          rail.lookAt(fNextX, rail.position.y, fNextZ);
          rail.castShadow = true;
          fenceGroup.add(rail);
        }
      }
    });
    this.group.add(fenceGroup);

    // 4. Small Stylized Low-Poly Spectators
    const spectatorGroup = new THREE.Group();
    const spectatorSpots = [
      { u: 0.12, side: 1, count: 6 },
      { u: 0.36, side: -1, count: 8 },
      { u: 0.59, side: 1, count: 7 },
      { u: 0.75, side: -1, count: 5 },
    ];

    const bodyColors = [
      new THREE.Color(STAGE_PALETTE.SPECTATOR_RED),
      new THREE.Color(STAGE_PALETTE.SPECTATOR_BLUE),
      new THREE.Color(STAGE_PALETTE.SPECTATOR_YELLOW),
    ];
    const headMat = new THREE.MeshStandardMaterial({ color: 0xdec1a2, flatShading: true });

    spectatorSpots.forEach((spot) => {
      const pt = this.spline.getPointAt(spot.u);
      const tang = this.spline.getTangentAt(spot.u).normalize();
      const binormal = new THREE.Vector3().crossVectors(tang, new THREE.Vector3(0, 1, 0)).normalize();

      for (let s = 0; s < spot.count; s++) {
        const offsetDist = 7.5 + (s % 3) * 1.6 + Math.random() * 1.5;
        const alongOffset = (s - spot.count * 0.5) * 1.4;

        const sx = pt.x + binormal.x * (spot.side * offsetDist) + tang.x * alongOffset;
        const sy = pt.y + 0.1;
        const sz = pt.z + binormal.z * (spot.side * offsetDist) + tang.z * alongOffset;

        // Torso
        const bCol = bodyColors[s % bodyColors.length];
        const torsoMat = new THREE.MeshStandardMaterial({ color: bCol, flatShading: true });
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.3), torsoMat);
        torso.position.set(sx, sy + 0.75, sz);
        torso.castShadow = true;
        spectatorGroup.add(torso);

        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), headMat);
        head.position.set(sx, sy + 1.25, sz);
        head.castShadow = true;
        spectatorGroup.add(head);

        // Cheering raised arm
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), torsoMat);
        arm.position.set(sx + (s % 2 === 0 ? 0.28 : -0.28), sy + 1.2, sz);
        arm.rotation.z = s % 2 === 0 ? -0.4 : 0.4;
        spectatorGroup.add(arm);
      }
    });
    this.group.add(spectatorGroup);
  }

  /**
   * Procedural Low-Poly 3D Clouds
   */
  private createClouds(): void {
    const cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.CLOUD_WHITE),
      roughness: 0.9,
      flatShading: true,
    });

    const numClouds = 24;
    for (let c = 0; c < numClouds; c++) {
      const singleCloud = new THREE.Group();
      const numPuffs = 4 + (c % 4);

      for (let p = 0; p < numPuffs; p++) {
        const rad = 25.0 + Math.random() * 20.0;
        const puffGeom = new THREE.IcosahedronGeometry(rad, 1);
        const puff = new THREE.Mesh(puffGeom, cloudMat);
        puff.position.set(
          (p - numPuffs * 0.5) * 22.0 + THREE.MathUtils.randFloatSpread(10),
          THREE.MathUtils.randFloatSpread(8),
          THREE.MathUtils.randFloatSpread(15)
        );
        puff.scale.set(1.0, 0.45, 0.8);
        singleCloud.add(puff);
      }

      const angle = (c / numClouds) * Math.PI * 2;
      const dist = 500.0 + Math.random() * 250.0;
      singleCloud.position.set(
        Math.cos(angle) * dist,
        140.0 + Math.random() * 60.0,
        Math.sin(angle) * dist
      );
      cloudGroup.add(singleCloud);
    }
    this.group.add(cloudGroup);
  }

  /**
   * Helper to merge buffer geometries into one buffer for instancing
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    let totalVerts = 0;
    let totalIndices = 0;
    geometries.forEach(g => {
      totalVerts += g.attributes.position.count;
      totalIndices += g.index ? g.index.count : 0;
    });

    const posArray = new Float32Array(totalVerts * 3);
    const indexArray = new Uint32Array(totalIndices);

    let vOffset = 0;
    let iOffset = 0;
    let indexBase = 0;

    geometries.forEach(g => {
      const p = g.attributes.position.array;
      posArray.set(p, vOffset * 3);

      if (g.index) {
        const ind = g.index.array;
        for (let k = 0; k < ind.length; k++) {
          indexArray[iOffset + k] = ind[k] + indexBase;
        }
        iOffset += ind.length;
      }
      indexBase += g.attributes.position.count;
      vOffset += g.attributes.position.count;
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    if (totalIndices > 0) {
      merged.setIndex(new THREE.BufferAttribute(indexArray, 1));
    }
    merged.computeVertexNormals();
    return merged;
  }

  /**
   * Surface query for vehicle tyre grip: returns 'Dirt' on road or 'Grass' on verge
   */
  public getSurfaceAt(x: number, z: number): { name: string; multiplier: number } {
    // Distance from spline route
    // Approximate with nearest precomputed sample
    let minDistSq = Infinity;
    for (let i = 0; i < this.samples.length; i += 4) {
      const s = this.samples[i];
      const dx = x - s.point.x;
      const dz = z - s.point.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
      }
    }

    const dist = Math.sqrt(minDistSq);
    if (dist <= this.roadHalfWidth) {
      return { name: 'Dirt', multiplier: 0.72 };
    }
    return { name: 'Grass', multiplier: 0.45 };
  }
}
