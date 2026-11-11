// Datenmodell einer Battlemap: Raster aus Feldern (Boden oder Fels),
// Türen auf Kanten zwischen Feldern und Lichtquellen in Feldmitten.

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

export interface MapDoc {
  version: 1;
  name: string;
  width: number;
  height: number;
  /** width * height Einträge, 1 = Boden, 0 = Fels */
  floor: number[];
  doors: Edge[];
  lights: Light[];
}

export const MIN_SIZE = 4;
export const MAX_SIZE = 200;
export const DEFAULT_LIGHT_RANGE = 6;

export function clampSize(n: number): number {
  if (!Number.isFinite(n)) return MIN_SIZE;
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(n)));
}

export function createMap(width: number, height: number, name: string): MapDoc {
  const w = clampSize(width);
  const h = clampSize(height);
  return { version: 1, name, width: w, height: h, floor: new Array(w * h).fill(0), doors: [], lights: [] };
}

export function inBounds(m: MapDoc, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.width && y < m.height;
}

export function isFloor(m: MapDoc, x: number, y: number): boolean {
  return inBounds(m, x, y) && m.floor[y * m.width + x] === 1;
}

/** Setzt ein Feld. Gibt true zurück, wenn sich etwas geändert hat. */
export function setFloor(m: MapDoc, x: number, y: number, value: boolean): boolean {
  if (!inBounds(m, x, y)) return false;
  const i = y * m.width + x;
  const v = value ? 1 : 0;
  if (m.floor[i] === v) return false;
  m.floor[i] = v;
  return true;
}

export function fillRect(m: MapDoc, x0: number, y0: number, x1: number, y1: number, value: boolean): boolean {
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
  const next = createMap(width, height, m.name);
  for (let y = 0; y < Math.min(m.height, next.height); y++) {
    for (let x = 0; x < Math.min(m.width, next.width); x++) {
      next.floor[y * next.width + x] = m.floor[y * m.width + x];
    }
  }
  next.lights = m.lights.filter((l) => inBounds(next, l.x, l.y));
  next.doors = m.doors.filter((d) => d.x <= next.width && d.y <= next.height);
  cleanupDoors(next);
  return next;
}

export function serialize(m: MapDoc): string {
  return JSON.stringify(m);
}

/** Liest eine Projektdatei ein und prüft sie. Wirft bei ungültigen Daten. */
export function deserialize(text: string): MapDoc {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || raw.version !== 1) throw new Error('Unbekanntes Format');
  const width = clampSize(Number(raw.width));
  const height = clampSize(Number(raw.height));
  if (!Array.isArray(raw.floor) || raw.floor.length !== width * height) throw new Error('Ungültige Felddaten');
  const m: MapDoc = {
    version: 1,
    name: typeof raw.name === 'string' ? raw.name : '',
    width,
    height,
    floor: raw.floor.map((v: unknown) => (v === 1 ? 1 : 0)),
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
  };
  cleanupDoors(m);
  return m;
}
