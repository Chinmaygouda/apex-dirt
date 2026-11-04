/**
 * APEX DIRT - E2E TEST FRAMEWORK & FIXTURES
 * Shared utilities, assertions, and headless physics harness for Tiers 1-4.
 */

// Headless polyfills for browser globals if running under Node.js / tsx
if (typeof globalThis.window === 'undefined') {
  const dummyCtx: any = new Proxy({
    canvas: { width: 64, height: 64 },
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    measureText: () => ({ width: 50 }),
  }, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      return (...args: any[]) => {};
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    }
  });
  const dummyElem: any = {
    style: {},
    appendChild: () => {},
    removeChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: () => dummyCtx,
    setAttribute: () => {},
    getAttribute: () => '',
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    textContent: '',
    innerHTML: '',
    children: [],
  };

  const createMockAudioNode = () => ({
    connect: () => {},
    disconnect: () => {},
    gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
    frequency: { value: 440, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
    Q: { value: 1 },
    start: () => {},
    stop: () => {},
    loop: false,
    buffer: null,
    playbackRate: { value: 1, setValueAtTime: () => {} },
  });

  class MockAudioContext {
    state = 'running';
    sampleRate = 44100;
    currentTime = 0;
    destination = createMockAudioNode();
    createGain() { return createMockAudioNode(); }
    createOscillator() { return createMockAudioNode(); }
    createBiquadFilter() { return createMockAudioNode(); }
    createBufferSource() { return createMockAudioNode(); }
    createDynamicsCompressor() { return createMockAudioNode(); }
    createBuffer(channels: number, length: number, sampleRate: number) {
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: () => new Float32Array(length),
      };
    }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }

  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    innerWidth: 1920,
    innerHeight: 1080,
    performance: performance,
    speechSynthesis: {
      cancel: () => {},
      speak: () => {},
      getVoices: () => [],
    },
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
  };

  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 64,
          height: 64,
          getContext: () => dummyCtx,
          style: {},
          addEventListener: () => {},
          removeEventListener: () => {},
        };
      }
      return { ...dummyElem, style: {} };
    },
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
    getElementById: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  (globalThis as any).SpeechSynthesisUtterance = class {
    text: string;
    rate: number = 1;
    pitch: number = 1;
    volume: number = 1;
    voice: any = null;
    constructor(text: string) { this.text = text; }
  };
}

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { CustomRallyVehicle } from '../src/vehicles/CustomRallyVehicle.js';
import { RallyStageWorld } from '../src/world/RallyStageWorld.js';
import { CollisionImpulseDispatcher } from '../src/physics/CollisionImpulseDispatcher.js';
import { VehicleEffects } from '../src/effects/VehicleEffects.js';
import { StageManager } from '../src/gameplay/StageManager.js';
import { ChaseCamera } from '../src/core/ChaseCamera.js';
import { VehicleInputs } from '../src/core/InputManager.js';

// Ensure Rapier WASM is initialized
await RAPIER.init();

export interface TestResult {
  id: string;
  tier: number;
  requirement?: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: string;
}

export type TestFn = () => Promise<void> | void;

export interface RegisteredTest {
  id: string;
  tier: number;
  requirement: string;
  name: string;
  fn: TestFn;
}

export class TestRegistry {
  private tests: RegisteredTest[] = [];

  public register(tier: number, id: string, requirement: string, name: string, fn: TestFn): void {
    this.tests.push({ tier, id, requirement, name, fn });
  }

  public getTestsForTier(tier: number): RegisteredTest[] {
    return this.tests.filter(t => t.tier === tier);
  }

  public getAllTests(): RegisteredTest[] {
    return this.tests;
  }

  public clear(): void {
    this.tests = [];
  }
}

export const registry = new TestRegistry();

export function registerTest(tier: number, id: string, requirement: string, name: string, fn: TestFn): void {
  registry.register(tier, id, requirement, name, fn);
}

/**
 * Fluent Assertion Helper
 */
export function expect(actual: any) {
  return {
    toBe(expected: any, message?: string) {
      if (actual !== expected) {
        throw new Error(message || `Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
      }
    },
    toEqual(expected: any, message?: string) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(message || `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
      }
    },
    toBeTruthy(message?: string) {
      if (!actual) {
        throw new Error(message || `Expected ${JSON.stringify(actual)} to be truthy`);
      }
    },
    toBeFalsy(message?: string) {
      if (actual) {
        throw new Error(message || `Expected ${JSON.stringify(actual)} to be falsy`);
      }
    },
    toBeGreaterThan(expected: number, message?: string) {
      if (!(actual > expected)) {
        throw new Error(message || `Expected ${actual} > ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number, message?: string) {
      if (!(actual >= expected)) {
        throw new Error(message || `Expected ${actual} >= ${expected}`);
      }
    },
    toBeLessThan(expected: number, message?: string) {
      if (!(actual < expected)) {
        throw new Error(message || `Expected ${actual} < ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected: number, message?: string) {
      if (!(actual <= expected)) {
        throw new Error(message || `Expected ${actual} <= ${expected}`);
      }
    },
    toBeBetween(min: number, max: number, message?: string) {
      if (actual < min || actual > max) {
        throw new Error(message || `Expected ${actual} to be within [${min}, ${max}]`);
      }
    },
    toBeCloseTo(expected: number, delta: number = 0.05, message?: string) {
      if (Math.abs(actual - expected) > delta) {
        throw new Error(message || `Expected ${actual} to be within ${delta} of ${expected}`);
      }
    },
    toBeDefined(message?: string) {
      if (actual === undefined || actual === null) {
        throw new Error(message || `Expected value to be defined`);
      }
    },
    toContain(item: any, message?: string) {
      if (Array.isArray(actual)) {
        if (!actual.includes(item)) {
          throw new Error(message || `Expected array to contain ${JSON.stringify(item)}`);
        }
      } else if (typeof actual === 'string') {
        if (!actual.includes(item)) {
          throw new Error(message || `Expected string to contain "${item}"`);
        }
      } else {
        throw new Error(`Cannot call toContain on type ${typeof actual}`);
      }
    }
  };
}

/**
 * Headless Simulation Harness for deterministic testing
 */
export interface SimulationHarness {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  vehicle: CustomRallyVehicle;
  groundCollider: RAPIER.Collider;
  dispatcher: CollisionImpulseDispatcher;
  step: (deltaTime: number, inputs?: Partial<VehicleInputs>) => void;
  driveForDuration: (durationS: number, inputFn: (t: number) => Partial<VehicleInputs>, stepDt?: number) => void;
  dispose: () => void;
}

export async function createSimulationHarness(surfaceFriction: number = 0.9): Promise<SimulationHarness> {
  const scene = new THREE.Scene();
  const physics = new PhysicsWorld();
  await physics.init();

  // Create infinite flat ground collider
  const groundBody = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0)
  );
  const groundCollider = physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(50000, 0.5, 50000).setFriction(surfaceFriction),
    groundBody
  );

  const vehicle = new CustomRallyVehicle(scene, physics);
  vehicle.tuning.surfaceMode = 'dirt';
  vehicle.resetPosition();

  const dispatcher = new CollisionImpulseDispatcher(physics);
  dispatcher.registerCarCollider(vehicle.chassisCollider);

  const baseInputs: VehicleInputs = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    reset: false,
    drivetrainToggle: false,
    demoSkidpad: false,
    demoHandbrake: false,
  };

  const step = (deltaTime: number, inputs?: Partial<VehicleInputs>) => {
    const combined = { ...baseInputs, ...inputs };
    physics.step(deltaTime, (subDt) => {
      vehicle.updatePhysicsSubstep(subDt, combined);
      dispatcher.drainImpulses(subDt, vehicle.chassisMesh?.position, vehicle.chassisMesh?.quaternion);
    });
    vehicle.updateVisuals(combined, deltaTime);
  };

  const driveForDuration = (
    durationS: number,
    inputFn: (t: number) => Partial<VehicleInputs>,
    stepDt: number = 1 / 60
  ) => {
    const steps = Math.round(durationS / stepDt);
    for (let i = 0; i < steps; i++) {
      const t = i * stepDt;
      step(stepDt, inputFn(t));
    }
  };

  const dispose = () => {
    // Clean up if needed
  };

  return {
    scene,
    physics,
    vehicle,
    groundCollider,
    dispatcher,
    step,
    driveForDuration,
    dispose,
  };
}
