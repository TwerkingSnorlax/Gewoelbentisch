// Offline-Modus: Über http(s) hält ein Service Worker (public/sw.js) die App bereit.
// Eine neue Version lädt er im Hintergrund (beim Öffnen, alle 15 Minuten und beim Zurückwechseln
// zur App) und meldet sie: Leiste „Neue Version“ mit „Jetzt neu laden“ oder „Später“.
import { writable } from 'svelte/store';

export const updateAvailable = writable(false);
export const offlineReady = writable(false);

export function isInstalledApp(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export function initOffline(): void {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http') || import.meta.env.DEV) return;
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Offline-Modus nicht verfügbar:', e));
  navigator.serviceWorker.ready.then(() => offlineReady.set(true));
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'updated') updateAvailable.set(true);
  });
  try {
    navigator.serviceWorker.startMessages(); // Meldungen sofort zustellen, nicht erst nach dem Laden
  } catch {
    /* ältere Browser */
  }
  const check = () => {
    const c = navigator.serviceWorker.controller;
    if (c && navigator.onLine !== false) c.postMessage({ type: 'check' });
  };
  setInterval(check, 15 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}
