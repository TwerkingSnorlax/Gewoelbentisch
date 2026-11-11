// Zeichnet eine Karte auf einen Canvas. Wird vom Editor und vom Export genutzt,
// damit die exportierte Karte genauso aussieht wie im Editor.
import { isFloor, wallSegments, type MapDoc } from './map';

export interface RenderOptions {
  /** Größe eines Feldes in Pixeln */
  cell: number;
  grid: boolean;
  /** Lichtsymbole zeichnen (nur im Editor, nicht im Export) */
  lightMarkers: boolean;
}

export const COLORS = {
  rock: '#2a2420',
  hatch: 'rgba(205, 185, 150, 0.22)',
  floor: '#e6d6b8',
  grid: 'rgba(90, 65, 40, 0.28)',
  wall: '#1a1612',
  wallShadow: 'rgba(0, 0, 0, 0.22)',
  door: '#8a5a2b',
  doorEdge: '#3b2510',
  light: '#f2b84b',
};

/** Deterministische Pseudo-Zufallszahl 0..1 pro Feld, damit die Karte nicht flackert. */
function rand(x: number, y: number, i: number): number {
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

export function renderMap(ctx: CanvasRenderingContext2D, m: MapDoc, o: RenderOptions): void {
  const c = o.cell;

  // Fels
  ctx.fillStyle = COLORS.rock;
  ctx.fillRect(0, 0, m.width * c, m.height * c);

  // Schraffur im Fels entlang der Räume
  ctx.strokeStyle = COLORS.hatch;
  ctx.lineWidth = Math.max(1, c * 0.035);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      if (isFloor(m, x, y) || !nearFloor(m, x, y)) continue;
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
    }
  }
  ctx.stroke();

  // Boden mit leichter Farbvariation pro Feld
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      if (!isFloor(m, x, y)) continue;
      const v = Math.round((rand(x, y, 9) - 0.5) * 12);
      ctx.fillStyle = `rgb(${230 + v}, ${214 + v}, ${184 + v})`;
      ctx.fillRect(x * c, y * c, c + 0.5, c + 0.5);
    }
  }

  // Raster nur auf dem Boden
  if (o.grid) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = Math.max(1, c * 0.02);
    ctx.beginPath();
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        if (!isFloor(m, x, y)) continue;
        ctx.rect(x * c, y * c, c, c);
      }
    }
    ctx.stroke();
  }

  // Wände (Schatten, dann Linie)
  const segs = wallSegments(m);
  ctx.lineCap = 'square';
  for (const [style, width, off] of [
    [COLORS.wallShadow, 0.32, 0.06],
    [COLORS.wall, 0.16, 0],
  ] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = c * width;
    ctx.beginPath();
    for (const s of segs) {
      ctx.moveTo(s.x1 * c + off * c, s.y1 * c + off * c);
      ctx.lineTo(s.x2 * c + off * c, s.y2 * c + off * c);
    }
    ctx.stroke();
  }

  // Türen
  for (const d of m.doors) {
    const len = 0.62 * c;
    const thick = 0.24 * c;
    const cx = (d.dir === 'h' ? d.x + 0.5 : d.x) * c;
    const cy = (d.dir === 'h' ? d.y : d.y + 0.5) * c;
    const w = d.dir === 'h' ? len : thick;
    const h = d.dir === 'h' ? thick : len;
    // Türrahmen über die ganze Kante, dann das Türblatt in der Mitte
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = c * 0.16;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(d.x * c, d.y * c);
    ctx.lineTo((d.dir === 'h' ? d.x + 1 : d.x) * c, (d.dir === 'h' ? d.y : d.y + 1) * c);
    ctx.stroke();
    ctx.fillStyle = COLORS.door;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = COLORS.doorEdge;
    ctx.lineWidth = Math.max(1, c * 0.04);
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  }

  // Lichtmarker
  if (o.lightMarkers) {
    for (const l of m.lights) {
      const cx = (l.x + 0.5) * c;
      const cy = (l.y + 0.5) * c;
      const r = l.range * c;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(242, 184, 75, 0.35)');
      g.addColorStop(1, 'rgba(242, 184, 75, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.light;
      ctx.strokeStyle = COLORS.wall;
      ctx.lineWidth = Math.max(1, c * 0.04);
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
