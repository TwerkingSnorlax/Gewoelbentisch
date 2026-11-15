import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';

// Versionsangabe (Baudatum und Commit), damit man z. B. auf dem iPad sieht, welche Version läuft
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return (process.env.WORKERS_CI_COMMIT_SHA || '').slice(0, 7) || 'lokal';
  }
})();
const VERSION = `${new Date().toISOString().slice(0, 10)} · ${commit}`;

// Ergebnis ist eine einzige HTML-Datei (Skripte und Stile eingebettet).
// Der Service Worker muss dadurch nur diese eine Seite vergleichen, um neue Versionen zu erkennen.
export default defineConfig({
  base: './',
  define: { __VERSION__: JSON.stringify(VERSION) },
  plugins: [svelte(), viteSingleFile()],
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
