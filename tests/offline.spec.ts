import { test, expect } from '@playwright/test';
import { cellPos, drag, noErrors, open, stored } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('Offline: Manifest und Icons, Start ohne Netz, Hinweis auf neue Version', async ({ page, context }) => {
  const errors = await open(page);
  // Manifest und Icons (Home-Bildschirm)
  const man = await page.evaluate(async () => {
    const l = document.querySelector('link[rel=manifest]') as HTMLLinkElement;
    return (await fetch(l.href)).json();
  });
  expect([man.name, man.display, man.start_url]).toEqual(['Gewölbentisch', 'standalone', './']);
  for (const ic of [...man.icons.map((i: any) => i.src), 'icons/icon-180.png']) {
    const ok = await page.evaluate(async (u) => {
      const r = await fetch(u);
      return r.ok && r.headers.get('content-type')!.includes('png');
    }, ic);
    expect(ok, ic).toBe(true);
  }
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', './icons/icon-180.png');

  // Service Worker aktiv, App im Cache
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(async () => !!(await (await caches.open('gewoelbentisch-app-v1')).match('./')))).toBe(true);

  // etwas zeichnen, dann neu laden, damit der Service Worker die Seite steuert
  const c = (x: number, y: number) => cellPos(page, x, y, { w: 30, h: 20 });
  await drag(page, await c(2, 2), await c(5, 5));
  await stored(page, (m) => m.floor.some((v: number) => v > 0));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // neue Version gemeldet: Leiste mit „Später“ und „Jetzt neu laden“
  const announce = () =>
    context.serviceWorkers()[0].evaluate(async () => {
      const cs = await (self as any).clients.matchAll({ includeUncontrolled: true, type: 'window' });
      for (const cl of cs) cl.postMessage({ type: 'updated' });
      return cs.length;
    });
  await expect.poll(() => context.serviceWorkers().length).toBeGreaterThan(0);
  await announce();
  await expect(page.locator('#updateBar')).toContainText('Neue Version');
  await page.click('#updateLater');
  await expect(page.locator('#updateBar')).toHaveCount(0);
  await announce();
  await Promise.all([page.waitForEvent('load'), page.click('#updateReload')]);
  await expect(page.locator('#updateBar')).toHaveCount(0);

  // ohne Netz: App startet aus dem Cache, Karte ist noch da
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.brand-name')).toHaveText('Gewölbentisch');
  const m = await stored(page);
  expect(m.floor.filter((v: number) => v > 0).length).toBe(16);
  await page.click('#btnSettings');
  await expect(page.locator('#appVersion')).toContainText('offline bereit');
  await context.setOffline(false);

  // neue Version auf dem Server (hier: veralteter Stand im Cache): Hinweis erscheint, Cache wird erneuert
  const makeStale = () =>
    page.evaluate(async () => {
      const c = await caches.open('gewoelbentisch-app-v1');
      const r = await c.match('./');
      await c.put('./', new Response((await r!.text()) + '<!-- alt -->', { headers: { 'content-type': 'text/html' } }));
    });
  await makeStale();
  await page.reload();
  await expect(page.locator('#updateBar')).toContainText('Neue Version', { timeout: 15_000 });
  expect(await page.evaluate(async () => (await (await (await caches.open('gewoelbentisch-app-v1')).match('./'))!.text()).includes('<!-- alt -->'))).toBe(false);

  // auch ohne neu zu öffnen: Zurückwechseln zur App fragt nach einer neuen Version
  await page.click('#updateLater');
  await makeStale();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#updateBar')).toContainText('Neue Version', { timeout: 15_000 });
  noErrors(errors);
});
