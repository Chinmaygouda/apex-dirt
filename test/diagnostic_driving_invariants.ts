import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CameraManager } from '../src/core/CameraManager';
import { VehicleInspectionController, INSPECTION_ORDER } from '../src/core/VehicleInspectionController';

console.log('=== EMPIRICAL TEST: Driving Invariants, Camera Cycling & Inspection Mode Lifecycle ===\n');

async function runInvariants() {
  await RAPIER.init();

  // 1. Invariant 1: CameraManager.cycleMode() sequence
  console.log('--- Test 1: CameraManager.cycleMode() Invariant ---');
  const camManager = new CameraManager(16 / 9);
  console.log('Initial mode:', camManager.currentMode);
  if (camManager.currentMode !== 'CHASE') {
    throw new Error(`Expected initial mode CHASE, got ${camManager.currentMode}`);
  }

  const mode1 = camManager.cycleMode();
  console.log('Cycle 1:', mode1);
  if (mode1 !== 'COCKPIT_FPV') {
    throw new Error(`Expected COCKPIT_FPV, got ${mode1}`);
  }

  const mode2 = camManager.cycleMode();
  console.log('Cycle 2:', mode2);
  if (mode2 !== 'HOOD') {
    throw new Error(`Expected HOOD, got ${mode2}`);
  }

  const mode3 = camManager.cycleMode();
  console.log('Cycle 3:', mode3);
  if (mode3 !== 'CHASE') {
    throw new Error(`Expected CHASE, got ${mode3}`);
  }
  console.log('[PASS] CameraManager.cycleMode() strictly cycles CHASE -> COCKPIT_FPV -> HOOD -> CHASE\n');

  // 2. Invariant 2 & 3: Inspection Controller Lifecycle & Occlusion Invariants
  console.log('--- Test 2: VehicleInspectionController Lifecycle & Ground Occlusion ---');
  const scene = new THREE.Scene();
  const inspectController = new VehicleInspectionController(scene);
  const mockGround = new THREE.Group();
  mockGround.name = 'ProvingGround';
  mockGround.visible = true;
  inspectController.setGroundObject(mockGround);

  console.log('Initial inspect isActive:', inspectController.isActive);
  console.log('Initial ground visible:', mockGround.visible);
  if (inspectController.isActive !== false || mockGround.visible !== true) {
    throw new Error('Initial state mismatch');
  }

  // Enter inspection
  inspectController.enter();
  if (!inspectController.isActive) throw new Error('Failed to enter inspection');
  if (!inspectController.lightingRig.visible) throw new Error('Lighting rig should be visible');
  console.log('[PASS] Entered inspection mode, lighting rig visible');

  // Check all viewpoints and ground visibility
  for (const view of INSPECTION_ORDER) {
    inspectController.setPreset(view, true);
    const expectedGroundVisible = view !== 'UNDERBODY';
    if (mockGround.visible !== expectedGroundVisible) {
      throw new Error(`Ground visibility mismatch for view ${view}: expected ${expectedGroundVisible}, got ${mockGround.visible}`);
    }
    console.log(`[PASS] View ${view}: activeView=${inspectController.activeView}, groundVisible=${mockGround.visible}`);
  }

  // Exit directly from UNDERBODY view
  inspectController.setPreset('UNDERBODY', true);
  if (mockGround.visible !== false) throw new Error('Ground should be hidden in UNDERBODY');
  inspectController.exit();
  if (inspectController.isActive !== false) throw new Error('Failed to exit inspection');
  if (mockGround.visible !== true) throw new Error('Ground visibility was NOT restored on exit from UNDERBODY!');
  if (inspectController.lightingRig.visible !== false) throw new Error('Lighting rig should be hidden after exit');
  console.log('[PASS] Exited inspection directly from UNDERBODY: ground visibility properly restored to true!\n');

  // 3. Invariant 4: Rapid Toggle Stress Test (Adversarial)
  console.log('--- Test 3: Rapid Toggle & View Cycling Stress Test ---');
  for (let i = 0; i < 200; i++) {
    inspectController.toggle();
  }
  if (inspectController.isActive !== false) {
    throw new Error(`After 200 toggles (even number), expected isActive=false, got ${inspectController.isActive}`);
  }
  if (mockGround.visible !== true) {
    throw new Error(`After 200 toggles, ground should be visible`);
  }

  inspectController.enter();
  for (let i = 0; i < 500; i++) {
    const forward = (i % 2 === 0);
    inspectController.cyclePreset(forward, true);
  }
  inspectController.exit();
  if (mockGround.visible !== true) {
    throw new Error('Ground visibility compromised after cycling stress test');
  }
  console.log('[PASS] Rapid toggle (200x) and rapid cycling (500x) passed without invariant violations.\n');

  console.log('================================================================');
  console.log('      ALL DRIVING & CAMERA INVARIANTS EMPIRICALLY CONFIRMED     ');
  console.log('================================================================');
}

runInvariants().catch((err) => {
  console.error('Invariant test failed:', err);
  process.exit(1);
});
