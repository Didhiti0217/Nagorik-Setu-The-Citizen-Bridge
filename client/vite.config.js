import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE: .env values are NOT on process.env inside this file — Vite only exposes
// them to client code via import.meta.env. The config has to load them itself
// with loadEnv, otherwise the proxy silently falls back to localhost:4000 and
// every request returns an empty body.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_DEV_API || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Dev-only proxy: the browser talks to same-origin /api and Vite forwards
      // it server-side, so local dev never depends on the API's CORS config.
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
        },
        '/uploads': {
          target,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
