<script lang="ts">
  import { onMount } from 'svelte';
  import {
    clampObject,
    cleanupDoors,
    fillRect,
    footprint,
    hasDoor,
    inBounds,
    isOpenEdge,
    newId,
    objectAt,
    pickEdge,
    setFloor,
    toggleDoor,
    toggleLight,
    type Edge,
    type MapDoc,
    type MapObject,
    type Rotation,
  } from './map';
  import { drawObject, type ObjectType } from './objects';
  import { renderMap } from './render';
  import { TOOLS, type Tool } from './tools';

  interface Props {
    map: MapDoc;
    rev: number;
    tool: Tool;
    eraseMode: boolean;
    /** Material-Nummer für Raum und Pinsel */
    material: number;
    objectType: ObjectType;
    objectRot: Rotation;
    selectedId?: string | null;
    /** wird vor der ersten Änderung einer Aktion aufgerufen (für Rückgängig) */
    onbegin: () => void;
    /** wird nach jeder Änderung aufgerufen */
    onchange: () => void;
    /** bricht die laufende Aktion ab (z. B. wenn ein zweiter Finger zum Zoomen dazukommt) */
    oncancel: () => void;
    /** Werkzeug auf einer gesperrten Ebene benutzt */
    onlocked?: () => void;
  }

  let {
    map,
    rev,
    tool,
    eraseMode,
    material,
    objectType,
    objectRot,
    selectedId = $bindable(null),
    onbegin,
    onchange,
    oncancel,
    onlocked,
  }: Props = $props();

  /** Feldgröße in Bildschirmpixeln bei Zoom 1 */
  const CELL = 40;
  const MIN_ZOOM = 0.15;
  const MAX_ZOOM = 6;

  type Point = { x: number; y: number };
  type Mode = 'none' | 'pan' | 'pinch' | 'rect' | 'paint' | 'move';

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let cam = { x: 0, y: 0, zoom: 1 };
  let view = { w: 0, h: 0, dpr: 1 };
  let raf = 0;

  const pointers = new Map<number, Point>();
  let mode: Mode = 'none';
  let began = false;
  let erasing = false;
  let panLast: Point = { x: 0, y: 0 };
  let pinch = { d0: 1, zoom0: 1, mapMid: { x: 0, y: 0 } };
  let rectStart: Point | null = null;
  let rectEnd: Point | null = null;
  let lastCell: Point | null = null;
  let hoverPoint: Point | null = null;
  let hoverEdge: Edge | null = null;
  let moving: { obj: MapObject; dx: number; dy: number } | null = null;
  let spaceDown = $state(false);
  /** true, solange die Ansicht eingepasst ist (nicht von Hand gezoomt/verschoben) */
  let autoFit = true;

  function request() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      draw();
    });
  }

  $effect(() => {
    // bei Änderungen an Karte oder Ansicht neu zeichnen
    void [map, rev, tool, eraseMode, objectType, objectRot, selectedId];
    request();
  });

  // Wurde die Karte in der Größe geändert, Ansicht neu einpassen
  let lastSize = '';
  $effect(() => {
    const size = `${map.width}x${map.height}`;
    if (lastSize && lastSize !== size) fit();
    lastSize = size;
  });

  export function fit() {
    if (!view.w || !view.h) return;
    const pad = 32;
    const zx = (view.w - pad * 2) / (map.width * CELL);
    const zy = (view.h - pad * 2) / (map.height * CELL);
    cam.zoom = clamp(Math.min(zx, zy), MIN_ZOOM, MAX_ZOOM);
    cam.x = (view.w - map.width * CELL * cam.zoom) / 2;
    cam.y = (view.h - map.height * CELL * cam.zoom) / 2;
    autoFit = true;
    request();
  }

  function clamp(v: number, a: number, b: number) {
    return Math.max(a, Math.min(b, v));
  }

  function local(e: PointerEvent | WheelEvent): Point {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function toMap(p: Point): Point {
    return { x: (p.x - cam.x) / cam.zoom / CELL, y: (p.y - cam.y) / cam.zoom / CELL };
  }

  function begin() {
    if (!began) {
      began = true;
      onbegin();
    }
  }

  function zoomAt(p: Point, factor: number) {
    autoFit = false;
    const z = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const mx = (p.x - cam.x) / cam.zoom;
    const my = (p.y - cam.y) / cam.zoom;
    cam.zoom = z;
    cam.x = p.x - mx * z;
    cam.y = p.y - my * z;
    request();
  }

  /** Position für ein neues Objekt: Zeiger in der Mitte der Fläche */
  function placementAt(m: Point): { x: number; y: number } {
    const f = footprint({ type: objectType, rot: objectRot });
    return {
      x: clamp(Math.round(m.x - f.w / 2), 0, map.width - f.w),
      y: clamp(Math.round(m.y - f.h / 2), 0, map.height - f.h),
    };
  }

  function paintLine(a: Point, b: Point) {
    // Bresenham, damit beim schnellen Ziehen keine Lücken entstehen
    const value = erasing ? 0 : material;
    let changed = false;
    let x = a.x;
    let y = a.y;
    const dx = Math.abs(b.x - x);
    const dy = -Math.abs(b.y - y);
    const sx = x < b.x ? 1 : -1;
    const sy = y < b.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (inBounds(map, x, y) && map.floor[y * map.width + x] !== value) {
        begin();
        changed = setFloor(map, x, y, value) || changed;
      }
      if (x === b.x && y === b.y) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    if (changed) {
      cleanupDoors(map);
      onchange();
    }
  }

  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch = {
      d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom0: cam.zoom,
      mapMid: { x: (mid.x - cam.x) / cam.zoom, y: (mid.y - cam.y) / cam.zoom },
    };
    mode = 'pinch';
  }

  function cancelAction() {
    if (began && (mode === 'paint' || mode === 'move')) oncancel();
    began = false;
    rectStart = rectEnd = null;
    lastCell = null;
    moving = null;
  }

  function onpointerdown(e: PointerEvent) {
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);

    if (pointers.size === 2) {
      cancelAction();
      startPinch();
      request();
      return;
    }
    if (pointers.size > 2) return;

    began = false;
    if (tool === 'hand' || e.button === 1 || spaceDown) {
      mode = 'pan';
      panLast = p;
      return;
    }

    const layer = TOOLS.find((t) => t.id === tool)?.layer;
    if (layer && (map.layers[layer].locked || !map.layers[layer].visible)) {
      mode = 'none';
      onlocked?.();
      return;
    }

    const m = toMap(p);
    const cell = { x: Math.floor(m.x), y: Math.floor(m.y) };
    const secondary = e.button === 2;

    switch (tool) {
      case 'select': {
        const hit = objectAt(map, m.x, m.y);
        selectedId = hit?.id ?? null;
        if (hit) {
          mode = 'move';
          moving = { obj: hit, dx: m.x - hit.x, dy: m.y - hit.y };
        } else {
          mode = 'none';
        }
        break;
      }
      case 'object': {
        mode = 'none';
        const pos = placementAt(m);
        const obj: MapObject = { id: newId(), type: objectType, x: pos.x, y: pos.y, rot: objectRot };
        begin();
        map.objects = [...map.objects, obj];
        selectedId = obj.id;
        onchange();
        break;
      }
      case 'room':
        mode = 'rect';
        erasing = eraseMode !== secondary;
        rectStart = rectEnd = cell;
        break;
      case 'brush':
      case 'eraser':
        mode = 'paint';
        erasing = tool === 'eraser' || secondary;
        lastCell = cell;
        paintLine(cell, cell);
        break;
      case 'door': {
        mode = 'none';
        const edge = pickEdge(m.x, m.y);
        if (edge && (hasDoor(map, edge) || isOpenEdge(map, edge))) {
          begin();
          toggleDoor(map, edge);
          onchange();
        }
        break;
      }
      case 'light':
        mode = 'none';
        if (inBounds(map, cell.x, cell.y)) {
          begin();
          toggleLight(map, cell.x, cell.y);
          onchange();
        }
        break;
    }
    request();
  }

  function onpointermove(e: PointerEvent) {
    const p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);

    if (mode === 'pinch' && pointers.size >= 2) {
      autoFit = false;
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.zoom = clamp((pinch.zoom0 * d) / pinch.d0, MIN_ZOOM, MAX_ZOOM);
      cam.x = mid.x - pinch.mapMid.x * cam.zoom;
      cam.y = mid.y - pinch.mapMid.y * cam.zoom;
      request();
      return;
    }
    if (mode === 'pan') {
      autoFit = false;
      cam.x += p.x - panLast.x;
      cam.y += p.y - panLast.y;
      panLast = p;
      request();
      return;
    }

    const m = toMap(p);
    const cell = { x: Math.floor(m.x), y: Math.floor(m.y) };
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      hoverPoint = m;
      hoverEdge = tool === 'door' ? pickEdge(m.x, m.y) : null;
    }
    if (mode === 'rect') rectEnd = cell;
    if (mode === 'paint' && lastCell && (cell.x !== lastCell.x || cell.y !== lastCell.y)) {
      paintLine(lastCell, cell);
      lastCell = cell;
    }
    if (mode === 'move' && moving) {
      const nx = Math.round(m.x - moving.dx);
      const ny = Math.round(m.y - moving.dy);
      if (nx !== moving.obj.x || ny !== moving.obj.y) {
        const before = { x: moving.obj.x, y: moving.obj.y };
        begin();
        moving.obj.x = nx;
        moving.obj.y = ny;
        clampObject(map, moving.obj);
        if (before.x !== moving.obj.x || before.y !== moving.obj.y) onchange();
      }
    }
    request();
  }

  function finish(e: PointerEvent, commit: boolean) {
    pointers.delete(e.pointerId);
    if (mode === 'pinch') {
      if (pointers.size === 0) mode = 'none';
      return;
    }
    if (mode === 'rect' && rectStart && rectEnd && commit) {
      const x0 = clamp(Math.min(rectStart.x, rectEnd.x), 0, map.width - 1);
      const x1 = clamp(Math.max(rectStart.x, rectEnd.x), 0, map.width - 1);
      const y0 = clamp(Math.min(rectStart.y, rectEnd.y), 0, map.height - 1);
      const y1 = clamp(Math.max(rectStart.y, rectEnd.y), 0, map.height - 1);
      const rectInMap =
        Math.max(rectStart.x, rectEnd.x) >= 0 &&
        Math.min(rectStart.x, rectEnd.x) < map.width &&
        Math.max(rectStart.y, rectEnd.y) >= 0 &&
        Math.min(rectStart.y, rectEnd.y) < map.height;
      if (rectInMap) {
        onbegin();
        if (fillRect(map, x0, y0, x1, y1, erasing ? 0 : material)) {
          cleanupDoors(map);
          onchange();
        } else {
          oncancel();
        }
      }
    }
    if (pointers.size === 0) {
      mode = 'none';
      rectStart = rectEnd = null;
      lastCell = null;
      moving = null;
      began = false;
    }
    request();
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const p = local(e);
    // Trackpad-Pinch kommt als Wheel mit ctrlKey; Mausrad hat meist große, ganzzahlige Schritte.
    const looksLikeMouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50);
    if (e.ctrlKey || looksLikeMouseWheel) {
      zoomAt(p, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    } else {
      autoFit = false;
      cam.x -= e.deltaX;
      cam.y -= e.deltaY;
      request();
    }
  }

  function isTyping(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.code === 'Space' && !isTyping(e)) {
      spaceDown = true;
      e.preventDefault();
    }
  }

  function onkeyup(e: KeyboardEvent) {
    if (e.code === 'Space') spaceDown = false;
  }

  function draw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { dpr } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#14110e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y);
    renderMap(ctx, map, { cell: CELL, lightMarkers: true });

    const px = 1 / cam.zoom;
    // Kartenrand
    ctx.strokeStyle = 'rgba(224, 181, 106, 0.35)';
    ctx.lineWidth = 2 * px;
    ctx.strokeRect(0, 0, map.width * CELL, map.height * CELL);

    // Auswahl
    const sel = selectedId ? map.objects.find((o) => o.id === selectedId) : null;
    if (sel && map.layers.objects.visible) {
      const f = footprint(sel);
      ctx.save();
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.strokeStyle = '#e0b56a';
      ctx.lineWidth = 2 * px;
      ctx.strokeRect(sel.x * CELL - 2 * px, sel.y * CELL - 2 * px, f.w * CELL + 4 * px, f.h * CELL + 4 * px);
      ctx.restore();
    }

    // Rechteck-Vorschau
    if (mode === 'rect' && rectStart && rectEnd) {
      const x = Math.min(rectStart.x, rectEnd.x) * CELL;
      const y = Math.min(rectStart.y, rectEnd.y) * CELL;
      const w = (Math.abs(rectEnd.x - rectStart.x) + 1) * CELL;
      const h = (Math.abs(rectEnd.y - rectStart.y) + 1) * CELL;
      ctx.fillStyle = erasing ? 'rgba(200, 60, 50, 0.25)' : 'rgba(224, 181, 106, 0.3)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = erasing ? '#c83c32' : '#e0b56a';
      ctx.lineWidth = 2 * px;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = `${14 * px}px system-ui, sans-serif`;
      ctx.fillText(`${w / CELL} × ${h / CELL}`, x + 6 * px, y - 6 * px);
    }

    // Hover-Markierung
    if (tool === 'door' && hoverEdge) {
      const e = hoverEdge;
      const ok = hasDoor(map, e) || isOpenEdge(map, e);
      ctx.strokeStyle = ok ? '#e0b56a' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 6 * px;
      ctx.beginPath();
      ctx.moveTo(e.x * CELL, e.y * CELL);
      ctx.lineTo((e.dir === 'h' ? e.x + 1 : e.x) * CELL, (e.dir === 'h' ? e.y : e.y + 1) * CELL);
      ctx.stroke();
    } else if (tool === 'object' && hoverPoint && mode === 'none') {
      // halbtransparente Vorschau des Objekts
      const pos = placementAt(hoverPoint);
      const f = footprint({ type: objectType, rot: objectRot });
      ctx.save();
      ctx.globalAlpha = 0.6;
      drawObject(ctx, objectType, pos.x * CELL, pos.y * CELL, objectRot, CELL);
      ctx.restore();
      ctx.strokeStyle = 'rgba(224, 181, 106, 0.8)';
      ctx.lineWidth = 2 * px;
      ctx.strokeRect(pos.x * CELL, pos.y * CELL, f.w * CELL, f.h * CELL);
    } else if (hoverPoint && mode !== 'rect' && tool !== 'hand' && tool !== 'select') {
      const cx = Math.floor(hoverPoint.x);
      const cy = Math.floor(hoverPoint.y);
      if (inBounds(map, cx, cy)) {
        ctx.strokeStyle = 'rgba(224, 181, 106, 0.8)';
        ctx.lineWidth = 2 * px;
        ctx.strokeRect(cx * CELL, cy * CELL, CELL, CELL);
      }
    }
  }

  onMount(() => {
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const first = view.w === 0;
      // Größenänderung (z. B. Objektpalette, Drehen des iPads): einpassen oder Bildmitte halten
      if (!first) {
        cam.x += (r.width - view.w) / 2;
        cam.y += (r.height - view.h) / 2;
      }
      view = { w: r.width, h: r.height, dpr: window.devicePixelRatio || 1 };
      canvas.width = Math.round(r.width * view.dpr);
      canvas.height = Math.round(r.height * view.dpr);
      if (first || autoFit) fit();
      draw();
    });
    ro.observe(wrap);
    // Wheel muss non-passive sein, damit preventDefault das Seiten-Zoomen verhindert
    canvas.addEventListener('wheel', onwheel, { passive: false });
    return () => {
      ro.disconnect();
      canvas.removeEventListener('wheel', onwheel);
      cancelAnimationFrame(raf);
    };
  });
</script>

<svelte:window {onkeydown} {onkeyup} />

<div class="wrap" bind:this={wrap} class:panning={tool === 'hand' || spaceDown} class:pointer={tool === 'select'}>
  <canvas
    bind:this={canvas}
    {onpointerdown}
    {onpointermove}
    onpointerup={(e) => finish(e, true)}
    onpointercancel={(e) => finish(e, false)}
    onpointerleave={() => {
      hoverPoint = null;
      hoverEdge = null;
      request();
    }}
    oncontextmenu={(e) => e.preventDefault()}
  ></canvas>
</div>

<style>
  .wrap {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    cursor: crosshair;
  }
  .wrap.panning {
    cursor: grab;
  }
  .wrap.pointer {
    cursor: default;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
</style>
