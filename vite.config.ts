import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const TARGET_PHASE = process.env.TARGET_PHASE || 'phase4';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.resolve(process.cwd(), 'overnight', TARGET_PHASE);
const VIDEOS_DIR = process.env.VIDEOS_DIR || path.resolve(process.cwd(), 'overnight', TARGET_PHASE);
const TEMP_FRAMES_DIR = path.resolve(process.cwd(), 'temp_video_frames');

export default defineConfig({
  server: {
    port: 3000,
    open: false,
    host: true
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  },
  plugins: [
    {
      name: 'screenshot-and-video-server',
      configureServer(server) {
        server.middlewares.use('/api/save-screenshot', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const { filename, dataUrl, metric } = JSON.parse(body);
                const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
                if (!fs.existsSync(ARTIFACT_DIR)) {
                  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
                }
                const filePath = path.join(ARTIFACT_DIR, filename);
                fs.writeFileSync(filePath, base64Data, 'base64');
                console.log(`[Screenshot Saver] Saved ${filePath}`);

                if (metric) {
                  const metricsFile = path.join(ARTIFACT_DIR, 'v5_replay_metrics.json');
                  let existingMetrics: any[] = [];
                  if (fs.existsSync(metricsFile)) {
                    try { existingMetrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8')); } catch (_) {}
                  }
                  existingMetrics = existingMetrics.filter(m => Math.abs(m.t - metric.t) > 0.05);
                  existingMetrics.push(metric);
                  existingMetrics.sort((a, b) => a.t - b.t);
                  fs.writeFileSync(metricsFile, JSON.stringify(existingMetrics, null, 2));
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, path: filePath }));
              } catch (err: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            res.writeHead(404);
            res.end();
          }
        });

        // Save individual deterministically rendered video frame
        server.middlewares.use('/api/save-video-frame', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const { clipId, frameIndex, dataUrl } = JSON.parse(body);
                const clipDir = path.join(TEMP_FRAMES_DIR, clipId);
                if (!fs.existsSync(clipDir)) {
                  fs.mkdirSync(clipDir, { recursive: true });
                }
                const frameName = `frame_${String(frameIndex).padStart(5, '0')}.png`;
                const framePath = path.join(clipDir, frameName);
                const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
                fs.writeFileSync(framePath, base64Data, 'base64');

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, frameIndex }));
              } catch (err: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            res.writeHead(404);
            res.end();
          }
        });

        // Finish video clip: encode PNGs with ffmpeg to MP4 + write telemetry CSV
        server.middlewares.use('/api/finish-video-clip', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const { clipId, outputName, telemetryRows } = JSON.parse(body);
                if (!fs.existsSync(VIDEOS_DIR)) {
                  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
                }

                // 1. Write per-frame CSV
                const csvPath = path.join(VIDEOS_DIR, `${outputName}.csv`);
                let csvContent = 'time_s,speed_mph,gear,steer,throttle,brake,handbrake,slip_angle_deg,roll_deg,pitch_deg,droop_cm\n';
                for (const row of telemetryRows) {
                  csvContent += `${row.time_s.toFixed(3)},${row.speed_mph.toFixed(1)},${row.gear},${row.steer.toFixed(2)},${row.throttle.toFixed(2)},${row.brake.toFixed(2)},${row.handbrake ? 1 : 0},${row.slip_angle_deg.toFixed(1)},${row.roll_deg.toFixed(1)},${row.pitch_deg.toFixed(1)},${row.droop_cm.toFixed(1)}\n`;
                }
                fs.writeFileSync(csvPath, csvContent, 'utf8');
                console.log(`[Video Saver] Saved CSV: ${csvPath} (${telemetryRows.length} rows)`);

                // 2. Encode with ffmpeg: H.264, yuv420p, 1280x720, 30 fps, under 20 MB
                const clipDir = path.join(TEMP_FRAMES_DIR, clipId);
                const mp4Path = path.join(VIDEOS_DIR, `${outputName}.mp4`);
                const ffmpegCmd = `ffmpeg -y -r 30 -i "${path.join(clipDir, 'frame_%05d.png')}" -c:v libx264 -pix_fmt yuv420p -crf 20 -b:v 4M -s 1280x720 -movflags +faststart "${mp4Path}"`;
                console.log(`[Video Saver] Encoding ${outputName}.mp4...`);
                execSync(ffmpegCmd, { stdio: 'pipe' });

                const stats = fs.statSync(mp4Path);
                const sizeMb = stats.size / (1024 * 1024);
                console.log(`[Video Saver] Encoded ${outputName}.mp4 -> ${sizeMb.toFixed(2)} MB`);

                if (outputName === 'keyboard_feel_demo') {
                  fs.copyFileSync(csvPath, path.join(VIDEOS_DIR, 'clip_keyboard_feel.csv'));
                  fs.copyFileSync(mp4Path, path.join(VIDEOS_DIR, 'clip_keyboard_feel.mp4'));
                  fs.copyFileSync(csvPath, path.join(VIDEOS_DIR, 'clip_b_keyboard_drift.csv'));
                  fs.copyFileSync(mp4Path, path.join(VIDEOS_DIR, 'clip_b_keyboard_drift.mp4'));
                }

                // Clean up temp PNG frames
                fs.rmSync(clipDir, { recursive: true, force: true });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: true,
                  mp4Path,
                  csvPath,
                  sizeBytes: stats.size,
                  sizeMb: parseFloat(sizeMb.toFixed(2)),
                  frameCount: telemetryRows.length
                }));
              } catch (err: any) {
                console.error('[Video Saver] Error finishing video clip:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          } else {
            res.writeHead(404);
            res.end();
          }
        });
      }
    }
  ]
});
