import * as THREE from 'three';
import { VehicleTelemetry } from '../vehicles/RapierBaselineVehicle';

export class VehicleDebugOverlay {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public visible: boolean = false;

  // 3D Arrow Helpers for 4 wheels: [FL, FR, RL, RR]
  // Each wheel has: longitudinal (blue/green), lateral (red/orange), normal (yellow)
  private forceArrowsGroup: THREE.Group;
  private longArrows: THREE.ArrowHelper[] = [];
  private latArrows: THREE.ArrowHelper[] = [];
  private normArrows: THREE.ArrowHelper[] = [];

  constructor(private scene: THREE.Scene) {
    this.container = document.createElement('div');
    this.container.id = 'vehicle-debug-overlay';
    this.container.style.cssText = `
      position: fixed;
      top: 75px;
      left: 24px;
      width: 320px;
      background: rgba(10, 15, 29, 0.90);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 12px;
      box-shadow: 0 12px 35px rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(10px);
      padding: 12px 14px;
      color: #f8fafc;
      font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
      font-size: 11px;
      z-index: 150;
      user-select: none;
      pointer-events: auto;
      display: none;
    `;

    this.container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 6px; margin-bottom: 8px;">
        <span style="font-weight: 800; color: #38bdf8; letter-spacing: 1px;">⚙ V1 VEHICLE TELEMETRY</span>
        <span style="font-size: 9px; color: #94a3b8; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px;">KEY [O] TOGGLE</span>
      </div>
      <div id="debug-powertrain-row" style="margin-bottom: 8px; font-size: 10px; color: #cbd5e1; display: grid; grid-template-columns: 1fr 1fr; gap: 4px;"></div>
      <canvas id="debug-canvas" width="292" height="230" style="display: block; width: 292px; height: 230px; border-radius: 6px; background: rgba(0,0,0,0.35);"></canvas>
      <div style="display: flex; justify-content: space-between; font-size: 9px; color: #64748b; margin-top: 6px;">
        <span><span style="color:#38bdf8;">■</span> Fx Long</span>
        <span><span style="color:#ef4444;">■</span> Fy Lat</span>
        <span><span style="color:#eab308;">■</span> Fz Norm</span>
        <span><span style="color:#a855f7;">■</span> Slip Ratio</span>
      </div>
    `;

    document.body.appendChild(this.container);

    this.canvas = this.container.querySelector('#debug-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    // 3D Force Arrows in scene
    this.forceArrowsGroup = new THREE.Group();
    this.forceArrowsGroup.name = 'ForceArrows';
    this.scene.add(this.forceArrowsGroup);

    this.initForceArrows();

    // Hotkey [O] to toggle debug overlays
    window.addEventListener('keydown', (e) => {
      if (e.key === 'o' || e.key === 'O') {
        this.toggle();
      }
    });
  }

  private initForceArrows(): void {
    const origin = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const forward = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3(1, 0, 0);

    for (let i = 0; i < 4; i++) {
      // Longitudinal force (Blue)
      const longArrow = new THREE.ArrowHelper(forward, origin, 1, 0x38bdf8, 0.25, 0.12);
      longArrow.visible = false;
      this.forceArrowsGroup.add(longArrow);
      this.longArrows.push(longArrow);

      // Lateral force (Red)
      const latArrow = new THREE.ArrowHelper(right, origin, 1, 0xef4444, 0.25, 0.12);
      latArrow.visible = false;
      this.forceArrowsGroup.add(latArrow);
      this.latArrows.push(latArrow);

      // Normal load (Yellow)
      const normArrow = new THREE.ArrowHelper(up, origin, 1, 0xeab308, 0.25, 0.12);
      normArrow.visible = false;
      this.forceArrowsGroup.add(normArrow);
      this.normArrows.push(normArrow);
    }
  }

  public setVisible(show: boolean): void {
    this.visible = show;
    this.container.style.display = show ? 'block' : 'none';
    this.forceArrowsGroup.visible = show;
  }

  public toggle(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  public update(telemetry: VehicleTelemetry): void {
    if (!this.visible) {
      if (this.forceArrowsGroup.visible) this.forceArrowsGroup.visible = false;
      return;
    }
    this.forceArrowsGroup.visible = true;

    // 1. Update Powertrain Text row
    const ptRow = this.container.querySelector('#debug-powertrain-row');
    if (ptRow) {
      const shiftText = telemetry.isShifting
        ? `<span style="color:#ef4444; font-weight:700;">SHIFTING (${Math.round((telemetry.shiftTimer || 0) * 1000)}ms)</span>`
        : `<span style="color:#22c55e;">ENGAGED</span>`;
      const tqPct = Math.round((telemetry.engineTorqueMult || 1.0) * 100);
      ptRow.innerHTML = `
        <div>GEAR: <b style="color:#f59e0b;">${telemetry.gear}</b> (${shiftText})</div>
        <div>TORQUE MULT: <b style="color:#38bdf8;">${tqPct}%</b></div>
        <div>RPM: <b style="color:#ffffff;">${telemetry.rpm.toFixed(0)}</b></div>
        <div>SPEED: <b style="color:#ffffff;">${telemetry.speedMph.toFixed(1)} mph</b></div>
      `;
    }

    // 2. Update 3D Force Vectors
    const contactPoints = telemetry.wheelContactPoints || [];
    const headings = telemetry.wheelHeadings || [];
    const laterals = telemetry.wheelLaterals || [];
    const fxList = telemetry.wheelForcesLongitudinal || [0, 0, 0, 0];
    const fyList = telemetry.wheelForcesLateral || [0, 0, 0, 0];
    const fzList = telemetry.wheelForcesNormal || [0, 0, 0, 0];

    const forceScale = 0.00045; // 1 meter per ~2,200 N

    for (let i = 0; i < 4; i++) {
      const cp = contactPoints[i];
      const inContact = telemetry.wheelContacts[i] && cp !== null && cp !== undefined;

      const longA = this.longArrows[i];
      const latA = this.latArrows[i];
      const normA = this.normArrows[i];

      if (!inContact) {
        longA.visible = false;
        latA.visible = false;
        normA.visible = false;
        continue;
      }

      longA.visible = true;
      latA.visible = true;
      normA.visible = true;

      longA.position.copy(cp);
      latA.position.copy(cp);
      normA.position.copy(cp);

      // Longitudinal Force Arrow
      const fx = fxList[i] || 0;
      const fwd = headings[i] || new THREE.Vector3(0, 0, 1);
      const longDir = fwd.clone().multiplyScalar(Math.sign(fx) || 1).normalize();
      const longLen = Math.max(0.01, Math.min(2.5, Math.abs(fx) * forceScale));
      longA.setDirection(longDir);
      longA.setLength(longLen, Math.min(0.25, longLen * 0.4), Math.min(0.12, longLen * 0.2));

      // Lateral Force Arrow
      const fy = fyList[i] || 0;
      const lat = laterals[i] || new THREE.Vector3(1, 0, 0);
      const latDir = lat.clone().multiplyScalar(Math.sign(fy) || 1).normalize();
      const latLen = Math.max(0.01, Math.min(2.5, Math.abs(fy) * forceScale));
      latA.setDirection(latDir);
      latA.setLength(latLen, Math.min(0.25, latLen * 0.4), Math.min(0.12, latLen * 0.2));

      // Normal Load Arrow
      const fz = fzList[i] || 0;
      const normLen = Math.max(0.01, Math.min(2.5, Math.abs(fz) * forceScale));
      normA.setDirection(new THREE.Vector3(0, 1, 0));
      normA.setLength(normLen, Math.min(0.25, normLen * 0.4), Math.min(0.12, normLen * 0.2));
    }

    // 3. Draw 2D Canvas Debug Elements:
    // - Friction Ellipse Usage Gauge
    // - Slip angle & Slip ratio per wheel
    // - Weight-transfer bars
    // - Wheel speed vs Ground speed
    this.draw2DOverlay(telemetry);
  }

  private draw2DOverlay(telem: VehicleTelemetry): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const labels = ['FL', 'FR', 'RL', 'RR'];
    const sxList = telem.wheelSlipRatios || [0, 0, 0, 0];
    const alphaList = telem.wheelSlipAnglesDeg || [0, 0, 0, 0];
    const wheelSpdList = telem.wheelSpeedsMph || [0, 0, 0, 0];
    const groundSpdList = telem.groundSpeedsMph || [0, 0, 0, 0];
    const ellipseList = telem.frictionEllipseUsage || [0, 0, 0, 0];
    const fzList = telem.wheelForcesNormal || [2900, 2900, 2900, 2900];

    const staticFzPerWheel = (1180 * 9.81) / 4.0; // ~2894 N

    // Render 4 Quadrants for the 4 wheels:
    // [FL (top-left)]   [FR (top-right)]
    // [RL (bot-left)]   [RR (bot-right)]
    const quadW = w / 2;
    const quadH = h / 2;

    for (let i = 0; i < 4; i++) {
      const qx = (i % 2) * quadW;
      const qy = Math.floor(i / 2) * quadH;

      ctx.save();
      ctx.translate(qx, qy);

      // Background border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.strokeRect(4, 4, quadW - 8, quadH - 8);

      // Wheel label
      const inContact = telem.wheelContacts[i];
      ctx.fillStyle = inContact ? '#38bdf8' : '#64748b';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(labels[i], 10, 18);

      // 1. Friction Ellipse Usage Gauge (Small Circular Meter)
      const cx = quadW - 24;
      const cy = 20;
      const radius = 12;
      const usage = ellipseList[i] || 0; // 0.0 to 1.0+

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      const endAngle = -Math.PI / 2 + Math.PI * 2 * Math.min(1.0, usage);
      ctx.arc(cx, cy, radius, -Math.PI / 2, endAngle);
      ctx.strokeStyle = usage > 0.95 ? '#ef4444' : usage > 0.70 ? '#f59e0b' : '#22c55e';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(usage * 100)}%`, cx, cy + 3);
      ctx.textAlign = 'left';

      // 2. Weight-Transfer Bar (Load Fz vs static)
      const fz = fzList[i] || 0;
      const fzRatio = fz / staticFzPerWheel; // 1.0 = static
      const barX = 10;
      const barY = 26;
      const barW = quadW - 20;
      const barH = 5;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(barX, barY, barW, barH);

      const fzBarFill = Math.min(barW, (barW / 2) * fzRatio);
      ctx.fillStyle = fzRatio > 1.3 ? '#f59e0b' : fzRatio < 0.6 ? '#60a5fa' : '#22c55e';
      ctx.fillRect(barX, barY, fzBarFill, barH);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText(`Load: ${Math.round(fz)}N (${(fzRatio * 100).toFixed(0)}%)`, barX, barY + 14);

      // 3. Slip Angle & Slip Ratio
      const sx = sxList[i] || 0;
      const alpha = alphaList[i] || 0;
      ctx.fillText(`sx: ${sx.toFixed(2)} | α: ${alpha.toFixed(1)}°`, barX, barY + 26);

      // 4. Wheel Speed vs Ground Speed
      const wSpd = wheelSpdList[i] || 0;
      const gSpd = groundSpdList[i] || 0;
      const slipDelta = wSpd - gSpd;
      const deltaColor = Math.abs(slipDelta) > 5 ? (slipDelta > 0 ? '#f59e0b' : '#ef4444') : '#94a3b8';
      ctx.fillText(`Whl:${wSpd.toFixed(1)} Gnd:${gSpd.toFixed(1)}`, barX, barY + 38);
      ctx.fillStyle = deltaColor;
      ctx.fillText(`Δ: ${slipDelta > 0 ? '+' : ''}${slipDelta.toFixed(1)} mph`, barX, barY + 48);

      ctx.restore();
    }
  }
}
