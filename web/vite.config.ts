// Vite config for the Welicare web portal. The only code shared with the
// mobile app comes through @shared (../shared) — never app files directly.
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
  },
  // shared/ sits outside web/, so the dev server must be allowed to serve it.
  server: { fs: { allow: ['..'] } },
});
