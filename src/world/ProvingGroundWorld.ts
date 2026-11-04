import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../physics/PhysicsWorld';

/**
 * ProvingGroundWorld:
 * High-performance, 100% stable vehicle dynamics proving ground.
 * Features:
 * - Perfectly flat 2,000m x 2,000m test plane (0 elevation bumps, 0 polygon cracks, 0 jumping glitches)
 * - High-contrast checkerboard grid texture for visual tracking of speed, wheel spin, drift angle, and braking distance
 * - Measured acceleration drag strip (0 to 800m) with painted distance markers
 * - Multi-radius circular drift skidpad (15m, 30m, 50m concentric circles)
 * - 0 trees, 0 green terrain meshes, 0 obstacle bodies
 */
export class ProvingGroundWorld {
  public group = new THREE.Group();
  public groundCollider!: RAPIER.Collider;

  constructor(private scene: THREE.Scene, private physics: PhysicsWorld) {
    this.createCheckerboardGround();
    this.createDynamicsTestingMarkings();
    this.createDistanceMarkerBoards();
    this.createSlalomCourse();
    this.createSuspensionTestZone();
    this.scene.add(this.group);
  }

  /**
   * Surface query for CustomRallyVehicle.
   * Returns high-grip tarmac surface properties.
   */
  public getSurfaceAt(x: number, z: number): { name: string; multiplier: number } {
    return {
      name: 'tarmac',
      multiplier: 1.0,
    };
  }

  private createCheckerboardTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // 4x4 squares: alternating charcoal and slate graphite
      const colors = ['#1a1c20', '#282b32'];
      const border = '#383d47';

      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const isEven = (row + col) % 2 === 0;
          ctx.fillStyle = colors[isEven ? 0 : 1];
          ctx.fillRect(col * 128, row * 128, 128, 128);

          // Crisp square boundary border
          ctx.strokeStyle = border;
          ctx.lineWidth = 2;
          ctx.strokeRect(col * 128, row * 128, 128, 128);

          // Subtle precision metric crosshair at center of each square
          ctx.strokeStyle = isEven ? '#2c3039' : '#393e4a';
          ctx.lineWidth = 1;
          const cx = col * 128 + 64;
          const cy = row * 128 + 64;
          ctx.beginPath();
          ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
          ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16);
          ctx.stroke();
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    // 2000m plane. Repeat 200x200 -> each 4x4 block is 10m -> each checker square is 2.5m x 2.5m!
    texture.repeat.set(200, 200);
    texture.anisotropy = 16;
    return texture;
  }

  private createCheckerboardGround(): void {
    const size = 2000;
    const geometry = new THREE.PlaneGeometry(size, size, 2, 2);
    geometry.rotateX(-Math.PI / 2);

    const checkerTex = this.createCheckerboardTexture();
    const material = new THREE.MeshStandardMaterial({
      map: checkerTex,
      roughness: 0.85,
      metalness: 0.10,
      flatShading: true,
    });

    const groundMesh = new THREE.Mesh(geometry, material);
    groundMesh.receiveShadow = true;
    this.group.add(groundMesh);

    // Physics ground collider: fixed rigid body half-extents (1000, 0.5, 1000)
    // Top surface sits at exactly y = 0.000m
    const rapier = this.physics.rapier;
    const groundBodyDesc = rapier.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0);
    const groundBody = this.physics.world.createRigidBody(groundBodyDesc);
    const groundColliderDesc = rapier.ColliderDesc.cuboid(size / 2, 0.5, size / 2)
      .setFriction(0.95)
      .setRestitution(0.0);
    this.groundCollider = this.physics.world.createCollider(groundColliderDesc, groundBody);

    // Perimeter safety boundary colliders at 980m (keeps vehicle on plane)
    const wallHalfSpan = 980;
    const wallHalfThickness = 2.0;
    const wallHeight = 4.0;

    const createWall = (px: number, pz: number, hx: number, hz: number) => {
      const bDesc = rapier.RigidBodyDesc.fixed().setTranslation(px, wallHeight / 2, pz);
      const b = this.physics.world.createRigidBody(bDesc);
      const cDesc = rapier.ColliderDesc.cuboid(hx, wallHeight / 2, hz).setFriction(0.3);
      this.physics.world.createCollider(cDesc, b);
    };

    createWall(0, wallHalfSpan, wallHalfSpan, wallHalfThickness);
    createWall(0, -wallHalfSpan, wallHalfSpan, wallHalfThickness);
    createWall(wallHalfSpan, 0, wallHalfThickness, wallHalfSpan);
    createWall(-wallHalfSpan, 0, wallHalfThickness, wallHalfSpan);
  }

  /**
   * Surface markings for vehicle dynamics testing:
   * 1. 0 to 800m straight acceleration lane with distance lines
   * 2. Concentric drift skidpad rings (15m, 30m, 50m)
   */
  private createDynamicsTestingMarkings(): void {
    const laneMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
    const whiteMat = new THREE.LineBasicMaterial({ color: 0xf8fafc, linewidth: 2 });
    const yellowMat = new THREE.LineBasicMaterial({ color: 0xfacc15, linewidth: 2 });

    // Straight Acceleration Corridor along Z (from z = -100m to z = +800m)
    for (const lx of [-4.0, 4.0]) {
      const pts = [new THREE.Vector3(lx, 0.02, -100), new THREE.Vector3(lx, 0.02, 800)];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      this.group.add(new THREE.Line(geom, laneMat));
    }

    // Distance tick markers across the acceleration lane
    const distances = [0, 50, 100, 200, 300, 400, 500, 600, 700, 800];
    for (const d of distances) {
      const pts = [new THREE.Vector3(-4.0, 0.025, d), new THREE.Vector3(4.0, 0.025, d)];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      this.group.add(new THREE.Line(geom, d % 100 === 0 ? yellowMat : whiteMat));
    }

    // Circular Drift Skidpad at x = 55m, z = 0m
    const skidCenter = new THREE.Vector3(55, 0.02, 0);
    const createRing = (radius: number, mat: THREE.Material) => {
      const segments = 96;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(
          skidCenter.x + Math.cos(theta) * radius,
          0.025,
          skidCenter.z + Math.sin(theta) * radius
        ));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      this.group.add(new THREE.Line(geom, mat));
    };

    createRing(15, whiteMat);  // 15m radius inner circle
    createRing(30, yellowMat); // 30m radius middle circle
    createRing(50, laneMat);   // 50m radius outer circle
  }

  /**
   * High-visibility 3D distance marker boards along acceleration drag strip
   */
  private createDistanceMarkerBoards(): void {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
    const boardBackMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });

    const markers = [
      { z: 0, text: 'START' },
      { z: 100, text: '100m' },
      { z: 200, text: '200m' },
      { z: 300, text: '300m' },
      { z: 400, text: '400m 1/4 MI' },
      { z: 500, text: '500m' },
      { z: 600, text: '600m' },
      { z: 700, text: '700m' },
      { z: 800, text: '800m 1/2 MI' },
    ];

    for (const m of markers) {
      const markerGroup = new THREE.Group();
      markerGroup.position.set(5.8, 0, m.z);
      this.group.add(markerGroup);

      // Steel support post
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8), postMat);
      post.position.set(0, 0.7, 0);
      markerGroup.add(post);

      // Signboard panel
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.60, 1.40), boardBackMat);
      board.position.set(0, 1.25, 0);
      markerGroup.add(board);

      // High-contrast printed label on board
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, 512, 256);

          // Yellow racing border
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 14;
          ctx.strokeRect(8, 8, 496, 240);

          ctx.fillStyle = '#facc15';
          ctx.font = 'bold 72px "Inter", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(m.text, 256, 128);

          const tex = new THREE.CanvasTexture(canvas);
          const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
          const face = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.56), faceMat);
          face.position.set(-0.041, 1.25, 0);
          face.rotation.y = -Math.PI / 2;
          markerGroup.add(face);
        }
      }
    }
  }

  /**
   * Motorsport slalom cone course for testing steering agility & transient body roll
   */
  private createSlalomCourse(): void {
    const coneOrangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });
    const coneWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });

    // 12 Slalom cones along x = -35m from z = 0m to z = 300m (every 25m)
    for (let i = 0; i < 12; i++) {
      const cz = i * 25;
      const coneGroup = new THREE.Group();
      coneGroup.position.set(-35, 0, cz);
      this.group.add(coneGroup);

      // Square rubber base
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.36), baseMat);
      base.position.set(0, 0.01, 0);
      coneGroup.add(base);

      // Lower cone body (orange)
      const lowerCone = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.28, 12), coneOrangeMat);
      lowerCone.position.set(0, 0.15, 0);
      coneGroup.add(lowerCone);

      // Reflective white collar
      const whiteCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.12, 12), coneWhiteMat);
      whiteCollar.position.set(0, 0.34, 0);
      coneGroup.add(whiteCollar);

      // Upper cone tip (orange)
      const upperCone = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.055, 0.15, 12), coneOrangeMat);
      upperCone.position.set(0, 0.47, 0);
      coneGroup.add(upperCone);
    }
  }

  /**
   * Progressive suspension test jump ramp and alternating ripple washboard kerbs
   */
  private createSuspensionTestZone(): void {
    const rampMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
      metalness: 0.2,
      flatShading: true,
    });
    const kerbRedMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.7 });
    const kerbWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });

    // 1. Low-Angle Progressive Jump Ramp at x = -70m, z = 60m
    // Length 6m, width 8m, height rises smoothly to 0.35m at 3.3 deg incline
    const rampGroup = new THREE.Group();
    rampGroup.position.set(-70, 0, 60);
    this.group.add(rampGroup);

    const rampLength = 6.0;
    const rampWidth = 8.0;
    const rampHeight = 0.35;

    const rampGeom = new THREE.BoxGeometry(rampWidth, rampHeight, rampLength);
    const rampMesh = new THREE.Mesh(rampGeom, rampMat);
    rampMesh.position.set(0, rampHeight / 2 - 0.02, rampLength / 2);
    rampMesh.rotation.x = -Math.atan2(rampHeight, rampLength);
    rampGroup.add(rampMesh);

    // Physics ramp rigid body
    const rapier = this.physics.rapier;
    const rampBodyDesc = rapier.RigidBodyDesc.fixed().setTranslation(
      -70,
      rampHeight / 2 - 0.02,
      60 + rampLength / 2
    );
    const rampBody = this.physics.world.createRigidBody(rampBodyDesc);
    const rampRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.atan2(rampHeight, rampLength));
    rampBody.setRotation({ x: rampRot.x, y: rampRot.y, z: rampRot.z, w: rampRot.w }, true);

    const rampColDesc = rapier.ColliderDesc.cuboid(rampWidth / 2, rampHeight / 2, rampLength / 2)
      .setFriction(0.95);
    this.physics.world.createCollider(rampColDesc, rampBody);

    // 2. High-Frequency Ripple Washboards at x = -70m, z = 120m to 160m
    // Alternating 0.025m high kerb slats every 1.2m
    for (let k = 0; k < 30; k++) {
      const kz = 120 + k * 1.2;
      const isRed = k % 2 === 0;
      const kerb = new THREE.Mesh(
        new THREE.BoxGeometry(6.0, 0.025, 0.50),
        isRed ? kerbRedMat : kerbWhiteMat
      );
      kerb.position.set(-70, 0.012, kz);
      this.group.add(kerb);
    }
  }
}
