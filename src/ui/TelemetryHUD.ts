import * as THREE from 'three';
import { VehicleTelemetry } from '../vehicles/RapierBaselineVehicle';
import { PALETTE } from '../core/Constants';
import { StageManager, PaceNote } from '../gameplay/StageManager';

export class TelemetryHUD {
  private container: HTMLElement;
  private timerEl!: HTMLElement;
  private gateEl!: HTMLElement;
  private bestTimeEl!: HTMLElement;
  private splitPillEl!: HTMLElement;
  private paceNoteBoxEl!: HTMLElement;
  private paceNoteIconEl!: HTMLElement;
  private paceNoteTextEl!: HTMLElement;
  private countdownEl!: HTMLElement;
  private finishBannerEl!: HTMLElement;

  private speedoCanvas!: HTMLCanvasElement;
  private speedoCtx!: CanvasRenderingContext2D;
  private digitalSpeedEl!: HTMLElement;
  private gearEl!: HTMLElement;
  private manualBadge!: HTMLElement;
  private drivetrainBadge!: HTMLElement;
  private handbrakeBadge!: HTMLElement;
  private clutchBadge!: HTMLElement;
  private distanceEl!: HTMLElement;

  private steerBarFill!: HTMLElement;
  private throttleBarFill!: HTMLElement;
  private brakeBarFill!: HTMLElement;
  private wheelIndicators: HTMLElement[] = [];
  private gMeterEl!: HTMLElement;

  private startTime = performance.now();

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'telemetry-hud';
    this.setupStyles();
    this.createDom();
    document.body.appendChild(this.container);
  }

  private setupStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #telemetry-hud {
        position: fixed;
        inset: 0;
        pointer-events: none;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        user-select: none;
        z-index: 100;
      }
      .hud-top-banner {
        position: absolute;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: ${PALETTE.HUD_BG};
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 12px 30px rgba(0,0,0,0.6);
        border-radius: 14px;
        padding: 8px 28px;
        text-align: center;
        backdrop-filter: blur(10px);
        min-width: 280px;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .hud-stage-title {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 2px;
        color: #f59e0b;
        text-transform: uppercase;
      }
      .hud-timer-row {
        display: flex;
        align-items: baseline;
        gap: 12px;
        margin: 2px 0;
      }
      .hud-timer {
        font-size: 32px;
        font-weight: 900;
        letter-spacing: 1.5px;
        color: #ffffff;
        font-variant-numeric: tabular-nums;
        text-shadow: 0 2px 10px rgba(0,0,0,0.5);
      }
      .hud-gate-badge {
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 1px;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.15);
        border: 1px solid rgba(56, 189, 248, 0.3);
        padding: 2px 10px;
        border-radius: 6px;
      }
      .hud-best-time {
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
        letter-spacing: 1px;
      }

      /* Orange Split-Time Pill (~1s) */
      .hud-split-pill {
        position: absolute;
        top: 86px;
        left: 50%;
        transform: translateX(-50%);
        background: #ff6d00;
        color: #ffffff;
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 1px;
        padding: 4px 18px;
        border-radius: 20px;
        box-shadow: 0 0 20px rgba(255, 109, 0, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.4);
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s ease;
        pointer-events: none;
      }
      .hud-split-pill.show {
        opacity: 1;
        transform: translateX(-50%) scale(1.05);
      }

      /* Pace Note Box (Curve Icon from Spline Curvature 60-100m ahead) */
      .hud-pace-box {
        position: absolute;
        top: 130px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.9);
        border: 2px solid #eab308;
        border-radius: 12px;
        padding: 8px 18px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        backdrop-filter: blur(8px);
        min-width: 170px;
        justify-content: center;
      }
      .pace-icon-svg {
        width: 38px;
        height: 38px;
        fill: none;
        stroke: #eab308;
        stroke-width: 4;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .pace-text {
        font-size: 20px;
        font-weight: 900;
        color: #ffffff;
        letter-spacing: 1.5px;
        text-shadow: 0 2px 6px rgba(0,0,0,0.6);
      }

      /* Big Start Countdown Overlay */
      .hud-countdown {
        position: absolute;
        top: 38%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 96px;
        font-weight: 900;
        color: #facc15;
        text-shadow: 0 0 40px rgba(250, 204, 21, 0.8), 0 4px 15px rgba(0,0,0,0.8);
        display: none;
      }

      /* Stage Finished Modal Banner */
      .hud-finish-banner {
        position: absolute;
        top: 35%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(15, 23, 42, 0.95);
        border: 2px solid #22c55e;
        border-radius: 18px;
        padding: 24px 44px;
        text-align: center;
        box-shadow: 0 0 50px rgba(34, 197, 94, 0.4);
        backdrop-filter: blur(12px);
        display: none;
      }
      .hud-finish-title {
        font-size: 36px;
        font-weight: 900;
        color: #4ade80;
        letter-spacing: 2px;
        margin-bottom: 8px;
      }
      .hud-finish-time {
        font-size: 44px;
        font-weight: 900;
        color: #ffffff;
        margin-bottom: 12px;
        font-variant-numeric: tabular-nums;
      }
      .hud-restart-prompt {
        font-size: 13px;
        font-weight: 700;
        color: #94a3b8;
        letter-spacing: 1px;
      }

      /* Bottom Right Speedo / Rev Arc */
      .hud-bottom-right {
        position: absolute;
        bottom: 24px;
        right: 28px;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .speedo-wrap {
        position: relative;
        width: 175px;
        height: 175px;
      }
      .speedo-canvas {
        width: 175px;
        height: 175px;
      }
      .speedo-center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .gear-number {
        font-size: 46px;
        font-weight: 900;
        color: #ffffff;
        line-height: 1;
        text-shadow: 0 2px 8px rgba(0,0,0,0.6);
      }
      .manual-badge {
        font-size: 11px;
        font-weight: 900;
        color: #eab308;
        letter-spacing: 1.5px;
        margin-top: 2px;
      }
      .digital-speed {
        font-size: 32px;
        font-weight: 900;
        color: #ffffff;
        line-height: 1;
        margin-top: 4px;
      }
      .speed-unit {
        font-size: 11px;
        font-weight: 800;
        color: #94a3b8;
        letter-spacing: 1px;
      }
      .hud-badges-row {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }
      .hud-badge {
        padding: 3px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 1.2px;
        background: #1e293b;
        color: #64748b;
        border: 1px solid rgba(255, 255, 255, 0.1);
        transition: all 0.1s ease;
      }
      .hud-badge.hb-active {
        background: #dc2626;
        color: #ffffff;
        border-color: #ef4444;
        box-shadow: 0 0 14px rgba(220, 38, 38, 0.8);
      }
      .hud-badge.clutch-active {
        background: #f59e0b;
        color: #ffffff;
        border-color: #fbbf24;
        box-shadow: 0 0 14px rgba(245, 158, 11, 0.8);
      }

      /* Bottom Left Input Telemetry & Distance */
      .hud-bottom-left {
        position: absolute;
        bottom: 24px;
        left: 28px;
        background: ${PALETTE.HUD_BG};
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        border-radius: 14px;
        padding: 14px 18px;
        backdrop-filter: blur(8px);
        min-width: 200px;
      }
      .distance-counter {
        font-size: 13px;
        font-weight: 800;
        color: #f8fafc;
        letter-spacing: 1px;
        margin-bottom: 10px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        display: flex;
        justify-content: space-between;
      }
      .distance-counter span {
        color: #38bdf8;
      }
      .input-bar-row {
        display: flex;
        align-items: center;
        margin-bottom: 6px;
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
      }
      .input-bar-label {
        width: 68px;
        letter-spacing: 0.5px;
      }
      .input-bar-track {
        flex: 1;
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        overflow: hidden;
        position: relative;
      }
      .input-bar-fill {
        height: 100%;
        width: 0%;
        background: #38bdf8;
        border-radius: 3px;
        transition: width 0.05s ease;
      }
      .input-bar-fill.steer {
        position: absolute;
        left: 50%;
        background: #38bdf8;
      }
      .input-bar-fill.throttle {
        background: #22c55e;
      }
      .input-bar-fill.brake {
        background: #ef4444;
      }
      .wheel-status-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,0.08);
      }
      .wheel-pill {
        font-size: 9px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 3px;
        text-align: center;
        background: rgba(255,255,255,0.05);
        color: #64748b;
      }
      .wheel-pill.contact {
        background: rgba(34, 197, 94, 0.2);
        color: #4ade80;
        border: 1px solid rgba(34, 197, 94, 0.4);
      }

      /* Controls Help */
      .hud-controls-help {
        position: absolute;
        top: 18px;
        left: 24px;
        background: ${PALETTE.HUD_BG};
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 8px 14px;
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.6;
        backdrop-filter: blur(8px);
      }
      .hud-controls-help kbd {
        background: rgba(255,255,255,0.15);
        color: #ffffff;
        padding: 1px 5px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 11px;
        font-weight: 700;
      }
    `;
    document.head.appendChild(style);
  }

  private createDom(): void {
    // 1. Top Stage Banner (Timer, Gate, Best Time)
    const topBanner = document.createElement('div');
    topBanner.className = 'hud-top-banner';
    topBanner.innerHTML = `
      <div class="hud-stage-title">STAGE 1 &bull; ALPINE PASS</div>
      <div class="hud-timer-row">
        <div class="hud-timer" id="hud-timer">00:00.00</div>
        <div class="hud-gate-badge" id="hud-gate">GATE 1 OF 20</div>
      </div>
      <div class="hud-best-time" id="hud-best-time">BEST: --:--.--</div>
    `;
    this.container.appendChild(topBanner);
    this.timerEl = topBanner.querySelector('#hud-timer') as HTMLElement;
    this.gateEl = topBanner.querySelector('#hud-gate') as HTMLElement;
    this.bestTimeEl = topBanner.querySelector('#hud-best-time') as HTMLElement;

    // 2. Orange Split-Time Pill (~1s)
    this.splitPillEl = document.createElement('div');
    this.splitPillEl.className = 'hud-split-pill';
    this.splitPillEl.id = 'hud-split-pill';
    this.splitPillEl.textContent = '+00:04.12';
    this.container.appendChild(this.splitPillEl);

    // 3. Pace-Note Box (Curve Icon from Spline Curvature)
    this.paceNoteBoxEl = document.createElement('div');
    this.paceNoteBoxEl.className = 'hud-pace-box';
    this.paceNoteBoxEl.innerHTML = `
      <svg class="pace-icon-svg" id="pace-icon" viewBox="0 0 24 24">
        <path d="M12 19V5M5 12l7-7 7 7"/>
      </svg>
      <div class="pace-text" id="pace-text">FLAT OUT</div>
    `;
    this.container.appendChild(this.paceNoteBoxEl);
    this.paceNoteIconEl = this.paceNoteBoxEl.querySelector('#pace-icon') as HTMLElement;
    this.paceNoteTextEl = this.paceNoteBoxEl.querySelector('#pace-text') as HTMLElement;

    // 4. Big Start Countdown Overlay
    this.countdownEl = document.createElement('div');
    this.countdownEl.className = 'hud-countdown';
    this.countdownEl.id = 'hud-countdown';
    this.countdownEl.textContent = '3';
    this.container.appendChild(this.countdownEl);

    // 5. Stage Finished Modal Banner
    this.finishBannerEl = document.createElement('div');
    this.finishBannerEl.className = 'hud-finish-banner';
    this.finishBannerEl.innerHTML = `
      <div class="hud-finish-title">STAGE COMPLETE</div>
      <div class="hud-finish-time" id="finish-time">01:42.50</div>
      <div class="hud-restart-prompt">PRESS [R] OR CLICK RESTART TO PLAY AGAIN</div>
      <button id="btn-restart" style="pointer-events: auto; margin-top: 14px; background: #22c55e; color: #ffffff; border: none; border-radius: 8px; padding: 8px 22px; font-weight: 800; font-size: 13px; cursor: pointer;">RESTART STAGE</button>
    `;
    this.container.appendChild(this.finishBannerEl);
    this.finishBannerEl.querySelector('#btn-restart')?.addEventListener('click', () => {
      if ((window as any).restartStage) (window as any).restartStage();
    });

    // 6. Controls Help Guide
    const help = document.createElement('div');
    help.className = 'hud-controls-help';
    help.innerHTML = `
      <div><kbd>W</kbd> / <kbd>↑</kbd> Throttle &nbsp; <kbd>S</kbd> / <kbd>↓</kbd> Brake</div>
      <div><kbd>A</kbd> / <kbd>D</kbd> Steer &nbsp; <kbd>Space</kbd> Handbrake</div>
      <div><kbd>R</kbd> Restart Stage &nbsp; <kbd>T</kbd> Toggle Drivetrain</div>
      <div style="color: #38bdf8; margin-top:4px;">🎮 Gamepad Supported &bull; 20 Checkpoint Gates</div>
    `;
    this.container.appendChild(help);

    // 7. Bottom Left Input Telemetry & Distance Odometer
    const bottomLeft = document.createElement('div');
    bottomLeft.className = 'hud-bottom-left';
    bottomLeft.innerHTML = `
      <div class="distance-counter">
        DISTANCE: <span id="dist-miles">0.00 mi</span>
      </div>
      <div class="input-bar-row">
        <span class="input-bar-label">STEER</span>
        <div class="input-bar-track">
          <div class="input-bar-fill steer" id="steer-fill"></div>
        </div>
      </div>
      <div class="input-bar-row">
        <span class="input-bar-label">THROTTLE</span>
        <div class="input-bar-track">
          <div class="input-bar-fill throttle" id="throttle-fill"></div>
        </div>
      </div>
      <div class="input-bar-row">
        <span class="input-bar-label">BRAKE</span>
        <div class="input-bar-track">
          <div class="input-bar-fill brake" id="brake-fill"></div>
        </div>
      </div>
      <div class="wheel-status-grid">
        <div class="wheel-pill" id="wheel-fl">FL: 0.0m</div>
        <div class="wheel-pill" id="wheel-fr">FR: 0.0m</div>
        <div class="wheel-pill" id="wheel-rl">RL: 0.0m</div>
        <div class="wheel-pill" id="wheel-rr">RR: 0.0m</div>
      </div>
      <div style="font-size: 10px; color: #64748b; margin-top: 6px; text-align: center;" id="g-meter">
        LATERAL: 0.00 G | DIRT (72%)
      </div>
    `;
    this.container.appendChild(bottomLeft);

    this.distanceEl = bottomLeft.querySelector('#dist-miles') as HTMLElement;
    this.steerBarFill = bottomLeft.querySelector('#steer-fill') as HTMLElement;
    this.throttleBarFill = bottomLeft.querySelector('#throttle-fill') as HTMLElement;
    this.brakeBarFill = bottomLeft.querySelector('#brake-fill') as HTMLElement;
    this.gMeterEl = bottomLeft.querySelector('#g-meter') as HTMLElement;

    this.wheelIndicators = [
      bottomLeft.querySelector('#wheel-fl') as HTMLElement,
      bottomLeft.querySelector('#wheel-fr') as HTMLElement,
      bottomLeft.querySelector('#wheel-rl') as HTMLElement,
      bottomLeft.querySelector('#wheel-rr') as HTMLElement,
    ];

    // 8. Bottom Right Speedometer (Rev Arc + Gear + M + HB + Clutch)
    const bottomRight = document.createElement('div');
    bottomRight.className = 'hud-bottom-right';
    bottomRight.innerHTML = `
      <div class="speedo-wrap">
        <canvas class="speedo-canvas" id="speedo-canvas" width="350" height="350"></canvas>
        <div class="speedo-center">
          <div class="gear-number" id="gear-display">1</div>
          <div class="manual-badge" id="manual-badge">M</div>
          <div class="digital-speed" id="speed-display">0</div>
          <div class="speed-unit">MPH</div>
        </div>
      </div>
      <div class="hud-badges-row">
        <div class="hud-badge" id="handbrake-badge">HB</div>
        <div class="hud-badge" id="clutch-badge">CLUTCH</div>
        <div class="hud-badge" id="drivetrain-badge">RWD</div>
      </div>
    `;
    this.container.appendChild(bottomRight);

    this.speedoCanvas = bottomRight.querySelector('#speedo-canvas') as HTMLCanvasElement;
    this.speedoCtx = this.speedoCanvas.getContext('2d')!;
    this.gearEl = bottomRight.querySelector('#gear-display') as HTMLElement;
    this.manualBadge = bottomRight.querySelector('#manual-badge') as HTMLElement;
    this.digitalSpeedEl = bottomRight.querySelector('#speed-display') as HTMLElement;
    this.handbrakeBadge = bottomRight.querySelector('#handbrake-badge') as HTMLElement;
    this.clutchBadge = bottomRight.querySelector('#clutch-badge') as HTMLElement;
    this.drivetrainBadge = bottomRight.querySelector('#drivetrain-badge') as HTMLElement;
  }

  public update(telemetry: VehicleTelemetry, stageManager?: StageManager): void {
    // 1. Stage Gameplay & Timer
    if (stageManager) {
      if (stageManager.state === 'COUNTDOWN') {
        this.countdownEl.style.display = 'block';
        const num = Math.ceil(stageManager.countdownTimerS);
        this.countdownEl.textContent = num <= 0 ? 'GO!' : num.toString();
        this.finishBannerEl.style.display = 'none';
        this.timerEl.textContent = '00:00.00';
      } else if (stageManager.state === 'RACING') {
        this.countdownEl.style.display = 'none';
        this.finishBannerEl.style.display = 'none';
        this.timerEl.textContent = stageManager.formatTime(stageManager.stageTimeS);
      } else if (stageManager.state === 'FINISHED') {
        this.countdownEl.style.display = 'none';
        this.finishBannerEl.style.display = 'block';
        const fTime = this.finishBannerEl.querySelector('#finish-time');
        if (fTime) fTime.textContent = stageManager.formatTime(stageManager.stageTimeS);
      }

      this.gateEl.textContent = `GATE ${Math.min(stageManager.totalGates, stageManager.currentGateIndex + 1)} OF ${stageManager.totalGates}`;

      if (stageManager.bestTimeS) {
        this.bestTimeEl.textContent = `BEST: ${stageManager.formatTime(stageManager.bestTimeS)}`;
      }

      // Split Pill
      if (stageManager.lastSplitPill) {
        this.splitPillEl.textContent = stageManager.lastSplitPill.text;
        this.splitPillEl.classList.add('show');
      } else {
        this.splitPillEl.classList.remove('show');
      }

      // Pace Note
      const pace = stageManager.getPaceNoteAhead();
      this.updatePaceNote(pace);

      // Distance counter in miles (1m = 0.000621371 miles)
      const miles = stageManager.totalDistanceDrivenM * 0.000621371;
      this.distanceEl.textContent = `${miles.toFixed(2)} mi`;
    } else {
      // Fallback sandbox timer
      const elapsedMs = performance.now() - this.startTime;
      const mins = Math.floor(elapsedMs / 60000);
      const secs = Math.floor((elapsedMs % 60000) / 1000);
      const ms = Math.floor((elapsedMs % 1000) / 10);
      this.timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    // 2. Speed & Gear & M
    const roundedSpeed = Math.round(telemetry.speedMph);
    this.digitalSpeedEl.textContent = roundedSpeed.toString();
    this.gearEl.textContent = telemetry.gear.toString();

    // 3. Badges (HB, Clutch, Drivetrain)
    if (telemetry.handbrakeActive) {
      this.handbrakeBadge.classList.add('hb-active');
    } else {
      this.handbrakeBadge.classList.remove('hb-active');
    }

    if (telemetry.isShifting) {
      this.clutchBadge.classList.add('clutch-active');
    } else {
      this.clutchBadge.classList.remove('clutch-active');
    }

    this.drivetrainBadge.textContent = telemetry.isRwd ? 'RWD' : 'AWD';
    this.drivetrainBadge.style.color = telemetry.isRwd ? '#f59e0b' : '#38bdf8';

    // 4. Input Telemetry Bars
    this.throttleBarFill.style.width = `${Math.round(telemetry.throttleInput * 100)}%`;
    this.brakeBarFill.style.width = `${Math.round(telemetry.brakeInput * 100)}%`;

    const steerHalf = telemetry.steerInput * 50;
    if (steerHalf >= 0) {
      this.steerBarFill.style.left = '50%';
      this.steerBarFill.style.width = `${steerHalf}%`;
    } else {
      this.steerBarFill.style.left = `${50 + steerHalf}%`;
      this.steerBarFill.style.width = `${-steerHalf}%`;
    }

    // 5. Wheel indicators
    const wheelLabels = ['FL', 'FR', 'RL', 'RR'];
    for (let i = 0; i < 4; i++) {
      const inContact = telemetry.wheelContacts[i];
      const len = telemetry.suspensionLengths[i] ?? 0;
      const el = this.wheelIndicators[i];
      if (el) {
        el.textContent = `${wheelLabels[i]}: ${len.toFixed(2)}m`;
        if (inContact) {
          el.classList.add('contact');
        } else {
          el.classList.remove('contact');
        }
      }
    }

    const surfaceLabel = telemetry.surfaceName ? `${telemetry.surfaceName.toUpperCase()} (${Math.round((telemetry.gripMultiplier ?? 0.72) * 100)}%)` : 'DIRT (72%)';
    this.gMeterEl.textContent = `LATERAL: ${telemetry.lateralG.toFixed(2)} G | ${surfaceLabel}`;

    // 6. Draw Analog Rev Arc Speedometer
    this.drawSpeedometer(telemetry.speedMph, telemetry.rpm);
  }

  private updatePaceNote(pace: PaceNote): void {
    this.paceNoteTextEl.textContent = pace.code;

    // SVG icon path based on turn curvature & direction
    let iconPath = '';
    if (pace.direction === 'left') {
      if (pace.severity <= 2) {
        iconPath = 'M18 19V11a5 5 0 0 0-5-5H6M6 6l4-4M6 6l4 4'; // Sharp hairpin left
      } else {
        iconPath = 'M16 19C16 12 14 7 7 6M7 6l4-4M7 6l3 5';   // Sweeping left
      }
    } else if (pace.direction === 'right') {
      if (pace.severity <= 2) {
        iconPath = 'M6 19V11a5 5 0 0 1 5-5h7M18 6l-4-4M18 6l-4 4'; // Sharp hairpin right
      } else {
        iconPath = 'M8 19C8 12 10 7 17 6M17 6l-4-4M17 6l-3 5';    // Sweeping right
      }
    } else {
      if (pace.isCrest) {
        iconPath = 'M3 16l9-9 9 9'; // Crest hill
      } else {
        iconPath = 'M12 19V5M5 12l7-7 7 7'; // Straight ahead
      }
    }

    this.paceNoteIconEl.innerHTML = `<path d="${iconPath}" />`;

    // Highlight border color based on curve severity
    if (pace.severity <= 2) {
      this.paceNoteBoxEl.style.borderColor = '#ef4444'; // Red for sharp/hairpin
      this.paceNoteIconEl.style.stroke = '#ef4444';
    } else if (pace.severity <= 4) {
      this.paceNoteBoxEl.style.borderColor = '#f59e0b'; // Amber for medium
      this.paceNoteIconEl.style.stroke = '#f59e0b';
    } else {
      this.paceNoteBoxEl.style.borderColor = '#eab308'; // Yellow for fast/flat
      this.paceNoteIconEl.style.stroke = '#eab308';
    }
  }

  private drawSpeedometer(speedMph: number, rpm: number): void {
    const ctx = this.speedoCtx;
    const w = this.speedoCanvas.width;
    const h = this.speedoCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = w * 0.42;

    ctx.clearRect(0, 0, w, h);

    // Outer background rev arc
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;

    ctx.lineWidth = 14;
    ctx.lineCap = 'round';

    // Dark track
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.stroke();

    // Active RPM sweep
    const maxRpm = 8000;
    const rpmFrac = THREE.MathUtils.clamp((rpm - 1000) / (maxRpm - 1000), 0, 1);
    const curAngle = startAngle + (endAngle - startAngle) * rpmFrac;

    if (rpmFrac > 0.01) {
      const grad = ctx.createLinearGradient(0, h, w, 0);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(0.65, '#eab308');
      grad.addColorStop(1, '#ef4444');

      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, curAngle);
      ctx.stroke();
    }

    // Redline indicator tick
    const redlineAngle = startAngle + (endAngle - startAngle) * (7200 / maxRpm);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 8, redlineAngle - 0.05, redlineAngle + 0.05);
    ctx.stroke();
  }
}
