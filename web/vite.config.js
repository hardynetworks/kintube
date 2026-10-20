import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = process.env.KINCAST_API || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: api, changeOrigin: false },
      '/media': { target: api, changeOrigin: false },
      '/hls': { target: api, changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
