import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { THREE_PALETTE, PALETTE } from '../core/Constants';
import { PhysicsWorld } from '../physics/PhysicsWorld';

export class SandboxEnvironment {
  public group = new THREE.Group();
  private groundCollider!: RAPIER.Collider;

  constructor(private scene: THREE.Scene, private physics: PhysicsWorld) {
    this.createGround();
    this.createSkidPadMarkings();
    this.createSlalomCourse();
    this.createSuspensionRamps();
    this.createTwinGatePosts();
    this.createPerimeterForest();
    this.scene.add(this.group);
  }

  private createGround(): void {
    // Visual ground plane (1200m x 1200m)
    const size = 1200;
    const geometry = new THREE.PlaneGeometry(size, size, 120, 120);
    geometry.rotateX(-Math.PI / 2);

    // Apply vertex colors for low-poly subtle variation
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const c1 = THREE_PALETTE.roadDirtLit;
    const c2 = THREE_PALETTE.roadDirtShadow;
    const tempColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const alpha = 0.5 + 0.5 * Math.sin(i * 0.13) * Math.cos(i * 0.27);
      tempColor.copy(c1).lerp(c2, alpha * 0.3);
      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });

    const groundMesh = new THREE.Mesh(geometry, material);
    groundMesh.receiveShadow = true;
    this.group.add(groundMesh);

    // Grid helper overlay on test pad for visual speed reference
    const gridHelper = new THREE.GridHelper(500, 250, 0x555048, 0x3d3832);
    gridHelper.position.y = 0.02;
    this.group.add(gridHelper);

    // Physics ground collider (fixed half-space or large box)
    const rapier = this.physics.rapier;
    const groundBodyDesc = rapier.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0);
    const groundBody = this.physics.world.createRigidBody(groundBodyDesc);
    const groundColliderDesc = rapier.ColliderDesc.cuboid(size / 2, 0.5, size / 2)
      .setFriction(0.9)
      .setRestitution(0.0);
    this.groundCollider = this.physics.world.createCollider(groundColliderDesc, groundBody);

    // Perimeter boundary colliders to keep vehicles safely on the testing grounds
    const wallHalfThickness = 2.0;
    const wallHeight = 4.0;
    const wallHalfSpan = 590.0;

    const createWall = (px: number, pz: number, hx: number, hz: number) => {
      const bDesc = rapier.RigidBodyDesc.fixed().setTranslation(px, wallHeight / 2, pz);
      const b = this.physics.world.createRigidBody(bDesc);
      const cDesc = rapier.ColliderDesc.cuboid(hx, wallHeight / 2, hz).setFriction(0.4);
      this.physics.world.createCollider(cDesc, b);
    };

    createWall(0, 590, wallHalfSpan, wallHalfThickness);
    createWall(0, -590, wallHalfSpan, wallHalfThickness);
    createWall(590, 0, wallHalfThickness, wallHalfSpan);
    createWall(-590, 0, wallHalfThickness, wallHalfSpan);
  }

  private createSkidPadMarkings(): void {
    // Circular skid pad with inner (R=15m) and outer (R=25m) circle lines
    const createRing = (radius: number, color: number) => {
      const segments = 64;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(theta) * radius, 0.03, Math.sin(theta) * radius));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
      const line = new THREE.Line(geom, mat);
      line.position.set(45, 0, 0); // Positioned to the right of starting line
      this.group.add(line);
    };

    createRing(15, 0xded8ce);
    createRing(25, 0xded8ce);

    // Center focal cone
    this.createCone(45, 0);
  }

  private createSlalomCourse(): void {
    // Line of cones along Z-axis for testing steering response and weight transfer
    const spacing = 18;
    for (let i = 1; i <= 6; i++) {
      this.createCone(0, i * spacing);
    }
  }

  private createCone(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Base
    const baseGeom = new THREE.BoxGeometry(0.8, 0.08, 0.8);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, flatShading: true });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.04;
    group.add(base);

    // Striped cone (orange with white band)
    const coneGeom = new THREE.ConeGeometry(0.35, 1.0, 7);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5500, flatShading: true });
    const cone = new THREE.Mesh(coneGeom, coneMat);
    cone.position.y = 0.54;
    cone.castShadow = true;
    group.add(cone);

    const stripeGeom = new THREE.CylinderGeometry(0.24, 0.28, 0.25, 7);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
    const stripe = new THREE.Mesh(stripeGeom, stripeMat);
    stripe.position.y = 0.5;
    group.add(stripe);

    this.group.add(group);
  }

  private createSuspensionRamps(): void {
    // Gentle wedge ramp to test suspension compression and airborne landing
    const rampWidth = 6.0;
    const rampLength = 10.0;
    const rampHeight = 1.0;

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(rampLength, rampHeight);
    shape.lineTo(rampLength, 0);
    shape.closePath();

    const extrudeSettings = {
      steps: 1,
      depth: rampWidth,
      bevelEnabled: false,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(rampWidth / 2, 0, 0);

    const material = new THREE.MeshStandardMaterial({
      color: 0x6e665e,
      roughness: 0.8,
      flatShading: true,
    });

    const rampMesh = new THREE.Mesh(geometry, material);
    rampMesh.position.set(-35, 0, 20);
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    this.group.add(rampMesh);

    // Physics collider for ramp
    const rapier = this.physics.rapier;
    // Approximated as a convex hull or angled cuboid
    const rampBody = this.physics.world.createRigidBody(
      rapier.RigidBodyDesc.fixed().setTranslation(-35, rampHeight * 0.5, 20 + rampLength * 0.5)
    );
    // Rotate ramp collider
    const angle = Math.atan2(rampHeight, rampLength);
    rampBody.setRotation({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) }, true);
    const colDesc = rapier.ColliderDesc.cuboid(rampWidth / 2, 0.1, Math.hypot(rampLength, rampHeight) / 2);
    this.physics.world.createCollider(colDesc, rampBody);
  }

  private createTwinGatePosts(): void {
    // Twin striped gate posts at start of testing line (matches Screenshot 1)
    const postWidth = 0.35;
    const postHeight = 2.4;
    const roadHalfWidth = 4.5; // Posts spaced 9m apart

    const makePost = (x: number, z: number) => {
      const postGroup = new THREE.Group();
      postGroup.position.set(x, 0, z);

      // Alternating striped boxes (4 segments)
      const numSegments = 6;
      const segH = postHeight / numSegments;
      for (let s = 0; s < numSegments; s++) {
        const isLit = s % 2 === 0;
        const color = isLit ? THREE_PALETTE.gatePostLit : THREE_PALETTE.gatePostDark;
        const geom = new THREE.BoxGeometry(postWidth, segH, postWidth);
        const mat = new THREE.MeshStandardMaterial({ color, flatShading: true });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.y = (s + 0.5) * segH;
        mesh.castShadow = true;
        postGroup.add(mesh);
      }

      this.group.add(postGroup);
    };

    // Place twin posts at Z = 5m
    makePost(-roadHalfWidth, 5);
    makePost(roadHalfWidth, 5);
  }

  private createPerimeterForest(): void {
    // Decorative perimeter low-poly trees for lighting/shadow reference
    const treePositions: [number, number][] = [
      [-70, -30], [-80, 0], [-75, 40], [-85, 70], [-70, 100],
      [70, -30], [80, 10], [85, 50], [75, 90], [80, 130],
      [-40, -60], [0, -70], [40, -60],
      [-50, 140], [0, 150], [50, 140],
    ];

    for (let i = 0; i < treePositions.length; i++) {
      const [x, z] = treePositions[i];
      const isPine = i % 2 === 0;
      if (isPine) {
        this.createPineTree(x, z);
      } else {
        this.createDeciduousTree(x, z);
      }
    }
  }

  private createPineTree(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Trunk
    const trunkGeom = new THREE.CylinderGeometry(0.3, 0.5, 3.5, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: THREE_PALETTE.treeTrunk, flatShading: true });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 1.75;
    trunk.castShadow = true;
    group.add(trunk);

    // 3 tiered cones for pine canopy
    const leafMat = new THREE.MeshStandardMaterial({ color: THREE_PALETTE.pineGreen, flatShading: true });
    for (let t = 0; t < 3; t++) {
      const radius = 2.6 - t * 0.6;
      const height = 3.0;
      const coneGeom = new THREE.ConeGeometry(radius, height, 6);
      const cone = new THREE.Mesh(coneGeom, leafMat);
      cone.position.y = 3.2 + t * 1.8;
      cone.castShadow = true;
      group.add(cone);
    }

    this.group.add(group);
  }

  private createDeciduousTree(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Trunk
    const trunkGeom = new THREE.CylinderGeometry(0.4, 0.7, 4.0, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: THREE_PALETTE.treeTrunk, flatShading: true });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 2.0;
    trunk.castShadow = true;
    group.add(trunk);

    // Blocky faceted clusters (icosahedrons)
    const leafMat = new THREE.MeshStandardMaterial({ color: THREE_PALETTE.deciduousGreen, flatShading: true });
    const clusterGeom = new THREE.IcosahedronGeometry(2.2, 0); // 0 subdivision = chunky faceted low poly
    const cluster1 = new THREE.Mesh(clusterGeom, leafMat);
    cluster1.position.set(0, 4.8, 0);
    cluster1.castShadow = true;
    group.add(cluster1);

    const cluster2 = new THREE.Mesh(clusterGeom, leafMat);
    cluster2.position.set(1.1, 5.8, 0.6);
    cluster2.scale.set(0.8, 0.8, 0.8);
    cluster2.castShadow = true;
    group.add(cluster2);

    const cluster3 = new THREE.Mesh(clusterGeom, leafMat);
    cluster3.position.set(-0.9, 5.5, -0.7);
    cluster3.scale.set(0.85, 0.85, 0.85);
    cluster3.castShadow = true;
    group.add(cluster3);

    this.group.add(group);
  }
}
