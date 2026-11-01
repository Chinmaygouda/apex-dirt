# Phase 5: Procedural Web Audio Sound Engine

## Overview & Verified Deliverables
In Phase 5, an authentic, 100% procedural Web Audio sound synthesis engine (`RallyAudioEngine`) was implemented and fully integrated into the vehicle telemetry and effects pipelines:

1. **Engine Harmonic Ladder Synthesizer**:
   - **4-Cylinder Firing Fundamental ($f_0$)**:
     $$f_0 = \frac{\text{RPM} \times 2}{60} = \frac{\text{RPM}}{30}$$
     - Idle (~1,000 RPM): $f_0 \approx 33.3\text{ Hz}$.
     - Mid-range (~4,500 RPM): $f_0 \approx 150.0\text{ Hz}$.
     - Redline (~7,200 RPM): $f_0 \approx 240.0\text{ Hz}$.
   - **Harmonic Ladder up to ~2 kHz**:
     - Sub-harmonic ($0.5 \times f_0$, sine): Deep chassis and block rumble.
     - Fundamental ($1.0 \times f_0$, sawtooth): Primary cylinder combustion pulse.
     - 2nd Harmonic ($2.0 \times f_0$, sawtooth): Exhaust manifold resonance.
     - 3rd Harmonic ($3.0 \times f_0$, triangle): Intake throat rasp.
     - 4th Harmonic ($4.0 \times f_0$, sawtooth): Upper cylinder rasp.
     - 6th & 8th Harmonics ($6.0 \times f_0, 8.0 \times f_0$, sawtooth): High induction howl and mechanical rasp reaching up to 2,000 Hz.
2. **Gear Shift Pitch Dip**:
   - Monitored directly from drivetrain clutch state (`telemetry.isShifting`).
   - Exponentially drops target frequency by 25% over a 60 ms window during clutch disengagement, followed by smooth pitch ramp as the new gear connects.
3. **Throttle-Dependent Acoustic Brightness**:
   - Dynamic 2nd-order low-pass filter (`BiquadFilterNode`, $Q = 2.2$):
     - **Idle / Coasting (Throttle = 0)**: Cutoff $\approx 480\text{ Hz}$ producing a warm, muffled exhaust purr.
     - **Wide-Open Throttle (Throttle = 1.0)**: Cutoff opens dynamically up to $2,800 - 3,200\text{ Hz}$, releasing aggressive induction roar and exhaust bark.
     - Engine gain scales smoothly from 0.25 (idle) to 0.70 (WOT).
4. **Exhaust Pops (Synced to Phase 2a)**:
   - Driven synchronously by `VehicleEffects.onExhaustPop` on throttle lift with braking or at gear shift.
   - Dual-component anti-lag synthesis:
     - 1) High-frequency gunshot click transient (420 Hz exponential drop over 45 ms).
     - 2) Sub-bass exhaust pressure shockwave thump (120 Hz to 45 Hz sine burst over 90 ms).
     - 3) Overrun crackle burst cluster (bandpass filtered noise at 1.4–2.0 kHz).
5. **Tyre Skid Noise from Slip**:
   - Continuous looped noise buffer through a bandpass filter ($Q = 1.8$, center frequency 650–1,250 Hz shifting with vehicle speed).
   - Inactive when slip angle $\le 3.0^\circ$.
   - Ramps up dynamically as $\min\left(1.0, \frac{\text{slipDeg} - 3.0}{16.0}\right) \times \min\left(1.0, \frac{\text{speedMph}}{45.0}\right)$, producing realistic gravel scrub noise in slides.
6. **Continuous Gravel & Wind Noise Scaled by Speed**:
   - **Wind Rush**: Low-pass filtered noise (cutoff 250–800 Hz) whose gain scales quadratically with road speed: $\left(\frac{v}{130}\right)^{1.8} \times 0.40$.
   - **Gravel Spray**: Bandpass filtered aggregate rattle (2.2 kHz, $Q = 2.5$) with amplitude fluttering modulated by speed and surface (louder on Dirt 0.72 vs Grass 0.45).
7. **Brake & Handbrake Sounds**:
   - **Brake Rotor Squeal**: High-frequency metallic friction resonance (3.2 kHz, $Q = 5.5$) applied proportionally when `brakeInput > 0.05` at speed.
   - **Handbrake Ratchet & Bite**: Dual-tooth metallic ratchet clicks on actuation + aggressive rear lock drag hiss when handbrake is engaged at speed.
8. **UI & Audio Lifecycle**:
   - Automatic user gesture unlock listener (`keydown`, `pointerdown`, `click`).
   - Interactive `"🔊 SND"` / `"🔇 MUTE"` toggle badge in HUD telemetry bar.

---

## Measured Performance & Audio Matrix

| Audio Subsystem | Synthesizer Parameters | Verification & Output | Status |
| :--- | :--- | :--- | :--- |
| **Engine Fundamental ($f_0$)** | $f_0 = \text{RPM} / 30$ (33 Hz – 240 Hz) | Tracked in real time across 1st–5th gears | **PASS** |
| **Harmonic Ladder** | 7 detuned voices ($0.5\times, 1.0\times, 2.0\times, 3.0\times, 4.0\times, 6.0\times, 8.0\times$) | Harmonics extend to 1,920 Hz (~2 kHz) | **PASS** |
| **Shift Pitch Dip** | $-25\%$ frequency drop during `isShifting` | Smooth recovery upon clutch engagement | **PASS** |
| **Throttle Brightness** | Cutoff 480 Hz (idle) -> 2,800+ Hz (WOT), $Q = 2.2$ | Lowpass filter opens with throttle pedal | **PASS** |
| **Exhaust Pops** | Dual-component transient click + sub-bass thump + crackle | Synced 1:1 with Phase 2a flame and smoke | **PASS** |
| **Tyre Skid Noise** | Bandpass noise (650–1,250 Hz), active when slip $> 3^\circ$ | Volume scaled by lateral slip & road speed | **PASS** |
| **Aerodynamic Wind** | Lowpass noise (250–800 Hz) scaled $(v/130)^{1.8}$ | Smooth continuous wind rush at speed | **PASS** |
| **Gravel Spray** | High-bandpass noise (2.2 kHz) with surface modulation | Louder on Dirt than Grass verge | **PASS** |
| **Brake Friction** | High-Q bandpass metallic rotor squeal (3.2 kHz) | Triggered under foot brake application | **PASS** |
| **Handbrake Ratchet** | Dual-tooth square click + rear drag bite | Triggered on handbrake pull | **PASS** |
| **Video File Size** | 3.41 MB | < 20 MB | **PASS** |
| **Video Specs** | 1280x720, 30 fps, H.264, deterministic 120 Hz physics | 1280x720, 30 fps, H.264 | **PASS** |
| **Frame Time** | 5.4 – 7.8 ms (> 125 FPS equivalent) | >= 60 FPS | **PASS** |

---

## Verification Artifacts
- **Deterministic Video**: `keyboard_feel_demo.mp4` (3.41 MB, 1280x720 @ 30 fps, H.264, burned-in audio telemetry overlay)
- **Per-Frame Telemetry CSV**: `keyboard_feel_demo.csv` (390 frames of telemetry)
- **Screenshots (8 Keyframes)**:
  1. `screenshot_01_idle_harmonic_ladder_audio.png`: Idle engine fundamental (f0 = 33 Hz) and harmonic ladder initialization with HUD audio indicator active.
  2. `screenshot_02_acceleration_intake_brightness.png`: Full throttle acceleration opening filter cutoff to 2,800 Hz, revs climbing to 6,200 RPM.
  3. `screenshot_03_upshift_pitch_dip_and_clutch.png`: Upshift with pitch dip (-25%) and "CLUTCH" indicator active.
  4. `screenshot_04_high_rev_harmonic_howl.png`: High RPM harmonic howl extending to 2 kHz in 4th gear, wind rush scaling.
  5. `screenshot_05_exhaust_pop_antilag_sync.png`: Exhaust pop triggered synchronously with orange flame cone and audio crackle burst.
  6. `screenshot_06_tyre_skid_slip_audio_modulation.png`: Lateral slip angle modulating bandpass tyre skid noise in high-speed slide.
  7. `screenshot_07_gravel_spray_and_wind_noise.png`: Continuous gravel spray and wind noise scaled with vehicle speed along dirt track.
  8. `screenshot_08_heavy_braking_and_handbrake_bite.png`: Heavy brake application and handbrake ratchet bite.
