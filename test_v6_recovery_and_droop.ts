import { CustomRallyVehicle } from './src/vehicles/CustomRallyVehicle.js';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init();

const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
world.createCollider(RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(0.9), ground);
const scene = new THREE.Scene();
const vehicle = new CustomRallyVehicle(scene, { rapier: RAPIER, world, step: () => {} } as any);
vehicle.tuning.surfaceMode = 'dirt';

console.log('Testing recovery & droop mechanics...');
