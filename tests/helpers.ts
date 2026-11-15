import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';

/** Seite öffnen und Fehler sammeln */
export async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(page.locator('.wrap > canvas')).toBeVisible();
  return errors;
}

/** Gespeicherte Karte aus dem Browser-Speicher (wartet auf das Autosave) */
export async function stored(page: Page, until?: (m: any) => boolean) {
  let map: any = null;
  await expect
    .poll(async () => {
      map = await page.evaluate(() => JSON.parse(localStorage.getItem('gewoelbentisch.autosave') || 'null'));
      return !!map && (!until || until(map));
    })
    .toBe(true);
  return map;
}

/** Bildschirmposition der Mitte eines Feldes (nach „Einpassen“) */
export async function cellPos(page: Page, x: number, y: number, size: { w: number; h: number }) {
  const box = (await page.locator('.wrap > canvas').boundingBox())!;
  const zoom = Math.min((box.width - 64) / (size.w * 40), (box.height - 64) / (size.h * 40));
  const ox = box.x + (box.width - size.w * 40 * zoom) / 2;
  const oy = box.y + (box.height - size.h * 40 * zoom) / 2;
  return { x: ox + (x + 0.5) * 40 * zoom, y: oy + (y + 0.5) * 40 * zoom, cell: 40 * zoom };
}

export async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

export async function download(page: Page, click: () => Promise<void>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: dl.suggestedFilename(), text: fs.readFileSync((await dl.path())!, 'utf8') };
}

export function noErrors(errors: string[]) {
  expect(errors, errors.join('\n')).toEqual([]);
}

/** Werkzeug per Taste wählen und danach einpassen (die Objektpalette verändert die Breite der Zeichenfläche) */
export async function tool(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.keyboard.press('f');
}
