import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3001,
    open: false,
    host: true
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  }
});
