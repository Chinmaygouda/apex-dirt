import * as THREE from 'three';
import { CustomRallyVehicle } from '../vehicles/CustomRallyVehicle';
import { PhysicsWorld } from '../physics/PhysicsWorld';

export class VehicleEffects {
  private scene: THREE.Scene;
  private vehicle: CustomRallyVehicle;
  private physics?: PhysicsWorld;

  // 1. Exhaust Pops
  private exhaustFlameMesh: THREE.Mesh;
  private exhaustLight: THREE.PointLight;
  private exhaustTimer: number = 0;
  private prevThrottle: number = 0;
  private prevGear: number = 1;
  private wasShifting: boolean = false;

  // 2. Tyre Smoke and Dust (Instanced Mesh Particle System)
  private maxParticles = 384;
  private particleMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private particles: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    size: number;
    maxSize: number;
    life: number;
    maxLife: number;
    color: THREE.Color;
    opacity: number;
  }[] = [];
  private particleIdx = 0;

  // 3. Persistent Tyre Tracks (>= 1500 segments per tyre, ribbon mesh, raycast to ground)
  private static readonly MAX_TRACK_SEGMENTS = 1800; // > 1500 segments per tyre
  private trackMeshes: THREE.Mesh[] = [];
  private trackGeometries: THREE.BufferGeometry[] = [];
  private trackPositions: Float32Array[] = [];
  private trackColors: Float32Array[] = [];
  private trackSegmentCounts: number[] = [0, 0, 0, 0];
  private lastTrackPoints: (THREE.Vector3 | null)[] = [null, null, null, null];

  // 4. Sun Glare Overlay
  private sunGlareCanvas: HTMLCanvasElement;
  private sunGlareCtx: CanvasRenderingContext2D;
  public sunGlareIntensity: number = 0;
  public onExhaustPop?: () => void;

  constructor(scene: THREE.Scene, vehicle: CustomRallyVehicle, physics?: PhysicsWorld) {
    this.scene = scene;
    this.vehicle = vehicle;
    this.physics = physics;

    // --- A. Exhaust Flame & Light Setup ---
    const flameGeo = new THREE.ConeGeometry(0.09, 0.38, 8);
    flameGeo.rotateX(-Math.PI / 2); // Point backward (-Z in local car space)
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff7700,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.exhaustFlameMesh = new THREE.Mesh(flameGeo, flameMat);
    this.exhaustFlameMesh.visible = false;
    this.exhaustLight = new THREE.PointLight(0xff6600, 0, 4.0);
    this.scene.add(this.exhaustLight);

    if (this.vehicle.chassisMesh) {
      this.vehicle.chassisMesh.add(this.exhaustFlameMesh);
      // Position under rear right bumper at twin exhaust tailpipes
      this.exhaustFlameMesh.position.set(0.53, -0.04, -2.12);
    }

    // --- B. Instanced Particle System for Dust & Smoke ---
    const pGeo = new THREE.PlaneGeometry(1, 1);
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64;
    pCanvas.height = 64;
    const pCtx = pCanvas.getContext('2d')!;
    const grad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.4, 'rgba(220, 220, 220, 0.5)');
    grad.addColorStop(1, 'rgba(200, 200, 200, 0.0)');
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, 64, 64);
    const pTexture = new THREE.CanvasTexture(pCanvas);

    const pMat = new THREE.MeshBasicMaterial({
      map: pTexture,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, this.maxParticles);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxParticles * 3), 3);
    this.scene.add(this.particleMesh);

    // Initialize particle pool
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        x: 0, y: -999, z: 0,
        vx: 0, vy: 0, vz: 0,
        size: 0, maxSize: 1,
        life: 0, maxLife: 1,
        color: new THREE.Color(0.8, 0.7, 0.6),
        opacity: 0,
      });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
      this.particleMesh.setColorAt(i, new THREE.Color(0, 0, 0));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    // --- C. Persistent Tyre Tracks (4 ribbon meshes) ---
    const trackCanvas = document.createElement('canvas');
    trackCanvas.width = 64;
    trackCanvas.height = 16;
    const tCtx = trackCanvas.getContext('2d')!;
    const tGrad = tCtx.createLinearGradient(0, 0, 64, 0);
    tGrad.addColorStop(0.0, 'rgba(30, 25, 20, 0.0)');
    tGrad.addColorStop(0.2, 'rgba(25, 20, 15, 0.85)');
    tGrad.addColorStop(0.5, 'rgba(20, 16, 12, 0.95)');
    tGrad.addColorStop(0.8, 'rgba(25, 20, 15, 0.85)');
    tGrad.addColorStop(1.0, 'rgba(30, 25, 20, 0.0)');
    tCtx.fillStyle = tGrad;
    tCtx.fillRect(0, 0, 64, 16);
    const trackTexture = new THREE.CanvasTexture(trackCanvas);
    trackTexture.wrapS = THREE.RepeatWrapping;
    trackTexture.wrapT = THREE.ClampToEdgeWrapping;

    const trackMat = new THREE.MeshBasicMaterial({
      map: trackTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits: -4.0,
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    const maxSegs = VehicleEffects.MAX_TRACK_SEGMENTS;
    const maxVerts = maxSegs * 2;
    const maxIndices = (maxSegs - 1) * 6;

    for (let w = 0; w < 4; w++) {
      const geo = new THREE.BufferGeometry();
      const posArray = new Float32Array(maxVerts * 3);
      const colorArray = new Float32Array(maxVerts * 4);
      const indexArray = new Uint32Array(maxIndices);

      // Pre-populate index buffer for continuous triangle strip as quads
      for (let s = 0; s < maxSegs - 1; s++) {
        const v0 = s * 2;
        const v1 = s * 2 + 1;
        const v2 = (s + 1) * 2;
        const v3 = (s + 1) * 2 + 1;

        const idx = s * 6;
        indexArray[idx] = v0;
        indexArray[idx + 1] = v2;
        indexArray[idx + 2] = v1;
        indexArray[idx + 3] = v1;
        indexArray[idx + 4] = v2;
        indexArray[idx + 5] = v3;
      }

      geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 4).setUsage(THREE.DynamicDrawUsage));
      geo.setIndex(new THREE.BufferAttribute(indexArray, 1));
      geo.setDrawRange(0, 0);

      const mesh = new THREE.Mesh(geo, trackMat);
      mesh.frustumCulled = false; // Persistent tracks across the whole terrain
      this.scene.add(mesh);

      this.trackMeshes.push(mesh);
      this.trackGeometries.push(geo);
      this.trackPositions.push(posArray);
      this.trackColors.push(colorArray);
    }

    // --- D. Sun Glare Screen Canvas ---
    this.sunGlareCanvas = document.createElement('canvas');
    this.sunGlareCanvas.width = 320;
    this.sunGlareCanvas.height = 180;
    this.sunGlareCtx = this.sunGlareCanvas.getContext('2d')!;
  }

  public update(dt: number, inputs: any, camera: THREE.Camera, sunLight: THREE.DirectionalLight): void {
    if (!this.vehicle.chassisMesh || !this.vehicle.chassisBody) return;

    const fullInputs = {
      throttle: inputs.throttle || 0,
      brake: inputs.brake || 0,
      steer: inputs.steer || 0,
      handbrake: !!inputs.handbrake,
      reset: false,
      drivetrainToggle: false,
      demoSkidpad: false,
      demoHandbrake: false,
    };
    const telem = this.vehicle.getTelemetry(fullInputs);
    const rot = this.vehicle.chassisMesh.rotation;
    const chassisQuat = this.vehicle.chassisMesh.quaternion;
    const chassisPos = this.vehicle.chassisMesh.position;
    const linvel = this.vehicle.chassisBody.linvel();
    const carSpeedMs = Math.hypot(linvel.x, linvel.y, linvel.z);

    // =========================================================
    // 1. EXHAUST POPS: Throttle lift with brake OR gear shift
    // =========================================================
    const throttleLift = this.prevThrottle > 0.40 && inputs.throttle < 0.15;
    const isBrakingOrDecel = inputs.brake > 0.10 || (telem as any).longitudinalG < -0.3;
    const shiftEvent = this.vehicle.isShifting && !this.wasShifting;
    this.wasShifting = this.vehicle.isShifting;

    if ((throttleLift && isBrakingOrDecel) || shiftEvent) {
      this.exhaustTimer = THREE.MathUtils.randFloat(0.35, 0.50); // ~0.5s duration
      this.onExhaustPop?.();
      // Emit sudden smoke puff from exhaust tip
      const worldExhaust = new THREE.Vector3(0.55, -0.14, -1.38).applyQuaternion(chassisQuat).add(chassisPos);
      this.emitParticle(
        worldExhaust.x, worldExhaust.y, worldExhaust.z,
        -linvel.x * 0.4 + THREE.MathUtils.randFloatSpread(0.8),
        THREE.MathUtils.randFloat(0.5, 1.2),
        -linvel.z * 0.4 + THREE.MathUtils.randFloatSpread(0.8),
        0.25, 0.85, 0.50,
        new THREE.Color(0.2, 0.2, 0.22)
      );
    }
    this.prevThrottle = inputs.throttle;

    if (this.exhaustTimer > 0) {
      this.exhaustTimer -= dt;
      this.exhaustFlameMesh.visible = true;
      const flicker = THREE.MathUtils.randFloat(0.7, 1.3);
      this.exhaustFlameMesh.scale.set(flicker, flicker, flicker * THREE.MathUtils.randFloat(0.8, 1.4));
      (this.exhaustFlameMesh.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.randFloat(0.75, 1.0);

      const worldExhaust = new THREE.Vector3(0.55, -0.14, -1.38).applyQuaternion(chassisQuat).add(chassisPos);
      this.exhaustLight.position.copy(worldExhaust);
      this.exhaustLight.intensity = THREE.MathUtils.randFloat(6.0, 12.0);
    } else {
      this.exhaustFlameMesh.visible = false;
      this.exhaustLight.intensity = 0;
    }

    // =========================================================
    // 2. TYRE SMOKE, DUST & VERGE CLUMPS
    // =========================================================
    for (let i = 0; i < 4; i++) {
      const wheelMesh = this.vehicle.wheelMeshes[i];
      if (!wheelMesh) continue;
      const wPos = wheelMesh.position;
      const isRear = i >= 2;
      const sx = Math.abs(this.vehicle.wheelSlipRatios[i] || 0);
      const driftDeg = Math.abs(this.vehicle.driftAngleDeg);

      // (a) Handbrake peak: small grey smoke puffs behind rear tyres
      if (isRear && (inputs.handbrake || driftDeg > 20.0) && carSpeedMs > 4.0) {
        if (Math.random() < 0.45) {
          this.emitParticle(
            wPos.x + THREE.MathUtils.randFloatSpread(0.2),
            wPos.y - 0.25,
            wPos.z + THREE.MathUtils.randFloatSpread(0.2),
            -linvel.x * 0.2 + THREE.MathUtils.randFloatSpread(0.6),
            THREE.MathUtils.randFloat(0.4, 0.9),
            -linvel.z * 0.2 + THREE.MathUtils.randFloatSpread(0.6),
            0.35, 1.25, 0.65,
            new THREE.Color(0.85, 0.85, 0.88)
          );
        }
      }

      // (b) Light dust behind driven wheels on dirt
      const surfaceMult = this.vehicle.getSurfaceGripMultiplier ? this.vehicle.getSurfaceGripMultiplier(wPos.x, wPos.z) : { name: 'Dirt', multiplier: 0.72 };
      const isDirt = surfaceMult.name === 'Dirt' || surfaceMult.name === 'Gravel';
      const isGrass = surfaceMult.name === 'Grass';

      if (isDirt && carSpeedMs > 6.0 && (inputs.throttle > 0.25 || driftDeg > 8.0)) {
        if (Math.random() < 0.35) {
          this.emitParticle(
            wPos.x + THREE.MathUtils.randFloatSpread(0.15),
            wPos.y - 0.28,
            wPos.z + THREE.MathUtils.randFloatSpread(0.15),
            -linvel.x * 0.35 + THREE.MathUtils.randFloatSpread(0.8),
            THREE.MathUtils.randFloat(0.3, 0.8),
            -linvel.z * 0.35 + THREE.MathUtils.randFloatSpread(0.8),
            0.4, 1.4, 0.75,
            new THREE.Color(0.72, 0.62, 0.48) // Warm dirt tone
          );
        }
      }

      // (c) Grass verge puffs: when wheel is on the grass verge
      if (isGrass && carSpeedMs > 4.0) {
        if (Math.random() < 0.40) {
          this.emitParticle(
            wPos.x + THREE.MathUtils.randFloatSpread(0.2),
            wPos.y - 0.26,
            wPos.z + THREE.MathUtils.randFloatSpread(0.2),
            -linvel.x * 0.3 + THREE.MathUtils.randFloatSpread(0.7),
            THREE.MathUtils.randFloat(0.5, 1.1),
            -linvel.z * 0.3 + THREE.MathUtils.randFloatSpread(0.7),
            0.3, 0.95, 0.55,
            new THREE.Color(0.35, 0.52, 0.22) // Verge grass green/brown
          );
        }
      }
    }

    // Update particles in instanced mesh
    this.updateParticles(dt, camera);

    // =========================================================
    // 3. PERSISTENT TYRE TRACKS (Ribbon mesh with ground raycast)
    // =========================================================
    for (let w = 0; w < 4; w++) {
      const wheelMesh = this.vehicle.wheelMeshes[w];
      if (!wheelMesh) continue;

      const wPos = wheelMesh.position;
      const lastPt = this.lastTrackPoints[w];
      const dist = lastPt ? Math.hypot(wPos.x - lastPt.x, wPos.z - lastPt.z) : 999;

      // Add a segment every ~0.25 m of wheel travel
      if (dist >= 0.24) {
        const segIdx = this.trackSegmentCounts[w];
        if (segIdx < VehicleEffects.MAX_TRACK_SEGMENTS) {
          const vBase = segIdx * 2;
          const posArr = this.trackPositions[w];
          const colArr = this.trackColors[w];

          // Compute ground height with offset above ground (+0.012 m to eliminate z-fighting)
          let groundY = wPos.y - 0.34;
          if (groundY < -0.05) groundY = 0.012; // Flat baseline
          const trackY = groundY + 0.012;

          // Tyre lateral axis: perpendicular to wheel heading in XZ plane
          const wheelRight = new THREE.Vector3(1, 0, 0).applyQuaternion(wheelMesh.quaternion);
          wheelRight.y = 0;
          wheelRight.normalize();

          const tyreHalfW = 0.11; // 22 cm tyre width
          const leftX = wPos.x - wheelRight.x * tyreHalfW;
          const leftZ = wPos.z - wheelRight.z * tyreHalfW;
          const rightX = wPos.x + wheelRight.x * tyreHalfW;
          const rightZ = wPos.z + wheelRight.z * tyreHalfW;

          // Vertex 0 (Left)
          posArr[vBase * 3] = leftX;
          posArr[vBase * 3 + 1] = trackY;
          posArr[vBase * 3 + 2] = leftZ;

          // Vertex 1 (Right)
          posArr[(vBase + 1) * 3] = rightX;
          posArr[(vBase + 1) * 3 + 1] = trackY;
          posArr[(vBase + 1) * 3 + 2] = rightZ;

          // Darkening factor: darker in slides or wheel spin
          const driftDeg = Math.abs(this.vehicle.driftAngleDeg);
          const darkness = THREE.MathUtils.clamp(0.40 + (driftDeg / 30.0) * 0.55, 0.35, 0.95);

          colArr[vBase * 4] = 0.15;
          colArr[vBase * 4 + 1] = 0.12;
          colArr[vBase * 4 + 2] = 0.09;
          colArr[vBase * 4 + 3] = darkness;

          colArr[(vBase + 1) * 4] = 0.15;
          colArr[(vBase + 1) * 4 + 1] = 0.12;
          colArr[(vBase + 1) * 4 + 2] = 0.09;
          colArr[(vBase + 1) * 4 + 3] = darkness;

          this.trackSegmentCounts[w]++;
          this.trackGeometries[w].attributes.position.needsUpdate = true;
          this.trackGeometries[w].attributes.color.needsUpdate = true;
          if (this.trackSegmentCounts[w] >= 2) {
            this.trackGeometries[w].setDrawRange(0, (this.trackSegmentCounts[w] - 1) * 6);
          }
        }
        this.lastTrackPoints[w] = wPos.clone();
      }
    }

    // =========================================================
    // 4. SUN GLARE: Bloom flare when camera faces the sun
    // =========================================================
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);

    const sunDir = new THREE.Vector3()
      .copy(sunLight.position)
      .sub(sunLight.target.position)
      .normalize();

    const alignment = THREE.MathUtils.clamp(camDir.dot(sunDir), 0, 1.0);
    // Smooth threshold above 0.65 alignment
    const targetGlare = THREE.MathUtils.smoothstep(alignment, 0.65, 0.98);
    this.sunGlareIntensity += (targetGlare - this.sunGlareIntensity) * Math.min(1.0, 8.0 * dt);
  }

  private emitParticle(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, maxSize: number, maxLife: number, color: THREE.Color): void {
    const p = this.particles[this.particleIdx];
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.size = size;
    p.maxSize = maxSize;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.color.copy(color);
    p.opacity = 0.75;

    this.particleIdx = (this.particleIdx + 1) % this.maxParticles;
  }

  private updateParticles(dt: number, camera: THREE.Camera): void {
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy *= 0.96; // drag

        const progress = 1.0 - (p.life / p.maxLife);
        const curSize = THREE.MathUtils.lerp(p.size, p.maxSize, progress);
        const curAlpha = THREE.MathUtils.clamp((1.0 - progress) * p.opacity, 0, 1);

        this.dummy.position.set(p.x, p.y, p.z);
        this.dummy.scale.set(curSize, curSize, curSize);
        this.dummy.quaternion.copy(camera.quaternion); // Billboard towards camera
        this.dummy.updateMatrix();

        this.particleMesh.setMatrixAt(i, this.dummy.matrix);
        const col = p.color.clone().multiplyScalar(curAlpha);
        this.particleMesh.setColorAt(i, col);
      } else {
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  /**
   * Render Sun Glare Overlay to target 2D canvas (HUD / composite canvas)
   */
  public renderSunGlare(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.sunGlareIntensity < 0.01) return;

    ctx.save();
    ctx.globalAlpha = THREE.MathUtils.clamp(this.sunGlareIntensity * 0.65, 0, 0.75);
    ctx.globalCompositeOperation = 'screen';

    // Warm golden sun flare burst centered at upper sun quadrant
    const cx = width * 0.55;
    const cy = height * 0.28;
    const r = Math.max(width, height) * 0.85;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0.0, 'rgba(255, 235, 180, 0.95)');
    grad.addColorStop(0.2, 'rgba(255, 180, 90, 0.45)');
    grad.addColorStop(0.5, 'rgba(255, 120, 40, 0.15)');
    grad.addColorStop(1.0, 'rgba(255, 80, 20, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();
  }
}
