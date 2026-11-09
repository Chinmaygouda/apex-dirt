import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle';

async function measureVehicle() {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);

  // Measure bounding box of chassisMesh
  const box = new THREE.Box3().setFromObject(vehicle.chassisMesh);
  console.log('ChassisMesh Bounding Box:');
  console.log('  Min:', box.min);
  console.log('  Max:', box.max);
  console.log('  Size:', box.getSize(new THREE.Vector3()));
  console.log('  Center:', box.getCenter(new THREE.Vector3()));

  // Measure bounding box of entire carGroup (including wheels)
  const group = new THREE.Box3().setFromObject(vehicle.carGroup);
  console.log('CarGroup Bounding Box:');
  console.log('  Min:', group.min);
  console.log('  Max:', group.max);
  console.log('  Size:', group.getSize(new THREE.Vector3()));
  console.log('  Center:', group.getCenter(new THREE.Vector3()));
}

measureVehicle().catch(console.error);
