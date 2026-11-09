import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { SimplexNoise } from '../src/world/SimplexNoise';
import { RallyStageWorld } from '../src/world/RallyStageWorld';
import { StagePropsManager } from '../src/world/StagePropsManager';
import { WildlifeCrossingManager } from '../src/world/WildlifeCrossingManager';
import { StageTimingController } from '../src/gameplay/StageTimingController';
import { WildlifeAssetFactory } from '../src/assets/WildlifeAssetFactory';

async function runTestHarness() {
  console.log('====================================================');
  console.log('   APEX RALLY ENGINE – AUTOMATED TEST SUITE        ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
      failed++;
    }
  }

  // 1. Initialize Rapier 3D
  console.log('1. INITIALIZING RAPIER 3D PHYSICS ENGINE...');
  await RAPIER.init();
  const gravity = new RAPIER.Vector3(0, -9.81, 0);
  const rapierWorld = new RAPIER.World(gravity);
  assert(rapierWorld !== null, 'Rapier 3D Physics World created successfully');

  // 2. Simplex Noise Verification
  console.log('\n2. TESTING PROCEDURAL SIMPLEX NOISE...');
  const noise = new SimplexNoise(1985);
  const val1 = noise.noise2D(10.5, 20.3);
  const val2 = noise.noise2D(10.5, 20.3);
  const fbmVal = noise.fbm2D(15.0, 30.0, 4);
  assert(val1 === val2, 'Deterministic Seeded Noise Output');
  assert(val1 >= -1.0 && val1 <= 1.0, `Noise value in [-1, 1] range (actual: ${val1.toFixed(3)})`);
  assert(fbmVal >= -1.2 && fbmVal <= 1.2, `fBm multi-octave noise bounded (actual: ${fbmVal.toFixed(3)})`);

  // 3. Scene & World Engine Verification
  console.log('\n3. TESTING WORLD ENGINE, TERRAIN & TRACK SPLINES...');
  const scene = new THREE.Scene();
  const worldEngine = new RallyStageWorld(scene, rapierWorld);
  await worldEngine.init();

  // Terrain height queries
  const hValley = worldEngine.getTerrainHeight(-500, -500);
  const hSummit = worldEngine.getTerrainHeight(0, -30);
  assert(hValley >= 0, `Terrain valley elevation non-negative (actual: ${hValley.toFixed(2)}m)`);
  assert(hSummit > 50, `Mountain pass summit elevation relief (actual: ${hSummit.toFixed(2)}m)`);

  // Special Stage Spline Verification (2.4 km)
  const ssLength = worldEngine.specialStageSpline.getLength();
  console.log(`     Special Stage Spline Length: ${ssLength.toFixed(1)}m`);
  assert(ssLength >= 2350 && ssLength <= 2500, 'Special Stage continuous length ~2.4 km');

  // Verify banked hairpins
  const hairpinsWithBanking = worldEngine.specialStagePoints.filter(p => Math.abs(p.camberAngle) > 0.1);
  assert(hairpinsWithBanking.length >= 4, `At least 4 banked hairpins with camber > 0.1 rad (found: ${hairpinsWithBanking.length})`);

  // Verify variable road width
  const minWidth = Math.min(...worldEngine.specialStagePoints.map(p => p.width));
  const maxWidth = Math.max(...worldEngine.specialStagePoints.map(p => p.width));
  console.log(`     Road Width Variation: min=${minWidth}m, max=${maxWidth}m`);
  assert(minWidth <= 5.8 && maxWidth >= 7.8, 'Variable road width between 5.5m and 8.0m');

  // 4. Surface Transitions & Friction Coefficients
  console.log('\n4. TESTING SURFACE ZONES & TIRE FRICTION MAPPINGS...');
  const pStart = worldEngine.specialStagePoints[0].point;
  const pZone2 = worldEngine.specialStagePoints.find(p => p.distanceAlongSpline >= 1000)!.point;
  const pZone3 = worldEngine.specialStagePoints.find(p => p.distanceAlongSpline >= 2100)!.point;

  const surfZ1 = worldEngine.getSurfaceAt(pStart.x, pStart.z); // Start gantry (Zone 1)
  const surfZ2 = worldEngine.getSurfaceAt(pZone2.x, pZone2.z); // Forest straight (Zone 2)
  const surfZ3 = worldEngine.getSurfaceAt(pZone3.x, pZone3.z); // Scree hillclimb (Zone 3)

  console.log(`     Zone 1 (0-600m): ${surfZ1.name}, mu = ${surfZ1.friction}`);
  console.log(`     Zone 2 (600-1800m): ${surfZ2.name}, mu = ${surfZ2.friction}`);
  console.log(`     Zone 3 (1800-2400m): ${surfZ3.name}, mu = ${surfZ3.friction}`);

  assert(surfZ1.type === 'asphalt' && surfZ1.friction === 1.05, 'Zone 1: Sun-faded asphalt (mu = 1.05)');
  assert(surfZ2.type === 'gravel' && surfZ2.friction === 0.72, 'Zone 2: Packed coarse gravel (mu = 0.72)');
  assert(surfZ3.type === 'scree' && surfZ3.friction === 0.65, 'Zone 3: Loose mountain scree (mu = 0.65)');

  // 5. Rallycross Super-Stage & Joker Lap Route
  console.log('\n5. TESTING RALLYCROSS CIRCUIT & JOKER LAP ROUTE...');
  const rxLength = worldEngine.rallycrossSpline.getLength();
  const jokerLength = worldEngine.jokerSpline.getLength();
  console.log(`     Rallycross Circuit Length: ${rxLength.toFixed(1)}m`);
  console.log(`     Joker Route Length: ${jokerLength.toFixed(1)}m`);
  assert(rxLength >= 1100 && rxLength <= 1300, 'Rallycross closed loop circuit length ~1.2 km');
  assert(jokerLength > 150, 'Joker lap alternative route exists and adds perimeter length');

  // 6. Environmental Props & GPU Instanced Vegetation
  console.log('\n6. TESTING PROPS & GPU INSTANCED VEGETATION...');
  const propsManager = new StagePropsManager(scene, rapierWorld, worldEngine);
  await propsManager.init();

  assert(propsManager.cypressInstancedMesh.count === StagePropsManager.CYPRESS_COUNT, `1,200 Mediterranean Cypress trees instanced (${propsManager.cypressInstancedMesh.count})`);
  assert(propsManager.pineInstancedMesh.count === StagePropsManager.PINE_COUNT, `800 Italian Stone Pines instanced (${propsManager.pineInstancedMesh.count})`);
  assert(propsManager.breakableProps.length >= 2, `Breakable wooden fences and dry-stone walls registered (${propsManager.breakableProps.length})`);

  // Test Breakable Prop Collision Impulse
  const testFence = propsManager.breakableProps[0];
  assert(!testFence.isBroken, 'Breakable fence initially intact');
  // Simulate high speed car impact (speed = 22 m/s -> impulse ~25,000 N*s > threshold 4,200 N*s)
  propsManager.checkBreakableImpacts(testFence.group.position, new THREE.Vector3(0, 0, 22.0), 1180);
  assert(testFence.isBroken, 'Breakable fence shatters upon high-speed collision impulse');

  // 7. Wildlife 4-State AI Finite State Machine
  console.log('\n7. TESTING WILDLIFE 4-STATE AI STATE MACHINE...');
  const wildlifeManager = new WildlifeCrossingManager(scene, worldEngine);
  wildlifeManager.init();

  const cow = wildlifeManager.entities.find(e => e.type === 'cow')!;
  const deer = wildlifeManager.entities.find(e => e.type === 'deer')!;
  assert(cow !== undefined && deer !== undefined, 'Cow and deer wildlife entities spawned with articulated rigs');

  // Check state: Default is GRAZING
  assert(cow.state === 'GRAZING', 'Initial cow state is GRAZING');

  // Approach with car at 60m (dist < 70m) -> ALERT
  const carPosAlert = cow.mesh.position.clone().add(new THREE.Vector3(55, 0, 0));
  wildlifeManager.update(0.1, 1.0, carPosAlert);
  assert(cow.state === 'ALERT', 'Cow transitions to ALERT when vehicle is within 70m');

  // Approach with car at 25m (dist < 35m) -> CROSSING
  const carPosPanic = cow.mesh.position.clone().add(new THREE.Vector3(20, 0, 0));
  wildlifeManager.update(0.1, 1.1, carPosPanic);
  assert(cow.state === 'CROSSING', 'Cow transitions to CROSSING / PANIC when vehicle is within 35m');

  // 8. Stage Timing Controller
  console.log('\n8. TESTING STAGE TIMING CONTROLLER & SECTORS...');
  const timing = new StageTimingController(worldEngine);
  timing.init('special_stage');
  assert(timing.isRacing, 'Stage timing started');

  // Simulate vehicle advancing past Split 1 (800m)
  const split1Point = worldEngine.specialStagePoints.find(p => p.distanceAlongSpline >= 820)!.point;
  timing.update(35.2, split1Point);
  assert(timing.currentSector === 1, `Sector 1 split registered at distance (currentSector = ${timing.currentSector})`);

  // Summary
  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestHarness().catch(err => {
  console.error('Unhandled Test Harness Error:', err);
  process.exit(1);
});
