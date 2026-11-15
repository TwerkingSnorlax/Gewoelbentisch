import { test, expect } from '@playwright/test';
import { cellPos, download, drag, noErrors, open, stored, tool } from './helpers';

const SIZE = { w: 30, h: 20 };

test('Räume, Gang, Tür und Licht zeichnen, Rückgängig, Export als PNG und VTT', async ({ page }) => {
  const errors = await open(page);
  const c = (x: number, y: number) => cellPos(page, x, y, SIZE);
  await drag(page, await c(2, 2), await c(8, 7));
  await tool(page, '4'); // Pinsel
  await drag(page, await c(9, 4), await c(14, 4));
  await tool(page, '3'); // Raum
  await drag(page, await c(15, 2), await c(22, 9));
  // Tür am Übergang Raum → Gang (senkrechte Kante x = 9)
  await tool(page, '6');
  const d = await c(9, 4);
  await page.mouse.click(d.x - d.cell / 2, d.y);
  await tool(page, '7');
  await page.mouse.click((await c(5, 5)).x, (await c(5, 5)).y);

  let m = await stored(page, (m) => m.doors.length === 1 && m.lights.length === 1);
  expect(m.floor.filter((v: number) => v > 0).length).toBe(42 + 6 + 64);

  // Rückgängig entfernt das Licht, Wiederholen bringt es zurück
  await page.keyboard.press('Control+z');
  await stored(page, (m) => m.lights.length === 0);
  await page.keyboard.press('Control+y');
  await stored(page, (m) => m.lights.length === 1);

  const png = await download(page, () => page.click('button[title="Als PNG-Bild exportieren"]'));
  expect(png.name).toBe('Neue_Karte.png');
  const vtt = await download(page, () => page.click('header button.primary'));
  expect(vtt.name).toBe('Neue_Karte.dd2vtt');
  const v = JSON.parse(vtt.text);
  expect(v.format).toBe(0.3);
  expect(v.resolution).toEqual({ map_origin: { x: 0, y: 0 }, map_size: { x: 30, y: 20 }, pixels_per_grid: 70 });
  expect(v.portals).toEqual([
    { position: { x: 9, y: 4.5 }, bounds: [{ x: 9, y: 4 }, { x: 9, y: 5 }], rotation: Math.PI / 2, closed: true, freestanding: false },
  ]);
  expect(v.lights).toHaveLength(1);
  expect(v.line_of_sight.length).toBeGreaterThan(8);
  expect(v.image.length).toBeGreaterThan(10_000);
  noErrors(errors);
});

test('Material wählen: Holzboden und Wasser', async ({ page }) => {
  const errors = await open(page);
  const c = (x: number, y: number) => cellPos(page, x, y, SIZE);
  await page.click('[data-material=wood]');
  await drag(page, await c(1, 1), await c(4, 4));
  await tool(page, '4');
  await page.click('[data-material=water]');
  await drag(page, await c(2, 2), await c(3, 2));
  const m = await stored(page, (m) => m.floor.includes(5));
  const at = (x: number, y: number) => m.floor[y * m.width + x];
  expect([at(1, 1), at(2, 2), at(3, 2), at(4, 4), at(5, 5)]).toEqual([2, 5, 5, 2, 0]);
  noErrors(errors);
});

test('Objekte platzieren, verschieben, drehen, duplizieren, löschen; Sichtblocker und Feuer im VTT', async ({ page }) => {
  const errors = await open(page);
  const c = (x: number, y: number) => cellPos(page, x, y, SIZE);
  await drag(page, await c(2, 2), await c(12, 10));

  await tool(page, '8');
  await page.click('[data-object=pillar]');
  await page.mouse.click((await c(4, 4)).x, (await c(4, 4)).y);
  await page.click('[data-object=altar]');
  await page.mouse.click((await c(8, 4)).x - 10, (await c(8, 4)).y); // Mitte eines 2×1-Objekts
  await page.click('[data-object=brazier]');
  await page.mouse.click((await c(10, 8)).x, (await c(10, 8)).y);
  let m = await stored(page, (m) => m.objects.length === 3);
  expect(m.objects.map((o: any) => [o.type, o.x, o.y, o.rot])).toEqual([
    ['pillar', 4, 4, 0],
    ['altar', 7, 4, 0],
    ['brazier', 10, 8, 0],
  ]);

  // Auswahl: Säule zwei Felder nach rechts ziehen
  await tool(page, '2');
  await drag(page, await c(4, 4), await c(4, 6));
  m = await stored(page, (m) => m.objects[0].y === 6);
  expect([m.objects[0].x, m.objects[0].y]).toEqual([4, 6]);

  // Altar drehen (2×1 → 1×2), duplizieren, Kopie löschen
  await page.mouse.click((await c(7, 4)).x, (await c(7, 4)).y);
  await page.click('#objRotate');
  m = await stored(page, (m) => m.objects[1].rot === 90);
  await page.click('#objDuplicate');
  await stored(page, (m) => m.objects.length === 4);
  await page.click('#objDelete');
  await stored(page, (m) => m.objects.length === 3);

  const v = JSON.parse((await download(page, () => page.click('header button.primary'))).text);
  expect(v.objects_line_of_sight).toHaveLength(1); // nur die Säule blockiert die Sicht
  expect(v.objects_line_of_sight[0][0]).toEqual({ x: 4.15, y: 6.15 });
  expect(v.lights).toEqual([expect.objectContaining({ position: { x: 10.5, y: 8.5 }, range: 4 })]); // Feuerschale leuchtet
  noErrors(errors);
});

test('Ebenen: gesperrte Ebene lässt sich nicht bearbeiten, ausgeblendete fehlt im Export', async ({ page }) => {
  const errors = await open(page);
  const c = (x: number, y: number) => cellPos(page, x, y, SIZE);
  await drag(page, await c(2, 2), await c(6, 6));
  await tool(page, '8');
  await page.click('[data-object=pillar]');
  await page.mouse.click((await c(4, 4)).x, (await c(4, 4)).y);
  await stored(page, (m) => m.objects.length === 1);

  await page.click('#btnLayers');
  await page.click('[data-layer=floor] [data-action=locked]');
  await page.keyboard.press('Escape');
  await tool(page, '3');
  await drag(page, await c(10, 10), await c(12, 12));
  await expect(page.locator('.hint')).toContainText('gesperrt');
  let m = await stored(page, (m) => m.layers.floor.locked);
  expect(m.floor.filter((v: number) => v > 0).length).toBe(25);

  await page.click('#btnLayers');
  await page.click('[data-layer=objects] [data-action=visible]');
  m = await stored(page, (m) => m.layers.objects.visible === false);
  const v = JSON.parse((await download(page, () => page.click('header button.primary'))).text);
  expect(v.objects_line_of_sight).toEqual([]);
  noErrors(errors);
});

test('Zufallsgenerator: alle Stile, gleicher Startwert ergibt dieselbe Karte', async ({ page }) => {
  const errors = await open(page);
  const results: Record<string, any> = {};
  for (const style of ['dungeon', 'temple', 'tavern', 'cave']) {
    await page.click('#btnGenerate');
    await page.selectOption('#genStyle', style);
    await page.fill('#genSeed', '1234');
    await page.click('#genCreate');
    results[style] = await stored(page, (m) => m.style === style);
    await page.keyboard.press('Escape');
  }
  for (const [style, m] of Object.entries(results)) {
    expect(m.floor.filter((v: number) => v > 0).length, style).toBeGreaterThan(100);
    expect(m.objects.length, style).toBeGreaterThan(3);
    if (style !== 'cave') expect(m.doors.length, style).toBeGreaterThan(0);
  }
  // nochmal Gewölbe mit demselben Startwert
  await page.click('#btnGenerate');
  await page.selectOption('#genStyle', 'dungeon');
  await page.click('#genCreate');
  const again = await stored(page, (m) => m.style === 'dungeon');
  expect(again.floor).toEqual(results.dungeon.floor);
  expect(again.objects.map((o: any) => [o.type, o.x, o.y])).toEqual(results.dungeon.objects.map((o: any) => [o.type, o.x, o.y]));
  // Rückgängig führt zur vorherigen Karte (Höhle)
  await page.keyboard.press('Control+z');
  await stored(page, (m) => m.style === 'cave');
  noErrors(errors);
});

test('Projektdatei speichern und öffnen (auch das alte Format 1)', async ({ page }) => {
  const errors = await open(page);
  await page.click('#btnGenerate');
  await page.click('#genCreate');
  const before = await stored(page, (m) => m.objects.length > 0);
  const saved = await download(page, () => page.click('button[title="Speichern"]'));
  expect(saved.name).toBe('Neue_Karte.gewoelbe.json');

  await page.locator('input[type=file]').setInputFiles({
    name: 'alt.gewoelbe.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, name: 'Alt', width: 4, height: 4, floor: [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0], doors: [], lights: [{ x: 1, y: 1, range: 3 }] })),
  });
  const old = await stored(page, (m) => m.name === 'Alt');
  expect([old.version, old.style, old.objects, old.floor.filter((v: number) => v === 1).length]).toEqual([2, 'dungeon', [], 4]);

  await page.locator('input[type=file]').setInputFiles({ name: 'k.gewoelbe.json', mimeType: 'application/json', buffer: Buffer.from(saved.text) });
  const back = await stored(page, (m) => m.name !== 'Alt');
  expect(back).toEqual(before);
  noErrors(errors);
});
