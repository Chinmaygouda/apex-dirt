import * as THREE from 'three';

export class HeadlightController {
  public isOn = false;
  private spotLeft: THREE.SpotLight;
  private spotRight: THREE.SpotLight;
  private targetLeft = new THREE.Object3D();
  private targetRight = new THREE.Object3D();
  private lensLenses: THREE.Mesh[] = [];

  constructor(private carGroup: THREE.Group, private scene: THREE.Scene) {
    // 1. Dual High-Intensity Spotlights
    // Mounted at front fascia (x = +-0.55, y = 0.24, z = 2.12)
    const lightColor = 0xfffaed; // Crisp rally warm white

    this.spotLeft = new THREE.SpotLight(lightColor, 0, 85, Math.PI / 4.5, 0.45, 1.2);
    this.spotLeft.position.set(-0.55, 0.24, 2.12);
    this.spotLeft.castShadow = true;
    this.spotLeft.shadow.mapSize.width = 1024;
    this.spotLeft.shadow.mapSize.height = 1024;
    this.spotLeft.shadow.bias = -0.001;

    this.spotRight = new THREE.SpotLight(lightColor, 0, 85, Math.PI / 4.5, 0.45, 1.2);
    this.spotRight.position.set(0.55, 0.24, 2.12);
    this.spotRight.castShadow = true;
    this.spotRight.shadow.mapSize.width = 1024;
    this.spotRight.shadow.mapSize.height = 1024;
    this.spotRight.shadow.bias = -0.001;

    // Targets projecting ~60m forward and slightly down onto road surface
    this.targetLeft.position.set(-0.35, -0.4, 60.0);
    this.targetRight.position.set(0.35, -0.4, 60.0);

    this.carGroup.add(this.spotLeft);
    this.carGroup.add(this.spotRight);
    this.carGroup.add(this.targetLeft);
    this.carGroup.add(this.targetRight);

    this.spotLeft.target = this.targetLeft;
    this.spotRight.target = this.targetRight;

    // Headlamp glowing lens facets
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfffaed,
      emissiveIntensity: 0.0,
      roughness: 0.1,
    });

    for (const lx of [-0.55, 0.55]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.02), lensMat);
      lens.position.set(lx, 0.24, 2.15);
      this.carGroup.add(lens);
      this.lensLenses.push(lens);
    }
  }

  public toggle(): boolean {
    this.isOn = !this.isOn;
    this.applyState();
    return this.isOn;
  }

  public setHeadlights(on: boolean): void {
    this.isOn = on;
    this.applyState();
  }

  private applyState(): void {
    const intensity = this.isOn ? 16.0 : 0.0;
    this.spotLeft.intensity = intensity;
    this.spotRight.intensity = intensity;

    const emissive = this.isOn ? 2.5 : 0.1;
    for (const lens of this.lensLenses) {
      (lens.material as THREE.MeshStandardMaterial).emissiveIntensity = emissive;
    }
  }
}
