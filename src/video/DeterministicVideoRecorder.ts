import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CustomRallyVehicle } from '../vehicles/CustomRallyVehicle';
import { ChaseCamera } from '../core/ChaseCamera';
import { VehicleEffects } from '../effects/VehicleEffects';
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
  slip_angle_deg: number;
  roll_deg: number;
  pitch_deg: number;
  droop_cm: number;
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
    private sunLight: THREE.DirectionalLight
  ) {
    this.refRows = parseRefCsv(refCsvRaw);
    this.compCanvas = document.createElement('canvas');
    this.compCanvas.width = 1280;
    this.compCanvas.height = 720;
    this.compCtx = this.compCanvas.getContext('2d')!;
    this.effects = new VehicleEffects(scene, vehicle, physics);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, telem: VideoTelemetryFrame, clipTitle: string) {
    // Top-left broadcast telemetry HUD
    const hudX = 28;
    const hudY = 24;
    const hudW = 680;
    const hudH = 118;

    ctx.save();

    // Dark glassmorphism card
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(hudX, hudY, hudW, hudH, 10);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.stroke();

    // Header badge
    ctx.font = 'bold 12px "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#38bdf8'; // Cyan
    ctx.fillText(`APEX DIRT // ${clipTitle.toUpperCase()}`, hudX + 16, hudY + 22);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('120Hz PHY // 30FPS DETERMINISTIC', hudX + hudW - 220, hudY + 22);

    // Row 1: Primary flight telemetry
    ctx.font = 'bold 16px "SF Mono", Consolas, monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`TIME: ${telem.time_s.toFixed(2)}s`, hudX + 16, hudY + 52);

    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`SPEED: ${telem.speed_mph.toFixed(1).padStart(5)} mph`, hudX + 175, hudY + 52);

    ctx.fillStyle = '#fbbf24'; // Amber
    ctx.fillText(`GEAR: ${telem.gear}`, hudX + 395, hudY + 52);

    ctx.fillStyle = '#f97316'; // Orange
    ctx.fillText(`SLIP: ${telem.slip_angle_deg.toFixed(1).padStart(5)}°`, hudX + 510, hudY + 52);

    // Row 2: Chassis dynamics (Roll, Pitch, Droop)
    ctx.font = '13px "SF Mono", Consolas, monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`ROLL: ${(telem.roll_deg >= 0 ? '+' : '') + telem.roll_deg.toFixed(1)}°`, hudX + 16, hudY + 80);
    ctx.fillText(`PITCH: ${(telem.pitch_deg >= 0 ? '+' : '') + telem.pitch_deg.toFixed(1)}°`, hudX + 175, hudY + 80);

    ctx.fillStyle = telem.droop_cm > 1.0 ? '#22d3ee' : '#94a3b8';
    ctx.fillText(`DROOP: ${telem.droop_cm.toFixed(1).padStart(4)} cm`, hudX + 395, hudY + 80);

    // Row 3: Driver inputs
    ctx.font = 'bold 12px "SF Mono", Consolas, monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`STEER: ${(telem.steer >= 0 ? '+' : '') + telem.steer.toFixed(2)}`, hudX + 16, hudY + 104);

    // Throttle pill
    ctx.fillStyle = telem.throttle > 0.05 ? '#22c55e' : '#64748b';
    ctx.fillText(`THR: ${(telem.throttle * 100).toFixed(0)}%`, hudX + 175, hudY + 104);

    // Brake pill
    ctx.fillStyle = telem.brake > 0.05 ? '#ef4444' : '#64748b';
    ctx.fillText(`BRK: ${(telem.brake * 100).toFixed(0)}%`, hudX + 275, hudY + 104);

    // Handbrake pill badge
    if (telem.handbrake) {
      ctx.fillStyle = '#dc2626'; // Bright red
      ctx.beginPath();
      ctx.roundRect(hudX + 395, hudY + 91, 84, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText('HB: ACTIVE', hudX + 402, hudY + 104);
    } else {
      ctx.fillStyle = '#475569';
      ctx.fillText('HB: OFF', hudX + 395, hudY + 104);
    }

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

        const frameTelem: VideoTelemetryFrame = {
          time_s: parseFloat(globalTime.toFixed(3)),
          speed_mph: parseFloat(telem.speedMph.toFixed(1)),
          gear: telem.gear,
          steer,
          throttle: 1.0,
          brake: 0.0,
          handbrake: false,
          slip_angle_deg: parseFloat(this.vehicle.driftAngleDeg.toFixed(1)),
          roll_deg: parseFloat(rollDeg.toFixed(1)),
          pitch_deg: parseFloat(pitchDeg.toFixed(1)),
          droop_cm: parseFloat(droopCm.toFixed(1)),
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
          30: 'screenshot_01_spline_road_elevation_crest.png',
          60: 'screenshot_02_instanced_pines_and_shadows.png',
          120: 'screenshot_03_broadleaf_canopies_and_verge.png',
          150: 'screenshot_04_yellow_chevrons_hairpin.png',
          210: 'screenshot_05_teal_marker_signs_and_fences.png',
          240: 'screenshot_06_spectators_on_grassy_bank.png',
          300: 'screenshot_07_horizon_blue_haze_and_clouds.png',
          345: 'screenshot_08_stage_slide_scrub_and_props.png',
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
