<script setup lang="ts">
import TrafficLights from './TrafficLights.vue'

defineProps<{ title: string; dirty: boolean }>()
</script>

<template>
  <div class="titlebar" data-tauri-drag-region>
    <div class="identity" data-tauri-drag-region>
      <svg class="app-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <defs>
          <linearGradient id="mdread-icon-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#0a84ff" />
            <stop offset="1" stop-color="#0055d4" />
          </linearGradient>
        </defs>
        <rect width="16" height="16" rx="4.2" fill="url(#mdread-icon-g)" />
        <path
          d="M4.4 11.2V4.8h1.5l2.1 3.1 2.1-3.1h1.5v6.4H10V7.3l-2 2.9-2-2.9v3.9z"
          fill="#fff"
        />
      </svg>
      <span class="app-name">mdread</span>
    </div>
    <div class="titlebar-title" data-tauri-drag-region>
      <span v-if="dirty" class="titlebar-dirty">●</span>
      <span class="titlebar-name">{{ title }}</span>
    </div>
    <TrafficLights />
  </div>
</template>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  height: 40px;
  min-height: 40px;
  padding: 0 10px 0 12px;
  gap: 10px;
  background: var(--md-panel);
  backdrop-filter: blur(24px) saturate(1.6);
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  border-bottom: 1px solid var(--md-border);
  user-select: none;
  position: relative;
  z-index: 100;
}

.identity {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.app-icon {
  display: block;
  border-radius: 4.2px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
}
.app-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--md-text);
  letter-spacing: -0.01em;
}

.titlebar-title {
  flex: 1;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--md-muted);
  letter-spacing: -0.01em;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: none;
}
.titlebar-dirty {
  color: var(--md-muted);
  font-size: 9px;
  margin-right: 5px;
  vertical-align: 1px;
}
</style>
