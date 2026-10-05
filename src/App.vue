<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { initApi, getApi, type Api, type Settings } from './lib/tauri'
import { dirname, basename, joinPath, isTauri } from './lib/env'
import { t, setLocale, locale as localeRef, type Locale } from './lib/i18n'
import MilkdownEditor from './components/MilkdownEditor.vue'
import MenuBar from './components/MenuBar.vue'
import TitleBar from './components/TitleBar.vue'
import StatusBar from './components/StatusBar.vue'
import AppDialog from './components/AppDialog.vue'
import { uiConfirm } from './lib/uidialog'
import FileTree from './components/sidebar/FileTree.vue'
import Outline from './components/sidebar/Outline.vue'
import type { Tab } from './types'

let nextTabId = 1
let autosaveTimer: ReturnType<typeof setTimeout> | null = null

const api = ref<Api | null>(null)
const settings = ref<Settings>({
  locale: 'en',
  theme: 'github-light',
  autosave: true,
  typewriter: false,
  focus: false,
  recentFiles: [],
  recentFolders: []
})
const tabs = ref<Tab[]>([])
const active = ref(-1)
const folder = ref<string | null>(null)
const sourceMode = ref(false)
const sourceText = ref('')
const sidebarVisible = ref(true)
const sidebarPanel = ref<'files' | 'outline'>('files')
const statusText = ref('')

const activeTab = computed(() => tabs.value[active.value] ?? null)

const editorRef = ref<InstanceType<typeof MilkdownEditor> | null>(null)
const appEl = ref<HTMLElement | null>(null)

// ---------------------------------------------------------------------------
// Dirty / title / autosave
// ---------------------------------------------------------------------------

function syncDirty(): void {
  const dirty = tabs.value.some((t) => t.dirty)
  void api.value?.setDirty(dirty)
  const t = activeTab.value
  document.title = t ? `${t.dirty ? '• ' : ''}${t.name} - Mono 简记` : 'Mono 简记'
}

function onSourceInput(): void {
  const tab = activeTab.value
  if (!tab) return
  if (sourceText.value !== tab.md) {
    tab.md = sourceText.value
    tab.dirty = true
    syncDirty()
    scheduleAutosave()
  }
}

function setSourceMode(on: boolean): void {
  if (on === sourceMode.value) return
  sourceMode.value = on
  const tab = activeTab.value
  if (on) {
    sourceText.value = tab?.md ?? ''
  } else {
    // refresh the WYSIWYG with edits made in the source view
    editorRef.value?.setMarkdown(tab?.md ?? '')
  }
}

function onMarkdownUpdated(md: string): void {
  const t = activeTab.value
  if (!t) return
  if (md !== t.md) {
    t.md = md
    t.dirty = true
    syncDirty()
    scheduleAutosave()
  }
}

function scheduleAutosave(): void {
  const t = activeTab.value
  if (!settings.value.autosave || !t?.path) return
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => void saveActive(false), 800)
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function newTab(md = '', name = t('untitled'), path: string | null = null): void {
  tabs.value.push({ id: nextTabId++, path, name, md, scrollTop: 0, dirty: false, mtime: 0 })
  activateTab(tabs.value.length - 1)
}

async function activateTab(index: number): Promise<void> {
  // save current view position
  const ed = editorRef.value
  const cur = activeTab.value
  if (ed && cur) {
    cur.scrollTop = ed.getScrollTop()
  }
  active.value = index
  const t = tabs.value[index]
  if (!t || !ed) return
  ed.setMarkdown(t.md)
  sourceText.value = t.md
  await nextFrame()
  ed.setScrollTop(t.scrollTop)
  syncDirty()
  if (t.path) editorRef.value?.setBaseDir(dirname(t.path))
}

async function closeTab(index: number): Promise<void> {
  const tab = tabs.value[index]
  if (!tab) return
  if (tab.dirty && !(await uiConfirm({ title: tab.name, message: t('closeUnsaved') }))) return
  tabs.value.splice(index, 1)
  if (tabs.value.length === 0) {
    newTab()
    return
  }
  void activateTab(Math.min(index, tabs.value.length - 1))
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

async function openPath(p: string): Promise<void> {
  try {
    const existing = tabs.value.findIndex((t) => t.path === p)
    if (existing !== -1) {
      void activateTab(existing)
      return
    }
    const content = await getApi().readFile(p)
    const fileDir = dirname(p)
    editorRef.value?.setBaseDir(fileDir)
    newTab(content, basename(p), p)
    settings.value.recentFiles = [p, ...settings.value.recentFiles.filter((x) => x !== p)].slice(0, 10)
    void getApi().saveSettings({ recentFiles: settings.value.recentFiles })
    if (!folder.value) folder.value = fileDir
  } catch (err) {
    window.alert(`${t('cannotOpen')} ${String(err)}`)
  }
}

async function openFolder(p: string): Promise<void> {
  folder.value = p
  settings.value.recentFolders = [p, ...settings.value.recentFolders.filter((x) => x !== p)].slice(0, 10)
  void getApi().saveSettings({ recentFolders: settings.value.recentFolders })
}

async function saveActive(saveAs = true): Promise<void> {
  const tab = activeTab.value
  const ed = editorRef.value
  if (!tab || !ed) return
  let path = tab.path
  if (!path || saveAs) {
    const suggested = path ?? (folder.value ? joinPath(folder.value, tab.name) : tab.name)
    path = await getApi().saveAsDialog(suggested)
    if (!path) return
    tab.path = path
    tab.name = basename(path)
    ed.setBaseDir(dirname(path))
  }
  try {
    await getApi().writeFile(path, tab.md)
    tab.dirty = false
    syncDirty()
  } catch (err) {
    window.alert(`${t('saveFailed')} ${String(err)}`)
  }
}

async function saveAll(): Promise<void> {
  for (const t of tabs.value) {
    if (t.dirty && t.path) await getApi().writeFile(t.path, t.md)
  }
  tabs.value.forEach((t) => (t.dirty = false))
  syncDirty()
}

// ---------------------------------------------------------------------------
// Theme & view settings
// ---------------------------------------------------------------------------

function applyLocale(l: Locale): void {
  setLocale(l)
  settings.value.locale = l
  void getApi().saveSettings({ locale: l })
}

function applyTheme(theme: Settings['theme']): void {
  settings.value.theme = theme
  document.documentElement.dataset['theme'] = theme
  void getApi().saveSettings({ theme })
}

function toggleSidebar(): void {
  sidebarVisible.value = !sidebarVisible.value
}

function toggleTypewriter(): void {
  settings.value.typewriter = !settings.value.typewriter
  void getApi().saveSettings({ typewriter: settings.value.typewriter })
}

function toggleAutosave(): void {
  settings.value.autosave = !settings.value.autosave
  void getApi().saveSettings({ autosave: settings.value.autosave })
}

function toggleFocus(): void {
  settings.value.focus = !settings.value.focus
  void getApi().saveSettings({ focus: settings.value.focus })
}

// ---------------------------------------------------------------------------
// Menu actions
// ---------------------------------------------------------------------------

async function handleAction(action: string): Promise<void> {
  const ed = editorRef.value
  if (!ed) return
  switch (action) {
    case 'file.new': newTab(); break
    case 'file.open': { const p = await getApi().openFileDialog(); if (p) void openPath(p); break }
    case 'file.openFolder': { const p = await getApi().openFolderDialog(); if (p) void openFolder(p); break }
    case 'file.save': await saveActive(false); break
    case 'file.saveAs': await saveActive(true); break
    case 'file.saveAll': await saveAll(); break
    case 'file.autosave': toggleAutosave(); break
    case 'file.closeTab': closeTab(active.value); break
    case 'file.exportHtml': { const { exportHtml } = await import('./export/exporter'); await exportHtml(activeTab.value?.name ?? 'document', ed.getMarkdown()); break }
    case 'file.exportPdf': { const { exportPdf } = await import('./export/exporter'); await exportPdf(ed.getMarkdown()); break }
    case 'edit.undo': ed.runFormatAction('edit.undo'); break
    case 'edit.redo': ed.runFormatAction('edit.redo'); break
    case 'edit.find': ed.openFind(false); break
    case 'edit.replace': ed.openFind(true); break
    case 'edit.pastePlain': ed.pastePlain(); break
    case 'view.sidebar': toggleSidebar(); break
    case 'view.typewriter': toggleTypewriter(); break
    case 'view.focus': toggleFocus(); break
    case 'view.sourceMode': setSourceMode(!sourceMode.value); break
    case 'view.zoomIn': ed.zoom(0.1); break
    case 'view.zoomOut': ed.zoom(-0.1); break
    case 'view.zoomReset': ed.zoom(0); break
    case 'view.themeLight': applyTheme('github-light'); break
    case 'view.themeNight': applyTheme('night'); break
    case 'help.about': window.alert(t('about')); break
    case 'view.langZh': applyLocale('zh'); break
    case 'view.langEn': applyLocale('en'); break
    case 'help.syntax': void getApi().openExternal('https://markdown.com.cn/basic-syntax/'); break
    default:
      ed.runFormatAction(action)
  }
}

// ---------------------------------------------------------------------------
// Global shortcuts (accelerators, the native menu bar is gone)
// ---------------------------------------------------------------------------

// Esc leaves zen mode when no dialog/menu/find panel is open
function installZenEscape(): void {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !settings.value.focus) return
    const overlay = document.querySelector('.app-menu, .dlg-card, .ctx-menu, .find-panel')
    if (overlay) return // let that overlay handle Esc first
    toggleFocus()
  })
}

function installShortcuts(): void {
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return
    const activeEl = document.activeElement as HTMLElement | null
    const inInput = !!activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')
    const code = e.code
    const shift = e.shiftKey
    let action: string | null = null
    if (code === 'KeyS') action = shift ? 'file.saveAs' : 'file.save'
    else if (code === 'KeyO' && !inInput) action = shift ? 'file.openFolder' : 'file.open'
    else if (code === 'KeyN' && !inInput) action = 'file.new'
    else if (code === 'KeyW') action = 'file.closeTab'
    else if (code === 'KeyP' && !inInput) action = 'file.exportPdf'
    else if (code === 'KeyF') action = 'edit.find'
    else if (code === 'KeyH') action = 'edit.replace'
    else if (code === 'KeyL' && shift && !inInput) action = 'view.sidebar'
    else if (!inInput && /^Digit[1-6]$/.test(code)) action = 'para.h' + code.slice(5)
    else if (!inInput && code === 'Digit0') action = 'para.p'
    if (!action) return
    e.preventDefault()
    void handleAction(action)
  })
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

onMounted(async () => {
  api.value = await initApi()
  // wait for the async Milkdown instance before loading documents
  await editorRef.value?.whenReady?.()
  const s = await getApi().loadSettings()
  settings.value = { ...settings.value, ...s }
  setLocale(s.locale ?? 'en')
  document.documentElement.dataset['theme'] = settings.value.theme
  sidebarVisible.value = true

  getApi().onMenu((a) => void handleAction(a))
  installShortcuts()
  installZenEscape()
  getApi().onOpenPath((p) => void openPath(p))
  getApi().onSaveThenClose(() => {
    void saveActive(false).then(() => {
      if (isTauri()) void import('@tauri-apps/api/core').then((c) => c.invoke('close_window'))
    })
  })

  if (!isTauri()) {
    await openPath('C:/mock/docs/welcome.md')
    await openFolder('C:/mock/docs')
  } else {
    newTab()
  }
  syncDirty()
})

onBeforeUnmount(() => {
  editorRef.value?.destroyEditor()
})

defineExpose({ handleAction })
</script>

<template>
  <div ref="appEl" class="app" :class="{ 'zen-mode': settings.focus }">
    <div v-if="settings.focus" class="zen-hover-zone" />
    <TitleBar :title="activeTab?.name ?? 'Mono 简记'" :dirty="activeTab?.dirty ?? false" />
    <div class="menubar-row">
      <MenuBar :settings="settings" :locale="localeRef" @action="handleAction($event)" />
    </div>
    <div class="main">
      <aside class="sidebar" :class="{ hidden: !sidebarVisible }">
        <div class="sidebar-actions">
          <button class="side-action" @click="handleAction('file.new')">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M8 5.5v5M5.5 8h5"/></svg>
            <span>{{ t('newFile') }}</span>
          </button>
          <button class="side-action" @click="handleAction('file.open')">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.2h5l3 3v8.6H4z"/><path d="M9 2.2v3h3"/></svg>
            <span>{{ t('openFileFull') }}</span>
          </button>
          <button class="side-action" @click="handleAction('file.openFolder')">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5a1 1 0 0 1 1-1h3.2L8 5.8h5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z"/></svg>
            <span>{{ t('openFolderFull') }}</span>
          </button>
        </div>
        <div class="sidebar-tabs">
          <div class="sidebar-tab" :class="{ active: sidebarPanel === 'files' }" @click="sidebarPanel = 'files'">{{ t('files') }}</div>
          <div class="sidebar-tab" :class="{ active: sidebarPanel === 'outline' }" @click="sidebarPanel = 'outline'">{{ t('outline') }}</div>
        </div>
        <div class="sidebar-content">
          <FileTree v-show="sidebarPanel === 'files'" :root="folder" :active-path="activeTab?.path ?? null" @open="openPath($event)" @open-folder="openFolder($event)" />
          <Outline v-show="sidebarPanel === 'outline'" :markdown="activeTab?.md ?? ''" @jump="editorRef?.jumpToHeading($event)" />
        </div>
      </aside>
      <div class="editor-container">
        <div class="doc-tabs-row">
          <div class="tabs" data-tauri-drag-region @dblclick.self="newTab()">
            <div
              v-for="(tab, i) in tabs"
              :key="tab.id"
              class="tab"
              :class="{ active: i === active }"
              :title="tab.path ?? tab.name"
              @mousedown.left="activateTab(i)"
              @mousedown.middle.prevent="closeTab(i)"
            >
              <span class="tab-name">{{ tab.name }}</span>
              <span v-if="tab.dirty" class="tab-dirty">●</span>
              <span class="tab-close" @click.stop="closeTab(i)">×</span>
            </div>
          </div>
          <div class="mode-toggle">
            <button class="mode-btn" :class="{ active: !sourceMode }" @click="setSourceMode(false)">{{ t('preview') }}</button>
            <button class="mode-btn" :class="{ active: sourceMode }" @click="setSourceMode(true)">{{ t('source') }}</button>
          </div>
        </div>
        <div class="editor-scroll">
          <MilkdownEditor
            v-show="!sourceMode"
            ref="editorRef"
            :typewriter="settings.typewriter"
            :focus-mode="settings.focus"
            @update="onMarkdownUpdated"
            @status="statusText = $event"
          />
          <textarea
            v-show="sourceMode"
            v-model="sourceText"
            class="source-editor"
            spellcheck="false"
            @input="onSourceInput"
          ></textarea>
        </div>
      </div>
    </div>
    <StatusBar :text="statusText" />
    <AppDialog />
  </div>
</template>
