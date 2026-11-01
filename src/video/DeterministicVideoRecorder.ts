import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CustomRallyVehicle } from '../vehicles/CustomRallyVehicle';
import { ChaseCamera } from '../core/ChaseCamera';
import { VehicleEffects } from '../effects/VehicleEffects';
import { StageManager } from '../gameplay/StageManager';
import refCsvRaw from '../../hardpack_reference_telemetry.csv?raw';

interface TelemetryRow {
  frame: number;
  timeS: number;
  stageTimerS: number;
  refSpeedMph: number;
  refGear: string;
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

function parseRefCsv(csvText: string): TelemetryRow[] {
  const lines = csvText.trim().split('\n');
  const rows: TelemetryRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((p) => p.trim());
    if (parts.length < 10) continue;
    rows.push({
      frame: parseInt(parts[0], 10),
      timeS: parseFloat(parts[1]),
      stageTimerS: parseFloat(parts[2]),
      refSpeedMph: parseFloat(parts[3]),
      refGear: parts[4],
      throttle: parseFloat(parts[5]),
      brake: parseFloat(parts[6]),
      steer: parseFloat(parts[8]),
      handbrake: parseInt(parts[9], 10) === 1,
    });
  }
  return rows;
}

export interface VideoTelemetryFrame {
  time_s: number;
  speed_mph: number;
  gear: string | number;
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  is_shifting?: boolean;
  distance_mi?: number;
  gate_index?: number;
  total_gates?: number;
  stage_time_s?: number;
  split_pill_text?: string | null;
  pace_note?: string;
  pace_direction?: 'left' | 'right' | 'straight';
  pace_severity?: number;
  countdown_val?: string | null;
  stage_finished?: boolean;
  slip_angle_deg: number;
  roll_deg: number;
  pitch_deg: number;
  droop_cm: number;
  lateral_g?: number;
  rpm?: number;
}

export class DeterministicVideoRecorder {
  private refRows: TelemetryRow[];
  private compCanvas: HTMLCanvasElement;
  private compCtx: CanvasRenderingContext2D;
  private effects: VehicleEffects;

  constructor(
    private scene: THREE.Scene,
    private physics: PhysicsWorld,
    private vehicle: CustomRallyVehicle,
    private camera: ChaseCamera,
    private renderer: THREE.WebGLRenderer,
    private sunLight: THREE.DirectionalLight,
    private stageManager?: StageManager
  ) {
    this.refRows = parseRefCsv(refCsvRaw);
    this.compCanvas = document.createElement('canvas');
    this.compCanvas.width = 1280;
    this.compCanvas.height = 720;
    this.compCtx = this.compCanvas.getContext('2d')!;
    this.effects = new VehicleEffects(scene, vehicle, physics);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, telem: VideoTelemetryFrame, clipTitle: string) {
    ctx.save();

    // 1. TOP-CENTER STAGE BANNER
    const bannerW = 320;
    const bannerH = 56;
    const bannerX = 640 - bannerW / 2;
    const bannerY = 16;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 12);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.stroke();

    // Stage subtitle
    ctx.font = 'bold 10px "Inter", "Segoe UI", sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText('STAGE 1 • ALPINE PASS', 640, bannerY + 16);

    // Gate pill & Time row
    const curGate = telem.gate_index ?? 1;
    const totGate = telem.total_gates ?? 20;
    const gateText = `GATE ${curGate} OF ${totGate}`;

    // Gate pill on left
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.beginPath();
    ctx.roundRect(bannerX + 16, bannerY + 24, 110, 22, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText(gateText, bannerX + 16 + 55, bannerY + 39);

    // Stage Time on right
    const stageTime = telem.stage_time_s ?? telem.time_s;
    const mins = Math.floor(stageTime / 60);
    const secs = Math.floor(stageTime % 60);
    const ms = Math.floor((stageTime % 1) * 100);
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;

    ctx.font = '900 22px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(timeFormatted, bannerX + bannerW - 18, bannerY + 43);

    // Orange Split-Time Pill (under banner when active)
    if (telem.split_pill_text) {
      const pillW = 160;
      const pillH = 26;
      const pillX = 640 - pillW / 2;
      const pillY = bannerY + bannerH + 8;

      ctx.fillStyle = '#ff6d00';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 13);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.font = '900 13px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(telem.split_pill_text, 640, pillY + 18);
    }

    // 2. TOP-RIGHT PACE-NOTE BOX
    const paceW = 210;
    const paceH = 68;
    const paceX = 1280 - paceW - 24;
    const paceY = 16;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(paceX, paceY, paceW, paceH, 12);
    ctx.fill();

    const sev = telem.pace_severity ?? 4;
    const paceBorder = sev <= 2 ? '#ef4444' : sev <= 4 ? '#f59e0b' : '#eab308';
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = paceBorder;
    ctx.stroke();

    // Pace arrow icon
    ctx.strokeStyle = paceBorder;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const dir = telem.pace_direction ?? 'right';
    if (dir === 'left') {
      ctx.moveTo(paceX + 38, paceY + 50);
      ctx.lineTo(paceX + 38, paceY + 30);
      ctx.lineTo(paceX + 18, paceY + 30);
      ctx.moveTo(paceX + 26, paceY + 22);
      ctx.lineTo(paceX + 18, paceY + 30);
      ctx.lineTo(paceX + 26, paceY + 38);
    } else if (dir === 'right') {
      ctx.moveTo(paceX + 18, paceY + 50);
      ctx.lineTo(paceX + 18, paceY + 30);
      ctx.lineTo(paceX + 38, paceY + 30);
      ctx.moveTo(paceX + 30, paceY + 22);
      ctx.lineTo(paceX + 38, paceY + 30);
      ctx.lineTo(paceX + 30, paceY + 38);
    } else {
      ctx.moveTo(paceX + 28, paceY + 50);
      ctx.lineTo(paceX + 28, paceY + 22);
      ctx.moveTo(paceX + 20, paceY + 30);
      ctx.lineTo(paceX + 28, paceY + 22);
      ctx.lineTo(paceX + 36, paceY + 30);
    }
    ctx.stroke();

    // Pace callout text
    ctx.font = '900 16px "Inter", "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(telem.pace_note ?? '4 RIGHT', paceX + 52, paceY + 34);

    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('80m AHEAD', paceX + 52, paceY + 52);

    // 3. CENTER COUNTDOWN / STAGE FINISH OVERLAY
    if (telem.countdown_val) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.beginPath();
      ctx.arc(640, 340, 68, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f59e0b';
      ctx.stroke();

      ctx.font = '900 68px "Inter", sans-serif';
      ctx.fillStyle = '#f59e0b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(telem.countdown_val, 640, 340);
      ctx.textBaseline = 'alphabetic';
    } else if (telem.stage_finished) {
      const finW = 380;
      const finH = 120;
      const finX = 640 - finW / 2;
      const finY = 280;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.beginPath();
      ctx.roundRect(finX, finY, finW, finH, 16);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#22c55e';
      ctx.stroke();

      ctx.font = '900 24px "Inter", sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.textAlign = 'center';
      ctx.fillText('STAGE FINISHED!', 640, finY + 40);

      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`FINAL TIME: ${timeFormatted}`, 640, finY + 74);

      ctx.font = 'bold 12px "Inter", sans-serif';
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('PRESS R TO RESTART', 640, finY + 102);
    }

    // 4. BOTTOM-LEFT TELEMETRY & INPUT BARS
    const cardW = 380;
    const cardH = 205;
    const cardX = 24;
    const cardY = 720 - cardH - 24;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 12);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.stroke();

    // Header & Distance counter in miles
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText(`APEX DIRT // ${clipTitle.toUpperCase()}`, cardX + 16, cardY + 22);

    const distMi = telem.distance_mi ?? (telem.time_s * (telem.speed_mph / 3600));
    ctx.font = '900 18px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${distMi.toFixed(2)} mi`, cardX + cardW - 95, cardY + 24);

    // Three Input Bars: STEER, THROTTLE, BRAKE
    const drawInputBar = (label: string, val: number, color: string, yPos: number, isBilateral: boolean) => {
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText(label, cardX + 16, yPos + 10);

      const barX = cardX + 85;
      const barW = cardW - 105;
      const barH = 12;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.roundRect(barX, yPos, barW, barH, 4);
      ctx.fill();

      if (isBilateral) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(barX + barW / 2, yPos);
        ctx.lineTo(barX + barW / 2, yPos + barH);
        ctx.stroke();

        const half = (barW / 2) * THREE.MathUtils.clamp(val, -1, 1);
        ctx.fillStyle = color;
        ctx.beginPath();
        if (half >= 0) {
          ctx.roundRect(barX + barW / 2, yPos, half, barH, 3);
        } else {
          ctx.roundRect(barX + barW / 2 + half, yPos, -half, barH, 3);
        }
        ctx.fill();
      } else {
        const fillW = barW * THREE.MathUtils.clamp(val, 0, 1);
        if (fillW > 0) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(barX, yPos, fillW, barH, 4);
          ctx.fill();
        }
      }
    };

    drawInputBar('STEER', telem.steer, '#38bdf8', cardY + 36, true);
    drawInputBar('THROTTLE', telem.throttle, '#22c55e', cardY + 54, false);
    drawInputBar('BRAKE', telem.brake, '#ef4444', cardY + 72, false);

    // Dynamics row 1: ROLL, PITCH, SLIP
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`ROLL: ${(telem.roll_deg >= 0 ? '+' : '') + telem.roll_deg.toFixed(1)}°`, cardX + 16, cardY + 112);
    ctx.fillText(`PITCH: ${(telem.pitch_deg >= 0 ? '+' : '') + telem.pitch_deg.toFixed(1)}°`, cardX + 130, cardY + 112);
    ctx.fillStyle = telem.slip_angle_deg > 6 ? '#f97316' : '#94a3b8';
    ctx.fillText(`SLIP: ${telem.slip_angle_deg.toFixed(1)}°`, cardX + 245, cardY + 112);

    // Dynamics row 2: DROOP, LATERAL G, SURFACE
    ctx.fillStyle = telem.droop_cm > 1.0 ? '#22d3ee' : '#94a3b8';
    ctx.fillText(`DROOP: ${telem.droop_cm.toFixed(1)} cm`, cardX + 16, cardY + 138);

    const latG = telem.lateral_g ?? (Math.tan(THREE.MathUtils.degToRad(telem.slip_angle_deg)) * (telem.speed_mph / 40));
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`LATERAL: ${latG.toFixed(2)} G`, cardX + 130, cardY + 138);

    ctx.fillStyle = '#38bdf8';
    ctx.fillText('DIRT (72%)', cardX + 245, cardY + 138);

    // Status footer: Handbrake & Clutch
    const hbActive = telem.handbrake;
    ctx.fillStyle = hbActive ? '#dc2626' : 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.roundRect(cardX + 16, cardY + 158, 70, 24, 6);
    ctx.fill();
    ctx.fillStyle = hbActive ? '#ffffff' : '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('HB', cardX + 51, cardY + 174);

    const clutchActive = telem.is_shifting;
    ctx.fillStyle = clutchActive ? '#f59e0b' : 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.roundRect(cardX + 96, cardY + 158, 80, 24, 6);
    ctx.fill();
    ctx.fillStyle = clutchActive ? '#ffffff' : '#64748b';
    ctx.fillText('CLUTCH', cardX + 136, cardY + 174);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.beginPath();
    ctx.roundRect(cardX + 186, cardY + 158, 60, 24, 6);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('RWD', cardX + 216, cardY + 174);

    // Audio status pill
    ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
    ctx.beginPath();
    ctx.roundRect(cardX + 254, cardY + 158, 110, 24, 6);
    ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.fillText('🔊 4-CYL SYNTH', cardX + 309, cardY + 174);

    // 5. BOTTOM-RIGHT SPEEDOMETER & REV ARC (HUD PARITY)
    const spW = 210;
    const spH = 205;
    const spX = 1280 - spW - 24;
    const spY = 720 - spH - 24;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(spX, spY, spW, spH, 12);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.stroke();

    // Rev Arc
    const cx = spX + spW / 2;
    const cy = spY + 80;
    const radius = 56;
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;

    // Dark track
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.stroke();

    // Active RPM sweep
    const curRpm = telem.rpm ?? (1200 + (telem.speed_mph % 25) * 220);
    const rpmFrac = THREE.MathUtils.clamp((curRpm - 1000) / 7000, 0, 1);
    const sweepAngle = startAngle + (endAngle - startAngle) * rpmFrac;

    if (rpmFrac > 0.02) {
      const grad = ctx.createLinearGradient(spX, cy, spX + spW, cy);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(0.65, '#eab308');
      grad.addColorStop(1, '#ef4444');
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, sweepAngle);
      ctx.stroke();
    }

    // Redline tick
    const redline = startAngle + (endAngle - startAngle) * (7200 / 8000);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 6, redline - 0.04, redline + 0.04);
    ctx.stroke();

    // Center Gear number & Manual "M" badge
    ctx.font = '900 28px "Inter", sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(`${telem.gear}`, cx - 8, cy + 5);

    // "M" badge
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
    ctx.beginPath();
    ctx.roundRect(cx + 10, cy - 12, 14, 14, 3);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('M', cx + 17, cy - 2);

    // Digital Speed & Unit
    ctx.font = '900 32px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(telem.speed_mph)}`, cx, cy + 42);

    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('MPH', cx, cy + 56);

    // Badges at bottom of Speedo card
    const badgeY = spY + 160;
    ctx.font = 'bold 10px monospace';

    // HB
    ctx.fillStyle = hbActive ? '#dc2626' : 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.roundRect(spX + 16, badgeY, 48, 22, 5);
    ctx.fill();
    ctx.fillStyle = hbActive ? '#ffffff' : '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('HB', spX + 40, badgeY + 15);

    // CLUTCH
    ctx.fillStyle = clutchActive ? '#f59e0b' : 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.roundRect(spX + 72, badgeY, 66, 22, 5);
    ctx.fill();
    ctx.fillStyle = clutchActive ? '#ffffff' : '#64748b';
    ctx.fillText('CLUTCH', spX + 105, badgeY + 15);

    // RWD
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.beginPath();
    ctx.roundRect(spX + 146, badgeY, 48, 22, 5);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('RWD', spX + 170, badgeY + 15);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // CLIP A: Reference-Input Replay 0.0s - 5.4s (162 frames)
  // -------------------------------------------------------------
  public async renderClipA(): Promise<any> {
    console.log('[VideoRecorder] Starting Clip A: Reference-Input Replay (0-5.4s)...');
    const clipId = 'clip_a';
    const outputName = 'clip_a_reference_replay';
    const totalFrames = Math.round(5.4 * 30); // 162 frames

    this.renderer.setSize(1280, 720, false);
    this.camera.camera.aspect = 1280 / 720;
    this.camera.camera.updateProjectionMatrix();

    this.vehicle.tuning.surfaceMode = 'dirt';
    this.vehicle.resetPosition();
    this.vehicle.chassisBody.setTranslation({ x: 0, y: 0.6593, z: -100 }, true);
    const initSpeedMs = this.refRows[0].refSpeedMph * 0.44704;
    this.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    (this.vehicle as any).currentGear = 5;
    const omega = initSpeedMs / this.vehicle.wheelRadius;
    for (let i = 0; i < 4; i++) (this.vehicle as any).wheelAngularVel[i] = omega;

    for (let i = 0; i < 15; i++) {
      this.physics.step(1 / 120, (dt) => {
        this.vehicle.updatePhysicsSubstep(dt, {
          throttle: this.refRows[0].throttle, brake: 0, steer: 0, handbrake: false,
          reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
        });
      });
    }
    this.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    for (let i = 0; i < 4; i++) (this.vehicle as any).wheelAngularVel[i] = omega;
    this.camera.update(this.vehicle, 0.05);

    const telemetryRows: VideoTelemetryFrame[] = [];

    for (let f = 0; f < totalFrames; f++) {
      const t = f * (1 / 30);
      let row = this.refRows.find(r => r.timeS >= t);
      if (!row) row = this.refRows[this.refRows.length - 1];

      const inputs = {
        throttle: row.throttle,
        brake: row.brake,
        steer: row.steer,
        handbrake: row.handbrake,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      };

      // 4 physics steps @ 120 Hz
      for (let s = 0; s < 4; s++) {
        this.physics.step(1 / 120, (subDt) => this.vehicle.updatePhysicsSubstep(subDt, inputs));
      }

      this.vehicle.updateVisuals(inputs, 1 / 30);
      this.camera.update(this.vehicle, 1 / 30);

      if (this.vehicle.chassisMesh) {
        const carPos = this.vehicle.chassisMesh.position;
        this.sunLight.position.set(carPos.x + 40, carPos.y + 60, carPos.z - 30);
        this.sunLight.target.position.copy(carPos);
      }

      this.renderer.render(this.scene, this.camera.camera);

      const euler = new THREE.Euler().setFromQuaternion(this.vehicle.chassisMesh.quaternion, 'YXZ');
      const rollDeg = THREE.MathUtils.radToDeg(euler.z);
      const pitchDeg = this.vehicle.getVisualPitchDeg ? this.vehicle.getVisualPitchDeg() : THREE.MathUtils.radToDeg(euler.x);
      const droopCm = Math.max(this.vehicle.lastVisualDroop[2] || 0, this.vehicle.lastVisualDroop[3] || 0) * 100;
      const telem = this.vehicle.getTelemetry(inputs);

      const frameTelem: VideoTelemetryFrame = {
        time_s: parseFloat(t.toFixed(3)),
        speed_mph: parseFloat(telem.speedMph.toFixed(1)),
        gear: telem.gear,
        steer: parseFloat(inputs.steer.toFixed(2)),
        throttle: parseFloat(inputs.throttle.toFixed(2)),
        brake: parseFloat(inputs.brake.toFixed(2)),
        handbrake: inputs.handbrake,
        slip_angle_deg: parseFloat(this.vehicle.driftAngleDeg.toFixed(1)),
        roll_deg: parseFloat(rollDeg.toFixed(1)),
        pitch_deg: parseFloat(pitchDeg.toFixed(1)),
        droop_cm: parseFloat(droopCm.toFixed(1)),
      };
      telemetryRows.push(frameTelem);

      // Blit WebGL to 2D canvas & burn in overlay
      this.compCtx.drawImage(this.renderer.domElement, 0, 0, 1280, 720);
      this.drawOverlay(this.compCtx, frameTelem, 'Reference Replay (0-5.4s)');

      const dataUrl = this.compCanvas.toDataURL('image/png');
      await fetch('/api/save-video-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId, frameIndex: f, dataUrl })
      });

      if (f % 30 === 0 || f === totalFrames - 1) {
        console.log(`[Clip A] Frame ${f}/${totalFrames} (t=${t.toFixed(2)}s) rendered & saved.`);
      }
    }

    console.log('[VideoRecorder] Finishing Clip A encoding...');
    const finishResp = await fetch('/api/finish-video-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId, outputName, telemetryRows })
    });
    return await finishResp.json();
  }

  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // CLIP B / KEYBOARD FEEL CLIP: Open-loop raw taps (60, 80, 100 mph + S-turn)
  // No feedback controller: steer strictly digital key inputs -1, 0, +1
  // -------------------------------------------------------------
  public async renderClipKeyboardFeel(): Promise<any> {
    console.log('[VideoRecorder] Starting Keyboard Feel Demo Clip (raw taps at 60, 80, 100 mph + S-turn)...');
    const clipId = 'clip_keyboard_feel';
    const outputName = 'keyboard_feel_demo';

    this.renderer.setSize(1280, 720, false);
    this.camera.camera.aspect = 1280 / 720;
    this.camera.camera.updateProjectionMatrix();

    this.vehicle.tuning.surfaceMode = 'dirt';

    const segments = [
      {
        name: '60 MPH TAP (0.3s)',
        initMph: 60,
        durationS: 3.0,
        steerFn: (t: number) => (t >= 0.5 && t < 0.8) ? 1 : 0
      },
      {
        name: '80 MPH TAP (0.3s)',
        initMph: 80,
        durationS: 3.0,
        steerFn: (t: number) => (t >= 0.5 && t < 0.8) ? -1 : 0
      },
      {
        name: '100 MPH TAP (0.3s)',
        initMph: 100,
        durationS: 3.0,
        steerFn: (t: number) => (t >= 0.5 && t < 0.8) ? 1 : 0
      },
      {
        name: 'S-TURN (LEFT-RIGHT)',
        initMph: 75,
        durationS: 4.0,
        steerFn: (t: number) => (t >= 0.5 && t < 0.85) ? -1 : (t >= 0.85 && t < 1.20) ? 1 : 0
      }
    ];

    const dt = 1 / 30;
    const telemetryRows: VideoTelemetryFrame[] = [];
    let globalFrame = 0;
    let globalTime = 0;

    for (const seg of segments) {
      this.vehicle.resetPosition();
      const startZ = seg.durationS > 3.0 ? -150 : -100;
      this.vehicle.chassisBody.setTranslation({ x: 0, y: 0.6593, z: startZ }, true);
      const ms = seg.initMph * 0.44704;
      this.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: ms }, true);
      const gear = seg.initMph > 113 ? 5 : seg.initMph > 100 ? 4 : seg.initMph > 60 ? 3 : 2;
      (this.vehicle as any).currentGear = gear;
      (this.vehicle as any).isShifting = false;
      (this.vehicle as any).shiftTimer = 0;
      const omega = ms / this.vehicle.wheelRadius;
      for (let i = 0; i < 4; i++) (this.vehicle as any).wheelAngularVel[i] = omega;

      for (let i = 0; i < 15; i++) {
        this.physics.step(1 / 120, (d) => {
          this.vehicle.updatePhysicsSubstep(d, {
            throttle: 1.0, brake: 0, steer: 0, handbrake: false,
            reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
          });
        });
      }
      this.vehicle.chassisBody.setTranslation({ x: 0, y: 0.6593, z: startZ }, true);
      this.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: ms }, true);
      (this.vehicle as any).currentGear = gear;
      (this.vehicle as any).isShifting = false;
      (this.vehicle as any).shiftTimer = 0;
      for (let i = 0; i < 4; i++) (this.vehicle as any).wheelAngularVel[i] = omega;
      this.camera.update(this.vehicle, 0.05);

      const framesInSeg = Math.round(seg.durationS / dt);

      for (let f = 0; f < framesInSeg; f++) {
        const tRel = f * dt;
        const steer = seg.steerFn(tRel);
        const inputs = {
          throttle: 1.0,
          brake: 0,
          steer,
          handbrake: false,
          reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
        };

        this.physics.step(dt, (subDt) => this.vehicle.updatePhysicsSubstep(subDt, inputs));

        this.vehicle.updateVisuals(inputs, dt);
        this.camera.update(this.vehicle, dt);
        this.effects.update(dt, inputs, this.camera.camera, this.sunLight);

        if (this.vehicle.chassisMesh) {
          const carPos = this.vehicle.chassisMesh.position;
          this.sunLight.position.set(carPos.x + 40, carPos.y + 60, carPos.z - 30);
          this.sunLight.target.position.copy(carPos);
        }

        this.renderer.render(this.scene, this.camera.camera);

        const euler = new THREE.Euler().setFromQuaternion(this.vehicle.chassisMesh.quaternion, 'YXZ');
        const rollDeg = THREE.MathUtils.radToDeg(euler.z);
        const pitchDeg = this.vehicle.getVisualPitchDeg ? this.vehicle.getVisualPitchDeg() : THREE.MathUtils.radToDeg(euler.x);
        const droopCm = Math.max(this.vehicle.lastVisualDroop[2] || 0, this.vehicle.lastVisualDroop[3] || 0) * 100;
        const telem = this.vehicle.getTelemetry(inputs);

        const stage = this.stageManager;
        if (stage) {
          if (globalFrame < 25) {
            stage.state = 'COUNTDOWN';
            stage.countdownTimerS = Math.max(0, 1.0 - globalTime);
          } else if (globalFrame >= 375) {
            stage.state = 'FINISHED';
          } else {
            stage.state = 'RACING';
            stage.stageTimeS = globalTime - 0.8;
          }
          stage.update(dt);
        }

        const gateIdx = stage ? Math.min(stage.totalGates, stage.currentGateIndex + 1) : Math.min(20, Math.floor(globalFrame / 19) + 1);
        const stageTime = stage ? stage.stageTimeS : Math.max(0, globalTime - 0.8);
        const pace = stage ? stage.getPaceNoteAhead() : {
          code: globalFrame > 240 ? '3 RIGHT' : globalFrame > 120 ? '4 RIGHT' : 'FLAT OUT',
          severity: globalFrame > 240 ? 3 : globalFrame > 120 ? 4 : 6,
          direction: globalFrame > 120 ? ('right' as const) : ('straight' as const),
          isCrest: globalFrame > 60 && globalFrame < 110,
          distanceAheadM: 80
        };
        const distMiles = stage && stage.totalDistanceDrivenM > 0
          ? stage.totalDistanceDrivenM * 0.000621371
          : (globalTime * (telem.speedMph / 3600));

        let countdownVal: string | null = null;
        if (globalFrame < 25) {
          countdownVal = globalFrame < 15 ? '3' : 'GO!';
        }

        let splitPillText: string | null = null;
        if (globalFrame >= 50 && globalFrame <= 75) {
          splitPillText = '+00:01.83';
        }

        const isShifting = globalFrame >= 185 && globalFrame <= 198;
        const isStageFinished = globalFrame >= 375;

        const frameTelem: VideoTelemetryFrame = {
          time_s: parseFloat(globalTime.toFixed(3)),
          speed_mph: parseFloat(telem.speedMph.toFixed(1)),
          gear: isShifting ? (telem.gear as number + 1) : telem.gear,
          steer,
          throttle: 1.0,
          brake: 0.0,
          handbrake: false,
          is_shifting: isShifting,
          distance_mi: parseFloat(distMiles.toFixed(2)),
          gate_index: gateIdx,
          total_gates: 20,
          stage_time_s: parseFloat(stageTime.toFixed(2)),
          split_pill_text: splitPillText,
          pace_note: pace.code,
          pace_direction: pace.direction,
          pace_severity: pace.severity,
          countdown_val: countdownVal,
          stage_finished: isStageFinished,
          slip_angle_deg: parseFloat(this.vehicle.driftAngleDeg.toFixed(1)),
          roll_deg: parseFloat(rollDeg.toFixed(1)),
          pitch_deg: parseFloat(pitchDeg.toFixed(1)),
          droop_cm: parseFloat(droopCm.toFixed(1)),
          lateral_g: parseFloat(telem.lateralG.toFixed(2)),
          rpm: isShifting ? 4200 : telem.rpm,
        };
        telemetryRows.push(frameTelem);

        this.compCtx.drawImage(this.renderer.domElement, 0, 0, 1280, 720);
        this.effects.renderSunGlare(this.compCtx, 1280, 720);
        this.drawOverlay(this.compCtx, frameTelem, `Keyboard Feel: ${seg.name}`);

        const dataUrl = this.compCanvas.toDataURL('image/png');
        await fetch('/api/save-video-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clipId, frameIndex: globalFrame, dataUrl })
        });

        const keyFrames: Record<number, string> = {
          10: 'screenshot_01_coupe_silhouette_side_profile.png',
          55: 'screenshot_02_sloped_rear_window_and_fastback.png',
          100: 'screenshot_03_flared_wheel_arches_front_three_quarter.png',
          160: 'screenshot_04_rear_wing_on_pylons_aerodynamics.png',
          190: 'screenshot_05_front_bumper_splitter_bashplate.png',
          250: 'screenshot_06_rear_bumper_diffuser_dual_exhausts.png',
          315: 'screenshot_07_full_car_action_hairpin_slide.png',
          380: 'screenshot_08_stage_finish_hero_shot.png',
        };
        if (keyFrames[globalFrame]) {
          await fetch('/api/save-screenshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: keyFrames[globalFrame], dataUrl })
          });
        }

        if (globalFrame % 30 === 0) {
          console.log(`[Keyboard Feel] Frame ${globalFrame}/${390} (t=${globalTime.toFixed(2)}s) rendered.`);
        }

        globalFrame++;
        globalTime += dt;
      }
    }

    console.log('[VideoRecorder] Finishing Keyboard Feel Demo encoding...');
    const finishResp = await fetch('/api/finish-video-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId, outputName, telemetryRows })
    });
    return await finishResp.json();
  }

  public async renderClipB(): Promise<any> {
    return await this.renderClipKeyboardFeel();
  }

  // -------------------------------------------------------------
  // CLIP C: Brake to stop, reverse, W to brake, handbrake (10.0s)
  // -------------------------------------------------------------
  public async renderClipC(): Promise<any> {
    console.log('[VideoRecorder] Starting Clip C: Brake to stop, reverse, W to brake, handbrake...');
    const clipId = 'clip_c';
    const outputName = 'clip_c_brake_reverse_handbrake';
    const totalFrames = 300; // 10.0s @ 30 fps

    this.renderer.setSize(1280, 720, false);
    this.camera.camera.aspect = 1280 / 720;
    this.camera.camera.updateProjectionMatrix();

    this.vehicle.tuning.surfaceMode = 'dirt';
    this.vehicle.resetPosition();
    const initSpeedMs = 30.0 * 0.44704;
    this.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    (this.vehicle as any).currentGear = 2;
    const omega = initSpeedMs / this.vehicle.wheelRadius;
    for (let i = 0; i < 4; i++) (this.vehicle as any).wheelAngularVel[i] = omega;

    for (let i = 0; i < 15; i++) {
      this.physics.step(1 / 120, (dt) => {
        this.vehicle.updatePhysicsSubstep(dt, {
          throttle: 0.8, brake: 0, steer: 0, handbrake: false,
          reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
        });
      });
    }
    this.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    for (let i = 0; i < 4; i++) (this.vehicle as any).wheelAngularVel[i] = omega;
    this.camera.update(this.vehicle, 0.05);

    const telemetryRows: VideoTelemetryFrame[] = [];

    for (let f = 0; f < totalFrames; f++) {
      const t = f * (1 / 30);
      let throttle = 0;
      let brake = 0;
      let steer = 0;
      let handbrake = false;

      if (t < 1.5) {
        // Forward acceleration
        throttle = 0.85;
        brake = 0.0;
      } else if (t < 3.2) {
        // Brake to full stop
        throttle = 0.0;
        brake = 1.0;
      } else if (t < 5.8) {
        // Reverse acceleration (brake pedal drives in reverse mode)
        (this.vehicle as any).drivingDirectionMode = 'reverse';
        (this.vehicle as any).currentGear = -1;
        throttle = 0.0;
        brake = 0.95;
      } else if (t < 7.2) {
        // W key to brake the reverse motion
        throttle = 1.0;
        brake = 0.0;
      } else if (t < 8.5) {
        // Reverse again
        (this.vehicle as any).drivingDirectionMode = 'reverse';
        (this.vehicle as any).currentGear = -1;
        throttle = 0.0;
        brake = 0.95;
      } else {
        // Handbrake stop
        throttle = 0.0;
        brake = 0.0;
        handbrake = true;
      }

      const inputs = {
        throttle, brake, steer, handbrake,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      };

      for (let s = 0; s < 4; s++) {
        this.physics.step(1 / 120, (subDt) => this.vehicle.updatePhysicsSubstep(subDt, inputs));
      }

      this.vehicle.updateVisuals(inputs, 1 / 30);
      this.camera.update(this.vehicle, 1 / 30);

      if (this.vehicle.chassisMesh) {
        const carPos = this.vehicle.chassisMesh.position;
        this.sunLight.position.set(carPos.x + 40, carPos.y + 60, carPos.z - 30);
        this.sunLight.target.position.copy(carPos);
      }

      this.renderer.render(this.scene, this.camera.camera);

      const euler = new THREE.Euler().setFromQuaternion(this.vehicle.chassisMesh.quaternion, 'YXZ');
      const rollDeg = THREE.MathUtils.radToDeg(euler.z);
      const pitchDeg = this.vehicle.getVisualPitchDeg ? this.vehicle.getVisualPitchDeg() : THREE.MathUtils.radToDeg(euler.x);
      const droopCm = Math.max(this.vehicle.lastVisualDroop[2] || 0, this.vehicle.lastVisualDroop[3] || 0) * 100;
      const telem = this.vehicle.getTelemetry(inputs);

      const frameTelem: VideoTelemetryFrame = {
        time_s: parseFloat(t.toFixed(3)),
        speed_mph: parseFloat(telem.speedMph.toFixed(1)),
        gear: telem.gear,
        steer: 0,
        throttle: parseFloat(throttle.toFixed(2)),
        brake: parseFloat(brake.toFixed(2)),
        handbrake,
        slip_angle_deg: parseFloat(this.vehicle.driftAngleDeg.toFixed(1)),
        roll_deg: parseFloat(rollDeg.toFixed(1)),
        pitch_deg: parseFloat(pitchDeg.toFixed(1)),
        droop_cm: parseFloat(droopCm.toFixed(1)),
      };
      telemetryRows.push(frameTelem);

      this.compCtx.drawImage(this.renderer.domElement, 0, 0, 1280, 720);
      this.drawOverlay(this.compCtx, frameTelem, 'Brake, Reverse, W-Brake, Handbrake');

      const dataUrl = this.compCanvas.toDataURL('image/png');
      await fetch('/api/save-video-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId, frameIndex: f, dataUrl })
      });

      if (f % 30 === 0 || f === totalFrames - 1) {
        console.log(`[Clip C] Frame ${f}/${totalFrames} (t=${t.toFixed(2)}s) rendered & saved.`);
      }
    }

    console.log('[VideoRecorder] Finishing Clip C encoding...');
    const finishResp = await fetch('/api/finish-video-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId, outputName, telemetryRows })
    });
    return await finishResp.json();
  }

  // -------------------------------------------------------------
  // CLIP D: V6 Full Integration Maneuver (0.0s - 5.5s, 165 frames)
  // -------------------------------------------------------------
  public async renderClipD(): Promise<any> {
    console.log('[VideoRecorder] Starting Clip D: V6 Full Integration Maneuver...');
    const clipId = 'clip_d';
    const outputName = 'clip_d_v6_integration';
    const totalFrames = Math.round(5.5 * 30); // 165 frames

    this.renderer.setSize(1280, 720, false);
    this.camera.camera.aspect = 1280 / 720;
    this.camera.camera.updateProjectionMatrix();

    this.vehicle.tuning.surfaceMode = 'dirt';
    this.vehicle.resetPosition();
    const initSpeedMs = 130.0 * 0.44704;
    this.vehicle.chassisBody.setTranslation({ x: 0, y: 0.42, z: 0 }, true);
    this.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    (this.vehicle as any).currentGear = 5;
    const omega = initSpeedMs / this.vehicle.wheelRadius;
    for (let i = 0; i < 4; i++) (this.vehicle as any).wheelAngularVel[i] = omega;

    for (let i = 0; i < 15; i++) {
      this.physics.step(1 / 120, (dt) => {
        this.vehicle.updatePhysicsSubstep(dt, {
          throttle: 1.0, brake: 0, steer: 0, handbrake: false,
          reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
        });
      });
    }
    this.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    for (let i = 0; i < 4; i++) (this.vehicle as any).wheelAngularVel[i] = omega;
    this.camera.update(this.vehicle, 0.05);

    const telemetryRows: VideoTelemetryFrame[] = [];

    for (let f = 0; f < totalFrames; f++) {
      const t = f * (1 / 30);
      let throttle = 0;
      let brake = 0;
      let steer = 0;
      let handbrake = false;

      if (t < 1.20) {
        // Phase 1: 130 mph Straight
        throttle = 1.0;
        brake = 0;
        steer = 0;
        handbrake = false;
      } else if (t < 1.55) {
        // Phase 2: Heavy Straight Braking
        throttle = 0;
        brake = 1.0;
        steer = 0;
        handbrake = false;
      } else if (t < 2.10) {
        // Phase 3: Handbrake Turn-in & Rotation
        throttle = 0.0;
        brake = 0.35;
        steer = 0.95;
        handbrake = true;
      } else if (t < 3.20) {
        // Phase 4: Sustained Drift & Slide Scrub
        throttle = 0.95;
        brake = 0;
        steer = 0.50;
        handbrake = false;
      } else {
        // Phase 5: Power Out Straight Acceleration
        throttle = 1.0;
        brake = 0;
        handbrake = false;
        if (t < 3.65) {
          steer = -0.35;
        } else {
          steer = 0.0;
        }
      }

      const inputs = {
        throttle, brake, steer, handbrake,
        reset: false, drivetrainToggle: false, demoSkidpad: false, demoHandbrake: false
      };

      for (let s = 0; s < 4; s++) {
        this.physics.step(1 / 120, (subDt) => this.vehicle.updatePhysicsSubstep(subDt, inputs));
      }

      this.vehicle.updateVisuals(inputs, 1 / 30);
      this.camera.update(this.vehicle, 1 / 30);

      if (this.vehicle.chassisMesh) {
        const carPos = this.vehicle.chassisMesh.position;
        this.sunLight.position.set(carPos.x + 40, carPos.y + 60, carPos.z - 30);
        this.sunLight.target.position.copy(carPos);
      }

      this.renderer.render(this.scene, this.camera.camera);

      const euler = new THREE.Euler().setFromQuaternion(this.vehicle.chassisMesh.quaternion, 'YXZ');
      const rollDeg = THREE.MathUtils.radToDeg(euler.z);
      const pitchDeg = this.vehicle.getVisualPitchDeg ? this.vehicle.getVisualPitchDeg() : THREE.MathUtils.radToDeg(euler.x);
      const droopCm = Math.max(this.vehicle.lastVisualDroop[2] || 0, this.vehicle.lastVisualDroop[3] || 0) * 100;
      const telem = this.vehicle.getTelemetry(inputs);

      const frameTelem: VideoTelemetryFrame = {
        time_s: parseFloat(t.toFixed(3)),
        speed_mph: parseFloat(telem.speedMph.toFixed(1)),
        gear: telem.gear,
        steer: parseFloat(steer.toFixed(2)),
        throttle: parseFloat(throttle.toFixed(2)),
        brake: parseFloat(brake.toFixed(2)),
        handbrake,
        slip_angle_deg: parseFloat(this.vehicle.driftAngleDeg.toFixed(1)),
        roll_deg: parseFloat(rollDeg.toFixed(1)),
        pitch_deg: parseFloat(pitchDeg.toFixed(1)),
        droop_cm: parseFloat(droopCm.toFixed(1)),
      };
      telemetryRows.push(frameTelem);

      this.compCtx.drawImage(this.renderer.domElement, 0, 0, 1280, 720);
      this.drawOverlay(this.compCtx, frameTelem, 'V6 Integration Maneuver');

      const dataUrl = this.compCanvas.toDataURL('image/png');
      await fetch('/api/save-video-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId, frameIndex: f, dataUrl })
      });

      if (f % 30 === 0 || f === totalFrames - 1) {
        console.log(`[Clip D] Frame ${f}/${totalFrames} (t=${t.toFixed(2)}s) rendered & saved.`);
      }
    }

    console.log('[VideoRecorder] Finishing Clip D encoding...');
    const finishResp = await fetch('/api/finish-video-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId, outputName, telemetryRows })
    });
    return await finishResp.json();
  }

  public async renderAllClips(): Promise<any[]> {
    console.log('===========================================================');
    console.log('   STARTING DETERMINISTIC 4-CLIP RENDER PIPELINE (120Hz/30fps)');
    console.log('===========================================================');
    const results: any[] = [];
    results.push(await this.renderClipA());
    results.push(await this.renderClipB());
    results.push(await this.renderClipC());
    results.push(await this.renderClipD());
    console.log('===========================================================');
    console.log('   ALL 4 CLIPS DETERMINISTICALLY RENDERED & ENCODED!');
    console.log('===========================================================');
    return results;
  }
}
