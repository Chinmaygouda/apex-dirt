import * as THREE from 'three';

export class AtmospherePipeline {
  public scene: THREE.Scene;
  public renderer: THREE.WebGLRenderer;
  public camera: THREE.PerspectiveCamera;

  public sunLight!: THREE.DirectionalLight;
  public hemiLight!: THREE.HemisphereLight;
  public skyDome!: THREE.Mesh;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
  }

  public init(): void {
    // 1. Configure Renderer Post-Processing & Tone Mapping
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Golden Hour Sun Light (22° altitude, warm golden-orange #FFF3D6, intensity 3.2)
    this.sunLight = new THREE.DirectionalLight(0xfff3d6, 3.2);
    // Vector pointing from South-West at 22° elevation
    this.sunLight.position.set(-350, 240, -420);
    this.sunLight.castShadow = true;

    // High quality shadow map frustum (140m view distance coverage around vehicle)
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 800;
    const shadowD = 140;
    this.sunLight.shadow.camera.left = -shadowD;
    this.sunLight.shadow.camera.right = shadowD;
    this.sunLight.shadow.camera.top = shadowD;
    this.sunLight.shadow.camera.bottom = -shadowD;
    this.sunLight.shadow.bias = -0.00035;

    this.scene.add(this.sunLight);

    // 3. Hemisphere Ambient Fill (Alpine blue sky zenith #4A6D94 to warm terracotta earth #5C4433)
    this.hemiLight = new THREE.HemisphereLight(0x4a6d94, 0x5c4433, 0.85);
    this.scene.add(this.hemiLight);

    // 4. Exponential Squared Depth Fog (Golden dust haze in mountain pockets)
    this.scene.fog = new THREE.FogExp2(0xd4a373, 0.00075);

    // 5. Rayleigh Scattering Sky Dome
    this.buildSkyDome();
  }

  /**
   * Rayleigh scattering sky dome with soft blue zenith transitioning to golden peach horizon
   */
  private buildSkyDome(): void {
    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec3 vWorldPosition;
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 sunPosition;
      uniform vec3 sunColor;

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = dir.y;
        
        // Atmosphere gradient
        vec3 sky = mix(bottomColor, topColor, max(pow(max(h, 0.0), 0.6), 0.0));
        
        // Sun glare disk
        float sunDot = max(dot(dir, normalize(sunPosition)), 0.0);
        float sunDisk = pow(sunDot, 64.0) * 1.5;
        float sunGlow = pow(sunDot, 8.0) * 0.45;
        
        vec3 finalColor = sky + (sunColor * (sunDisk + sunGlow));
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const uniforms = {
      topColor: { value: new THREE.Color(0x385273) },    // Alpine Zenith Blue
      bottomColor: { value: new THREE.Color(0xe8a87c) }, // Golden Horizon Twilight
      sunPosition: { value: this.sunLight.position.clone().normalize() },
      sunColor: { value: new THREE.Color(0xfff8eb) }
    };

    const skyGeo = new THREE.SphereGeometry(1200, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      side: THREE.BackSide,
      depthWrite: false
    });

    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);
  }

  /**
   * Updates sun shadow frustum to follow vehicle position
   */
  public update(targetPosition: THREE.Vector3): void {
    // Keep directional light target centered on player
    this.sunLight.target.position.copy(targetPosition);
    this.sunLight.target.updateMatrixWorld();

    // Center sky dome on camera
    if (this.skyDome) {
      this.skyDome.position.copy(this.camera.position);
    }
  }
}

