<script lang="ts">
  import MapCanvas from './lib/MapCanvas.svelte';
  import { t, locale, LOCALES } from './lib/i18n';
  import { TOOLS, type Tool } from './lib/tools';
  import { clampSize, createMap, deserialize, resizeMap, serialize, MAX_SIZE, MIN_SIZE, type MapDoc } from './lib/map';
  import { exportPng, exportVtt, fileBaseName, saveProject, PROJECT_EXT } from './lib/export';

  const AUTOSAVE_KEY = 'gewoelbentisch.autosave';
  const HISTORY_LIMIT = 100;

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
  let showGrid = $state(true);
  let settingsOpen = $state(false);
  let widthInput = $state(initialMap.width);
  let heightInput = $state(initialMap.height);
  let canvasRef: ReturnType<typeof MapCanvas> | undefined = $state();
  let fileInput: HTMLInputElement;

  // Verlauf für Rückgängig/Wiederholen (als Schnappschüsse; Karten sind klein)
  let undoStack: string[] = [];
  let redoStack: string[] = [];
  let historyRev = $state(0);
  const canUndo = $derived(historyRev >= 0 && undoStack.length > 0);
  const canRedo = $derived(historyRev >= 0 && redoStack.length > 0);

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleAutosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, serialize(map));
      } catch {
        /* Speicher voll oder nicht verfügbar */
      }
    }, 400);
  }

  function replaceMap(next: MapDoc) {
    map = next;
    widthInput = next.width;
    heightInput = next.height;
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
    scheduleAutosave();
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
    replaceMap(createMap(clampSize(widthInput), clampSize(heightInput), $t('map.defaultName')));
    canvasRef?.fit();
  }

  function applySize() {
    const w = clampSize(widthInput);
    const h = clampSize(heightInput);
    if (w === map.width && h === map.height) return;
    pushHistory();
    replaceMap(resizeMap(map, w, h));
  }

  function renameMap(name: string) {
    map.name = name;
    scheduleAutosave();
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
      canvasRef?.fit();
    } catch {
      alert($t('error.open'));
    }
  }

  const baseName = () => fileBaseName(map, $t('map.defaultName'));

  async function doExport(kind: 'png' | 'vtt') {
    try {
      if (kind === 'png') await exportPng(map, showGrid, baseName());
      else exportVtt(map, showGrid, baseName());
    } catch (err) {
      console.error(err);
      alert($t('error.export'));
    }
  }

  function onkeydown(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
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
    } else if (!mod && !e.altKey) {
      const found = TOOLS.find((x) => x.key === e.key);
      if (found) tool = found.id;
      else if (key === 'f') canvasRef?.fit();
      else if (key === 'g') showGrid = !showGrid;
      else if (key === 'x') eraseMode = !eraseMode;
    }
  }

  const hint = $derived(tool === 'room' && eraseMode ? $t('hint.room.erase') : $t(`hint.${tool}`));
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
        <span>{$t('action.new')}</span>
      </button>
      <button onclick={() => fileInput.click()} title={$t('action.open')}>
        <svg viewBox="0 0 24 24"><path d="M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /></svg>
        <span>{$t('action.open')}</span>
      </button>
      <button onclick={() => saveProject(map, baseName())} title={$t('action.save')}>
        <svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM8 3v5h7V3M8 21v-7h8v7" /></svg>
        <span>{$t('action.save')}</span>
      </button>
      <span class="sep"></span>
      <button onclick={undo} disabled={!canUndo} title={$t('action.undo')}>
        <svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
        <span class="optional">{$t('action.undo')}</span>
      </button>
      <button onclick={redo} disabled={!canRedo} title={$t('action.redo')}>
        <svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" /></svg>
        <span class="optional">{$t('action.redo')}</span>
      </button>
      <span class="sep"></span>
      <button onclick={() => doExport('png')} title={$t('action.exportPng.title')}>
        <svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01" /></svg>
        <span>{$t('action.exportPng')}</span>
      </button>
      <button class="primary" onclick={() => doExport('vtt')} title={$t('action.exportVtt.title')}>
        <svg viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3" /></svg>
        <span>{$t('action.exportVtt')}</span>
      </button>
      <button onclick={() => (settingsOpen = !settingsOpen)} class:active={settingsOpen} title={$t('settings.title')}>
        <svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4" /></svg>
        <span class="optional">{$t('action.settings')}</span>
      </button>
    </div>
    <input bind:this={fileInput} type="file" accept={`${PROJECT_EXT},.json,application/json`} hidden onchange={openFile} />
  </header>

  <main>
    <nav class="tools" aria-label="Werkzeuge">
      {#each TOOLS as item (item.id)}
        <button
          class="tool"
          class:active={tool === item.id}
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
      <MapCanvas
        bind:this={canvasRef}
        {map}
        {rev}
        {tool}
        {eraseMode}
        {showGrid}
        onbegin={pushHistory}
        {onchange}
        {oncancel}
      />

      <div class="statusbar">
        {#if tool === 'room'}
          <div class="segmented" role="group">
            <button class:active={!eraseMode} onclick={() => (eraseMode = false)}>{$t('mode.add')}</button>
            <button class:active={eraseMode} onclick={() => (eraseMode = true)}>{$t('mode.remove')}</button>
          </div>
        {/if}
        <span class="hint">{hint}</span>
        <span class="size">{map.width} × {map.height}</span>
      </div>

      {#if settingsOpen}
        <aside class="settings">
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
            <input type="checkbox" bind:checked={showGrid} />
            {$t('settings.grid')}
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
          <button class="block" onclick={() => (settingsOpen = false)}>{$t('settings.close')}</button>
        </aside>
      {/if}
    </div>
  </main>
</div>
