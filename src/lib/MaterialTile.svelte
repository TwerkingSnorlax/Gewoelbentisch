<script lang="ts">
  // Kleine Vorschau eines Bodenmaterials mit der echten Textur (2 × 2 Felder)
  import type { Material } from './map';
  import { drawFloorCell } from './render';

  let { material, size = 34 }: { material: Material; size?: number } = $props();
  let canvas: HTMLCanvasElement;

  $effect(() => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d')!;
    const c = size / 2;
    // feste Feldposition (3, 7) für eine typische Textur, zurück auf (0, 0) verschoben
    ctx.setTransform(dpr, 0, 0, dpr, -3 * c * dpr, -7 * c * dpr);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) drawFloorCell(ctx, material, x + 3, y + 7, c);
  });
</script>

<canvas bind:this={canvas} style:width="{size}px" style:height="{size}px" aria-hidden="true"></canvas>
