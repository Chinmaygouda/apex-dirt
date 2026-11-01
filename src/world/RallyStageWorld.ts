import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../physics/PhysicsWorld';

/**
 * Stage Palette Swatches (Curated for a high-end, clean low-poly racing circuit)
 */
export const STAGE_PALETTE = {
  // Road & Surfaces
  ROAD_ASPHALT: '#32363b',       // High-contrast clean asphalt tarmac
  ROAD_RUT: '#222529',           // Darker tyre rubber contact zone
  ROAD_EDGE: '#3d4248',          // Outer road edge
  ROAD_DIRT_SHADOW: '#222528',   // Ground shadow tone for hemisphere light
  KERB_RED: '#d32f2f',           // FIA-spec red apex rumble kerb
  KERB_WHITE: '#ffffff',         // FIA-spec white apex rumble kerb
  KERB_CONCRETE: '#8c9198',      // Neutral concrete kerb on straights
  VERGE_GRASS: '#465f37',        // Sage grass road verge
  TERRAIN_GRASS: '#466435',      // Surrounding meadow ground base
  TERRAIN_GRASS_LIT: '#547540',  // Sunlit meadow facet

  // Motorsport Fence-Style Guardrails
  RAIL_SILVER: '#dce2e8',        // Bright galvanized metallic silver rail
  RAIL_POST: '#5a626a',          // Steel I-beam fence post
  HAZARD_RED: '#e53935',         // High-vis corner hazard red
  HAZARD_WHITE: '#ffffff',       // High-vis corner hazard white

  // Sky & Atmosphere
  SKY_ZENITH: '#3b526b',         // Clean mountain zenith sky
  SKY_HORIZON: '#8aa8c4',        // Soft blue horizon haze
  FOG_HAZE: '#8aa8c4',           // Horizon depth cue
  SUN_WARMTH: '#fff8ea',         // Crisp low-angle afternoon sun
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
  private numSamples: number = 500; // High resolution for silky smooth curves
  private roadHalfWidth = 5.0; // 10.0m total track width

  // Physics colliders
  private physicsColliders: RAPIER.Collider[] = [];

  // Tree trunk obstacle circles for ChaseCamera avoidance (empty since all trees are removed)
  public trunkObstacles: { x: number; z: number; r: number }[] = [];
  public getTrunkObstacles(): { x: number; z: number; r: number }[] {
    return this.trunkObstacles;
  }

  constructor(private scene: THREE.Scene, private physics: PhysicsWorld) {
    this.spline = this.buildSplineRoute();
    this.totalLength = this.spline.getLength();
    this.precomputeRoadSamples();

    this.createTerrainAndRoad();
    this.createStartFinishLine();
    this.createFenceStyleGuardrails();

    this.scene.add(this.group);
  }

  /**
   * Builds an authentic 1.68 km closed-circuit racing track at Y = 0.
   * Starts at (0, 0, -50), passes the Start/Finish line at (0, 0, 0) heading +Z,
   * offers a high-speed ~200m main straight, sweeping curves, technical S-bends,
   * a 180-degree carousel hairpin, and returns smoothly to the start line.
   */
  private buildSplineRoute(): THREE.CatmullRomCurve3 {
    const rawPoints: [number, number, number][] = [
      [0, 0, -50],      // 0: Approach to start line
      [0, 0, 0],        // 1: Start/Finish line (Z=0, heading straight +Z)
      [0, 0, 60],       // 2: Main straight
      [0, 0, 130],      // 3: Main straight high-speed approach
      [0, 0, 190],      // 4: Turn 1 Braking zone
      [25, 0, 260],     // 5: Turn 1 Entry (Fast Right Sweeper)
      [75, 0, 310],     // 6: Turn 1 Apex
      [135, 0, 315],    // 7: Turn 2 Entry
      [185, 0, 275],    // 8: Turn 2 Exit / S-chicane entry
      [195, 0, 205],    // 9: S-chicane Left Apex
      [175, 0, 140],    // 10: S-chicane Right Transition
      [150, 0, 85],     // 11: Infield intermediate straight
      [165, 0, 20],     // 12: Turn 5 (The Carousel Hairpin Entry)
      [190, 0, -40],    // 13: Carousel Outer Sweep
      [170, 0, -100],   // 14: Carousel Apex
      [120, 0, -135],   // 15: Carousel Exit
      [50, 0, -130],    // 16: South straightaway
      [-20, 0, -105],   // 17: Turn 7 Left Kink
      [-80, 0, -65],    // 18: Turn 8 Chicane Entry
      [-130, 0, -15],   // 19: Turn 8 Apex
      [-145, 0, 45],    // 20: West Sweeper
      [-130, 0, 115],   // 21: North-West Hairpin Entry
      [-85, 0, 150],    // 22: North-West Hairpin Apex
      [-45, 0, 115],    // 23: Return Sweeper
      [-20, 0, 45],     // 24: Final Turn Entry
      [-4, 0, -15],     // 25: Final Turn Exit onto Main Straight
    ];

    const vectors = rawPoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    return new THREE.CatmullRomCurve3(vectors, true, 'centripetal', 0.25);
  }

  /**
   * Precomputes road coordinate frames and authentic race camber along the circuit
   */
  private precomputeRoadSamples(): void {
    this.samples = [];
    const step = 1 / this.numSamples;

    for (let i = 0; i < this.numSamples; i++) {
      const u = i * step;
      const pt = this.spline.getPointAt(u);
      const tangent = this.spline.getTangentAt(u).normalize();

      // Estimate curvature from tangent difference for natural road camber
      const uNext = (u + 0.004) % 1.0;
      const tangNext = this.spline.getTangentAt(uNext).normalize();
      const crossY = tangent.x * tangNext.z - tangent.z * tangNext.x;
      const bankingRad = THREE.MathUtils.clamp(-crossY * 4.5, -0.06, 0.06);

      const worldUp = new THREE.Vector3(0, 1, 0);
      let binormal = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
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
   * Flat ground plane elevation at Y = 0: ensures zero cliffs, zero falling through world
   */
  public getTerrainElevation(_x: number, _z: number): number {
    return 0.0;
  }

  /**
   * Creates the 3D circuit ribbon road mesh with red/white apex kerbs and 1:1 trimesh collider
   */
  private createTerrainAndRoad(): void {
    // 9 cross-section points: Verge L, Kerb L, Road Edge L, Rut L, Center, Rut R, Road Edge R, Kerb R, Verge R
    const crossOffsets = [-6.2, -5.2, -4.6, -2.2, 0.0, 2.2, 4.6, 5.2, 6.2];
    const crossHeights = [0.01, 0.055, 0.035, 0.04, 0.045, 0.04, 0.035, 0.055, 0.01];
    const N = crossOffsets.length;

    const vertices: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const cRoadAsphalt = new THREE.Color(STAGE_PALETTE.ROAD_ASPHALT);
    const cRoadRut = new THREE.Color(STAGE_PALETTE.ROAD_RUT);
    const cRoadEdge = new THREE.Color(STAGE_PALETTE.ROAD_EDGE);
    const cKerbRed = new THREE.Color(STAGE_PALETTE.KERB_RED);
    const cKerbWhite = new THREE.Color(STAGE_PALETTE.KERB_WHITE);
    const cKerbConcrete = new THREE.Color(STAGE_PALETTE.KERB_CONCRETE);
    const cVerge = new THREE.Color(STAGE_PALETTE.VERGE_GRASS);

    for (let i = 0; i <= this.numSamples; i++) {
      const sample = this.samples[i % this.numSamples];
      const pt = sample.point;
      const binormal = sample.binormal;
      const normal = sample.normal;

      const isCorner = Math.abs(sample.bankingRad) > 0.012;
      const kerbStripeRed = Math.floor(i / 2) % 2 === 0;

      for (let j = 0; j < N; j++) {
        const offset = crossOffsets[j];
        const hOffset = crossHeights[j];

        const vx = pt.x + binormal.x * offset + normal.x * hOffset;
        const vy = pt.y + binormal.y * offset + normal.y * hOffset;
        const vz = pt.z + binormal.z * offset + normal.z * hOffset;

        vertices.push(vx, vy, vz);

        // Assign styling across cross section
        const absOffset = Math.abs(offset);
        let vertexCol: THREE.Color;

        if (absOffset > 5.2) {
          vertexCol = cVerge; // Outer grass verge
        } else if (absOffset > 4.5) {
          // Apex rumble kerb
          if (isCorner) {
            vertexCol = kerbStripeRed ? cKerbRed : cKerbWhite;
          } else {
            vertexCol = cKerbConcrete;
          }
        } else if (absOffset <= 1.0) {
          vertexCol = cRoadAsphalt; // Center crown
        } else if (absOffset <= 3.0) {
          vertexCol = cRoadRut;     // Compacted tyre ruts
        } else {
          vertexCol = cRoadEdge;    // Road shoulder
        }

        // Add subtle per-vertex variation
        const noise = (Math.sin(i * 0.5 + j * 1.5) * 0.02);
        colors.push(
          Math.max(0, Math.min(1, vertexCol.r + noise)),
          Math.max(0, Math.min(1, vertexCol.g + noise)),
          Math.max(0, Math.min(1, vertexCol.b + noise))
        );
      }
    }

    // Connect quads with upward-facing CCW winding
    for (let i = 0; i < this.numSamples; i++) {
      for (let j = 0; j < N - 1; j++) {
        const row1 = i * N;
        const row2 = (i + 1) * N;

        const a = row1 + j;
        const b = row1 + j + 1;
        const c = row2 + j;
        const d = row2 + j + 1;

        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    const roadGeom = new THREE.BufferGeometry();
    roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    roadGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    roadGeom.setIndex(indices);
    roadGeom.computeVertexNormals();

    const roadMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.12,
      flatShading: true,
      side: THREE.DoubleSide,
    });

    const roadMesh = new THREE.Mesh(roadGeom, roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.castShadow = false;
    this.group.add(roadMesh);

    // Large surrounding terrain ground bed (1600m x 1600m) flat at Y = -0.05
    const terrainGeom = new THREE.PlaneGeometry(1600, 1600, 40, 40);
    terrainGeom.rotateX(-Math.PI / 2);
    const terrainPos = terrainGeom.attributes.position;
    const terrainColors: number[] = [];
    const cGrass = new THREE.Color(STAGE_PALETTE.TERRAIN_GRASS);
    const cGrassLit = new THREE.Color(STAGE_PALETTE.TERRAIN_GRASS_LIT);

    for (let k = 0; k < terrainPos.count; k++) {
      terrainPos.setY(k, -0.05);
      const px = terrainPos.getX(k);
      const pz = terrainPos.getZ(k);
      const noise = (Math.sin(px * 0.015) * Math.cos(pz * 0.015) + 1) * 0.5;
      const mixed = cGrass.clone().lerp(cGrassLit, noise * 0.25);
      terrainColors.push(mixed.r, mixed.g, mixed.b);
    }
    terrainGeom.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
    terrainGeom.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.02,
      flatShading: true,
    });
    const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
    terrainMesh.receiveShadow = true;
    this.group.add(terrainMesh);

    // Build Rapier physics colliders: 1:1 exact trimesh for road ribbon and ground bed
    const rapier = this.physics.rapier;
    const roadBody = this.physics.world.createRigidBody(rapier.RigidBodyDesc.fixed());
    const roadColDesc = rapier.ColliderDesc.trimesh(
      new Float32Array(vertices),
      new Uint32Array(indices)
    ).setFriction(0.85).setRestitution(0.0);
    const roadCollider = this.physics.world.createCollider(roadColDesc, roadBody);
    this.physicsColliders.push(roadCollider);

    // Surrounding terrain bed collision: full 1600m x 1600m solid floor prevents falling through world
    const terrainBody = this.physics.world.createRigidBody(rapier.RigidBodyDesc.fixed());
    const terrainVertices = new Float32Array(terrainGeom.attributes.position.array);
    const terrainIndices = new Uint32Array(terrainGeom.index!.array);
    const terrainColDesc = rapier.ColliderDesc.trimesh(
      terrainVertices,
      terrainIndices
    ).setFriction(0.65).setRestitution(0.0);
    const terrainCollider = this.physics.world.createCollider(terrainColDesc, terrainBody);
    this.physicsColliders.push(terrainCollider);

    // Outer boundary walls at 800m perimeter to prevent extreme out-of-bounds escape
    const wallHeight = 25;
    const boundaryWalls = [
      { x: 0, z: -800, hx: 800, hz: 4 },
      { x: 0, z: 800, hx: 800, hz: 4 },
      { x: -800, z: 0, hx: 4, hz: 800 },
      { x: 800, z: 0, hx: 4, hz: 800 },
    ];
    for (const w of boundaryWalls) {
      const bDesc = rapier.RigidBodyDesc.fixed().setTranslation(w.x, wallHeight / 2, w.z);
      const bBody = this.physics.world.createRigidBody(bDesc);
      const cDesc = rapier.ColliderDesc.cuboid(w.hx, wallHeight / 2, w.hz).setFriction(0.3);
      this.physics.world.createCollider(cDesc, bBody);
    }
  }

  /**
   * Start / Finish Line Checkered Grid (painted directly on track at Z = 0)
   */
  private createStartFinishLine(): void {
    const checkerGroup = new THREE.Group();
    const rows = 4;
    const cols = 14;
    const tileW = 9.2 / cols;
    const tileL = 2.4 / rows;
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x181a1c });

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isWhite = (r + c) % 2 === 0;
        const geom = new THREE.PlaneGeometry(tileW * 0.96, tileL * 0.96);
        geom.rotateX(-Math.PI / 2);
        const tile = new THREE.Mesh(geom, isWhite ? whiteMat : blackMat);
        tile.position.set(
          -4.6 + (c + 0.5) * tileW,
          0.05, // Flush above road surface
          -1.2 + (r + 0.5) * tileL
        );
        tile.receiveShadow = true;
        checkerGroup.add(tile);
      }
    }
    this.group.add(checkerGroup);
  }

  /**
   * Fence-Style Low Motorsport Guardrail:
   * - Height: 0.78m (just above car tyre diameter of 0.66m, sleek & low)
   * - Dual-rail post-and-beam fence design with open gap
   * - Bright galvanized metallic silver with red/white apex stripes (NO black walls)
   * - 1.35m Rapier containment trimesh guarantees the vehicle cannot jump over or go outside
   */
  private createFenceStyleGuardrails(): void {
    const visualVertices: number[] = [];
    const visualColors: number[] = [];
    const visualIndices: number[] = [];

    const physVertices: number[] = [];
    const physIndices: number[] = [];

    const postGroup = new THREE.Group();
    const postHeight = 0.84; // 84 cm tall steel fence post (just above tyres)
    const postGeom = new THREE.BoxGeometry(0.10, postHeight, 0.10);
    const postMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.RAIL_POST),
      roughness: 0.55,
      metalness: 0.65,
      flatShading: true,
    });

    const sides = [-5.5, 5.5]; // Left and Right offsets from centerline (road half-width is 5.0m)

    const cSilver = new THREE.Color(STAGE_PALETTE.RAIL_SILVER);
    const cHazardRed = new THREE.Color(STAGE_PALETTE.HAZARD_RED);
    const cHazardWhite = new THREE.Color(STAGE_PALETTE.HAZARD_WHITE);

    sides.forEach((sideOffset) => {
      let visVertOffset = visualVertices.length / 3;
      let physVertOffset = physVertices.length / 3;
      let prevVisIdx = -1;
      let prevPhysIdx = -1;

      for (let i = 0; i <= this.numSamples; i++) {
        const sample = this.samples[i % this.numSamples];
        const pt = sample.point;
        const binormal = sample.binormal;
        const normal = sample.normal;

        const base = pt.clone().add(binormal.clone().multiplyScalar(sideOffset));

        // 1. VISUAL DUAL-RAIL FENCE MESH:
        // Lower Rail: 0.12m -> 0.38m (height 26cm)
        // Gap: 0.38m -> 0.48m (10cm open gap between rails)
        // Upper Rail: 0.48m -> 0.78m (height 30cm, just above 0.66m car tyre)
        const pLowBot = base.clone().add(normal.clone().multiplyScalar(0.12));
        const pLowTop = base.clone().add(normal.clone().multiplyScalar(0.38));
        const pUpBot  = base.clone().add(normal.clone().multiplyScalar(0.48));
        const pUpTop  = base.clone().add(normal.clone().multiplyScalar(0.78));

        visualVertices.push(pLowBot.x, pLowBot.y, pLowBot.z);
        visualVertices.push(pLowTop.x, pLowTop.y, pLowTop.z);
        visualVertices.push(pUpBot.x,  pUpBot.y,  pUpBot.z);
        visualVertices.push(pUpTop.x,  pUpTop.y,  pUpTop.z);

        const isSharpTurn = Math.abs(sample.bankingRad) > 0.015;
        const isStripeRed = Math.floor(i / 2) % 2 === 0;

        let railColor: THREE.Color;
        if (isSharpTurn) {
          railColor = isStripeRed ? cHazardRed : cHazardWhite;
        } else {
          railColor = cSilver;
        }

        // 4 vertices get the bright silver / red-white hazard color
        for (let v = 0; v < 4; v++) {
          visualColors.push(railColor.r, railColor.g, railColor.b);
        }

        const curVis = visVertOffset;
        visVertOffset += 4;

        if (prevVisIdx !== -1) {
          // Lower Rail Quad (pLowBot -> pLowTop)
          visualIndices.push(prevVisIdx + 0, curVis + 0, prevVisIdx + 1);
          visualIndices.push(prevVisIdx + 1, curVis + 0, curVis + 1);
          visualIndices.push(prevVisIdx + 0, prevVisIdx + 1, curVis + 0);
          visualIndices.push(prevVisIdx + 1, curVis + 1, curVis + 0);

          // Upper Rail Quad (pUpBot -> pUpTop)
          visualIndices.push(prevVisIdx + 2, curVis + 2, prevVisIdx + 3);
          visualIndices.push(prevVisIdx + 3, curVis + 2, curVis + 3);
          visualIndices.push(prevVisIdx + 2, prevVisIdx + 3, curVis + 2);
          visualIndices.push(prevVisIdx + 3, curVis + 3, curVis + 2);
        }
        prevVisIdx = curVis;

        // Upright fence post every 2 samples (~6.6m)
        if (i % 2 === 0 && i < this.numSamples) {
          const post = new THREE.Mesh(postGeom, postMat);
          post.position.set(base.x, base.y + postHeight * 0.5, base.z);
          post.castShadow = true;
          postGroup.add(post);
        }

        // 2. PHYSICS CONTAINMENT COLLIDER MESH:
        // Extends from ground (Y = 0.0m) up to 1.35m height
        // Guarantees the vehicle CANNOT jump over or slip outside the track
        const physBot = base.clone();
        const physTop = base.clone().add(normal.clone().multiplyScalar(1.35));

        physVertices.push(physBot.x, physBot.y, physBot.z);
        physVertices.push(physTop.x, physTop.y, physTop.z);

        const curPhys = physVertOffset;
        physVertOffset += 2;

        if (prevPhysIdx !== -1) {
          physIndices.push(prevPhysIdx, curPhys, prevPhysIdx + 1);
          physIndices.push(prevPhysIdx + 1, curPhys, curPhys + 1);
          physIndices.push(prevPhysIdx, prevPhysIdx + 1, curPhys);
          physIndices.push(prevPhysIdx + 1, curPhys + 1, curPhys);
        }
        prevPhysIdx = curPhys;
      }
    });

    const railGeom = new THREE.BufferGeometry();
    railGeom.setAttribute('position', new THREE.Float32BufferAttribute(visualVertices, 3));
    railGeom.setAttribute('color', new THREE.Float32BufferAttribute(visualColors, 3));
    railGeom.setIndex(visualIndices);
    railGeom.computeVertexNormals();

    const railMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.75,
      roughness: 0.22,
      flatShading: true,
      side: THREE.DoubleSide,
    });

    const railMesh = new THREE.Mesh(railGeom, railMat);
    railMesh.castShadow = true;
    railMesh.receiveShadow = true;
    this.group.add(railMesh);
    this.group.add(postGroup);

    // Static Rapier deflection barrier collider (height 1.35m, friction 0.10, restitution 0.15)
    const rapier = this.physics.rapier;
    const railBody = this.physics.world.createRigidBody(rapier.RigidBodyDesc.fixed());
    const railColDesc = rapier.ColliderDesc.trimesh(
      new Float32Array(physVertices),
      new Uint32Array(physIndices)
    ).setFriction(0.10).setRestitution(0.15);
    const railCollider = this.physics.world.createCollider(railColDesc, railBody);
    this.physicsColliders.push(railCollider);
  }

  /**
   * Surface query for vehicle tyre grip: returns 'Tarmac' (1.0) on track or 'Grass' (0.48) on verge
   */
  public getSurfaceAt(x: number, z: number): { name: string; multiplier: number } {
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
      return { name: 'Tarmac', multiplier: 1.0 };
    }
    return { name: 'Grass', multiplier: 0.48 };
  }
}
