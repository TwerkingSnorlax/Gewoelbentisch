// Export als PNG-Bild, Universal-VTT-Datei (.dd2vtt) und Projektdatei.
import { allLights, footprint, serialize, wallSegments, type MapDoc } from './map';
import { OBJECTS } from './objects';
import { renderMap } from './render';

/**
 * Lichter im VTT-Export. Farben im Format AARRGGBB. Encounter+ übernimmt beim Import weder Farbe noch
 * Deckkraft (Test: immer Weiß, 100 %); neutrales Weiß ist darum die Vorgabe. „Warm“ wirkt z. B. in Foundry.
 */
export type VttLights = 'neutral' | 'warm' | 'none';
export const VTT_LIGHTS: VttLights[] = ['neutral', 'warm', 'none'];
export const LIGHT_COLORS: Record<Exclude<VttLights, 'none'>, string> = {
  neutral: 'ffffffff',
  warm: 'ffffd9a0',
};

/** Übliche Auflösung für VTT-Karten (Pixel pro Feld). */
export const EXPORT_PPG = 70;
/** Viele Browser (v. a. Safari auf dem iPad) begrenzen die Canvas-Größe. */
const MAX_CANVAS_SIDE = 8192;

function exportPixelsPerGrid(m: MapDoc): number {
  const largest = Math.max(m.width, m.height);
  return Math.max(16, Math.min(EXPORT_PPG, Math.floor(MAX_CANVAS_SIDE / largest)));
}

export function renderToCanvas(m: MapDoc): { canvas: HTMLCanvasElement; ppg: number } {
  const ppg = exportPixelsPerGrid(m);
  const canvas = document.createElement('canvas');
  canvas.width = m.width * ppg;
  canvas.height = m.height * ppg;
  const ctx = canvas.getContext('2d')!;
  renderMap(ctx, m, { cell: ppg, lightMarkers: false });
  return { canvas, ppg };
}

export function fileBaseName(m: MapDoc, fallback: string): string {
  const name = (m.name || fallback).trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
  return name || 'karte';
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportPng(m: MapDoc, base: string): Promise<void> {
  const { canvas } = renderToCanvas(m);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('PNG konnte nicht erzeugt werden');
  download(blob, `${base}.png`);
}

/**
 * Baut eine Universal-VTT-Datei (Format 0.3, wie Dungeondraft .dd2vtt).
 * Alle Koordinaten sind in Feld-Einheiten.
 */
export function buildUniversalVtt(m: MapDoc, lightMode: VttLights = 'neutral') {
  const { canvas, ppg } = renderToCanvas(m);
  const doors = m.layers.doors.visible ? m.doors : [];
  const lights = m.layers.lights.visible && lightMode !== 'none' ? allLights(m) : [];
  const lightColor = LIGHT_COLORS[lightMode === 'warm' ? 'warm' : 'neutral'];
  // Sichtblockierende Objekte (Säulen, Statuen, Felsen) als geschlossene Umrisse
  const blockers = m.layers.objects.visible ? m.objects.filter((o) => OBJECTS[o.type].blocksSight) : [];
  const image = canvas.toDataURL('image/png').split(',')[1];
  return {
    format: 0.3,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: m.width, y: m.height },
      pixels_per_grid: ppg,
    },
    line_of_sight: wallSegments(m).map((s) => [
      { x: s.x1, y: s.y1 },
      { x: s.x2, y: s.y2 },
    ]),
    objects_line_of_sight: blockers.map((o) => {
      const f = footprint(o);
      const i = 0.15;
      return [
        { x: o.x + i, y: o.y + i },
        { x: o.x + f.w - i, y: o.y + i },
        { x: o.x + f.w - i, y: o.y + f.h - i },
        { x: o.x + i, y: o.y + f.h - i },
        { x: o.x + i, y: o.y + i },
      ];
    }),
    portals: doors.map((d) =>
      d.dir === 'h'
        ? {
            position: { x: d.x + 0.5, y: d.y },
            bounds: [
              { x: d.x, y: d.y },
              { x: d.x + 1, y: d.y },
            ],
            rotation: 0,
            closed: true,
            freestanding: false,
          }
        : {
            position: { x: d.x, y: d.y + 0.5 },
            bounds: [
              { x: d.x, y: d.y },
              { x: d.x, y: d.y + 1 },
            ],
            rotation: Math.PI / 2,
            closed: true,
            freestanding: false,
          },
    ),
    environment: { baked_lighting: false, ambient_light: 'ff404040' },
    lights: lights.map((l) => ({
      position: { x: l.x, y: l.y },
      range: l.range,
      intensity: 1,
      color: lightColor,
      shadows: true,
    })),
    image,
  };
}

export function exportVtt(m: MapDoc, base: string, lightMode: VttLights = 'neutral'): void {
  const data = buildUniversalVtt(m, lightMode);
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${base}.dd2vtt`);
}

export const PROJECT_EXT = '.gewoelbe.json';

export function saveProject(m: MapDoc, base: string): void {
  download(new Blob([serialize(m)], { type: 'application/json' }), `${base}${PROJECT_EXT}`);
}
