import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle';
import { CollisionImpulseDispatcher, ICollisionContactEvent } from '../src/physics/CollisionImpulseDispatcher';
import { VehicleDamageController } from '../src/vehicles/VehicleDamageController';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: Record<string, any>;
}

const results: TestResult[] = [];

function assert(id: string, name: string, condition: boolean, errorMsg: string, details?: Record<string, any>) {
  if (condition) {
    results.push({ id, name, passed: true, details });
    console.log(`  [PASS] ${id.padEnd(12)} | ${name}`);
    if (details) {
      console.log(`         Details: ${JSON.stringify(details)}`);
    }
  } else {
    results.push({ id, name, passed: false, error: errorMsg, details });
    console.error(`  [FAIL] ${id.padEnd(12)} | ${name}`);
    console.error(`         Error: ${errorMsg}`);
    if (details) {
      console.error(`         Details: ${JSON.stringify(details)}`);
    }
  }
}

/**
 * Helper to record positions and normals of all meshes in a hierarchy
 */
function snapshotGeometry(root: THREE.Object3D) {
  const snapshot = new Map<THREE.Mesh, {
    name: string;
    positions: Float32Array;
    normals?: Float32Array;
  }>();

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geom = mesh.geometry;
      if (geom && geom.attributes.position) {
        const posAttr = geom.attributes.position;
        const normAttr = geom.attributes.normal;
        snapshot.set(mesh, {
          name: mesh.name || (mesh.geometry.type + '_' + snapshot.size),
          positions: new Float32Array(posAttr.array),
          normals: normAttr ? new Float32Array(normAttr.array) : undefined,
        });
      }
    }
  });

  return snapshot;
}

/**
 * Helper to compute max displacement and check validity of geometries
 */
function analyzeGeometryDeltas(
  snapshot: Map<THREE.Mesh, { name: string; positions: Float32Array; normals?: Float32Array }>
) {
  let maxDisplacement = 0;
  let totalVerticesChecked = 0;
  let displacedVerticesCount = 0;
  let nanPosCount = 0;
  let infPosCount = 0;
  let nanNormCount = 0;
  let infNormCount = 0;
  let zeroNormCount = 0;

  for (const [mesh, orig] of snapshot.entries()) {
    const geom = mesh.geometry;
    const posAttr = geom.attributes.position;
    const normAttr = geom.attributes.normal;

    const count = posAttr.count;
    totalVerticesChecked += count;

    for (let i = 0; i < count; i++) {
      const ox = orig.positions[i * 3 + 0];
      const oy = orig.positions[i * 3 + 1];
      const oz = orig.positions[i * 3 + 2];

      const cx = posAttr.getX(i);
      const cy = posAttr.getY(i);
      const cz = posAttr.getZ(i);

      if (Number.isNaN(cx) || Number.isNaN(cy) || Number.isNaN(cz)) nanPosCount++;
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) infPosCount++;

      const dist = Math.hypot(cx - ox, cy - oy, cz - oz);
      if (dist > 1e-6) {
        displacedVerticesCount++;
      }
      if (dist > maxDisplacement) {
        maxDisplacement = dist;
      }

      if (normAttr) {
        const nx = normAttr.getX(i);
        const ny = normAttr.getY(i);
        const nz = normAttr.getZ(i);
        if (Number.isNaN(nx) || Number.isNaN(ny) || Number.isNaN(nz)) nanNormCount++;
        if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) infNormCount++;
        const normLen = Math.hypot(nx, ny, nz);
        if (normLen < 1e-4) zeroNormCount++;
      }
    }
  }

  return {
    totalVerticesChecked,
    displacedVerticesCount,
    maxDisplacement,
    nanPosCount,
    infPosCount,
    nanNormCount,
    infNormCount,
    zeroNormCount,
  };
}

async function runAdversarialStressSuite() {
  console.log('================================================================');
  console.log('    EMPIRICAL ADVERSARY: COLLISION, DEFORMATION & DETACHMENT    ');
  console.log('================================================================\n');

  // ============================================================================
  // SUITE 1: DEFORMATION INTEGRITY & THRESHOLD BOUNDARIES
  // ============================================================================
  console.log('--- TEST SUITE 1: Collision Impulse & Deformation Thresholds ---');

  // Test 1.1: Sub-threshold impact J = 1799 Ns (Exactly 1 Ns below threshold)
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    let callbackFired = false;
    damageCtrl.onDamage = () => { callbackFired = true; };

    const snap = snapshotGeometry(vehicle.chassisMesh);

    // Glancing front impact J = 1799 Ns
    damageCtrl.handleCollision({
      contactPoint: new THREE.Vector3(0, 0.3, 2.1),
      contactNormal: new THREE.Vector3(0, 0, -1),
      impulseMagnitude: 1799,
      collidedEntity: 'fence',
    });

    const analysis = analyzeGeometryDeltas(snap);

    assert(
      'ADV_DEF_01',
      'Sub-threshold collision (J = 1799 Ns): zero damage callback and zero vertex displacement',
      !callbackFired && analysis.maxDisplacement === 0 && analysis.displacedVerticesCount === 0,
      `Expected 0 displacement and 0 callbacks, got maxDisp=${analysis.maxDisplacement}, displaced=${analysis.displacedVerticesCount}, callback=${callbackFired}`,
      { maxDisplacement: analysis.maxDisplacement, displacedVertices: analysis.displacedVerticesCount, totalChecked: analysis.totalVerticesChecked }
    );
  }

  // Test 1.2: Medium threshold boundary J = 1801 Ns (Exactly 1 Ns above threshold)
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    let reportedSeverity = '';
    let reportedImpulse = 0;
    damageCtrl.onDamage = (sev, imp) => {
      reportedSeverity = sev;
      reportedImpulse = imp;
    };

    const snap = snapshotGeometry(vehicle.chassisMesh);

    damageCtrl.handleCollision({
      contactPoint: new THREE.Vector3(0, 0.3, 2.1),
      contactNormal: new THREE.Vector3(0, 0, -1),
      impulseMagnitude: 1801,
      collidedEntity: 'fence',
    });

    const analysis = analyzeGeometryDeltas(snap);
    const theoreticalMax = (1801 / 15000) * 0.24; // ~0.0288m

    assert(
      'ADV_DEF_02',
      'Medium boundary (J = 1801 Ns): triggers medium severity, localized deformation <= theoretical max, no NaN/Inf/zero normals',
      reportedSeverity === 'medium' &&
      reportedImpulse === 1801 &&
      analysis.displacedVerticesCount > 0 &&
      analysis.maxDisplacement <= theoreticalMax + 1e-5 &&
      analysis.nanPosCount === 0 &&
      analysis.infPosCount === 0 &&
      analysis.nanNormCount === 0 &&
      analysis.infNormCount === 0 &&
      analysis.zeroNormCount === 0,
      `Failed on J=1801 Ns: sev=${reportedSeverity}, maxDisp=${analysis.maxDisplacement} (theo=${theoreticalMax}), displaced=${analysis.displacedVerticesCount}, nanNorm=${analysis.nanNormCount}, zeroNorm=${analysis.zeroNormCount}`,
      { reportedSeverity, maxDisplacement: analysis.maxDisplacement, theoreticalMax, displacedCount: analysis.displacedVerticesCount }
    );
  }

  // Test 1.3: Medium impact J = 5400 Ns (Substantial crumple) on procedural BufferGeometries
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    let reportedSeverity = '';
    damageCtrl.onDamage = (sev) => { reportedSeverity = sev; };

    const snap = snapshotGeometry(vehicle.chassisMesh);

    // Front bumper / lower body / blister interface hit
    damageCtrl.handleCollision({
      contactPoint: new THREE.Vector3(0.3, 0.25, 2.05),
      contactNormal: new THREE.Vector3(0.2, 0.1, -0.97).normalize(),
      impulseMagnitude: 5400,
      collidedEntity: 'tree',
    });

    const analysis = analyzeGeometryDeltas(snap);
    const theoreticalMax = (5400 / 15000) * 0.24; // 0.0864m

    assert(
      'ADV_DEF_03',
      'Medium severity (J = 5400 Ns): localized vertex crumple operates cleanly on procedural BufferGeometry',
      reportedSeverity === 'medium' &&
      analysis.displacedVerticesCount > 0 &&
      analysis.maxDisplacement <= theoreticalMax + 1e-5 &&
      analysis.maxDisplacement >= theoreticalMax * 0.5 && // should have significant deformation near contact point
      analysis.nanPosCount === 0 &&
      analysis.infPosCount === 0 &&
      analysis.nanNormCount === 0 &&
      analysis.infNormCount === 0 &&
      analysis.zeroNormCount === 0,
      `Deformation out of spec: maxDisp=${analysis.maxDisplacement}, theo=${theoreticalMax}, displaced=${analysis.displacedVerticesCount}, nanPos=${analysis.nanPosCount}, nanNorm=${analysis.nanNormCount}`,
      { maxDisplacement: analysis.maxDisplacement, theoreticalMax, displacedVertices: analysis.displacedVerticesCount }
    );
  }

  // Test 1.4: Massive impact J = 50,000 Ns: strict clamping to <= 0.24m
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    const snap = snapshotGeometry(vehicle.chassisMesh);

    damageCtrl.handleCollision({
      contactPoint: new THREE.Vector3(0, 0.3, 2.1),
      contactNormal: new THREE.Vector3(0, 0, -1),
      impulseMagnitude: 50000,
      collidedEntity: 'rock_wall',
      targetSubMesh: 'front_bumper',
    });

    const analysis = analyzeGeometryDeltas(snap);

    assert(
      'ADV_DEF_04',
      'Massive impact (J = 50,000 Ns): displacement strictly clamped to <= 0.24m without geometry explosion',
      analysis.displacedVerticesCount > 0 &&
      analysis.maxDisplacement <= 0.240001 &&
      analysis.nanPosCount === 0 &&
      analysis.infPosCount === 0 &&
      analysis.nanNormCount === 0 &&
      analysis.infNormCount === 0,
      `Clamping failure: maxDisp=${analysis.maxDisplacement} (expected <= 0.24m), nanPos=${analysis.nanPosCount}`,
      { maxDisplacement: analysis.maxDisplacement, displacedVertices: analysis.displacedVerticesCount }
    );
  }

  // Test 1.5: Extreme hyper-impact J = 1,000,000 Ns: displacement clamp stability
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    const snap = snapshotGeometry(vehicle.chassisMesh);

    damageCtrl.handleCollision({
      contactPoint: new THREE.Vector3(0, 0.3, 2.1),
      contactNormal: new THREE.Vector3(0, 0, -1),
      impulseMagnitude: 1000000,
      collidedEntity: 'mega_boulder',
    });

    const analysis = analyzeGeometryDeltas(snap);

    assert(
      'ADV_DEF_05',
      'Hyper-impact (J = 1,000,000 Ns): displacement invariant strictly holds (<= 0.24m) and all normals remain valid',
      analysis.maxDisplacement <= 0.240001 &&
      analysis.nanPosCount === 0 &&
      analysis.infPosCount === 0 &&
      analysis.nanNormCount === 0 &&
      analysis.zeroNormCount === 0,
      `Hyper-impact failure: maxDisp=${analysis.maxDisplacement}`,
      { maxDisplacement: analysis.maxDisplacement }
    );
  }

  // ============================================================================
  // SUITE 2: SUBMESH DETACHMENT STRESS & TUMBLING DYNAMICS
  // ============================================================================
  console.log('\n--- TEST SUITE 2: Submesh Detachment Stress & Dynamic Rapier Debris ---');

  // Test 2.1: Severe Front Bumper Impact (J >= 9000 Ns)
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    const initialBodies = physics.world.bodies.len();
    const initialColliders = physics.world.colliders.len();
    const bumperGroup = vehicle.frontBumperGroup;

    // Verify initial hierarchy
    const initialParent = bumperGroup.parent;

    // Severe impact
    damageCtrl.handleCollision({
      contactPoint: new THREE.Vector3(0, 0.3, 2.1),
      contactNormal: new THREE.Vector3(0, 0, -1),
      impulseMagnitude: 9500,
      collidedEntity: 'tree',
      targetSubMesh: 'front_bumper',
    });

    const bodiesAfter = physics.world.bodies.len();
    const collidersAfter = physics.world.colliders.len();
    const parentAfter = bumperGroup.parent;

    // Step physics & update damage controller for 30 frames
    const initialBumperPos = bumperGroup.position.clone();
    for (let i = 0; i < 30; i++) {
      physics.step(1 / 60, () => {});
      damageCtrl.update(1 / 60);
    }
    const finalBumperPos = bumperGroup.position.clone();
    const movedDistance = initialBumperPos.distanceTo(finalBumperPos);

    // Check radiator steam
    const isPunctured = (damageCtrl as any).isRadiatorPunctured;
    const steamMesh = (damageCtrl as any).radiatorSteamMesh as THREE.Points;
    const steamMat = steamMesh?.material as THREE.PointsMaterial;
    const steamActive = steamMat && steamMat.opacity > 0;

    assert(
      'ADV_DET_01',
      'Front Bumper Detachment: unparents to scene, adds dynamic Rapier body & collider, tumbles, and triggers radiator steam',
      initialParent !== scene &&
      parentAfter === scene &&
      bodiesAfter === initialBodies + 1 &&
      collidersAfter === initialColliders + 1 &&
      movedDistance > 0.05 &&
      isPunctured === true &&
      steamActive === true,
      `Front bumper detachment failed: parentAfter=${parentAfter === scene ? 'scene' : 'not scene'}, bodiesDelta=${bodiesAfter - initialBodies}, moved=${movedDistance.toFixed(3)}m, punctured=${isPunctured}, steamActive=${steamActive}`,
      { movedDistance, bodiesAdded: bodiesAfter - initialBodies, isPunctured, steamOpacity: steamMat?.opacity }
    );
  }

  // Test 2.2: Severe Hood Impact (J >= 9000 Ns)
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    const initialBodies = physics.world.bodies.len();
    const hoodGroup = vehicle.hoodGroup;

    // Severe impact on hood
    damageCtrl.handleCollision({
      contactPoint: new THREE.Vector3(0, 0.5, 1.2),
      contactNormal: new THREE.Vector3(0, 1, 0),
      impulseMagnitude: 11000,
      collidedEntity: 'tree_branch',
      targetSubMesh: 'hood',
    });

    const bodiesAfter = physics.world.bodies.len();
    const parentAfter = hoodGroup.parent;

    // Verify tumbling
    const initRot = hoodGroup.quaternion.clone();
    for (let i = 0; i < 30; i++) {
      physics.step(1 / 60, () => {});
      damageCtrl.update(1 / 60);
    }
    const finalRot = hoodGroup.quaternion.clone();
    const rotDelta = initRot.angleTo(finalRot);

    assert(
      'ADV_DET_02',
      'Hood Detachment: unparents to scene, creates dynamic Rapier debris, and exhibits angular tumbling rotation',
      parentAfter === scene &&
      bodiesAfter === initialBodies + 1 &&
      rotDelta > 0.05,
      `Hood detachment failed: parentAfter=${parentAfter === scene ? 'scene' : 'not scene'}, bodiesDelta=${bodiesAfter - initialBodies}, rotDelta=${rotDelta.toFixed(3)} rad`,
      { bodiesAdded: bodiesAfter - initialBodies, rotDeltaRad: rotDelta }
    );
  }

  // Test 2.3: Severe Rear Wing Impact (J >= 9000 Ns)
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    const initialBodies = physics.world.bodies.len();
    const wingGroup = vehicle.rearWingGroup;

    // Severe rear collision
    damageCtrl.handleCollision({
      contactPoint: new THREE.Vector3(0, 0.88, -2.1),
      contactNormal: new THREE.Vector3(0, 0, 1),
      impulseMagnitude: 10500,
      collidedEntity: 'chassis_barrier',
      targetSubMesh: 'rear_wing',
    });

    const bodiesAfter = physics.world.bodies.len();
    const parentAfter = wingGroup.parent;

    const initPos = wingGroup.position.clone();
    for (let i = 0; i < 30; i++) {
      physics.step(1 / 60, () => {});
      damageCtrl.update(1 / 60);
    }
    const finalPos = wingGroup.position.clone();
    const dist = initPos.distanceTo(finalPos);

    assert(
      'ADV_DET_03',
      'Rear Wing Detachment: unparents to scene, creates dynamic Rapier debris, and tumbles under gravity and velocity',
      parentAfter === scene &&
      bodiesAfter === initialBodies + 1 &&
      dist > 0.05,
      `Rear wing detachment failed: parentAfter=${parentAfter === scene ? 'scene' : 'not scene'}, bodiesDelta=${bodiesAfter - initialBodies}, dist=${dist.toFixed(3)}m`,
      { bodiesAdded: bodiesAfter - initialBodies, dist }
    );
  }

  // Test 2.4: Sequential Cascading Detachments (Bumper -> Hood -> Rear Wing) and Physics World Reset
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    const baselineBodies = physics.world.bodies.len();
    const baselineColliders = physics.world.colliders.len();

    // Detach all three submeshes sequentially
    damageCtrl.detachSubMesh('front_bumper');
    damageCtrl.detachSubMesh('hood');
    damageCtrl.detachSubMesh('rear_wing');

    const bodiesWith3Debris = physics.world.bodies.len();
    const collidersWith3Debris = physics.world.colliders.len();

    // Step physics with active debris
    for (let i = 0; i < 20; i++) {
      physics.step(1 / 60, () => {});
      damageCtrl.update(1 / 60);
    }

    // Now invoke reset()
    damageCtrl.reset();

    const bodiesAfterReset = physics.world.bodies.len();
    const collidersAfterReset = physics.world.colliders.len();

    // Step physics for 20 frames post-reset to verify zero dangling references or Rapier crashes
    let stepError: string | null = null;
    try {
      for (let i = 0; i < 20; i++) {
        physics.step(1 / 60, () => {});
        damageCtrl.update(1 / 60);
      }
    } catch (e: any) {
      stepError = e?.message || String(e);
    }

    assert(
      'ADV_RST_01',
      'Physics Reset: removes all 3 detached rigid bodies and colliders without leaving orphaned entities or crashes in Rapier world',
      bodiesWith3Debris === baselineBodies + 3 &&
      collidersWith3Debris === baselineColliders + 3 &&
      bodiesAfterReset === baselineBodies &&
      collidersAfterReset === baselineColliders &&
      stepError === null,
      `Reset failed: baseline=${baselineBodies}b/${baselineColliders}c, withDebris=${bodiesWith3Debris}b/${collidersWith3Debris}c, afterReset=${bodiesAfterReset}b/${collidersAfterReset}c, stepError=${stepError}`,
      { baselineBodies, bodiesWith3Debris, bodiesAfterReset, baselineColliders, collidersWith3Debris, collidersAfterReset }
    );
  }

  // ============================================================================
  // SUITE 3: MULTI-ANGLE PROCEDURAL GEOMETRY STRESS & HIGH-FREQUENCY BATTERY
  // ============================================================================
  console.log('\n--- TEST SUITE 3: Multi-Angle Procedural Geometry Stress & Attack Scenarios ---');

  // Test 3.1: Multi-Angle Impact on Specific Procedural Geometries (Blister Arch, Rocker, Roof, Wing)
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    const snap = snapshotGeometry(vehicle.chassisMesh);

    const hitZones = [
      { name: 'Front Blister Flare', point: new THREE.Vector3(0.94, 0.25, 1.35), normal: new THREE.Vector3(-1, 0, 0) },
      { name: 'Door Waistline Tuck', point: new THREE.Vector3(-0.845, 0.25, 0.0), normal: new THREE.Vector3(1, 0, 0) },
      { name: 'Crowned Roof Peak', point: new THREE.Vector3(0.0, 0.865, -0.22), normal: new THREE.Vector3(0, -1, 0) },
      { name: 'Rear Wing Tip Aerofoil', point: new THREE.Vector3(0.71, 0.88, -2.0), normal: new THREE.Vector3(-1, 0, 0) },
    ];

    for (const zone of hitZones) {
      damageCtrl.handleCollision({
        contactPoint: zone.point,
        contactNormal: zone.normal,
        impulseMagnitude: 5400,
        collidedEntity: 'guard_rail',
      });
    }

    const analysis = analyzeGeometryDeltas(snap);

    assert(
      'ADV_PROC_01',
      'Multi-angle procedural geometry stress: Blister arches, rocker sills, crowned roof, and wing blade deform cleanly without NaN/Inf/zero normals',
      analysis.displacedVerticesCount > 50 &&
      analysis.nanPosCount === 0 &&
      analysis.infPosCount === 0 &&
      analysis.nanNormCount === 0 &&
      analysis.infNormCount === 0 &&
      analysis.zeroNormCount === 0,
      `Procedural deformation failed across multi-angle battery: displaced=${analysis.displacedVerticesCount}, nanNorm=${analysis.nanNormCount}, zeroNorm=${analysis.zeroNormCount}`,
      { displacedVertices: analysis.displacedVerticesCount, totalChecked: analysis.totalVerticesChecked }
    );
  }

  // Test 3.2: 20-Hit Cumulative Stress Battery at Same Impact Point
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    const snap = snapshotGeometry(vehicle.chassisMesh);

    for (let i = 0; i < 20; i++) {
      const impulse = 2000 + (i * 1000);
      damageCtrl.handleCollision({
        contactPoint: new THREE.Vector3(0.2, 0.3, 2.1),
        contactNormal: new THREE.Vector3(0, 0, -1),
        impulseMagnitude: impulse,
        collidedEntity: 'tree_stump',
      });
    }

    const analysis = analyzeGeometryDeltas(snap);

    assert(
      'ADV_PROC_02',
      '20-hit high-frequency cumulative battery: successive collisions maintain numerical stability and valid normals',
      analysis.nanPosCount === 0 &&
      analysis.infPosCount === 0 &&
      analysis.nanNormCount === 0 &&
      analysis.infNormCount === 0 &&
      analysis.zeroNormCount === 0,
      `Cumulative battery produced invalid geometry: nanPos=${analysis.nanPosCount}, nanNorm=${analysis.nanNormCount}`,
      { displacedVertices: analysis.displacedVerticesCount, maxDisplacement: analysis.maxDisplacement }
    );
  }

  // Test 3.3: Terrain & Ground Contact Immunity (Immunity invariant)
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    let callbackFired = false;
    damageCtrl.onDamage = () => { callbackFired = true; };

    const snap = snapshotGeometry(vehicle.chassisMesh);

    // Massive terrain jump landing impulse J = 100,000 Ns
    damageCtrl.handleCollision({
      contactPoint: new THREE.Vector3(0, -0.15, 0),
      contactNormal: new THREE.Vector3(0, 1, 0),
      impulseMagnitude: 100000,
      collidedEntity: 'terrain',
    });

    const analysis = analyzeGeometryDeltas(snap);
    const isPunctured = (damageCtrl as any).isRadiatorPunctured;

    assert(
      'ADV_PROC_03',
      'Terrain Immunity Invariant: massive ground/terrain contacts (J = 100,000 Ns) produce strictly 0 damage, 0 deformation, and 0 detachments',
      !callbackFired &&
      analysis.displacedVerticesCount === 0 &&
      analysis.maxDisplacement === 0 &&
      isPunctured === false &&
      physics.world.bodies.len() === 1,
      `Terrain immunity violated: callback=${callbackFired}, maxDisp=${analysis.maxDisplacement}, bodies=${physics.world.bodies.len()}`,
      { callbackFired, maxDisplacement: analysis.maxDisplacement }
    );
  }

  // Test 3.4: Cascading Detachment (Front Bumper -> Cascades into Hood -> Graceful Exhaustion)
  {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    await physics.init();
    const vehicle = new CustomRallyVehicle(scene, physics);
    const dispatcher = new CollisionImpulseDispatcher(physics);
    const damageCtrl = new VehicleDamageController(scene, vehicle, physics, dispatcher);

    const baselineBodies = physics.world.bodies.len();

    // Hit 1: Front bumper impact
    damageCtrl.handleCollision({
      contactPoint: new THREE.Vector3(0, 0.3, 2.1),
      contactNormal: new THREE.Vector3(0, 0, -1),
      impulseMagnitude: 12000,
      collidedEntity: 'tree',
      targetSubMesh: 'front_bumper',
    });
    const bodiesAfterHit1 = physics.world.bodies.len();

    // Hit 2: Secondary front bumper impact (should cascade into hood detachment)
    damageCtrl.handleCollision({
      contactPoint: new THREE.Vector3(0, 0.3, 2.1),
      contactNormal: new THREE.Vector3(0, 0, -1),
      impulseMagnitude: 12000,
      collidedEntity: 'tree',
      targetSubMesh: 'front_bumper',
    });
    const bodiesAfterHit2 = physics.world.bodies.len();

    // Hit 3: Tertiary front bumper impact (both already detached, should not throw or leak)
    let hit3Threw = false;
    try {
      damageCtrl.handleCollision({
        contactPoint: new THREE.Vector3(0, 0.3, 2.1),
        contactNormal: new THREE.Vector3(0, 0, -1),
        impulseMagnitude: 12000,
        collidedEntity: 'tree',
        targetSubMesh: 'front_bumper',
      });
    } catch {
      hit3Threw = true;
    }
    const bodiesAfterHit3 = physics.world.bodies.len();

    assert(
      'ADV_PROC_04',
      'Cascading Detachment: repeated front impacts smoothly cascade front bumper -> hood, and cleanly handle exhaustion without error',
      bodiesAfterHit1 === baselineBodies + 1 &&
      bodiesAfterHit2 === baselineBodies + 2 &&
      bodiesAfterHit3 === baselineBodies + 2 &&
      hit3Threw === false,
      `Cascading detachment failed: baseline=${baselineBodies}, hit1=${bodiesAfterHit1}, hit2=${bodiesAfterHit2}, hit3=${bodiesAfterHit3}, hit3Threw=${hit3Threw}`,
      { baselineBodies, bodiesAfterHit1, bodiesAfterHit2, bodiesAfterHit3 }
    );
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log('              ADVERSARIAL STRESS SUITE SUMMARY                 ');
  console.log('================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Total Assertions : ${results.length}`);
  console.log(`Passed           : ${passedCount}`);
  console.log(`Failed           : ${failedCount}`);
  console.log('----------------------------------------------------------------');

  if (failedCount > 0) {
    console.error(`VERDICT: FAILED (${failedCount} test(s) failed)`);
    process.exit(1);
  } else {
    console.log('VERDICT: SUCCESS (100% PASS - All adversarial challenges satisfied)');
    process.exit(0);
  }
}

runAdversarialStressSuite().catch((err) => {
  console.error('Fatal stress suite execution error:', err);
  process.exit(1);
});
