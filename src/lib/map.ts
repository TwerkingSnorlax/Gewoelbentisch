// Datenmodell einer Battlemap: Raster aus Feldern (Fels oder Boden mit Material),
// Türen auf Kanten zwischen Feldern, Lichtquellen in Feldmitten, Objekte auf dem Raster.
import { OBJECTS, type ObjectType } from './objects';

export type EdgeDir = 'h' | 'v';

/**
 * Eine Kante im Raster.
 * 'h': obere Kante des Feldes (x, y), von (x, y) nach (x + 1, y).
 * 'v': linke Kante des Feldes (x, y), von (x, y) nach (x, y + 1).
 */
export interface Edge {
  x: number;
  y: number;
  dir: EdgeDir;
}

export interface Light {
  x: number;
  y: number;
  /** Reichweite in Feldern */
  range: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface MapObject {
  id: string;
  type: ObjectType;
  /** linke obere Ecke in Feldern */
  x: number;
  y: number;
  rot: Rotation;
}

/** Bodenmaterialien; 0 im Feld-Array bedeutet Fels */
// neue Materialien nur hinten anfügen: die Nummer im Feld-Array ist die Position + 1
export const MATERIALS = ['stone', 'wood', 'marble', 'earth', 'water', 'grass'] as const;
export type Material = (typeof MATERIALS)[number];
export const materialId = (m: Material): number => MATERIALS.indexOf(m) + 1;
export const materialOf = (id: number): Material | null => MATERIALS[id - 1] ?? null;

export const STYLES = ['dungeon', 'temple', 'tavern', 'cave', 'forest', 'grassland'] as const;
export type StyleId = (typeof STYLES)[number];

export const LAYERS = ['floor', 'objects', 'doors', 'lights', 'notes', 'grid'] as const;
export type LayerId = (typeof LAYERS)[number];
export interface LayerState {
  visible: boolean;
  locked: boolean;
}

/** Nummerierte Raummarke mit Beschreibung (z. B. vom Generator) */
export interface Note {
  id: string;
  n: number;
  /** Mitte der Marke in Feldern */
  x: number;
  y: number;
  title: string;
  text: string;
}

export interface MapDoc {
  version: 2;
  name: string;
  width: number;
  height: number;
  style: StyleId;
  /** width * height Einträge: 0 = Fels, sonst Material-Nummer (1 = Stein, …) */
  floor: number[];
  doors: Edge[];
  lights: Light[];
  objects: MapObject[];
  notes: Note[];
  /** Hintergrundgeschichte der Karte (vom Generator, frei bearbeitbar) */
  story: string;
  layers: Record<LayerId, LayerState>;
}

export const MIN_SIZE = 4;
export const MAX_SIZE = 200;
export const DEFAULT_LIGHT_RANGE = 6;

export function clampSize(n: number): number {
  if (!Number.isFinite(n)) return MIN_SIZE;
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(n)));
}

export function defaultLayers(): Record<LayerId, LayerState> {
  return Object.fromEntries(LAYERS.map((l) => [l, { visible: true, locked: false }])) as Record<LayerId, LayerState>;
}

export function createMap(width: number, height: number, name: string, style: StyleId = 'dungeon'): MapDoc {
  const w = clampSize(width);
  const h = clampSize(height);
  return {
    version: 2,
    name,
    width: w,
    height: h,
    style,
    floor: new Array(w * h).fill(0),
    doors: [],
    lights: [],
    objects: [],
    notes: [],
    story: '',
    layers: defaultLayers(),
  };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function inBounds(m: MapDoc, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.width && y < m.height;
}

export function isFloor(m: MapDoc, x: number, y: number): boolean {
  return inBounds(m, x, y) && m.floor[y * m.width + x] > 0;
}

export function floorAt(m: MapDoc, x: number, y: number): number {
  return inBounds(m, x, y) ? m.floor[y * m.width + x] : 0;
}

/** Setzt ein Feld (0 = Fels, sonst Material). Gibt true zurück, wenn sich etwas geändert hat. */
export function setFloor(m: MapDoc, x: number, y: number, value: number): boolean {
  if (!inBounds(m, x, y)) return false;
  const i = y * m.width + x;
  if (m.floor[i] === value) return false;
  m.floor[i] = value;
  return true;
}

export function fillRect(m: MapDoc, x0: number, y0: number, x1: number, y1: number, value: number): boolean {
  let changed = false;
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      changed = setFloor(m, x, y, value) || changed;
    }
  }
  return changed;
}

/** Eine Kante ist eine Wand, wenn sie Boden von Fels (oder dem Kartenrand) trennt. */
export function isWallEdge(m: MapDoc, e: Edge): boolean {
  if (e.dir === 'h') return isFloor(m, e.x, e.y - 1) !== isFloor(m, e.x, e.y);
  return isFloor(m, e.x - 1, e.y) !== isFloor(m, e.x, e.y);
}

/** Eine Kante ist ein Durchgang, wenn auf beiden Seiten Boden liegt. Nur hier passen Türen hin. */
export function isOpenEdge(m: MapDoc, e: Edge): boolean {
  if (e.dir === 'h') return isFloor(m, e.x, e.y - 1) && isFloor(m, e.x, e.y);
  return isFloor(m, e.x - 1, e.y) && isFloor(m, e.x, e.y);
}

export function hasDoor(m: MapDoc, e: Edge): boolean {
  return m.doors.some((d) => d.dir === e.dir && d.x === e.x && d.y === e.y);
}

export function toggleDoor(m: MapDoc, e: Edge): boolean {
  if (hasDoor(m, e)) {
    m.doors = m.doors.filter((d) => !(d.dir === e.dir && d.x === e.x && d.y === e.y));
    return true;
  }
  if (!isOpenEdge(m, e)) return false;
  m.doors = [...m.doors, { x: e.x, y: e.y, dir: e.dir }];
  return true;
}

export function toggleLight(m: MapDoc, x: number, y: number): boolean {
  if (!inBounds(m, x, y)) return false;
  if (m.lights.some((l) => l.x === x && l.y === y)) {
    m.lights = m.lights.filter((l) => !(l.x === x && l.y === y));
  } else {
    m.lights = [...m.lights, { x, y, range: DEFAULT_LIGHT_RANGE }];
  }
  return true;
}

/** Entfernt Türen, die nach einer Änderung nicht mehr in einem Durchgang liegen. */
export function cleanupDoors(m: MapDoc): void {
  if (m.doors.some((d) => !isOpenEdge(m, d))) {
    m.doors = m.doors.filter((d) => isOpenEdge(m, d));
  }
}

/**
 * Findet die Kante nahe einem Punkt (in Feld-Koordinaten, z. B. 3.4 / 7.9).
 * Gibt null zurück, wenn der Punkt zu weit von jeder Kante entfernt ist.
 */
export function pickEdge(fx: number, fy: number, tolerance = 0.3): Edge | null {
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  const dx = fx - cx;
  const dy = fy - cy;
  const candidates: [number, Edge][] = [
    [dy, { x: cx, y: cy, dir: 'h' }],
    [1 - dy, { x: cx, y: cy + 1, dir: 'h' }],
    [dx, { x: cx, y: cy, dir: 'v' }],
    [1 - dx, { x: cx + 1, y: cy, dir: 'v' }],
  ];
  candidates.sort((a, b) => a[0] - b[0]);
  return candidates[0][0] <= tolerance ? candidates[0][1] : null;
}

/* ---------- Objekte ---------- */

/** Belegte Fläche eines Objekts in Feldern (bei 90°/270° vertauscht) */
export function footprint(o: Pick<MapObject, 'type' | 'rot'>): { w: number; h: number } {
  const def = OBJECTS[o.type];
  return o.rot === 90 || o.rot === 270 ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

/** Oberstes Objekt an einem Punkt (Feld-Koordinaten) */
export function objectAt(m: MapDoc, fx: number, fy: number): MapObject | null {
  const sorted = sortedObjects(m);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const o = sorted[i];
    const f = footprint(o);
    if (fx >= o.x && fy >= o.y && fx < o.x + f.w && fy < o.y + f.h) return o;
  }
  return null;
}

/** Objekte in Zeichenreihenfolge (Teppiche unten) */
export function sortedObjects(m: MapDoc): MapObject[] {
  return [...m.objects].sort((a, b) => OBJECTS[a.type].z - OBJECTS[b.type].z);
}

export function clampObject(m: MapDoc, o: MapObject): void {
  const f = footprint(o);
  o.x = Math.max(0, Math.min(m.width - f.w, o.x));
  o.y = Math.max(0, Math.min(m.height - f.h, o.y));
}

/** Dreht um 90° im Uhrzeigersinn um die Mitte des Objekts (auf das Raster gerundet). */
export function rotateObject(m: MapDoc, o: MapObject): void {
  const before = footprint(o);
  const cx = o.x + before.w / 2;
  const cy = o.y + before.h / 2;
  o.rot = ((o.rot + 90) % 360) as Rotation;
  const after = footprint(o);
  o.x = Math.round(cx - after.w / 2);
  o.y = Math.round(cy - after.h / 2);
  clampObject(m, o);
}

/** Lichtquellen inklusive leuchtender Objekte (Feuer), für Anzeige und Export */
export function allLights(m: MapDoc): { x: number; y: number; range: number }[] {
  const out = m.lights.map((l) => ({ x: l.x + 0.5, y: l.y + 0.5, range: l.range }));
  for (const o of m.objects) {
    const def = OBJECTS[o.type];
    if (!def.light) continue;
    const f = footprint(o);
    out.push({ x: o.x + f.w / 2, y: o.y + f.h / 2, range: def.light });
  }
  return out;
}

/* ---------- Wände ---------- */

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Fasst Wandkanten zu möglichst langen geraden Segmenten zusammen (in Feld-Einheiten). */
export function wallSegments(m: MapDoc): Segment[] {
  const segs: Segment[] = [];
  const isWall = (e: Edge) => isWallEdge(m, e);

  for (let y = 0; y <= m.height; y++) {
    let start = -1;
    for (let x = 0; x <= m.width; x++) {
      const wall = x < m.width && isWall({ x, y, dir: 'h' });
      if (wall && start < 0) start = x;
      if (!wall && start >= 0) {
        segs.push({ x1: start, y1: y, x2: x, y2: y });
        start = -1;
      }
    }
  }
  for (let x = 0; x <= m.width; x++) {
    let start = -1;
    for (let y = 0; y <= m.height; y++) {
      const wall = y < m.height && isWall({ x, y, dir: 'v' });
      if (wall && start < 0) start = y;
      if (!wall && start >= 0) {
        segs.push({ x1: x, y1: start, x2: x, y2: y });
        start = -1;
      }
    }
  }
  return segs;
}

/** Ändert die Kartengröße; Inhalte oben links bleiben erhalten. */
export function resizeMap(m: MapDoc, width: number, height: number): MapDoc {
  const next = createMap(width, height, m.name, m.style);
  next.layers = structuredClone(m.layers);
  for (let y = 0; y < Math.min(m.height, next.height); y++) {
    for (let x = 0; x < Math.min(m.width, next.width); x++) {
      next.floor[y * next.width + x] = m.floor[y * m.width + x];
    }
  }
  next.lights = m.lights.filter((l) => inBounds(next, l.x, l.y));
  next.doors = m.doors.filter((d) => d.x <= next.width && d.y <= next.height);
  next.objects = m.objects
    .filter((o) => {
      const f = footprint(o);
      return o.x + f.w <= next.width && o.y + f.h <= next.height;
    })
    .map((o) => ({ ...o }));
  next.notes = m.notes.filter((n) => n.x < next.width && n.y < next.height).map((n) => ({ ...n }));
  next.story = m.story;
  cleanupDoors(next);
  return next;
}

/* ---------- Speichern / Laden ---------- */

export function serialize(m: MapDoc): string {
  return JSON.stringify(m);
}

/** Liest eine Projektdatei ein (auch das ältere Format 1) und prüft sie. Wirft bei ungültigen Daten. */
export function deserialize(text: string): MapDoc {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || (raw.version !== 1 && raw.version !== 2)) throw new Error('Unbekanntes Format');
  const width = clampSize(Number(raw.width));
  const height = clampSize(Number(raw.height));
  if (!Array.isArray(raw.floor) || raw.floor.length !== width * height) throw new Error('Ungültige Felddaten');
  const maxMat = MATERIALS.length;
  const m: MapDoc = {
    version: 2,
    name: typeof raw.name === 'string' ? raw.name : '',
    width,
    height,
    // „outdoor“ war der frühere gemeinsame Stil für Wald und Grasland
    style: raw.style === 'outdoor' ? 'grassland' : STYLES.includes(raw.style) ? raw.style : 'dungeon',
    floor: raw.floor.map((v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= maxMat ? v : 0)),
    doors: Array.isArray(raw.doors)
      ? raw.doors
          .filter((d: any) => d && (d.dir === 'h' || d.dir === 'v') && Number.isInteger(d.x) && Number.isInteger(d.y))
          .map((d: any) => ({ x: d.x, y: d.y, dir: d.dir }))
      : [],
    lights: Array.isArray(raw.lights)
      ? raw.lights
          .filter((l: any) => l && Number.isInteger(l.x) && Number.isInteger(l.y))
          .map((l: any) => ({ x: l.x, y: l.y, range: Number(l.range) > 0 ? Number(l.range) : DEFAULT_LIGHT_RANGE }))
      : [],
    objects: Array.isArray(raw.objects)
      ? raw.objects
          .filter((o: any) => o && o.type in OBJECTS && Number.isInteger(o.x) && Number.isInteger(o.y))
          .map((o: any) => ({
            id: typeof o.id === 'string' ? o.id : newId(),
            type: o.type,
            x: o.x,
            y: o.y,
            rot: [0, 90, 180, 270].includes(o.rot) ? o.rot : 0,
          }))
      : [],
    notes: Array.isArray(raw.notes)
      ? raw.notes
          .filter((n: any) => n && Number.isFinite(n.x) && Number.isFinite(n.y))
          .map((n: any, i: number) => ({
            id: typeof n.id === 'string' ? n.id : newId(),
            n: Number.isInteger(n.n) ? n.n : i + 1,
            x: n.x,
            y: n.y,
            title: typeof n.title === 'string' ? n.title : '',
            text: typeof n.text === 'string' ? n.text : '',
          }))
      : [],
    story: typeof raw.story === 'string' ? raw.story : '',
    layers: defaultLayers(),
  };
  if (raw.layers && typeof raw.layers === 'object') {
    for (const l of LAYERS) {
      const s = raw.layers[l];
      if (s) m.layers[l] = { visible: s.visible !== false, locked: s.locked === true };
    }
  }
  for (const o of m.objects) clampObject(m, o);
  cleanupDoors(m);
  return m;
}

/* ---------- Dynamische Größe ---------- */

/** Rand aus Fels, der beim automatischen Wachsen um den Inhalt frei bleibt */
export const GROW_MARGIN = 2;

/**
 * Ändert die Kartengröße an allen vier Seiten, ohne das Objekt zu ersetzen (positive Werte fügen
 * Felder hinzu, negative schneiden ab). Inhalte behalten ihre Lage zueinander; laufende Verweise
 * (z. B. ein gerade gezogenes Objekt) bleiben gültig.
 */
export function growInPlace(m: MapDoc, left: number, top: number, right: number, bottom: number): void {
  const w = m.width + left + right;
  const h = m.height + top + bottom;
  if (w < MIN_SIZE || h < MIN_SIZE || w > MAX_SIZE || h > MAX_SIZE) throw new Error('Ungültige Kartengröße');
  const floor = new Array(w * h).fill(0);
  for (let y = 0; y < m.height; y++) {
    const ny = y + top;
    if (ny < 0 || ny >= h) continue;
    for (let x = 0; x < m.width; x++) {
      const nx = x + left;
      if (nx >= 0 && nx < w) floor[ny * w + nx] = m.floor[y * m.width + x];
    }
  }
  m.width = w;
  m.height = h;
  m.floor = floor;
  for (const d of m.doors) (d.x += left), (d.y += top);
  for (const l of m.lights) (l.x += left), (l.y += top);
  for (const o of m.objects) (o.x += left), (o.y += top);
  for (const n of m.notes) (n.x += left), (n.y += top);
  m.notes = m.notes.filter((n) => n.x >= 0 && n.y >= 0 && n.x < w && n.y < h);
  m.lights = m.lights.filter((l) => inBounds(m, l.x, l.y));
  m.objects = m.objects.filter((o) => {
    const f = footprint(o);
    return o.x >= 0 && o.y >= 0 && o.x + f.w <= w && o.y + f.h <= h;
  });
  m.doors = m.doors.filter((d) => d.x >= 0 && d.y >= 0 && d.x <= w && d.y <= h);
  cleanupDoors(m);
}

/**
 * Sorgt dafür, dass der Bereich (x0, y0)–(x1, y1) (Felder, einschließlich) mit Rand in die Karte passt.
 * Gibt zurück, um wie viele Felder sich die Inhalte nach rechts/unten verschoben haben, oder null,
 * wenn nichts zu tun war. Die Größe bleibt höchstens MAX_SIZE.
 */
export function growToFit(m: MapDoc, x0: number, y0: number, x1: number, y1: number, margin = GROW_MARGIN): { dx: number; dy: number } | null {
  let left = Math.max(0, margin - Math.min(x0, x1));
  let top = Math.max(0, margin - Math.min(y0, y1));
  let right = Math.max(0, Math.max(x0, x1) + 1 + margin - m.width);
  let bottom = Math.max(0, Math.max(y0, y1) + 1 + margin - m.height);
  if (!left && !top && !right && !bottom) return null;
  // nicht über die Höchstgröße: zuerst die Seite kürzen, die gerade nicht gebraucht wird
  const fit = (a: number, b: number, size: number): [number, number] => {
    let over = size + a + b - MAX_SIZE;
    if (over <= 0) return [a, b];
    const cutB = Math.min(b, over);
    b -= cutB;
    over -= cutB;
    return [a - Math.min(a, over), b];
  };
  [left, right] = fit(left, right, m.width);
  [top, bottom] = fit(top, bottom, m.height);
  if (!left && !top && !right && !bottom) return null;
  growInPlace(m, left, top, right, bottom);
  return { dx: left, dy: top };
}

/** Umrandendes Rechteck aller Inhalte (Boden, Objekte, Lichter) in Feldern, oder null bei leerer Karte */
export function contentBounds(m: MapDoc): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (ax: number, ay: number, bx: number, by: number) => {
    x0 = Math.min(x0, ax);
    y0 = Math.min(y0, ay);
    x1 = Math.max(x1, bx);
    y1 = Math.max(y1, by);
  };
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.floor[y * m.width + x] > 0) add(x, y, x, y);
  for (const o of m.objects) {
    const f = footprint(o);
    add(o.x, o.y, o.x + f.w - 1, o.y + f.h - 1);
  }
  for (const l of m.lights) add(l.x, l.y, l.x, l.y);
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

/** Schneidet die Karte auf ihren Inhalt plus Rand zu. Gibt false zurück, wenn sich nichts ändert. */
export function trimToContent(m: MapDoc, margin = GROW_MARGIN): boolean {
  const b = contentBounds(m);
  if (!b) return false;
  let left = margin - b.x0;
  let top = margin - b.y0;
  let right = b.x1 + 1 + margin - m.width;
  let bottom = b.y1 + 1 + margin - m.height;
  // Mindestgröße einhalten (fehlende Felder rechts/unten anfügen)
  const w = m.width + left + right;
  const h = m.height + top + bottom;
  if (w < MIN_SIZE) right += MIN_SIZE - w;
  if (h < MIN_SIZE) bottom += MIN_SIZE - h;
  if (!left && !top && !right && !bottom) return false;
  growInPlace(m, left, top, right, bottom);
  return true;
}
