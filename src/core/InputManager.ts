export interface VehicleInputs {
  throttle: number; // 0 to 1
  brake: number;    // 0 to 1
  steer: number;    // -1 (left) to +1 (right)
  handbrake: boolean;
  reset: boolean;
  drivetrainToggle: boolean;
  demoSkidpad: boolean;
  demoHandbrake: boolean;
  cameraCycle?: boolean;
  headlightToggle?: boolean;
  dayNightToggle?: boolean;
}

export class InputManager {
  private keys: Record<string, boolean> = {};
  private inputs: VehicleInputs = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    reset: false,
    drivetrainToggle: false,
    demoSkidpad: false,
    demoHandbrake: false,
    cameraCycle: false,
    headlightToggle: false,
    dayNightToggle: false,
  };

  private prevResetPressed = false;
  private prevTogglePressed = false;
  private prevDemo1Pressed = false;
  private prevDemo2Pressed = false;
  private prevCamPressed = false;
  private prevHeadlightPressed = false;
  private prevDayNightPressed = false;

  constructor() {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      this.keys[e.key.toLowerCase()] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
      this.keys[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('keyup', onKeyUp);
  }

  public update(): VehicleInputs {
    // 1. Keyboard readings
    let kbSteer = 0;
    if (this.keys['KeyA'] || this.keys['a'] || this.keys['ArrowLeft'] || this.keys['arrowleft']) kbSteer -= 1.0;
    if (this.keys['KeyD'] || this.keys['d'] || this.keys['ArrowRight'] || this.keys['arrowright']) kbSteer += 1.0;

    let kbThrottle = 0;
    if (this.keys['KeyW'] || this.keys['w'] || this.keys['ArrowUp'] || this.keys['arrowup']) kbThrottle = 1.0;

    let kbBrake = 0;
    if (this.keys['KeyS'] || this.keys['s'] || this.keys['ArrowDown'] || this.keys['arrowdown']) kbBrake = 1.0;

    const kbHandbrake = !!(this.keys['Space'] || this.keys[' '] || this.keys['space']);
    const kbReset = !!(this.keys['KeyR'] || this.keys['r']);
    const kbToggle = !!(this.keys['KeyT'] || this.keys['t']);
    const kbDemo1 = !!(this.keys['Digit1'] || this.keys['1'] || this.keys['Numpad1']);
    const kbDemo2 = !!(this.keys['Digit2'] || this.keys['2'] || this.keys['Numpad2']);
    const kbCamCycle = !!(this.keys['KeyC'] || this.keys['c']);
    const kbHeadlight = !!(this.keys['KeyL'] || this.keys['l'] || this.keys['KeyH'] || this.keys['h']);
    const kbDayNight = !!(this.keys['KeyN'] || this.keys['n']);

    // 2. Gamepad API
    let gpThrottle = 0;
    let gpBrake = 0;
    let gpSteer = 0;
    let gpHandbrake = false;
    let gpReset = false;
    let gpToggle = false;
    let gpCamCycle = false;

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0];
    if (gp && gp.connected) {
      // Left stick X
      const stickX = gp.axes[0] ?? 0;
      if (Math.abs(stickX) > 0.08) {
        gpSteer = stickX;
      }

      // Triggers: RT (button 7) = Throttle, LT (button 6) = Brake
      if (gp.buttons[7]) gpThrottle = gp.buttons[7].value;
      if (gp.buttons[6]) gpBrake = gp.buttons[6].value;

      // Fallback if triggers are on axes (some controllers)
      if (gpThrottle === 0 && gp.axes[5] !== undefined && gp.axes[5] > -0.9) {
        gpThrottle = (gp.axes[5] + 1) * 0.5;
      }

      // Handbrake: 'A' button (button 0) or RB (button 5)
      gpHandbrake = (gp.buttons[0]?.pressed || gp.buttons[5]?.pressed) ?? false;
      // Reset: 'Y' button (button 3) or 'Back/Select' (button 8)
      gpReset = (gp.buttons[3]?.pressed || gp.buttons[8]?.pressed) ?? false;
      // Drivetrain toggle: 'X' button (button 2)
      gpToggle = gp.buttons[2]?.pressed ?? false;
      // Camera view cycle: 'Right Thumbstick Click' (button 11) or LB (button 4)
      gpCamCycle = (gp.buttons[4]?.pressed || gp.buttons[11]?.pressed) ?? false;
    }

    // Combine inputs
    const rawThrottle = Math.max(kbThrottle, gpThrottle);
    const rawBrake = Math.max(kbBrake, gpBrake);
    const rawSteer = Math.abs(gpSteer) > 0.05 ? gpSteer : kbSteer;
    const rawHandbrake = kbHandbrake || gpHandbrake;
    const rawReset = kbReset || gpReset;
    const rawToggle = kbToggle || gpToggle;
    const rawCam = kbCamCycle || gpCamCycle;
    const rawHeadlight = kbHeadlight;
    const rawDayNight = kbDayNight;

    // Trigger one-shot flags
    const resetTrigger = rawReset && !this.prevResetPressed;
    this.prevResetPressed = rawReset;

    const toggleTrigger = rawToggle && !this.prevTogglePressed;
    this.prevTogglePressed = rawToggle;

    const demo1Trigger = kbDemo1 && !this.prevDemo1Pressed;
    this.prevDemo1Pressed = kbDemo1;

    const demo2Trigger = kbDemo2 && !this.prevDemo2Pressed;
    this.prevDemo2Pressed = kbDemo2;

    const camTrigger = rawCam && !this.prevCamPressed;
    this.prevCamPressed = rawCam;

    const headlightTrigger = rawHeadlight && !this.prevHeadlightPressed;
    this.prevHeadlightPressed = rawHeadlight;

    const dayNightTrigger = rawDayNight && !this.prevDayNightPressed;
    this.prevDayNightPressed = rawDayNight;

    this.inputs.throttle = rawThrottle;
    this.inputs.brake = rawBrake;
    this.inputs.steer = rawSteer;
    this.inputs.handbrake = rawHandbrake;
    this.inputs.reset = resetTrigger;
    this.inputs.drivetrainToggle = toggleTrigger;
    this.inputs.demoSkidpad = demo1Trigger;
    this.inputs.demoHandbrake = demo2Trigger;
    this.inputs.cameraCycle = camTrigger;
    this.inputs.headlightToggle = headlightTrigger;
    this.inputs.dayNightToggle = dayNightTrigger;

    return this.inputs;
  }

  public getInputs(): VehicleInputs {
    return this.inputs;
  }

  /**
   * Play dynamic dual-rumble haptic vibration on connected gamepad (Xbox/PlayStation)
   */
  public playRumble(strongMagnitude: number, weakMagnitude: number, durationMs: number = 100): void {
    try {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
      const gamepads = navigator.getGamepads();
      const gp = gamepads[0];
      if (gp && (gp as any).vibrationActuator && typeof (gp as any).vibrationActuator.playEffect === 'function') {
        (gp as any).vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: Math.min(1000, durationMs),
          weakMagnitude: Math.min(1.0, Math.max(0, weakMagnitude)),
          strongMagnitude: Math.min(1.0, Math.max(0, strongMagnitude)),
        }).catch(() => {});
      }
    } catch {
      // Gamepad haptics optional fallback
    }
  }
}
