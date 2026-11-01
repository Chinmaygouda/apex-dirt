import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../physics/PhysicsWorld';

/**
 * Stage Palette Swatches (Curated for a high-end, clean low-poly racing circuit)
 */
export const STAGE_PALETTE = {
  // Road & Surfaces
  ROAD_ASPHALT: '#2b2d30',       // Main asphalt racing line
  ROAD_RUT: '#1e2022',           // Darker compacted tyre rubber line
  ROAD_EDGE: '#36393e',          // Outer road edge
  ROAD_DIRT_SHADOW: '#222528',   // Ground shadow tone for hemisphere light
  KERB_RED: '#d32f2f',           // FIA-spec red apex rumble kerb
  KERB_WHITE: '#f8f9fa',         // FIA-spec white apex rumble kerb
  KERB_CONCRETE: '#85898e',      // Neutral concrete kerb on straights
  VERGE_GRASS: '#4d683a',        // Sage grass road verge
  TERRAIN_GRASS: '#466435',      // Surrounding meadow ground base
  TERRAIN_GRASS_LIT: '#547540',  // Sunlit meadow facet

  // Guardrails & Barriers
  ARMCO_SILVER: '#b0b5ba',       // Galvanized corrugated steel barrier
  ARMCO_POST: '#3a3d40',         // Steel I-beam barrier post
  HAZARD_RED: '#e53935',         // Reflective corner hazard red
  HAZARD_WHITE: '#ffffff',       // Reflective corner hazard white

  // Instanced Trees (Low-Poly)
  PINE_FOLIAGE_DARK: '#22382a',  // Deep coniferous evergreen
  PINE_FOLIAGE_LIT: '#32503c',   // Sunlit pine tips
  BROAD_FOLIAGE_DARK: '#3c5432', // Deciduous deep canopy
  BROAD_FOLIAGE_LIT: '#4f7042',  // Sunlit outer leafy facet
  TREE_TRUNK_TIMBER: '#463c34',  // Weathered bark & timber post

  // Roadside Props & Gantry
  CHEVRON_YELLOW: '#f5b018',     // Corner warning chevron board
  CHEVRON_ARROW: '#181614',      // High-contrast chevron arrow
  GANTRY_STEEL: '#4a4e54',       // Steel lattice gantry structure
  LIGHT_RED: '#ff1744',          // Start light red
  LIGHT_GREEN: '#00e676',        // Start light green
  MARKER_BOARD: '#f5f5f5',       // Distance brake marker board
  MARKER_TEXT: '#111111',        // Marker text black

  // Sky & Atmosphere
  SKY_ZENITH: '#3b526b',         // Clean mountain zenith sky
  SKY_HORIZON: '#8aa8c4',        // Soft blue horizon haze
  FOG_HAZE: '#8aa8c4',           // Horizon depth cue
  CLOUD_WHITE: '#f3f6fa',        // Cumulus cloud highlight
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

  // Tree trunk obstacle circles for ChaseCamera avoidance
  public trunkObstacles: { x: number; z: number; r: number }[] = [];
  public getTrunkObstacles(): { x: number; z: number; r: number }[] {
    return this.trunkObstacles;
  }

  constructor(private scene: THREE.Scene, private physics: PhysicsWorld) {
    this.spline = this.buildSplineRoute();
    this.totalLength = this.spline.getLength();
    this.precomputeRoadSamples();

    this.createTerrainAndRoad();
    this.createStartFinishGantry();
    this.createSideGuardrails();
    this.createInstancedForest();
    this.createRoadsideProps();
    this.createClouds();

    this.scene.add(this.group);
  }

  /**
   * Builds an authentic, exciting 1.68 km closed-circuit racing track at Y = 0.
   * Starts at (0, 0, -50), passes the Start/Finish line at (0, 0, 0) heading +Z,
   * offers a high-speed ~200m main straight, high-speed sweeping curves, technical S-bends,
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

      // Estimate curvature from tangent difference for realistic road camber
      const uNext = (u + 0.004) % 1.0;
      const tangNext = this.spline.getTangentAt(uNext).normalize();
      const crossY = tangent.x * tangNext.z - tangent.z * tangNext.x;
      const bankingRad = THREE.MathUtils.clamp(-crossY * 4.5, -0.06, 0.06); // Up to ~3.5° banking

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
    const crossOffsets = [-7.5, -5.3, -4.8, -2.2, 0.0, 2.2, 4.8, 5.3, 7.5];
    const crossHeights = [-0.01, 0.045, 0.02, 0.035, 0.04, 0.035, 0.02, 0.045, -0.01];
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

        if (absOffset > 5.3) {
          vertexCol = cVerge; // Outer grass verge
        } else if (absOffset > 4.7) {
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
        const noise = (Math.sin(i * 0.5 + j * 1.5) * 0.025);
        colors.push(
          Math.max(0, Math.min(1, vertexCol.r + noise)),
          Math.max(0, Math.min(1, vertexCol.g + noise)),
          Math.max(0, Math.min(1, vertexCol.b + noise))
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
      roughness: 0.88,
      metalness: 0.08,
      flatShading: true,
    });

    const roadMesh = new THREE.Mesh(roadGeom, roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.castShadow = false;
    this.group.add(roadMesh);

    // Large surrounding terrain ground bed (1600m x 1600m) flat at Y = 0.0
    const terrainGeom = new THREE.PlaneGeometry(1600, 1600, 40, 40);
    terrainGeom.rotateX(-Math.PI / 2);
    const terrainPos = terrainGeom.attributes.position;
    const terrainColors: number[] = [];
    const cGrass = new THREE.Color(STAGE_PALETTE.TERRAIN_GRASS);
    const cGrassLit = new THREE.Color(STAGE_PALETTE.TERRAIN_GRASS_LIT);

    for (let k = 0; k < terrainPos.count; k++) {
      terrainPos.setY(k, -0.01);
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
    const wallHeight = 20;
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
   * Start / Finish Line Checkered Grid & Overhead Steel Lattice Gantry
   */
  private createStartFinishGantry(): void {
    const gantryGroup = new THREE.Group();

    // 1. Checkered Start Line Grid (painted on track at Z = 0)
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
          0.045, // Flush above road surface
          -1.2 + (r + 0.5) * tileL
        );
        tile.receiveShadow = true;
        checkerGroup.add(tile);
      }
    }
    gantryGroup.add(checkerGroup);

    // 2. Overhead Steel Lattice Gantry
    const steelMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.GANTRY_STEEL),
      metalness: 0.85,
      roughness: 0.35,
      flatShading: true,
    });

    // Twin support towers on left and right
    const towerGeom = new THREE.BoxGeometry(0.55, 6.0, 0.55);
    const leftTower = new THREE.Mesh(towerGeom, steelMat);
    leftTower.position.set(-6.2, 3.0, 0);
    leftTower.castShadow = true;
    gantryGroup.add(leftTower);

    const rightTower = new THREE.Mesh(towerGeom, steelMat);
    rightTower.position.set(6.2, 3.0, 0);
    rightTower.castShadow = true;
    gantryGroup.add(rightTower);

    // Horizontal truss span across track
    const trussGeom = new THREE.BoxGeometry(13.2, 0.75, 0.85);
    const truss = new THREE.Mesh(trussGeom, steelMat);
    truss.position.set(0, 5.8, 0);
    truss.castShadow = true;
    gantryGroup.add(truss);

    // Gantry Banner
    const bannerGeom = new THREE.BoxGeometry(7.5, 1.2, 0.1);
    const bannerMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.4,
      metalness: 0.5,
    });
    const banner = new THREE.Mesh(bannerGeom, bannerMat);
    banner.position.set(0, 5.8, -0.45);
    banner.castShadow = true;
    gantryGroup.add(banner);

    // Signal Light Pods
    const lightPodGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.15, 8);
    lightPodGeom.rotateX(Math.PI / 2);
    const redLightMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.LIGHT_RED),
      emissive: new THREE.Color(STAGE_PALETTE.LIGHT_RED),
      emissiveIntensity: 0.8,
    });
    const greenLightMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.LIGHT_GREEN),
      emissive: new THREE.Color(STAGE_PALETTE.LIGHT_GREEN),
      emissiveIntensity: 0.8,
    });

    [-1.6, -0.8, 0.0].forEach((x) => {
      const redLight = new THREE.Mesh(lightPodGeom, redLightMat);
      redLight.position.set(x, 5.8, -0.52);
      gantryGroup.add(redLight);
    });
    [0.8, 1.6].forEach((x) => {
      const greenLight = new THREE.Mesh(lightPodGeom, greenLightMat);
      greenLight.position.set(x, 5.8, -0.52);
      gantryGroup.add(greenLight);
    });

    this.group.add(gantryGroup);
  }

  /**
   * Continuous Rally-Spec Double Armco Guardrails along road boundaries with high-visibility hazard stripes
   */
  private createSideGuardrails(): void {
    const railVertices: number[] = [];
    const railColors: number[] = [];
    const railIndices: number[] = [];

    const postGroup = new THREE.Group();
    const postGeom = new THREE.BoxGeometry(0.12, 1.05, 0.12);
    const postMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.ARMCO_POST),
      roughness: 0.85,
      metalness: 0.3,
      flatShading: true,
    });

    const sides = [-5.5, 5.5]; // Left and Right offsets from centerline (road half-width is 5.0m)

    sides.forEach((sideOffset) => {
      let vertOffset = railVertices.length / 3;
      let prevValidIdx = -1;

      for (let i = 0; i <= this.numSamples; i++) {
        const sample = this.samples[i % this.numSamples];
        const pt = sample.point;
        const binormal = sample.binormal;
        const normal = sample.normal;

        const base = pt.clone().add(binormal.clone().multiplyScalar(sideOffset));
        const topY = base.clone().add(normal.clone().multiplyScalar(0.85));
        const botY = base.clone().add(normal.clone().multiplyScalar(0.38));

        railVertices.push(topY.x, topY.y, topY.z);
        railVertices.push(botY.x, botY.y, botY.z);

        // Color: alternating red & white on curves, galvanized silver on straights
        const isSharpTurn = Math.abs(sample.bankingRad) > 0.018;
        const isStripeRed = Math.floor(i / 2) % 2 === 0;

        let r = 0.72, g = 0.75, b = 0.78; // Galvanized silver
        if (isSharpTurn) {
          if (isStripeRed) {
            r = 0.88; g = 0.12; b = 0.14; // Reflective red
          } else {
            r = 0.98; g = 0.98; b = 0.98; // Reflective white
          }
        }

        railColors.push(r, g, b);
        railColors.push(r, g, b);

        const curVert = vertOffset;
        vertOffset += 2;

        if (prevValidIdx !== -1) {
          railIndices.push(prevValidIdx, curVert, prevValidIdx + 1);
          railIndices.push(prevValidIdx + 1, curVert, curVert + 1);
          // Double-sided faces
          railIndices.push(prevValidIdx, prevValidIdx + 1, curVert);
          railIndices.push(prevValidIdx + 1, curVert + 1, curVert);
        }
        prevValidIdx = curVert;

        // Add post every 2 samples (~6.6m)
        if (i % 2 === 0 && i < this.numSamples) {
          const post = new THREE.Mesh(postGeom, postMat);
          post.position.set(base.x, base.y + 0.45, base.z);
          post.castShadow = true;
          postGroup.add(post);
        }
      }
    });

    const railGeom = new THREE.BufferGeometry();
    railGeom.setAttribute('position', new THREE.Float32BufferAttribute(railVertices, 3));
    railGeom.setAttribute('color', new THREE.Float32BufferAttribute(railColors, 3));
    railGeom.setIndex(railIndices);
    railGeom.computeVertexNormals();

    const railMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.75,
      roughness: 0.28,
      flatShading: true,
      side: THREE.DoubleSide,
    });

    const railMesh = new THREE.Mesh(railGeom, railMat);
    railMesh.castShadow = true;
    railMesh.receiveShadow = true;
    this.group.add(railMesh);
    this.group.add(postGroup);

    // Physics collider for guardrails: static trimesh deflection barrier
    const rapier = this.physics.rapier;
    const railBody = this.physics.world.createRigidBody(rapier.RigidBodyDesc.fixed());
    const railColDesc = rapier.ColliderDesc.trimesh(
      new Float32Array(railVertices),
      new Uint32Array(railIndices)
    ).setFriction(0.15).setRestitution(0.20);
    const railCollider = this.physics.world.createCollider(railColDesc, railBody);
    this.physicsColliders.push(railCollider);
  }

  /**
   * Instanced Forest: Neatly clustered faceted pines and broadleaf canopies outside track margins
   */
  private createInstancedForest(): void {
    const totalTrees = 360;
    const numPines = 220;
    const numBroad = 140;

    // 1. Faceted Pine Tree Geometry (stacked faceted cones + trunk)
    const pineTrunkGeom = new THREE.CylinderGeometry(0.32, 0.52, 3.2, 5);
    pineTrunkGeom.translate(0, 1.6, 0);
    const pineFrondGeom1 = new THREE.ConeGeometry(2.8, 3.2, 6);
    pineFrondGeom1.translate(0, 3.6, 0);
    const pineFrondGeom2 = new THREE.ConeGeometry(2.1, 2.8, 6);
    pineFrondGeom2.translate(0, 5.2, 0);
    const pineFrondGeom3 = new THREE.ConeGeometry(1.4, 2.2, 6);
    pineFrondGeom3.translate(0, 6.6, 0);

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

    // Distribute trees safely outside the track margins (14m to 65m from track center)
    const dummy = new THREE.Object3D();
    let pineIdx = 0;
    let broadIdx = 0;

    for (let t = 0; t < totalTrees; t++) {
      const u = (t * (1.0 / totalTrees) + Math.sin(t * 1.6) * 0.005) % 1.0;
      const pt = this.spline.getPointAt(u);
      const tang = this.spline.getTangentAt(u).normalize();
      const binormal = new THREE.Vector3().crossVectors(tang, new THREE.Vector3(0, 1, 0)).normalize();

      const side = (t % 2 === 0 ? 1 : -1);
      // Ensure trees are at least 14m away from centerline (well behind the 5.5m guardrails)
      const distFromRoad = 14.0 + (t % 9) * 4.0 + ((t * 7) % 13) * 1.8;
      const x = pt.x + binormal.x * (side * distFromRoad);
      const z = pt.z + binormal.z * (side * distFromRoad);
      const y = 0.0; // Anchored at ground Y=0

      const scale = 0.85 + (t % 5) * 0.12;
      dummy.position.set(x, y, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.y = t * 0.73;
      dummy.updateMatrix();

      const isPine = (t % 4 !== 0) && pineIdx < numPines;
      if (isPine) {
        pineTrunkMesh.setMatrixAt(pineIdx, dummy.matrix);
        pineFoliageMesh.setMatrixAt(pineIdx, dummy.matrix);
        this.trunkObstacles.push({ x, z, r: 0.6 * scale });
        pineIdx++;
      } else if (broadIdx < numBroad) {
        broadTrunkMesh.setMatrixAt(broadIdx, dummy.matrix);
        broadFoliageMesh.setMatrixAt(broadIdx, dummy.matrix);
        this.trunkObstacles.push({ x, z, r: 0.8 * scale });
        broadIdx++;
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
   * Roadside Props: Brake distance boards ("150", "100", "50") and corner warning chevrons
   */
  private createRoadsideProps(): void {
    const propsGroup = new THREE.Group();

    // 1. High-vis Direction Chevrons at Sharp Turns
    const chevronTurns = [0.08, 0.15, 0.32, 0.42, 0.62, 0.74, 0.88];
    const chevronMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.CHEVRON_YELLOW),
      roughness: 0.4,
      flatShading: true,
    });
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

    chevronTurns.forEach((u) => {
      for (let c = -1; c <= 1; c++) {
        const uSub = (u + c * 0.005 + 1.0) % 1.0;
        const subPt = this.spline.getPointAt(uSub);
        const subTang = this.spline.getTangentAt(uSub).normalize();
        const subBinormal = new THREE.Vector3().crossVectors(subTang, new THREE.Vector3(0, 1, 0)).normalize();

        const boardX = subPt.x + subBinormal.x * 6.5;
        const boardY = 1.1;
        const boardZ = subPt.z + subBinormal.z * 6.5;

        // Post
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5), postMat);
        post.position.set(boardX, boardY - 0.4, boardZ);
        post.castShadow = true;
        propsGroup.add(post);

        // Board
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.06), chevronMat);
        board.position.set(boardX, boardY + 0.25, boardZ);
        board.rotation.y = Math.atan2(subTang.x, subTang.z) + Math.PI / 2;
        board.castShadow = true;
        propsGroup.add(board);

        // Chevron arrow
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 3), arrowMat);
        arrow.rotateZ(Math.PI / 2);
        arrow.position.set(boardX, boardY + 0.25, boardZ + 0.04);
        arrow.rotation.y = board.rotation.y;
        propsGroup.add(arrow);
      }
    });

    // 2. Brake Distance Boards ("150", "100", "50" meter markers before Turn 1 & Carousel)
    const brakeZones = [
      { uApex: 0.08, dists: [150, 100, 50] },
      { uApex: 0.38, dists: [150, 100, 50] },
      { uApex: 0.72, dists: [150, 100, 50] },
    ];

    const markerBoardMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.MARKER_BOARD),
      roughness: 0.5,
      flatShading: true,
    });

    brakeZones.forEach((zone) => {
      zone.dists.forEach((d) => {
        const uMarker = (zone.uApex - (d / this.totalLength) + 1.0) % 1.0;
        const pt = this.spline.getPointAt(uMarker);
        const tang = this.spline.getTangentAt(uMarker).normalize();
        const binormal = new THREE.Vector3().crossVectors(tang, new THREE.Vector3(0, 1, 0)).normalize();

        const mx = pt.x - binormal.x * 6.2;
        const mz = pt.z - binormal.z * 6.2;

        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5), postMat);
        post.position.set(mx, 0.6, mz);
        post.castShadow = true;
        propsGroup.add(post);

        const board = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.05), markerBoardMat);
        board.position.set(mx, 1.15, mz);
        board.rotation.y = Math.atan2(tang.x, tang.z) - Math.PI / 2;
        board.castShadow = true;
        propsGroup.add(board);
      });
    });

    this.group.add(propsGroup);
  }

  /**
   * Procedural Low-Poly 3D Clouds floating gently in the distance
   */
  private createClouds(): void {
    const cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(STAGE_PALETTE.CLOUD_WHITE),
      roughness: 0.9,
      flatShading: true,
    });

    const numClouds = 20;
    for (let c = 0; c < numClouds; c++) {
      const singleCloud = new THREE.Group();
      const numPuffs = 4 + (c % 4);

      for (let p = 0; p < numPuffs; p++) {
        const rad = 22.0 + Math.random() * 18.0;
        const puffGeom = new THREE.IcosahedronGeometry(rad, 1);
        const puff = new THREE.Mesh(puffGeom, cloudMat);
        puff.position.set(
          (p - numPuffs * 0.5) * 20.0 + THREE.MathUtils.randFloatSpread(8),
          THREE.MathUtils.randFloatSpread(6),
          THREE.MathUtils.randFloatSpread(12)
        );
        puff.scale.set(1.0, 0.45, 0.8);
        singleCloud.add(puff);
      }

      const angle = (c / numClouds) * Math.PI * 2;
      const dist = 550.0 + Math.random() * 200.0;
      singleCloud.position.set(
        Math.cos(angle) * dist,
        120.0 + Math.random() * 50.0,
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
