import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';

async function testSubmeshHeights() {
  const physics = new PhysicsWorld();
  await physics.init();

  // Test with lower contact point (y = 0.70)
  const carPos = new THREE.Vector3(0, 0.8, 8);
  const contactPt = new THREE.Vector3(0, 0.7, 10);
  const localPt = contactPt.clone().sub(carPos);
  const localNorm = new THREE.Vector3(0, 0, -1);

  let targetSubMesh = 'chassis';
  if (localNorm.z < -0.30 || localPt.z > 1.4) {
    if (localPt.y > 0.35 || localNorm.y < -0.25) {
      targetSubMesh = 'hood';
    } else {
      targetSubMesh = 'front_bumper';
    }
  }

  console.log(`Low impact (y=0.70, localY=${localPt.y.toFixed(2)}): targetSubMesh = ${targetSubMesh}`);

  // Test with high impact (y = 1.20)
  const contactPtHigh = new THREE.Vector3(0, 1.2, 10);
  const localPtHigh = contactPtHigh.clone().sub(carPos);
  let targetSubMeshHigh = 'chassis';
  if (localNorm.z < -0.30 || localPtHigh.z > 1.4) {
    if (localPtHigh.y > 0.35 || localNorm.y < -0.25) {
      targetSubMeshHigh = 'hood';
    } else {
      targetSubMeshHigh = 'front_bumper';
    }
  }
  console.log(`High impact (y=1.20, localY=${localPtHigh.y.toFixed(2)}): targetSubMesh = ${targetSubMeshHigh}`);
}

testSubmeshHeights();
