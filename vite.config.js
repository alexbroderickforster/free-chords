import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// FreeChords — a personal, locally-run guitar chord app.
// Installable PWA with an offline-capable app shell (self-hosted fonts).
//
// Deployed to GitHub Pages under /free-chords/, so the production build uses
// that base path. Local dev stays at "/".
export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/free-chords/' : '/';
  return {
    base,
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
        // pdf.js is large and only used when importing a PDF (an online action),
        // so keep it out of the offline precache.
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
          globIgnores: ['**/pdf-*.js', '**/pdf.worker*'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
        // Let the service worker run during `vite dev` so it can be verified.
        devOptions: { enabled: true },
      }),
    ],
    server: { port: 5173, open: true },
  };
});
