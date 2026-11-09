import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle';

async function main() {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  
  vehicle.chassisMesh.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geom = child.geometry;
      const posAttr = geom.getAttribute('position');
      if (posAttr) {
        let maxAngle = 0;
        let culprit = false;
        // Check if any triangle in this mesh has vertices around z in [0.3, 1.2] with high Y
        for (let i = 0; i < posAttr.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
          child.localToWorld(v);
          if (v.z > 0.4 && v.z < 1.4 && v.y > 0.45) {
            culprit = true;
            console.log('Vertex at:', v.toArray(), 'geom:', child.geometry.type, 'parent:', child.parent?.name || 'group');
            break;
          }
        }
        if (culprit) {
          console.log('Culprit mesh:', child.name || 'unnamed', 'parent:', child.parent?.name || 'unnamed', 'pos:', child.position.toArray(), 'rot:', child.rotation.toArray(), 'geom:', child.geometry.type, 'vertCount:', posAttr.count);
        }
      }
    }
  });
}
main();
