import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.resolve(process.cwd(), 'screenshots');

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
      name: 'screenshot-saver',
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
      }
    }
  ]
});
