// Objektbibliothek: alle Objekte werden per Code gezeichnet (eigene Grafiken, keine fremden Assets).
// Jede Zeichenfunktion zeichnet das Objekt unrotiert in das Rechteck (0, 0) bis (w, h) in Pixeln;
// c ist die Feldgröße in Pixeln.

export type ObjectType =
  | 'pillar'
  | 'statue'
  | 'altar'
  | 'sarcophagus'
  | 'fountain'
  | 'stairs'
  | 'table'
  | 'roundtable'
  | 'chair'
  | 'bed'
  | 'shelf'
  | 'counter'
  | 'rug'
  | 'chest'
  | 'barrel'
  | 'crate'
  | 'fireplace'
  | 'campfire'
  | 'brazier'
  | 'boulder'
  | 'bones';

export type ObjectCategory = 'vault' | 'furniture' | 'storage' | 'fire';

type Ctx = CanvasRenderingContext2D;

export interface ObjectDef {
  /** Größe in Feldern (unrotiert) */
  w: number;
  h: number;
  category: ObjectCategory;
  /** Zeichenreihenfolge: 0 = flach am Boden (Teppich), 1 = normal */
  z: number;
  /** blockiert die Sicht im VTT */
  blocksSight?: boolean;
  /** Lichtquelle mit dieser Reichweite (Felder) */
  light?: number;
  draw: (ctx: Ctx, w: number, h: number, c: number) => void;
}

const INK = '#2a1f16';
const WOOD = '#9c6b3c';
const WOOD_DARK = '#6e4522';
const STONE = '#a59d92';
const STONE_LIGHT = '#cfc7bb';
const STONE_DARK = '#7a7268';

function lw(ctx: Ctx, c: number, f = 0.035) {
  ctx.lineWidth = Math.max(1, c * f);
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

function shadow(ctx: Ctx, c: number, fn: () => void) {
  ctx.save();
  ctx.translate(c * 0.05, c * 0.06);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  fn();
  ctx.fill();
  ctx.restore();
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function box(ctx: Ctx, c: number, x: number, y: number, w: number, h: number, fill: string, r = c * 0.05) {
  shadow(ctx, c, () => rrect(ctx, x, y, w, h, r));
  rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  lw(ctx, c);
  ctx.stroke();
}

function planks(ctx: Ctx, c: number, x: number, y: number, w: number, h: number, horizontal: boolean) {
  ctx.save();
  ctx.strokeStyle = 'rgba(60,35,15,0.45)';
  ctx.lineWidth = Math.max(1, c * 0.02);
  ctx.beginPath();
  const step = c * 0.22;
  if (horizontal) for (let yy = y + step; yy < y + h - 2; yy += step) (ctx.moveTo(x + 2, yy), ctx.lineTo(x + w - 2, yy));
  else for (let xx = x + step; xx < x + w - 2; xx += step) (ctx.moveTo(xx, y + 2), ctx.lineTo(xx, y + h - 2));
  ctx.stroke();
  ctx.restore();
}

function flame(ctx: Ctx, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, '#fff3b0');
  g.addColorStop(0.45, '#f6a623');
  g.addColorStop(1, 'rgba(214, 72, 20, 0)');
  ctx.fillStyle = g;
  circle(ctx, x, y, r);
  ctx.fill();
}

export const OBJECTS: Record<ObjectType, ObjectDef> = {
  /* ---- Gewölbe & Tempel ---- */
  pillar: {
    w: 1, h: 1, category: 'vault', z: 1, blocksSight: true,
    draw(ctx, w, h, c) {
      shadow(ctx, c, () => circle(ctx, w / 2, h / 2, c * 0.4));
      circle(ctx, w / 2, h / 2, c * 0.4);
      ctx.fillStyle = STONE;
      ctx.fill();
      lw(ctx, c);
      ctx.stroke();
      circle(ctx, w / 2, h / 2, c * 0.28);
      ctx.fillStyle = STONE_LIGHT;
      ctx.fill();
      ctx.stroke();
    },
  },
  statue: {
    w: 1, h: 1, category: 'vault', z: 1, blocksSight: true,
    draw(ctx, w, h, c) {
      box(ctx, c, c * 0.1, c * 0.1, w - c * 0.2, h - c * 0.2, STONE_DARK);
      ctx.fillStyle = STONE_LIGHT;
      lw(ctx, c, 0.03);
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.58, c * 0.26, c * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      circle(ctx, w / 2, h * 0.38, c * 0.13);
      ctx.fill();
      ctx.stroke();
    },
  },
  altar: {
    w: 2, h: 1, category: 'vault', z: 1,
    draw(ctx, w, h, c) {
      box(ctx, c, c * 0.12, c * 0.18, w - c * 0.24, h - c * 0.36, STONE);
      rrect(ctx, c * 0.22, c * 0.26, w - c * 0.44, h - c * 0.52, c * 0.03);
      ctx.fillStyle = STONE_LIGHT;
      ctx.fill();
      ctx.fillStyle = '#8a2424';
      ctx.fillRect(w / 2 - c * 0.18, c * 0.18, c * 0.36, h - c * 0.36);
      lw(ctx, c, 0.025);
      ctx.strokeRect(w / 2 - c * 0.18, c * 0.18, c * 0.36, h - c * 0.36);
      for (const x of [c * 0.42, w - c * 0.42]) {
        flame(ctx, x, h / 2, c * 0.14);
        circle(ctx, x, h / 2, c * 0.05);
        ctx.fillStyle = '#f4ead2';
        ctx.fill();
      }
    },
  },
  sarcophagus: {
    w: 1, h: 2, category: 'vault', z: 1,
    draw(ctx, w, h, c) {
      box(ctx, c, c * 0.14, c * 0.1, w - c * 0.28, h - c * 0.2, STONE, c * 0.18);
      lw(ctx, c, 0.025);
      ctx.fillStyle = STONE_LIGHT;
      rrect(ctx, c * 0.26, c * 0.22, w - c * 0.52, h - c * 0.44, c * 0.12);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w / 2, c * 0.45);
      ctx.lineTo(w / 2, h - c * 0.45);
      ctx.moveTo(w / 2 - c * 0.15, c * 0.75);
      ctx.lineTo(w / 2 + c * 0.15, c * 0.75);
      ctx.stroke();
    },
  },
  fountain: {
    w: 2, h: 2, category: 'vault', z: 1,
    draw(ctx, w, h, c) {
      const cx = w / 2;
      const cy = h / 2;
      shadow(ctx, c, () => circle(ctx, cx, cy, c * 0.9));
      circle(ctx, cx, cy, c * 0.9);
      ctx.fillStyle = STONE;
      ctx.fill();
      lw(ctx, c);
      ctx.stroke();
      circle(ctx, cx, cy, c * 0.72);
      ctx.fillStyle = '#4f86b5';
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = Math.max(1, c * 0.025);
      for (const r of [0.32, 0.5]) {
        circle(ctx, cx, cy, c * r);
        ctx.stroke();
      }
      circle(ctx, cx, cy, c * 0.18);
      ctx.fillStyle = STONE_LIGHT;
      ctx.fill();
      lw(ctx, c);
      ctx.stroke();
    },
  },
  stairs: {
    w: 2, h: 2, category: 'vault', z: 1,
    draw(ctx, w, h, c) {
      const steps = 7;
      const sh = (h - c * 0.1) / steps;
      for (let i = 0; i < steps; i++) {
        const v = 200 - i * 18;
        ctx.fillStyle = `rgb(${v}, ${v - 8}, ${v - 20})`;
        ctx.fillRect(c * 0.05, c * 0.05 + i * sh, w - c * 0.1, sh);
      }
      lw(ctx, c, 0.02);
      for (let i = 1; i < steps; i++) {
        ctx.beginPath();
        ctx.moveTo(c * 0.05, c * 0.05 + i * sh);
        ctx.lineTo(w - c * 0.05, c * 0.05 + i * sh);
        ctx.stroke();
      }
      lw(ctx, c);
      ctx.strokeRect(c * 0.05, c * 0.05, w - c * 0.1, h - c * 0.1);
    },
  },

  /* ---- Einrichtung ---- */
  table: {
    w: 2, h: 1, category: 'furniture', z: 1,
    draw(ctx, w, h, c) {
      box(ctx, c, c * 0.1, c * 0.15, w - c * 0.2, h - c * 0.3, WOOD);
      planks(ctx, c, c * 0.1, c * 0.15, w - c * 0.2, h - c * 0.3, true);
    },
  },
  roundtable: {
    w: 2, h: 2, category: 'furniture', z: 1,
    draw(ctx, w, h, c) {
      shadow(ctx, c, () => circle(ctx, w / 2, h / 2, c * 0.72));
      circle(ctx, w / 2, h / 2, c * 0.72);
      ctx.fillStyle = WOOD;
      ctx.fill();
      lw(ctx, c);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,35,15,0.4)';
      ctx.lineWidth = Math.max(1, c * 0.02);
      circle(ctx, w / 2, h / 2, c * 0.5);
      ctx.stroke();
      circle(ctx, w / 2, h / 2, c * 0.09);
      ctx.fillStyle = '#f4ead2';
      ctx.fill();
    },
  },
  chair: {
    w: 1, h: 1, category: 'furniture', z: 1,
    draw(ctx, w, h, c) {
      box(ctx, c, c * 0.25, c * 0.3, w - c * 0.5, h - c * 0.52, WOOD);
      box(ctx, c, c * 0.22, c * 0.16, w - c * 0.44, c * 0.14, WOOD_DARK, c * 0.03);
    },
  },
  bed: {
    w: 1, h: 2, category: 'furniture', z: 1,
    draw(ctx, w, h, c) {
      box(ctx, c, c * 0.08, c * 0.08, w - c * 0.16, h - c * 0.16, WOOD_DARK);
      ctx.fillStyle = '#ece4d4';
      ctx.fillRect(c * 0.16, c * 0.16, w - c * 0.32, h - c * 0.32);
      rrect(ctx, c * 0.22, c * 0.22, w - c * 0.44, c * 0.32, c * 0.08);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      lw(ctx, c, 0.02);
      ctx.stroke();
      ctx.fillStyle = '#4f6a8f';
      ctx.fillRect(c * 0.16, h * 0.42, w - c * 0.32, h * 0.58 - c * 0.16);
      ctx.strokeRect(c * 0.16, h * 0.42, w - c * 0.32, h * 0.58 - c * 0.16);
    },
  },
  shelf: {
    w: 2, h: 1, category: 'furniture', z: 1,
    draw(ctx, w, h, c) {
      box(ctx, c, c * 0.06, c * 0.08, w - c * 0.12, h * 0.42, WOOD_DARK, c * 0.02);
      const colors = ['#7b2a2a', '#2f5a3a', '#3d4f7a', '#8a6a2a', '#5a3a6a'];
      let x = c * 0.14;
      let i = 0;
      while (x < w - c * 0.2) {
        const bw = c * (0.08 + ((i * 37) % 5) * 0.012);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(x, c * 0.14, bw, h * 0.3);
        x += bw + c * 0.02;
        i++;
      }
    },
  },
  counter: {
    w: 3, h: 1, category: 'furniture', z: 1,
    draw(ctx, w, h, c) {
      box(ctx, c, c * 0.06, c * 0.12, w - c * 0.12, h - c * 0.3, WOOD);
      planks(ctx, c, c * 0.06, c * 0.12, w - c * 0.12, h - c * 0.3, false);
      ctx.fillStyle = WOOD_DARK;
      ctx.fillRect(c * 0.06, h - c * 0.32, w - c * 0.12, c * 0.14);
      for (const x of [0.6, 1.4, 2.3]) {
        circle(ctx, x * c, h * 0.4, c * 0.1);
        ctx.fillStyle = '#d9c48c';
        ctx.fill();
        lw(ctx, c, 0.02);
        ctx.stroke();
      }
    },
  },
  rug: {
    w: 2, h: 3, category: 'furniture', z: 0,
    draw(ctx, w, h, c) {
      ctx.fillStyle = '#7b2a2a';
      ctx.fillRect(c * 0.12, c * 0.12, w - c * 0.24, h - c * 0.24);
      ctx.strokeStyle = '#c9a24a';
      ctx.lineWidth = Math.max(1, c * 0.06);
      ctx.strokeRect(c * 0.24, c * 0.24, w - c * 0.48, h - c * 0.48);
      ctx.beginPath();
      ctx.moveTo(w / 2, c * 0.55);
      ctx.lineTo(w - c * 0.55, h / 2);
      ctx.lineTo(w / 2, h - c * 0.55);
      ctx.lineTo(c * 0.55, h / 2);
      ctx.closePath();
      ctx.lineWidth = Math.max(1, c * 0.04);
      ctx.stroke();
      // Fransen
      ctx.strokeStyle = '#e8d9b0';
      ctx.lineWidth = Math.max(1, c * 0.02);
      ctx.beginPath();
      for (let x = c * 0.18; x < w - c * 0.12; x += c * 0.1) {
        ctx.moveTo(x, c * 0.04);
        ctx.lineTo(x, c * 0.12);
        ctx.moveTo(x, h - c * 0.12);
        ctx.lineTo(x, h - c * 0.04);
      }
      ctx.stroke();
    },
  },

  /* ---- Lager ---- */
  chest: {
    w: 1, h: 1, category: 'storage', z: 1,
    draw(ctx, w, h, c) {
      box(ctx, c, c * 0.14, c * 0.24, w - c * 0.28, h - c * 0.48, '#7a4a22');
      ctx.fillStyle = '#c9a24a';
      for (const x of [0.3, 0.64]) ctx.fillRect(x * c, c * 0.24, c * 0.06, h - c * 0.48);
      ctx.fillRect(w / 2 - c * 0.07, h / 2 - c * 0.07, c * 0.14, c * 0.14);
      lw(ctx, c, 0.02);
      ctx.strokeRect(w / 2 - c * 0.07, h / 2 - c * 0.07, c * 0.14, c * 0.14);
    },
  },
  barrel: {
    w: 1, h: 1, category: 'storage', z: 1,
    draw(ctx, w, h, c) {
      shadow(ctx, c, () => circle(ctx, w / 2, h / 2, c * 0.38));
      circle(ctx, w / 2, h / 2, c * 0.38);
      ctx.fillStyle = '#8f5e33';
      ctx.fill();
      lw(ctx, c);
      ctx.stroke();
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = Math.max(1, c * 0.035);
      circle(ctx, w / 2, h / 2, c * 0.3);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,35,15,0.5)';
      ctx.lineWidth = Math.max(1, c * 0.02);
      ctx.beginPath();
      ctx.moveTo(w / 2 - c * 0.28, h / 2);
      ctx.lineTo(w / 2 + c * 0.28, h / 2);
      ctx.moveTo(w / 2 - c * 0.24, h / 2 - c * 0.13);
      ctx.lineTo(w / 2 + c * 0.24, h / 2 - c * 0.13);
      ctx.moveTo(w / 2 - c * 0.24, h / 2 + c * 0.13);
      ctx.lineTo(w / 2 + c * 0.24, h / 2 + c * 0.13);
      ctx.stroke();
    },
  },
  crate: {
    w: 1, h: 1, category: 'storage', z: 1,
    draw(ctx, w, h, c) {
      const x = c * 0.14;
      const s = w - c * 0.28;
      box(ctx, c, x, x, s, s, '#b0844f', c * 0.02);
      ctx.strokeStyle = WOOD_DARK;
      ctx.lineWidth = Math.max(1, c * 0.06);
      ctx.strokeRect(x + c * 0.05, x + c * 0.05, s - c * 0.1, s - c * 0.1);
      ctx.beginPath();
      ctx.moveTo(x + c * 0.08, x + c * 0.08);
      ctx.lineTo(x + s - c * 0.08, x + s - c * 0.08);
      ctx.stroke();
    },
  },

  /* ---- Feuer & Natur ---- */
  fireplace: {
    w: 2, h: 1, category: 'fire', z: 1, light: 5,
    draw(ctx, w, h, c) {
      box(ctx, c, c * 0.06, c * 0.06, w - c * 0.12, h * 0.62, STONE_DARK, c * 0.03);
      ctx.fillStyle = '#2a201a';
      ctx.fillRect(c * 0.4, c * 0.2, w - c * 0.8, h * 0.48);
      lw(ctx, c, 0.025);
      ctx.strokeRect(c * 0.4, c * 0.2, w - c * 0.8, h * 0.48);
      flame(ctx, w / 2, h * 0.48, c * 0.38);
    },
  },
  campfire: {
    w: 1, h: 1, category: 'fire', z: 1, light: 5,
    draw(ctx, w, h, c) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        circle(ctx, w / 2 + Math.cos(a) * c * 0.33, h / 2 + Math.sin(a) * c * 0.33, c * 0.08);
        ctx.fillStyle = STONE;
        ctx.fill();
        lw(ctx, c, 0.02);
        ctx.stroke();
      }
      ctx.strokeStyle = WOOD_DARK;
      ctx.lineWidth = c * 0.09;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w / 2 - c * 0.2, h / 2 - c * 0.12);
      ctx.lineTo(w / 2 + c * 0.2, h / 2 + c * 0.12);
      ctx.moveTo(w / 2 - c * 0.2, h / 2 + c * 0.12);
      ctx.lineTo(w / 2 + c * 0.2, h / 2 - c * 0.12);
      ctx.stroke();
      flame(ctx, w / 2, h / 2, c * 0.24);
    },
  },
  brazier: {
    w: 1, h: 1, category: 'fire', z: 1, light: 4,
    draw(ctx, w, h, c) {
      shadow(ctx, c, () => circle(ctx, w / 2, h / 2, c * 0.32));
      circle(ctx, w / 2, h / 2, c * 0.32);
      ctx.fillStyle = '#4a423c';
      ctx.fill();
      lw(ctx, c);
      ctx.stroke();
      circle(ctx, w / 2, h / 2, c * 0.22);
      ctx.fillStyle = '#7a2a10';
      ctx.fill();
      flame(ctx, w / 2, h / 2, c * 0.22);
    },
  },
  boulder: {
    w: 1, h: 1, category: 'fire', z: 1, blocksSight: true,
    draw(ctx, w, h, c) {
      const pts = [
        [0.2, 0.35], [0.38, 0.14], [0.66, 0.16], [0.86, 0.38], [0.82, 0.7], [0.58, 0.88], [0.28, 0.82], [0.12, 0.6],
      ];
      const path = () => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
        ctx.closePath();
      };
      shadow(ctx, c, path);
      path();
      ctx.fillStyle = '#8c857c';
      ctx.fill();
      lw(ctx, c);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(0.38 * w, 0.22 * h);
      ctx.lineTo(0.62 * w, 0.24 * h);
      ctx.lineTo(0.5 * w, 0.45 * h);
      ctx.closePath();
      ctx.fill();
    },
  },
  bones: {
    w: 1, h: 1, category: 'fire', z: 1,
    draw(ctx, w, h, c) {
      const bone = (x1: number, y1: number, x2: number, y2: number) => {
        ctx.strokeStyle = INK;
        ctx.lineWidth = c * 0.09;
        ctx.beginPath();
        ctx.moveTo(x1 * c, y1 * c);
        ctx.lineTo(x2 * c, y2 * c);
        ctx.stroke();
        ctx.strokeStyle = '#efe6cf';
        ctx.lineWidth = c * 0.05;
        ctx.stroke();
        for (const [x, y] of [[x1, y1], [x2, y2]]) {
          circle(ctx, x * c, y * c, c * 0.045);
          ctx.fillStyle = '#efe6cf';
          ctx.fill();
        }
      };
      ctx.lineCap = 'round';
      bone(0.2, 0.7, 0.6, 0.55);
      bone(0.35, 0.3, 0.75, 0.82);
      circle(ctx, w * 0.68, h * 0.3, c * 0.15);
      ctx.fillStyle = '#efe6cf';
      ctx.fill();
      lw(ctx, c, 0.025);
      ctx.stroke();
      ctx.fillStyle = INK;
      circle(ctx, w * 0.63, h * 0.29, c * 0.03);
      ctx.fill();
      circle(ctx, w * 0.73, h * 0.29, c * 0.03);
      ctx.fill();
    },
  },
};

export const OBJECT_TYPES = Object.keys(OBJECTS) as ObjectType[];
export const OBJECT_CATEGORIES: ObjectCategory[] = ['vault', 'furniture', 'storage', 'fire'];

/** Zeichnet ein Objekt an seiner Position (in Pixeln) mit Drehung */
export function drawObject(ctx: Ctx, type: ObjectType, x: number, y: number, rot: number, c: number) {
  const def = OBJECTS[type];
  const rotated = rot === 90 || rot === 270;
  const fw = (rotated ? def.h : def.w) * c;
  const fh = (rotated ? def.w : def.h) * c;
  ctx.save();
  ctx.translate(x + fw / 2, y + fh / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.translate((-def.w * c) / 2, (-def.h * c) / 2);
  def.draw(ctx, def.w * c, def.h * c, c);
  ctx.restore();
}
