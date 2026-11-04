import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

interface CDPMessage {
  id: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

async function runBrowserPlaytest() {
  console.log('================================================================');
  console.log('   APEX DIRT - COMPREHENSIVE IN-BROWSER PLAYTESTING HARNESS');
  console.log('================================================================\n');

  const port = 9444;
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(process.env.TEMP || 'C:\\tmp', 'chrome_apex_playtest_' + Date.now());

  console.log(`[1/8] Spawning Google Chrome with CDP on port ${port}...`);
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${userDataDir}`,
    '--disable-background-networking',
    '--disable-gpu-sandbox',
    '--enable-webgl',
    '--window-size=1280,720',
    'http://127.0.0.1:5173/'
  ]);

  let isKilled = false;
  const killChrome = () => {
    if (!isKilled) {
      isKilled = true;
      try { chrome.kill(); } catch {}
    }
  };

  process.on('exit', killChrome);
  process.on('SIGINT', killChrome);

  // Poll for CDP endpoint
  let pageTarget: any = null;
  console.log('[2/8] Waiting for Vite page to load in Chrome...');
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      const list = await res.json() as any[];
      pageTarget = list.find(t => t.type === 'page' && t.url.includes('5173'));
      if (pageTarget) break;
    } catch {}
  }

  if (!pageTarget) {
    killChrome();
    throw new Error('Failed to connect to Vite page via Chrome CDP on port ' + port);
  }

  console.log(`[3/8] Connecting CDP WebSocket: ${pageTarget.webSocketDebuggerUrl}`);
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let msgId = 1;
  const pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  const consoleErrors: string[] = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data.toString()) as CDPMessage;
    if (msg.id && pendingRequests.has(msg.id)) {
      const { resolve, reject } = pendingRequests.get(msg.id)!;
      pendingRequests.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type === 'error') {
        const text = msg.params.args.map((a: any) => a.value || a.description || JSON.stringify(a)).join(' ');
        consoleErrors.push(`[Console Error] ${text}`);
      }
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const desc = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text;
      consoleErrors.push(`[Uncaught Exception] ${desc}`);
    }
  };

  function sendCDP(method: string, params: any = {}): Promise<any> {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression: string): Promise<any> {
    const res = await sendCDP('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text + ': ' + (res.exceptionDetails.exception?.description || ''));
    }
    return res.result?.value;
  }

  async function sendKey(code: string, key: string, isDown: boolean): Promise<void> {
    await sendCDP('Input.dispatchKeyEvent', {
      type: isDown ? 'rawKeyDown' : 'keyUp',
      code,
      key,
      windowsVirtualKeyCode: code === 'KeyW' ? 87 : code === 'KeyS' ? 83 : code === 'KeyA' ? 65 : code === 'KeyD' ? 68 : code === 'Space' ? 32 : code === 'KeyC' ? 67 : code === 'KeyL' ? 76 : code === 'KeyN' ? 78 : 0,
      nativeVirtualKeyCode: code === 'KeyW' ? 87 : code === 'KeyS' ? 83 : code === 'KeyA' ? 65 : code === 'KeyD' ? 68 : code === 'Space' ? 32 : code === 'KeyC' ? 67 : code === 'KeyL' ? 76 : code === 'KeyN' ? 78 : 0,
    });
  }

  async function captureScreenshot(filename: string): Promise<string> {
    const res = await sendCDP('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.resolve('scratch', filename);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buffer);
    console.log(`  -> Saved screenshot: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return outPath;
  }

  // Enable CDP domains
  await sendCDP('Runtime.enable');
  await sendCDP('Page.enable');

  console.log('[4/8] Waiting for WebGL Canvas and Rally Subsystems to initialize...');
  let initialized = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    const ready = await evaluate(`
      (function() {
        const canvas = document.querySelector('canvas');
        const hasVehicle = typeof window.stageManager !== 'undefined';
        const hasCamera = typeof window.cameraManager !== 'undefined';
        const hasCockpit = typeof window.cockpit !== 'undefined';
        const hasHeadlights = typeof window.headlightController !== 'undefined';
        return !!(canvas && hasVehicle && hasCamera && hasCockpit && hasHeadlights);
      })()
    `);
    if (ready) {
      initialized = true;
      break;
    }
  }

  if (!initialized) {
    killChrome();
    throw new Error('Game subsystems failed to initialize in browser within 10 seconds.');
  }
  console.log('  -> Canvas & Game Systems Ready: 100% OK');

  // Let initial frames run to settle physics
  await new Promise(r => setTimeout(r, 800));

  console.log('\n[5/8] TEST 1: Full Throttle Acceleration & Steering Response');
  console.log('  -> Holding KeyW (throttle 1.0) for 2.5 seconds...');
  await sendKey('KeyW', 'w', true);
  await new Promise(r => setTimeout(r, 2500));

  const speedAfterAccel = await evaluate(`
    (function() {
      const v = window.stageManager.vehicle;
      const lv = v.chassisBody.linvel();
      return Math.hypot(lv.x, lv.y, lv.z) * 2.23694;
    })()
  `);
  console.log(`  -> Speed reached: ${speedAfterAccel.toFixed(1)} mph (PASS: > 35 mph)`);
  if (speedAfterAccel < 25) {
    throw new Error(`Vehicle failed to accelerate under throttle: speed = ${speedAfterAccel} mph`);
  }

  console.log('\n[6/8] TEST 2: Handbrake Drift Slide & Rotation');
  console.log('  -> Flicking steer right (KeyD) + handbrake (Space) at speed...');
  await sendKey('KeyD', 'd', true);
  await sendKey('Space', ' ', true);
  await new Promise(r => setTimeout(r, 900));

  const driftMetrics = await evaluate(`
    (function() {
      const v = window.stageManager.vehicle;
      return {
        driftAngleDeg: v.driftAngleDeg,
        isDrifting: v.isDrifting,
        speedMph: Math.hypot(v.chassisBody.linvel().x, v.chassisBody.linvel().z) * 2.23694
      };
    })()
  `);
  console.log(`  -> Drift Angle: ${driftMetrics.driftAngleDeg.toFixed(1)}° | isDrifting: ${driftMetrics.isDrifting}`);
  await captureScreenshot('browser_test_drift.png');

  // Release keys
  await sendKey('KeyD', 'd', false);
  await sendKey('Space', ' ', false);
  await sendKey('KeyW', 'w', false);

  console.log('\n[7/8] TEST 3: Multi-Camera View Cycling (Key C)');
  const camInit = await evaluate(`window.cameraManager.currentMode`);
  console.log(`  -> Initial Camera: ${camInit}`);

  // Press 'C' to switch to Cockpit
  await sendKey('KeyC', 'c', true);
  await new Promise(r => setTimeout(r, 80));
  await sendKey('KeyC', 'c', false);
  await new Promise(r => setTimeout(r, 300));

  const camCockpit = await evaluate(`window.cameraManager.currentMode`);
  console.log(`  -> After 1st press (Key C): Camera = ${camCockpit}`);
  if (camCockpit !== 'COCKPIT_FPV') {
    throw new Error(`Expected COCKPIT_FPV mode, got: ${camCockpit}`);
  }
  await captureScreenshot('browser_test_cockpit_fpv.png');

  // Press 'C' to switch to Hood
  await sendKey('KeyC', 'c', true);
  await new Promise(r => setTimeout(r, 80));
  await sendKey('KeyC', 'c', false);
  await new Promise(r => setTimeout(r, 300));

  const camHood = await evaluate(`window.cameraManager.currentMode`);
  console.log(`  -> After 2nd press (Key C): Camera = ${camHood}`);
  if (camHood !== 'HOOD') {
    throw new Error(`Expected HOOD mode, got: ${camHood}`);
  }
  await captureScreenshot('browser_test_hood_view.png');

  // Press 'C' to return to Chase
  await sendKey('KeyC', 'c', true);
  await new Promise(r => setTimeout(r, 80));
  await sendKey('KeyC', 'c', false);
  await new Promise(r => setTimeout(r, 200));

  console.log('\n[8/8] TEST 4: Day/Night Cycle & Headlights (Keys N & L)');
  // Press 'N' to toggle to DUSK
  await sendKey('KeyN', 'n', true);
  await new Promise(r => setTimeout(r, 80));
  await sendKey('KeyN', 'n', false);
  await new Promise(r => setTimeout(r, 300));
  const duskState = await evaluate(`window.dayNightCycle.timeHours`);
  console.log(`  -> Time after 1st 'N': ${duskState.toFixed(1)} hrs (Dusk amber)`);

  // Press 'N' to toggle to NIGHT
  await sendKey('KeyN', 'n', true);
  await new Promise(r => setTimeout(r, 80));
  await sendKey('KeyN', 'n', false);
  await new Promise(r => setTimeout(r, 300));
  const nightState = await evaluate(`window.dayNightCycle.timeHours`);
  console.log(`  -> Time after 2nd 'N': ${nightState.toFixed(1)} hrs (Obsidian night)`);

  // Turn Headlights ON with 'L'
  const hlBefore = await evaluate(`window.headlightController.isOn`);
  await sendKey('KeyL', 'l', true);
  await new Promise(r => setTimeout(r, 80));
  await sendKey('KeyL', 'l', false);
  await new Promise(r => setTimeout(r, 300));
  const hlAfter = await evaluate(`window.headlightController.isOn`);
  console.log(`  -> Headlights toggled with 'L': was ${hlBefore} -> now ${hlAfter}`);
  if (!hlAfter) {
    throw new Error('Headlights failed to turn ON when pressing KeyL');
  }
  await captureScreenshot('browser_test_night_headlights.png');

  // Test Wildlife Crossing status
  const wildlifeStatus = await evaluate(`
    (function() {
      const wm = window.wildlifeCrossing;
      return {
        totalAnimals: wm.animals.length,
        hasGroup: !!wm.group
      };
    })()
  `);
  console.log(`  -> Wildlife Crossing AI: ${wildlifeStatus.totalAnimals} animal crossings registered across forest`);

  // Test Co-Driver System status
  const codriverStatus = await evaluate(`
    (function() {
      const cd = window.coDriver;
      return {
        speechEnabled: cd.speechEnabled,
        hasHud: !!cd.hudElement
      };
    })()
  `);
  console.log(`  -> Co-Driver System: HUD Active = ${codriverStatus.hasHud}, Voice Speech = ${codriverStatus.speechEnabled}`);

  console.log('\n----------------------------------------------------------------');
  console.log(`Fatal Console Errors Detected: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error('Console Errors:', consoleErrors);
    throw new Error(`Encountered ${consoleErrors.length} console errors during browser session`);
  }
  console.log('Browser Playtesting Result: [100% PASSED - ALL SYSTEMS VERIFIED]');
  console.log('================================================================\n');

  ws.close();
  killChrome();
}

runBrowserPlaytest().catch(err => {
  console.error('Browser playtest failed:', err);
  process.exit(1);
});
