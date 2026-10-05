<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { t, type Locale } from '../lib/i18n'
import type { Settings } from '../lib/tauri'

const props = defineProps<{ settings: Settings; locale: Locale }>()
const emit = defineEmits<{ action: [string] }>()

interface MenuEntry {
  separator?: boolean
  label?: string
  shortcut?: string
  action?: string
  checked?: boolean
}
interface MenuDef {
  title: string
  entries: MenuEntry[]
}

const openIndex = ref(-1)

function onGlobalKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') openIndex.value = -1
}

onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))
const menuEls = ref<(HTMLElement | null)[]>([])
const dropdownStyle = ref<Record<string, string>>({})

const menus = computed<MenuDef[]>(() => {
  void props.locale
  void props.settings
  return [
    {
      title: t('sectionFile'),
      entries: [
        { label: t('newTab'), shortcut: 'Ctrl+N', action: 'file.new' },
        { label: t('openFile'), shortcut: 'Ctrl+O', action: 'file.open' },
        { label: t('openFolder'), shortcut: 'Ctrl+Shift+O', action: 'file.openFolder' },
        { separator: true },
        { label: t('save'), shortcut: 'Ctrl+S', action: 'file.save' },
        { label: t('saveAs'), shortcut: 'Ctrl+Shift+S', action: 'file.saveAs' },
        { label: t('autoSave'), action: 'file.autosave', checked: props.settings.autosave },
        { separator: true },
        { label: t('exportHtml'), action: 'file.exportHtml' },
        { label: t('exportPdf'), shortcut: 'Ctrl+P', action: 'file.exportPdf' },
        { label: t('closeTab'), shortcut: 'Ctrl+W', action: 'file.closeTab' }
      ]
    },
    {
      title: t('sectionEdit'),
      entries: [
        { label: t('undo'), shortcut: 'Ctrl+Z', action: 'edit.undo' },
        { label: t('redo'), shortcut: 'Ctrl+Y', action: 'edit.redo' },
        { separator: true },
        { label: t('find'), shortcut: 'Ctrl+F', action: 'edit.find' },
        { label: t('replace'), shortcut: 'Ctrl+H', action: 'edit.replace' }
      ]
    },
    {
      title: t('sectionParagraph'),
      entries: [
        { label: t('heading1'), shortcut: 'Ctrl+1', action: 'para.h1' },
        { label: t('heading2'), shortcut: 'Ctrl+2', action: 'para.h2' },
        { label: t('heading3'), shortcut: 'Ctrl+3', action: 'para.h3' },
        { label: t('heading4'), shortcut: 'Ctrl+4', action: 'para.h4' },
        { label: t('heading5'), shortcut: 'Ctrl+5', action: 'para.h5' },
        { label: t('heading6'), shortcut: 'Ctrl+6', action: 'para.h6' },
        { label: t('paragraph'), shortcut: 'Ctrl+0', action: 'para.p' },
        { separator: true },
        { label: t('quote'), action: 'para.quote' },
        { label: t('bulletList'), action: 'para.ul' },
        { label: t('orderedList'), action: 'para.ol' },
        { label: t('taskList'), action: 'para.task' },
        { separator: true },
        { label: t('codeBlock'), action: 'para.code' },
        { label: t('mathBlock'), action: 'para.math' },
        { label: t('table'), action: 'para.table' }
      ]
    },
    {
      title: t('sectionFormat'),
      entries: [
        { label: t('bold'), shortcut: 'Ctrl+B', action: 'fmt.bold' },
        { label: t('italic'), shortcut: 'Ctrl+I', action: 'fmt.italic' },
        { label: t('underline'), shortcut: 'Ctrl+U', action: 'fmt.underline' },
        { label: t('inlineCode'), action: 'fmt.code' },
        { label: t('strikethrough'), action: 'fmt.strike' },
        { label: t('highlight'), action: 'fmt.highlight' },
        { label: t('clearFormat'), action: 'fmt.clear' },
        { separator: true },
        { label: t('link'), shortcut: 'Ctrl+K', action: 'fmt.link' },
        { label: t('image'), action: 'fmt.image' }
      ]
    },
    {
      title: t('sectionView'),
      entries: [
        { label: t('sidebar'), shortcut: 'Ctrl+Shift+L', action: 'view.sidebar' },
        { label: t('typewriter'), action: 'view.typewriter', checked: props.settings.typewriter },
        { label: t('focusMode'), action: 'view.focus', checked: props.settings.focus },
        { separator: true },
        { label: t('themeLight'), action: 'view.themeLight', checked: props.settings.theme === 'github-light' },
        { label: t('themeNight'), action: 'view.themeNight', checked: props.settings.theme === 'night' },
        { separator: true },
        { label: '中文', action: 'view.langZh', checked: props.locale === 'zh' },
        { label: 'English', action: 'view.langEn', checked: props.locale === 'en' }
      ]
    },
    {
      title: t('sectionHelp'),
      entries: [
        { label: t('about'), action: 'help.about' },
        { label: t('syntaxRef'), action: 'help.syntax' }
      ]
    }
  ]
})

function positionDropdown(i: number): void {
  const el = menuEls.value[i]
  if (el) {
    const r = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 258))
    dropdownStyle.value = { top: `${r.bottom + 4}px`, left: `${left}px` }
  }
}

function toggleMenu(i: number): void {
  if (openIndex.value === i) openIndex.value = -1
  else {
    positionDropdown(i)
    openIndex.value = i
  }
}

function hoverMenu(i: number): void {
  if (openIndex.value !== -1 && openIndex.value !== i) {
    positionDropdown(i)
    openIndex.value = i
  }
}

function run(action: string): void {
  openIndex.value = -1
  emit('action', action)
}
</script>

<template>
  <nav class="menubar">
    <button
      v-for="(m, i) in menus"
      :key="m.title"
      :ref="(el) => (menuEls[i] = el as HTMLElement | null)"
      class="menubar-title"
      :class="{ open: openIndex === i }"
      @click.stop="toggleMenu(i)"
      @mouseenter="hoverMenu(i)"
    >
      {{ m.title }}
    </button>
    <Teleport to="body">
      <div v-if="openIndex !== -1" class="menu-overlay" @mousedown="openIndex = -1" />
      <div v-if="openIndex !== -1" class="app-menu" :style="dropdownStyle">
        <template v-for="(e, j) in menus[openIndex].entries" :key="j">
          <div v-if="e.separator" class="menu-sep" />
          <button v-else class="menu-entry" @click="run(e.action!)">
            <span class="menu-check">{{ e.checked ? '✓' : '' }}</span>
            <span class="menu-label">{{ e.label }}</span>
            <span class="menu-shortcut">{{ e.shortcut }}</span>
          </button>
        </template>
      </div>
    </Teleport>
  </nav>
</template>

<style scoped>
.menubar {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.menubar-title {
  border: none;
  background: transparent;
  color: var(--md-muted);
  font-family: inherit;
  font-size: 13px;
  padding: 4px 9px;
  border-radius: 6px;
  cursor: default;
  transition: background 0.1s ease, color 0.1s ease;
}
.menubar-title:hover {
  background: var(--md-active-line);
  color: var(--md-text);
}
.menubar-title.open {
  background: var(--md-active-line);
  color: var(--md-text);
}

.menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 2999;
}

.app-menu {
  position: fixed;
  z-index: 3000;
  width: 248px;
  max-height: calc(100vh - 130px);
  overflow-y: auto;
  background: var(--md-panel);
  backdrop-filter: blur(32px) saturate(1.8);
  -webkit-backdrop-filter: blur(32px) saturate(1.8);
  border: 1px solid var(--md-border);
  border-radius: 12px;
  box-shadow: var(--md-shadow);
  padding: 5px;
}

.menu-sep {
  height: 1px;
  background: var(--md-border);
  margin: 5px 10px;
}
.menu-entry {
  display: flex;
  align-items: center;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--md-text);
  font-family: inherit;
  font-size: 13px;
  padding: 4px 8px 4px 4px;
  border-radius: 7px;
  cursor: default;
  text-align: left;
}
.menu-entry:hover {
  background: var(--md-accent);
  color: #fff;
}
.menu-entry:hover .menu-shortcut {
  color: rgba(255, 255, 255, 0.75);
}
.menu-check {
  width: 18px;
  text-align: center;
  font-size: 11px;
  color: var(--md-accent);
  flex-shrink: 0;
}
.menu-entry:hover .menu-check {
  color: #fff;
}
.menu-label {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.menu-shortcut {
  color: var(--md-muted);
  font-size: 11.5px;
  margin-left: 14px;
  flex-shrink: 0;
}
</style>
