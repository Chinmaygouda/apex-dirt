import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle';

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 0.5, 5000).setFriction(0.9), ground);

const scene = new THREE.Scene();
const vehicle = new CustomRallyVehicle(scene, { world, rapier: RAPIER } as any);
vehicle.tuning.surfaceMode = 'dirt';
vehicle.resetPosition();

// Reverse at 7 mph (-3.129 m/s)
const speedMs = -7 * 0.44704;
vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: speedMs }, true);
(vehicle as any).currentGear = -1;
const omega = speedMs / vehicle.wheelRadius;
for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

const inputs = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: true,
  reset: false,
  drivetrainToggle: false,
  demoSkidpad: false,
  demoHandbrake: false,
};

// Let the car settle onto ground with speedMs for 0.5 s (60 substeps)
const settleInputs = { ...inputs, handbrake: false };
for (let s = 0; s < 60; s++) {
  vehicle.chassisBody.setLinvel({ x: 0, y: vehicle.chassisBody.linvel().y, z: speedMs }, true);
  for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;
  vehicle.updatePhysicsSubstep(1 / 120, settleInputs);
  world.step();
}

console.log('--- Coasting in Reverse (Zero Input) ---');
vehicle.resetPosition();
vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: speedMs }, true);
(vehicle as any).currentGear = -1;
for (let i = 0; i < 4; i++) (vehicle as any).wheelAngularVel[i] = omega;

// Settle 0.2s
for (let s = 0; s < 24; s++) {
  vehicle.updatePhysicsSubstep(1 / 120, { ...inputs, handbrake: false });
  world.step();
}

const noInputs = { ...inputs, handbrake: false };
let stopTimeS = -1;
for (let s = 0; s < 120 * 8; s++) { // up to 8 seconds
  const timeS = s / 120;
  vehicle.updatePhysicsSubstep(1 / 120, noInputs);
  world.step();
  const linv = vehicle.chassisBody.linvel();
  const horizSpeed = Math.hypot(linv.x, linv.z);
  if (horizSpeed < 0.05 && stopTimeS < 0) {
    stopTimeS = timeS;
  }
  if (s % 60 === 0) {
    console.log(`t=${timeS.toFixed(2)}s | speed=${(horizSpeed * 2.23694).toFixed(2)} mph (vz=${linv.z.toFixed(2)}) | gear=${vehicle.getTelemetry(noInputs).gear}`);
  }
}
console.log(`Reverse Coast Stopped in: ${stopTimeS.toFixed(2)} s (Target: 3 - 6 s)`);
