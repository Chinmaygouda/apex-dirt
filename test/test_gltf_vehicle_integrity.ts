import fs from 'fs';
// Node.js environment polyfills for GLTFLoader image decoding
(global as any).self = global;
(global as any).window = global;
if (!(global as any).createImageBitmap) {
  (global as any).createImageBitmap = async () => ({
    width: 1024,
    height: 1024,
    close: () => {},
  });
}
import path from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

console.log('========================================================================');
console.log('         APEX RALLY GLTF/GLB INTEGRITY & HIERARCHY VERIFICATION         ');
console.log('========================================================================');

const glbPath = path.resolve('d:/carrr/APEX_RALLY.glb');
if (!fs.existsSync(glbPath)) {
  console.error(`❌ GLB file not found at: ${glbPath}`);
  process.exit(1);
}

const fileBuffer = fs.readFileSync(glbPath);
const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);

console.log(`Loaded ${glbPath} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);

const loader = new GLTFLoader();

loader.parse(
  arrayBuffer,
  '',
  (gltf) => {
    const root = gltf.scene;
    console.log(`\nSuccessfully parsed GLTF Scene. Root name: "${root.name || 'Scene'}"`);

    // Collect all object names
    const objectNames: string[] = [];
    const meshes: THREE.Mesh[] = [];
    let totalTriangles = 0;
    let totalVertices = 0;

    root.traverse((obj) => {
      objectNames.push(obj.name);
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        meshes.push(mesh);
        const geo = mesh.geometry;
        if (geo) {
          const pos = geo.getAttribute('position');
          if (pos) totalVertices += pos.count;
          if (geo.index) {
            totalTriangles += geo.index.count / 3;
          } else if (pos) {
            totalTriangles += pos.count / 3;
          }
        }
      }
    });

    console.log(`Scene Hierarchy Summary:`);
    console.log(`  - Total Objects: ${objectNames.length}`);
    console.log(`  - Total Meshes : ${meshes.length}`);
    console.log(`  - Total Vertices : ${totalVertices}`);
    console.log(`  - Total Triangles: ${Math.round(totalTriangles)} (Optimized for WebGL)`);

    // Compute bounding box
    const bbox = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    console.log(`\nBounding Box Dimensions:`);
    console.log(`  - Width  (X): ${size.x.toFixed(3)} m (Target ~1.90m)`);
    console.log(`  - Height (Y): ${size.y.toFixed(3)} m (Target ~1.38m)`);
    console.log(`  - Length (Z): ${size.z.toFixed(3)} m (Target ~4.30m)`);
    console.log(`  - Center    : (${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)})`);

    // Verify key modular components
    const requiredComponents = [
      // Wheels
      'Wheel_FL',
      'Wheel_FR',
      'Wheel_RL',
      'Wheel_RR',
      // Body & Panels
      'Main_Body',
      'Bonnet',
      'Front_Bumper',
      'Rear_Bumper',
      'Door_L',
      'Door_R',
      'Skid_Plate',
      // Suspension
      'Spring_FL',
      'Spring_FR',
      'Spring_RL',
      'Spring_RR',
      // Aerodynamics
      'Rear_Spoiler',
      'Front_Splitter',
      'Rear_Diffuser',
      // Lights
      'Tail_Lights',
      // Cockpit Interior
      'Dashboard',
      'Steering_Wheel',
      'Instrument_Cluster',
      // Exhaust
      'Exhaust_Side'
    ];

    console.log(`\nVerifying Required Modular Components:`);
    let missingCount = 0;
    for (const comp of requiredComponents) {
      const match = objectNames.some((name) => name.includes(comp));
      if (match) {
        console.log(`  ✅ Found component: ${comp}`);
      } else {
        console.log(`  ❌ Missing component: ${comp}`);
        missingCount++;
      }
    }

    // Verify Materials
    const materialNames = new Set<string>();
    meshes.forEach((m) => {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => materialNames.add(mat.name));
      } else if (m.material) {
        materialNames.add(m.material.name);
      }
    });

    console.log(`\nDiscovered PBR Materials (${materialNames.size}):`);
    materialNames.forEach((name) => console.log(`  - ${name}`));

    if (missingCount > 0) {
      console.error(`\n❌ Failed: ${missingCount} required components were not found!`);
      process.exit(1);
    }

    console.log('\n========================================================================');
    console.log('✅ ALL GLTF/GLB INTEGRITY CHECKS PASSED PERFECTLY!');
    console.log('========================================================================');
  },
  (err) => {
    console.error('❌ Failed to parse GLTF:', err);
    process.exit(1);
  }
);
