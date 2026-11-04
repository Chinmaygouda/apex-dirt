import * as THREE from 'three';

export type TimeOfDayPreset = 'NOON' | 'DUSK' | 'NIGHT';

/**
 * DayNightCycleController
 * Manages continuous 24-hour environmental lighting, sky, and atmospheric fog:
 * - Noon: Crisp mountain daylight with sharp shadows
 * - Dusk: Dramatic low-angle amber sunset and long shadows
 * - Night: Obsidian sky with cool moonlight and eerie forest fog (spotlights essential)
 */
export class DayNightCycleController {
  // Current time in 24-hour float format (e.g. 12.0 = noon, 18.5 = sunset, 23.0 = night)
  public timeHours = 14.0;
  public cycleSpeed = 0.05; // Game hours per real second (full 24h cycle ~ 8 minutes)
  public isPaused = false;

  private noonSky = new THREE.Color('#8FAEC9');
  private noonSunColor = new THREE.Color('#FFF8E7');
  private noonHemiSky = new THREE.Color('#4B6278');
  private noonHemiGround = new THREE.Color('#4D4742');

  private duskSky = new THREE.Color('#4a2840');
  private duskSunColor = new THREE.Color('#ff7733');
  private duskHemiSky = new THREE.Color('#38203c');
  private duskHemiGround = new THREE.Color('#221a1f');

  private nightSky = new THREE.Color('#090d16');
  private nightSunColor = new THREE.Color('#6482a6'); // Moonlight
  private nightHemiSky = new THREE.Color('#101726');
  private nightHemiGround = new THREE.Color('#05070a');

  private currentPreset: TimeOfDayPreset = 'NOON';

  constructor(
    private scene: THREE.Scene,
    private sunLight: THREE.DirectionalLight,
    private hemiLight: THREE.HemisphereLight
  ) {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'n' || e.key === 'N') {
        this.togglePreset();
      }
    });
  }

  public setPreset(preset: TimeOfDayPreset): void {
    this.currentPreset = preset;
    if (preset === 'NOON') this.timeHours = 12.5;
    else if (preset === 'DUSK') this.timeHours = 18.6;
    else if (preset === 'NIGHT') this.timeHours = 23.5;
    this.applyAtmosphere(0);
  }

  public togglePreset(): TimeOfDayPreset {
    if (this.currentPreset === 'NOON') {
      this.setPreset('DUSK');
    } else if (this.currentPreset === 'DUSK') {
      this.setPreset('NIGHT');
    } else {
      this.setPreset('NOON');
    }
    return this.currentPreset;
  }

  public update(dt: number, carPosition?: THREE.Vector3): void {
    if (!this.isPaused) {
      this.timeHours = (this.timeHours + this.cycleSpeed * dt) % 24.0;
    }
    this.applyAtmosphere(dt, carPosition);
  }

  private applyAtmosphere(dt: number, carPosition?: THREE.Vector3): void {
    const t = this.timeHours;

    // Calculate sun elevation angle: peak at 12:00 (pi/2), set at 18:30 (0), nadir at 00:00 (-pi/2)
    const sunAngle = ((t - 6.0) / 12.0) * Math.PI; // 0 at 6am, pi/2 at 12pm, pi at 6pm
    const sunElevation = Math.sin(sunAngle);

    // Sun / Moon orbital position
    const radius = 180;
    const sunX = Math.cos(sunAngle) * radius;
    const sunY = Math.max(15, Math.abs(sunElevation) * radius);
    const sunZ = -Math.sin(sunAngle * 0.5) * 60;

    const anchorX = carPosition ? carPosition.x : 0;
    const anchorY = carPosition ? carPosition.y : 0;
    const anchorZ = carPosition ? carPosition.z : 0;

    this.sunLight.position.set(anchorX + sunX, anchorY + sunY, anchorZ + sunZ);
    if (carPosition) {
      this.sunLight.target.position.copy(carPosition);
    }

    // Blend between Noon, Dusk, and Night
    let targetSky = this.noonSky;
    let targetSunColor = this.noonSunColor;
    let targetHemiSky = this.noonHemiSky;
    let targetHemiGround = this.noonHemiGround;
    let sunIntensity = 2.2;
    let hemiIntensity = 0.85;
    let fogDensity = 0.0018;

    if (t >= 11.0 && t <= 16.5) {
      // Crisp daylight
      targetSky = this.noonSky;
      targetSunColor = this.noonSunColor;
      targetHemiSky = this.noonHemiSky;
      targetHemiGround = this.noonHemiGround;
      sunIntensity = 2.2;
      hemiIntensity = 0.85;
      fogDensity = 0.0018;
    } else if (t > 16.5 && t <= 20.0) {
      // Sunset / Dusk
      const blend = (t - 16.5) / 3.5;
      targetSky = this.noonSky.clone().lerp(this.duskSky, blend);
      targetSunColor = this.noonSunColor.clone().lerp(this.duskSunColor, blend);
      targetHemiSky = this.noonHemiSky.clone().lerp(this.duskHemiSky, blend);
      targetHemiGround = this.noonHemiGround.clone().lerp(this.duskHemiGround, blend);
      sunIntensity = THREE.MathUtils.lerp(2.2, 0.9, blend);
      hemiIntensity = THREE.MathUtils.lerp(0.85, 0.40, blend);
      fogDensity = THREE.MathUtils.lerp(0.0018, 0.0024, blend);
    } else if (t > 20.0 && t <= 21.5) {
      // Twilight -> Night
      const blend = (t - 20.0) / 1.5;
      targetSky = this.duskSky.clone().lerp(this.nightSky, blend);
      targetSunColor = this.duskSunColor.clone().lerp(this.nightSunColor, blend);
      targetHemiSky = this.duskHemiSky.clone().lerp(this.nightHemiSky, blend);
      targetHemiGround = this.duskHemiGround.clone().lerp(this.nightHemiGround, blend);
      sunIntensity = THREE.MathUtils.lerp(0.9, 0.15, blend);
      hemiIntensity = THREE.MathUtils.lerp(0.40, 0.12, blend);
      fogDensity = THREE.MathUtils.lerp(0.0024, 0.0028, blend);
    } else if (t > 21.5 || t < 5.0) {
      // Midnight / Nocturnal
      targetSky = this.nightSky;
      targetSunColor = this.nightSunColor;
      targetHemiSky = this.nightHemiSky;
      targetHemiGround = this.nightHemiGround;
      sunIntensity = 0.15; // Soft moonlight
      hemiIntensity = 0.12;
      fogDensity = 0.0028;
    } else {
      // Dawn / Sunrise (5.0 to 11.0)
      const blend = (t - 5.0) / 6.0;
      targetSky = this.nightSky.clone().lerp(this.noonSky, blend);
      targetSunColor = this.duskSunColor.clone().lerp(this.noonSunColor, blend);
      targetHemiSky = this.nightHemiSky.clone().lerp(this.noonHemiSky, blend);
      targetHemiGround = this.nightHemiGround.clone().lerp(this.noonHemiGround, blend);
      sunIntensity = THREE.MathUtils.lerp(0.15, 2.2, blend);
      hemiIntensity = THREE.MathUtils.lerp(0.12, 0.85, blend);
      fogDensity = THREE.MathUtils.lerp(0.0028, 0.0018, blend);
    }

    // Apply to scene
    (this.scene.background as THREE.Color).copy(targetSky);
    if (this.scene.fog && (this.scene.fog as THREE.FogExp2).isFogExp2) {
      const fog = this.scene.fog as THREE.FogExp2;
      fog.color.copy(targetSky);
      fog.density = fogDensity;
    }

    this.sunLight.color.copy(targetSunColor);
    this.sunLight.intensity = sunIntensity;

    this.hemiLight.color.copy(targetHemiSky);
    this.hemiLight.groundColor.copy(targetHemiGround);
    this.hemiLight.intensity = hemiIntensity;
  }
}
