import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// FreeChords — a personal, locally-run guitar chord app.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
});
