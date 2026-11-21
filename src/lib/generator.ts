// Zufallsgenerator. Jede Karte hat einen Anfang (Eingang vom Kartenrand) und ein Ziel, die Räume haben
// eine Aufgabe (Wachstube, Lager, Gruft, Schankraum …) und eine kurze Beschreibung als nummerierte
// Raummarke; dazu eine Hintergrundgeschichte. Gleicher Startwert (Seed) ergibt dieselbe Karte.
import {
  circleCells,
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

type Rng = ReturnType<typeof rng>;

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
  switch (o.style) {
    case 'temple':
      return generateTemple(o);
    case 'tavern':
      return generateTavern(o);
    case 'forest':
    case 'grassland':
      return generateWild(o);
    default:
      return generateDungeon(o);
  }
}

/* =====================================================================================
   Gemeinsame Werkzeuge
   ===================================================================================== */

/** Arbeitsfläche für einen Generator: Karte, Raumzuordnung, belegte Felder, Platzieren von Objekten */
class Builder {
  m: MapDoc;
  W: number;
  H: number;
  r: Rng;
  roomOf: Int16Array;
  occupied: Uint8Array;
  rooms: Room[] = [];
  /** runde Räume: Raum-Nummer → Kreis */
  round = new Map<number, { cx: number; cy: number; r: number }>();

  constructor(o: GenOptions) {
    this.r = rng(o.seed);
    this.m = createMap(o.width, o.height, o.name, o.style);
    this.W = this.m.width;
    this.H = this.m.height;
    this.roomOf = new Int16Array(this.W * this.H).fill(-1);
    this.occupied = new Uint8Array(this.W * this.H);
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.W && y < this.H;
  }

  set(x: number, y: number, mat: number, room = -1) {
    if (!this.inside(x, y)) return;
    this.m.floor[y * this.W + x] = mat;
    if (room >= 0) this.roomOf[y * this.W + x] = room;
  }

  carveRoom(q: Room, mat: number): number {
    const id = this.rooms.length;
    this.rooms.push(q);
    for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) this.set(x, y, mat, id);
    return id;
  }

  /** Runden Raum anlegen (Kreis mit Mittelpunkt cx, cy und Radius r in Feldern) */
  carveCircle(cx: number, cy: number, rad: number, mat: number): number {
    const id = this.rooms.length;
    this.rooms.push({ x: Math.floor(cx - rad), y: Math.floor(cy - rad), w: Math.ceil(rad * 2), h: Math.ceil(rad * 2) });
    for (const [x, y] of circleCells({ cx, cy, r: rad })) this.set(x, y, mat, id);
    this.m.circles.push({ id: newId(), cx, cy, r: rad });
    this.round.set(id, { cx, cy, r: rad });
    return id;
  }

  /** Säulenkranz in einem runden Raum */
  ringPillars(room: number, count = 6) {
    const q = this.rooms[room];
    const cx = q.x + q.w / 2;
    const cy = q.y + q.h / 2;
    const rad = Math.max(1, q.w / 2 - 1.5);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + Math.PI / count;
      this.place('pillar', Math.floor(cx + Math.cos(a) * rad), Math.floor(cy + Math.sin(a) * rad), 0, room);
    }
  }

  /** Tür auf der Kante zwischen zwei benachbarten Feldern */
  door(ax: number, ay: number, bx: number, by: number) {
    const e: Edge = ax === bx ? { x: ax, y: Math.max(ay, by), dir: 'h' } : { x: Math.max(ax, bx), y: ay, dir: 'v' };
    if (isOpenEdge(this.m, e) && !this.m.doors.some((d) => d.x === e.x && d.y === e.y && d.dir === e.dir)) this.m.doors.push(e);
  }

  /** Feld frei halten, wenn es an Boden eines anderen Raums oder Gangs grenzt (Eingänge) */
  keepFree(x: number, y: number) {
    const ri = this.roomOf[y * this.W + x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (isFloor(this.m, nx, ny) && this.roomOf[ny * this.W + nx] !== ri) return true;
    }
    return false;
  }

  place(type: ObjectType, x: number, y: number, rot: Rotation = 0, room?: number): boolean {
    const f = footprint({ type, rot });
    for (let yy = y; yy < y + f.h; yy++) {
      for (let xx = x; xx < x + f.w; xx++) {
        if (!isFloor(this.m, xx, yy) || this.occupied[yy * this.W + xx] || this.keepFree(xx, yy)) return false;
        if (room !== undefined && this.roomOf[yy * this.W + xx] !== room) return false;
        // in runden Räumen nur Felder, die ganz im Kreis liegen
        const q = this.round.get(this.roomOf[yy * this.W + xx]);
        if (q && (Math.abs(xx + 0.5 - q.cx) + 0.5) ** 2 + (Math.abs(yy + 0.5 - q.cy) + 0.5) ** 2 > q.r * q.r) return false;
      }
    }
    if (type !== 'rug') for (let yy = y; yy < y + f.h; yy++) for (let xx = x; xx < x + f.w; xx++) this.occupied[yy * this.W + xx] = 1;
    this.m.objects.push({ id: newId(), type, x, y, rot });
    return true;
  }

  /** zufällig im Raum verteilen */
  scatter(room: number, types: readonly ObjectType[], count: number): number {
    const q = this.rooms[room];
    let placed = 0;
    for (let t = 0; t < count * 20 && placed < count; t++) {
      const type = this.r.pick(types);
      const rot = this.r.pick([0, 90, 180, 270] as const);
      if (this.place(type, this.r.int(q.x, q.x + q.w - 1), this.r.int(q.y, q.y + q.h - 1), rot, room)) placed++;
    }
    return placed;
  }

  /** an eine Wand stellen (Rückseite zur Wand) */
  againstWall(room: number, type: ObjectType, sides: readonly ('t' | 'b' | 'l' | 'r')[] = ['t', 'b', 'l', 'r']): boolean {
    const q = this.rooms[room];
    for (let t = 0; t < 30; t++) {
      const side = this.r.pick(sides);
      const rot: Rotation = side === 't' ? 0 : side === 'b' ? 180 : side === 'l' ? 270 : 90;
      const f = footprint({ type, rot });
      const x = side === 'l' ? q.x : side === 'r' ? q.x + q.w - f.w : this.r.int(q.x, q.x + q.w - f.w);
      const y = side === 't' ? q.y : side === 'b' ? q.y + q.h - f.h : this.r.int(q.y, q.y + q.h - f.h);
      if (this.place(type, x, y, rot, room)) return true;
    }
    return false;
  }

  /** Säulenreihen entlang der Längswände */
  pillars(room: number, step = 2) {
    const q = this.rooms[room];
    if (q.w < 5 || q.h < 5) return;
    if (q.w >= q.h) {
      for (let x = q.x + 1; x < q.x + q.w - 1; x += step) {
        this.place('pillar', x, q.y + 1, 0, room);
        this.place('pillar', x, q.y + q.h - 2, 0, room);
      }
    } else {
      for (let y = q.y + 1; y < q.y + q.h - 1; y += step) {
        this.place('pillar', q.x + 1, y, 0, room);
        this.place('pillar', q.x + q.w - 2, y, 0, room);
      }
    }
  }

  light(room: number, range = 6) {
    const q = this.rooms[room];
    this.m.lights.push({ x: Math.floor(q.x + q.w / 2), y: Math.floor(q.y + q.h / 2), range });
  }

  /** Raummarke auf ein freies Feld nahe der Raummitte */
  note(room: Room, title: string, text: string) {
    const cx = room.x + room.w / 2 - 0.5;
    const cy = room.y + room.h / 2 - 0.5;
    let best: [number, number] = [Math.floor(cx), Math.floor(cy)];
    let bestD = Infinity;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (!isFloor(this.m, x, y) || this.occupied[y * this.W + x]) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bestD) (bestD = d), (best = [x, y]);
      }
    }
    this.m.notes.push({ id: newId(), n: this.m.notes.length + 1, x: best[0] + 0.5, y: best[1] + 0.5, title, text });
  }
}

/** Zufälliger Eintrag aus einer Liste von Beschreibungen, {name} wird ersetzt */
function say(r: Rng, texts: readonly string[], vars: Record<string, string> = {}): string {
  let t = r.pick(texts);
  for (const [k, v] of Object.entries(vars)) t = t.replaceAll(`{${k}}`, v);
  return t;
}

/** Namen aus Silben (für Fürsten, Gottheiten, Wirte) */
function nameOf(r: Rng): string {
  const a = ['Var', 'Mor', 'Ael', 'Thar', 'Sel', 'Grim', 'Ul', 'Ber', 'Kael', 'Ys', 'Dra', 'Hel'];
  const b = ['ek', 'wyn', 'dor', 'ia', 'grim', 'ath', 'ric', 'ena', 'os', 'mar', 'und', 'eth'];
  return r.pick(a) + r.pick(b);
}

/* =====================================================================================
   Gewölbe und Höhle: Räume mit Gängen, Eingang am Kartenrand, Weg zum Ziel
   ===================================================================================== */

type DungeonRole = 'entry' | 'guard' | 'hall' | 'barracks' | 'shrine' | 'storage' | 'prison' | 'crypt' | 'well' | 'goal';

const DUNGEON_STORIES = [
  {
    title: 'Grab des Fürsten {name}',
    story:
      'Vor drei Jahrhunderten ließ sich Fürst {name} mit seinem Schatz einmauern. Grabräuber haben den Eingang freigelegt – doch keiner von ihnen kam zurück.',
    goal: ['Grabkammer des Fürsten', 'Der Sarkophag von {name} ruht zwischen zwei Feuerschalen, die nie erlöschen. Die Truhen daneben sind versiegelt.'],
  },
  {
    title: 'Versteck des Kults von {name}',
    story:
      'Unter einer verfallenen Wachstation treffen sich die Anhänger von {name}. Seit Wochen verschwinden Menschen aus dem nahen Dorf.',
    goal: ['Ritualkammer', 'Ein Altar, frische Wachsreste und Zeichen an den Wänden. Hier soll in der nächsten Neumondnacht das Ritual vollendet werden.'],
  },
  {
    title: 'Die verlassene Feste {name}',
    story:
      'Zwerge haben diese Feste in den Fels geschlagen und dann überstürzt verlassen. Was sie vertrieben hat, steht in keiner Chronik.',
    goal: ['Schatzkammer', 'Schwere Truhen mit dem Klanzeichen von {name}. Eine Treppe führt noch tiefer – dorthin, wovor die Zwerge flohen.'],
  },
  {
    title: 'Schmugglerkeller von {name}',
    story: 'Unter einem Lagerhaus am Hafen betreibt die Bande von {name} ihr Geschäft. Die Stadtwache sucht seit Monaten nach dem Zugang.',
    goal: ['Kontor der Bande', 'Kisten voller Schmuggelware, ein Tisch mit Kontobüchern – und der Fluchtweg über eine Treppe zum Wasser.'],
  },
];

const CAVE_STORIES = [
  {
    title: 'Höhle der Bestie',
    story: 'Hirten berichten von gerissenen Schafen und einem Brüllen aus den Hügeln. Die Spuren führen zu dieser Höhle.',
    goal: ['Lager der Bestie', 'Abgenagte Knochen überall, in einer Nische die Habseligkeiten früherer Opfer.'],
  },
  {
    title: 'Goblinbau der Sippe {name}',
    story: 'Die Goblins von Häuptling {name} überfallen seit dem Frühjahr Händler auf der Passstraße. Ihr Bau liegt tief im Fels.',
    goal: ['Thronhöhle des Häuptlings', 'Ein Lagerfeuer, ein Haufen Beute und ein grob gezimmerter Thron.'],
  },
  {
    title: 'Grotte des {name}',
    story: 'Ein Einsiedler namens {name} soll hier Kristalle mit heilender Kraft gefunden haben. Seit einem Jahr hat ihn niemand gesehen.',
    goal: ['Kristallgrotte', 'Ein unterirdischer Tümpel, daneben das verlassene Lager des Einsiedlers und eine Truhe mit seinen Aufzeichnungen.'],
  },
];

const ROLE_TEXT: Record<DungeonRole, [string, readonly string[]]> = {
  entry: ['Eingang', ['Ein schmaler Gang führt von draußen herein. Kalte Luft und Fackelruß an der Decke.', 'Der Zugang ist halb verschüttet. Frische Spuren im Staub führen hinein.']],
  guard: ['Wachstube', ['Ein Tisch, umgestürzte Stühle, leere Fässer. Wer hier Wache hielt, ging in Eile.', 'Von hier überblickt man den Eingang. Ein Würfelspiel liegt noch auf dem Tisch.']],
  hall: ['Halle', ['Ein weiter Saal, getragen von Säulen. Jedes Geräusch hallt lange nach.', 'Die Decke verliert sich im Dunkeln, Säulen tragen das Gewölbe.']],
  barracks: ['Schlafsaal', ['Einfache Pritschen und Truhen mit persönlicher Habe.', 'Hier schliefen die Bewohner – manche Decken sind noch warm.']],
  shrine: ['Schrein', ['Ein kleiner Altar mit Opfergaben. Die Statue daneben hat kein Gesicht mehr.', 'Kerzenstummel und eine Statue. Jemand betet hier noch.']],
  storage: ['Lager', ['Kisten und Fässer, teils aufgebrochen. Vorräte für Wochen.', 'Säcke, Fässer, Werkzeug – und Rattenspuren.']],
  prison: ['Kerker', ['Knochen in den Ecken. Kratzspuren an den Wänden zählen Tage.', 'Rostige Ketten an der Wand. Einer der Gefangenen hat eine Nachricht in den Stein geritzt.']],
  crypt: ['Gruft', ['Steinsärge reihen sich an den Wänden. Einer ist geöffnet – von innen?', 'Grabnischen und Sarkophage. Die Luft ist schwer und still.']],
  well: ['Brunnenraum', ['Ein alter Brunnen, das Wasser ist klar und eiskalt.', 'Wasser tropft von der Decke in ein steinernes Becken.']],
  goal: ['Ziel', ['']],
};

function generateDungeon(o: GenOptions): MapDoc {
  const b = new Builder(o);
  const { m, W, H, r } = b;
  const cave = o.style === 'cave';
  const mat = materialId(cave ? 'earth' : 'stone');
  const story = r.pick(cave ? CAVE_STORIES : DUNGEON_STORIES);
  const who = nameOf(r);

  /* ---- Räume ---- */
  const maxRoom = Math.max(4, Math.min(9, Math.floor(Math.min(W, H) / 2.5)));
  const placed: Room[] = [];
  for (let attempt = 0; attempt < 500 && placed.length < Math.max(3, o.rooms); attempt++) {
    const minSize = placed.length === 0 ? Math.max(3, Math.ceil(maxRoom * 0.7)) : 3;
    const w = r.int(minSize, maxRoom);
    const h = r.int(minSize, maxRoom);
    if (w + 4 > W || h + 4 > H) continue;
    const x = r.int(2, W - w - 2);
    const y = r.int(2, H - h - 2);
    if (placed.some((q) => x < q.x + q.w + 2 && x + w + 2 > q.x && y < q.y + q.h + 2 && y + h + 2 > q.y)) continue;
    placed.push({ x, y, w, h });
  }
  if (!placed.length) placed.push({ x: 2, y: 2, w: Math.min(5, W - 4), h: Math.min(5, H - 4) });
  const round = new Set<number>();
  for (const q of placed) {
    const id = b.rooms.length;
    // manche größeren Räume werden rund (Kreis im Rechteck)
    if (!cave && Math.min(q.w, q.h) >= 5 && r.chance(0.35)) {
      const d = Math.min(q.w, q.h);
      b.carveCircle(q.x + q.w / 2, q.y + q.h / 2, d / 2, mat);
      round.add(id);
      continue;
    }
    b.rooms.push(q);
    for (let y = q.y; y < q.y + q.h; y++) {
      for (let x = q.x; x < q.x + q.w; x++) {
        if (cave) {
          const nx = (x + 0.5 - (q.x + q.w / 2)) / (q.w / 2);
          const ny = (y + 0.5 - (q.y + q.h / 2)) / (q.h / 2);
          if (nx * nx + ny * ny > 1.05 + (r.next() - 0.5) * 0.5) continue;
        }
        b.set(x, y, mat, id);
      }
    }
  }
  const rooms = b.rooms;
  const center = (q: Room) => ({ x: Math.floor(q.x + q.w / 2), y: Math.floor(q.y + q.h / 2) });

  /* ---- Eingang: Raum am nächsten zum Kartenrand, gerader Gang hinaus ---- */
  let entry = 0;
  let entrySide = 'b' as 'l' | 'r' | 't' | 'b';
  let best = Infinity;
  rooms.forEach((q, i) => {
    const d: [number, 'l' | 'r' | 't' | 'b'][] = [
      [q.x, 'l'],
      [W - q.x - q.w, 'r'],
      [q.y, 't'],
      [H - q.y - q.h, 'b'],
    ];
    for (const [dist, side] of d) if (dist < best) (best = dist), (entry = i), (entrySide = side);
  });
  {
    const q = rooms[entry];
    const c = center(q);
    let cells: [number, number, number, number];
    if (entrySide === 'l' || entrySide === 'r') {
      const y = c.y;
      const from = entrySide === 'l' ? 0 : q.x + q.w;
      const to = entrySide === 'l' ? q.x - 1 : W - 1;
      for (let x = from; x <= to; x++) b.set(x, y, mat);
      cells = entrySide === 'l' ? [q.x - 1, y, q.x, y] : [q.x + q.w, y, q.x + q.w - 1, y];
    } else {
      const x = c.x;
      const from = entrySide === 't' ? 0 : q.y + q.h;
      const to = entrySide === 't' ? q.y - 1 : H - 1;
      for (let y = from; y <= to; y++) b.set(x, y, mat);
      cells = entrySide === 't' ? [x, q.y - 1, x, q.y] : [x, q.y + q.h, x, q.y + q.h - 1];
    }
    if (!cave) b.door(...cells);
  }

  /* ---- Verbindungen: Baum der kürzesten Wege, wenige Rundwege ---- */
  const dist = (a: Room, c: Room) => {
    const ca = center(a);
    const cc = center(c);
    return Math.abs(ca.x - cc.x) + Math.abs(ca.y - cc.y);
  };
  const links: [number, number][] = [];
  const connected = new Set([entry]);
  while (connected.size < rooms.length) {
    let pair: [number, number] | null = null;
    let bestD = Infinity;
    for (const a of connected)
      for (let c = 0; c < rooms.length; c++) {
        if (connected.has(c)) continue;
        const d = dist(rooms[a], rooms[c]);
        if (d < bestD) (bestD = d), (pair = [a, c]);
      }
    if (!pair) break;
    connected.add(pair[1]);
    links.push(pair);
  }
  const tree = [...links];
  for (let i = 0; i < rooms.length; i++) {
    if (!r.chance(0.15)) continue;
    const others = rooms.map((_, j) => j).filter((j) => j !== i && !links.some(([a, c]) => (a === i && c === j) || (a === j && c === i)));
    if (others.length) links.push([i, others.sort((a, c) => dist(rooms[i], rooms[a]) - dist(rooms[i], rooms[c]))[0]]);
  }

  // Gänge graben, Übergänge Raum ↔ Gang merken (für Türen)
  const transitions: { e: [number, number, number, number]; room: number }[] = [];
  for (const [a, c] of links) {
    const ca = center(rooms[a]);
    const cc = center(rooms[c]);
    const path: { x: number; y: number }[] = [];
    let { x, y } = ca;
    path.push({ x, y });
    const stepX = () => {
      while (x !== cc.x) path.push({ x: (x += Math.sign(cc.x - x)), y });
    };
    const stepY = () => {
      while (y !== cc.y) path.push({ x, y: (y += Math.sign(cc.y - y)) });
    };
    if (r.chance(0.5)) (stepX(), stepY());
    else (stepY(), stepX());
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      if (b.roomOf[p.y * W + p.x] < 0) b.set(p.x, p.y, mat);
      if (i === 0) continue;
      const q = path[i - 1];
      const rp = b.roomOf[p.y * W + p.x];
      const rq = b.roomOf[q.y * W + q.x];
      if ((rp >= 0) !== (rq >= 0)) transitions.push({ e: [q.x, q.y, p.x, p.y], room: Math.max(rp, rq) });
    }
  }

  /* ---- Weg vom Eingang zum Ziel (Breitensuche über den Baum) ---- */
  const adj = rooms.map(() => [] as number[]);
  for (const [a, c] of tree) (adj[a].push(c), adj[c].push(a));
  const depth = rooms.map(() => -1);
  const parent = rooms.map(() => -1);
  depth[entry] = 0;
  const queue = [entry];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of adj[cur]) if (depth[n] < 0) (depth[n] = depth[cur] + 1), (parent[n] = cur), queue.push(n);
  }
  let goal = entry;
  rooms.forEach((q, i) => {
    const g = rooms[goal];
    if (depth[i] > depth[goal] || (depth[i] === depth[goal] && q.w * q.h > g.w * g.h)) goal = i;
  });
  const mainPath = new Set<number>();
  for (let c = goal; c >= 0; c = parent[c]) mainPath.add(c);

  /* ---- Aufgaben verteilen ---- */
  const role: DungeonRole[] = rooms.map(() => 'storage');
  role[entry] = 'entry';
  role[goal] = 'goal';
  const sideRoles: DungeonRole[] = cave ? ['storage', 'prison', 'well', 'barracks'] : ['storage', 'prison', 'crypt', 'well', 'barracks', 'shrine'];
  const pathRoles: DungeonRole[] = cave ? ['guard', 'hall', 'barracks'] : ['guard', 'hall', 'shrine', 'barracks'];
  let sideI = r.int(0, sideRoles.length - 1);
  rooms.forEach((_, i) => {
    if (i === entry || i === goal) return;
    if (mainPath.has(i)) role[i] = depth[i] === 1 ? 'guard' : r.pick(pathRoles.slice(1));
    else role[i] = sideRoles[sideI++ % sideRoles.length];
  });

  /* ---- Türen: schmale Durchgänge; der Zugang zum Ziel ist immer eine Tür ---- */
  if (!cave) {
    for (const t of transitions) {
      const always = t.room === goal;
      if (!always && !r.chance(0.55)) continue;
      const [ax, ay, bx, by] = t.e;
      const corridor = b.roomOf[ay * W + ax] < 0 ? [ax, ay] : [bx, by];
      const across = ax === bx ? 'x' : 'y';
      const narrow =
        across === 'x'
          ? !isFloor(m, corridor[0] - 1, corridor[1]) && !isFloor(m, corridor[0] + 1, corridor[1])
          : !isFloor(m, corridor[0], corridor[1] - 1) && !isFloor(m, corridor[0], corridor[1] + 1);
      if (narrow) b.door(ax, ay, bx, by);
    }
    cleanupDoors(m);
  }

  /* ---- Einrichtung ---- */
  rooms.forEach((q, i) => {
    switch (role[i]) {
      case 'entry':
        b.scatter(i, cave ? ['boulder', 'bones'] : ['barrel', 'crate'], r.int(1, 2));
        if (!cave) b.light(i, 5);
        break;
      case 'guard':
        if (!b.place('table', Math.floor(q.x + q.w / 2) - 1, Math.floor(q.y + q.h / 2), 0, i)) b.scatter(i, ['table'], 1);
        b.scatter(i, ['chair'], 2);
        b.scatter(i, ['barrel', 'crate'], 1);
        if (cave) b.scatter(i, ['campfire'], 1);
        else b.light(i, 5);
        break;
      case 'hall':
        if (round.has(i)) b.ringPillars(i, rooms[i].w >= 7 ? 8 : 6);
        else if (!cave) b.pillars(i);
        b.scatter(i, cave ? ['boulder', 'bones'] : ['brazier'], 2);
        break;
      case 'barracks':
        for (let k = 0; k < Math.min(4, Math.floor(q.w / 2)); k++) b.againstWall(i, 'bed', ['t', 'b']);
        b.scatter(i, ['chest'], 1);
        break;
      case 'shrine':
        b.againstWall(i, 'altar', ['t']) || b.againstWall(i, 'altar');
        b.scatter(i, ['statue', 'brazier'], 2);
        break;
      case 'storage':
        b.scatter(i, ['crate', 'barrel', 'crate', 'barrel', 'chest'], r.int(3, 6));
        break;
      case 'prison':
        b.scatter(i, ['bones', 'bones', 'barrel'], r.int(2, 4));
        break;
      case 'crypt':
        for (let k = 0; k < 4; k++) b.againstWall(i, 'sarcophagus');
        b.scatter(i, ['statue'], 1);
        break;
      case 'well':
        if (q.w >= 4 && q.h >= 4) b.place('fountain', Math.floor(q.x + q.w / 2) - 1, Math.floor(q.y + q.h / 2) - 1, 0, i);
        else b.scatter(i, ['barrel'], 1);
        if (cave) {
          const c = center(q);
          for (let y = c.y - 1; y <= c.y + 1; y++)
            for (let x = c.x - 1; x <= c.x + 1; x++) if (b.roomOf[y * W + x] === i && !b.occupied[y * W + x] && !b.keepFree(x, y)) b.set(x, y, materialId('water'));
        }
        break;
      case 'goal':
        if (cave) {
          b.scatter(i, ['campfire'], 1);
          b.scatter(i, ['bones', 'bones', 'chest', 'boulder'], r.int(3, 5));
        } else {
          const cx = Math.floor(q.x + q.w / 2);
          if (!b.place('sarcophagus', cx, q.y + 1, 0, i)) b.againstWall(i, 'altar');
          b.place('brazier', cx - 1, q.y + 1, 0, i);
          b.place('brazier', cx + 1, q.y + 1, 0, i);
          b.scatter(i, ['chest'], 2);
          b.againstWall(i, 'stairs', ['b', 'l', 'r']);
        }
        break;
    }
  });

  /* ---- Raummarken in Wegreihenfolge, Geschichte ---- */
  m.story = story.story.replaceAll('{name}', who);
  if (!o.name) m.name = story.title.replaceAll('{name}', who);
  const order = rooms.map((_, i) => i).sort((a, c) => (a === goal ? 1 : c === goal ? -1 : depth[a] - depth[c] || a - c));
  for (const i of order) {
    if (role[i] === 'goal') b.note(rooms[i], story.goal[0], story.goal[1].replaceAll('{name}', who));
    else b.note(rooms[i], ROLE_TEXT[role[i]][0], say(r, ROLE_TEXT[role[i]][1]));
  }
  return m;
}

/* =====================================================================================
   Tempel: Gebäude mit Vorhalle, Hauptschiff, Allerheiligstem und Seitenräumen
   ===================================================================================== */

const DEITIES = [
  ['der Lichtbringerin {name}', 'Die Lichtbringerin {name} wird hier seit Generationen verehrt. Seit der Hohepriester verschwand, brennt die ewige Flamme schwächer.'],
  ['des Sturmgottes {name}', 'Seefahrer bringen {name} Opfer, bevor sie auslaufen. In letzter Zeit kehren immer weniger Schiffe zurück.'],
  ['des Mondes', 'Ein uralter Mondtempel, halb vergessen. Bei Vollmond sollen in der Krypta Stimmen zu hören sein.'],
  ['der Erdmutter {name}', 'Bauern beten zu {name} um gute Ernte. Die Priesterschaft hütet ein Geheimnis unter dem Altar.'],
] as const;

function generateTemple(o: GenOptions): MapDoc {
  const b = new Builder(o);
  const { m, W, H, r } = b;
  const marble = materialId('marble');
  const stone = materialId('stone');
  const [deity, storyText] = r.pick(DEITIES);
  const who = nameOf(r);

  // Maße: Hauptschiff ungerade breit, Seitenräume links und rechts, unten Eingang zum Kartenrand
  const nw = W >= 24 ? 7 : 5;
  const sw = Math.max(0, Math.min(6, Math.floor((W - 4 - nw - 2) / 2)));
  const top = 1;
  const bottom = H - 4; // letzte Gebäudezeile; darunter Eingangstreppe bis zum Rand
  const cx = Math.floor(W / 2);
  const nx = cx - Math.floor(nw / 2);
  const total = bottom - top + 1;
  // Allerheiligstes als runde Apsis, wenn genug Höhe da ist (ungerader Durchmesser, mittig über dem Schiff)
  const apse = total >= 15 ? nw - 2 : 0;
  const sanH = apse || Math.max(3, Math.min(4, Math.floor(total * 0.22)));
  const narH = 3;
  const naveH = total - sanH - narH - 2;

  const san = apse ? b.carveCircle(cx + 0.5, top + apse / 2, apse / 2, marble) : b.carveRoom({ x: nx + 1, y: top, w: nw - 2, h: sanH }, marble);
  const nave = b.carveRoom({ x: nx, y: top + sanH + 1, w: nw, h: naveH }, marble);
  const nar = b.carveRoom({ x: nx - (sw >= 3 ? 1 : 0), y: bottom - narH + 1, w: nw + (sw >= 3 ? 2 : 0), h: narH }, marble);
  // Öffnungen mit Türen: Allerheiligstes (verschlossen) und Vorhalle
  b.set(cx, top + sanH, marble);
  b.door(cx, top + sanH, cx, top + sanH - 1);
  b.set(cx, bottom - narH, marble);
  b.door(cx, bottom - narH, cx, bottom - narH + 1);
  // Eingang: breite Treppe vom Kartenrand
  for (let y = bottom + 1; y < H; y++) for (let x = cx - 1; x <= cx + 1; x++) b.set(x, y, stone);
  b.place('stairs', cx - 1, H - 2, 180);

  // Seitenräume links und rechts, je mit Tür ins Hauptschiff
  const side: { id: number; left: boolean }[] = [];
  if (sw >= 3) {
    for (const left of [true, false]) {
      const x0 = left ? nx - 1 - sw : nx + nw + 1;
      let y = top + sanH + 1;
      const yEnd = bottom - narH - 1;
      while (yEnd - y + 1 >= 3) {
        const h = Math.min(yEnd - y + 1, r.int(3, 5));
        const rest = yEnd - (y + h) + 1;
        const hh = rest > 0 && rest < 4 ? yEnd - y + 1 : h; // keinen zu kleinen Rest lassen
        const id = b.carveRoom({ x: x0, y, w: sw, h: hh }, stone);
        const wallX = left ? nx - 1 : nx + nw;
        const dy = y + Math.floor(hh / 2);
        b.set(wallX, dy, stone);
        b.door(left ? wallX - 1 : wallX + 1, dy, wallX, dy);
        side.push({ id, left });
        y += hh + 1;
      }
    }
  }

  // Einrichtung: Allerheiligstes, Hauptschiff, Vorhalle
  const sq = b.rooms[san];
  if (apse) {
    // in der Apsis: Altar oben mittig (ganz im Kreis), Feuerschalen darunter links und rechts
    b.place('altar', cx - 1, sq.y + 1, 0, san) || b.place('altar', cx, sq.y + 1, 0, san) || b.scatter(san, ['altar'], 1);
    b.place('brazier', cx - 1, sq.y + apse - 2, 0, san) || b.scatter(san, ['brazier'], 1);
    b.place('brazier', cx + 1, sq.y + apse - 2, 0, san) || b.scatter(san, ['brazier'], 1);
  } else {
    b.place('altar', cx - 1, sq.y, 0, san) || b.againstWall(san, 'altar', ['t']);
    b.place('brazier', sq.x, sq.y, 0, san);
    b.place('brazier', sq.x + sq.w - 1, sq.y, 0, san);
  }
  if (!apse) b.scatter(san, ['statue'], 2);
  const nq = b.rooms[nave];
  for (let y = nq.y + 1; y < nq.y + nq.h - 1; y += 2) {
    b.place('pillar', nq.x, y, 0, nave);
    b.place('pillar', nq.x + nq.w - 1, y, 0, nave);
  }
  for (let y = nq.y + 1; y + 3 <= nq.y + nq.h - 1; y += 4) b.place('rug', cx - 1, y, 0, nave);
  const aq = b.rooms[nar];
  b.place('statue', aq.x, aq.y + 1, 0, nar);
  b.place('statue', aq.x + aq.w - 1, aq.y + 1, 0, nar);
  b.scatter(nar, ['brazier'], 2);

  // Seitenräume: Kapelle, Priesterzellen, Bibliothek, Sakristei, Krypta-Abgang
  type SideRole = 'chapel' | 'cell' | 'library' | 'vestry' | 'crypt';
  const roles: SideRole[] = ['chapel', 'cell', 'library', 'vestry', 'crypt', 'cell'];
  const sideRole = new Map<number, SideRole>();
  side.forEach((s, k) => sideRole.set(s.id, roles[(k + r.int(0, 1)) % roles.length]));
  if (side.length && ![...sideRole.values()].includes('crypt')) sideRole.set(side[side.length - 1].id, 'crypt');
  for (const s of side) {
    const id = s.id;
    switch (sideRole.get(id)) {
      case 'chapel':
        b.againstWall(id, 'altar', [s.left ? 'l' : 'r']) || b.scatter(id, ['statue'], 1);
        b.scatter(id, ['brazier'], 1);
        break;
      case 'cell':
        b.againstWall(id, 'bed', [s.left ? 'l' : 'r']);
        b.scatter(id, ['chest', 'chair'], 2);
        break;
      case 'library':
        b.againstWall(id, 'shelf', ['t']);
        b.againstWall(id, 'shelf', ['b']);
        b.scatter(id, ['table'], 1);
        break;
      case 'vestry':
        b.scatter(id, ['chest', 'chest', 'shelf'], 3);
        break;
      case 'crypt':
        b.againstWall(id, 'stairs', [s.left ? 'l' : 'r']) || b.scatter(id, ['stairs'], 1);
        b.scatter(id, ['sarcophagus'], 1);
        break;
    }
    b.light(id, 4);
  }

  m.story = storyText.replaceAll('{name}', who);
  if (!o.name) m.name = `Tempel ${deity.replaceAll('{name}', who)}`;
  b.note(aq, 'Vorhalle', say(r, ['Zwei Statuen bewachen den Eingang. Pilger lassen hier Schuhe und Waffen zurück.', 'Weihrauchduft und das Echo von Schritten. Eine Inschrift begrüßt die Gläubigen.']));
  b.note(nq, 'Hauptschiff', say(r, ['Säulenreihen tragen das Gewölbe, ein Teppich führt zum Allerheiligsten.', 'Bänke fehlen – die Gläubigen knien auf dem kalten Marmor.']));
  b.note(sq, 'Allerheiligstes', say(r, ['Der Altar trägt das heilige Symbol. Nur Geweihte dürfen diesen Raum betreten.', 'Die Feuerschalen brennen Tag und Nacht. Unter dem Altar ist eine Platte lose.']));
  const sideText: Record<SideRole, [string, readonly string[]]> = {
    chapel: ['Seitenkapelle', ['Ein kleiner Altar für stille Gebete.', 'Votivgaben und Kerzen für die Verstorbenen.']],
    cell: ['Priesterzelle', ['Ein schmales Bett, eine Truhe, sonst nichts.', 'Die Zelle eines Novizen, ein Tagebuch liegt unter dem Kissen.']],
    library: ['Bibliothek', ['Regale mit Schriftrollen über Rituale und Geschichte des Tempels.', 'Staubige Folianten. Eine Seite wurde herausgerissen.']],
    vestry: ['Sakristei', ['Gewänder, Kelche und die Tempelkasse.', 'Verschlossene Truhen mit Ritualgerät.']],
    crypt: ['Abgang zur Krypta', ['Eine Treppe führt hinab zu den Gräbern der Hohepriester.', 'Kalte Luft steigt die Stufen herauf.']],
  };
  for (const s of side) {
    const t = sideText[sideRole.get(s.id)!];
    b.note(b.rooms[s.id], t[0], say(r, t[1]));
  }
  return m;
}

/* =====================================================================================
   Taverne: Gebäude auf der Wiese, Eingang mit Weg zum Rand, Schankraum vorn, Räume dahinter
   ===================================================================================== */

const TAVERN_NAMES = ['Zum Tanzenden Keiler', 'Der Goldene Krug', 'Zur Rostigen Laterne', 'Zum Schlafenden Drachen', 'Die Drei Raben', 'Zum Lustigen Barden'];

function generateTavern(o: GenOptions): MapDoc {
  const b = new Builder(o);
  const { m, W, H, r } = b;
  const wood = materialId('wood');
  const stone = materialId('stone');
  const earth = materialId('earth');
  const tavern = r.pick(TAVERN_NAMES);
  const host = nameOf(r);

  const bw = Math.min(W - 4, 24);
  const bh = Math.min(H - 5, 15);
  const bx = Math.floor((W - bw) / 2);
  const by = 2;
  const hallH = Math.max(4, Math.ceil(bh * 0.55));
  const backH = bh - hallH - 1;
  const hall = b.carveRoom({ x: bx, y: by + backH + 1, w: bw, h: hallH }, wood);
  const hq = b.rooms[hall];

  // Eingang unten in der Mitte, Weg bis zum Kartenrand
  const ex = bx + Math.floor(bw / 2);
  for (let y = hq.y + hq.h; y < H; y++) b.set(ex, y, earth);
  b.door(ex, hq.y + hq.h - 1, ex, hq.y + hq.h);

  // Hinterer Teil: Küche, Lager, Treppe, Gästezimmer (von links nach rechts), je mit Tür zum Schankraum
  type BackRole = 'kitchen' | 'store' | 'stairs' | 'guest';
  const back: { id: number; role: BackRole }[] = [];
  if (backH >= 3) {
    // Breiten: Küche 30 %, Lager 20 %, Treppe 15 %, Rest Gästezimmer; je mindestens 3, dazwischen 1 Feld Wand
    const plan: [BackRole, number][] = [
      ['kitchen', 0.3],
      ['store', 0.2],
      ['stairs', 0.15],
      ['guest', 0.35],
    ];
    while (plan.length > 1 && plan.length * 3 + plan.length - 1 > bw) plan.pop();
    const inner = bw - (plan.length - 1);
    const widths = plan.map(([, share]) => Math.max(3, Math.round(inner * share)));
    widths[widths.length - 1] = Math.max(3, inner - widths.slice(0, -1).reduce((a, c) => a + c, 0));
    while (widths.reduce((a, c) => a + c, 0) > inner) {
      const i = widths.indexOf(Math.max(...widths));
      widths[i]--;
    }
    let x = bx;
    plan.forEach(([role], k) => {
      const w = k === plan.length - 1 ? bx + bw - x : widths[k];
      if (w < 3) return;
      // Gästezimmer bei genug Breite in zwei Zimmer teilen
      if (role === 'guest' && w >= 8) {
        const w1 = Math.floor((w - 1) / 2);
        for (const [gx, gw] of [
          [x, w1],
          [x + w1 + 1, w - w1 - 1],
        ]) {
          const id = b.carveRoom({ x: gx, y: by, w: gw, h: backH }, wood);
          const dx = gx + Math.floor(gw / 2);
          b.set(dx, by + backH, wood);
          b.door(dx, by + backH, dx, by + backH - 1);
          back.push({ id, role });
        }
      } else {
        const id = b.carveRoom({ x, y: by, w, h: backH }, role === 'kitchen' || role === 'store' ? stone : wood);
        const dx = role === 'kitchen' ? x + w - 1 : x + Math.floor(w / 2);
        b.set(dx, by + backH, wood);
        b.door(dx, by + backH, dx, by + backH - 1);
        back.push({ id, role });
      }
      x += w + 1;
    });
  }

  // Schankraum: Theke vor der Küche, Kamin an der Seitenwand, Tischgruppen
  const kitchen = back.find((q) => q.role === 'kitchen');
  if (kitchen) {
    const kq = b.rooms[kitchen.id];
    b.place('counter', kq.x, hq.y + 1, 0, hall) || b.againstWall(hall, 'counter', ['t']);
  } else b.againstWall(hall, 'counter', ['t']);
  b.againstWall(hall, 'fireplace', ['l', 'r']);
  let tables = 0;
  for (let t = 0; t < 120 && tables < Math.max(2, Math.floor((hq.w * hq.h) / 20)); t++) {
    const x = r.int(hq.x + 1, hq.x + hq.w - 3);
    const y = r.int(hq.y + 1, hq.y + hq.h - 2);
    if (b.place('roundtable', x, y, 0, hall)) {
      tables++;
      b.place('chair', x - 1, y + r.int(0, 1), 270, hall);
      b.place('chair', x + 2, y + r.int(0, 1), 90, hall);
    }
  }
  b.scatter(hall, ['barrel'], 2);

  for (const q of back) {
    switch (q.role) {
      case 'kitchen':
        b.againstWall(q.id, 'fireplace', ['t']);
        b.scatter(q.id, ['table'], 1);
        b.againstWall(q.id, 'shelf', ['l', 'b']);
        b.scatter(q.id, ['barrel'], 2);
        break;
      case 'store':
        b.scatter(q.id, ['barrel', 'crate', 'barrel', 'crate'], r.int(3, 6));
        break;
      case 'stairs':
        b.scatter(q.id, ['stairs'], 1);
        break;
      case 'guest':
        b.againstWall(q.id, 'bed', ['t']);
        b.scatter(q.id, ['chest', 'chair'], 2);
        if (r.chance(0.5)) b.scatter(q.id, ['rug'], 1);
        break;
    }
    b.light(q.id, 4);
  }

  m.story = say(r, [
    `„${tavern}“ ist die einzige Herberge an der Straße. Wirt {name} hört alles – und verkauft es weiter.`,
    `In „${tavern}“ trifft sich, wer Arbeit sucht. Wirt {name} vermittelt Aufträge gegen eine Runde für alle.`,
    `Seit der Keller von „${tavern}“ verschlossen ist, benimmt sich Wirt {name} merkwürdig.`,
  ]).replaceAll('{name}', host);
  if (!o.name) m.name = tavern;
  b.note(hq, 'Schankraum', say(r, [`Lärm, Pfeifenrauch und der Duft von Braten. Hinter der Theke steht ${host}.`, 'Ein Barde spielt am Kamin, an den Tischen wird gewürfelt.']));
  const backText: Record<BackRole, [string, readonly string[]]> = {
    kitchen: ['Küche', ['Über dem Feuer brodelt ein Eintopf. Die Köchin duldet keine Gäste.', 'Töpfe, Kräuterbündel und ein Hinterausgang zum Hof.']],
    store: ['Vorratskammer', ['Fässer mit Bier und Wein, Säcke mit Mehl.', 'Kisten mit Vorräten – und eine Falltür im Boden.']],
    stairs: ['Treppe', ['Die Treppe führt hinauf zu weiteren Zimmern.', 'Knarrende Stufen nach oben und hinab in den Keller.']],
    guest: ['Gästezimmer', ['Ein einfaches Zimmer mit Bett und Truhe.', 'Das beste Zimmer im Haus – es ist bereits vergeben.']],
  };
  for (const q of back) {
    const t = backText[q.role];
    b.note(b.rooms[q.id], t[0], say(r, t[1]));
  }
  return m;
}

/* =====================================================================================
   Wald (geschlossen) und Grasland (freistehend): Lichtungen, ein Weg von Rand zu Rand
   ===================================================================================== */

type WildRole = 'camp' | 'ruin' | 'pond' | 'grove' | 'hunter' | 'rest';

function generateWild(o: GenOptions): MapDoc {
  const b = new Builder(o);
  const { m, W, H, r } = b;
  const forest = o.style === 'forest';
  const earth = materialId('earth');
  const water = materialId('water');
  const grass = materialId('grass');
  const clearingMat = forest ? grass : 0; // im Grasland ist die Wiese Grundfläche
  const keepOpen = new Uint8Array(W * H);
  const open = (x: number, y: number, rad = 0) => {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (b.inside(x + dx, y + dy)) keepOpen[(y + dy) * W + x + dx] = 1;
  };

  /* ---- Lichtungen ---- */
  const clearings: { x: number; y: number; r: number; room: Room }[] = [];
  const count = Math.max(2, Math.min(o.rooms, 10));
  for (let t = 0; t < 500 && clearings.length < count; t++) {
    const rad = r.int(2, Math.max(2, Math.min(4, Math.floor(Math.min(W, H) / 6))));
    const x = r.int(rad + 2, W - rad - 3);
    const y = r.int(rad + 2, H - rad - 3);
    if (clearings.some((q) => Math.hypot(q.x - x, q.y - y) < q.r + rad + 3)) continue;
    clearings.push({ x, y, r: rad, room: { x: x - rad, y: y - rad, w: rad * 2 + 1, h: rad * 2 + 1 } });
  }
  if (!clearings.length) clearings.push({ x: Math.floor(W / 2), y: Math.floor(H / 2), r: 2, room: { x: Math.floor(W / 2) - 2, y: Math.floor(H / 2) - 2, w: 5, h: 5 } });
  // Reihenfolge entlang der Karte (von links nach rechts), damit der Weg durchläuft
  clearings.sort((a, c) => a.x - c.x);
  clearings.forEach((q, i) => {
    b.rooms.push(q.room);
    for (let y = q.y - q.r - 1; y <= q.y + q.r + 1; y++)
      for (let x = q.x - q.r - 1; x <= q.x + q.r + 1; x++) {
        if (!b.inside(x, y)) continue;
        if (Math.hypot(x - q.x, y - q.y) <= q.r + 0.4 + (r.next() - 0.5) * 0.8) {
          if (forest) b.set(x, y, clearingMat, i);
          else b.roomOf[y * W + x] = i;
          keepOpen[y * W + x] = 1;
        }
      }
  });

  /* ---- Weg: vom linken Rand durch alle Lichtungen zum rechten Rand ---- */
  const path = (ax: number, ay: number, bx: number, by: number) => {
    let x = ax;
    let y = ay;
    for (let guard = 0; guard < W * H * 2 && (x !== bx || y !== by); guard++) {
      if (b.roomOf[y * W + x] < 0 || !forest) {
        b.set(x, y, earth);
        if (forest) {
          // Wegrand mit Waldboden, damit der Weg nicht zu eng wirkt
          for (const [dx, dy] of [[0, 1], [1, 0]]) if (b.inside(x + dx, y + dy) && !isFloor(m, x + dx, y + dy)) b.set(x + dx, y + dy, grass);
        }
      }
      open(x, y, 1);
      const towardX = x !== bx && (y === by || r.chance(Math.abs(bx - x) / (Math.abs(bx - x) + Math.abs(by - y))));
      if (r.chance(0.15)) {
        const nx = towardX ? x : x + r.pick([-1, 1]);
        const ny = towardX ? y + r.pick([-1, 1]) : y;
        if (b.inside(nx, ny) && ny > 0 && ny < H - 1) (x = nx), (y = ny);
        continue;
      }
      if (towardX) x += Math.sign(bx - x);
      else y += Math.sign(by - y);
    }
    if (b.roomOf[by * W + bx] < 0 || !forest) b.set(bx, by, earth);
  };
  const startY = r.int(2, H - 3);
  const endY = r.int(2, H - 3);
  path(0, startY, clearings[0].x, clearings[0].y);
  for (let i = 1; i < clearings.length; i++) path(clearings[i - 1].x, clearings[i - 1].y, clearings[i].x, clearings[i].y);
  path(clearings[clearings.length - 1].x, clearings[clearings.length - 1].y, W - 1, endY);

  /* ---- Aufgaben der Lichtungen ---- */
  const role: WildRole[] = clearings.map(() => 'rest');
  const pool: WildRole[] = ['ruin', 'pond', 'grove', 'hunter', 'rest'];
  const campAt = Math.floor(clearings.length / 2);
  role[campAt] = 'camp';
  let k = r.int(0, pool.length - 1);
  clearings.forEach((_, i) => {
    if (i !== campAt) role[i] = pool[k++ % pool.length];
  });

  // Teich in der Teich-Lichtung
  clearings.forEach((q, i) => {
    if (role[i] !== 'pond') return;
    for (let y = q.y - 1; y <= q.y + 1; y++)
      for (let x = q.x - 1; x <= q.x + 1; x++) if (b.inside(x, y) && m.floor[y * W + x] !== earth && r.chance(0.85)) b.set(x, y, water);
  });

  /* ---- Bäume ---- */
  const placeWild = (type: ObjectType, x: number, y: number, rot: Rotation = 0, allowOpen = false): boolean => {
    const f = footprint({ type, rot });
    for (let yy = y; yy < y + f.h; yy++)
      for (let xx = x; xx < x + f.w; xx++) {
        if (!b.inside(xx, yy) || b.occupied[yy * W + xx] || m.floor[yy * W + xx] === water || m.floor[yy * W + xx] === earth) return false;
        if (!allowOpen && keepOpen[yy * W + xx]) return false;
        if (forest && !isFloor(m, xx, yy)) return false; // im geschlossenen Wald nur auf dem Boden
      }
    for (let yy = y; yy < y + f.h; yy++) for (let xx = x; xx < x + f.w; xx++) b.occupied[yy * W + xx] = 1;
    m.objects.push({ id: newId(), type, x, y, rot });
    return true;
  };
  if (!forest) {
    const blobs = Array.from({ length: Math.max(4, Math.round((W * H) / 65)) }, () => ({
      x: r.int(0, W - 1),
      y: r.int(0, H - 1),
      rad: r.int(3, Math.max(4, Math.floor(Math.min(W, H) / 3))),
    }));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let p = 0.03;
        for (const bl of blobs) p = Math.max(p, 1 - Math.hypot(x - bl.x, y - bl.y) / bl.rad);
        if (r.next() > Math.min(0.95, p * 1.1)) continue;
        if (p > 0.45) {
          if (r.chance(0.12) && placeWild('bigtree', x, y)) continue;
          placeWild(r.chance(0.4) ? 'pine' : 'tree', x, y);
        } else if (p > 0.2) placeWild(r.chance(0.5) ? 'bush' : 'tree', x, y);
        else if (r.chance(0.3)) placeWild(r.pick(['bush', 'stump', 'boulder'] as const), x, y);
      }
  } else {
    // im Wald: Büsche und einzelne Bäume am Rand der Lichtungen (nicht auf dem Weg)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!isFloor(m, x, y) || b.roomOf[y * W + x] < 0) continue;
        const atEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !isFloor(m, x + dx, y + dy));
        if (atEdge && r.chance(0.3)) placeWild(r.pick(['bush', 'bush', 'tree', 'stump'] as const), x, y, 0, true);
      }
  }

  /* ---- Einrichtung der Lichtungen ---- */
  const spot = (i: number, type: ObjectType, tries = 30) => {
    const q = clearings[i];
    for (let t = 0; t < tries; t++) {
      const rot = r.pick([0, 90, 180, 270] as const);
      if (placeWild(type, r.int(q.x - q.r, q.x + q.r), r.int(q.y - q.r, q.y + q.r), rot, true)) return true;
    }
    return false;
  };
  clearings.forEach((q, i) => {
    switch (role[i]) {
      case 'camp':
        if (!placeWild('campfire', q.x, q.y, 0, true)) spot(i, 'campfire');
        for (let n = 0; n < Math.min(3, q.r); n++) spot(i, 'tent');
        spot(i, 'log');
        break;
      case 'ruin': {
        const stone = materialId('marble');
        for (let y = q.y - 1; y <= q.y + 1; y++) for (let x = q.x - 1; x <= q.x + 1; x++) if (b.inside(x, y) && m.floor[y * W + x] !== earth) b.set(x, y, stone);
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (r.chance(0.7)) placeWild('pillar', q.x + dx, q.y + dy, 0, true);
        spot(i, 'statue');
        break;
      }
      case 'grove':
        if (!placeWild('bigtree', q.x - 1, q.y - 1, 0, true)) spot(i, 'tree');
        spot(i, 'boulder');
        break;
      case 'hunter':
        spot(i, 'crate');
        spot(i, 'barrel');
        spot(i, 'log');
        break;
      case 'pond':
        spot(i, 'boulder');
        spot(i, 'bush');
        break;
      default:
        spot(i, r.pick(['stump', 'log', 'boulder', 'bush'] as const));
    }
  });

  const place = forest ? 'Wald' : 'Grasland';
  m.story = say(r, [
    `Die alte Handelsstraße führt hier durch das ${place === 'Wald' ? 'Dickicht' : 'offene Land'}. Seit Tagen ist keine Karawane mehr angekommen.`,
    `Ein Bote sollte diesen Weg vor einer Woche nehmen. Seine Spur verliert sich irgendwo zwischen den Lichtungen.`,
    `Jäger meiden diesen ${place}, seit dort Lichter zwischen den Bäumen gesehen wurden.`,
  ]);
  if (!o.name) m.name = forest ? say(r, ['Der Dunkelforst', 'Der Raunende Wald', 'Der Alte Hain']) : say(r, ['Die Weite Flur', 'Das Hügelland', 'Die Grenzwiesen']);
  const wildText: Record<WildRole, [string, readonly string[]]> = {
    camp: ['Lager', ['Ein Lagerfeuer glimmt noch. Wer hier rastet, ist nicht weit.', 'Zelte und ein Feuer – Reisende oder Räuber?']],
    ruin: ['Ruine', ['Umgestürzte Säulen und eine verwitterte Statue. Moos bedeckt alte Schriftzeichen.', 'Die Reste eines Wachturms aus vergessener Zeit.']],
    pond: ['Teich', ['Ein stiller Teich. Im Wasser spiegelt sich etwas, das nicht da ist.', 'Klares Wasser, Tierspuren am Ufer.']],
    grove: ['Hain', ['Ein mächtiger, uralter Baum. Bänder und Opfergaben hängen in seinen Ästen.', 'Ein heiliger Hain – hier herrscht unnatürliche Stille.']],
    hunter: ['Jägerrast', ['Kisten und ein Fass, sorgfältig versteckt. Ein Jäger kommt regelmäßig her.', 'Spuren eines Wilderers: Fallen, Felle und Vorräte.']],
    rest: ['Lichtung', ['Eine ruhige Lichtung, gut für eine Rast.', 'Gefällte Bäume und ein Baumstumpf zum Sitzen.']],
  };
  // Marken: Anfang und Ende des Wegs, dazu die Lichtungen in Wegreihenfolge
  m.notes.push({ id: newId(), n: 1, x: 0.5, y: startY + 0.5, title: 'Anfang des Wegs', text: 'Hier betreten die Helden die Karte.' });
  clearings.forEach((q, i) => {
    const t = wildText[role[i]];
    b.note(q.room, t[0], say(r, t[1]));
  });
  m.notes.push({ id: newId(), n: m.notes.length + 1, x: W - 0.5, y: endY + 0.5, title: 'Ende des Wegs', text: 'Der Weg führt weiter zum nächsten Abenteuer.' });
  return m;
}

