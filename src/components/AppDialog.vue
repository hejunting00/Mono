<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { dialogState, _dialogClose } from '../lib/uidialog'
import { t } from '../lib/i18n'

const inputEl = ref<HTMLInputElement | null>(null)

const primaryLabel = computed(() => (dialogState.mode === 'confirm' ? t('ok') : dialogState.mode === 'alert' ? t('ok') : t('ok')))
const showCancel = computed(() => dialogState.mode !== 'alert')
const showInput = computed(() => dialogState.mode === 'input')

watch(
  () => dialogState.visible,
  async (v) => {
    if (v && showInput.value) {
      await nextTick()
      inputEl.value?.focus()
      inputEl.value?.select()
    }
  }
)

function ok(): void {
  _dialogClose(showInput.value ? dialogState.value : true)
}

function cancel(): void {
  _dialogClose(null)
}

function onKeydown(e: KeyboardEvent): void {
  if (!dialogState.visible) return
  if (e.key === 'Enter') {
    e.preventDefault()
    ok()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="dialogState.visible" class="dlg-overlay" @mousedown.self="cancel()" @keydown="onKeydown">
      <div class="dlg-card">
        <div class="dlg-title">{{ dialogState.title }}</div>
        <div v-if="dialogState.message" class="dlg-message">{{ dialogState.message }}</div>
        <input
          v-if="showInput"
          ref="inputEl"
          v-model="dialogState.value"
          class="dlg-input"
          @keydown="onKeydown"
        />
        <div class="dlg-buttons">
          <button v-if="showCancel" class="dlg-btn" @click="cancel">{{ t('cancel') }}</button>
          <button class="dlg-btn dlg-primary" @click="ok">{{ primaryLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dlg-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 18vh;
}

.dlg-card {
  width: 340px;
  background: var(--md-panel);
  backdrop-filter: blur(32px) saturate(1.8);
  -webkit-backdrop-filter: blur(32px) saturate(1.8);
  border: 1px solid var(--md-border);
  border-radius: 14px;
  box-shadow: var(--md-shadow);
  padding: 18px;
}

.dlg-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--md-text);
}

.dlg-message {
  margin-top: 6px;
  font-size: 13px;
  color: var(--md-muted);
  line-height: 1.5;
  word-break: break-all;
}

.dlg-input {
  margin-top: 12px;
  width: 100%;
  background: var(--md-bg);
  color: var(--md-text);
  border: 1px solid var(--md-border);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.dlg-input:focus {
  border-color: var(--md-accent);
  box-shadow: 0 0 0 3px var(--md-accent-soft);
}

.dlg-buttons {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.dlg-btn {
  border: none;
  background: transparent;
  color: var(--md-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 16px;
  border-radius: 8px;
  cursor: default;
}
.dlg-btn:hover {
  background: var(--md-active-line);
}
.dlg-primary {
  background: var(--md-accent);
  color: #fff;
}
.dlg-primary:hover {
  background: var(--md-accent);
  filter: brightness(1.08);
}
</style>
