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
export const MATERIALS = ['stone', 'wood', 'marble', 'earth', 'water'] as const;
export type Material = (typeof MATERIALS)[number];
export const materialId = (m: Material): number => MATERIALS.indexOf(m) + 1;
export const materialOf = (id: number): Material | null => MATERIALS[id - 1] ?? null;

export const STYLES = ['dungeon', 'temple', 'tavern', 'cave'] as const;
export type StyleId = (typeof STYLES)[number];

export const LAYERS = ['floor', 'objects', 'doors', 'lights', 'grid'] as const;
export type LayerId = (typeof LAYERS)[number];
export interface LayerState {
  visible: boolean;
  locked: boolean;
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
    style: STYLES.includes(raw.style) ? raw.style : 'dungeon',
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
