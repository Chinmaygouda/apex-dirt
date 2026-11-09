import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { VehicleTelemetry } from '../types/rally';
import { RallyStageWorld } from '../world/RallyStageWorld';

export class MockRallyVehicle {
  public mesh: THREE.Group;
  public worldEngine: RallyStageWorld;
  public rapierWorld: RAPIER.World;

  public position: THREE.Vector3 = new THREE.Vector3(-488.54, 47.31, 453.83);
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public forward: THREE.Vector3 = new THREE.Vector3(0, 0, 1);
  public up: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

  public speedKmh = 0;
  public lateralSpeed = 0;
  public longitudinalSlip = 0;
  public engineRpm = 1200;
  public throttle = 0;
  public brake = 0;
  public handbrake = false;
  public steerAngle = 0;
  public isDeceleratingHard = false;

  public wheelPositions: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  public wheelGrounded: [boolean, boolean, boolean, boolean] = [true, true, true, true];

  // Wheel meshes for visual suspension droop / rotation
  private wheelMeshes: THREE.Mesh[] = [];
  private fallbackGroup: THREE.Group = new THREE.Group();
  public masterModelGroup: THREE.Group | null = null;
  private glbWheels: { fl?: THREE.Object3D; fr?: THREE.Object3D; rl?: THREE.Object3D; rr?: THREE.Object3D } = {};
  private wheelSpinAngle = 0;

  // Autonomous drive along spline
  public isAutonomous = true;
  private autoProgressDist = 0;

  // Keyboard input state
  public keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false
  };

  constructor(worldEngine: RallyStageWorld, rapierWorld: RAPIER.World) {
    this.worldEngine = worldEngine;
    this.rapierWorld = rapierWorld;
    this.mesh = new THREE.Group();
    this.mesh.name = 'CustomRallyVehicle_Mock';

    this.wheelPositions = [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3()
    ];

    this.mesh.add(this.fallbackGroup);
    this.buildVehicleMesh();
    this.setupKeyboardListeners();

    if (typeof window !== 'undefined') {
      this.loadMasterModel();
    }
  }

  private async loadMasterModel(): Promise<void> {
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      loader.load(
        '/APEX_RALLY.glb',
        (gltf) => {
          const model = gltf.scene;
          model.name = 'APEX_RALLY_GLB';
          // Rotate 180 degrees so front (-Z in blender) faces +Z (vehicle forward)
          model.rotation.y = Math.PI;
          model.position.set(0, 0.0, 0);

          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
            if (child.name === 'Wheel_FL') this.glbWheels.fl = child;
            if (child.name === 'Wheel_FR') this.glbWheels.fr = child;
            if (child.name === 'Wheel_RL') this.glbWheels.rl = child;
            if (child.name === 'Wheel_RR') this.glbWheels.rr = child;
          });

          this.masterModelGroup = model;
          this.mesh.add(model);
          this.fallbackGroup.visible = false;
          console.log('✅ Master 1980s Group B APEX_RALLY.glb vehicle loaded successfully!');
        },
        undefined,
        (err) => {
          console.warn('Fallback procedural rally vehicle retained:', err);
        }
      );
    } catch (e) {
      console.warn('GLTFLoader offline fallback active:', e);
    }
  }

  private buildVehicleMesh(): void {
    // 1980s Group B Rally Car Body (Classic Boxy Coupe with Widebody Arches & Rear Wing)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xee2211, // Saturated Rosso rally red
      roughness: 0.25,
      metalness: 0.3
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x181818,
      roughness: 0.8
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x112233,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.85
    });

    // Lower Chassis Box
    const lowerGeo = new THREE.BoxGeometry(1.85, 0.65, 4.2);
    const lower = new THREE.Mesh(lowerGeo, bodyMat);
    lower.position.y = 0.55;
    lower.castShadow = true;
    this.fallbackGroup.add(lower);

    // Cabin Greenhouse
    const cabinGeo = new THREE.BoxGeometry(1.5, 0.58, 2.1);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 1.12, -0.2);
    cabin.castShadow = true;
    this.fallbackGroup.add(cabin);

    // Rear Group B High Downforce Wing
    const wingGeo = new THREE.BoxGeometry(1.8, 0.08, 0.45);
    const wing = new THREE.Mesh(wingGeo, trimMat);
    wing.position.set(0, 1.35, -1.9);
    wing.castShadow = true;
    this.fallbackGroup.add(wing);

    // Twin Halogen Fog Light Pods on Grille
    const lightGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10);
    lightGeo.rotateX(Math.PI / 2);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffea77 }); // Halogen Yellow
    const lightL = new THREE.Mesh(lightGeo, lightMat);
    lightL.position.set(0.35, 0.65, 2.12);
    const lightR = new THREE.Mesh(lightGeo, lightMat);
    lightR.position.set(-0.35, 0.65, 2.12);
    this.fallbackGroup.add(lightL, lightR);

    // 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.85 });

    const wheelOffsets = [
      new THREE.Vector3(0.92, 0.36, 1.3),   // FL
      new THREE.Vector3(-0.92, 0.36, 1.3),  // FR
      new THREE.Vector3(0.92, 0.36, -1.3),  // RL
      new THREE.Vector3(-0.92, 0.36, -1.3)  // RR
    ];

    for (let i = 0; i < 4; i++) {
      const wMesh = new THREE.Mesh(wheelGeo, tireMat);
      wMesh.position.copy(wheelOffsets[i]);
      wMesh.castShadow = true;
      this.fallbackGroup.add(wMesh);
      this.wheelMeshes.push(wMesh);
    }
  }

  private setupKeyboardListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      this.isAutonomous = false; // Player takes manual control
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.keys.forward = true;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.keys.backward = true;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = true;
      if (e.key === ' ' || e.key === 'Handbrake') this.keys.handbrake = true;
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.keys.forward = false;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.keys.backward = false;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = false;
      if (e.key === ' ' || e.key === 'Handbrake') this.keys.handbrake = false;
    });
  }

  public update(deltaTime: number): VehicleTelemetry {
    if (this.isAutonomous) {
      this.updateAutonomous(deltaTime);
    } else {
      this.updateManual(deltaTime);
    }

    // Sync 3D Mesh
    this.mesh.position.copy(this.position);
    this.forward.set(0, 0, 1).applyQuaternion(this.mesh.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.mesh.quaternion);

    // Update 4 Wheel contact positions
    const right = new THREE.Vector3().crossVectors(this.forward, this.up).normalize();
    this.wheelPositions[0].copy(this.position).addScaledVector(this.forward, 1.3).addScaledVector(right, 0.92);
    this.wheelPositions[1].copy(this.position).addScaledVector(this.forward, 1.3).addScaledVector(right, -0.92);
    this.wheelPositions[2].copy(this.position).addScaledVector(this.forward, -1.3).addScaledVector(right, 0.92);
    this.wheelPositions[3].copy(this.position).addScaledVector(this.forward, -1.3).addScaledVector(right, -0.92);

    // Surface query
    const surface = this.worldEngine.getSurfaceAt(this.position.x, this.position.z);

    // Engine sound / RPM calculation
    if (this.throttle > 0.1) {
      this.engineRpm = Math.min(8400, 1800 + (this.speedKmh % 45) * 140);
    } else {
      this.engineRpm = Math.max(1200, this.engineRpm - deltaTime * 4000);
    }

    // Animate Wheels
    const wheelRadius = 0.36;
    const deltaSpin = (this.speedKmh / 3.6 / wheelRadius) * deltaTime;
    this.wheelSpinAngle += deltaSpin;

    if (this.masterModelGroup) {
      if (this.glbWheels.fl) {
        this.glbWheels.fl.rotation.y = -this.steerAngle;
        this.glbWheels.fl.rotation.x = this.wheelSpinAngle;
      }
      if (this.glbWheels.fr) {
        this.glbWheels.fr.rotation.y = -this.steerAngle;
        this.glbWheels.fr.rotation.x = this.wheelSpinAngle;
      }
      if (this.glbWheels.rl) this.glbWheels.rl.rotation.x = this.wheelSpinAngle;
      if (this.glbWheels.rr) this.glbWheels.rr.rotation.x = this.wheelSpinAngle;
    }

    return {
      position: this.position.clone(),
      velocity: this.velocity.clone(),
      forward: this.forward.clone(),
      up: this.up.clone(),
      speedKmh: this.speedKmh,
      lateralSpeed: this.lateralSpeed,
      longitudinalSlip: this.longitudinalSlip,
      engineRpm: this.engineRpm,
      throttle: this.throttle,
      brake: this.brake,
      isDeceleratingHard: this.isDeceleratingHard,
      wheelPositions: [
        this.wheelPositions[0].clone(),
        this.wheelPositions[1].clone(),
        this.wheelPositions[2].clone(),
        this.wheelPositions[3].clone()
      ],
      wheelGrounded: [...this.wheelGrounded],
      currentSurface: surface
    };
  }

  /**
   * Autonomous smooth demonstration drive along the Special Stage spline
   */
  private updateAutonomous(dt: number): void {
    const totalDist = this.worldEngine.specialStageSpline.getLength();
    const targetSpeedKmh = 95.0; // Cruise at 95 km/h
    const targetSpeedMs = targetSpeedKmh / 3.6;

    this.autoProgressDist += targetSpeedMs * dt;
    if (this.autoProgressDist > totalDist) {
      this.autoProgressDist = 0; // Loop demonstration
    }

    const u = this.autoProgressDist / totalDist;
    const targetPos = this.worldEngine.specialStageSpline.getPointAt(u);
    const tangent = this.worldEngine.specialStageSpline.getTangentAt(u).normalize();

    // Smooth position interpolation - sits cleanly on road surface (+0.38m above deck)
    const roadSurfacePos = new THREE.Vector3(targetPos.x, targetPos.y + 0.38, targetPos.z);
    this.position.lerp(roadSurfacePos, dt * 10.0);

    // Orient mesh along spline tangent
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    this.mesh.quaternion.slerp(targetQuat, dt * 8.0);

    this.velocity.copy(tangent).multiplyScalar(targetSpeedMs);
    this.speedKmh = targetSpeedKmh;
    this.throttle = 0.85;
    this.brake = 0.0;
    this.isDeceleratingHard = false;

    // Simulate occasional power slide drift in hairpins
    const uFraction = u * 24.0;
    const isHairpin = Math.abs(Math.sin(uFraction * Math.PI)) > 0.85;
    if (isHairpin) {
      this.lateralSpeed = 4.2;
      this.longitudinalSlip = 0.28;
    } else {
      this.lateralSpeed = 0.8;
      this.longitudinalSlip = 0.05;
    }

    // Suspension droop over jumps (Jump 1 at ~890m, Jump 2 at ~2150m)
    const isAirborne = (this.autoProgressDist > 880 && this.autoProgressDist < 915) ||
                       (this.autoProgressDist > 2140 && this.autoProgressDist < 2175);
    for (let i = 0; i < 4; i++) {
      this.wheelGrounded[i] = !isAirborne;
      this.wheelMeshes[i].position.y = isAirborne ? 0.2 : 0.36; // Suspension droop
    }
  }

  /**
   * Player keyboard manual physics drive
   */
  private updateManual(dt: number): void {
    const accel = 18.0; // m/s^2 engine power
    const maxSpeedMs = 52.0; // ~187 km/h top speed
    const steerSpeed = 2.4;

    if (this.keys.forward) {
      this.throttle = 1.0;
      this.brake = 0.0;
      this.isDeceleratingHard = false;
      this.velocity.addScaledVector(this.forward, accel * dt);
    } else if (this.keys.backward) {
      this.throttle = 0.0;
      this.brake = 1.0;
      this.isDeceleratingHard = this.speedKmh > 40;
      this.velocity.addScaledVector(this.forward, -accel * 0.6 * dt);
    } else {
      this.throttle = 0.0;
      this.brake = 0.0;
      this.isDeceleratingHard = false;
    }

    // Steering
    if (this.keys.left) {
      this.mesh.rotateY(steerSpeed * dt);
    }
    if (this.keys.right) {
      this.mesh.rotateY(-steerSpeed * dt);
    }

    // Handbrake drift scrub
    if (this.keys.handbrake) {
      this.lateralSpeed = 5.2;
      this.velocity.multiplyScalar(0.96); // Scrub speed
    } else {
      this.lateralSpeed = 1.2;
    }

    // Rolling drag
    this.velocity.multiplyScalar(0.985);
    this.position.addScaledVector(this.velocity, dt);

    // Clamp to road deck or terrain height
    const roadSample = this.worldEngine.sampleNearestRoad(this.position.x, this.position.z);
    const groundY = this.worldEngine.getTerrainHeight(this.position.x, this.position.z);
    const surfaceY = (roadSample && roadSample.dist <= roadSample.width * 0.6) 
      ? Math.max(groundY, roadSample.roadY) 
      : groundY;
    this.position.y = surfaceY + 0.38;

    this.speedKmh = this.velocity.length() * 3.6;
  }
}

