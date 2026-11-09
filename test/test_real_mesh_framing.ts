import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle';
import {
  VehicleInspectionController,
  INSPECTION_PRESETS,
  INSPECTION_ORDER,
} from '../src/core/VehicleInspectionController';

async function testMeshFraming() {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const controller = new VehicleInspectionController(scene);

  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
  controller.enter();

  // Extract all vertex positions from all meshes in vehicle.chassisMesh
  const vertices: THREE.Vector3[] = [];
  vehicle.chassisMesh.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geom = child.geometry;
      const posAttr = geom.getAttribute('position');
      if (posAttr) {
        for (let i = 0; i < posAttr.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
          child.localToWorld(v); // converts to vehicle chassisMesh local (when chassisMesh at origin)
          vertices.push(v);
        }
      }
    }
  });

  console.log(`Extracted ${vertices.length} vertices from vehicle chassis mesh.`);

  for (const view of INSPECTION_ORDER) {
    controller.setPreset(view, true);
    controller.update(camera, vehicle, 0.016);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const v of vertices) {
      const ndc = v.clone().project(camera);
      if (ndc.x < minX) minX = ndc.x;
      if (ndc.x > maxX) maxX = ndc.x;
      if (ndc.y < minY) minY = ndc.y;
      if (ndc.y > maxY) maxY = ndc.y;
      if (ndc.z < minZ) minZ = ndc.z;
      if (ndc.z > maxZ) maxZ = ndc.z;
    }

    console.log(`\nView: ${view} (FOV: ${camera.fov})`);
    console.log(`  NDC X range: [${minX.toFixed(3)}, ${maxX.toFixed(3)}]`);
    console.log(`  NDC Y range: [${minY.toFixed(3)}, ${maxY.toFixed(3)}]`);
    console.log(`  NDC Z range: [${minZ.toFixed(3)}, ${maxZ.toFixed(3)}]`);

    const clippedX = minX < -1.0 || maxX > 1.0;
    const clippedY = minY < -1.0 || maxY > 1.0;
    if (clippedX || clippedY) {
      console.log(`  ⚠️ CLIPPING DETECTED in ${view}! (Clipped X: ${clippedX}, Clipped Y: ${clippedY})`);
    } else {
      console.log(`  ✅ Perfectly framed within [-1, 1] viewport.`);
    }
  }
}

testMeshFraming().catch(console.error);
