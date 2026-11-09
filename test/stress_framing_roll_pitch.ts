import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle';
import {
  VehicleInspectionController,
  INSPECTION_ORDER,
  InspectionView,
} from '../src/core/VehicleInspectionController';

interface FramingStressResult {
  view: InspectionView;
  pitchDeg: number;
  rollDeg: number;
  minNdcX: number;
  maxNdcX: number;
  minNdcY: number;
  maxNdcY: number;
  minNdcZ: number;
  maxNdcZ: number;
  escapedViewport: boolean; // Outside [-1.0, 1.0]
  exceededStrictTolerance: boolean; // Outside [-0.85, 0.85] (T1_R7_08)
}

async function runFramingRollPitchStress() {
  console.log('========================================================================');
  console.log('   EMPIRICAL CHALLENGER: VIEWPORT FRAMING & NDC PROJECTION STRESS       ');
  console.log('========================================================================\n');

  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();
  const vehicle = new CustomRallyVehicle(scene, physics);
  const controller = new VehicleInspectionController(scene);

  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);
  controller.enter();

  // Extract all vertex positions from vehicle.chassisMesh in chassis local space
  const localVertices: THREE.Vector3[] = [];
  vehicle.chassisMesh.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geom = child.geometry;
      const posAttr = geom.getAttribute('position');
      if (posAttr) {
        for (let i = 0; i < posAttr.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
          child.localToWorld(v); // converts to vehicle chassisMesh local (when chassisMesh at origin)
          localVertices.push(v);
        }
      }
    }
  });

  // Also include wheel vertices transformed to resting position
  for (let w = 0; w < 4; w++) {
    const wGroup = vehicle.wheelMeshes[w];
    wGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const pos = child.geometry.getAttribute('position');
        if (pos) {
          for (let i = 0; i < pos.count; i++) {
            const v = new THREE.Vector3().fromBufferAttribute(pos, i);
            child.localToWorld(v);
            localVertices.push(v);
          }
        }
      }
    });
  }

  console.log(`Extracted ${localVertices.length} total vertices (chassis + wheels).\n`);

  const pitchAnglesDeg = [-5.0, 0.0, 5.0];
  const rollAnglesDeg = [-8.0, 0.0, 8.0];

  const results: FramingStressResult[] = [];
  let viewportEscapeCount = 0;
  let strictToleranceExceedCount = 0;

  for (const view of INSPECTION_ORDER) {
    console.log(`\n================ Viewpoint: ${view} ===============`);
    controller.setPreset(view, true);

    for (const pitchDeg of pitchAnglesDeg) {
      for (const rollDeg of rollAnglesDeg) {
        // Set chassis orientation to pitch and roll
        const pitchRad = THREE.MathUtils.degToRad(pitchDeg);
        const rollRad = THREE.MathUtils.degToRad(rollDeg);

        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(pitchRad, 0, rollRad, 'YXZ')
        );

        vehicle.chassisMesh.position.set(0, 0, 0);
        vehicle.chassisMesh.quaternion.copy(quat);
        vehicle.chassisMesh.updateMatrixWorld(true);

        // Mode A: Camera tracks vehicle orientation
        // Mode B: Fixed camera frame (vehicle rotates relative to fixed inspection camera)
        // Let's test Mode B: vehicle pitches & rolls relative to canonical camera orientation
        controller.update(camera, vehicle, 0.016);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        // Also test relative tilt where camera is at canonical preset and vehicle rotates by (pitch, roll)
        const canonicalCamera = new THREE.PerspectiveCamera(camera.fov, 16 / 9, 0.1, 1000);
        const config = (controller as any).getActiveConfig();
        canonicalCamera.position.copy(config.offset);
        canonicalCamera.up.copy(config.upVector);
        canonicalCamera.lookAt(config.targetOffset);
        canonicalCamera.updateMatrixWorld(true);
        canonicalCamera.updateProjectionMatrix();

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const localV of localVertices) {
          // Transform local vertex by vehicle orientation
          const worldV = localV.clone().applyQuaternion(quat);
          const ndc = worldV.project(canonicalCamera);

          if (ndc.x < minX) minX = ndc.x;
          if (ndc.x > maxX) maxX = ndc.x;
          if (ndc.y < minY) minY = ndc.y;
          if (ndc.y > maxY) maxY = ndc.y;
          if (ndc.z < minZ) minZ = ndc.z;
          if (ndc.z > maxZ) maxZ = ndc.z;
        }

        const escaped = minX < -1.0 || maxX > 1.0 || minY < -1.0 || maxY > 1.0;
        const strictExceeded = minX < -0.85 || maxX > 0.85 || minY < -0.85 || maxY > 0.85;

        if (escaped) viewportEscapeCount++;
        if (strictExceeded) strictToleranceExceedCount++;

        const status = escaped
          ? '❌ ESCAPED VIEWPORT [-1, 1]'
          : strictExceeded
          ? '⚠️ EXCEEDED STRICT [-0.85, 0.85]'
          : '✅ FRAMED';

        console.log(
          `  Pitch: ${pitchDeg >= 0 ? '+' : ''}${pitchDeg.toFixed(1)}°, Roll: ${rollDeg >= 0 ? '+' : ''}${rollDeg.toFixed(1)}° | NDC X: [${minX.toFixed(3)}, ${maxX.toFixed(3)}], NDC Y: [${minY.toFixed(3)}, ${maxY.toFixed(3)}] -> ${status}`
        );

        results.push({
          view,
          pitchDeg,
          rollDeg,
          minNdcX: minX,
          maxNdcX: maxX,
          minNdcY: minY,
          maxNdcY: maxY,
          minNdcZ: minZ,
          maxNdcZ: maxZ,
          escapedViewport: escaped,
          exceededStrictTolerance: strictExceeded,
        });
      }
    }
  }

  console.log('\n========================================================================');
  console.log(`TOTAL VIEW/ORIENTATION COMBINATIONS TESTED : ${results.length}`);
  console.log(`VIEWPORT ESCAPES (NDC outside [-1.0, 1.0]) : ${viewportEscapeCount}`);
  console.log(`STRICT TOLERANCE EXCEEDED (outside ±0.85)   : ${strictToleranceExceedCount}`);
  console.log('========================================================================');
}

runFramingRollPitchStress().catch(console.error);
