import { VehicleTelemetry } from '../vehicles/RapierBaselineVehicle';
import { PALETTE } from '../core/Constants';

export class TelemetryHUD {
  private container: HTMLElement;
  private timerEl!: HTMLElement;
  private speedoCanvas!: HTMLCanvasElement;
  private speedoCtx!: CanvasRenderingContext2D;
  private digitalSpeedEl!: HTMLElement;
  private gearEl!: HTMLElement;
  private drivetrainBadge!: HTMLElement;
  private handbrakeBadge!: HTMLElement;
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
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        background: ${PALETTE.HUD_BG};
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        border-radius: 12px;
        padding: 8px 24px;
        text-align: center;
        backdrop-filter: blur(8px);
      }
      .hud-timer {
        font-size: 26px;
        font-weight: 800;
        letter-spacing: 1px;
        color: #ffffff;
        font-variant-numeric: tabular-nums;
      }
      .hud-sub-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1.5px;
        color: #94a3b8;
        margin-top: 2px;
        text-transform: uppercase;
      }
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
        width: 170px;
        height: 170px;
      }
      .speedo-canvas {
        width: 170px;
        height: 170px;
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
        font-size: 42px;
        font-weight: 900;
        color: #ffffff;
        line-height: 1;
        text-shadow: 0 2px 8px rgba(0,0,0,0.6);
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
      .handbrake-badge {
        margin-top: 8px;
        padding: 3px 12px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 1.2px;
        background: #1e293b;
        color: #64748b;
        border: 1px solid rgba(255, 255, 255, 0.1);
        transition: all 0.1s ease;
      }
      .handbrake-badge.active {
        background: #dc2626;
        color: #ffffff;
        border-color: #ef4444;
        box-shadow: 0 0 14px rgba(220, 38, 38, 0.8);
      }
      .drivetrain-badge {
        position: absolute;
        bottom: -22px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 1px;
        padding: 2px 8px;
        border-radius: 4px;
        background: rgba(15, 23, 42, 0.9);
        color: #f59e0b;
        border: 1px solid rgba(245, 158, 11, 0.3);
      }
      .hud-bottom-left {
        position: absolute;
        bottom: 24px;
        left: 28px;
        background: ${PALETTE.HUD_BG};
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        border-radius: 12px;
        padding: 14px 18px;
        backdrop-filter: blur(8px);
        min-width: 190px;
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
        width: 60px;
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
        background: #a855f7;
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
    // 1. Top Banner (Timer & Mode)
    const topBanner = document.createElement('div');
    topBanner.className = 'hud-top-banner';
    topBanner.innerHTML = `
      <div class="hud-timer" id="hud-timer">0:00.000</div>
      <div class="hud-sub-label">PHASE 2 - CUSTOM TYRE MODEL & DRIFT SANDBOX</div>
    `;
    this.container.appendChild(topBanner);
    this.timerEl = topBanner.querySelector('#hud-timer') as HTMLElement;

    // 2. Controls Help Guide
    const help = document.createElement('div');
    help.className = 'hud-controls-help';
    help.innerHTML = `
      <div><kbd>W</kbd> / <kbd>↑</kbd> Throttle &nbsp; <kbd>S</kbd> / <kbd>↓</kbd> Brake</div>
      <div><kbd>A</kbd> / <kbd>D</kbd> Steer &nbsp; <kbd>Space</kbd> Handbrake</div>
      <div><kbd>T</kbd> Toggle RWD/AWD &nbsp; <kbd>R</kbd> Reset Car</div>
      <div style="margin-top:6px; display:flex; gap:6px;">
        <button id="btn-skidpad" style="pointer-events: auto; background: #ea580c; color: white; border: none; border-radius: 6px; padding: 4px 8px; font-weight: 700; font-size: 11px; cursor: pointer;">🏎 Skid Pad (1)</button>
        <button id="btn-handbrake" style="pointer-events: auto; background: #2563eb; color: white; border: none; border-radius: 6px; padding: 4px 8px; font-weight: 700; font-size: 11px; cursor: pointer;">🅿 Handbrake (2)</button>
      </div>
      <div style="color: #38bdf8; margin-top:4px;">🎮 Gamepad Supported</div>
    `;
    this.container.appendChild(help);

    help.querySelector('#btn-skidpad')?.addEventListener('click', () => {
      if ((window as any).runSkidpadTest) (window as any).runSkidpadTest();
    });
    help.querySelector('#btn-handbrake')?.addEventListener('click', () => {
      if ((window as any).runHandbrakeTest) (window as any).runHandbrakeTest();
    });

    // 3. Bottom Left Input Telemetry
    const bottomLeft = document.createElement('div');
    bottomLeft.className = 'hud-bottom-left';
    bottomLeft.innerHTML = `
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
        LATERAL: 0.00 G
      </div>
    `;
    this.container.appendChild(bottomLeft);

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

    // 4. Bottom Right Speedometer (Matches Screenshot 1/2 styling)
    const bottomRight = document.createElement('div');
    bottomRight.className = 'hud-bottom-right';
    bottomRight.innerHTML = `
      <div class="speedo-wrap">
        <canvas class="speedo-canvas" id="speedo-canvas" width="340" height="340"></canvas>
        <div class="speedo-center">
          <div class="gear-number" id="gear-display">1</div>
          <div class="digital-speed" id="speed-display">0</div>
          <div class="speed-unit">MPH</div>
        </div>
      </div>
      <div class="handbrake-badge" id="handbrake-badge">HANDBRAKE</div>
      <div class="drivetrain-badge" id="drivetrain-badge">DRIVETRAIN: RWD</div>
    `;
    this.container.appendChild(bottomRight);

    this.speedoCanvas = bottomRight.querySelector('#speedo-canvas') as HTMLCanvasElement;
    this.speedoCtx = this.speedoCanvas.getContext('2d')!;
    this.gearEl = bottomRight.querySelector('#gear-display') as HTMLElement;
    this.digitalSpeedEl = bottomRight.querySelector('#speed-display') as HTMLElement;
    this.handbrakeBadge = bottomRight.querySelector('#handbrake-badge') as HTMLElement;
    this.drivetrainBadge = bottomRight.querySelector('#drivetrain-badge') as HTMLElement;
  }

  public update(telemetry: VehicleTelemetry): void {
    // 1. Timer update
    const elapsedMs = performance.now() - this.startTime;
    const mins = Math.floor(elapsedMs / 60000);
    const secs = Math.floor((elapsedMs % 60000) / 1000);
    const ms = Math.floor(elapsedMs % 1000);
    this.timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;

    // 2. Speed & Gear
    const roundedSpeed = Math.round(telemetry.speedMph);
    this.digitalSpeedEl.textContent = roundedSpeed.toString();
    this.gearEl.textContent = telemetry.gear.toString();

    // 3. Handbrake & Drivetrain Badges
    if (telemetry.handbrakeActive) {
      this.handbrakeBadge.classList.add('active');
    } else {
      this.handbrakeBadge.classList.remove('active');
    }

    this.drivetrainBadge.textContent = telemetry.isRwd ? 'DRIVETRAIN: RWD' : 'DRIVETRAIN: AWD';
    this.drivetrainBadge.style.color = telemetry.isRwd ? '#f59e0b' : '#38bdf8';

    // 4. Input Telemetry Bars
    this.throttleBarFill.style.width = `${Math.round(telemetry.throttleInput * 100)}%`;
    this.brakeBarFill.style.width = `${Math.round(telemetry.brakeInput * 100)}%`;

    // Steer fill is centered (-1 to +1)
    const steerHalf = telemetry.steerInput * 50; // -50% to +50%
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

    // 6. Draw Analog Speedometer Dial
    this.drawSpeedometer(telemetry.speedMph, telemetry.rpm);
  }

  private drawSpeedometer(speedMph: number, rpm: number): void {
    const ctx = this.speedoCtx;
    const w = this.speedoCanvas.width;
    const h = this.speedoCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = w * 0.42;

    ctx.clearRect(0, 0, w, h);

    // Outer background ring
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;

    ctx.lineWidth = 14;
    ctx.lineCap = 'round';

    // Dark track background
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    // Speed arc fill (Orange / Gold matching Screenshot 1 & 2)
    const maxSpeed = 150;
    const speedRatio = Math.min(1.0, Math.max(0, speedMph / maxSpeed));
    const currentAngle = startAngle + (endAngle - startAngle) * speedRatio;

    if (speedRatio > 0.01) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, currentAngle);
      ctx.strokeStyle = '#ea580c'; // Saturated rally orange
      ctx.stroke();

      // Glow line
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fdba74';
      ctx.stroke();
    }

    // RPM tick marks (around perimeter)
    const tickRadius = radius * 0.82;
    const numTicks = 20;
    for (let i = 0; i <= numTicks; i++) {
      const angle = startAngle + (endAngle - startAngle) * (i / numTicks);
      const isRedline = i >= numTicks * 0.75;
      const tickLength = (i % 4 === 0) ? 12 : 6;

      const x1 = cx + Math.cos(angle) * (tickRadius - tickLength);
      const y1 = cy + Math.sin(angle) * (tickRadius - tickLength);
      const x2 = cx + Math.cos(angle) * tickRadius;
      const y2 = cy + Math.sin(angle) * tickRadius;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = (i % 4 === 0) ? 3 : 1.5;
      ctx.strokeStyle = isRedline ? '#ef4444' : 'rgba(255, 255, 255, 0.3)';
      ctx.stroke();
    }
  }
}
