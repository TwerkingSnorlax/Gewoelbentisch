<script lang="ts">
  import { drawObject, OBJECTS, type ObjectType } from './objects';

  let { type, size = 48 }: { type: ObjectType; size?: number } = $props();
  let canvas: HTMLCanvasElement;

  $effect(() => {
    const def = OBJECTS[type];
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d')!;
    const c = (size * 0.9) / Math.max(def.w, def.h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawObject(ctx, type, (size - def.w * c) / 2, (size - def.h * c) / 2, 0, c);
  });
</script>

<canvas bind:this={canvas} style:width="{size}px" style:height="{size}px" aria-hidden="true"></canvas>
