import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CustomRallyVehicle } from '../vehicles/CustomRallyVehicle';
import { ChaseCamera } from '../core/ChaseCamera';
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

function parseCsv(csvText: string): TelemetryRow[] {
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

export class ReplayVisualizer {
  private rows: TelemetryRow[];
  private targetTimestamps = [2.0, 2.5, 2.8, 3.2, 3.8, 4.1];
  private capturedTimestamps = new Set<number>();

  constructor(
    private scene: THREE.Scene,
    private physics: PhysicsWorld,
    private vehicle: CustomRallyVehicle,
    private camera: ChaseCamera,
    private renderer: THREE.WebGLRenderer,
    private sunLight: THREE.DirectionalLight
  ) {
    this.rows = parseCsv(refCsvRaw);
  }

  public async runAndCaptureScreenshots(): Promise<string[]> {
    console.log('[ReplayVisualizer] Starting Visual Replay with Chase Camera...');
    (window as any).__isReplaying = true;
    const savedFiles: string[] = [];

    try {
      this.vehicle.tuning.surfaceMode = 'dirt';
      // Reset vehicle to t=0 initial state (128 mph, 5th gear)
      this.vehicle.resetPosition();
      this.vehicle.chassisBody.setTranslation({ x: 0, y: 0.6593, z: -100 }, true);
      const initSpeedMs = this.rows[0].refSpeedMph * 0.44704;
      this.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
      (this.vehicle as any).currentGear = 5;
      const omega = initSpeedMs / this.vehicle.wheelRadius;
      for (let i = 0; i < 4; i++) {
        (this.vehicle as any).wheelAngularVel[i] = omega;
      }

    // Pre-settle physics for 15 frames
    for (let i = 0; i < 15; i++) {
      this.physics.step(1 / 120, (dt) => {
        this.vehicle.updatePhysicsSubstep(dt, {
          throttle: this.rows[0].throttle,
          brake: 0,
          steer: 0,
          handbrake: false,
          reset: false,
          drivetrainToggle: false,
          demoSkidpad: false,
          demoHandbrake: false,
        });
      });
    }

    this.vehicle.chassisBody.setLinvel({ x: 0, y: 0, z: initSpeedMs }, true);
    for (let i = 0; i < 4; i++) {
      (this.vehicle as any).wheelAngularVel[i] = omega;
    }

    // Initialize camera position behind car
    this.camera.update(this.vehicle, 0.05);

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (row.timeS > 4.6) break; // Capture up to 4.1s + small margin

      const inputs = {
        throttle: row.throttle,
        brake: row.brake,
        steer: row.steer,
        handbrake: row.handbrake,
        reset: false,
        drivetrainToggle: false,
        demoSkidpad: false,
        demoHandbrake: false,
      };

      // 120 Hz physics substepping for 1/30s frame
      this.physics.step(1 / 30, (dt) => {
        this.vehicle.updatePhysicsSubstep(dt, inputs);
      });

      // Update Visuals (30 FPS frame delta)
      this.vehicle.updateVisuals(inputs, 1 / 30);
      this.camera.update(this.vehicle, 1 / 30);

      if (this.vehicle.chassisMesh) {
        const carPos = this.vehicle.chassisMesh.position;
        this.sunLight.position.set(carPos.x + 40, carPos.y + 60, carPos.z - 30);
        this.sunLight.target.position.copy(carPos);
      }

      // Render Three.js frame
      this.renderer.render(this.scene, this.camera.camera);
      await new Promise((r) => requestAnimationFrame(r));

      // Check if we should capture screenshot
      for (const targetT of this.targetTimestamps) {
        if (!this.capturedTimestamps.has(targetT) && Math.abs(row.timeS - targetT) < 0.018) {
          this.capturedTimestamps.add(targetT);
          const dataUrl = this.renderer.domElement.toDataURL('image/png');
          const filename = `replay_t${targetT.toFixed(1).replace('.', '_')}.png`;

          const euler = new THREE.Euler().setFromQuaternion(this.vehicle.chassisMesh.quaternion, 'YXZ');
          const rollDeg = THREE.MathUtils.radToDeg(euler.z);
          const pitchDeg = THREE.MathUtils.radToDeg(euler.x);
          const currentHeight = this.vehicle.chassisMesh.position.y;
          const rideHeightChangeMm = (currentHeight - 0.6593) * 1000;
          const linv = this.vehicle.chassisBody.linvel();
          const speedMph = linv ? Math.hypot(linv.x, linv.z) * 2.23694 : 0;
          const slipDeg = this.vehicle.driftAngleDeg;

          const metric = {
            t: targetT,
            rollDeg: parseFloat(rollDeg.toFixed(2)),
            pitchDeg: parseFloat(pitchDeg.toFixed(2)),
            rideHeightChangeMm: parseFloat(rideHeightChangeMm.toFixed(1)),
            speedMph: parseFloat(speedMph.toFixed(1)),
            slipDeg: parseFloat(slipDeg.toFixed(1)),
          };

          console.log(`[ReplayVisualizer] t=${targetT.toFixed(1)}s: Roll=${metric.rollDeg}°, Pitch=${metric.pitchDeg}°, HeightΔ=${metric.rideHeightChangeMm}mm, Speed=${metric.speedMph}mph, Slip=${metric.slipDeg}°`);

          try {
            const resp = await fetch('/api/save-screenshot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filename, dataUrl, metric }),
            });
            const resJson = await resp.json();
            console.log(`[ReplayVisualizer] Captured t=${targetT.toFixed(1)}s -> ${resJson.path}`);
            savedFiles.push(resJson.path);

            if (Math.abs(targetT - 2.5) < 0.05) {
              const respBrake = await fetch('/api/save-screenshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: 'replay_t2_5_brakelights.png', dataUrl, metric }),
              });
              const resBrakeJson = await respBrake.json();
              console.log(`[ReplayVisualizer] Captured t=2.5s (brakelights) -> ${resBrakeJson.path}`);
              savedFiles.push(resBrakeJson.path);
            }
          } catch (e) {
            console.error(`Failed to save screenshot at t=${targetT}s`, e);
          }
        }
      }
    }

    console.log(`[ReplayVisualizer] Finished capturing ${savedFiles.length} replay screenshots.`);
    return savedFiles;
    } finally {
      (window as any).__isReplaying = false;
    }
  }
}
