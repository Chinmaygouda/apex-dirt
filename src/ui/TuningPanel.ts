import GUI from 'lil-gui';
import { CustomRallyVehicle } from '../vehicles/CustomRallyVehicle';
import { ChaseCamera } from '../core/ChaseCamera';

export class TuningPanel {
  public gui: GUI;

  constructor(
    private vehicle: CustomRallyVehicle,
    private camera: ChaseCamera,
    private onRunSkidpadTest?: () => void,
    private onRunHandbrakeTest?: () => void,
    private onToggleDebugOverlays?: (show: boolean) => void
  ) {
    this.gui = new GUI({ title: 'Apex Dirt - Vehicle Physics Tuner' });
    this.gui.open();
    this.setupControls();
  }

  private setupControls(): void {
    const tuning = this.vehicle.tuning;

    // 0. Debug Overlays Toggle (Hotkey [O])
    this.gui.add(tuning, 'showDebugOverlays')
      .name('📊 Show Debug Overlays [O]')
      .listen()
      .onChange((show: boolean) => {
        if (this.onToggleDebugOverlays) this.onToggleDebugOverlays(show);
      });

    // 1. V1 Powertrain - Engine & Turbo Curve
    const engineFolder = this.gui.addFolder('V1 Engine & Turbo Curve');
    engineFolder.add(tuning, 'engineTorqueMax', 1200, 4800, 50).name('Max Torque (Nm)');
    engineFolder.add(tuning, 'turboSpoolFactor', 0.2, 0.9, 0.05).name('Off-Boost Spool Factor');
    engineFolder.add(tuning, 'idleRpm', 700, 1500, 50).name('Idle RPM');
    engineFolder.add(tuning, 'peakTorqueRpmMin', 2000, 4200, 100).name('Boost Peak Start (RPM)');
    engineFolder.add(tuning, 'peakTorqueRpmMax', 4500, 6800, 100).name('Boost Peak End (RPM)');
    engineFolder.add(tuning, 'redlineRpm', 6000, 8000, 100).name('Redline (RPM)');
    engineFolder.add(tuning, 'revLimiterRpm', 6500, 8500, 100).name('Rev Limiter Cut (RPM)');

    // 2. V1 Powertrain - Transmission & Gearing
    const gearFolder = this.gui.addFolder('V1 Transmission & Gearing');
    gearFolder.add(tuning, 'isRwd').name('RWD Default (Off = AWD)').listen();
    gearFolder.add(tuning, 'gear1Ratio', 2.0, 4.5, 0.05).name('1st Gear Ratio');
    gearFolder.add(tuning, 'gear2Ratio', 1.4, 3.0, 0.05).name('2nd Gear Ratio');
    gearFolder.add(tuning, 'gear3Ratio', 1.0, 2.2, 0.05).name('3rd Gear Ratio');
    gearFolder.add(tuning, 'gear4Ratio', 0.8, 1.6, 0.05).name('4th Gear Ratio');
    gearFolder.add(tuning, 'gear5Ratio', 0.6, 1.2, 0.05).name('5th Gear Ratio');
    gearFolder.add(tuning, 'finalDriveRatio', 2.5, 5.0, 0.05).name('Final Drive Ratio');
    gearFolder.add(tuning, 'shiftUpRpm', 5500, 7500, 50).name('Shift Up RPM');
    gearFolder.add(tuning, 'shiftDownRpm', 2500, 4500, 50).name('Shift Down RPM');
    gearFolder.add(tuning, 'shiftTimeMs', 0, 400, 10).name('Shift Time (ms)');
    gearFolder.add(tuning, 'clutchBiteSpeedMph', 3.0, 25.0, 0.5).name('Clutch Bite Spd (mph)');
    gearFolder.add(tuning, 'launchTorqueSmoothing').name('Launch Traction Smoothing');

    // 3. Aerodynamics & Drag
    const aeroFolder = this.gui.addFolder('Aerodynamics & Drag');
    aeroFolder.add(tuning, 'aeroDragCdA', 0.3, 1.5, 0.02).name('Aero Drag CdA (m²)');
    aeroFolder.add(tuning, 'downforceCLA', 0.0, 1.2, 0.02).name('Downforce CLA (m²)');
    aeroFolder.add(tuning, 'rollingResistanceCoeff', 0.0, 0.15, 0.005).name('Rolling Resist Coeff');

    // 4. Per-Surface Grip Multipliers
    const surfaceFolder = this.gui.addFolder('Surface Grip Multipliers');
    surfaceFolder.add(tuning, 'surfaceMode', ['dirt', 'tarmac', 'gravel', 'grass', 'auto']).name('Active Surface');
    surfaceFolder.add(tuning, 'gripMultiplierDirt', 0.3, 1.2, 0.01).name('Dirt Grip Mult');
    surfaceFolder.add(tuning, 'gripMultiplierGravel', 0.3, 1.2, 0.01).name('Gravel Grip Mult');
    surfaceFolder.add(tuning, 'gripMultiplierGrass', 0.2, 1.0, 0.01).name('Grass Grip Mult');
    surfaceFolder.add(tuning, 'gripMultiplierTarmac', 0.5, 1.5, 0.01).name('Tarmac Grip Mult');

    // 5. Custom Tyre Model & Friction Ellipse
    const tyreFolder = this.gui.addFolder('Tyre Model & Load Sensitivity');
    tyreFolder.add(tuning, 'baseFrictionMu', 0.8, 2.2, 0.05).name('Base Grip (μ₀)');
    tyreFolder.add(tuning, 'driveGripScale', 0.5, 2.5, 0.05).name('Drive Grip Scale');
    tyreFolder.add(tuning, 'brakeGripScale', 1.0, 3.5, 0.05).name('Brake Grip Scale');
    tyreFolder.add(tuning, 'loadSensitivityK', 0.00001, 0.00025, 0.00001).name('Load Sensitivity (k)');
    tyreFolder.add(tuning, 'loadFrictionMinClamp', 0.15, 0.85, 0.02).name('Min Grip Clamp (μ_min)');
    tyreFolder.add(tuning, 'slipOptLong', 0.05, 0.25, 0.01).name('Opt Long Slip (s₀)');
    tyreFolder.add(tuning, 'slipOptLatDeg', 4.0, 16.0, 0.5).name('Opt Slip Angle (α₀)');

    // 5b. V3 Slide Scrub & Soil Plowing
    const scrubFolder = this.gui.addFolder('V3 Slide Scrub & Soil Plowing');
    scrubFolder.add(tuning, 'enableSlideScrub').name('Enable Slide Scrub');
    scrubFolder.add(tuning, 'slideScrubMuMax', 0.0, 1.2, 0.02).name('Peak Berm Drag (μ)');
    scrubFolder.add(tuning, 'slideScrubMinSlipDeg', 2.0, 20.0, 0.5).name('Min Slip Angle (Deg)');
    scrubFolder.add(tuning, 'slideScrubMaxSlipDeg', 20.0, 50.0, 1.0).name('Max Berm Angle (Deg)');

    // 6. Steering & Brakes (V2)
    const controlFolder = this.gui.addFolder('Steering & Brakes (V2)');
    controlFolder.add(tuning, 'maxSteerAngleDeg', 18, 42, 1).name('Max Steer (Deg)');
    controlFolder.add(tuning, 'brakeTorqueMax', 1000, 12000, 100).name('Total Brake Torque (Nm)');
    controlFolder.add(tuning, 'brakeBiasFront', 0.45, 0.85, 0.01).name('Front Brake Bias');
    controlFolder.add(tuning, 'engineBrakeTorque', 0, 1200, 50).name('Engine Brake (Nm)');
    controlFolder.add(tuning, 'handbrakeTorque', 1000, 5000, 100).name('Handbrake Torque');
    controlFolder.add(tuning, 'handbrakeSlipCap', 0.2, 0.85, 0.02).name('Handbrake Slip Cap');
    controlFolder.add(tuning, 'handbrakeRearGripScale', 0.15, 0.8, 0.05).name('Handbrake Grip Scale');
    controlFolder.add(tuning, 'driftEntryAngleDeg', 6.0, 20.0, 0.5).name('Drift Entry Angle');
    controlFolder.add(tuning, 'driftExitAngleDeg', 2.0, 10.0, 0.5).name('Drift Exit Angle');
    controlFolder.add(tuning, 'counterSteerAssistGain', 0.0, 1.0, 0.05).name('Counter-Steer Assist');
    controlFolder.add(tuning, 'reverseEngageDelay', 0.0, 1.5, 0.05).name('Reverse Delay (s)');

    // 7. Suspension & Anti-Roll
    const suspFolder = this.gui.addFolder('Suspension & Body Motion (V5)');
    suspFolder.add(tuning, 'springStiffness', 15000, 75000, 1000).name('Spring Rate (N/m)');
    suspFolder.add(tuning, 'damperCompression', 1000, 8000, 100).name('Compression Damping');
    suspFolder.add(tuning, 'damperRebound', 1000, 8000, 100).name('Rebound Damping');
    suspFolder.add(tuning, 'antiRollBarStiffness', 0, 25000, 500).name('Anti-Roll Bar (N/m)');
    suspFolder.add(tuning, 'suspensionRestLength', 0.25, 0.6, 0.02).name('Rest Length (m)');
    suspFolder.add(tuning, 'bodyMotionExaggeration', 0.0, 2.5, 0.05).name('Body Motion Exag');
    suspFolder.add(tuning, 'visualDiveScale', 0.0, 3.5, 0.1).name('Brake Dive Scale (°/G)');
    suspFolder.add(tuning, 'visualSquatScale', 0.0, 3.5, 0.1).name('Accel Squat Scale (°/G)');
    suspFolder.add(tuning, 'visualRollScale', 0.0, 6.0, 0.1).name('Body Roll Scale (°/G)');
    suspFolder.add(tuning, 'visualDroopExtension', 0.0, 0.20, 0.01).name('Wheel Droop (m)');

    // 8. Chase Camera
    const camFolder = this.gui.addFolder('Chase Camera');
    camFolder.add(this.camera, 'followDistance', 4.0, 12.0, 0.2).name('Follow Distance');
    camFolder.add(this.camera, 'followHeight', 1.0, 5.0, 0.1).name('Follow Height');
    camFolder.add(this.camera, 'cameraLag', 0.01, 0.25, 0.01).name('Camera Lag');
    camFolder.add(this.camera, 'baseFov', 45, 75, 1).name('Base FOV');
    camFolder.add(this.camera, 'maxSpeedFov', 65, 95, 1).name('Max Speed FOV');

    // 9. Actions
    const actions = {
      testSkidpad: () => {
        if (this.onRunSkidpadTest) this.onRunSkidpadTest();
      },
      testHandbrake: () => {
        if (this.onRunHandbrakeTest) this.onRunHandbrakeTest();
      },
      resetCar: () => this.vehicle.resetPosition(),
      toggleRwdAwd: () => {
        tuning.isRwd = !tuning.isRwd;
      },
    };
    this.gui.add(actions, 'testSkidpad').name('🏎 Run Skid Pad Drift');
    this.gui.add(actions, 'testHandbrake').name('🅿 Run Handbrake Turn');
    this.gui.add(actions, 'resetCar').name('↺ Reset Vehicle (R)');
    this.gui.add(actions, 'toggleRwdAwd').name('⇄ Toggle RWD/AWD (T)');
  }
}
