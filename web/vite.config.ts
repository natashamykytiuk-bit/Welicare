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
  build: {
    rollupOptions: {
      output: {
        // Split the big libraries into their own files. They change far less
        // often than our app code, so browsers keep them cached across deploys
        // and only the small app chunk is re-downloaded after an update.
        manualChunks: {
          firebase: [
            'firebase/app',
            'firebase/app-check',
            'firebase/auth',
            'firebase/firestore',
            'firebase/functions',
          ],
          react: ['react', 'react-dom', 'react-router'],
        },
      },
    },
  },
});
