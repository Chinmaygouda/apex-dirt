/**
 * APEX DIRT - PROCEDURAL WEB AUDIO RALLY SOUND ENGINE
 * Phase 5 Deliverable: 100% Procedural Web Audio Synthesis
 * 
 * Subsystems:
 * 1. Engine: Harmonic ladder (fundamental f0 = RPM/30, harmonics up to ~2 kHz),
 *    pitch dip at gear shifts, and throttle-dependent brightness (dynamic lowpass cutoff).
 * 2. Exhaust Pops: Synced to Phase 2a anti-lag backfire pops (sharp crack + sub thump + crackle cluster).
 * 3. Tyre Skid: Slip-angle and slide-speed modulated bandpass rubber scrub.
 * 4. Wind & Gravel: Continuous speed-scaled aerodynamic wind rush + gravel spray rattling.
 * 5. Brakes: High-frequency metallic rotor friction and mechanical handbrake ratchet & lock bite.
 */

import { VehicleTelemetry } from '../vehicles/RapierBaselineVehicle';

export class RallyAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private isInitialized: boolean = false;

  // Master Bus
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  // 1. Engine Harmonic Ladder Oscillators (f0, 0.5f0, 2f0, 3f0, 4f0, 6f0, 8f0)
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineOscs: { osc: OscillatorNode; gain: GainNode; mult: number }[] = [];
  private prevGear: string | number = 1;
  private shiftDipAmount: number = 0;

  // 2. Tyre Skid Noise
  private skidGain: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;

  // 3. Wind & Gravel Spray
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private gravelGain: GainNode | null = null;
  private gravelFilter: BiquadFilterNode | null = null;

  // 4. Brake Friction
  private brakeGain: GainNode | null = null;
  private brakeFilter: BiquadFilterNode | null = null;

  // 4b. Turbo Boost Whine & Wastegate Flutter
  private turboGain: GainNode | null = null;
  private turboOsc: OscillatorNode | null = null;
  private prevThrottleInput: number = 0;

  // 5. Shared Looped Noise Buffer
  private noiseSource: AudioBufferSourceNode | null = null;

  // Pop throttling
  private lastPopTime: number = 0;
  private prevHandbrake: boolean = false;

  constructor() {
    // Lazy initialize on first user gesture
    this.setupUserUnlock();
  }

  private setupUserUnlock(): void {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    };

    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('click', unlock, { once: true });
  }

  /**
   * Initializes Web Audio context and node graph
   */
  public init(): boolean {
    if (this.isInitialized) return true;
    if (typeof window === 'undefined') return false;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return false;

      this.ctx = new AudioCtx();
      const ctx = this.ctx;

      // 1. Master Output & Limiter Compressor
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, ctx.currentTime);

      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-3.0, ctx.currentTime);
      this.compressor.knee.setValueAtTime(6.0, ctx.currentTime);
      this.compressor.ratio.setValueAtTime(8.0, ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      this.compressor.release.setValueAtTime(0.08, ctx.currentTime);

      this.masterGain.connect(this.compressor);
      this.compressor.connect(ctx.destination);

      // 2. Create Shared Looped Noise Buffer (2.0 seconds of stereo white/pink noise)
      const noiseBuffer = this.createNoiseBuffer(ctx, 2.0);

      // 3. Engine Harmonic Ladder Subsystem
      this.setupEngineGraph(ctx);

      // 4. Tyre Skid Subsystem
      this.setupTyreSkidGraph(ctx, noiseBuffer);

      // 5. Wind Rush Subsystem
      this.setupWindGraph(ctx, noiseBuffer);

      // 6. Gravel Spray Subsystem
      this.setupGravelGraph(ctx, noiseBuffer);

      // 7. Brake Friction Subsystem
      this.setupBrakeGraph(ctx, noiseBuffer);

      // 8. Turbo Boost Whistle Subsystem
      this.setupTurboGraph(ctx);

      this.isInitialized = true;
      return true;
    } catch (e) {
      console.warn('[RallyAudioEngine] Web Audio initialization deferred:', e);
      return false;
    }
  }

  /**
   * Generate continuous noise buffer for physical friction and aerodynamic effects
   */
  private createNoiseBuffer(ctx: AudioContext, durationS: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const numSamples = Math.floor(sampleRate * durationS);
    const buffer = ctx.createBuffer(2, numSamples, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lastVal = 0;
      for (let i = 0; i < numSamples; i++) {
        // Pink-ish noise filter for body
        const white = Math.random() * 2 - 1;
        lastVal = (lastVal * 0.7) + (white * 0.3);
        data[i] = lastVal;
      }
    }
    return buffer;
  }

  /**
   * Setup 4-cylinder rally engine harmonic ladder graph
   * f0 = RPM / 30. Harmonics extend up to ~2,000 Hz.
   */
  private setupEngineGraph(ctx: AudioContext): void {
    this.engineGain = ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.35, ctx.currentTime);

    // Throttle-dependent brightness filter
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(500, ctx.currentTime);
    this.engineFilter.Q.setValueAtTime(2.2, ctx.currentTime);

    this.engineGain.connect(this.engineFilter);
    this.engineFilter.connect(this.masterGain!);

    // Harmonic Ladder Ratios & relative balance
    // 0.5x (sub rumble), 1.0x (fundamental pulse), 2.0x (manifold exhaust),
    // 3.0x (intake throat), 4.0x (cylinder rasp), 6.0x (high induction howl), 8.0x (top-end rasp)
    const harmonicRatios = [
      { mult: 0.5, type: 'sine' as OscillatorType, weight: 0.32 },
      { mult: 1.0, type: 'sawtooth' as OscillatorType, weight: 0.52 },
      { mult: 2.0, type: 'sawtooth' as OscillatorType, weight: 0.42 },
      { mult: 3.0, type: 'triangle' as OscillatorType, weight: 0.30 },
      { mult: 4.0, type: 'sawtooth' as OscillatorType, weight: 0.22 },
      { mult: 6.0, type: 'sawtooth' as OscillatorType, weight: 0.16 },
      { mult: 8.0, type: 'sawtooth' as OscillatorType, weight: 0.10 },
    ];

    this.engineOscs = [];
    for (const spec of harmonicRatios) {
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      osc.frequency.setValueAtTime(40 * spec.mult, ctx.currentTime);

      const hGain = ctx.createGain();
      hGain.gain.setValueAtTime(spec.weight, ctx.currentTime);

      osc.connect(hGain);
      hGain.connect(this.engineGain);
      osc.start();

      this.engineOscs.push({ osc, gain: hGain, mult: spec.mult });
    }
  }

  /**
   * Setup tyre skid audio graph (modulated by lateral slip)
   */
  private setupTyreSkidGraph(ctx: AudioContext, buffer: AudioBuffer): void {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.setValueAtTime(800, ctx.currentTime);
    this.skidFilter.Q.setValueAtTime(1.8, ctx.currentTime);

    this.skidGain = ctx.createGain();
    this.skidGain.gain.setValueAtTime(0.0, ctx.currentTime);

    src.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.masterGain!);
    src.start();
  }

  /**
   * Setup aerodynamic wind rush graph
   */
  private setupWindGraph(ctx: AudioContext, buffer: AudioBuffer): void {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.setValueAtTime(300, ctx.currentTime);
    this.windFilter.Q.setValueAtTime(0.8, ctx.currentTime);

    this.windGain = ctx.createGain();
    this.windGain.gain.setValueAtTime(0.0, ctx.currentTime);

    src.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain!);
    src.start();
  }

  /**
   * Setup gravel spray & road texture noise graph
   */
  private setupGravelGraph(ctx: AudioContext, buffer: AudioBuffer): void {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    this.gravelFilter = ctx.createBiquadFilter();
    this.gravelFilter.type = 'bandpass';
    this.gravelFilter.frequency.setValueAtTime(2200, ctx.currentTime);
    this.gravelFilter.Q.setValueAtTime(2.5, ctx.currentTime);

    this.gravelGain = ctx.createGain();
    this.gravelGain.gain.setValueAtTime(0.0, ctx.currentTime);

    src.connect(this.gravelFilter);
    this.gravelFilter.connect(this.gravelGain);
    this.gravelGain.connect(this.masterGain!);
    src.start();
  }

  /**
   * Setup brake rotor metallic friction graph
   */
  private setupBrakeGraph(ctx: AudioContext, buffer: AudioBuffer): void {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    this.brakeFilter = ctx.createBiquadFilter();
    this.brakeFilter.type = 'bandpass';
    this.brakeFilter.frequency.setValueAtTime(3200, ctx.currentTime);
    this.brakeFilter.Q.setValueAtTime(5.5, ctx.currentTime);

    this.brakeGain = ctx.createGain();
    this.brakeGain.gain.setValueAtTime(0.0, ctx.currentTime);

    src.connect(this.brakeFilter);
    this.brakeFilter.connect(this.brakeGain);
    this.brakeGain.connect(this.masterGain!);
    src.start();
  }

  private setupTurboGraph(ctx: AudioContext): void {
    this.turboOsc = ctx.createOscillator();
    this.turboOsc.type = 'sine';
    this.turboOsc.frequency.setValueAtTime(1400, ctx.currentTime);

    this.turboGain = ctx.createGain();
    this.turboGain.gain.setValueAtTime(0.0, ctx.currentTime);

    this.turboOsc.connect(this.turboGain);
    this.turboGain.connect(this.masterGain!);
    this.turboOsc.start();
  }

  public triggerWastegateFlutter(intensity: number = 1.0): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const ctx = this.ctx;

    for (let p = 0; p < 4; p++) {
      const pulseTime = now + p * 0.055;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1800 - p * 150, pulseTime);
      osc.frequency.exponentialRampToValueAtTime(750, pulseTime + 0.045);

      const g = ctx.createGain();
      const pVol = (0.28 - p * 0.055) * intensity;
      g.gain.setValueAtTime(pVol, pulseTime);
      g.gain.exponentialRampToValueAtTime(0.001, pulseTime + 0.045);

      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(pulseTime);
      osc.stop(pulseTime + 0.05);
    }
  }

  /**
   * Trigger procedural rally anti-lag exhaust pop
   * Synced with Phase 2a exhaust flame cone & smoke puff
   */
  public triggerExhaustPop(intensity: number = 1.0): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastPopTime < 0.08) return; // Prevent excessive clumping
    this.lastPopTime = now;

    const ctx = this.ctx;

    // Component 1: Sharp Gunshot Transient Click
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420 * (1 + Math.random() * 0.4), now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.045);

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.85 * intensity, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(clickGain);
    clickGain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.05);

    // Component 2: Low-Frequency Exhaust Pressure Thump
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.exponentialRampToValueAtTime(45, now + 0.09);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.70 * intensity, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain!);
    subOsc.start(now);
    subOsc.stop(now + 0.10);

    // Component 3: Overrun Crackle Burst
    const crackleBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const cData = crackleBuffer.getChannelData(0);
    for (let i = 0; i < cData.length; i++) {
      cData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
    }
    const cSrc = ctx.createBufferSource();
    cSrc.buffer = crackleBuffer;

    const cFilter = ctx.createBiquadFilter();
    cFilter.type = 'bandpass';
    cFilter.frequency.setValueAtTime(1400 + Math.random() * 600, now);
    cFilter.Q.setValueAtTime(2.0, now);

    const cGain = ctx.createGain();
    cGain.gain.setValueAtTime(0.55 * intensity, now);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    cSrc.connect(cFilter);
    cFilter.connect(cGain);
    cGain.connect(this.masterGain!);
    cSrc.start(now);
  }

  /**
   * Trigger mechanical handbrake ratchet click
   */
  public triggerHandbrakeRatchet(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const ctx = this.ctx;

    // Dual-tooth metallic ratchet clicks
    for (let tooth = 0; tooth < 2; tooth++) {
      const clickTime = now + tooth * 0.045;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(2400 - tooth * 400, clickTime);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.4, clickTime);
      g.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.015);

      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(clickTime);
      osc.stop(clickTime + 0.02);
    }
  }

  /**
   * Trigger procedural crash / metal deformation crunch sound
   */
  /**
   * Play procedural metallic skid plate underbody scrape audio (CAD §4.4)
   * High-frequency abrasive titanium/aluminum friction sound modulated by speed.
   */
  public playSkidPlateScrape(velocity: number): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const ctx = this.ctx;

    // Metallic screech burst using bandpassed noise
    if (this.noiseSource && this.noiseSource.buffer) {
      const scrapeSrc = ctx.createBufferSource();
      scrapeSrc.buffer = this.noiseSource.buffer;

      const scrapeFilter = ctx.createBiquadFilter();
      scrapeFilter.type = 'bandpass';
      const centerFreq = 2600 + Math.min(1800, velocity * 45);
      scrapeFilter.frequency.setValueAtTime(centerFreq, now);
      scrapeFilter.Q.setValueAtTime(4.5, now);

      const scrapeGain = ctx.createGain();
      const vol = Math.min(0.55, 0.15 + (velocity / 40.0) * 0.40);
      scrapeGain.gain.setValueAtTime(vol, now);
      scrapeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      scrapeSrc.connect(scrapeFilter);
      scrapeFilter.connect(scrapeGain);
      scrapeGain.connect(this.masterGain!);
      scrapeSrc.start(now);
      scrapeSrc.stop(now + 0.15);
    }
  }

  public triggerCollision(severity: 'minor' | 'medium' | 'severe', impulse: number): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const ctx = this.ctx;

    // 1. Heavy low-frequency chassis thump
    const subOsc = ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.18);

    const subGain = ctx.createGain();
    const subVolume = Math.min(1.0, 0.4 + impulse / 15000);
    subGain.gain.setValueAtTime(subVolume, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain!);
    subOsc.start(now);
    subOsc.stop(now + 0.25);

    // 2. High-frequency metal crunch / shatter
    if (this.noiseSource && this.noiseSource.buffer) {
      const crunchSrc = ctx.createBufferSource();
      crunchSrc.buffer = this.noiseSource.buffer;

      const crunchFilter = ctx.createBiquadFilter();
      crunchFilter.type = 'bandpass';
      crunchFilter.frequency.setValueAtTime(severity === 'severe' ? 1600 : 2200, now);
      crunchFilter.Q.setValueAtTime(3.0, now);

      const crunchGain = ctx.createGain();
      crunchGain.gain.setValueAtTime(severity === 'severe' ? 0.85 : 0.45, now);
      crunchGain.gain.exponentialRampToValueAtTime(0.001, now + (severity === 'severe' ? 0.35 : 0.15));

      crunchSrc.connect(crunchFilter);
      crunchFilter.connect(crunchGain);
      crunchGain.connect(this.masterGain!);
      crunchSrc.start(now);
    }

    // 3. Resonant metallic ring for severe impacts
    if (severity === 'severe') {
      const ringOsc = ctx.createOscillator();
      ringOsc.type = 'sine';
      ringOsc.frequency.setValueAtTime(840, now);

      const ringGain = ctx.createGain();
      ringGain.gain.setValueAtTime(0.4, now);
      ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      ringOsc.connect(ringGain);
      ringGain.connect(this.masterGain!);
      ringOsc.start(now);
      ringOsc.stop(now + 0.7);
    }
  }

  /**
   * Main audio frame update called from render loop
   */
  public update(dt: number, telem: VehicleTelemetry): void {
    if (!this.isInitialized || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // 1. Shift pitch dip detection
    if (telem.isShifting) {
      this.shiftDipAmount = Math.min(1.0, this.shiftDipAmount + dt * 12.0); // Rapid drop
    } else {
      this.shiftDipAmount = Math.max(0.0, this.shiftDipAmount - dt * 6.0); // Smooth recovery
    }

    // 2. Engine Fundamental Frequency & Harmonic Ladder
    // f0 = RPM / 30 (4-cyl 4-stroke engine)
    const baseRpm = Math.max(850, telem.rpm || 1000);
    // Pitch dip drops frequency by up to 25% during clutch transition
    const effectiveRpm = baseRpm * (1.0 - this.shiftDipAmount * 0.25);
    const f0 = effectiveRpm / 30.0; // ~33 Hz at 1000 RPM, ~240 Hz at 7200 RPM

    for (const h of this.engineOscs) {
      const targetFreq = Math.min(2200, f0 * h.mult);
      h.osc.frequency.setTargetAtTime(targetFreq, now, 0.025);
    }

    // 3. Engine Throttle-Dependent Brightness (Cutoff & Gain)
    const throttle = Math.max(0, Math.min(1, telem.throttleInput));
    // Idle cutoff: ~480 Hz. WOT cutoff: ~2800 Hz.
    const targetCutoff = 480 + Math.pow(throttle, 1.4) * 2400 + (effectiveRpm / 7500) * 450;
    this.engineFilter?.frequency.setTargetAtTime(targetCutoff, now, 0.04);

    // Engine volume scales with throttle and revs
    const targetEngineVol = 0.25 + throttle * 0.45 + (effectiveRpm / 7500) * 0.25;
    this.engineGain?.gain.setTargetAtTime(targetEngineVol, now, 0.03);

    // 3b. Turbo Whine & Wastegate Flutter
    if (this.turboOsc && this.turboGain) {
      const boostRpm = Math.max(0, (effectiveRpm - 2200) / 5800);
      const turboFreq = 1200 + boostRpm * 2200;
      const turboVol = throttle * boostRpm * 0.18;
      this.turboOsc.frequency.setTargetAtTime(turboFreq, now, 0.04);
      this.turboGain.gain.setTargetAtTime(turboVol, now, 0.04);
    }
    if (this.prevThrottleInput > 0.65 && throttle < 0.20 && effectiveRpm > 4200) {
      this.triggerWastegateFlutter(1.0);
    }
    this.prevThrottleInput = throttle;

    // 4. Tyre Skid Sound (Lateral Slip Angle & Slide Speed)
    const slipDeg = Math.abs(telem.driftAngleDeg || 0);
    const speed = Math.max(0, telem.speedMph);
    let skidVol = 0;
    if (slipDeg > 3.0 && speed > 8.0) {
      const slipFactor = Math.min(1.0, (slipDeg - 3.0) / 16.0);
      const speedFactor = Math.min(1.0, speed / 45.0);
      skidVol = slipFactor * speedFactor * 0.65;
      const skidFreq = 650 + Math.min(600, speed * 6);
      this.skidFilter?.frequency.setTargetAtTime(skidFreq, now, 0.04);
    }
    this.skidGain?.gain.setTargetAtTime(skidVol, now, 0.03);

    // 5. Aerodynamic Wind Noise (Speed Scaled)
    const windVol = Math.min(0.45, Math.pow(speed / 130.0, 1.8) * 0.40);
    this.windGain?.gain.setTargetAtTime(windVol, now, 0.08);
    const windCutoff = 250 + Math.min(650, speed * 5);
    this.windFilter?.frequency.setTargetAtTime(windCutoff, now, 0.08);

    // 6. Gravel Spray Noise (Speed & Surface Dependent)
    const isDirt = (telem.surfaceName || 'dirt').toLowerCase().includes('dirt');
    const gravelVol = isDirt && speed > 10.0
      ? Math.min(0.35, (speed / 100.0) * 0.30 * (0.8 + Math.random() * 0.4))
      : 0.05;
    this.gravelGain?.gain.setTargetAtTime(gravelVol, now, 0.05);

    // 7. Brake Friction & Handbrake Squeal
    const brakeInput = telem.brakeInput;
    let brakeVol = 0;
    if (brakeInput > 0.05 && speed > 2.0) {
      brakeVol = Math.min(0.35, brakeInput * 0.32 * Math.min(1.0, speed / 25.0));
    }
    if (telem.handbrakeActive && speed > 4.0) {
      brakeVol = Math.max(brakeVol, 0.45); // Heavy lock bite
    }
    this.brakeGain?.gain.setTargetAtTime(brakeVol, now, 0.03);

    // Handbrake trigger detection
    if (telem.handbrakeActive && !this.prevHandbrake) {
      this.triggerHandbrakeRatchet();
    }
    this.prevHandbrake = telem.handbrakeActive;

    // Track gear
    this.prevGear = telem.gear;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime, 0.02);
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.isInitialized = false;
  }
}
