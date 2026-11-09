/**
 * Procedural Web Audio Engine for Apex Rally.
 * Generates all vehicle acoustics (engine RPM roar, turbocharger whine, blow-off valve flutter,
 * backfire bangs, gravel splatter chatter, water splash slaps, and co-driver radio beeps)
 * entirely via the Web Audio API synthesis without requiring external audio files.
 */
export class RallyAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted = false;

  // Engine Synthesizer
  private engineGain: GainNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private oscMid: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  // Turbocharger Synthesizer
  private turboGain: GainNode | null = null;
  private turboOsc: OscillatorNode | null = null;
  private turboFilter: BiquadFilterNode | null = null;

  // Surface Road Noise (Gravel chatter)
  private gravelGain: GainNode | null = null;
  private gravelSource: AudioBufferSourceNode | null = null;

  // Master Gain
  private masterGain: GainNode | null = null;

  constructor() {
    // AudioContext will be initialized on first user gesture
  }

  public init(): void {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.setupEngineSound();
    this.setupTurboSound();
    this.setupGravelChatter();
  }

  private setupEngineSound(): void {
    if (!this.ctx || !this.masterGain) return;

    // Sub rumble oscillator
    this.oscSub = this.ctx.createOscillator();
    this.oscSub.type = 'sawtooth';

    // Mid harmonic oscillator (5-cylinder Group B characteristic roar)
    this.oscMid = this.ctx.createOscillator();
    this.oscMid.type = 'triangle';

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(800, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.25, this.ctx.currentTime);

    this.oscSub.connect(this.engineFilter);
    this.oscMid.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.oscSub.start();
    this.oscMid.start();
  }

  private setupTurboSound(): void {
    if (!this.ctx || !this.masterGain) return;

    // Turbo whistle sine oscillator
    this.turboOsc = this.ctx.createOscillator();
    this.turboOsc.type = 'sine';
    this.turboOsc.frequency.setValueAtTime(1400, this.ctx.currentTime);

    this.turboFilter = this.ctx.createBiquadFilter();
    this.turboFilter.type = 'bandpass';
    this.turboFilter.frequency.setValueAtTime(2400, this.ctx.currentTime);
    this.turboFilter.Q.setValueAtTime(8, this.ctx.currentTime);

    this.turboGain = this.ctx.createGain();
    this.turboGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.turboOsc.connect(this.turboFilter);
    this.turboFilter.connect(this.turboGain);
    this.turboGain.connect(this.masterGain);

    this.turboOsc.start();
  }

  private setupGravelChatter(): void {
    if (!this.ctx || !this.masterGain) return;

    // Generate 2 seconds of pink/crackle noise buffer
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2) * 0.18;
    }

    this.gravelSource = this.ctx.createBufferSource();
    this.gravelSource.buffer = noiseBuffer;
    this.gravelSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, this.ctx.currentTime);
    filter.Q.setValueAtTime(2.5, this.ctx.currentTime);

    this.gravelGain = this.ctx.createGain();
    this.gravelGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.gravelSource.connect(filter);
    filter.connect(this.gravelGain);
    this.gravelGain.connect(this.masterGain);

    this.gravelSource.start();
  }

  /**
   * Updates continuous engine RPM roar, turbo boost, and surface chatter
   */
  public update(rpm: number, throttle: number, speedKmh: number, isGravel: boolean): void {
    if (!this.ctx || this.isMuted) return;

    // Ensure audio context is running (unblocks auto-play policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const t = this.ctx.currentTime;

    // 1. Engine Pitch (5-cylinder Group B firing frequency)
    const fundamentalFreq = (rpm / 60) * 2.5; // ~50 Hz at 1200 RPM up to ~350 Hz at 8400 RPM
    if (this.oscSub && this.oscMid) {
      this.oscSub.frequency.setTargetAtTime(fundamentalFreq, t, 0.04);
      this.oscMid.frequency.setTargetAtTime(fundamentalFreq * 2.0, t, 0.04);
    }
    if (this.engineFilter) {
      const cutoff = 400 + (rpm / 8400) * 1600 + throttle * 800;
      this.engineFilter.frequency.setTargetAtTime(cutoff, t, 0.05);
    }

    // 2. Turbo Whistle (rises with throttle and RPM)
    if (this.turboOsc && this.turboGain) {
      const turboFreq = 1200 + (rpm / 8400) * 2600;
      this.turboOsc.frequency.setTargetAtTime(turboFreq, t, 0.08);
      const turboVolume = throttle > 0.2 ? Math.min(0.22, throttle * 0.22) : 0.0;
      this.turboGain.gain.setTargetAtTime(turboVolume, t, 0.1);
    }

    // 3. Gravel Chatter
    if (this.gravelGain) {
      const gravelVol = isGravel ? Math.min(0.35, (speedKmh / 120) * 0.35) : 0.0;
      this.gravelGain.gain.setTargetAtTime(gravelVol, t, 0.08);
    }
  }

  /**
   * Trigger Water Puddle Splash Slap sound
   */
  public playWaterSplash(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.35);

    gain.gain.setValueAtTime(0.65, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.38);
  }

  /**
   * Trigger Exhaust Backfire Pop
   */
  public playBackfirePop(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.18);

    gain.gain.setValueAtTime(0.85, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  /**
   * Trigger Co-driver Radio Chirp / Beep
   */
  public playRadioChirp(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1250, t);
    osc.frequency.setValueAtTime(1600, t + 0.05);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.7, this.ctx.currentTime);
    }
    return this.isMuted;
  }
}

