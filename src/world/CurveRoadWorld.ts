import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { CourseGeometry } from './CourseGeometry';
import { WORLD_CONFIG } from './worldConfig';

export class CurveRoadWorld {
  public physicsColliders: any[] = [];
  public physicsBodies: any[] = [];

  constructor() {}

  /**
   * Builds the pure Rapier physics representation of the course.
   * Completely decoupled from Three.js: uses pure math and Rapier colliders.
   */
  public buildPhysics(physics: PhysicsWorld): void {
    const rapier = physics.rapier;
    const world = physics.world;

    // 1. Ground Collider: Flat plane cuboid whose TOP is at y = 0
    // Copied from SandboxEnvironment: friction = 0.9, restitution = 0.0
    const groundBodyDesc = rapier.RigidBodyDesc.fixed().setTranslation(350.0, -0.5, 400.0);
    const groundBody = world.createRigidBody(groundBodyDesc);
    const groundColliderDesc = rapier.ColliderDesc.cuboid(3000.0, 0.5, 3000.0)
      .setFriction(WORLD_CONFIG.groundFriction)
      .setRestitution(WORLD_CONFIG.groundRestitution);
    const groundCollider = world.createCollider(groundColliderDesc, groundBody);
    this.physicsBodies.push(groundBody);
    this.physicsColliders.push(groundCollider);

    // 2. Fence Colliders: Invisible continuous walls on each side following the road.
    // Total height: 2.0m tall, 2.0m thick, overlapping boxes every 4m of arc length (extended 0.6m beyond ends).
    // Built with an upper tier (y in [0.8, 2.0]) at 6.6m from centreline and a lower tier (y in [0.0, 0.8]) recessed
    // to 6.8m. This guarantees the chassis (y in [0.50, 1.14]) is solidly contained at 6.6m, while wheel anchors (y=0.61)
    // and downward suspension raycasts remain in clear space so discrete penetration never triggers false compression.
    const postSpacing = WORLD_CONFIG.postSpacing;
    const halfLen = (postSpacing + 2.0 * WORLD_CONFIG.fenceOverhang) * 0.5; // 2.6m
    const fenceDist = WORLD_CONFIG.fenceColliderCentre; // 6.6m

    const splitY = 0.80;
    const recess = 0.20;

    // Upper tier: y in [0.80, 2.00] (height = 1.20m, halfH = 0.60m, centerY = 1.40m)
    const upperHeight = WORLD_CONFIG.fenceHeight - splitY;
    const upperHalfH = upperHeight * 0.5;
    const upperCenterY = splitY + upperHalfH;
    const upperHalfThick = WORLD_CONFIG.fenceThickness * 0.5; // 1.0m

    // Lower tier: y in [0.00, 0.80] (height = 0.80m, halfH = 0.40m, centerY = 0.40m)
    const lowerHalfH = splitY * 0.5;
    const lowerCenterY = splitY * 0.5;
    const lowerDist = fenceDist + recess; // 6.80m
    const lowerHalfThick = WORLD_CONFIG.fenceThickness * 0.5; // 1.0m

    const startS = WORLD_CONFIG.endBarrierStartS; // -2.0m
    const endS = WORLD_CONFIG.endBarrierEndS;     // 1470.0m

    for (let s = startS; s <= endS + postSpacing * 0.5; s += postSpacing) {
      const pt = CourseGeometry.sample(s);
      const h = pt.heading;
      const cosH = Math.cos(h);
      const sinH = Math.sin(h);

      const qy = Math.sin(h * 0.5);
      const qw = Math.cos(h * 0.5);

      // Right fence - Upper
      const courseXR_up = pt.x + fenceDist * cosH;
      const courseZR_up = pt.z - fenceDist * sinH;
      const bodyR_up = world.createRigidBody(
        rapier.RigidBodyDesc.fixed()
          .setTranslation(courseXR_up + WORLD_CONFIG.rigidTransform.transX, upperCenterY, courseZR_up + WORLD_CONFIG.rigidTransform.transZ)
          .setRotation({ x: 0.0, y: qy, z: 0.0, w: qw })
      );
      const colR_up = world.createCollider(
        rapier.ColliderDesc.cuboid(upperHalfThick, upperHalfH, halfLen)
          .setFriction(WORLD_CONFIG.fenceFriction)
          .setRestitution(WORLD_CONFIG.fenceRestitution),
        bodyR_up
      );
      this.physicsBodies.push(bodyR_up);
      this.physicsColliders.push(colR_up);

      // Right fence - Lower
      const courseXR_low = pt.x + lowerDist * cosH;
      const courseZR_low = pt.z - lowerDist * sinH;
      const bodyR_low = world.createRigidBody(
        rapier.RigidBodyDesc.fixed()
          .setTranslation(courseXR_low + WORLD_CONFIG.rigidTransform.transX, lowerCenterY, courseZR_low + WORLD_CONFIG.rigidTransform.transZ)
          .setRotation({ x: 0.0, y: qy, z: 0.0, w: qw })
      );
      const colR_low = world.createCollider(
        rapier.ColliderDesc.cuboid(lowerHalfThick, lowerHalfH, halfLen)
          .setFriction(WORLD_CONFIG.fenceFriction)
          .setRestitution(WORLD_CONFIG.fenceRestitution),
        bodyR_low
      );
      this.physicsBodies.push(bodyR_low);
      this.physicsColliders.push(colR_low);

      // Left fence - Upper
      const courseXL_up = pt.x - fenceDist * cosH;
      const courseZL_up = pt.z + fenceDist * sinH;
      const bodyL_up = world.createRigidBody(
        rapier.RigidBodyDesc.fixed()
          .setTranslation(courseXL_up + WORLD_CONFIG.rigidTransform.transX, upperCenterY, courseZL_up + WORLD_CONFIG.rigidTransform.transZ)
          .setRotation({ x: 0.0, y: qy, z: 0.0, w: qw })
      );
      const colL_up = world.createCollider(
        rapier.ColliderDesc.cuboid(upperHalfThick, upperHalfH, halfLen)
          .setFriction(WORLD_CONFIG.fenceFriction)
          .setRestitution(WORLD_CONFIG.fenceRestitution),
        bodyL_up
      );
      this.physicsBodies.push(bodyL_up);
      this.physicsColliders.push(colL_up);

      // Left fence - Lower
      const courseXL_low = pt.x - lowerDist * cosH;
      const courseZL_low = pt.z + lowerDist * sinH;
      const bodyL_low = world.createRigidBody(
        rapier.RigidBodyDesc.fixed()
          .setTranslation(courseXL_low + WORLD_CONFIG.rigidTransform.transX, lowerCenterY, courseZL_low + WORLD_CONFIG.rigidTransform.transZ)
          .setRotation({ x: 0.0, y: qy, z: 0.0, w: qw })
      );
      const colL_low = world.createCollider(
        rapier.ColliderDesc.cuboid(lowerHalfThick, lowerHalfH, halfLen)
          .setFriction(WORLD_CONFIG.fenceFriction)
          .setRestitution(WORLD_CONFIG.fenceRestitution),
        bodyL_low
      );
      this.physicsBodies.push(bodyL_low);
      this.physicsColliders.push(colL_low);
    }

    // 3. End Barriers: Across corridor at s = -2 and s = 1470
    // 2m thick, 2m tall, perpendicular to local heading
    const barrierHalfWidth = WORLD_CONFIG.endBarrierWidth * 0.5; // 16.0m
    const barrierHalfThick = WORLD_CONFIG.endBarrierThickness * 0.5; // 1.0m
    const barrierHalfHeight = WORLD_CONFIG.endBarrierHeight * 0.5; // 1.0m

    // Start barrier (s = -2.0)
    const ptStart = CourseGeometry.sample(WORLD_CONFIG.endBarrierStartS);
    const startH = ptStart.heading;
    const startQy = Math.sin(startH * 0.5);
    const startQw = Math.cos(startH * 0.5);
    const startWX = ptStart.x + WORLD_CONFIG.rigidTransform.transX;
    const startWZ = ptStart.z + WORLD_CONFIG.rigidTransform.transZ;

    const startBodyDesc = rapier.RigidBodyDesc.fixed()
      .setTranslation(startWX, barrierHalfHeight, startWZ)
      .setRotation({ x: 0.0, y: startQy, z: 0.0, w: startQw });
    const startBody = world.createRigidBody(startBodyDesc);
    const startColDesc = rapier.ColliderDesc.cuboid(barrierHalfWidth, barrierHalfHeight, barrierHalfThick)
      .setFriction(WORLD_CONFIG.barrierFriction)
      .setRestitution(WORLD_CONFIG.barrierRestitution);
    const startCol = world.createCollider(startColDesc, startBody);
    this.physicsBodies.push(startBody);
    this.physicsColliders.push(startCol);

    // Far end barrier (s = 1470.0)
    const ptEnd = CourseGeometry.sample(WORLD_CONFIG.endBarrierEndS);
    const endH = ptEnd.heading;
    const endQy = Math.sin(endH * 0.5);
    const endQw = Math.cos(endH * 0.5);
    const endWX = ptEnd.x + WORLD_CONFIG.rigidTransform.transX;
    const endWZ = ptEnd.z + WORLD_CONFIG.rigidTransform.transZ;

    const endBodyDesc = rapier.RigidBodyDesc.fixed()
      .setTranslation(endWX, barrierHalfHeight, endWZ)
      .setRotation({ x: 0.0, y: endQy, z: 0.0, w: endQw });
    const endBody = world.createRigidBody(endBodyDesc);
    const endColDesc = rapier.ColliderDesc.cuboid(barrierHalfWidth, barrierHalfHeight, barrierHalfThick)
      .setFriction(WORLD_CONFIG.barrierFriction)
      .setRestitution(WORLD_CONFIG.barrierRestitution);
    const endCol = world.createCollider(endColDesc, endBody);
    this.physicsBodies.push(endBody);
    this.physicsColliders.push(endCol);
  }

  public async buildVisuals(scene: THREE.Scene): Promise<void> {
    const transX = WORLD_CONFIG.rigidTransform.transX;
    const transZ = WORLD_CONFIG.rigidTransform.transZ;

    // 1. Flat Ground: One large muted green-brown plane (4000x4000m)
    // Edge is never visible from anywhere on the road (fog density 0.0018)
    const groundGeo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x556a47, // Muted green-brown low-poly look
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(350 + transX, 0, 400 + transZ);
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // 2. Road Ribbon: 8m wide analytic centreline ribbon
    // Sampled every 2m on straights/gentle arcs, every 1m on the hairpin (s in [869.9, 922.3])
    // Elevated by 0.02m with polygonOffset to avoid z-fighting. Darker edge strips on both sides.
    const roadPoints: Array<{ s: number; x: number; z: number; heading: number }> = [];
    let sPos = 0;
    while (sPos < CourseGeometry.totalLength) {
      const pt = CourseGeometry.sample(sPos);
      roadPoints.push({ s: sPos, x: pt.x, z: pt.z, heading: pt.heading });
      const step = (sPos >= 869.9 && sPos <= 922.3) ? 1.0 : 2.0;
      sPos = Math.min(CourseGeometry.totalLength, sPos + step);
      if (sPos === CourseGeometry.totalLength) {
        const endPt = CourseGeometry.sample(sPos);
        roadPoints.push({ s: sPos, x: endPt.x, z: endPt.z, heading: endPt.heading });
        break;
      }
    }

    const roadElevation = 0.02;
    const roadHalfW = WORLD_CONFIG.roadHalfWidth; // 4.0m
    const edgeStripW = 0.40; // 40cm darker edge strip
    const innerW = roadHalfW - edgeStripW; // 3.6m

    // Vertices per slice:
    // 0: left outer (-4.0m)
    // 1: left inner strip (-3.6m)
    // 2: right inner strip (+3.6m)
    // 3: right outer (+4.0m)
    const positions: number[] = [];
    const normals: number[] = [];
    const mainIndices: number[] = [];
    const edgeIndices: number[] = [];

    for (let i = 0; i < roadPoints.length; i++) {
      const rp = roadPoints[i];
      const cosH = Math.cos(rp.heading);
      const sinH = Math.sin(rp.heading);
      const wx = rp.x + transX;
      const wz = rp.z + transZ;

      // Normal to heading: (cosH, -sinH) is right normal, (-cosH, sinH) is left normal
      const nxR = cosH;
      const nzR = -sinH;

      const v0x = wx - roadHalfW * nxR;
      const v0z = wz - roadHalfW * nzR;

      const v1x = wx - innerW * nxR;
      const v1z = wz - innerW * nzR;

      const v2x = wx + innerW * nxR;
      const v2z = wz + innerW * nzR;

      const v3x = wx + roadHalfW * nxR;
      const v3z = wz + roadHalfW * nzR;

      positions.push(
        v0x, roadElevation, v0z,
        v1x, roadElevation, v1z,
        v2x, roadElevation, v2z,
        v3x, roadElevation, v3z
      );

      normals.push(
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0
      );

      if (i > 0) {
        const curr = i * 4;
        const prev = (i - 1) * 4;

        // Left edge strip (v0..v1)
        edgeIndices.push(
          prev + 0, curr + 0, curr + 1,
          prev + 0, curr + 1, prev + 1
        );

        // Center main road (v1..v2)
        mainIndices.push(
          prev + 1, curr + 1, curr + 2,
          prev + 1, curr + 2, prev + 2
        );

        // Right edge strip (v2..v3)
        edgeIndices.push(
          prev + 2, curr + 2, curr + 3,
          prev + 2, curr + 3, prev + 3
        );
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

    // Combine indices and assign material groups
    const combinedIndices = [...mainIndices, ...edgeIndices];
    roadGeo.setIndex(combinedIndices);
    roadGeo.addGroup(0, mainIndices.length, 0);
    roadGeo.addGroup(mainIndices.length, edgeIndices.length, 1);

    const roadMatMain = new THREE.MeshStandardMaterial({
      color: 0x766d64, // Dirt / packed gravel
      roughness: 0.90,
      metalness: 0.05,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
    });
    const roadMatEdge = new THREE.MeshStandardMaterial({
      color: 0x4d4742, // Slightly darker edge strips
      roughness: 0.90,
      metalness: 0.05,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
    });

    const roadMesh = new THREE.Mesh(roadGeo, [roadMatMain, roadMatEdge]);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    // 3. Fences on BOTH sides along the whole road
    // Visual line at 6.0m from centreline, ~1.0m tall, two rails (heights 0.45 and 0.90),
    // and posts every 4m measured along arc length. InstancedMesh (one for posts, one for rails).
    const visualFenceDist = WORLD_CONFIG.fenceLine; // 6.0m
    const postSpacing = WORLD_CONFIG.postSpacing;   // 4.0m
    const fenceMat = new THREE.MeshStandardMaterial({
      color: 0xd8d8d4, // Muted silver/white
      roughness: 0.75,
      metalness: 0.15,
      flatShading: true,
    });

    // Sample fence post positions on both left and right sides
    const leftPosts: THREE.Vector3[] = [];
    const rightPosts: THREE.Vector3[] = [];

    for (let s = 0; s <= CourseGeometry.totalLength; s += postSpacing) {
      const pt = CourseGeometry.sample(s);
      const cosH = Math.cos(pt.heading);
      const sinH = Math.sin(pt.heading);
      const wx = pt.x + transX;
      const wz = pt.z + transZ;

      // Right fence post (at +6.0m from centreline)
      rightPosts.push(new THREE.Vector3(wx + visualFenceDist * cosH, 0.50, wz - visualFenceDist * sinH));

      // Left fence post (at -6.0m from centreline)
      leftPosts.push(new THREE.Vector3(wx - visualFenceDist * cosH, 0.50, wz + visualFenceDist * sinH));
    }

    const totalPosts = leftPosts.length + rightPosts.length;
    const postGeo = new THREE.BoxGeometry(0.12, 1.0, 0.12);
    const postInstancedMesh = new THREE.InstancedMesh(postGeo, fenceMat, totalPosts);
    postInstancedMesh.castShadow = true;
    postInstancedMesh.receiveShadow = true;

    const dummyObj = new THREE.Object3D();
    let postIdx = 0;

    for (const p of rightPosts) {
      dummyObj.position.copy(p);
      dummyObj.rotation.set(0, 0, 0);
      dummyObj.scale.set(1, 1, 1);
      dummyObj.updateMatrix();
      postInstancedMesh.setMatrixAt(postIdx++, dummyObj.matrix);
    }
    for (const p of leftPosts) {
      dummyObj.position.copy(p);
      dummyObj.rotation.set(0, 0, 0);
      dummyObj.scale.set(1, 1, 1);
      dummyObj.updateMatrix();
      postInstancedMesh.setMatrixAt(postIdx++, dummyObj.matrix);
    }
    postInstancedMesh.instanceMatrix.needsUpdate = true;
    scene.add(postInstancedMesh);

    // Rails: Two rails per span (heights y=0.45 and y=0.90)
    const spanCount = (leftPosts.length - 1) + (rightPosts.length - 1);
    const totalRails = spanCount * 2;
    // Base rail geometry unit length along Z
    const railGeo = new THREE.BoxGeometry(0.06, 0.10, 1.0);
    const railInstancedMesh = new THREE.InstancedMesh(railGeo, fenceMat, totalRails);
    railInstancedMesh.castShadow = true;
    railInstancedMesh.receiveShadow = true;

    let railIdx = 0;
    const railHeights = [0.45, 0.90];

    const addRailsForFence = (posts: THREE.Vector3[]) => {
      for (let i = 0; i < posts.length - 1; i++) {
        const pA = posts[i];
        const pB = posts[i + 1];
        const dx = pB.x - pA.x;
        const dz = pB.z - pA.z;
        const spanDist = Math.hypot(dx, dz);
        const yaw = Math.atan2(dx, dz);
        const midX = (pA.x + pB.x) * 0.5;
        const midZ = (pA.z + pB.z) * 0.5;

        for (const ry of railHeights) {
          dummyObj.position.set(midX, ry, midZ);
          dummyObj.rotation.set(0, yaw, 0);
          dummyObj.scale.set(1, 1, spanDist);
          dummyObj.updateMatrix();
          railInstancedMesh.setMatrixAt(railIdx++, dummyObj.matrix);
        }
      }
    };

    addRailsForFence(rightPosts);
    addRailsForFence(leftPosts);
    railInstancedMesh.instanceMatrix.needsUpdate = true;
    scene.add(railInstancedMesh);

    // 4. End Barriers: Solid striped low barrier block across the road at BOTH ends
    // Start end at s = -2, far end at s = 1470, perpendicular to local heading.
    const createStripedBarrier = (sLoc: number) => {
      const pt = CourseGeometry.sample(sLoc);
      const wx = pt.x + transX;
      const wz = pt.z + transZ;
      const heading = pt.heading;

      // 16m wide across corridor, 0.8m high, 1.0m thick
      const bWidth = 16.0;
      const bHeight = 0.80;
      const bThick = 1.0;

      const barrierGeo = new THREE.BoxGeometry(bWidth, bHeight, bThick);

      // Create procedural red/white hazard stripe canvas texture
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#dc2626'; // Vivid hazard red
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#ffffff'; // White stripes
      const stripeW = 32;
      for (let x = -128; x < 512 + 128; x += stripeW * 2) {
        ctx.beginPath();
        ctx.moveTo(x, 128);
        ctx.lineTo(x + 64, 0);
        ctx.lineTo(x + 64 + stripeW, 0);
        ctx.lineTo(x + stripeW, 128);
        ctx.closePath();
        ctx.fill();
      }

      const stripeTexture = new THREE.CanvasTexture(canvas);
      stripeTexture.wrapS = THREE.RepeatWrapping;
      stripeTexture.wrapT = THREE.ClampToEdgeWrapping;
      stripeTexture.repeat.set(4, 1);

      const barrierMat = new THREE.MeshStandardMaterial({
        map: stripeTexture,
        roughness: 0.70,
        metalness: 0.10,
        flatShading: true,
      });

      const barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
      barrierMesh.position.set(wx, bHeight * 0.5, wz);
      barrierMesh.rotation.y = heading;
      barrierMesh.castShadow = true;
      barrierMesh.receiveShadow = true;
      scene.add(barrierMesh);
    };

    createStripedBarrier(WORLD_CONFIG.endBarrierStartS);
    createStripedBarrier(WORLD_CONFIG.endBarrierEndS);
  }

  public getSurfaceAt(worldX: number, worldZ: number): { name: string; multiplier: number } {
    const courseX = worldX - WORLD_CONFIG.rigidTransform.transX;
    const courseZ = worldZ - WORLD_CONFIG.rigidTransform.transZ;
    const { distance } = CourseGeometry.distToCentreline(courseX, courseZ);
    if (distance <= WORLD_CONFIG.roadHalfWidth) {
      return { name: 'Dirt', multiplier: 0.72 };
    }
    return { name: 'Grass', multiplier: 0.45 };
  }
}
