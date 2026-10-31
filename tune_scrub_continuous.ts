import fs from 'fs';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';

await RAPIER.init();

class HeadlessPhysicsWorld {
  public world: RAPIER.World;
  public rapier: typeof RAPIER = RAPIER;
  private accumulator = 0;
  private readonly fixedTimeStep = 1 / 120;

  constructor() {
    this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
  }

  public step(deltaTime: number, updatePhysicsSubstep: (dt: number) => void): number {
    this.accumulator += deltaTime;
    let substeps = 0;
    while (this.accumulator >= this.fixedTimeStep && substeps < 10) {
      updatePhysicsSubstep(this.fixedTimeStep);
      this.world.step();
      this.accumulator -= this.fixedTimeStep;
      substeps++;
    }
    return substeps;
  }
}

const csvText = fs.readFileSync('hardpack_reference_telemetry.csv', 'utf8');
const lines = csvText.trim().split('\n');
const rows: any[] = [];
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(',').map(p => p.trim());
  if (parts.length < 10) continue;
  rows.push({
    timeS: parseFloat(parts[1]),
    refSpeedMph: parseFloat(parts[3]),
    refGear: parts[4],
    throttle: parseFloat(parts[5]),
    brake: parseFloat(parts[6]),
    steer: parseFloat(parts[8]),
    handbrake: parseInt(parts[9], 10) === 1,
  });
}

function evaluateScrub(brakeSlipRearFactor: number) {
  const physics = new HeadlessPhysicsWorld();
  const ground = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), ground);

  const scene = new THREE.Scene();
  const vehicle = new CustomRallyVehicle(scene, physics as any);
  vehicle.tuning.surfaceMode = 'dirt';

  vehicle.resetPosition();
  const initSpeedMs = rows[0].refSpeedMph * 0.44704;
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  (vehicle as any).currentGear = 5;
  const omega = initSpeedMs / vehicle.wheelRadius;
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

  for (let i = 0; i < 15; i++) {
    physics.step(1 / 120, (dt) => vehicle.updatePhysicsSubstep(dt, {
      throttle: rows[0].throttle,
      brake: 0,
      steer: 0,
      handbrake: false,
      reset: false,
      drivetrainToggle: false,
      demoSkidpad: false,
      demoHandbrake: false,
    }));
  }
  vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

  let errSum = 0;
  let count = 0;
  const samples: { t: number; sim: number; ref: number; yaw: number; slip: number }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.timeS > 4.2) break;
    const inputs = {
      throttle: row.throttle,
      brake: row.brake,
      steer: row.steer,
      handbrake: row.handbrake,
      reset: false,
      drivetrainToggle: false,
      demoSkidpad: false,
      demoHandbrake: false,
    };

    physics.step(1 / 30, (dt) => {
      // In updatePhysicsSubstep, we can test custom factor if we modify or hook
      vehicle.updatePhysicsSubstep(dt, inputs);
    });
    const telem = vehicle.getTelemetry(inputs);

    const rot = vehicle.chassisBody.rotation();
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
    const yawDeg = THREE.MathUtils.radToDeg(euler.y);

    if (row.timeS >= 2.0 && row.timeS <= 4.1) {
      errSum += Math.abs(telem.speedMph - row.refSpeedMph);
      count++;
      if ([2.0, 2.5, 2.8, 3.2, 3.8, 4.1].some(t => Math.abs(row.timeS - t) < 0.018)) {
        samples.push({ t: row.timeS, sim: telem.speedMph, ref: row.refSpeedMph, yaw: yawDeg, slip: vehicle.driftAngleDeg });
      }
    }
  }

  const mae = errSum / count;
  console.log(`MAE (2.0s - 4.1s) = ${mae.toFixed(2)} mph`);
  for (const s of samples) {
    console.log(`  t=${s.t.toFixed(2)}s | Sim=${s.sim.toFixed(1)} | Ref=${s.ref.toFixed(0)} | Δ=${(s.sim - s.ref).toFixed(1)} mph | Yaw=${s.yaw.toFixed(1)}° | Slip=${s.slip.toFixed(1)}°`);
  }
}

evaluateScrub(0);
