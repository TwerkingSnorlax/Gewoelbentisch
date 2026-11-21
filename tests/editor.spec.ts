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
  await drag(page, await c(3, 3), await c(6, 6));
  await tool(page, '4');
  await page.click('[data-material=water]');
  await drag(page, await c(4, 4), await c(5, 4));
  const m = await stored(page, (m) => m.floor.includes(5));
  const at = (x: number, y: number) => m.floor[y * m.width + x];
  expect([at(3, 3), at(4, 4), at(5, 4), at(6, 6), at(7, 7)]).toEqual([2, 5, 5, 2, 0]);
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

  // Altar drehen (2×1 → 1×2), duplizieren, Kopie löschen (vorher Auswahl aufheben: die Leiste liegt über der Säule)
  await page.keyboard.press('Escape');
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
  expect(v.lights).toEqual([expect.objectContaining({ position: { x: 10.5, y: 8.5 }, range: 4, color: 'ffffffff' })]); // Feuerschale leuchtet, neutral weiß
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

test('Zufallsgenerator: alle Stile mit Eingang, Raummarken und Geschichte; gleicher Startwert ergibt dieselbe Karte', async ({ page }) => {
  const errors = await open(page);
  const results: Record<string, any> = {};
  for (const style of ['dungeon', 'temple', 'tavern', 'cave', 'forest', 'grassland']) {
    await page.click('#btnGenerate');
    await page.selectOption('#genStyle', style);
    await page.fill('#genSeed', '1234');
    await page.click('#genCreate');
    results[style] = await stored(page, (m) => m.style === style);
    await page.keyboard.press('Escape');
  }
  const edge = (m: any) => {
    for (let x = 0; x < m.width; x++) if (m.floor[x] > 0 || m.floor[(m.height - 1) * m.width + x] > 0) return true;
    for (let y = 0; y < m.height; y++) if (m.floor[y * m.width] > 0 || m.floor[y * m.width + m.width - 1] > 0) return true;
    return false;
  };
  for (const [style, m] of Object.entries(results)) {
    expect(m.floor.filter((v: number) => v > 0).length, style).toBeGreaterThan(style === 'grassland' ? 20 : 60);
    expect(m.objects.length, style).toBeGreaterThan(3);
    expect(edge(m), `${style}: Eingang am Kartenrand`).toBe(true);
    expect(m.notes.length, style).toBeGreaterThan(2);
    expect(m.notes.map((n: any) => n.n), style).toEqual(m.notes.map((_: any, i: number) => i + 1));
    expect(m.story.length, style).toBeGreaterThan(20);
    expect(m.name, style).not.toBe('Neue Karte');
    if (['dungeon', 'temple', 'tavern'].includes(style)) expect(m.doors.length, style).toBeGreaterThan(0);
  }
  // Gewölbe: erste Marke ist der Eingang, das Ziel kommt zuletzt
  expect(results.dungeon.notes[0].title).toBe('Eingang');
  // Taverne und Tempel haben ihre typischen Räume
  expect(results.tavern.notes.map((n: any) => n.title)).toEqual(expect.arrayContaining(['Schankraum', 'Küche']));
  expect(results.temple.notes.map((n: any) => n.title)).toEqual(expect.arrayContaining(['Vorhalle', 'Hauptschiff', 'Allerheiligstes']));
  // Wald und Grasland: Weg von Rand zu Rand
  for (const st of ['forest', 'grassland']) {
    const m = results[st];
    const col = (x: number) => [...Array(m.height).keys()].some((y) => m.floor[y * m.width + x] === 4);
    expect([col(0), col(m.width - 1)], st).toEqual([true, true]);
    expect(m.notes[0].title).toBe('Anfang des Wegs');
    expect(m.notes.at(-1).title).toBe('Ende des Wegs');
  }
  // VTT: Grasland ohne Wände, Wald mit Wänden (Blätterdach), Bäume blockieren die Sicht
  for (const [st, walls] of [['grassland', false], ['forest', true]] as const) {
    await page.click('#btnGenerate');
    await page.selectOption('#genStyle', st);
    await page.click('#genCreate');
    await stored(page, (m) => m.style === st);
    await page.keyboard.press('Escape');
    const v = JSON.parse((await download(page, () => page.click('header button.primary'))).text);
    expect(v.line_of_sight.length > 0, st).toBe(walls);
    if (st === 'grassland') expect(v.objects_line_of_sight.length).toBeGreaterThan(3);
  }
  // nochmal Gewölbe mit demselben Startwert
  await page.click('#btnGenerate');
  await page.selectOption('#genStyle', 'dungeon');
  await page.click('#genCreate');
  const again = await stored(page, (m) => m.style === 'dungeon');
  expect(again.floor).toEqual(results.dungeon.floor);
  expect(again.objects.map((o: any) => [o.type, o.x, o.y])).toEqual(results.dungeon.objects.map((o: any) => [o.type, o.x, o.y]));
  expect(again.notes.map((n: any) => n.title)).toEqual(results.dungeon.notes.map((n: any) => n.title));
  // Rückgängig führt zur vorherigen Karte
  await page.keyboard.press('Control+z');
  await stored(page, (m) => m.style === 'forest');
  noErrors(errors);
});

test('Raummarken: setzen, beschreiben, löschen; Leiste über Objekten und Radierer entfernen Objekte', async ({ page }) => {
  const errors = await open(page);
  const c = (x: number, y: number) => cellPos(page, x, y, SIZE);
  await drag(page, await c(3, 3), await c(12, 9));

  // Marke setzen öffnet die Beschreibung
  await tool(page, '9');
  await page.mouse.click((await c(5, 5)).x, (await c(5, 5)).y);
  await expect(page.locator('#panelNotes')).toBeVisible();
  await page.locator('#panelNotes .note-item input').first().fill('Wachstube');
  await page.locator('#panelNotes .note-item textarea').first().fill('Zwei Wachen würfeln.');
  let m = await stored(page, (m) => m.notes[0]?.title === 'Wachstube' && m.notes[0]?.text === 'Zwei Wachen würfeln.');
  expect(m.notes[0]).toMatchObject({ n: 1, x: 5.5, y: 5.5 });
  await page.keyboard.press('Escape');
  await page.mouse.click((await c(8, 5)).x, (await c(8, 5)).y);
  await stored(page, (m) => m.notes.length === 2 && m.notes[1].n === 2);
  await page.click('#panelNotes .note-item button[aria-label="Marke löschen"]');
  m = await stored(page, (m) => m.notes.length === 1);
  expect(m.notes[0]).toMatchObject({ n: 1, title: '' }); // neu nummeriert
  await page.keyboard.press('Escape');

  // Objekt setzen: Leiste darüber, Löschen entfernt es
  await tool(page, '8');
  await page.click('[data-object=chest]');
  await page.mouse.click((await c(10, 7)).x, (await c(10, 7)).y);
  await stored(page, (m) => m.objects.length === 1);
  await expect(page.locator('.obj-toolbar')).toBeVisible();
  await page.click('#objDeleteFloat');
  await stored(page, (m) => m.objects.length === 0);
  await expect(page.locator('.obj-toolbar')).toHaveCount(0);

  // Radierer entfernt Objekte
  await page.click('[data-object=barrel]');
  await page.mouse.click((await c(6, 8)).x, (await c(6, 8)).y);
  await stored(page, (m) => m.objects.length === 1);
  await tool(page, '5');
  await drag(page, await c(6, 8), await c(6, 8));
  m = await stored(page, (m) => m.objects.length === 0);
  expect(m.floor[8 * m.width + 6]).toBe(0);
  noErrors(errors);
});

test('Projektdatei speichern und öffnen (auch das alte Format 1)', async ({ page }) => {
  const errors = await open(page);
  await page.click('#btnGenerate');
  await page.click('#genCreate');
  const before = await stored(page, (m) => m.objects.length > 0);
  await page.fill('.map-name', 'Grab des Fürsten Völund');
  const saved = await download(page, () => page.click('button[title="Speichern"]'));
  expect(saved.name).toBe('Grab_des_Fuersten_Voelund.gewoelbe.json'); // Umlaute umgeschrieben

  await page.locator('input[type=file]').setInputFiles({
    name: 'alt.gewoelbe.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, name: 'Alt', width: 4, height: 4, floor: [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0], doors: [], lights: [{ x: 1, y: 1, range: 3 }] })),
  });
  const old = await stored(page, (m) => m.name === 'Alt');
  expect([old.version, old.style, old.objects, old.floor.filter((v: number) => v === 1).length]).toEqual([2, 'dungeon', [], 4]);

  await page.locator('input[type=file]').setInputFiles({ name: 'k.gewoelbe.json', mimeType: 'application/json', buffer: Buffer.from(saved.text) });
  const back = await stored(page, (m) => m.name !== 'Alt');
  expect(back).toEqual({ ...before, name: 'Grab des Fürsten Völund' });
  noErrors(errors);
});

test('Karte wächst automatisch beim Zeichnen über den Rand, Ansicht bleibt stehen; Schalter und Zuschneiden', async ({ page }) => {
  const errors = await open(page);
  const box = (await page.locator('.wrap > canvas').boundingBox())!;
  const c = (x: number, y: number) => cellPos(page, x, y, SIZE);

  // nach rechts über den Rand (Zeiger verlässt die Zeichenfläche, das Ziehen läuft weiter)
  const a = await c(24, 5);
  await drag(page, a, { x: box.x + box.width + 120, y: (await c(24, 8)).y });
  let m = await stored(page, (m) => m.width > 30);
  expect(m.height).toBe(20);
  const right = Math.round((box.x + box.width + 120 - (a.x - (24.5 * a.cell))) / a.cell - 0.5);
  expect(m.width).toBe(right + 1 + 2); // Inhalt bis zum Zeiger plus 2 Felder Rand
  expect(m.floor[5 * m.width + 24]).toBe(1);

  // nach links oben über den Rand: Inhalte rutschen nach rechts unten, Bildschirm bleibt stehen
  const before = m;
  const b = await c(4, 4);
  await drag(page, b, { x: b.x - 6 * b.cell, y: b.y - 6 * b.cell });
  m = await stored(page, (m) => m.height > 20);
  const dx = m.width - before.width - 0; // rechts kam nichts dazu
  const dy = m.height - before.height;
  expect([dx, dy]).toEqual([2 - (4 - 6), 2 - (4 - 6)]);
  expect(m.floor[(5 + dy) * m.width + 24 + dx]).toBe(1); // erster Raum ist mitgewandert
  // dieselbe Bildschirmstelle trifft nach dem Wachsen dasselbe Feld wie vorher
  await page.keyboard.press('7'); // ohne Einpassen
  await page.mouse.click(b.x, b.y);
  m = await stored(page, (m) => m.lights.length === 1);
  expect(m.lights[0]).toMatchObject({ x: 4 + dx, y: 4 + dy });

  // Schalter aus: kein Wachsen mehr
  await page.click('#btnSettings');
  await page.uncheck('#autoGrow');
  await page.keyboard.press('Escape');
  const w0 = m.width;
  await page.keyboard.press('3');
  await drag(page, b, { x: box.x + 3, y: b.y });
  await page.waitForTimeout(600);
  m = await stored(page);
  expect(m.width).toBe(w0);

  // Zuschneiden: Inhalt plus 2 Felder Rand
  await page.click('#btnSettings');
  await page.click('#trimMap');
  const margins = (m: any) => {
    const cols = [...Array(m.width).keys()].filter((x) => [...Array(m.height).keys()].some((y) => m.floor[y * m.width + x] > 0));
    const rows = [...Array(m.height).keys()].filter((y) => [...Array(m.width).keys()].some((x) => m.floor[y * m.width + x] > 0));
    return [cols[0], rows[0], m.width - 1 - cols.at(-1)!, m.height - 1 - rows.at(-1)!].join();
  };
  const h0 = m.height;
  expect(margins(m)).not.toBe('2,2,2,2'); // vorher: unten rechts zu viel Rand, links keiner
  m = await stored(page, (m) => margins(m) === '2,2,2,2');
  // Rückgängig stellt die Größe wieder her
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await stored(page, (m) => m.width === w0 && m.height === h0);
  noErrors(errors);
});

test('Lichter im VTT-Export: neutral, warm oder gar nicht', async ({ page }) => {
  const errors = await open(page);
  const c = (x: number, y: number) => cellPos(page, x, y, SIZE);
  await drag(page, await c(3, 3), await c(8, 8));
  await tool(page, '7');
  await page.mouse.click((await c(5, 5)).x, (await c(5, 5)).y);
  await stored(page, (m) => m.lights.length === 1);
  const vtt = async () => JSON.parse((await download(page, () => page.click('header button.primary'))).text);
  expect((await vtt()).lights.map((l: any) => l.color)).toEqual(['ffffffff']);
  await page.click('#btnSettings');
  await page.selectOption('#vttLights', 'warm');
  expect((await vtt()).lights.map((l: any) => l.color)).toEqual(['ffffd9a0']);
  await page.selectOption('#vttLights', 'none');
  expect((await vtt()).lights).toEqual([]);
  // Einstellung bleibt nach dem Neuladen erhalten
  await page.reload();
  await page.click('#btnSettings');
  await expect(page.locator('#vttLights')).toHaveValue('none');
  noErrors(errors);
});
