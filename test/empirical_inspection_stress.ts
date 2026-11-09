import * as THREE from 'three';
import {
  VehicleInspectionController,
  INSPECTION_PRESETS,
  INSPECTION_ORDER,
  InspectionView,
} from '../src/core/VehicleInspectionController';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';

interface TestFailure {
  category: string;
  testName: string;
  error: string;
}

const failures: TestFailure[] = [];
let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, category: string, testName: string, message: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
  } else {
    failures.push({ category, testName, error: message });
    console.error(`  [FAIL] [${category}] ${testName}: ${message}`);
  }
}

async function runEmpiricalStressSuite() {
  console.log('================================================================');
  console.log('   EMPIRICAL CHALLENGER: VEHICLE INSPECTION STRESS TEST SUITE   ');
  console.log('================================================================\n');

  // Setup basic Three.js scene & mock vehicle
  const scene = new THREE.Scene();
  const controller = new VehicleInspectionController(scene);

  // Vehicle bounding box from Master CAD specification APX-SPEC-FINAL-001:
  // Length: 4,200mm (Z: -2.25 to +1.95)
  // Width: 1,880mm (X: -0.94 to +0.94)
  // Height: 1,340mm (Y: 0.00 to 1.34)
  const cadCorners: THREE.Vector3[] = [];
  for (const x of [-0.94, 0.94]) {
    for (const y of [0.00, 1.34]) {
      for (const z of [-2.25, 1.95]) {
        cadCorners.push(new THREE.Vector3(x, y, z));
      }
    }
  }

  // Helper mock vehicle with movable/rotatable chassisMesh
  const mockChassisMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.88, 1.34, 4.20),
    new THREE.MeshBasicMaterial()
  );
  mockChassisMesh.position.set(0, 0, 0);
  scene.add(mockChassisMesh);

  const mockVehicle: any = {
    chassisMesh: mockChassisMesh,
    chassisBody: null,
    setCockpitViewMode: () => {},
  };

  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000);

  // --------------------------------------------------------------------------
  // SECTION 1: Local Coordinate Frame & Rotation Invariance Math
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: Rotation Invariance & Local Frame Math ---');

  const testRotations: { label: string; euler: THREE.Euler }[] = [
    { label: 'Identity (0,0,0)', euler: new THREE.Euler(0, 0, 0) },
    { label: 'Pure Yaw +45°', euler: new THREE.Euler(0, THREE.MathUtils.degToRad(45), 0) },
    { label: 'Pure Yaw +90°', euler: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0) },
    { label: 'Pure Yaw +180°', euler: new THREE.Euler(0, THREE.MathUtils.degToRad(180), 0) },
    { label: 'Pure Yaw -90°', euler: new THREE.Euler(0, THREE.MathUtils.degToRad(-90), 0) },
    { label: 'Pure Pitch +30° (Uphill)', euler: new THREE.Euler(THREE.MathUtils.degToRad(30), 0, 0) },
    { label: 'Pure Pitch -45° (Downhill)', euler: new THREE.Euler(THREE.MathUtils.degToRad(-45), 0, 0) },
    { label: 'Pure Pitch +80° (Extreme steep)', euler: new THREE.Euler(THREE.MathUtils.degToRad(80), 0, 0) },
    { label: 'Pure Roll +30° (Banked turn)', euler: new THREE.Euler(0, 0, THREE.MathUtils.degToRad(30)) },
    { label: 'Pure Roll +60° (Heavy roll)', euler: new THREE.Euler(0, 0, THREE.MathUtils.degToRad(60)) },
    { label: 'Pure Roll 180° (Inverted/Rollover)', euler: new THREE.Euler(0, 0, THREE.MathUtils.degToRad(180)) },
    { label: 'Composite A (Yaw 45°, Pitch 20°, Roll -15°)', euler: new THREE.Euler(THREE.MathUtils.degToRad(20), THREE.MathUtils.degToRad(45), THREE.MathUtils.degToRad(-15), 'YXZ') },
    { label: 'Composite B (Yaw 120°, Pitch -30°, Roll 50°)', euler: new THREE.Euler(THREE.MathUtils.degToRad(-30), THREE.MathUtils.degToRad(120), THREE.MathUtils.degToRad(50), 'YXZ') },
    { label: 'Composite C (Yaw -75°, Pitch 10°, Roll -80°)', euler: new THREE.Euler(THREE.MathUtils.degToRad(10), THREE.MathUtils.degToRad(-75), THREE.MathUtils.degToRad(-80), 'YXZ') },
  ];

  const testPositions: THREE.Vector3[] = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(25.4, 3.2, -145.8),
    new THREE.Vector3(-1200.0, 50.0, 3400.0),
  ];

  controller.enter();

  for (const pos of testPositions) {
    mockChassisMesh.position.copy(pos);

    for (const rot of testRotations) {
      mockChassisMesh.quaternion.setFromEuler(rot.euler);
      mockChassisMesh.updateMatrixWorld(true);

      for (const view of INSPECTION_ORDER) {
        controller.setPreset(view, true); // immediate mode
        controller.update(camera, mockVehicle, 0.016);

        const config = INSPECTION_PRESETS[view];
        const carQuat = mockChassisMesh.quaternion;
        const carPos = mockChassisMesh.position;

        // Verify camera position in local car space
        const localCamPos = camera.position.clone().sub(carPos).applyQuaternion(carQuat.clone().invert());
        const posErr = localCamPos.distanceTo(config.offset);
        assert(
          posErr < 1e-4,
          'Geometry',
          `${view} at ${rot.label}`,
          `Local camera position error = ${posErr.toFixed(6)}m (expected ${config.offset.toArray()})`
        );

        // Verify lighting rig transform synchronization
        const rigPosErr = controller.lightingRig.position.distanceTo(carPos);
        const rigQuatErr = controller.lightingRig.quaternion.angleTo(carQuat);
        assert(
          rigPosErr < 1e-4 && rigQuatErr < 1e-4,
          'LightingRig',
          `Sync at ${rot.label}`,
          `Lighting rig position/quat error: pos=${rigPosErr.toFixed(6)}, quat=${rigQuatErr.toFixed(6)}`
        );

        // Verify no NaN or Inf in camera matrix or quaternion
        assert(
          !isNaN(camera.position.x) && !isNaN(camera.position.y) && !isNaN(camera.position.z),
          'Sanity',
          `${view} Position NaN check`,
          'Camera position contains NaN'
        );
        assert(
          !isNaN(camera.quaternion.x) && !isNaN(camera.quaternion.y) && !isNaN(camera.quaternion.z) && !isNaN(camera.quaternion.w),
          'Sanity',
          `${view} Quaternion NaN check`,
          'Camera quaternion contains NaN'
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 2: Geometric Framing & Aspect Ratio Projection Analysis
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Geometric Framing & Viewport Projections ---');

  // Reset vehicle to origin for framing checks
  mockChassisMesh.position.set(0, 0, 0);
  mockChassisMesh.quaternion.set(0, 0, 0, 1);
  mockChassisMesh.updateMatrixWorld(true);

  const aspectRatios: { name: string; aspect: number }[] = [
    { name: '16:9 Standard Widescreen (1.778)', aspect: 16 / 9 },
    { name: '16:10 Common Display (1.600)', aspect: 16 / 10 },
    { name: '4:3 Traditional (1.333)', aspect: 4 / 3 },
    { name: '21:9 Ultrawide (2.333)', aspect: 21 / 9 },
    { name: '32:9 Super Ultrawide (3.555)', aspect: 32 / 9 },
    { name: '1:1 Square (1.000)', aspect: 1.0 },
    { name: '9:16 Portrait (0.5625)', aspect: 9 / 16 },
  ];

  for (const ar of aspectRatios) {
    camera.aspect = ar.aspect;

    for (const view of INSPECTION_ORDER) {
      controller.setPreset(view, true);
      controller.update(camera, mockVehicle, 0.016);

      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();

      // Project all CAD bounding box corners into NDC space [-1, 1]
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      for (const corner of cadCorners) {
        const ndc = corner.clone().project(camera);
        if (ndc.x < minX) minX = ndc.x;
        if (ndc.x > maxX) maxX = ndc.x;
        if (ndc.y < minY) minY = ndc.y;
        if (ndc.y > maxY) maxY = ndc.y;
        if (ndc.z < minZ) minZ = ndc.z;
        if (ndc.z > maxZ) maxZ = ndc.z;
      }

      const fitsX = minX >= -1.05 && maxX <= 1.05; // allow small 5% margin for boundary analysis
      const fitsY = minY >= -1.05 && maxY <= 1.05;
      const visibleInFrustum = minZ >= -1.0 && maxZ <= 1.0;

      // In 16:9, all 6 viewpoints must strictly frame the vehicle bounding box
      if (ar.name.startsWith('16:9')) {
        assert(
          fitsX && fitsY && visibleInFrustum,
          'Framing 16:9',
          `${view}`,
          `Bounding box NDC bounds in 16:9: X=[${minX.toFixed(2)}, ${maxX.toFixed(2)}], Y=[${minY.toFixed(2)}, ${maxY.toFixed(2)}], Z=[${minZ.toFixed(2)}, ${maxZ.toFixed(2)}]`
        );
      }

      // Record aspect ratio envelope bounds
      // (Informational check: does 9:16 portrait clip sideways?)
      if (ar.aspect < 1.0 && (maxX > 1.0 || minX < -1.0)) {
        // Expected portrait limitation on side/isometric view: document exact metrics
      }
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 3: View Switching Transitions & Adversarial Singularity Stress
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: View Switching Transitions & Adversarial Stress ---');

  // Test all 6x6 = 36 transition pairs
  for (const fromView of INSPECTION_ORDER) {
    for (const toView of INSPECTION_ORDER) {
      if (fromView === toView) continue;

      // Start at fromView
      controller.setPreset(fromView, true);
      controller.update(camera, mockVehicle, 0.016);

      // Trigger smooth transition to toView
      controller.setPreset(toView, false);

      // Step transition over 120 frames at various dt rates
      const testDts = [0.00833, 0.01667, 0.03333, 0.05];
      for (const dt of testDts) {
        // Run until settled or max 150 frames
        let frames = 0;
        let nanDetected = false;
        let infDetected = false;

        while (frames < 150) {
          controller.update(camera, mockVehicle, dt);
          frames++;

          if (
            isNaN(camera.position.x) || isNaN(camera.position.y) || isNaN(camera.position.z) ||
            isNaN(camera.quaternion.x) || isNaN(camera.quaternion.y) || isNaN(camera.quaternion.z) || isNaN(camera.quaternion.w) ||
            isNaN(camera.fov)
          ) {
            nanDetected = true;
            break;
          }

          if (
            !isFinite(camera.position.x) || !isFinite(camera.position.y) || !isFinite(camera.position.z)
          ) {
            infDetected = true;
            break;
          }
        }

        assert(
          !nanDetected,
          'Transition Sanity',
          `${fromView} -> ${toView} (dt=${dt})`,
          `NaN detected during transition at frame ${frames}`
        );
        assert(
          !infDetected,
          'Transition Sanity',
          `${fromView} -> ${toView} (dt=${dt})`,
          `Infinity detected during transition at frame ${frames}`
        );

        // Verify final state reached target preset config
        const targetConfig = INSPECTION_PRESETS[toView];
        const finalDist = camera.position.distanceTo(targetConfig.offset);
        assert(
          finalDist < 0.05,
          'Transition Convergence',
          `${fromView} -> ${toView} (dt=${dt})`,
          `Did not converge to target position: dist=${finalDist.toFixed(4)}m after ${frames} frames`
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 4: Collinear / Opposite View Singularity Test (TOP <-> UNDERBODY)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Top <-> Underbody Collinear Singularity Stress ---');

  // Specific high-frequency simulation of TOP -> UNDERBODY crossing point
  controller.setPreset('TOP', true);
  controller.update(camera, mockVehicle, 0.016);
  controller.setPreset('UNDERBODY', false);

  // Micro-stepping around the zero-crossing point
  let minDistanceToTarget = Infinity;
  let singularityHit = false;

  for (let step = 0; step < 500; step++) {
    // Call update with small dt
    controller.update(camera, mockVehicle, 0.005);
    const lookAtTarget = (controller as any).currentLookAt as THREE.Vector3;
    const dist = camera.position.distanceTo(lookAtTarget);
    if (dist < minDistanceToTarget) minDistanceToTarget = dist;

    if (dist < 1e-6) {
      singularityHit = true;
    }

    assert(
      !isNaN(camera.quaternion.x) && !isNaN(camera.quaternion.y) && !isNaN(camera.quaternion.z) && !isNaN(camera.quaternion.w),
      'Singularity',
      `TOP->UNDERBODY step ${step}`,
      `Quaternion became NaN during collinear crossing! dist = ${dist}`
    );
  }

  console.log(`  Min distance between camera position and look-at target during TOP->UNDERBODY: ${minDistanceToTarget.toFixed(4)}m`);

  // --------------------------------------------------------------------------
  // SECTION 5: Rapid Switching, Interrupted Transitions & Boundary Inputs
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Rapid Switching & Boundary Stress ---');

  // Rapid switching: 100 switches in 1 frame
  for (let i = 0; i < 100; i++) {
    controller.cyclePreset(i % 2 === 0);
  }
  controller.update(camera, mockVehicle, 0.016);
  assert(
    !isNaN(camera.position.x) && !isNaN(camera.quaternion.x),
    'Rapid Switching',
    '100 cycles in 1 frame',
    'Rapid switching broke camera transform'
  );

  // Boundary index inputs
  const boundaryIndices = [-9999, -1, 0, 1, 2, 3, 4, 5, 6, 7, 100, 99999];
  for (const idx of boundaryIndices) {
    controller.setPresetByIndex(idx, true);
    controller.update(camera, mockVehicle, 0.016);
    assert(
      INSPECTION_ORDER.includes(controller.activeView),
      'Boundary Indices',
      `Index ${idx}`,
      `Invalid activeView: ${controller.activeView}`
    );
  }

  // Extreme dt values
  const extremeDts = [0, 0.000001, 1.0, 10.0, 100.0];
  for (const dt of extremeDts) {
    controller.setPreset('FRONT', false);
    controller.update(camera, mockVehicle, dt);
    assert(
      !isNaN(camera.position.x) && !isNaN(camera.quaternion.x),
      'Extreme dt',
      `dt = ${dt}`,
      'Camera transform corrupted on extreme dt'
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 6: Underbody Ground Plane Occlusion Hiding & Side Effects
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 6: Ground Plane Occlusion & State Cleanup ---');

  const mockGround = new THREE.Group();
  mockGround.name = 'ProvingGround';
  mockGround.visible = true;

  controller.setGroundObject(mockGround);
  assert(mockGround.visible === true, 'Occlusion', 'Init', 'Ground must start visible');

  // Enter inspection
  controller.enter();
  assert(mockGround.visible === true, 'Occlusion', 'Enter FRONT', 'Ground must be visible in FRONT');

  controller.setPreset('UNDERBODY', true);
  assert(mockGround.visible === false, 'Occlusion', 'UNDERBODY', 'Ground must be hidden in UNDERBODY');

  controller.setPreset('SIDE', true);
  assert(mockGround.visible === true, 'Occlusion', 'SIDE', 'Ground must be restored in SIDE');

  controller.setPreset('UNDERBODY', true);
  assert(mockGround.visible === false, 'Occlusion', 'UNDERBODY 2', 'Ground must be hidden in UNDERBODY');

  controller.exit();
  assert(mockGround.visible === true, 'Occlusion', 'Exit', 'Ground must be restored after exit from UNDERBODY');

  // Test exit from non-underbody
  controller.enter();
  controller.setPreset('FRONT', true);
  controller.exit();
  assert(mockGround.visible === true, 'Occlusion', 'Exit FRONT', 'Ground must remain visible after exit from FRONT');

  // Null safety
  controller.setGroundObject(null);
  controller.enter();
  controller.setPreset('UNDERBODY', true);
  controller.exit();
  assert(true, 'Occlusion', 'Null Safety', 'Null groundObject does not throw');

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TOTAL ASSERTIONS : ${totalAssertions}`);
  console.log(`PASSED           : ${passedAssertions}`);
  console.log(`FAILED           : ${failures.length}`);
  console.log('================================================================');

  if (failures.length > 0) {
    console.error('\nFAILURES SUMMARY:');
    for (const f of failures) {
      console.error(`- [${f.category}] ${f.testName}: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('\nALL EMPIRICAL STRESS TESTS PASSED CLEANLY! (100% SUCCESS)');
    process.exit(0);
  }
}

runEmpiricalStressSuite().catch((err) => {
  console.error('Fatal crash during empirical stress suite:', err);
  process.exit(1);
});
