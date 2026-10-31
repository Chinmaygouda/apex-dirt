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
  public substepsCount: number = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
  }

  public step(deltaTime: number, updatePhysicsSubstep: (dt: number) => void): number {
    this.accumulator += deltaTime;
    let substeps = 0;
    while (this.accumulator >= this.fixedTimeStep && substeps < 4) {
      updatePhysicsSubstep(this.fixedTimeStep);
      this.world.step();
      this.accumulator -= this.fixedTimeStep;
      substeps++;
    }
    this.substepsCount = substeps;
    return substeps;
  }
}

// Parse CSV
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

// 1. Run Full Replay in Headless
const physicsFull = new HeadlessPhysicsWorld();
const ground = physicsFull.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
physicsFull.world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), ground);

const sceneFull = new THREE.Scene();
const vehicleFull = new CustomRallyVehicle(sceneFull, physicsFull as any);
vehicleFull.tuning.surfaceMode = 'dirt';

vehicleFull.resetPosition();
const fullInitSpeedMs = rows[0].refSpeedMph * 0.44704;
vehicleFull.chassisBody.setLinvel({ x: 0, y: 0, z: fullInitSpeedMs }, true);
(vehicleFull as any).currentGear = 5;
const fullOmega = fullInitSpeedMs / vehicleFull.wheelRadius;
for (let i = 0; i < 4; i++) (vehicleFull as any).wheelAngularVel[i] = fullOmega;

for (let i = 0; i < 15; i++) {
  physicsFull.step(1 / 120, (dt) => vehicleFull.updatePhysicsSubstep(dt, {
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
vehicleFull.chassisBody.setLinvel({ x: 0, y: 0, z: fullInitSpeedMs }, true);
for (let i = 0; i < 4; i++) (vehicleFull as any).wheelAngularVel[i] = fullOmega;

console.log('--- FULL OPEN-LOOP REPLAY IN HEADLESS ---');
const targets = [2.0, 2.37, 2.5, 2.8, 3.2, 3.23, 3.8, 4.1];
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  if (row.timeS > 4.6) break;
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

  const steps = physicsFull.step(1 / 30, (dt) => vehicleFull.updatePhysicsSubstep(dt, inputs));
  vehicleFull.updateVisuals(inputs, 1 / 30);
  const telem = vehicleFull.getTelemetry(inputs);

  const rot = vehicleFull.chassisBody.rotation();
  const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
  const yawDeg = THREE.MathUtils.radToDeg(euler.y);

  for (const t of targets) {
    if (Math.abs(row.timeS - t) < 0.018) {
      console.log(`t=${t.toFixed(2)}s | SimSpd=${telem.speedMph.toFixed(1)} mph | RefSpd=${row.refSpeedMph.toFixed(1)} mph | Yaw=${yawDeg.toFixed(1)}° | Slip=${vehicleFull.driftAngleDeg.toFixed(1)}° | Substeps=${steps}`);
    }
  }
}
