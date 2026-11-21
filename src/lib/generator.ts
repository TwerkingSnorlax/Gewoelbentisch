// Zufallsgenerator: legt Räume an, verbindet sie mit Gängen, setzt Türen und richtet die Räume
// passend zum Stil ein. Gleicher Startwert (Seed) ergibt dieselbe Karte.
import {
  cleanupDoors,
  createMap,
  footprint,
  isFloor,
  isOpenEdge,
  materialId,
  newId,
  type Edge,
  type MapDoc,
  type Rotation,
  type StyleId,
} from './map';
import type { ObjectType } from './objects';
import { STYLE_DEFS } from './render';

export interface GenOptions {
  width: number;
  height: number;
  rooms: number;
  style: StyleId;
  seed: number;
  name: string;
}

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Kleiner, schneller Zufallsgenerator mit Startwert (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (p: number) => next() < p,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export function generateMap(o: GenOptions): MapDoc {
  if (o.style === 'outdoor') return generateOutdoor(o);
  const r = rng(o.seed);
  const m = createMap(o.width, o.height, o.name, o.style);
  const W = m.width;
  const H = m.height;
  const mat = materialId(STYLE_DEFS[o.style].material);
  const cave = o.style === 'cave';
  const roomOf = new Int16Array(W * H).fill(-1);

  /* ---- Räume ---- */
  const rooms: Room[] = [];
  const maxRoom = Math.max(4, Math.min(o.style === 'tavern' ? 10 : 9, Math.floor(Math.min(W, H) / 2.5)));
  for (let attempt = 0; attempt < 400 && rooms.length < o.rooms; attempt++) {
    // der erste Raum wird groß (Halle, Heiligtum, Schankstube)
    const minSize = rooms.length === 0 ? Math.max(3, Math.ceil(maxRoom * 0.75)) : 3;
    const w = r.int(minSize, maxRoom);
    const h = r.int(minSize, maxRoom);
    if (w + 2 > W || h + 2 > H) continue;
    const x = r.int(1, W - w - 1);
    const y = r.int(1, H - h - 1);
    const margin = 2;
    if (rooms.some((q) => x < q.x + q.w + margin && x + w + margin > q.x && y < q.y + q.h + margin && y + h + margin > q.y)) continue;
    rooms.push({ x, y, w, h });
  }
  if (rooms.length === 0) rooms.push({ x: 1, y: 1, w: Math.min(5, W - 2), h: Math.min(5, H - 2) });

  rooms.forEach((room, i) => {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (cave) {
          // Höhlen: elliptisch mit unregelmäßigem Rand
          const nx = (x + 0.5 - (room.x + room.w / 2)) / (room.w / 2);
          const ny = (y + 0.5 - (room.y + room.h / 2)) / (room.h / 2);
          if (nx * nx + ny * ny > 1.05 + (r.next() - 0.5) * 0.5) continue;
        }
        m.floor[y * W + x] = mat;
        roomOf[y * W + x] = i;
      }
    }
  });

  /* ---- Gänge (Prim: immer den nächsten noch nicht verbundenen Raum anschließen) ---- */
  const center = (q: Room) => ({ x: Math.floor(q.x + q.w / 2), y: Math.floor(q.y + q.h / 2) });
  const dist = (a: Room, b: Room) => {
    const ca = center(a);
    const cb = center(b);
    return Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
  };
  const links: [number, number][] = [];
  const connected = new Set([0]);
  while (connected.size < rooms.length) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const a of connected) {
      for (let b = 0; b < rooms.length; b++) {
        if (connected.has(b)) continue;
        const d = dist(rooms[a], rooms[b]);
        if (d < bestD) {
          bestD = d;
          best = [a, b];
        }
      }
    }
    if (!best) break;
    connected.add(best[1]);
    links.push(best);
  }
  // ein paar zusätzliche Verbindungen für Rundwege
  for (let i = 0; i < rooms.length; i++) {
    if (!r.chance(0.25)) continue;
    const others = rooms.map((_, j) => j).filter((j) => j !== i && !links.some(([a, b]) => (a === i && b === j) || (a === j && b === i)));
    if (others.length) links.push([i, others.sort((a, b) => dist(rooms[i], rooms[a]) - dist(rooms[i], rooms[b]))[0]]);
  }

  const doorChance = { dungeon: 0.7, temple: 0.5, tavern: 0.85, cave: 0 }[o.style];
  const doorCandidates: Edge[] = [];
  for (const [a, b] of links) {
    const ca = center(rooms[a]);
    const cb = center(rooms[b]);
    const path: { x: number; y: number }[] = [];
    const horizontalFirst = r.chance(0.5);
    let { x, y } = ca;
    path.push({ x, y });
    const stepX = () => {
      while (x !== cb.x) {
        x += Math.sign(cb.x - x);
        path.push({ x, y });
      }
    };
    const stepY = () => {
      while (y !== cb.y) {
        y += Math.sign(cb.y - y);
        path.push({ x, y });
      }
    };
    if (horizontalFirst) (stepX(), stepY());
    else (stepY(), stepX());

    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const idx = p.y * W + p.x;
      if (roomOf[idx] < 0) m.floor[idx] = mat;
      if (i === 0) continue;
      const q = path[i - 1];
      const inP = roomOf[idx] >= 0;
      const inQ = roomOf[q.y * W + q.x] >= 0;
      if (inP !== inQ) {
        doorCandidates.push(p.x === q.x ? { x: p.x, y: Math.max(p.y, q.y), dir: 'h' } : { x: Math.max(p.x, q.x), y: p.y, dir: 'v' });
      }
    }
  }

  // Türen nur in schmalen Durchgängen (links und rechts Fels)
  for (const e of doorCandidates) {
    if (!r.chance(doorChance) || !isOpenEdge(m, e)) continue;
    // ein Feld ist schmal, wenn quer zur Tür auf beiden Seiten Fels liegt
    const narrowCell = (cx: number, cy: number, across: 'x' | 'y') =>
      across === 'x' ? !isFloor(m, cx - 1, cy) && !isFloor(m, cx + 1, cy) : !isFloor(m, cx, cy - 1) && !isFloor(m, cx, cy + 1);
    const narrow =
      e.dir === 'h'
        ? narrowCell(e.x, e.y, 'x') || narrowCell(e.x, e.y - 1, 'x')
        : narrowCell(e.x, e.y, 'y') || narrowCell(e.x - 1, e.y, 'y');
    if (narrow && !m.doors.some((d) => d.x === e.x && d.y === e.y && d.dir === e.dir)) m.doors.push(e);
  }
  cleanupDoors(m);

  /* ---- Einrichtung ---- */
  const occupied = new Uint8Array(W * H);
  // Felder an Raumeingängen frei halten (Raumfeld mit Gang- oder Fremdraum-Nachbar)
  const keepFree = (x: number, y: number) => {
    const ri = roomOf[y * W + x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (isFloor(m, nx, ny) && roomOf[ny * W + nx] !== ri) return true;
    }
    return false;
  };
  const place = (type: ObjectType, x: number, y: number, rot: Rotation = 0, room?: number): boolean => {
    const f = footprint({ type, rot });
    for (let yy = y; yy < y + f.h; yy++) {
      for (let xx = x; xx < x + f.w; xx++) {
        if (!isFloor(m, xx, yy) || occupied[yy * W + xx] || keepFree(xx, yy)) return false;
        if (room !== undefined && roomOf[yy * W + xx] !== room) return false;
      }
    }
    if (type !== 'rug') for (let yy = y; yy < y + f.h; yy++) for (let xx = x; xx < x + f.w; xx++) occupied[yy * W + xx] = 1;
    m.objects.push({ id: newId(), type, x, y, rot });
    return true;
  };
  const scatter = (room: number, types: readonly ObjectType[], count: number) => {
    const q = rooms[room];
    let placed = 0;
    for (let t = 0; t < count * 15 && placed < count; t++) {
      const type = r.pick(types);
      const rot = r.pick([0, 90, 180, 270] as const);
      if (place(type, r.int(q.x, q.x + q.w - 1), r.int(q.y, q.y + q.h - 1), rot, room)) placed++;
    }
  };
  /** an eine Wand stellen (oben oder unten im Raum) */
  const againstWall = (room: number, type: ObjectType) => {
    const q = rooms[room];
    for (let t = 0; t < 20; t++) {
      const top = r.chance(0.5);
      const f = footprint({ type, rot: top ? 0 : 180 });
      const x = r.int(q.x, q.x + q.w - f.w);
      if (place(type, x, top ? q.y : q.y + q.h - f.h, top ? 0 : 180, room)) return true;
    }
    return false;
  };
  const pillars = (room: number) => {
    const q = rooms[room];
    if (q.w < 5 || q.h < 5) return;
    for (let x = q.x + 1; x < q.x + q.w - 1; x += 2) {
      place('pillar', x, q.y + 1, 0, room);
      place('pillar', x, q.y + q.h - 2, 0, room);
    }
  };
  const bySize = rooms.map((_, i) => i).sort((a, b) => rooms[b].w * rooms[b].h - rooms[a].w * rooms[a].h);
  const main = bySize[0];

  switch (o.style) {
    case 'dungeon':
      rooms.forEach((q, i) => {
        if (i === main || (q.w >= 6 && q.h >= 6 && r.chance(0.5))) pillars(i);
        scatter(i, ['chest', 'barrel', 'crate', 'bones', 'boulder'], r.int(1, 3));
        if (r.chance(0.5)) scatter(i, ['brazier'], 1);
        else m.lights.push({ x: center(q).x, y: center(q).y, range: 6 });
      });
      scatter(bySize[bySize.length - 1], ['stairs'], 1);
      break;
    case 'temple': {
      const q = rooms[main];
      // Heiligtum: Altar mittig an der oberen Wand, Feuerschalen daneben, Teppich davor, dann Säulenreihen
      const mid = Math.floor(q.x + q.w / 2) - 1;
      if (!place('altar', mid, q.y, 0, main)) againstWall(main, 'altar');
      place('brazier', mid - 1, q.y, 0, main);
      place('brazier', mid + 2, q.y, 0, main);
      place('rug', mid, q.y + 2, 0, main);
      pillars(main);
      rooms.forEach((rq, i) => {
        if (i === main) return;
        if (rq.w >= 5 && rq.h >= 5 && r.chance(0.4)) place('fountain', Math.floor(rq.x + rq.w / 2) - 1, Math.floor(rq.y + rq.h / 2) - 1, 0, i);
        scatter(i, ['sarcophagus', 'statue', 'statue', 'brazier'], r.int(1, 3));
      });
      scatter(bySize[bySize.length - 1], ['stairs'], 1);
      break;
    }
    case 'tavern': {
      const q = rooms[main];
      againstWall(main, 'counter');
      againstWall(main, 'fireplace');
      // Tischgruppen: runder Tisch mit Stühlen links und rechts
      let tables = 0;
      for (let t = 0; t < 80 && tables < Math.max(1, Math.floor((q.w * q.h) / 14)); t++) {
        const x = r.int(q.x + 1, q.x + q.w - 3);
        const y = r.int(q.y + 1, q.y + q.h - 2);
        if (place('roundtable', x, y, 0, main)) {
          tables++;
          place('chair', x - 1, y + r.int(0, 1), 270, main);
          place('chair', x + 2, y + r.int(0, 1), 90, main);
        }
      }
      scatter(main, ['barrel'], 2);
      rooms.forEach((_, i) => {
        if (i === main) return;
        const kind = r.pick(['bed', 'bed', 'store', 'kitchen'] as const);
        if (kind === 'bed') {
          againstWall(i, 'bed');
          scatter(i, ['chest', 'chair'], 1);
          if (r.chance(0.5)) scatter(i, ['rug'], 1);
        } else if (kind === 'store') {
          scatter(i, ['barrel', 'crate', 'crate', 'barrel'], r.int(3, 6));
        } else {
          againstWall(i, 'shelf');
          scatter(i, ['table', 'barrel'], 2);
        }
        m.lights.push({ x: center(rooms[i]).x, y: center(rooms[i]).y, range: 4 });
      });
      break;
    }
    case 'cave': {
      rooms.forEach((rq, i) => {
        if (i === main) scatter(i, ['campfire'], 1);
        // kleiner Tümpel
        if (i !== main && rq.w >= 5 && rq.h >= 5 && r.chance(0.5)) {
          const c = center(rq);
          for (let y = c.y - 1; y <= c.y + 1; y++)
            for (let x = c.x - 1; x <= c.x + 1; x++) if (r.chance(0.85) && roomOf[y * W + x] === i && !keepFree(x, y)) m.floor[y * W + x] = materialId('water');
        }
        scatter(i, ['boulder', 'boulder', 'bones', 'chest'], r.int(1, 4));
      });
      break;
    }
  }

  return m;
}

/**
 * Wald & Grasland: die ganze Karte ist Wiese. Lichtungen werden mit gewundenen Erdwegen verbunden,
 * dazu ein Teich, Waldstücke (dicht in der Mitte, Büsche am Rand) und Einrichtung je Lichtung.
 */
function generateOutdoor(o: GenOptions): MapDoc {
  const r = rng(o.seed);
  const m = createMap(o.width, o.height, o.name, 'outdoor');
  const W = m.width;
  const H = m.height;
  const earth = materialId('earth');
  const water = materialId('water');
  const keepOpen = new Uint8Array(W * H); // keine Bäume (Wege, Lichtungen, Wasser)
  const occupied = new Uint8Array(W * H);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const open = (x: number, y: number, rad = 0) => {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (inside(x + dx, y + dy)) keepOpen[(y + dy) * W + x + dx] = 1;
  };

  /* ---- Lichtungen ---- */
  const clearings: { x: number; y: number; r: number }[] = [];
  const count = Math.max(2, Math.min(o.rooms, 12));
  for (let t = 0; t < 400 && clearings.length < count; t++) {
    const rad = r.int(2, Math.max(2, Math.min(4, Math.floor(Math.min(W, H) / 6))));
    const x = r.int(rad + 1, W - rad - 2);
    const y = r.int(rad + 1, H - rad - 2);
    if (clearings.some((q) => Math.hypot(q.x - x, q.y - y) < q.r + rad + 4)) continue;
    clearings.push({ x, y, r: rad });
  }
  if (!clearings.length) clearings.push({ x: Math.floor(W / 2), y: Math.floor(H / 2), r: 2 });
  for (const q of clearings) {
    for (let y = q.y - q.r; y <= q.y + q.r; y++)
      for (let x = q.x - q.r; x <= q.x + q.r; x++) if (inside(x, y) && Math.hypot(x - q.x, y - q.y) <= q.r + 0.5) keepOpen[y * W + x] = 1;
  }

  /* ---- Wege: gewunden von Lichtung zu Lichtung, dazu einer vom Kartenrand ---- */
  const path = (ax: number, ay: number, bx: number, by: number) => {
    let x = ax;
    let y = ay;
    for (let guard = 0; guard < W * H && (x !== bx || y !== by); guard++) {
      m.floor[y * W + x] = earth;
      open(x, y, 1);
      const towardX = x !== bx && (y === by || r.chance(Math.abs(bx - x) / (Math.abs(bx - x) + Math.abs(by - y))));
      if (r.chance(0.18)) {
        // seitlicher Schlenker
        const nx = towardX ? x : x + r.pick([-1, 1]);
        const ny = towardX ? y + r.pick([-1, 1]) : y;
        if (inside(nx, ny)) (x = nx), (y = ny);
        continue;
      }
      if (towardX) x += Math.sign(bx - x);
      else y += Math.sign(by - y);
    }
    m.floor[by * W + bx] = earth;
  };
  const connected = [0];
  const rest = clearings.map((_, i) => i).slice(1);
  while (rest.length) {
    let best = [0, 0];
    let bestD = Infinity;
    for (const a of connected)
      for (const b of rest) {
        const d = Math.hypot(clearings[a].x - clearings[b].x, clearings[a].y - clearings[b].y);
        if (d < bestD) (bestD = d), (best = [a, b]);
      }
    path(clearings[best[0]].x, clearings[best[0]].y, clearings[best[1]].x, clearings[best[1]].y);
    connected.push(best[1]);
    rest.splice(rest.indexOf(best[1]), 1);
  }
  const first = clearings[0];
  const edge = r.pick(['l', 'r', 't', 'b'] as const);
  const ex = edge === 'l' ? 0 : edge === 'r' ? W - 1 : first.x;
  const ey = edge === 't' ? 0 : edge === 'b' ? H - 1 : first.y;
  path(ex, ey, first.x, first.y);

  /* ---- Teich ---- */
  for (let t = 0; t < 60; t++) {
    const rx = r.int(2, 3);
    const ry = r.int(1, 3);
    const cx = r.int(rx + 1, W - rx - 2);
    const cy = r.int(ry + 1, H - ry - 2);
    let clash = false;
    for (let y = cy - ry - 1; y <= cy + ry + 1 && !clash; y++)
      for (let x = cx - rx - 1; x <= cx + rx + 1; x++) if (inside(x, y) && (keepOpen[y * W + x] || m.floor[y * W + x])) clash = true;
    if (clash) continue;
    for (let y = cy - ry; y <= cy + ry; y++)
      for (let x = cx - rx; x <= cx + rx; x++) {
        const nx = (x - cx) / (rx + 0.5);
        const ny = (y - cy) / (ry + 0.5);
        if (nx * nx + ny * ny <= 1 + (r.next() - 0.5) * 0.3) {
          m.floor[y * W + x] = water;
          open(x, y, 1);
        }
      }
    break;
  }

  /* ---- Objekte ---- */
  const place = (type: ObjectType, x: number, y: number, rot: Rotation = 0, allowOpen = false): boolean => {
    const f = footprint({ type, rot });
    for (let yy = y; yy < y + f.h; yy++)
      for (let xx = x; xx < x + f.w; xx++) {
        if (!inside(xx, yy) || occupied[yy * W + xx] || m.floor[yy * W + xx] === water) return false;
        if (!allowOpen && keepOpen[yy * W + xx]) return false;
        if (allowOpen && m.floor[yy * W + xx] === earth) return false; // nicht auf den Weg
      }
    for (let yy = y; yy < y + f.h; yy++) for (let xx = x; xx < x + f.w; xx++) occupied[yy * W + xx] = 1;
    m.objects.push({ id: newId(), type, x, y, rot });
    return true;
  };

  // Waldstücke als weiche Flecken
  const blobs = Array.from({ length: Math.max(4, Math.round((W * H) / 65)) }, () => ({
    x: r.int(0, W - 1),
    y: r.int(0, H - 1),
    rad: r.int(3, Math.max(4, Math.floor(Math.min(W, H) / 3))),
  }));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let p = 0.03;
      for (const b of blobs) p = Math.max(p, 1 - Math.hypot(x - b.x, y - b.y) / b.rad);
      if (r.next() > Math.min(0.95, p * 1.1)) continue;
      if (p > 0.45) {
        if (r.chance(0.12) && place('bigtree', x, y)) continue;
        place(r.chance(0.4) ? 'pine' : 'tree', x, y);
      } else if (p > 0.2) {
        place(r.chance(0.5) ? 'bush' : 'tree', x, y);
      } else if (r.chance(0.3)) {
        place(r.pick(['bush', 'stump', 'boulder'] as const), x, y);
      }
    }
  }

  // Lichtungen einrichten: Lager mit Feuer und Zelten, Ruine, sonst Kleinkram
  const spot = (q: { x: number; y: number; r: number }, type: ObjectType, tries = 25) => {
    for (let t = 0; t < tries; t++) {
      const rot = r.pick([0, 90, 180, 270] as const);
      if (place(type, r.int(q.x - q.r, q.x + q.r), r.int(q.y - q.r, q.y + q.r), rot, true)) return true;
    }
    return false;
  };
  clearings.forEach((q, i) => {
    if (i === 0) {
      if (!place('campfire', q.x, q.y, 0, true)) spot(q, 'campfire');
      for (let k = 0; k < Math.min(3, q.r); k++) spot(q, 'tent');
      spot(q, 'log');
    } else if (i === 1 && q.r >= 2) {
      // Ruine: Steinplatten mit Säulen
      const stone = materialId('marble');
      for (let y = q.y - 1; y <= q.y + 1; y++) for (let x = q.x - 1; x <= q.x + 1; x++) if (inside(x, y) && m.floor[y * W + x] !== water) m.floor[y * W + x] = stone;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (r.chance(0.7)) place('pillar', q.x + dx, q.y + dy, 0, true);
      spot(q, 'statue');
    } else {
      for (let k = r.int(1, 3); k > 0; k--) spot(q, r.pick(['stump', 'log', 'boulder', 'bush', 'chest'] as const));
    }
  });
  return m;
}
