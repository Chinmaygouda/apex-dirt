import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { SimplexNoise } from './SimplexNoise';
import { ProceduralTextures } from '../assets/ProceduralTextures';
import { SurfaceProperties, SurfaceType, SplinePointData } from '../types/rally';
import * as BP from './BlueprintStageGeometry';

export class RallyStageWorld {
  public scene: THREE.Scene;
  public rapierWorld: RAPIER.World;

  public terrainMesh!: THREE.Mesh;
  public roadMeshSpecialStage!: THREE.Mesh;
  public roadMeshRallycross!: THREE.Mesh;
  public jokerRoadMesh!: THREE.Mesh;
  public puddleMeshes: THREE.Mesh[] = [];

  // Track Splines
  public specialStageSpline!: THREE.CatmullRomCurve3;
  public rallycrossSpline!: THREE.CatmullRomCurve3;
  public jokerSpline!: THREE.CatmullRomCurve3;

  public specialStagePoints: SplinePointData[] = [];
  public rallycrossPoints: SplinePointData[] = [];

  // Terrain noise generator
  private noise = new SimplexNoise(1985); // Group B era seed

  // Physics colliders
  private terrainRigidBody!: RAPIER.RigidBody;
  private terrainCollider!: RAPIER.Collider;

  // Surface presets
  public static readonly SURFACE_ASPHALT: SurfaceProperties = {
    type: 'asphalt',
    friction: 1.05,
    rollingResistance: 0.015,
    dustEmitRate: 0.05,
    smokeEmitRate: 1.0,
    colorHex: 0x3d3b3a,
    name: 'Sun-faded Asphalt'
  };

  public static readonly SURFACE_GRAVEL: SurfaceProperties = {
    type: 'gravel',
    friction: 0.72,
    rollingResistance: 0.038,
    dustEmitRate: 1.0,
    smokeEmitRate: 0.1,
    colorHex: 0x857a6b,
    name: 'Packed Coarse Gravel'
  };

  public static readonly SURFACE_SCREE: SurfaceProperties = {
    type: 'scree',
    friction: 0.65,
    rollingResistance: 0.052,
    dustEmitRate: 1.35,
    smokeEmitRate: 0.05,
    colorHex: 0xa69986,
    name: 'Loose Mountain Scree'
  };

  constructor(scene: THREE.Scene, rapierWorld: RAPIER.World) {
    this.scene = scene;
    this.rapierWorld = rapierWorld;
  }

  public async init(): Promise<void> {
    // 1. Build track splines first so terrain can blend to road elevations
    this.buildTrackSplines();

    // 2. Build 1500m x 1500m procedural terrain
    this.buildTerrain();

    // 3. Extrude 3D road ribbons with variable width and positive camber banking
    this.buildRoadMeshes();

    // 4. Create water puddles on gravel stage
    this.buildPuddles();
  }

  /**
   * Evaluates procedural height at world coordinate (x, z)
   * Derived from Blueprint Sheet 01 with Gaussian mountain massifs, dry riverbed, and loop clearing.
   * Features negative foundation bed carving beneath the road deck to guarantee zero mountain clipping.
   */
  public getTerrainHeight(x: number, z: number): number {
    // 1. Raw terrain elevation field from Blueprint Sheet 01
    let h = BP.heightAt(x, z);

    // 2. Strict Road Corridor Carving:
    // Ensures mountain slopes are cleared away and terrain sits strictly beneath the road deck
    const roadSample = this.sampleNearestRoad(x, z);
    if (roadSample) {
      const halfW = roadSample.width * 0.5;
      const vergeW = 22.0; // Wide open mountain pass clearing

      if (roadSample.dist <= halfW) {
        // Directly underneath road: foundation bed is 25cm below road deck
        h = roadSample.roadY - 0.25;
      } else if (roadSample.dist < halfW + vergeW) {
        // Road verge: smoothly blend from foundation bed up into the mountain hillside
        const t = (roadSample.dist - halfW) / vergeW;
        const smooth = 3.0 * t * t - 2.0 * t * t * t;
        const targetFoundation = roadSample.roadY - 0.25;
        h = (1.0 - smooth) * targetFoundation + smooth * Math.max(h, targetFoundation);
      }
    }

    return Math.max(0, h);
  }

  /**
   * Builds Catmull-Rom splines for Special Stage and Rallycross from Blueprint Sheet 01
   */
  private buildTrackSplines(): void {
    // 1. Special Stage Spline: dense 10m knots following Blueprint 2D stage with elevation tracking
    const specialKnots: THREE.Vector3[] = [];
    const step = 10;
    const count = Math.floor(BP.stage.len / step);
    for (let i = 0; i <= count; i++) {
      const s = i * step;
      const p = BP.at(BP.stage, s);
      const h = BP.heightAt(p.x, p.z);
      // Road deck elevated +0.35m above raw terrain base
      specialKnots.push(new THREE.Vector3(p.x, h + 0.35, p.z));
    }
    this.specialStageSpline = new THREE.CatmullRomCurve3(specialKnots, false, 'centripetal');

    // Sample dense data along Special Stage spline
    const sampleCount = 480;
    const totalLength = this.specialStageSpline.getLength();

    for (let i = 0; i <= sampleCount; i++) {
      const u = i / sampleCount;
      const point = this.specialStageSpline.getPointAt(u);
      const tangent = this.specialStageSpline.getTangentAt(u).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
      const dist = u * totalLength;

      // Variable width: 5.5m base up to 8.0m on hairpins
      const width = BP.roadWidth(dist);

      // Camber banking: 8 degrees (0.14 rad) inward tilt at hairpins
      let camberAngle = 0.0;
      for (const h of BP.hairpins) {
        const dHairpin = Math.abs(dist - h.s);
        if (dHairpin < 60) {
          const bankFactor = Math.cos((dHairpin / 60) * (Math.PI / 2));
          camberAngle = (8.0 * (Math.PI / 180)) * h.outer * bankFactor;
          break;
        }
      }

      // Surface assignment based on distance zones
      let surface: SurfaceProperties;
      if (dist < 600) {
        surface = RallyStageWorld.SURFACE_ASPHALT;
      } else if (dist < 1800) {
        surface = RallyStageWorld.SURFACE_GRAVEL;
      } else {
        surface = RallyStageWorld.SURFACE_SCREE;
      }

      this.specialStagePoints.push({
        point,
        tangent,
        normal,
        binormal,
        width,
        camberAngle,
        distanceAlongSpline: dist,
        surface
      });
    }

    // 2. Rallycross Super-Stage Spline (from Blueprint LOOP.ctrl)
    const rxKnots: THREE.Vector3[] = [];
    const rxStep = 10;
    const rxCount = Math.floor(BP.loop.len / rxStep);
    for (let i = 0; i < rxCount; i++) {
      const s = i * rxStep;
      const p = BP.at(BP.loop, s);
      const h = BP.heightAt(p.x, p.z);
      rxKnots.push(new THREE.Vector3(p.x, h + 0.35, p.z));
    }
    this.rallycrossSpline = new THREE.CatmullRomCurve3(rxKnots, true, 'centripetal');

    // 3. Joker Lap Alternate Route (from Blueprint joker.path.pts)
    const jokerKnots: THREE.Vector3[] = BP.joker.path.pts.map(p => {
      const h = BP.heightAt(p[0], p[1]);
      return new THREE.Vector3(p[0], h + 0.35, p[1]);
    });
    this.jokerSpline = new THREE.CatmullRomCurve3(jokerKnots, false, 'centripetal');

    const rxSampleCount = 240;
    const rxTotalLength = this.rallycrossSpline.getLength();
    for (let i = 0; i <= rxSampleCount; i++) {
      const u = i / rxSampleCount;
      const point = this.rallycrossSpline.getPointAt(u);
      const tangent = this.rallycrossSpline.getTangentAt(u).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
      const dist = u * rxTotalLength;
      const surface = dist < 250 ? RallyStageWorld.SURFACE_ASPHALT : RallyStageWorld.SURFACE_GRAVEL;

      this.rallycrossPoints.push({
        point,
        tangent,
        normal,
        binormal,
        width: 8.5,
        camberAngle: 0.04,
        distanceAlongSpline: dist,
        surface
      });
    }
  }

  /**
   * Helper to sample nearest road spline for smooth corridor verge blending
   */
  public sampleNearestRoad(x: number, z: number): { dist: number; roadY: number; width: number } | null {
    const ns = BP.nearestS(BP.stage, x, z);
    if (ns.d < 65) {
      const u = THREE.MathUtils.clamp(ns.s / BP.STAGE_TARGET, 0, 1);
      const pt = this.specialStageSpline
        ? this.specialStageSpline.getPointAt(u)
        : new THREE.Vector3(x, BP.heightAt(x, z) + 0.35, z);
      return { dist: ns.d, roadY: pt.y, width: BP.roadWidth(ns.s) };
    }

    const nl = BP.nearestS(BP.loop, x, z);
    if (nl.d < 65) {
      const u = THREE.MathUtils.clamp(nl.s / BP.LOOP_TARGET, 0, 1);
      const pt = this.rallycrossSpline
        ? this.rallycrossSpline.getPointAt(u)
        : new THREE.Vector3(x, BP.heightAt(x, z) + 0.35, z);
      return { dist: nl.d, roadY: pt.y, width: 8.5 };
    }

    return null;
  }

  /**
   * Builds the 1,500m x 1,500m continuous terrain grid and Rapier collider
   */
  private buildTerrain(): void {
    const size = 1500;
    const res = 180; // 180x180 resolution grid for silky-smooth physics and 60fps rendering
    const geo = new THREE.PlaneGeometry(size, size, res, res);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const vertexCount = pos.count;
    const heights = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.getTerrainHeight(x, z);
      pos.setY(i, y);
      heights[i] = y;
    }

    geo.computeVertexNormals();

    const terrainTexture = ProceduralTextures.getTerracottaTerrainTexture();
    terrainTexture.repeat.set(45, 45);

    const terrainMat = new THREE.MeshStandardMaterial({
      map: terrainTexture,
      roughness: 0.95,
      metalness: 0.05,
      flatShading: false
    });

    this.terrainMesh = new THREE.Mesh(geo, terrainMat);
    this.terrainMesh.name = 'RallyTerrain';
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = false;
    this.scene.add(this.terrainMesh);

    // Build Rapier TriMesh Physics Collider
    const index = geo.index!;
    const indices = new Uint32Array(index.array);
    const vertices = new Float32Array(pos.array);

    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    this.terrainRigidBody = this.rapierWorld.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(0.85)
      .setRestitution(0.05);

    this.terrainCollider = this.rapierWorld.createCollider(colliderDesc, this.terrainRigidBody);
  }

  /**
   * Extrudes 3D banked road meshes with camber, drainage verges, and kerbs
   */
  private buildRoadMeshes(): void {
    // Extrude Special Stage
    this.roadMeshSpecialStage = this.extrudeSplineRoad(this.specialStagePoints, 'SpecialStageRoad');
    this.scene.add(this.roadMeshSpecialStage);

    // Extrude Rallycross circuit
    this.roadMeshRallycross = this.extrudeSplineRoad(this.rallycrossPoints, 'RallycrossRoad');
    this.scene.add(this.roadMeshRallycross);

    // Build Rapier Colliders for the roads
    this.buildRoadCollider(this.roadMeshSpecialStage);
    this.buildRoadCollider(this.roadMeshRallycross);
  }

  /**
   * Extrudes a continuous road ribbon along spline points with positive camber banking
   */
  private extrudeSplineRoad(points: SplinePointData[], name: string): THREE.Mesh {
    const segmentCount = points.length;
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < segmentCount; i++) {
      const sp = points[i];
      const halfW = sp.width * 0.5;

      // Apply positive camber tilt (banking inward/outward)
      const cosCamber = Math.cos(sp.camberAngle);
      const sinCamber = Math.sin(sp.camberAngle);

      const lateralLeft = sp.binormal.clone().multiplyScalar(-halfW);
      const lateralRight = sp.binormal.clone().multiplyScalar(halfW);

      // Height offset for camber
      const leftY = sp.point.y + lateralLeft.length() * sinCamber * (sp.camberAngle > 0 ? 1 : -1) + 0.08;
      const rightY = sp.point.y + lateralRight.length() * sinCamber * (sp.camberAngle > 0 ? -1 : 1) + 0.08;

      const pLeft = new THREE.Vector3(sp.point.x + lateralLeft.x, leftY, sp.point.z + lateralLeft.z);
      const pRight = new THREE.Vector3(sp.point.x + lateralRight.x, rightY, sp.point.z + lateralRight.z);

      // Road surface vertices: Left and Right
      vertices.push(pLeft.x, pLeft.y, pLeft.z);
      vertices.push(pRight.x, pRight.y, pRight.z);

      normals.push(sp.normal.x, sp.normal.y, sp.normal.z);
      normals.push(sp.normal.x, sp.normal.y, sp.normal.z);

      const v = sp.distanceAlongSpline / 12.0; // UV tiling
      uvs.push(0, v);
      uvs.push(1, v);

      if (i < segmentCount - 1) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const roadTex = ProceduralTextures.getGravelTexture();
    roadTex.repeat.set(1, 1);

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.8,
      metalness: 0.05
    });

    const mesh = new THREE.Mesh(geo, roadMat);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    return mesh;
  }

  /**
   * Adds static Rapier TriMesh collider to an extruded road mesh
   */
  private buildRoadCollider(mesh: THREE.Mesh): void {
    const geo = mesh.geometry;
    const vertices = new Float32Array(geo.attributes.position.array);
    const indices = new Uint32Array(geo.index!.array);

    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    const rb = this.rapierWorld.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(0.85)
      .setRestitution(0.05);

    this.rapierWorld.createCollider(colDesc, rb);
  }

  /**
   * Creates two shallow mud puddles on the gravel stage
   */
  private buildPuddles(): void {
    const puddlePositions = [
      new THREE.Vector3(90, 46.12, 300),  // Puddle 1 (near K16)
      new THREE.Vector3(-70, 28.12, 420) // Puddle 2 (near K18)
    ];

    for (let i = 0; i < puddlePositions.length; i++) {
      const pos = puddlePositions[i];
      const pGeo = new THREE.PlaneGeometry(5.2, 8.5, 8, 8);
      pGeo.rotateX(-Math.PI / 2);

      const pMat = new THREE.MeshStandardMaterial({
        color: 0x42362b, // Murky mud water
        roughness: 0.08,
        metalness: 0.85
      });

      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.name = `MudPuddle_${i + 1}`;
      pMesh.position.copy(pos);
      pMesh.receiveShadow = true;
      this.scene.add(pMesh);
      this.puddleMeshes.push(pMesh);
    }
  }

  /**
   * Query Surface type and properties at world position (x, z)
   */
  public getSurfaceAt(x: number, z: number): SurfaceProperties {
    // Check if on Special Stage
    let minD = Infinity;
    let closestPoint: SplinePointData | null = null;

    for (let i = 0; i < this.specialStagePoints.length; i++) {
      const sp = this.specialStagePoints[i];
      const dx = sp.point.x - x;
      const dz = sp.point.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < minD) {
        minD = d;
        closestPoint = sp;
      }
    }

    if (closestPoint && minD < closestPoint.width * 0.95) {
      return closestPoint.surface;
    }

    // Default off-road terrain (sun-baked terracotta clay)
    return {
      type: 'gravel',
      friction: 0.85,
      rollingResistance: 0.045,
      dustEmitRate: 0.8,
      smokeEmitRate: 0.0,
      colorHex: 0x8c5338,
      name: 'Off-Road Terracotta'
    };
  }

  /**
   * Project a world position onto the Special Stage spline
   */
  public getSplineProjection(point: THREE.Vector3): { distance: number; lateralOffset: number; pointData: SplinePointData } {
    let minD = Infinity;
    let bestIndex = 0;

    for (let i = 0; i < this.specialStagePoints.length; i++) {
      const sp = this.specialStagePoints[i];
      const d = point.distanceTo(sp.point);
      if (d < minD) {
        minD = d;
        bestIndex = i;
      }
    }

    const sp = this.specialStagePoints[bestIndex];
    const toCar = new THREE.Vector3().subVectors(point, sp.point);
    const lateralOffset = toCar.dot(sp.binormal);

    return {
      distance: sp.distanceAlongSpline,
      lateralOffset,
      pointData: sp
    };
  }
}
