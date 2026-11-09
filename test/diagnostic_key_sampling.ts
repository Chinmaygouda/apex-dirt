import { InputManager } from '../src/core/InputManager';

console.log('=== EMPIRICAL TEST: InputManager Key Sampling Race Condition ===');

// Setup minimal DOM mock if in Node environment
if (typeof window === 'undefined') {
  const listeners: Record<string, ((e: any) => void)[]> = {};
  (global as any).window = {
    addEventListener: (type: string, cb: any) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(cb);
    },
  };
  (global as any).document = {
    addEventListener: (type: string, cb: any) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(cb);
    },
  };
  (global as any).dispatchKeyEventMock = (type: string, code: string, key: string) => {
    const handlers = listeners[type] || [];
    for (const h of handlers) {
      h({ code, key, preventDefault: () => {} });
    }
  };
}

const inputMgr = new InputManager();

// Baseline frame 1
let inputs = inputMgr.update();
console.log('Frame 1 baseline inspectToggle:', inputs.inspectToggle);

// Scenario A: Key is pressed and released between frames (e.g. 50ms hold during a 60ms frame)
console.log('\n--- Scenario A: Key pressed & released between frames (50ms pulse, 60ms frame) ---');
(global as any).dispatchKeyEventMock('keydown', 'KeyI', 'i');
(global as any).dispatchKeyEventMock('keyup', 'KeyI', 'i');

// Frame 2 runs after key has been released
inputs = inputMgr.update();
console.log('Frame 2 inspectToggle (expected: true, actual: ' + inputs.inspectToggle + ')');

if (!inputs.inspectToggle) {
  console.log('>>> CONFIRMED BUG: InputManager DROPPED the key press because keyup occurred before update() was called!');
} else {
  console.log('>>> Key press was detected.');
}

// Scenario B: Key held across frames
console.log('\n--- Scenario B: Key held while frame runs ---');
(global as any).dispatchKeyEventMock('keydown', 'KeyI', 'i');
inputs = inputMgr.update();
console.log('Frame 3 inspectToggle (expected: true, actual: ' + inputs.inspectToggle + ')');
(global as any).dispatchKeyEventMock('keyup', 'KeyI', 'i');
inputs = inputMgr.update();
console.log('Frame 4 inspectToggle after release (expected: false, actual: ' + inputs.inspectToggle + ')');
