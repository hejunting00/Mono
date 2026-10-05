<script setup lang="ts">
import { isTauri } from '../lib/env'

async function act(kind: 'close' | 'minimize' | 'zoom'): Promise<void> {
  if (!isTauri()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  try {
    if (kind === 'close') await win.close()
    else if (kind === 'minimize') await win.minimize()
    else await win.toggleMaximize()
  } catch (e) {
    console.warn('window action failed', kind, e)
  }
}
</script>

<template>
  <!-- Windows placement: right edge, order minimize → zoom → close -->
  <div class="traffic-lights" @dblclick.stop>
    <button class="tl tl-min" title="Minimize" @click.stop="act('minimize')">
      <svg class="tl-glyph" viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 6h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>
    </button>
    <button class="tl tl-zoom" title="Maximize" @click.stop="act('zoom')">
      <svg class="tl-glyph" viewBox="0 0 12 12" width="12" height="12"><path d="M3 7.2V3h4.2M9 4.8V9H4.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"/></svg>
    </button>
    <button class="tl tl-close" title="Close" @click.stop="act('close')">
      <svg class="tl-glyph" viewBox="0 0 12 12" width="12" height="12"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>
    </button>
  </div>
</template>

<style scoped>
.traffic-lights {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 2px;
  flex-shrink: 0;
}

.tl {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: default;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: filter 0.12s ease;
}

.tl:active {
  filter: brightness(0.85);
}

.tl-close {
  background: #ff5f57;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
}
.tl-min {
  background: #febc2e;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
}
.tl-zoom {
  background: #28c840;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
}

/* glyphs appear on group hover */
.tl-glyph {
  position: absolute;
  inset: 0;
  margin: auto;
  color: rgba(77, 0, 0, 0.55);
  opacity: 0;
  transition: opacity 0.1s ease;
  pointer-events: none;
}
.traffic-lights:hover .tl-glyph {
  opacity: 1;
}
</style>
