import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

const PORT = 3005;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function getBrowserPath() {
  if (fs.existsSync(CHROME_PATH)) return CHROME_PATH;
  if (fs.existsSync(EDGE_PATH)) return EDGE_PATH;
  throw new Error('Neither Chrome nor Edge was found at standard locations.');
}

export async function runRenderSession(outDir, urlPath = '/render_lane3.html') {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    let completed = false;
    let chromeProc = null;

    const server = http.createServer((req, res) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'POST' && req.url === '/save-artifact') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { filename, content, isBase64 } = JSON.parse(body);
            const targetPath = path.join(outDir, filename);
            if (isBase64) {
              const base64Data = content.replace(/^data:image\/png;base64,/, '');
              fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
            } else {
              fs.writeFileSync(targetPath, content, 'utf8');
            }
            console.log(`[Receiver] Saved ${filename} (${fs.statSync(targetPath).size} bytes)`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            console.error('[Receiver Error]', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      } else if (req.method === 'POST' && req.url === '/render-complete') {
        console.log('[Receiver] Received completion signal.');
        completed = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));

        setTimeout(() => {
          if (chromeProc) chromeProc.kill();
          server.close(() => resolve());
        }, 1000);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(PORT, () => {
      console.log(`[Runner] Receiver listening on http://localhost:${PORT}`);
      const browserBin = getBrowserPath();
      const flags = [
        '--headless=new',
        '--use-gl=angle',
        '--use-angle=d3d11',
        '--no-sandbox',
        '--window-size=1280,1400',
        `http://localhost:3001${urlPath}`
      ];

      console.log(`[Runner] Launching browser: ${browserBin}`);
      chromeProc = spawn(browserBin, flags, { stdio: 'ignore' });

      chromeProc.on('error', (err) => {
        server.close();
        reject(err);
      });

      chromeProc.on('exit', (code) => {
        if (!completed) {
          console.warn(`[Runner] Browser process exited with code ${code} before completion.`);
        }
      });

      // 60-second safety timeout
      setTimeout(() => {
        if (!completed) {
          if (chromeProc) chromeProc.kill();
          server.close();
          reject(new Error('Render session timed out after 60 seconds'));
        }
      }, 60000);
    });
  });
}

function computeHashes(dir) {
  const files = fs.readdirSync(dir).sort();
  const hashes = {};
  for (const f of files) {
    if (!f.endsWith('.png') && !f.endsWith('.json')) continue;
    const buf = fs.readFileSync(path.join(dir, f));
    const h = crypto.createHash('sha256').update(buf).digest('hex');
    hashes[f] = h;
  }
  return hashes;
}

async function main() {
  const isOpen = process.argv.includes('open') || process.argv.includes('--open');
  const urlPath = isOpen ? '/render_lane3.html?world=open' : '/render_lane3.html';
  const prefix = isOpen ? 'artifacts_lane3_open' : 'artifacts_lane3';

  const run1Dir = path.resolve(`${prefix}_run1`);
  const run2Dir = path.resolve(`${prefix}_run2`);

  console.log(`=== PART 3: DETERMINISTIC RENDER PASS 1 (${isOpen ? 'OPEN GROUND' : 'CURVED ROAD'}) ===`);
  await runRenderSession(run1Dir, urlPath);
  const hashes1 = computeHashes(run1Dir);
  console.log('Pass 1 SHA256 hashes:');
  for (const [f, h] of Object.entries(hashes1)) {
    console.log(`  ${f.padEnd(30)} ${h}`);
  }

  console.log(`\n=== PART 3: DETERMINISTIC RENDER PASS 2 (${isOpen ? 'OPEN GROUND' : 'CURVED ROAD'}) ===`);
  await runRenderSession(run2Dir, urlPath);
  const hashes2 = computeHashes(run2Dir);
  console.log('Pass 2 SHA256 hashes:');
  for (const [f, h] of Object.entries(hashes2)) {
    console.log(`  ${f.padEnd(30)} ${h}`);
  }

  console.log('\n=== HASH COMPARISON ACROSS PASSES ===');
  let allMatch = true;
  for (const f of Object.keys(hashes1)) {
    const h1 = hashes1[f];
    const h2 = hashes2[f];
    const match = h1 === h2;
    if (!match) allMatch = false;
    console.log(`  ${f.padEnd(30)} Pass1: ${h1.substring(0, 16)}... Pass2: ${h2?.substring(0, 16)}... ${match ? 'MATCH' : 'DIFFER'}`);
  }

  if (allMatch) {
    console.log('\nDETERMINISM RESULT: 100% BYTE-FOR-BYTE IDENTICAL ACROSS RUNS (ALL HASHES MATCH)');
  } else {
    console.log('\nDETERMINISM RESULT: SOME HASHES DIFFER');
  }

  // Copy finalized run1 artifacts to output directory
  const finalDir = path.resolve(`${prefix}_final`);
  if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
  for (const f of fs.readdirSync(run1Dir)) {
    fs.copyFileSync(path.join(run1Dir, f), path.join(finalDir, f));
  }
  console.log(`\nFinalized artifacts copied to ${finalDir}`);
}

main().catch(err => {
  console.error('[Error in render runner]', err);
  process.exit(1);
});
