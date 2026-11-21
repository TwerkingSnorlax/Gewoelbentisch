<script lang="ts">
  import MapCanvas from './lib/MapCanvas.svelte';
  import ObjectIcon from './lib/ObjectIcon.svelte';
  import { t, locale, LOCALES } from './lib/i18n';
  import { TOOLS, type Tool } from './lib/tools';
  import {
    clampSize,
    createMap,
    deserialize,
    footprint,
    LAYERS,
    MATERIALS,
    materialId,
    newId,
    resizeMap,
    rotateObject,
    serialize,
    clampObject,
    trimToContent,
    STYLES,
    MAX_SIZE,
    MIN_SIZE,
    type MapDoc,
    type Material,
    type Rotation,
    type StyleId,
    type LayerId,
  } from './lib/map';
  import { OBJECT_CATEGORIES, OBJECT_TYPES, OBJECTS, type ObjectType } from './lib/objects';
  import { MATERIAL_SWATCH, STYLE_DEFS } from './lib/render';
  import { generateMap, randomSeed } from './lib/generator';
  import { exportPng, exportVtt, fileBaseName, saveProject, PROJECT_EXT, VTT_LIGHTS, type VttLights } from './lib/export';
  import { isInstalledApp, offlineReady, updateAvailable } from './lib/offline';

  const AUTOSAVE_KEY = 'gewoelbentisch.autosave';
  const HISTORY_LIMIT = 100;
  const VERSION = __VERSION__;

  function loadAutosave(): MapDoc | null {
    try {
      const text = localStorage.getItem(AUTOSAVE_KEY);
      return text ? deserialize(text) : null;
    } catch {
      return null;
    }
  }

  const initialMap = loadAutosave() ?? createMap(30, 20, $t('map.defaultName'));
  let map = $state.raw<MapDoc>(initialMap);
  let rev = $state(0);
  let tool = $state<Tool>('room');
  let eraseMode = $state(false);
  let material = $state<Material>(STYLE_DEFS[initialMap.style].material);
  let objectType = $state<ObjectType>('pillar');
  let objectRot = $state<Rotation>(0);
  let selectedId = $state<string | null>(null);
  let panel = $state<'settings' | 'layers' | 'generate' | null>(null);
  let lockedHint = $state(false);
  let widthInput = $state(initialMap.width);
  let heightInput = $state(initialMap.height);
  let gen = $state({ rooms: 8, style: initialMap.style as StyleId, seed: randomSeed() });
  let canvasRef: ReturnType<typeof MapCanvas> | undefined = $state();
  let fileInput: HTMLInputElement;
  let updating = $state(false);

  // Karte wächst automatisch beim Zeichnen über den Rand (Einstellung je Gerät)
  const AUTOGROW_KEY = 'gewoelbentisch.autoGrow';
  let autoGrow = $state(
    (() => {
      try {
        return localStorage.getItem(AUTOGROW_KEY) !== '0';
      } catch {
        return true;
      }
    })(),
  );
  // Lichter im VTT-Export (Einstellung je Gerät)
  const VTTLIGHTS_KEY = 'gewoelbentisch.vttLights';
  let vttLights = $state<VttLights>(
    (() => {
      try {
        const v = localStorage.getItem(VTTLIGHTS_KEY) as VttLights | null;
        return v && VTT_LIGHTS.includes(v) ? v : 'neutral';
      } catch {
        return 'neutral';
      }
    })(),
  );
  function setVttLights(v: VttLights) {
    vttLights = v;
    try {
      localStorage.setItem(VTTLIGHTS_KEY, v);
    } catch {
      /* ignorieren */
    }
  }

  function setAutoGrow(v: boolean) {
    autoGrow = v;
    try {
      localStorage.setItem(AUTOGROW_KEY, v ? '1' : '0');
    } catch {
      /* ignorieren */
    }
  }

  // Verlauf für Rückgängig/Wiederholen (als Schnappschüsse; Karten sind klein)
  let undoStack: string[] = [];
  let redoStack: string[] = [];
  let historyRev = $state(0);
  const canUndo = $derived(historyRev >= 0 && undoStack.length > 0);
  const canRedo = $derived(historyRev >= 0 && redoStack.length > 0);

  // map ist nicht tief reaktiv: Werte, die sich durch Bearbeiten ändern, hängen am Zähler rev
  const layers = $derived(rev >= 0 ? structuredClone(map.layers) : map.layers);
  const mapStyle = $derived(rev >= 0 ? map.style : map.style);
  const selected = $derived(rev >= 0 && selectedId ? (map.objects.find((o) => o.id === selectedId) ?? null) : null);

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function saveNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(AUTOSAVE_KEY, serialize(map));
    } catch {
      /* Speicher voll oder nicht verfügbar */
    }
  }
  function scheduleAutosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  function replaceMap(next: MapDoc) {
    map = next;
    widthInput = next.width;
    heightInput = next.height;
    if (selectedId && !next.objects.some((o) => o.id === selectedId)) selectedId = null;
    rev++;
    scheduleAutosave();
  }

  function pushHistory() {
    undoStack.push(serialize(map));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
    historyRev++;
  }

  function onchange() {
    rev++;
    // die Karte kann beim Zeichnen gewachsen sein
    widthInput = map.width;
    heightInput = map.height;
    scheduleAutosave();
  }

  /** Eine Änderung als ein Rückgängig-Schritt */
  function edit(fn: (m: MapDoc) => void) {
    pushHistory();
    fn(map);
    onchange();
  }

  /** Letzten Schnappschuss verwerfen und wiederherstellen, ohne Wiederholen-Eintrag */
  function oncancel() {
    const prev = undoStack.pop();
    if (prev) replaceMap(deserialize(prev));
    historyRev++;
  }

  function undo() {
    const prev = undoStack.pop();
    if (!prev) return;
    redoStack.push(serialize(map));
    replaceMap(deserialize(prev));
    historyRev++;
  }

  function redo() {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(serialize(map));
    replaceMap(deserialize(next));
    historyRev++;
  }

  function newMap() {
    if (!confirm($t('confirm.new'))) return;
    pushHistory();
    replaceMap(createMap(clampSize(widthInput), clampSize(heightInput), $t('map.defaultName'), map.style));
    canvasRef?.fit();
  }

  function applySize() {
    const w = clampSize(widthInput);
    const h = clampSize(heightInput);
    if (w === map.width && h === map.height) return;
    pushHistory();
    replaceMap(resizeMap(map, w, h));
    canvasRef?.fit();
  }

  function trim() {
    pushHistory();
    if (trimToContent(map)) {
      onchange();
      canvasRef?.fit();
    } else {
      undoStack.pop();
      historyRev++;
    }
  }

  function setStyle(style: StyleId) {
    if (style === map.style) return;
    edit((m) => (m.style = style));
    material = STYLE_DEFS[style].material;
    gen.style = style;
  }

  function setLayer(id: LayerId, key: 'visible' | 'locked', value: boolean) {
    // Ebenen-Einstellungen sind Ansicht, kein Rückgängig-Schritt
    map.layers[id][key] = value;
    onchange();
  }

  function renameMap(name: string) {
    map.name = name;
    scheduleAutosave();
  }

  function generate() {
    pushHistory();
    const next = generateMap({
      width: clampSize(widthInput),
      height: clampSize(heightInput),
      rooms: gen.rooms,
      style: gen.style,
      seed: gen.seed,
      name: map.name || $t('map.defaultName'),
    });
    material = STYLE_DEFS[gen.style].material;
    replaceMap(next);
    canvasRef?.fit();
  }

  /* ---- Objekte ---- */
  function rotate() {
    if (tool === 'select' && selected) {
      edit((m) => rotateObject(m, m.objects.find((o) => o.id === selectedId)!));
    } else {
      objectRot = ((objectRot + 90) % 360) as Rotation;
      if (selected && tool === 'object') edit((m) => rotateObject(m, m.objects.find((o) => o.id === selectedId)!));
    }
  }
  function deleteSelected() {
    if (!selected) return;
    const id = selected.id;
    edit((m) => (m.objects = m.objects.filter((o) => o.id !== id)));
    selectedId = null;
  }
  function duplicateSelected() {
    if (!selected) return;
    const f = footprint(selected);
    const copy = { ...selected, id: newId(), x: selected.x + f.w, y: selected.y };
    edit((m) => {
      clampObject(m, copy);
      m.objects = [...m.objects, copy];
    });
    selectedId = copy.id;
  }
  function chooseObject(type: ObjectType) {
    objectType = type;
    tool = 'object';
  }

  async function openFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const next = deserialize(await file.text());
      pushHistory();
      replaceMap(next);
      material = STYLE_DEFS[next.style].material;
      canvasRef?.fit();
    } catch {
      alert($t('error.open'));
    }
  }

  const baseName = () => fileBaseName(map, $t('map.defaultName'));

  async function doExport(kind: 'png' | 'vtt') {
    try {
      if (kind === 'png') await exportPng(map, baseName());
      else exportVtt(map, baseName(), vttLights);
    } catch (err) {
      console.error(err);
      alert($t('error.export'));
    }
  }

  function reloadForUpdate() {
    updating = true;
    saveNow();
    location.reload();
  }

  let lockedTimer: ReturnType<typeof setTimeout> | undefined;
  function onlocked() {
    lockedHint = true;
    clearTimeout(lockedTimer);
    lockedTimer = setTimeout(() => (lockedHint = false), 2500);
  }

  function onkeydown(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
    // Escape schließt das offene Fenster auch, wenn darin gerade ein Feld den Fokus hat
    if (e.key === 'Escape' && panel) {
      panel = null;
      el?.blur?.();
      return;
    }
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && key === 'y') {
      e.preventDefault();
      redo();
    } else if (mod && key === 's') {
      e.preventDefault();
      saveProject(map, baseName());
    } else if (mod && key === 'o') {
      e.preventDefault();
      fileInput.click();
    } else if (mod && key === 'd') {
      e.preventDefault();
      duplicateSelected();
    } else if (!mod && !e.altKey) {
      const found = TOOLS.find((x) => x.key === e.key);
      if (found) tool = found.id;
      else if (key === 'f') canvasRef?.fit();
      else if (key === 'g') setLayer('grid', 'visible', !map.layers.grid.visible);
      else if (key === 'x') eraseMode = !eraseMode;
      else if (key === 'r') rotate();
      else if (key === 'delete' || key === 'backspace') deleteSelected();
      else if (key === 'escape') {
        selectedId = null;
        panel = null;
      }
    }
  }

  const hint = $derived(
    lockedHint
      ? $t('hint.locked')
      : tool === 'room' && eraseMode
        ? $t('hint.room.erase')
        : tool === 'object'
          ? $t('hint.object', { name: $t(`obj.${objectType}`) })
          : $t(`hint.${tool}`),
  );

  function togglePanel(p: 'settings' | 'layers' | 'generate') {
    panel = panel === p ? null : p;
  }
</script>

<svelte:window {onkeydown} />

<div class="app">
  <header class="topbar">
    <div class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"
        ><path d="M6 26V14a10 10 0 0 1 20 0v12" fill="none" stroke="currentColor" stroke-width="3" /><path
          d="M12 26v-8a4 4 0 0 1 8 0v8"
          fill="currentColor"
        /></svg
      >
      <span class="brand-name">{$t('app.title')}</span>
    </div>

    <input
      class="map-name"
      type="text"
      value={map.name}
      aria-label={$t('map.name')}
      oninput={(e) => renameMap(e.currentTarget.value)}
    />

    <div class="actions">
      <button onclick={newMap} title={$t('action.new')}>
        <svg viewBox="0 0 24 24"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M12 11v6M9 14h6" /></svg>
        <span class="optional">{$t('action.new')}</span>
      </button>
      <button onclick={() => fileInput.click()} title={$t('action.open')}>
        <svg viewBox="0 0 24 24"><path d="M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /></svg>
        <span class="optional">{$t('action.open')}</span>
      </button>
      <button onclick={() => saveProject(map, baseName())} title={$t('action.save')}>
        <svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM8 3v5h7V3M8 21v-7h8v7" /></svg>
        <span class="optional">{$t('action.save')}</span>
      </button>
      <span class="sep"></span>
      <button onclick={undo} disabled={!canUndo} title={$t('action.undo')}>
        <svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
      </button>
      <button onclick={redo} disabled={!canRedo} title={$t('action.redo')}>
        <svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" /></svg>
      </button>
      <span class="sep"></span>
      <button id="btnGenerate" onclick={() => togglePanel('generate')} class:active={panel === 'generate'} title={$t('gen.title')}>
        <svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z M8.5 8.5h.01 M15.5 8.5h.01 M12 12h.01 M8.5 15.5h.01 M15.5 15.5h.01" /></svg>
        <span class="optional">{$t('action.generate')}</span>
      </button>
      <button id="btnLayers" onclick={() => togglePanel('layers')} class:active={panel === 'layers'} title={$t('layer.title')}>
        <svg viewBox="0 0 24 24"><path d="M12 3 2 8l10 5 10-5z M2 13l10 5 10-5 M2 17.5l10 5 10-5" /></svg>
        <span class="optional">{$t('action.layers')}</span>
      </button>
      <button id="btnSettings" onclick={() => togglePanel('settings')} class:active={panel === 'settings'} title={$t('settings.title')}>
        <svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4" /></svg>
        <span class="optional">{$t('action.settings')}</span>
      </button>
      <span class="sep"></span>
      <button onclick={() => doExport('png')} title={$t('action.exportPng.title')}>
        <svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01" /></svg>
        <span class="optional">{$t('action.exportPng')}</span>
      </button>
      <button class="primary" onclick={() => doExport('vtt')} title={$t('action.exportVtt.title')}>
        <svg viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3" /></svg>
        <span>{$t('action.exportVtt')}</span>
      </button>
    </div>
    <input bind:this={fileInput} type="file" accept={`${PROJECT_EXT},.json,application/json`} hidden onchange={openFile} />
  </header>

  {#if $updateAvailable}
    <div id="updateBar" role="status">
      <span>{$t('update.text')}</span>
      <button id="updateReload" class="primary" disabled={updating} onclick={reloadForUpdate}>
        {updating ? $t('update.saving') : $t('update.reload')}
      </button>
      <button id="updateLater" onclick={() => updateAvailable.set(false)}>{$t('update.later')}</button>
    </div>
  {/if}

  <main>
    <nav class="tools" aria-label={$t('tools.label')}>
      {#each TOOLS as item (item.id)}
        <button
          class="tool"
          class:active={tool === item.id}
          class:locked={item.layer && layers[item.layer].locked}
          data-tool={item.id}
          onclick={() => (tool = item.id)}
          title={`${$t(`tool.${item.id}`)} (${item.key})`}
          aria-pressed={tool === item.id}
        >
          <svg viewBox="0 0 24 24"><path d={item.icon} /></svg>
          <span>{$t(`tool.${item.id}`)}</span>
        </button>
      {/each}
      <span class="tools-sep"></span>
      <button class="tool" onclick={() => canvasRef?.fit()} title={`${$t('action.fit')} (F)`}>
        <svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
        <span>{$t('action.fit')}</span>
      </button>
    </nav>

    <div class="stage">
      <div class="canvas-row">
        <MapCanvas
          bind:this={canvasRef}
          bind:selectedId
          {map}
          {rev}
          {tool}
          {eraseMode}
          material={materialId(material)}
          {objectType}
          {objectRot}
          {autoGrow}
          onbegin={pushHistory}
          {onchange}
          {oncancel}
          {onlocked}
        />

        {#if tool === 'object'}
          <aside class="palette" aria-label={$t('objects.title')}>
            {#each OBJECT_CATEGORIES as cat (cat)}
              <h3>{$t(`cat.${cat}`)}</h3>
              <div class="palette-grid">
                {#each OBJECT_TYPES.filter((ty) => OBJECTS[ty].category === cat) as ty (ty)}
                  <button
                    class="palette-item"
                    class:active={objectType === ty}
                    data-object={ty}
                    onclick={() => chooseObject(ty)}
                    title={$t(`obj.${ty}`)}
                  >
                    <ObjectIcon type={ty} size={40} />
                    <span>{$t(`obj.${ty}`)}</span>
                  </button>
                {/each}
              </div>
            {/each}
          </aside>
        {/if}
      </div>

      <div class="statusbar">
        {#if tool === 'room'}
          <div class="segmented" role="group">
            <button class:active={!eraseMode} onclick={() => (eraseMode = false)}>{$t('mode.add')}</button>
            <button class:active={eraseMode} onclick={() => (eraseMode = true)}>{$t('mode.remove')}</button>
          </div>
        {/if}
        {#if tool === 'room' || tool === 'brush'}
          <div class="swatches" role="group" aria-label={$t('material.label')}>
            {#each MATERIALS as mat (mat)}
              <button
                class="swatch"
                class:active={material === mat}
                data-material={mat}
                style:background={MATERIAL_SWATCH[mat]}
                onclick={() => {
                  material = mat;
                  eraseMode = false;
                }}
                title={$t(`material.${mat}`)}
                aria-label={$t(`material.${mat}`)}
              ></button>
            {/each}
          </div>
        {/if}
        {#if (tool === 'select' || tool === 'object') && selected}
          <div class="segmented" role="group">
            <button id="objRotate" onclick={rotate}>{$t('objects.rotate')}</button>
            <button id="objDuplicate" onclick={duplicateSelected}>{$t('objects.duplicate')}</button>
            <button id="objDelete" class="danger" onclick={deleteSelected}>{$t('objects.delete')}</button>
          </div>
        {:else if tool === 'object'}
          <div class="segmented" role="group">
            <button onclick={rotate}>{$t('objects.rotate')} ({objectRot}°)</button>
          </div>
        {/if}
        <span class="hint" class:warn={lockedHint}>{hint}</span>
        <span class="size">{map.width} × {map.height}</span>
      </div>

      {#if panel === 'settings'}
        <aside class="panel" id="panelSettings">
          <h2>{$t('settings.title')}</h2>
          <div class="row">
            <label>
              {$t('settings.width')}
              <input type="number" min={MIN_SIZE} max={MAX_SIZE} bind:value={widthInput} />
            </label>
            <label>
              {$t('settings.height')}
              <input type="number" min={MIN_SIZE} max={MAX_SIZE} bind:value={heightInput} />
            </label>
          </div>
          <button class="block" onclick={applySize}>{$t('settings.apply')}</button>
          <label class="check">
            <input id="autoGrow" type="checkbox" checked={autoGrow} onchange={(e) => setAutoGrow(e.currentTarget.checked)} />
            {$t('settings.autoGrow')}
          </label>
          <p class="note">{$t('settings.autoGrow.note')}</p>
          <button id="trimMap" class="block" onclick={trim}>{$t('settings.trim')}</button>
          <label>
            {$t('settings.vttLights')}
            <select id="vttLights" value={vttLights} onchange={(e) => setVttLights(e.currentTarget.value as VttLights)}>
              {#each VTT_LIGHTS as v (v)}
                <option value={v}>{$t(`settings.vttLights.${v}`)}</option>
              {/each}
            </select>
          </label>
          <label>
            {$t('style.label')}
            <select id="styleSelect" value={mapStyle} onchange={(e) => setStyle(e.currentTarget.value as StyleId)}>
              {#each STYLES as st (st)}
                <option value={st}>{$t(`style.${st}`)}</option>
              {/each}
            </select>
          </label>
          {#if LOCALES.length > 1}
            <label>
              {$t('settings.language')}
              <select bind:value={$locale}>
                {#each LOCALES as l (l.code)}
                  <option value={l.code}>{l.label}</option>
                {/each}
              </select>
            </label>
          {/if}
          <p class="note" id="appVersion">
            {$t('settings.version', { version: VERSION })} · {isInstalledApp() ? $t('settings.installed') : $t('settings.browser')}{$offlineReady
              ? ` · ${$t('settings.offline')}`
              : ''}
          </p>
          <button class="block" onclick={() => (panel = null)}>{$t('settings.close')}</button>
        </aside>
      {:else if panel === 'layers'}
        <aside class="panel" id="panelLayers">
          <h2>{$t('layer.title')}</h2>
          {#each LAYERS as id (id)}
            <div class="layer-row" data-layer={id}>
              <span class="layer-name">{$t(`layer.${id}`)}</span>
              <button
                class="icon-toggle"
                class:off={!layers[id].visible}
                data-action="visible"
                aria-pressed={layers[id].visible}
                title={$t('layer.visible')}
                onclick={() => setLayer(id, 'visible', !layers[id].visible)}
              >
                {#if layers[id].visible}
                  <svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" /></svg>
                {:else}
                  <svg viewBox="0 0 24 24"><path d="M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8 M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /></svg>
                {/if}
              </button>
              {#if id !== 'grid'}
                <button
                  class="icon-toggle"
                  class:on={layers[id].locked}
                  data-action="locked"
                  aria-pressed={layers[id].locked}
                  title={$t('layer.locked')}
                  onclick={() => setLayer(id, 'locked', !layers[id].locked)}
                >
                  {#if layers[id].locked}
                    <svg viewBox="0 0 24 24"><path d="M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                  {:else}
                    <svg viewBox="0 0 24 24"><path d="M5 11h14v10H5z M8 11V7a4 4 0 0 1 7.8-1.2" /></svg>
                  {/if}
                </button>
              {:else}
                <span class="icon-spacer"></span>
              {/if}
            </div>
          {/each}
          <p class="note">{$t('layer.note')}</p>
          <button class="block" onclick={() => (panel = null)}>{$t('settings.close')}</button>
        </aside>
      {:else if panel === 'generate'}
        <aside class="panel" id="panelGenerate">
          <h2>{$t('gen.title')}</h2>
          <label>
            {$t('style.label')}
            <select id="genStyle" bind:value={gen.style}>
              {#each STYLES as st (st)}
                <option value={st}>{$t(`style.${st}`)}</option>
              {/each}
            </select>
          </label>
          <div class="row">
            <label>
              {$t('settings.width')}
              <input type="number" min={MIN_SIZE} max={MAX_SIZE} bind:value={widthInput} />
            </label>
            <label>
              {$t('settings.height')}
              <input type="number" min={MIN_SIZE} max={MAX_SIZE} bind:value={heightInput} />
            </label>
          </div>
          <label>
            {$t('gen.rooms')}: {gen.rooms}
            <input id="genRooms" type="range" min="2" max="20" bind:value={gen.rooms} />
          </label>
          <div class="row end">
            <label>
              {$t('gen.seed')}
              <input id="genSeed" type="number" min="0" bind:value={gen.seed} />
            </label>
            <button class="block square" title={$t('gen.reroll')} onclick={() => (gen.seed = randomSeed())}>
              <svg viewBox="0 0 24 24"><path d="M4 4v6h6 M20 20v-6h-6 M5.6 15a7 7 0 0 0 12.8 2 M18.4 9A7 7 0 0 0 5.6 7" /></svg>
            </button>
          </div>
          <button id="genCreate" class="block primary-block" onclick={generate}>{$t('gen.create')}</button>
          <p class="note">{$t('gen.note')}</p>
        </aside>
      {/if}
    </div>
  </main>
</div>
