import * as THREE from 'three';

/**
 * Procedural Canvas Texture Generator for Apex Rally.
 * Generates all photorealistic rally surfaces, roadside signage, and particle VFX sprites
 * directly in memory without requiring external network downloads.
 */
export class ProceduralTextures {
  private static cache: Map<string, THREE.Texture> = new Map();

  // Helper to create and setup a CanvasTexture (or DataTexture in Node headless environments)
  private static makeTexture(name: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    if (typeof document === 'undefined') {
      // Headless Node environment: construct 16x16 dummy DataTexture
      const size = 16;
      const data = new Uint8Array(size * size * 4);
      data.fill(180);
      const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.needsUpdate = true;
      this.cache.set(name, texture);
      return texture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    draw(ctx, width, height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.cache.set(name, texture);
    return texture;
  }

  /**
   * Zone 1: Sun-faded asphalt with cracked aggregate and tar patches
   */
  public static getAsphaltTexture(): THREE.Texture {
    return this.makeTexture('asphalt', 512, 512, (ctx, w, h) => {
      // Base dark weathered gray
      ctx.fillStyle = '#3a3837';
      ctx.fillRect(0, 0, w, h);

      // Micro aggregate speckling
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 45;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);

      // Bitumen tar crack veins
      ctx.strokeStyle = '#181716';
      ctx.lineWidth = 1.8;
      for (let c = 0; c < 6; c++) {
        ctx.beginPath();
        let cx = Math.random() * w;
        let cy = Math.random() * h;
        ctx.moveTo(cx, cy);
        for (let seg = 0; seg < 5; seg++) {
          cx += (Math.random() - 0.5) * 80;
          cy += (Math.random() - 0.5) * 80;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }

      // Tar patches (darker smoothed puddles of repair bitumen)
      ctx.fillStyle = 'rgba(20, 20, 20, 0.4)';
      for (let p = 0; p < 4; p++) {
        ctx.beginPath();
        const px = Math.random() * w;
        const py = Math.random() * h;
        ctx.ellipse(px, py, 20 + Math.random() * 35, 10 + Math.random() * 20, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  /**
   * Zone 2: Packed coarse rally gravel with twin polished tire wear ruts
   */
  public static getGravelTexture(): THREE.Texture {
    return this.makeTexture('gravel', 512, 512, (ctx, w, h) => {
      // Base warm terracotta gravel
      ctx.fillStyle = '#786754';
      ctx.fillRect(0, 0, w, h);

      // Gravel pebble texture
      for (let i = 0; i < 2200; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const rad = 1 + Math.random() * 3.5;
        const shade = Math.random() > 0.5 ? '#94836f' : '#574838';
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Twin polished tire ruts (longitudinal dark compacted grooves)
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0.0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.2, 'rgba(45,35,25,0.4)'); // Left wheel rut
      grad.addColorStop(0.35, 'rgba(0,0,0,0)');
      grad.addColorStop(0.65, 'rgba(45,35,25,0.4)'); // Right wheel rut
      grad.addColorStop(0.8, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    });
  }

  /**
   * Zone 3: Fine loose dust and mountain scree over limestone bedrock
   */
  public static getScreeTexture(): THREE.Texture {
    return this.makeTexture('scree', 512, 512, (ctx, w, h) => {
      // Pale limestone and dust
      ctx.fillStyle = '#a69986';
      ctx.fillRect(0, 0, w, h);

      // Chalky dust noise
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const n = (Math.random() - 0.5) * 50;
        data[i] = Math.min(255, Math.max(0, data[i] + n));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
      }
      ctx.putImageData(imgData, 0, 0);

      // Loose shattered scree fragments
      ctx.fillStyle = '#63594e';
      for (let s = 0; s < 1200; s++) {
        const sx = Math.random() * w;
        const sy = Math.random() * h;
        ctx.fillRect(sx, sy, 2 + Math.random() * 4, 1 + Math.random() * 3);
      }
    });
  }

  /**
   * Mediterranean Terracotta Hillside Soil & Rock
   */
  public static getTerracottaTerrainTexture(): THREE.Texture {
    return this.makeTexture('terracotta_terrain', 512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#8c5338'; // Sun-baked Tuscan clay
      ctx.fillRect(0, 0, w, h);

      // Multi-tonal soil variation
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(110, 55, 30, 0.3)' : 'rgba(165, 110, 70, 0.25)';
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 0, Math.PI * 2);
        ctx.fill();
      }

      // Dried mud micro-crevices
      ctx.strokeStyle = 'rgba(60, 30, 15, 0.4)';
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 12; k++) {
        ctx.beginPath();
        let kx = Math.random() * w;
        let ky = Math.random() * h;
        ctx.moveTo(kx, ky);
        for (let seg = 0; seg < 6; seg++) {
          kx += (Math.random() - 0.5) * 60;
          ky += (Math.random() - 0.5) * 60;
          ctx.lineTo(kx, ky);
        }
        ctx.stroke();
      }
    });
  }

  /**
   * Red-and-White Striped Apex Kerb Texture
   */
  public static getKerbTexture(): THREE.Texture {
    return this.makeTexture('kerb', 256, 64, (ctx, w, h) => {
      const stripes = 8;
      const stripeW = w / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#d42211' : '#f0f0f0';
        ctx.fillRect(i * stripeW, 0, stripeW, h);
      }
      // Road grit / tire scuff marks along inner edge
      ctx.fillStyle = 'rgba(20, 20, 20, 0.35)';
      ctx.fillRect(0, h * 0.75, w, h * 0.25);
    });
  }

  /**
   * Corner Chevron Indicator Arrow Signboard
   */
  public static getChevronTexture(): THREE.Texture {
    return this.makeTexture('chevron', 256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#f5c800'; // High-vis rally yellow
      ctx.fillRect(0, 0, w, h);

      // Black directional chevrons >>
      ctx.fillStyle = '#111111';
      for (let off = 30; off < w; off += 75) {
        ctx.beginPath();
        ctx.moveTo(off, 15);
        ctx.lineTo(off + 40, h / 2);
        ctx.lineTo(off, h - 15);
        ctx.lineTo(off + 25, h - 15);
        ctx.lineTo(off + 65, h / 2);
        ctx.lineTo(off + 25, 15);
        ctx.closePath();
        ctx.fill();
      }
    });
  }

  /**
   * "APEX RALLY" Starting Gantry Banner
   */
  public static getGantryBannerTexture(): THREE.Texture {
    return this.makeTexture('gantry_banner', 512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#ff5500'; // Saturated rally orange
      ctx.fillRect(0, 0, w, h);

      // Contrast racing bands
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, w, 18);
      ctx.fillRect(0, h - 18, w, 18);

      // Title lettering
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 52px "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('APEX RALLY', w / 2, h / 2);
    });
  }

  /**
   * Finish Timing Arch Banner with Checkered Border
   */
  public static getFinishArchBannerTexture(): THREE.Texture {
    return this.makeTexture('finish_arch', 512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, w, h);

      // Checkered top and bottom margins
      const checkSize = 16;
      for (let x = 0; x < w; x += checkSize) {
        for (let row = 0; row < 2; row++) {
          const isWhite = ((x / checkSize) + row) % 2 === 0;
          ctx.fillStyle = isWhite ? '#ffffff' : '#000000';
          ctx.fillRect(x, row * checkSize, checkSize, checkSize);
          ctx.fillRect(x, h - 32 + row * checkSize, checkSize, checkSize);
        }
      }

      ctx.fillStyle = '#00ffcc';
      ctx.font = 'bold 44px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FINISH / STAGE TIMING', w / 2, h / 2);
    });
  }

  /**
   * Volumetric Soft Dust Cloud Sprite (Multi-Lobed Billowy Puff)
   */
  public static getDustCloudSprite(): THREE.Texture {
    return this.makeTexture('vfx_dust_cloud', 128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;

      // Draw multi-lobed organic cloud puffs for realistic billowy volume
      const lobes = [
        { x: cx, y: cy, r: 42, alpha: 0.9 },
        { x: cx - 14, y: cy - 10, r: 32, alpha: 0.75 },
        { x: cx + 16, y: cy - 8, r: 34, alpha: 0.75 },
        { x: cx - 12, y: cy + 12, r: 30, alpha: 0.7 },
        { x: cx + 14, y: cy + 14, r: 32, alpha: 0.7 },
        { x: cx, y: cy - 18, r: 28, alpha: 0.65 }
      ];

      for (const lobe of lobes) {
        const grad = ctx.createRadialGradient(lobe.x, lobe.y, 0, lobe.x, lobe.y, lobe.r);
        grad.addColorStop(0.0, `rgba(255, 255, 255, ${lobe.alpha})`);
        grad.addColorStop(0.35, `rgba(245, 235, 220, ${lobe.alpha * 0.7})`);
        grad.addColorStop(0.7, `rgba(230, 215, 195, ${lobe.alpha * 0.25})`);
        grad.addColorStop(1.0, 'rgba(215, 195, 175, 0.0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lobe.x, lobe.y, lobe.r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  /**
   * Sunlit Atmospheric Dust Mote Sprite
   */
  public static getDustMoteSprite(): THREE.Texture {
    return this.makeTexture('vfx_dust_mote', 32, 32, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const rad = w / 2;
      const grad = ctx.createRadialGradient(rad, rad, 0, rad, rad, rad);
      grad.addColorStop(0.0, 'rgba(255, 245, 215, 1.0)');
      grad.addColorStop(0.3, 'rgba(255, 220, 160, 0.8)');
      grad.addColorStop(0.7, 'rgba(235, 180, 110, 0.3)');
      grad.addColorStop(1.0, 'rgba(200, 140, 80, 0.0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(rad, rad, rad, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  public static getPebbleSprite(): THREE.Texture {
    return this.makeTexture('vfx_pebble', 32, 32, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#e8dcc8';
      ctx.beginPath();
      // Irregular rock silhouette
      ctx.moveTo(16, 4);
      ctx.lineTo(28, 12);
      ctx.lineTo(24, 26);
      ctx.lineTo(10, 28);
      ctx.lineTo(4, 16);
      ctx.closePath();
      ctx.fill();
    });
  }

  public static getSmokeSprite(): THREE.Texture {
    return this.makeTexture('vfx_smoke', 128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const rad = w / 2;
      const grad = ctx.createRadialGradient(rad, rad, 0, rad, rad, rad);
      grad.addColorStop(0.0, 'rgba(240, 240, 245, 0.85)');
      grad.addColorStop(0.4, 'rgba(220, 220, 225, 0.45)');
      grad.addColorStop(0.8, 'rgba(190, 190, 200, 0.12)');
      grad.addColorStop(1.0, 'rgba(180, 180, 190, 0.0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(rad, rad, rad, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  public static getWaterSplashSprite(): THREE.Texture {
    return this.makeTexture('vfx_water_splash', 64, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0.0, 'rgba(230, 245, 255, 0.95)');
      grad.addColorStop(0.4, 'rgba(180, 220, 250, 0.6)');
      grad.addColorStop(1.0, 'rgba(140, 190, 230, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(32, 32, 10, 30, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  public static getFlameSprite(): THREE.Texture {
    return this.makeTexture('vfx_flame', 64, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(w / 2, h, w / 2, 0);
      grad.addColorStop(0.0, 'rgba(0, 240, 255, 0.95)'); // Cyan intense heat core
      grad.addColorStop(0.2, 'rgba(255, 170, 0, 0.9)');  // Golden orange
      grad.addColorStop(0.7, 'rgba(255, 34, 0, 0.6)');   // Fiery red
      grad.addColorStop(1.0, 'rgba(180, 0, 0, 0.0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 12, h);
      ctx.quadraticCurveTo(w / 2 - 20, h * 0.4, w / 2, 0);
      ctx.quadraticCurveTo(w / 2 + 20, h * 0.4, w / 2 + 12, h);
      ctx.closePath();
      ctx.fill();
    });
  }

  public static getSparkSprite(): THREE.Texture {
    return this.makeTexture('vfx_spark', 32, 32, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.25, 'rgba(255, 200, 50, 0.9)');
      grad.addColorStop(0.7, 'rgba(255, 60, 0, 0.4)');
      grad.addColorStop(1.0, 'rgba(255, 0, 0, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(16, 16, 16, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  public static getSkidMarkTexture(): THREE.Texture {
    return this.makeTexture('vfx_skid_mark', 64, 256, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.fillRect(0, 0, w, h);

      // Twin longitudinal tire rubber grooves
      ctx.fillStyle = '#111111';
      ctx.fillRect(8, 0, 18, h);
      ctx.fillRect(38, 0, 18, h);

      // Cross tread sipes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let y = 0; y < h; y += 12) {
        ctx.fillRect(8, y, 18, 3);
        ctx.fillRect(38, y, 18, 3);
      }
    });
  }
}

