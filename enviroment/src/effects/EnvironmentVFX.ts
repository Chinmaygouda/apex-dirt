import * as THREE from 'three';
import { ProceduralTextures } from '../assets/ProceduralTextures';
import { VehicleTelemetry } from '../types/rally';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  size: number;
  maxSize: number;
  life: number;
  maxLife: number;
  opacity: number;
  rotation: number;
  rotSpeed: number;
  active: boolean;
  color?: THREE.Color;
}

export class EnvironmentVFX {
  public scene: THREE.Scene;

  // Particle Pools
  private tier1Pebbles: Particle[] = [];
  private tier2DustClouds: Particle[] = [];
  private tireSmokes: Particle[] = [];
  private waterSplashes: Particle[] = [];
  private sparks: Particle[] = [];

  // Instanced Meshes / Point Clouds
  private pebblePoints!: THREE.Points;
  private dustPoints!: THREE.Points;
  private smokePoints!: THREE.Points;
  private waterPoints!: THREE.Points;
  private sparkPoints!: THREE.Points;

  // Exhaust flame mesh
  private flameGroup!: THREE.Group;
  private flameMeshCore!: THREE.Mesh;
  private flameMeshOuter!: THREE.Mesh;
  private flameTimer = 0;

  // Skid Marks Ribbon
  private skidMarkMesh!: THREE.Mesh;
  private skidPositions: Float32Array;
  private skidNormals: Float32Array;
  private skidUvs: Float32Array;
  private skidIndex = 0;
  private static readonly MAX_SKID_VERTICES = 4000;

  // Audio callback
  public onPuddleSplashAudio?: () => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.skidPositions = new Float32Array(EnvironmentVFX.MAX_SKID_VERTICES * 3);
    this.skidNormals = new Float32Array(EnvironmentVFX.MAX_SKID_VERTICES * 3);
    this.skidUvs = new Float32Array(EnvironmentVFX.MAX_SKID_VERTICES * 2);
  }

  public init(): void {
    this.initTier1Pebbles();
    this.initTier2DustClouds();
    this.initTireSmoke();
    this.initWaterSplash();
    this.initSparks();
    this.initExhaustFlame();
    this.initSkidMarks();
  }

  /**
   * Tier 1: Dense High-Velocity Pebble Kickback (600 particles)
   */
  private initTier1Pebbles(): void {
    const count = 600;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.tier1Pebbles.push({
        position: new THREE.Vector3(0, -9999, 0),
        velocity: new THREE.Vector3(),
        size: 0.12,
        maxSize: 0.12,
        life: 0,
        maxLife: 0.65,
        opacity: 0,
        rotation: 0,
        rotSpeed: 0,
        active: false
      });
      pos[i * 3 + 1] = -9999;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.25,
      map: ProceduralTextures.getPebbleSprite(),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    this.pebblePoints = new THREE.Points(geo, mat);
    this.pebblePoints.frustumCulled = false;
    this.scene.add(this.pebblePoints);
  }

  /**
   * Tier 2: Volumetric Soft Dust Clouds (1,200 billowy quads)
   */
  private initTier2DustClouds(): void {
    const count = 1200;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.tier2DustClouds.push({
        position: new THREE.Vector3(0, -9999, 0),
        velocity: new THREE.Vector3(),
        size: 0.4,
        maxSize: 4.8,
        life: 0,
        maxLife: 3.5,
        opacity: 0,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 1.5,
        active: false
      });
      pos[i * 3 + 1] = -9999;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size: 2.5,
      map: ProceduralTextures.getDustCloudSprite(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.NormalBlending,
      color: 0xffe6c2 // Warm golden hour dust tint
    });

    this.dustPoints = new THREE.Points(geo, mat);
    this.dustPoints.frustumCulled = false;
    this.scene.add(this.dustPoints);
  }

  /**
   * Tire Smoke (Asphalt Drifting & Burnouts)
   */
  private initTireSmoke(): void {
    const count = 400;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.tireSmokes.push({
        position: new THREE.Vector3(0, -9999, 0),
        velocity: new THREE.Vector3(),
        size: 0.35,
        maxSize: 3.2,
        life: 0,
        maxLife: 1.8,
        opacity: 0,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 2.0,
        active: false
      });
      pos[i * 3 + 1] = -9999;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size: 2.2,
      map: ProceduralTextures.getSmokeSprite(),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    this.smokePoints = new THREE.Points(geo, mat);
    this.smokePoints.frustumCulled = false;
    this.scene.add(this.smokePoints);
  }

  /**
   * Puddle Water Splash Spray
   */
  private initWaterSplash(): void {
    const count = 350;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.waterSplashes.push({
        position: new THREE.Vector3(0, -9999, 0),
        velocity: new THREE.Vector3(),
        size: 0.45,
        maxSize: 1.8,
        life: 0,
        maxLife: 0.85,
        opacity: 0,
        rotation: 0,
        rotSpeed: 0,
        active: false
      });
      pos[i * 3 + 1] = -9999;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size: 1.4,
      map: ProceduralTextures.getWaterSplashSprite(),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xccf0ff
    });

    this.waterPoints = new THREE.Points(geo, mat);
    this.waterPoints.frustumCulled = false;
    this.scene.add(this.waterPoints);
  }

  /**
   * Exhaust Ember Sparks
   */
  private initSparks(): void {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.sparks.push({
        position: new THREE.Vector3(0, -9999, 0),
        velocity: new THREE.Vector3(),
        size: 0.15,
        maxSize: 0.15,
        life: 0,
        maxLife: 0.4,
        opacity: 0,
        rotation: 0,
        rotSpeed: 0,
        active: false
      });
      pos[i * 3 + 1] = -9999;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.35,
      map: ProceduralTextures.getSparkSprite(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0xffaa33
    });

    this.sparkPoints = new THREE.Points(geo, mat);
    this.sparkPoints.frustumCulled = false;
    this.scene.add(this.sparkPoints);
  }

  /**
   * Exhaust Backfire Flame Mesh (Concentric Glowing Cones)
   */
  private initExhaustFlame(): void {
    this.flameGroup = new THREE.Group();
    this.flameGroup.visible = false;

    // Inner hot cyan core
    const coreGeo = new THREE.ConeGeometry(0.08, 0.45, 6);
    coreGeo.rotateX(-Math.PI / 2);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    this.flameMeshCore = new THREE.Mesh(coreGeo, coreMat);

    // Outer fiery orange plume
    const outerGeo = new THREE.ConeGeometry(0.18, 0.75, 7);
    outerGeo.rotateX(-Math.PI / 2);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    this.flameMeshOuter = new THREE.Mesh(outerGeo, outerMat);

    this.flameGroup.add(this.flameMeshCore, this.flameMeshOuter);
    this.scene.add(this.flameGroup);
  }

  /**
   * Dynamic Continuous Skid Mark Ribbon
   */
  private initSkidMarks(): void {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.skidPositions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.skidNormals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.skidUvs, 2));

    const mat = new THREE.MeshBasicMaterial({
      map: ProceduralTextures.getSkidMarkTexture(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.skidMarkMesh = new THREE.Mesh(geo, mat);
    this.skidMarkMesh.frustumCulled = false;
    this.scene.add(this.skidMarkMesh);
  }

  /**
   * Updates all vehicle particle systems directly from telemetry
   */
  public update(deltaTime: number, telemetry: VehicleTelemetry): void {
    const isGravelOrScree = telemetry.currentSurface.type !== 'asphalt';
    const isAsphalt = telemetry.currentSurface.type === 'asphalt';

    // 1. Dual-Tier Wheel Roost Dust (Gravel & Scree)
    if (isGravelOrScree && (Math.abs(telemetry.lateralSpeed) > 1.5 || telemetry.speedKmh > 20)) {
      // Rear wheels contact points
      for (const wIdx of [2, 3]) {
        const wheelPos = telemetry.wheelPositions[wIdx];
        if (telemetry.wheelGrounded[wIdx]) {
          // Emit Tier 1 high-speed pebbles
          this.emitPebble(wheelPos, telemetry.velocity, telemetry.forward);
          // Emit Tier 2 soft billowy dust cloud
          this.emitDustCloud(wheelPos, telemetry.velocity);
        }
      }
    }

    // 2. Tire Smoke Plumes (Asphalt Power Slides)
    if (isAsphalt && Math.abs(telemetry.lateralSpeed) > 3.8) {
      for (const wIdx of [2, 3]) {
        if (telemetry.wheelGrounded[wIdx]) {
          this.emitSmoke(telemetry.wheelPositions[wIdx], telemetry.velocity);
        }
      }
    }

    // 3. Mud Puddle Splashes (Check distance to mud puddles)
    const puddle1 = new THREE.Vector3(90, 46, 300);
    const puddle2 = new THREE.Vector3(-70, 28, 420);
    if (telemetry.position.distanceTo(puddle1) < 6.0 || telemetry.position.distanceTo(puddle2) < 6.0) {
      if (telemetry.speedKmh > 25) {
        this.emitWaterSplash(telemetry.wheelPositions[0], telemetry.velocity, -1);
        this.emitWaterSplash(telemetry.wheelPositions[1], telemetry.velocity, 1);
        if (this.onPuddleSplashAudio) {
          this.onPuddleSplashAudio();
        }
      }
    }

    // 4. Exhaust Backfire Flames & Sparks
    if (telemetry.isDeceleratingHard && telemetry.engineRpm > 5500) {
      this.triggerBackfire(telemetry.position, telemetry.forward);
    }

    // Update Backfire flame animation
    if (this.flameTimer > 0) {
      this.flameTimer -= deltaTime;
      const s = 1.0 + (Math.random() - 0.5) * 0.4;
      this.flameGroup.scale.set(s, s, s);
      if (this.flameTimer <= 0) {
        this.flameGroup.visible = false;
      }
    }

    // 5. Skid Mark Ribbon Extrusion (Lateral sliding or heavy braking)
    if (Math.abs(telemetry.lateralSpeed) > 2.2 || (telemetry.brake > 0.6 && telemetry.speedKmh > 30)) {
      this.addSkidSegment(telemetry.wheelPositions[2], telemetry.wheelPositions[3], telemetry.up);
    }

    // Step physics for all active particles
    this.stepParticles(deltaTime);
  }

  private emitPebble(pos: THREE.Vector3, carVel: THREE.Vector3, forward: THREE.Vector3): void {
    const p = this.tier1Pebbles.find(pt => !pt.active);
    if (!p) return;

    p.active = true;
    p.life = 0;
    p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.1, (Math.random() - 0.5) * 0.2));

    // Eject backwards with spread cone
    const backVel = forward.clone().multiplyScalar(-18.0 - Math.random() * 8.0);
    backVel.x += (Math.random() - 0.5) * 6.0;
    backVel.y += Math.random() * 5.0 + 2.0;
    backVel.z += (Math.random() - 0.5) * 6.0;
    p.velocity.copy(backVel).addScaledVector(carVel, 0.2);
  }

  private emitDustCloud(pos: THREE.Vector3, carVel: THREE.Vector3): void {
    const p = this.tier2DustClouds.find(pt => !pt.active);
    if (!p) return;

    p.active = true;
    p.life = 0;
    p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4));
    p.velocity.set(
      (Math.random() - 0.5) * 1.5 + carVel.x * 0.1,
      Math.random() * 1.2 + 0.4, // Gentle thermal upward drift
      (Math.random() - 0.5) * 1.5 + carVel.z * 0.1
    );
  }

  private emitSmoke(pos: THREE.Vector3, carVel: THREE.Vector3): void {
    const p = this.tireSmokes.find(pt => !pt.active);
    if (!p) return;

    p.active = true;
    p.life = 0;
    p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.15, (Math.random() - 0.5) * 0.3));
    p.velocity.set(
      (Math.random() - 0.5) * 1.2,
      Math.random() * 2.2 + 1.2, // Rises with hot thermal buoyancy
      (Math.random() - 0.5) * 1.2
    );
  }

  private emitWaterSplash(pos: THREE.Vector3, carVel: THREE.Vector3, side: number): void {
    for (let i = 0; i < 4; i++) {
      const p = this.waterSplashes.find(pt => !pt.active);
      if (!p) return;

      p.active = true;
      p.life = 0;
      p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3));

      // Fan sheet spray angle 55 deg lateral
      p.velocity.set(
        side * (Math.random() * 8.0 + 4.0),
        Math.random() * 6.0 + 3.0,
        carVel.z * 0.3 + (Math.random() - 0.5) * 3.0
      );
    }
  }

  public triggerBackfire(carPos: THREE.Vector3, forward: THREE.Vector3): void {
    if (this.flameTimer > 0) return; // Debounce flame burst

    this.flameTimer = 0.14; // 140ms flash
    this.flameGroup.visible = true;

    // Position flame at exhaust tip (rear left of rally car)
    const exhaustOffset = forward.clone().multiplyScalar(-2.3).add(new THREE.Vector3(-0.55, 0.32, 0));
    this.flameGroup.position.copy(carPos).add(exhaustOffset);
    this.flameGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), forward);

    // Burst 25 glowing sparks
    for (let i = 0; i < 25; i++) {
      const sp = this.sparks.find(s => !s.active);
      if (!sp) break;

      sp.active = true;
      sp.life = 0;
      sp.position.copy(this.flameGroup.position);
      const sparkVel = forward.clone().multiplyScalar(-12.0 - Math.random() * 8.0);
      sparkVel.x += (Math.random() - 0.5) * 4.0;
      sparkVel.y += Math.random() * 3.0 + 0.5;
      sparkVel.z += (Math.random() - 0.5) * 4.0;
      sp.velocity.copy(sparkVel);
    }
  }

  private addSkidSegment(leftWheel: THREE.Vector3, rightWheel: THREE.Vector3, up: THREE.Vector3): void {
    if (this.skidIndex + 6 >= EnvironmentVFX.MAX_SKID_VERTICES) {
      this.skidIndex = 0; // Ring buffer wrap
    }

    const offset = up.clone().multiplyScalar(0.02); // 2cm above road to prevent z-fighting
    const p1 = leftWheel.clone().add(offset);
    const p2 = rightWheel.clone().add(offset);

    const i = this.skidIndex * 3;
    this.skidPositions[i] = p1.x;
    this.skidPositions[i + 1] = p1.y;
    this.skidPositions[i + 2] = p1.z;

    this.skidPositions[i + 3] = p2.x;
    this.skidPositions[i + 4] = p2.y;
    this.skidPositions[i + 5] = p2.z;

    this.skidNormals[i + 1] = 1.0;
    this.skidNormals[i + 4] = 1.0;

    this.skidIndex += 2;
    this.skidMarkMesh.geometry.attributes.position.needsUpdate = true;
  }

  private stepParticles(dt: number): void {
    // 1. Step Pebbles
    const pebbleAttr = this.pebblePoints.geometry.attributes.position;
    for (let i = 0; i < this.tier1Pebbles.length; i++) {
      const p = this.tier1Pebbles[i];
      if (p.active) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          pebbleAttr.setY(i, -9999);
        } else {
          p.velocity.y -= 14.8 * dt; // Rapid gravity fall
          p.position.addScaledVector(p.velocity, dt);
          pebbleAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
        }
      }
    }
    pebbleAttr.needsUpdate = true;

    // 2. Step Dust Clouds
    const dustAttr = this.dustPoints.geometry.attributes.position;
    for (let i = 0; i < this.tier2DustClouds.length; i++) {
      const p = this.tier2DustClouds[i];
      if (p.active) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          dustAttr.setY(i, -9999);
        } else {
          p.position.addScaledVector(p.velocity, dt);
          dustAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
        }
      }
    }
    dustAttr.needsUpdate = true;

    // 3. Step Tire Smoke
    const smokeAttr = this.smokePoints.geometry.attributes.position;
    for (let i = 0; i < this.tireSmokes.length; i++) {
      const p = this.tireSmokes[i];
      if (p.active) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          smokeAttr.setY(i, -9999);
        } else {
          p.position.addScaledVector(p.velocity, dt);
          smokeAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
        }
      }
    }
    smokeAttr.needsUpdate = true;

    // 4. Step Water Splash
    const waterAttr = this.waterPoints.geometry.attributes.position;
    for (let i = 0; i < this.waterSplashes.length; i++) {
      const p = this.waterSplashes[i];
      if (p.active) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          waterAttr.setY(i, -9999);
        } else {
          p.velocity.y -= 9.81 * dt;
          p.position.addScaledVector(p.velocity, dt);
          waterAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
        }
      }
    }
    waterAttr.needsUpdate = true;

    // 5. Step Sparks
    const sparkAttr = this.sparkPoints.geometry.attributes.position;
    for (let i = 0; i < this.sparks.length; i++) {
      const p = this.sparks[i];
      if (p.active) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          sparkAttr.setY(i, -9999);
        } else {
          p.velocity.y -= 6.0 * dt;
          p.position.addScaledVector(p.velocity, dt);
          sparkAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
        }
      }
    }
    sparkAttr.needsUpdate = true;
  }
}

