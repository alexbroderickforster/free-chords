import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// FreeChords — a personal, locally-run guitar chord app.
// Installable PWA with an offline-capable app shell (self-hosted fonts).
//
// Served at the root of its own domain (freechords.app), so base is "/".

// Short commit of this build, surfaced in feedback submissions so a report can
// be tied back to the exact deployed version. Falls back to 'dev' outside git.
let COMMIT = 'dev';
try { COMMIT = execSync('git rev-parse --short HEAD').toString().trim() || 'dev'; } catch { /* no git available */ }

export default defineConfig(() => {
  const base = '/';
  return {
    base,
    define: { __APP_COMMIT__: JSON.stringify(COMMIT) },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['freechords-mark.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'FreeChords',
          short_name: 'FreeChords',
          description: 'A calm, ad-free personal guitar chord app — chords over lyrics.',
          theme_color: '#3B3A8E',
          background_color: '#F6F0E3',
          display: 'standalone',
          orientation: 'any',
          id: base,
          start_url: base,
          scope: base,
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        // Precache the app shell so it loads with no network — including fonts.
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        },
        // Let the service worker run during `vite dev` so it can be verified.
        devOptions: { enabled: true },
      }),
    ],
    server: { port: 5173, open: true },
  };
});
