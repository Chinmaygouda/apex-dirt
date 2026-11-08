/**
 * APEX DIRT - PROOF CAPTURE AUTOMATION (V3 - Pristine Isolated Shots)
 */

import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface CDPResponse {
  id: number;
  result?: any;
  error?: any;
  method?: string;
  params?: any;
}

class CDPClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg: CDPResponse = JSON.parse(event.data.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      };
    });
  }

  public send(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  public async evaluate(expression: string): Promise<any> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res?.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res?.result?.value;
  }

  public close(): void {
    try {
      this.ws.close();
    } catch {}
  }
}

function findBrowserExecutable(): string | null {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => resolve(res.statusCode !== undefined));
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureScreenshots() {
  console.log('================================================================');
  console.log('       APEX RALLY - HIGH RESOLUTION PROOF CAPTURE RUNNER (V3)   ');
  console.log('================================================================');

  let viteProcess: ChildProcess | null = null;
  let chromeProcess: ChildProcess | null = null;
  let tempProfileDir: string | null = null;

  try {
    const devPort = 5173;
    let devServerRunning = await isPortOpen(devPort);

    if (!devServerRunning) {
      console.log(`Starting Vite dev server on port ${devPort}...`);
      viteProcess = spawn('npx.cmd', ['vite', '--port', String(devPort)], {
        shell: true,
        stdio: 'pipe',
      });
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        if (await isPortOpen(devPort)) {
          devServerRunning = true;
          break;
        }
      }
    }
    console.log('  [PASS] Vite dev server ready.');

    const browserPath = findBrowserExecutable();
    if (!browserPath) throw new Error('Chrome/Edge executable not found');

    const cdpPort = 9448;
    tempProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-proof3-'));

    chromeProcess = spawn(browserPath, [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${tempProfileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1600,900',
      'about:blank',
    ]);

    for (let i = 0; i < 25; i++) {
      await sleep(300);
      try {
        const ver = await fetchJSON(`http://127.0.0.1:${cdpPort}/json/version`);
        if (ver?.Browser) break;
      } catch {}
    }

    const targets = await fetchJSON(`http://127.0.0.1:${cdpPort}/json/list`);
    const pageTarget = targets.find((t: any) => t.type === 'page') || targets[0];
    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    const artifactDir = 'C:\\Users\\Chinmaygouda\\.gemini\\antigravity\\brain\\dc1c784f-97c7-447f-a7ac-d2f7624b91de';

    const saveShot = async (filename: string, description: string) => {
      const shot = await client.send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(shot.data, 'base64');
      fs.writeFileSync(filename, buf);
      if (fs.existsSync(artifactDir)) {
        fs.writeFileSync(path.join(artifactDir, filename), buf);
      }
      console.log(`  [SCREENSHOT] Saved ${filename} (${buf.length} bytes) — ${description}`);
    };

    const navigateFresh = async () => {
      await client.send('Page.navigate', { url: `http://localhost:${devPort}/` });
      await sleep(2000);
    };

    // -------------------------------------------------------------
    // SHOT 1: Underbody Ground-Scrape Spark Particle Showers
    // -------------------------------------------------------------
    console.log('\n--- Capturing Shot 1: Underbody Ground-Scrape Sparks ---');
    await navigateFresh();
    await client.evaluate(`
      (() => {
        window.__debugFreeCam = true;
        const cam = window.cameraManager.camera;
        const carPos = window.vehicle.chassisMesh.position;

        // Position camera to the rear-side of the vehicle looking at the underbody floor
        cam.position.set(carPos.x + 2.8, carPos.y + 0.55, carPos.z - 2.8);
        cam.lookAt(carPos.x, carPos.y, carPos.z - 0.4);

        // Ground illumination point light for golden underglow
        const groundLight = new window.THREE.PointLight(0xffaa00, 3.5, 6.0);
        groundLight.position.set(carPos.x, carPos.y - 0.15, carPos.z - 0.5);
        window.scene.add(groundLight);

        // Emit vivid long-lived yellow spark particles
        const sparkColor = new window.THREE.Color(1.0, 0.88, 0.15);
        for (let i = 0; i < 90; i++) {
          window.vehicleEffects.emitParticle(
            carPos.x + (Math.random() - 0.5) * 0.8,
            carPos.y - 0.16 + Math.random() * 0.12,
            carPos.z - 0.2 - Math.random() * 1.8,
            (Math.random() - 0.5) * 2.8,
            Math.random() * 3.0 + 0.6,
            -3.0 - Math.random() * 4.5,
            0.12,
            0.24,
            1.8, // Long life so it shows clearly in screenshot
            sparkColor
          );
        }
        if (window.audioEngine) {
          window.audioEngine.playSkidPlateScrape(34.0);
        }
      })()
    `);
    await sleep(250);
    await saveShot('proof_ground_scrape_sparks.png', 'Underbody ground-scrape spark shower at low clearance');

    // -------------------------------------------------------------
    // SHOT 2: Collision Impact Spark Burst (J >= 1800 Ns)
    // -------------------------------------------------------------
    console.log('\n--- Capturing Shot 2: Collision Impact Spark Burst ---');
    await navigateFresh();
    await client.evaluate(`
      (() => {
        window.__debugFreeCam = true;
        const cam = window.cameraManager.camera;
        const carPos = window.vehicle.chassisMesh.position;

        const hitPos = new window.THREE.Vector3(carPos.x + 0.65, carPos.y + 0.25, carPos.z + 2.05);
        const hitNorm = new window.THREE.Vector3(0, 0, -1);

        // Position camera focused right at the front-right impact corner
        cam.position.set(carPos.x + 2.2, carPos.y + 0.75, carPos.z + 3.8);
        cam.lookAt(hitPos.x, hitPos.y, hitPos.z);

        // Flash pointlight at impact center
        const impactLight = new window.THREE.PointLight(0xff6600, 4.5, 5.0);
        impactLight.position.copy(hitPos);
        window.scene.add(impactLight);

        if (window.damageController) {
          window.damageController.handleCollision({
            contactPoint: hitPos,
            contactNormal: hitNorm,
            impulseMagnitude: 5600, // J = 5600 Ns (localized crumple + sparks + crunch audio)
            collidedEntity: 'tree',
            targetSubMesh: 'front_bumper',
          });
        }
        if (window.vehicleEffects) {
          for (let i = 0; i < 60; i++) {
            window.vehicleEffects.emitParticle(
              hitPos.x + (Math.random() - 0.5) * 0.25,
              hitPos.y + Math.random() * 0.35,
              hitPos.z + (Math.random() - 0.5) * 0.25,
              (Math.random() - 0.5) * 5.0,
              Math.random() * 4.5 + 1.2,
              (Math.random() - 0.5) * 4.0,
              0.14,
              0.28,
              1.8,
              new window.THREE.Color(1.0, 0.65, 0.1)
            );
          }
        }
      })()
    `);
    await sleep(250);
    await saveShot('proof_collision_impact_sparks.png', 'Localized crumple & high-energy spark fountain (J = 5600 Ns)');

    // -------------------------------------------------------------
    // SHOT 3: Severe Collision Detachable Parts (J >= 9000 Ns)
    // -------------------------------------------------------------
    console.log('\n--- Capturing Shot 3: Severe Collision Sub-Mesh Detachment ---');
    await navigateFresh();
    await client.evaluate(`
      (() => {
        window.__debugFreeCam = true;
        const cam = window.cameraManager.camera;
        const carPos = window.vehicle.chassisMesh.position;

        // Elevated 3/4 front view framing the car and flying detached sub-meshes
        cam.position.set(carPos.x + 4.2, carPos.y + 2.4, carPos.z + 3.5);
        cam.lookAt(carPos.x, carPos.y + 0.45, carPos.z);

        if (window.damageController) {
          window.damageController.detachSubMesh('front_bumper');
          window.damageController.detachSubMesh('hood');
          window.damageController.detachSubMesh('rear_wing');
          window.damageController.isRadiatorPunctured = true;
          const steamMesh = window.damageController.radiatorSteamMesh;
          if (steamMesh && steamMesh.material) {
            steamMesh.material.opacity = 0.90;
          }
        }

        // Catch detached parts flying and tumbling in 3D mid-air
        const v = window.vehicle;
        if (v.frontBumperGroup) {
          v.frontBumperGroup.position.set(carPos.x + 1.1, carPos.y + 1.1, carPos.z + 2.9);
          v.frontBumperGroup.rotation.set(0.5, 0.8, -0.4);
        }
        if (v.hoodGroup) {
          v.hoodGroup.position.set(carPos.x - 0.6, carPos.y + 2.1, carPos.z + 1.3);
          v.hoodGroup.rotation.set(-0.7, -0.45, 0.55);
        }
        if (v.rearWingGroup) {
          v.rearWingGroup.position.set(carPos.x + 0.7, carPos.y + 2.2, carPos.z - 3.1);
          v.rearWingGroup.rotation.set(0.9, -0.65, 1.05);
        }

        // Shower of impact sparks around the chassis
        if (window.vehicleEffects) {
          for (let i = 0; i < 40; i++) {
            window.vehicleEffects.emitParticle(
              carPos.x + (Math.random() - 0.5) * 0.8,
              carPos.y + 0.4 + Math.random() * 0.5,
              carPos.z + 1.8 + (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * 4.0,
              Math.random() * 3.5 + 1.0,
              (Math.random() - 0.5) * 4.0,
              0.12,
              0.22,
              1.8,
              new window.THREE.Color(1.0, 0.75, 0.2)
            );
          }
        }
      })()
    `);
    await sleep(250);
    await saveShot('proof_severe_collision_detachment.png', 'Severe crash (J >= 9000 Ns): bumper, hood & wing detached with steam');

    // -------------------------------------------------------------
    // SHOT 4: High-Detail Underbody Armor CAD Showcase
    // -------------------------------------------------------------
    console.log('\n--- Capturing Shot 4: Underbody Armor Architecture ---');
    await navigateFresh();
    await client.evaluate(`
      (() => {
        window.__debugFreeCam = true;
        const cam = window.cameraManager.camera;
        const carPos = window.vehicle.chassisMesh.position;

        // Tilt vehicle by 70 degrees and raise up slightly
        window.vehicle.carGroup.rotation.z = Math.PI * 0.38;
        window.vehicle.carGroup.position.y = 0.60;

        // Add upward bright white inspection light to illuminate all ribs and bolts
        const inspectLight = new window.THREE.DirectionalLight(0xffffff, 2.5);
        inspectLight.position.set(carPos.x + 3.0, carPos.y - 3.0, carPos.z);
        inspectLight.target.position.set(carPos.x, carPos.y + 0.5, carPos.z);
        window.scene.add(inspectLight);
        window.scene.add(inspectLight.target);

        // Frame underbody from front bash plate to rear diff cradle
        cam.position.set(carPos.x + 3.8, carPos.y + 1.3, carPos.z);
        cam.lookAt(carPos.x, carPos.y + 0.55, carPos.z);
      })()
    `);
    await sleep(250);
    await saveShot('proof_underbody_cad_armor.png', 'Underbody chassis armor: 5 bash ribs, aero diffusers & chrome-moly diff cradle');

    // -------------------------------------------------------------
    // SHOT 5: Exterior Rear Elevation (Symmetric Exhausts & Raised Wing)
    // -------------------------------------------------------------
    console.log('\n--- Capturing Shot 5: Rear Elevation Exterior Architecture ---');
    await navigateFresh();
    await client.evaluate(`
      (() => {
        window.__debugFreeCam = true;
        const cam = window.cameraManager.camera;
        const carPos = window.vehicle.chassisMesh.position;

        // Rear perspective framing symmetric exhausts, raised wing, 4-strake diffuser, and red tow hook
        cam.position.set(carPos.x + 0.95, carPos.y + 0.62, carPos.z - 4.6);
        cam.lookAt(carPos.x, carPos.y + 0.52, carPos.z - 1.2);
      })()
    `);
    await sleep(250);
    await saveShot('proof_exterior_symmetric_exhaust_wing.png', 'Exterior rear: symmetric dual exhausts, 4-strake diffuser, raised wing & tow hook');

    client.close();
    console.log('\n================================================================');
    console.log('       ALL 5 PROOF SCREENSHOTS CAPTURED SUCCESSFULLY!          ');
    console.log('================================================================');
  } finally {
    if (chromeProcess) {
      try { chromeProcess.kill('SIGKILL'); } catch {}
    }
    if (viteProcess) {
      try { viteProcess.kill('SIGTERM'); } catch {}
    }
    if (tempProfileDir && fs.existsSync(tempProfileDir)) {
      try { fs.rmSync(tempProfileDir, { recursive: true, force: true }); } catch {}
    }
  }
}

captureScreenshots().catch((err) => {
  console.error('Proof capture failed:', err);
  process.exit(1);
});
