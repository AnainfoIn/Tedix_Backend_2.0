import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The built panel is served by the API at /admin, so assets use that base path.
// In development, API calls are proxied to the NestJS server on port 4000.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/admin/api': 'http://localhost:4000' },
  },
  build: { outDir: 'dist', sourcemap: false },
});
