// Zeichnet eine Karte auf einen Canvas. Wird vom Editor und vom Export genutzt,
// damit die exportierte Karte genauso aussieht wie im Editor.
import { allLights, circleCells, circleOwner, floorAt, isFloor, materialOf, sortedObjects, wallSegments, type MapDoc, type Material, type StyleId } from './map';
import { drawObject, FOLIAGE, leafCluster } from './objects';

export interface RenderOptions {
  /** Größe eines Feldes in Pixeln */
  cell: number;
  /** Lichtsymbole zeichnen (nur im Editor, nicht im Export) */
  lightMarkers: boolean;
  /** Raummarken zeichnen (Editor und PNG; nicht im VTT-Bild, das sehen die Spieler) */
  notes?: boolean;
}

export interface StyleDef {
  rock: string;
  texture: 'hatch' | 'bricks' | 'grass' | 'pebbles' | 'meadow' | 'canopy';
  textureColor: string;
  wall: string;
  wallWidth: number;
  /** unregelmäßige Wände (Höhle) */
  rough: boolean;
  /** Standard-Bodenmaterial für neue Räume */
  material: Material;
  /** Wände an den Rändern der Bodenflächen (aus = freistehend: alles ist begehbar) */
  walls: boolean;
  /** Wände nicht als Linie, sondern als überhängendes Blätterdach zeichnen (Wald) */
  canopyWalls?: boolean;
}

export const STYLE_DEFS: Record<StyleId, StyleDef> = {
  dungeon: { rock: '#2a2420', texture: 'hatch', textureColor: 'rgba(205,185,150,0.22)', wall: '#1a1612', wallWidth: 0.16, rough: false, material: 'stone', walls: true },
  temple: { rock: '#26242b', texture: 'bricks', textureColor: 'rgba(200,190,220,0.16)', wall: '#141318', wallWidth: 0.2, rough: false, material: 'marble', walls: true },
  tavern: { rock: '#3c4a2b', texture: 'grass', textureColor: 'rgba(170,200,110,0.35)', wall: '#3a2414', wallWidth: 0.22, rough: false, material: 'wood', walls: true },
  cave: { rock: '#2b2622', texture: 'pebbles', textureColor: 'rgba(200,180,150,0.25)', wall: '#15110e', wallWidth: 0.2, rough: true, material: 'earth', walls: true },
  forest: { rock: '#1d2b28', texture: 'canopy', textureColor: 'rgba(0,0,0,0)', wall: FOLIAGE.ink, wallWidth: 0.08, rough: true, material: 'grass', walls: true, canopyWalls: true },
  grassland: { rock: '#6a8a45', texture: 'meadow', textureColor: 'rgba(40,70,25,0.45)', wall: '#3b2a1a', wallWidth: 0.06, rough: true, material: 'earth', walls: false },
};

export const COLORS = {
  grid: 'rgba(60, 40, 20, 0.28)',
  wallShadow: 'rgba(0, 0, 0, 0.22)',
  door: '#8a5a2b',
  doorEdge: '#3b2510',
  light: '#f2b84b',
};

/** Deterministische Pseudo-Zufallszahl 0..1 pro Feld, damit die Karte nicht flackert. */
export function rand(x: number, y: number, i: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + i * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function nearFloor(m: MapDoc, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (isFloor(m, x + dx, y + dy)) return true;
    }
  }
  return false;
}

function shade(base: [number, number, number], v: number): string {
  return `rgb(${base[0] + v}, ${base[1] + v}, ${base[2] + v})`;
}

function drawRockTexture(ctx: CanvasRenderingContext2D, m: MapDoc, s: StyleDef, c: number) {
  ctx.strokeStyle = s.textureColor;
  ctx.fillStyle = s.textureColor;
  ctx.lineWidth = Math.max(1, c * 0.035);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      if (isFloor(m, x, y)) continue;
      const near = nearFloor(m, x, y);
      if (s.texture === 'hatch') {
        if (!near) continue;
        const angle = rand(x, y, 0) * Math.PI;
        const ax = Math.cos(angle);
        const ay = Math.sin(angle);
        for (let i = 0; i < 4; i++) {
          const off = (i - 1.5) * 0.2;
          const cx = (x + 0.5 + -ay * off) * c;
          const cy = (y + 0.5 + ax * off) * c;
          const len = (0.3 + rand(x, y, i + 1) * 0.15) * c;
          ctx.moveTo(cx - ax * len, cy - ay * len);
          ctx.lineTo(cx + ax * len, cy + ay * len);
        }
      } else if (s.texture === 'bricks') {
        // Mauerwerk: zwei Steinreihen pro Feld, versetzt
        for (let r = 0; r < 2; r++) {
          const yy = (y + r * 0.5) * c;
          ctx.moveTo(x * c, yy);
          ctx.lineTo((x + 1) * c, yy);
          const off = (r + y) % 2 ? 0.25 : 0.75;
          ctx.moveTo((x + off) * c, yy);
          ctx.lineTo((x + off) * c, yy + c * 0.5);
        }
      } else if (s.texture === 'grass') {
        for (let i = 0; i < 3; i++) {
          const gx = (x + 0.15 + rand(x, y, i) * 0.7) * c;
          const gy = (y + 0.2 + rand(x, y, i + 5) * 0.7) * c;
          ctx.moveTo(gx - c * 0.06, gy);
          ctx.lineTo(gx - c * 0.1, gy - c * 0.12);
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx, gy - c * 0.15);
          ctx.moveTo(gx + c * 0.06, gy);
          ctx.lineTo(gx + c * 0.1, gy - c * 0.12);
        }
      } else if (s.texture === 'meadow') {
        // Wiese: fleckige Grüntöne, Grasbüschel überall
        ctx.stroke();
        const v = Math.round((rand(x, y, 11) - 0.5) * 18);
        ctx.fillStyle = `rgb(${106 + v}, ${138 + v}, ${69 + Math.round(v / 2)})`;
        ctx.fillRect(x * c, y * c, c + 0.5, c + 0.5);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const gx = (x + 0.1 + rand(x, y, i) * 0.8) * c;
          const gy = (y + 0.2 + rand(x, y, i + 5) * 0.75) * c;
          ctx.moveTo(gx - c * 0.05, gy);
          ctx.lineTo(gx - c * 0.08, gy - c * 0.1);
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx, gy - c * 0.12);
          ctx.moveTo(gx + c * 0.05, gy);
          ctx.lineTo(gx + c * 0.08, gy - c * 0.1);
        }
      } else if (s.texture === 'pebbles' && (near || rand(x, y, 3) < 0.25)) {
        for (let i = 0; i < 3; i++) {
          const px = (x + 0.15 + rand(x, y, i) * 0.7) * c;
          const py = (y + 0.15 + rand(x, y, i + 7) * 0.7) * c;
          const r = c * (0.04 + rand(x, y, i + 3) * 0.06);
          ctx.moveTo(px + r, py);
          ctx.ellipse(px, py, r, r * 0.75, rand(x, y, i + 9) * 3, 0, Math.PI * 2);
        }
      }
    }
  }
  ctx.stroke();
}

export function drawFloorCell(ctx: CanvasRenderingContext2D, mat: Material, x: number, y: number, c: number) {
  const px = x * c;
  const py = y * c;
  const v = Math.round((rand(x, y, 9) - 0.5) * 12);
  switch (mat) {
    case 'stone': {
      ctx.fillStyle = shade([230, 214, 184], v);
      ctx.fillRect(px, py, c + 0.5, c + 0.5);
      // Steinfugen: zwei Reihen behauener Steine, versetzt
      ctx.strokeStyle = 'rgba(110, 85, 55, 0.35)';
      ctx.lineWidth = Math.max(1, c * 0.025);
      ctx.beginPath();
      ctx.moveTo(px, py + c / 2);
      ctx.lineTo(px + c, py + c / 2);
      for (let r = 0; r < 2; r++) {
        const sx = px + (0.3 + rand(x, y, 70 + r) * 0.4) * c;
        ctx.moveTo(sx, py + (r * c) / 2);
        ctx.lineTo(sx, py + ((r + 1) * c) / 2);
      }
      ctx.stroke();
      break;
    }
    case 'wood': {
      ctx.fillStyle = shade([176, 122, 69], v);
      ctx.fillRect(px, py, c + 0.5, c + 0.5);
      ctx.strokeStyle = 'rgba(70, 40, 15, 0.45)';
      ctx.lineWidth = Math.max(1, c * 0.025);
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        ctx.moveTo(px, py + (i * c) / 4);
        ctx.lineTo(px + c, py + (i * c) / 4);
      }
      for (let i = 0; i < 4; i++) {
        const sx = px + rand(x, y, i + 20) * c;
        ctx.moveTo(sx, py + (i * c) / 4);
        ctx.lineTo(sx, py + ((i + 1) * c) / 4);
      }
      ctx.stroke();
      break;
    }
    case 'marble': {
      ctx.fillStyle = shade([234, 231, 224], Math.round(v / 2));
      ctx.fillRect(px, py, c + 0.5, c + 0.5);
      ctx.strokeStyle = 'rgba(120, 115, 130, 0.25)';
      ctx.lineWidth = Math.max(1, c * 0.02);
      ctx.beginPath();
      ctx.moveTo(px + rand(x, y, 1) * c, py);
      ctx.quadraticCurveTo(px + rand(x, y, 2) * c, py + c * 0.5, px + rand(x, y, 3) * c, py + c);
      ctx.stroke();
      break;
    }
    case 'earth': {
      ctx.fillStyle = shade([168, 138, 100], v);
      ctx.fillRect(px, py, c + 0.5, c + 0.5);
      ctx.fillStyle = 'rgba(80, 60, 35, 0.35)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(px + rand(x, y, i + 30) * c, py + rand(x, y, i + 40) * c, c * (0.02 + rand(x, y, i + 50) * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'grass': {
      // heller, gedämpfter Waldboden mit feinen Halmen
      ctx.fillStyle = shade([168, 184, 140], Math.round(v / 2));
      ctx.fillRect(px, py, c + 0.5, c + 0.5);
      ctx.strokeStyle = 'rgba(70, 95, 60, 0.3)';
      ctx.lineWidth = Math.max(1, c * 0.02);
      ctx.beginPath();
      for (let i = 0; i < 2; i++) {
        const gx = px + (0.2 + rand(x, y, 80 + i) * 0.6) * c;
        const gy = py + (0.3 + rand(x, y, 90 + i) * 0.6) * c;
        ctx.moveTo(gx - c * 0.04, gy);
        ctx.lineTo(gx - c * 0.06, gy - c * 0.08);
        ctx.moveTo(gx + c * 0.04, gy);
        ctx.lineTo(gx + c * 0.06, gy - c * 0.08);
      }
      ctx.stroke();
      break;
    }
    case 'water': {
      ctx.fillStyle = shade([79, 134, 181], Math.round(v / 2));
      ctx.fillRect(px, py, c + 0.5, c + 0.5);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = Math.max(1, c * 0.025);
      ctx.beginPath();
      const wx = px + (0.2 + rand(x, y, 60) * 0.4) * c;
      const wy = py + (0.3 + rand(x, y, 61) * 0.4) * c;
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + c * 0.1, wy - c * 0.08, wx + c * 0.2, wy);
      ctx.quadraticCurveTo(wx + c * 0.3, wy + c * 0.08, wx + c * 0.4, wy);
      ctx.stroke();
      break;
    }
  }
}

/** Wandsegment als (bei Höhlen unregelmäßige) Linie */
function wallPath(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, c: number, rough: boolean) {
  ctx.moveTo(x1 * c, y1 * c);
  if (!rough) {
    ctx.lineTo(x2 * c, y2 * c);
    return;
  }
  const len = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  const steps = len * 3;
  const horizontal = y1 === y2;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    // Endpunkte nicht verschieben, damit Ecken geschlossen bleiben
    const j = i === steps ? 0 : (rand(Math.round(x * 3), Math.round(y * 3), 77) - 0.5) * 0.22;
    ctx.lineTo((horizontal ? x : x + j) * c, (horizontal ? y + j : y) * c);
  }
}

/** Kanten zwischen verschiedenen Böden (für freistehende Karten): dunkler Saum, am Wasser ein helles Ufer */
/**
 * Fels-Felder, die zwischen zwei Bodenflächen liegen (links und rechts oder oben und unten Boden),
 * sind Innenwände; dazu Kreuzungen solcher Wände. Sie werden in Wandfarbe gefüllt.
 */
function drawInnerWalls(ctx: CanvasRenderingContext2D, m: MapDoc, s: StyleDef, c: number) {
  const W = m.width;
  const wall = new Uint8Array(W * m.height);
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < W; x++) {
      if (isFloor(m, x, y)) continue;
      if ((isFloor(m, x - 1, y) && isFloor(m, x + 1, y)) || (isFloor(m, x, y - 1) && isFloor(m, x, y + 1))) wall[y * W + x] = 1;
    }
  const isWall = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < m.height && wall[y * W + x] === 1;
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < W; x++) {
      if (isFloor(m, x, y) || wall[y * W + x]) continue;
      const floorN = [isFloor(m, x - 1, y), isFloor(m, x + 1, y), isFloor(m, x, y - 1), isFloor(m, x, y + 1)].filter(Boolean).length;
      const wallN = [isWall(x - 1, y), isWall(x + 1, y), isWall(x, y - 1), isWall(x, y + 1)].filter(Boolean).length;
      if (floorN >= 1 && wallN >= 2) wall[y * W + x] = 2;
    }
  ctx.fillStyle = s.wall;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < W; x++) if (wall[y * W + x]) ctx.fillRect(x * c - 0.5, y * c - 0.5, c + 1, c + 1);
}

/** Mit `insideOnly` nur Kanten zwischen zwei Böden (nicht zum Fels) */
function drawMaterialEdges(ctx: CanvasRenderingContext2D, m: MapDoc, c: number, insideOnly = false) {
  const water = 5;
  const edges: { x1: number; y1: number; x2: number; y2: number; shore: boolean }[] = [];
  for (let y = 0; y <= m.height; y++) {
    for (let x = 0; x <= m.width; x++) {
      const here = floorAt(m, x, y);
      if (x < m.width && y > 0) {
        const up = floorAt(m, x, y - 1);
        if (up !== here && (!insideOnly || (up && here))) edges.push({ x1: x, y1: y, x2: x + 1, y2: y, shore: up === water || here === water });
      } else if (x < m.width && y === 0) {
        // Kartenrand: keine Kante
      }
      if (y < m.height && x > 0) {
        const left = floorAt(m, x - 1, y);
        if (left !== here && (!insideOnly || (left && here))) edges.push({ x1: x, y1: y, x2: x, y2: y + 1, shore: left === water || here === water });
      }
    }
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [shoreOnly, style, width] of [
    [false, 'rgba(50, 35, 20, 0.45)', 0.09],
    [true, 'rgba(225, 240, 245, 0.75)', 0.05],
  ] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = c * width;
    ctx.beginPath();
    for (const e of edges) {
      if (shoreOnly && !e.shore) continue;
      wallPath(ctx, e.x1, e.y1, e.x2, e.y2, c, true);
    }
    ctx.stroke();
  }
}

/**
 * Geschlossener Wald: Blätterdach auf den Fels-Feldern am Rand der Lichtungen, über den Rand der Lichtung
 * hängend. Erst alle Schatten, dann das Laub (hintere Reihe zuerst).
 */
function drawCanopy(ctx: CanvasRenderingContext2D, m: MapDoc, c: number) {
  const items: { x: number; y: number; r: number; seed: number; d: number }[] = [];
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      if (isFloor(m, x, y)) continue;
      // Abstand zum nächsten Boden (Schachbrett-Distanz bis 2)
      let d = 3;
      for (let dy = -2; dy <= 2 && d > 1; dy++)
        for (let dx = -2; dx <= 2; dx++) if (isFloor(m, x + dx, y + dy)) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
      if (d > 2 || (d === 2 && rand(x, y, 31) < 0.35)) continue;
      // zum Boden hin versetzen, damit das Laub über die Kante hängt
      let ox = 0;
      let oy = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isFloor(m, x + dx, y + dy)) (ox += dx), (oy += dy);
      const jx = (rand(x, y, 32) - 0.5) * 0.3;
      const jy = (rand(x, y, 33) - 0.5) * 0.3;
      items.push({
        x: (x + 0.5 + ox * 0.18 + jx) * c,
        y: (y + 0.5 + oy * 0.18 + jy) * c,
        r: c * (d === 1 ? 0.72 + rand(x, y, 34) * 0.2 : 0.9 + rand(x, y, 35) * 0.25),
        seed: x * 7919 + y * 104729,
        d,
      });
    }
  }
  items.sort((a, b) => b.d - a.d);
  for (const it of items) leafCluster(ctx, it.x, it.y, it.r, c, it.seed, 'shadow');
  for (const it of items) leafCluster(ctx, it.x, it.y, it.r, c, it.seed, 'leaves');
}

/**
 * Runde Räume: Die Felder eines Kreises liegen als Quadrate im Raster. Hier werden die Ecken außerhalb des
 * Kreises zu Fels und die Ränder des Kreises, die über die Felder hinausreichen, zu Boden – es entsteht ein
 * echter Kreis (gleiche Fläche wie XOR aus Feldern und Kreisscheibe).
 */
function drawCircleRooms(ctx: CanvasRenderingContext2D, m: MapDoc, s: StyleDef, c: number) {
  for (const q of m.circles) {
    const cells = circleCells(q);
    const mat = materialOf(floorAt(m, Math.floor(q.cx), Math.floor(q.cy))) ?? s.material;
    const x0 = Math.floor(q.cx - q.r) - 1;
    const y0 = Math.floor(q.cy - q.r) - 1;
    const x1 = Math.ceil(q.cx + q.r) + 1;
    const y1 = Math.ceil(q.cy + q.r) + 1;
    // Ecken der Felder außerhalb des Kreises: Fels (etwas größer, damit auch Rasterlinien verschwinden)
    const e = Math.max(1, c * 0.04);
    ctx.save();
    ctx.beginPath();
    for (const [x, y] of cells) ctx.rect(x * c - e, y * c - e, c + 2 * e, c + 2 * e);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(x0 * c, y0 * c, (x1 - x0) * c, (y1 - y0) * c);
    ctx.moveTo((q.cx + q.r) * c, q.cy * c);
    ctx.arc(q.cx * c, q.cy * c, q.r * c, 0, Math.PI * 2);
    ctx.clip('evenodd');
    ctx.fillStyle = s.rock;
    ctx.fillRect(x0 * c, y0 * c, (x1 - x0) * c, (y1 - y0) * c);
    ctx.restore();
    // Kreisrand, der über die Felder hinausreicht: Boden
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 * c, y0 * c, (x1 - x0) * c, (y1 - y0) * c);
    for (const [x, y] of cells) ctx.rect(x * c, y * c, c, c);
    ctx.clip('evenodd');
    ctx.beginPath();
    ctx.arc(q.cx * c, q.cy * c, q.r * c, 0, Math.PI * 2);
    ctx.clip();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawFloorCell(ctx, mat, x, y, c);
    ctx.restore();
  }
}

/** Kreisbögen der runden Räume als Wand; Durchgänge (anschließender Boden) bleiben offen */
function circleArcs(ctx: CanvasRenderingContext2D, m: MapDoc, c: number) {
  const own = circleOwner(m);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-2 * c, -2 * c, (m.width + 4) * c, (m.height + 4) * c);
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++) if (isFloor(m, x, y) && own[y * m.width + x] < 0) ctx.rect(x * c, y * c, c, c);
  ctx.clip('evenodd');
  ctx.beginPath();
  for (const q of m.circles) {
    ctx.moveTo((q.cx + q.r) * c, q.cy * c);
    ctx.arc(q.cx * c, q.cy * c, q.r * c, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}

/** Nummerierte Raummarken (Kreis mit Zahl) */
export function drawNotes(ctx: CanvasRenderingContext2D, m: MapDoc, c: number) {
  const r = c * 0.32;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const n of m.notes) {
    const x = n.x * c;
    const y = n.y * c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#7b1f1a';
    ctx.fill();
    ctx.lineWidth = Math.max(1, c * 0.05);
    ctx.strokeStyle = '#f4e7c8';
    ctx.stroke();
    ctx.fillStyle = '#f4e7c8';
    ctx.font = `700 ${Math.round(c * (n.n > 9 ? 0.3 : 0.36))}px system-ui, sans-serif`;
    ctx.fillText(String(n.n), x, y + c * 0.01);
  }
}

export function renderMap(ctx: CanvasRenderingContext2D, m: MapDoc, o: RenderOptions): void {
  const c = o.cell;
  const s = STYLE_DEFS[m.style];
  const L = m.layers;

  // Fels
  ctx.fillStyle = s.rock;
  ctx.fillRect(0, 0, m.width * c, m.height * c);

  if (L.floor.visible) {
    drawRockTexture(ctx, m, s, c);

    // Boden
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        const mat = materialOf(floorAt(m, x, y));
        if (mat) drawFloorCell(ctx, mat, x, y, c);
      }
    }
    // Innenwände: ein Fels-Feld zwischen zwei Räumen wird als massive Wand gezeichnet
    if (s.walls && !s.canopyWalls) drawInnerWalls(ctx, m, s, c);
  }

  // Raster nur auf dem Boden
  if (L.grid.visible) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = Math.max(1, c * 0.02);
    ctx.beginPath();
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        if (s.walls && !isFloor(m, x, y)) continue;
        ctx.rect(x * c, y * c, c, c);
      }
    }
    ctx.stroke();
  }

  // runde Räume als echte Kreise
  if (L.floor.visible && m.circles.length) drawCircleRooms(ctx, m, s, c);

  // Freistehend: weiche Ränder zwischen Wiese, Wegen und Wasser statt Wänden
  if (!s.walls && L.floor.visible) drawMaterialEdges(ctx, m, c);
  // Wald: Kanten zwischen Böden innerhalb der Lichtungen weich, Ränder als Blätterdach
  if (s.canopyWalls && L.floor.visible) {
    drawMaterialEdges(ctx, m, c, true);
    drawCanopy(ctx, m, c);
  }

  // Objekte
  if (L.objects.visible) {
    for (const obj of sortedObjects(m)) drawObject(ctx, obj.type, obj.x * c, obj.y * c, obj.rot, c);
  }

  // Wände (Schatten, dann Linie)
  if (L.floor.visible && s.walls && !s.canopyWalls) {
    const segs = wallSegments(m);
    ctx.lineCap = 'square';
    ctx.lineJoin = 'round';
    for (const [style, width, off] of [
      [COLORS.wallShadow, s.wallWidth * 2, 0.06],
      [s.wall, s.wallWidth, 0],
    ] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = c * width;
      ctx.beginPath();
      ctx.save();
      ctx.translate(off * c, off * c);
      for (const seg of segs) wallPath(ctx, seg.x1, seg.y1, seg.x2, seg.y2, c, s.rough);
      ctx.restore();
      ctx.stroke();
      if (m.circles.length) {
        ctx.save();
        ctx.translate(off * c, off * c);
        circleArcs(ctx, m, c);
        ctx.restore();
      }
    }
  }

  // Türen
  if (L.doors.visible) {
    for (const d of m.doors) {
      // Türrahmen über die ganze Kante, dann das Türblatt in der Mitte
      ctx.strokeStyle = s.wall;
      ctx.lineWidth = c * s.wallWidth;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(d.x * c, d.y * c);
      ctx.lineTo((d.dir === 'h' ? d.x + 1 : d.x) * c, (d.dir === 'h' ? d.y : d.y + 1) * c);
      ctx.stroke();
      const len = 0.62 * c;
      const thick = 0.24 * c;
      const cx = (d.dir === 'h' ? d.x + 0.5 : d.x) * c;
      const cy = (d.dir === 'h' ? d.y : d.y + 0.5) * c;
      const w = d.dir === 'h' ? len : thick;
      const h = d.dir === 'h' ? thick : len;
      ctx.fillStyle = COLORS.door;
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      ctx.strokeStyle = COLORS.doorEdge;
      ctx.lineWidth = Math.max(1, c * 0.04);
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    }
  }

  // Lichtschein und -marker (nur im Editor)
  if (o.lightMarkers && L.lights.visible) {
    for (const l of allLights(m)) {
      const cx = l.x * c;
      const cy = l.y * c;
      const r = l.range * c;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(242, 184, 75, 0.3)');
      g.addColorStop(1, 'rgba(242, 184, 75, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const l of m.lights) {
      ctx.fillStyle = COLORS.light;
      ctx.strokeStyle = s.wall;
      ctx.lineWidth = Math.max(1, c * 0.04);
      ctx.beginPath();
      ctx.arc((l.x + 0.5) * c, (l.y + 0.5) * c, c * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (o.notes && L.notes.visible) drawNotes(ctx, m, c);
}
