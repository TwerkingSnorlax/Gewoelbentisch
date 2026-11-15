import { defineConfig } from '@playwright/test';

// Tests laufen gegen den Produktions-Build (dist/), ausgeliefert von `vite preview`.
export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
    browserName: 'chromium',
    trace: 'off',
    serviceWorkers: 'block', // Offline-Modus nur in offline.spec.ts
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
  },
});
