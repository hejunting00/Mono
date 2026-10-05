<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { createMilkdownEditor, type MilkdownInstance } from '../milkdown/setup'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { findMatchKey } from '../milkdown/setup'
import type { EditorView } from '@milkdown/kit/prose/view'
import { fileUrl, isTauri } from '../lib/env'
import { getApi } from '../lib/tauri'
import { copyText, readClipboardText } from '../lib/clipboard'
import { t } from '../lib/i18n'

const props = defineProps<{ typewriter?: boolean; focusMode?: boolean }>()
const emit = defineEmits<{ update: [md: string]; status: [string] }>()

const rootEl = ref<HTMLElement | null>(null)
let instance: MilkdownInstance | null = null
let view: EditorView | null = null
let suppressUpdate = false
let baseDir = ''
let zoomLevel = 1
const zoomStyle = ref('')
let pendingMd: string | null = null
let readyResolve: (() => void) | null = null
const ready = new Promise<void>((r) => (readyResolve = r))

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(async () => {
  if (!rootEl.value) return
  instance = await createMilkdownEditor(rootEl.value, '', (md) => {
    if (!suppressUpdate) emit('update', md)
  })
  view = instance.getView()
  patchDispatch()
  installLinkClick()
  installImagePaste()
  installCheckboxToggle()
  installEditorContextMenu()
  updateStatus()
  if (pendingMd !== null) {
    const md = pendingMd
    pendingMd = null
    applyMarkdown(md)
  }
  readyResolve?.()
})

/** Resolves once the underlying Milkdown instance exists. */
function whenReady(): Promise<void> {
  return instance ? Promise.resolve() : ready
}

onBeforeUnmount(() => {
  void instance?.destroy()
  instance = null
})

function patchDispatch(): void {
  if (!view) return
  const orig = view.dispatch.bind(view)
  view.dispatch = (tr) => {
    orig(tr)
    if (props.typewriter) typewriterScroll()
    updateStatus()
  }
}

watch(
  () => props.typewriter,
  () => {
    if (props.typewriter) typewriterScroll()
  }
)

function typewriterScroll(): void {
  if (!view) return
  const pos = view.state.selection.head
  requestAnimationFrame(() => {
    if (!view) return
    try {
      const coords = view.coordsAtPos(pos)
      if (!coords) return
      const scrollRoot = scrollableParent()
      if (!scrollRoot) return
      const srect = scrollRoot.getBoundingClientRect()
      const delta = coords.top - (srect.top + srect.height / 2)
      if (Math.abs(delta) > 4) scrollRoot.scrollTop += delta
    } catch {
      /* node removed */
    }
  })
}

function scrollableParent(): HTMLElement | null {
  if (!view) return null
  let el: HTMLElement | null = view.dom.parentElement
  while (el) {
    if (el.classList.contains('editor-scroll')) return el
    el = el.parentElement
  }
  return null
}

function updateStatus(): void {
  if (!view) return
  const text = view.state.doc.textContent
  const cjk = text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g)?.length ?? 0
  const latin = text
    .replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0).length
  const sel = view.state.selection
  const line = view.state.doc.resolve(sel.head)
  void line
  emit('status', `${cjk + latin} ${t('words')} · ${text.length} ${t('chars')}`)
}

// ---------------------------------------------------------------------------
// Public API used by App.vue
// ---------------------------------------------------------------------------

function setMarkdown(md: string): void {
  if (!instance || !view) {
    pendingMd = md
    return
  }
  applyMarkdown(md)
}

function applyMarkdown(md: string): void {
  if (!instance || !view) return
  const current = instance.serialize()
  if (current === md) return
  suppressUpdate = true
  try {
    const parsed = instance.parse(md)
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, parsed as never)
    view.dispatch(tr)
  } finally {
    suppressUpdate = false
  }
}

function getMarkdown(): string {
  return instance?.serialize() ?? ''
}

function getScrollTop(): number {
  return scrollableParent()?.scrollTop ?? 0
}

function setScrollTop(v: number): void {
  const el = scrollableParent()
  if (el) el.scrollTop = v
}

function setBaseDir(dir: string): void {
  baseDir = dir
}

function zoom(delta: number): void {
  zoomLevel = delta === 0 ? 1 : Math.min(2.5, Math.max(0.5, zoomLevel + delta))
  zoomStyle.value = `font-size: ${16 * zoomLevel}px`
  const container = rootEl.value?.closest('.editor-container') as HTMLElement | null
  if (container) container.style.fontSize = `${16 * zoomLevel}px`
}

function pastePlain(): void {
  void navigator.clipboard
    .readText()
    .then((text) => {
      if (!view) return
      const sel = view.state.selection
      view.dispatch(view.state.tr.insertText(text, sel.from, sel.to))
    })
    .catch(() => {})
}

function jumpToHeading(text: string): void {
  if (!view) return
  let target: number | null = null
  view.state.doc.descendants((node, pos) => {
    if (target !== null) return false
    if (/^heading$/i.test(node.type.name) && node.textContent.trim().startsWith(text.trim())) {
      target = pos + 1
      return false
    }
    return true
  })
  if (target !== null && view) {
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.near(view.state.doc.resolve(target)))
        .scrollIntoView()
    )
    view.focus()
  }
}

function clearFindHighlights(): void {
  if (!view) return
  view.dispatch(view.state.tr.setMeta(findMatchKey, DecorationSet.empty))
}

function destroyEditor(): void {
  void instance?.destroy()
  instance = null
}

defineExpose({
  whenReady,
  setMarkdown,
  getMarkdown,
  getScrollTop,
  setScrollTop,
  setBaseDir,
  zoom,
  pastePlain,
  jumpToHeading,
  openFind: (_replace: boolean) => openFindPanel(_replace),
  destroyEditor,
  runFormatAction
})

// ---------------------------------------------------------------------------
// Link click (Typora: plain click opens)
// ---------------------------------------------------------------------------

function installLinkClick(): void {
  if (!view) return
  view.dom.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const anchor = target.closest('a')
    if (anchor) {
      e.preventDefault()
      const href = anchor.getAttribute('href') ?? ''
      if (/^https?:\/\//.test(href)) void getApi().openExternal(href)
    }
  })
}

// ---------------------------------------------------------------------------
// Image paste (Tauri only): save to ./assets next to the file
// ---------------------------------------------------------------------------

function installImagePaste(): void {
  if (!view || !isTauri()) return
  view.dom.addEventListener('paste', (e) => {
    const dt = (e as ClipboardEvent).clipboardData
    if (!dt) return
    if (dt.getData('text/plain') !== '') return
    if (!Array.from(dt.files).some((f) => f.type.startsWith('image/'))) return
    if (!baseDir) return
    e.preventDefault()
    void getApi().savePastedImage(baseDir).then((saved) => {
      if (!saved || !view) return
      const rel = saved.path.startsWith(baseDir)
        ? saved.path.slice(baseDir.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
        : saved.name
      const sel = view.state.selection
      view!.dispatch(view!.state.tr.insertText(`![](${rel})`, sel.from, sel.to))
    })
  })
}

// ---------------------------------------------------------------------------
// Task checkbox click-to-toggle
// ---------------------------------------------------------------------------

function installCheckboxToggle(): void {
  if (!view) return
  // Milkdown renders task items as li[data-item-type="task"][data-checked];
  // the checkbox is a ::before pseudo-element, so we treat the marker zone
  // (left edge of the item) as the clickable box.
  view.dom.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const li = target.closest('li[data-item-type="task"]') as HTMLElement | null
    if (!li) return
    const rect = li.getBoundingClientRect()
    if (e.clientX - rect.left > 30) return
    e.preventDefault()
    const pos = view!.posAtCoords({ left: rect.left + 40, top: rect.top + 10 })
    if (pos == null) return
    const resolve = view!.state.doc.resolve(pos.pos)
    for (let d = resolve.depth; d > 0; d--) {
      const node = resolve.node(d)
      if (node.attrs && 'checked' in node.attrs) {
        const nodePos = resolve.before(d)
        view!.dispatch(view!.state.tr.setNodeMarkup(nodePos, null, { ...node.attrs, checked: !node.attrs['checked'] }))
        return
      }
    }
  })
}

function toggleTaskAt(state: EditorState, pos: number): void {
  let target: { pos: number; checked: boolean } | null = null
  state.doc.descendants((node, p) => {
    if (target) return false
    if (node.attrs && 'checked' in node.attrs && p <= pos && p + node.nodeSize >= pos) {
      target = { pos: p, checked: !!node.attrs['checked'] }
      return false
    }
    return true
  })
  if (target) {
    const t = target as { pos: number; checked: boolean }
    view!.dispatch(view!.state.tr.setNodeMarkup(t.pos, null, { checked: !t.checked }))
  }
}

// ---------------------------------------------------------------------------
// Editor right-click context menu
// ---------------------------------------------------------------------------

interface CtxItem {
  label?: string
  shortcut?: string
  separator?: boolean
  disabled?: boolean
  run?: () => void
}

const ctxMenu = ref<{ visible: boolean; x: number; y: number; items: CtxItem[] }>({
  visible: false,
  x: 0,
  y: 0,
  items: []
})

function closeCtxMenu(): void {
  ctxMenu.value.visible = false
  window.removeEventListener('mousedown', closeCtxMenu, true)
}

function openCtxMenu(e: MouseEvent, items: CtxItem[]): void {
  const width = 220
  const x = Math.max(4, Math.min(e.clientX, window.innerWidth - width - 8))
  const y = Math.max(4, Math.min(e.clientY, window.innerHeight - items.length * 28 - 16))
  ctxMenu.value = { visible: true, x, y, items }
  setTimeout(() => window.addEventListener('mousedown', closeCtxMenu, true), 0)
}

function linkAt(pos: number): { from: number; to: number; url: string } | null {
  if (!view) return null
  let found: { from: number; to: number; url: string } | null = null
  view.state.doc.descendants((node, p) => {
    if (found) return false
    if (node.isText && node.marks.some((mk) => mk.type.name === 'link')) {
      if (p <= pos && p + node.nodeSize >= pos) {
        const mark = node.marks.find((mk) => mk.type.name === 'link')
        found = { from: p, to: p + node.nodeSize, url: String(mark?.attrs['href'] ?? '') }
        return false
      }
    }
    return true
  })
  return found
}

function pasteClipboardText(text: string): void {
  if (!view) return
  try {
    const dt = new DataTransfer()
    dt.setData('text/plain', text)
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    view.dom.dispatchEvent(ev)
  } catch {
    const sel = view.state.selection
    view.dispatch(view.state.tr.insertText(text, sel.from, sel.to))
  }
}

function installEditorContextMenu(): void {
  if (!view) return
  view.dom.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    closeCtxMenu()
    const ev = e as MouseEvent
    const pos = view!.posAtCoords({ left: ev.clientX, top: ev.clientY })
    // move the caret to the right-click position when outside the selection
    if (pos) {
      const sel = view!.state.selection
      if (pos.pos < sel.from || pos.pos > sel.to) {
        view!.dispatch(view!.state.tr.setSelection(TextSelection.create(view!.state.doc, pos.pos)))
      }
    }
    const sel = view!.state.selection
    const hasSelection = !sel.empty
    const link = linkAt(sel.head)

    const items: CtxItem[] = [
      { label: t('undo'), shortcut: 'Ctrl+Z', run: () => void runFormatAction('edit.undo') },
      { label: t('redo'), shortcut: 'Ctrl+Y', run: () => void runFormatAction('edit.redo') },
      { separator: true },
      { label: t('cut'), shortcut: 'Ctrl+X', disabled: !hasSelection, run: async () => {
        const text = view!.state.doc.textBetween(sel.from, sel.to, '\n')
        await copyText(text)
        view!.dispatch(view!.state.tr.deleteSelection())
      } },
      { label: t('copy'), shortcut: 'Ctrl+C', disabled: !hasSelection, run: async () => {
        await copyText(view!.state.doc.textBetween(sel.from, sel.to, '\n'))
      } },
      { label: t('paste'), shortcut: 'Ctrl+V', run: async () => {
        const text = await readClipboardText()
        if (text) pasteClipboardText(text)
      } },
      { label: t('selectAll'), shortcut: 'Ctrl+A', run: () => {
        view!.dispatch(view!.state.tr.setSelection(TextSelection.create(view!.state.doc, 0, view!.state.doc.content.size)))
        view!.focus()
      } }
    ]

    if (link) {
      items.push(
        { separator: true },
        { label: t('openLink'), run: () => void getApi().openExternal(link.url) },
        { label: t('copyLink'), run: () => void copyText(link.url) },
        { label: t('removeLink'), run: () => {
          const markType = view!.state.schema.marks['link']
          view!.dispatch(view!.state.tr.removeMark(link.from, link.to, markType))
        } }
      )
    }

    items.push(
      { separator: true },
      { label: t('bold'), shortcut: 'Ctrl+B', run: () => void runFormatAction('fmt.bold') },
      { label: t('italic'), shortcut: 'Ctrl+I', run: () => void runFormatAction('fmt.italic') },
      { label: t('strikethrough'), run: () => void runFormatAction('fmt.strike') },
      { label: t('inlineCode'), run: () => void runFormatAction('fmt.code') },
      { label: t('highlight'), run: () => void runFormatAction('fmt.highlight') },
      { label: t('clearFormat'), run: () => void runFormatAction('fmt.clear') },
      { separator: true },
      { label: t('heading1'), shortcut: 'Ctrl+1', run: () => void runFormatAction('para.h1') },
      { label: t('heading2'), shortcut: 'Ctrl+2', run: () => void runFormatAction('para.h2') },
      { label: t('quote'), run: () => void runFormatAction('para.quote') },
      { label: t('bulletList'), run: () => void runFormatAction('para.ul') },
      { label: t('orderedList'), run: () => void runFormatAction('para.ol') }
    )

    openCtxMenu(ev, items)
  })
  // close on scroll / escape
  ;(view as unknown as { scrollDOM: HTMLElement }).scrollDOM?.addEventListener('scroll', closeCtxMenu, { passive: true })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCtxMenu()
  })
}

// ---------------------------------------------------------------------------
// Formatting actions (menu action name → Milkdown command / transaction)
// ---------------------------------------------------------------------------

async function runFormatAction(action: string): Promise<void> {
  if (!view || !instance) return
  const { callCommand } = await import('@milkdown/kit/utils')
  const hist = await import('@milkdown/kit/plugin/history')
  const cm = await import('@milkdown/kit/preset/commonmark')
  const gfmMod = await import('@milkdown/kit/preset/gfm')
  const run = (key: Parameters<typeof callCommand>[0], payload?: unknown): void => {
    instance!.editor.action(callCommand(key, payload as never))
  }
  try {
    switch (action) {
      case 'edit.undo':
        run(hist.undoCommand.key)
        break
      case 'edit.redo':
        run(hist.redoCommand.key)
        break
      case 'fmt.bold':
        run(cm.toggleStrongCommand.key)
        break
      case 'fmt.italic':
        run(cm.toggleEmphasisCommand.key)
        break
      case 'fmt.code':
        run(cm.toggleInlineCodeCommand.key)
        break
      case 'fmt.strike':
        run(gfmMod.toggleStrikethroughCommand.key)
        break
      case 'fmt.link': {
        const { uiPrompt } = await import('../lib/uidialog')
        const url = await uiPrompt({ title: t('link'), value: 'https://' })
        if (!url) break
        const selL = view.state.selection
        const text = selL.empty ? 'link' : view.state.doc.textBetween(selL.from, selL.to, ' ')
        view.dispatch(view.state.tr.insertText('[' + text + '](' + url + ')', selL.from, selL.to))
        break
      }
      case 'para.h1': case 'para.h2': case 'para.h3':
      case 'para.h4': case 'para.h5': case 'para.h6': {
        run(cm.wrapInHeadingCommand.key, Number(action.slice(-1)))
        break
      }
      case 'para.p':
        run(cm.wrapInHeadingCommand.key, 6)
        run(cm.downgradeHeadingCommand.key)
        break
      case 'para.quote':
        run(cm.wrapInBlockquoteCommand.key)
        break
      case 'para.ul':
        run(cm.wrapInBulletListCommand.key)
        break
      case 'para.ol':
        run(cm.wrapInOrderedListCommand.key)
        break
      case 'para.task': {
        const v = view
        const selT = view.state.selection
        let toggled = false
        v.state.doc.descendants((node, p) => {
          if (toggled) return false
          if (node.attrs && 'checked' in node.attrs && p <= selT.head && p + node.nodeSize >= selT.head) {
            v.dispatch(v.state.tr.setNodeMarkup(p, null, { ...node.attrs, checked: !node.attrs['checked'] }))
            toggled = true
            return false
          }
          return true
        })
        if (!toggled) {
          run(cm.wrapInBulletListCommand.key)
          insertTextAtSelection('[ ] ', 4)
        }
        break
      }
      case 'para.code':
        insertTextAtSelection('\n```\n\n```\n', 5)
        break
      case 'para.math':
        insertTextAtSelection('\n$$\n\n$$\n', 4)
        break
      case 'para.hr':
        insertTextAtSelection('\n\n---\n\n', 7)
        break
      case 'para.table': {
        const tpl = '| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| Cell     | Cell     | Cell     |\n'
        insertTextAtSelection('\n' + tpl + '\n', 4)
        break
      }
      case 'fmt.underline':
        insertTextAtSelection('<u></u>', 3)
        break
      case 'fmt.highlight':
        insertTextAtSelection('====', 2)
        break
      case 'fmt.sup':
        insertTextAtSelection('^{}', 1)
        break
      case 'fmt.sub':
        insertTextAtSelection('~{}', 1)
        break
      case 'fmt.image': {
        if (!isTauri()) {
          insertTextAtSelection('![](path/to/image.png)', 4)
          break
        }
        const { open } = await import('@tauri-apps/plugin-dialog')
        const picked = await open({
          multiple: false,
          filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }]
        })
        if (!picked || !baseDir) break
        const saved = await getApi().copyImageToAssets(picked as string, baseDir)
        if (!saved) break
        const sel2 = view.state.selection
        view.dispatch(view.state.tr.insertText('![](' + saved.rel + ')', sel2.from, sel2.to))
        break
      }
      case 'fmt.clear':
        clearFormatting()
        break
      default:
        console.warn('Unhandled format action', action)
    }
  } catch (err) {
    console.warn('Command failed', action, err)
  }
  view.focus()
}

function insertTextAtSelection(text: string, cursorOffset = text.length): void {
  if (!view) return
  const sel = view.state.selection
  view.dispatch(view.state.tr.insertText(text, sel.from, sel.to))
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, sel.from + cursorOffset)))
}

function clearFormatting(): void {
  if (!view) return
  const { schema } = view.state
  const marks = schema.marks
  const sel = view.state.selection
  const tr = view.state.tr
  for (const m of Object.values(marks)) {
    tr.removeMark(sel.from, sel.to, m)
  }
  view.dispatch(tr)
}

// ---------------------------------------------------------------------------
// Find panel (minimal): highlights matches, jumps between them
// ---------------------------------------------------------------------------

const findPanelVisible = ref(false)
const findWithReplace = ref(false)
const findQuery = ref('')
const replaceText = ref('')
let matchPositions: { from: number; to: number }[] = []
let matchIndex = -1

function openFindPanel(replace: boolean): void {
  findPanelVisible.value = true
  findWithReplace.value = replace
}

function setFindHighlights(activeIdx: number): void {
  if (!view) return
  const decos = matchPositions.map((r, i) =>
    Decoration.inline(r.from, r.to, { class: i === activeIdx ? 'find-match find-match-active' : 'find-match' })
  )
  view.dispatch(view.state.tr.setMeta(findMatchKey, DecorationSet.create(view.state.doc, decos)))
}

function runFind(): void {
  if (!view || !findQuery.value) return
  matchPositions = []
  const q = findQuery.value.toLowerCase()
  view.state.doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const lower = node.text.toLowerCase()
      let idx = lower.indexOf(q)
      while (idx !== -1) {
        matchPositions.push({ from: pos + idx, to: pos + idx + q.length })
        idx = lower.indexOf(q, idx + q.length)
      }
    }
    return true
  })
  matchIndex = matchPositions.length > 0 ? 0 : -1
  setFindHighlights(matchIndex)
  jumpToMatch()
}

function jumpToMatch(): void {
  if (!view || matchIndex < 0 || !matchPositions[matchIndex]) return
  const m = matchPositions[matchIndex]!
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, m.from, m.to)).scrollIntoView())
  view.focus()
}

function findNext(step: number): void {
  if (matchPositions.length === 0) return
  matchIndex = (matchIndex + step + matchPositions.length) % matchPositions.length
  setFindHighlights(matchIndex)
  jumpToMatch()
}

function replaceOne(): void {
  if (!view) return
  const m = matchPositions[matchIndex]
  if (!m) return
  view.dispatch(view.state.tr.insertText(replaceText.value, m.from, m.to))
  runFind()
}

function replaceAll(): void {
  if (!view) return
  const tr = view.state.tr
  for (let i = matchPositions.length - 1; i >= 0; i--) {
    const m = matchPositions[i]!
    tr.insertText(replaceText.value, m.from, m.to)
  }
  view.dispatch(tr)
  runFind()
}

// re-render root on theme change is handled by CSS variables
watch(
  () => props.focusMode,
  () => {}
)
</script>

<template>
  <div class="milkdown-wrap">
    <div v-if="findPanelVisible" class="find-panel">
      <input v-model="findQuery" :placeholder="t('find')" @keydown.enter="runFind(); findNext(1)" @input="runFind()" />
      <button @click="findNext(-1)">↑</button>
      <button @click="findNext(1)">↓</button>
      <span class="find-count">{{ matchPositions.length ? `${matchIndex + 1}/${matchPositions.length}` : '0/0' }}</span>
      <template v-if="findWithReplace">
        <input v-model="replaceText" :placeholder="t('replace')" @keydown.enter="replaceOne()" />
        <button @click="replaceOne()">Replace</button>
        <button @click="replaceAll()">{{ t('all') }}</button>
      </template>
      <button @click="findPanelVisible = false">{{ t('close') }}</button>
    </div>
    <div ref="rootEl" class="milkdown-root" :class="{ 'focus-mode': focusMode }" :style="zoomStyle"></div>
    <Teleport to="body">
      <div v-if="ctxMenu.visible" class="ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @contextmenu.prevent>
        <template v-for="(item, i) in ctxMenu.items" :key="i">
          <div v-if="item.separator" class="menu-sep" />
          <button v-else class="menu-entry" :class="{ disabled: item.disabled }" @click.stop="item.run?.(); closeCtxMenu()">
            <span class="menu-check"></span>
            <span class="menu-label">{{ item.label }}</span>
            <span class="menu-shortcut">{{ item.shortcut }}</span>
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.milkdown-wrap {
  height: 100%;
  position: relative;
}
.milkdown-root {
  height: 100%;
}
.find-panel {
  position: absolute;
  top: 10px;
  right: 18px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--md-panel);
  border: 1px solid var(--md-border);
  border-radius: 8px;
  padding: 6px 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  font-size: 12.5px;
}
.find-panel input {
  background: var(--md-bg);
  color: var(--md-text);
  border: 1px solid var(--md-border);
  border-radius: 5px;
  padding: 3px 8px;
  width: 160px;
  font-size: 12.5px;
}
.find-panel button {
  background: transparent;
  border: 1px solid var(--md-border);
  border-radius: 5px;
  color: var(--md-text);
  cursor: pointer;
  padding: 2px 8px;
}
.find-count {
  color: var(--md-muted);
  min-width: 34px;
  text-align: center;
}
</style>
