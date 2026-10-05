// Bridge to the Tauri backend with a plain-browser mock fallback so the UI
// can be developed and screenshot-tested without the Rust runtime.
import { isTauri } from './env'

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

export interface Settings {
  locale: 'zh' | 'en'
  theme: 'github-light' | 'night'
  autosave: boolean
  typewriter: boolean
  focus: boolean
  recentFiles: string[]
  recentFolders: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'en',
  theme: 'github-light',
  autosave: true,
  typewriter: false,
  focus: false,
  recentFiles: [],
  recentFolders: []
}

export interface Api {
  isTauri: boolean
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  readDir(path: string): Promise<DirEntry[]>
  exists(path: string): Promise<boolean>
  createFileOrDir(path: string, isDir: boolean): Promise<void>
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
  watchFolder(path: string, onChange: () => void): Promise<void>
  openFileDialog(): Promise<string | null>
  openFolderDialog(): Promise<string | null>
  saveAsDialog(defaultName: string): Promise<string | null>
  openExternal(url: string): Promise<void>
  revealItem(path: string): Promise<void>
  savePastedImage(dir: string): Promise<{ path: string; name: string } | null>
  copyImageToAssets(src: string, dir: string): Promise<{ path: string; rel: string } | null>
  setDirty(dirty: boolean): Promise<void>
  loadSettings(): Promise<Settings>
  saveSettings(patch: Partial<Settings>): Promise<void>
  onMenu(cb: (action: string) => void): void
  onOpenPath(cb: (path: string) => void): void
  onSaveThenClose(cb: () => void): void
}

// ---------------------------------------------------------------------------

let api: Api | null = null

export function getApi(): Api {
  if (!api) throw new Error('API not initialized')
  return api
}

export async function initApi(): Promise<Api> {
  if (api) return api
  api = isTauri() ? await createTauriApi() : await createMockApi()
  return api
}

// ---------------------------------------------------------------------------
// Tauri implementation
// ---------------------------------------------------------------------------

async function createTauriApi(): Promise<Api> {
  const { readTextFile, writeTextFile, readDir, exists, mkdir, remove, rename, watch } = await import('@tauri-apps/plugin-fs')
  const { open, save } = await import('@tauri-apps/plugin-dialog')
  const { openUrl, revealItemInDir } = await import('@tauri-apps/plugin-opener')
  const { readImage } = await import('@tauri-apps/plugin-clipboard-manager')
  const { load } = await import('@tauri-apps/plugin-store')
  const { listen } = await import('@tauri-apps/api/event')
  const { invoke } = await import('@tauri-apps/api/core')
  const { encodePngFromRgba } = await import('./imagepng')

  const joinPath = (dir: string, name: string): string => {
    const sep = dir.includes('\\') ? '\\' : '/'
    return dir.replace(/[\\/]+$/, '') + sep + name
  }

  const settingsStore = await load('settings.json', { autoSave: true })

  return {
    isTauri: true,
    async readFile(path) {
      return await readTextFile(path)
    },
    async writeFile(path, content) {
      await writeTextFile(path, content)
    },
    async readDir(path) {
      const entries = await readDir(path)
      return entries
        .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
        .map((e) => ({ name: e.name, path: joinPath(path, e.name), isDir: e.isDirectory }))
        .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.isDir ? -1 : 1))
    },
    async exists(path) {
      return await exists(path)
    },
    async createFileOrDir(path, isDir) {
      if (isDir) await mkdir(path, { recursive: true })
      else await writeTextFile(path, '')
    },
    async rename(from, to) {
      await rename(from, to)
    },
    async remove(path) {
      await remove(path, { recursive: true })
    },
    async watchFolder(path, onChange) {
      let timer: ReturnType<typeof setTimeout> | null = null
      await watch(
        path,
        () => {
          if (timer) clearTimeout(timer)
          timer = setTimeout(onChange, 300)
        },
        { recursive: true }
      )
    },
    async openFileDialog() {
      const p = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] }]
      })
      return (p as string) ?? null
    },
    async openFolderDialog() {
      const p = await open({ directory: true })
      return (p as string) ?? null
    },
    async saveAsDialog(defaultName) {
      const p = await save({
        defaultPath: defaultName,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
      })
      return p ?? null
    },
    async openExternal(url) {
      if (/^https?:\/\//.test(url)) await openUrl(url)
    },
    async revealItem(path) {
      await revealItemInDir(path)
    },
    async savePastedImage(dir) {
      try {
        const img = await readImage()
        // the plugin's d.ts leaks the DOM Image type; narrow manually
        const raw = img as unknown as { rgba(): Promise<Uint8Array>; width: number; height: number }
        const png = encodePngFromRgba(new Uint8ClampedArray(await raw.rgba()), raw.width, raw.height)
        const name = `image-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`
        const assets = joinPath(dir, 'assets')
        if (!(await exists(assets))) await mkdir(assets, { recursive: true })
        const path = joinPath(assets, name)
        const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
        await import('@tauri-apps/plugin-fs').then((fs) => fs.writeFile(path, bytes))
        return { path, name }
      } catch {
        return null
      }
    },
    async copyImageToAssets(src, dir) {
      try {
        const bytes = await import('@tauri-apps/plugin-fs').then((fs) => fs.readFile(src))
        const assets = joinPath(dir, 'assets')
        if (!(await exists(assets))) await mkdir(assets, { recursive: true })
        const name = src.split(/[\/]/).pop() ?? 'image.png'
        const path = joinPath(assets, name)
        await import('@tauri-apps/plugin-fs').then((fs) => fs.writeFile(path, bytes))
        return { path, rel: 'assets/' + name }
      } catch {
        return null
      }
    },
    async setDirty(dirty) {
      await invoke('set_dirty', { dirty })
    },
    async loadSettings() {
      const s = { ...DEFAULT_SETTINGS }
      for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
        const v = await settingsStore.get(key)
        if (v !== null && v !== undefined) (s as Record<string, unknown>)[key] = v
      }
      return s
    },
    async saveSettings(patch) {
      for (const [k, v] of Object.entries(patch)) await settingsStore.set(k, v)
    },
    onMenu(cb) {
      void listen<string>('menu', (e) => cb(e.payload))
      void listen<null>('save-then-close', () => cb('file.save'))
    },
    onOpenPath(cb) {
      ;(window as unknown as Record<string, unknown>).__openPath = cb
      void listen<string>('open-path', (e) => cb(e.payload))
    },
    onSaveThenClose(cb) {
      void listen<null>('save-then-close', () => cb())
    }
  }
}

// ---------------------------------------------------------------------------
// Browser mock
// ---------------------------------------------------------------------------

const MOCK_ROOT = 'C:/mock/docs'
const WELCOME = `# Welcome to mdread

A minimal Markdown editor with **live preview** — the *Typora* way.

## Basic formatting

Text can be **bold**, *italic*, ~~strikethrough~~, or \`inline code\`.

A [link to somewhere](https://example.com) looks like this.

## Lists

- Bullet one
- Bullet two
  - Nested item
- [ ] A task to do
- [x] A done task

1. First
2. Second
3. Third

## Quote

> This is a blockquote.
> It can span multiple lines.

## Code

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
\`\`\`

## Table

| Feature | Status |
| ------- | ------ |
| Live preview | ✅ |
| Themes | ✅ |

## Math

Inline math like $e^{i\\pi} + 1 = 0$ renders in place.

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

## Diagram

\`\`\`mermaid
graph LR
  A[Start] --> B{Choice}
  B -->|yes| C[OK]
  B -->|no| D[Stop]
\`\`\`

---

Happy writing!
`

async function createMockApi(): Promise<Api> {
  const files = new Map<string, string>([
    [`${MOCK_ROOT}/welcome.md`, WELCOME],
    [`${MOCK_ROOT}/notes.md`, '# Notes\n\nQuick notes.\n'],
    [`${MOCK_ROOT}/sub/ideas.md`, '## Ideas\n\n- Write a novel\n- Learn Rust\n']
  ])

  const listeners: (() => void)[] = []
  const notify = () => listeners.forEach((cb) => cb())
  const normalize = (p: string): string => p.replace(/\\/g, '/')
  const joinPath = (dir: string, name: string): string => dir.replace(/\/+$/, '') + '/' + name

  const mockListeners: Record<string, ((p: unknown) => void)[]> = {}
  const on = (key: string, cb: (p: unknown) => void): void => {
    ;(mockListeners[key] ??= []).push(cb)
  }
  const emit = (key: string, payload: unknown): void => {
    for (const cb of mockListeners[key] ?? []) cb(payload)
  }


  const settingsKey = 'mdread-mock-settings'

  return {
    isTauri: false,
    async readFile(path) {
      const c = files.get(normalize(path))
      if (c === undefined) throw new Error('File not found: ' + path)
      return c
    },
    async writeFile(path, content) {
      files.set(normalize(path), content)
      notify()
    },
    async readDir(path) {
      const n = normalize(path)
      const dirs = new Set<string>()
      for (const f of files.keys()) {
        const parent = f.slice(0, f.lastIndexOf('/'))
        if (parent && parent !== n) dirs.add(parent)
      }
      const out: DirEntry[] = []
      for (const d of dirs) {
        const parent = d.slice(0, d.lastIndexOf('/'))
        if (parent === n) out.push({ name: d.slice(d.lastIndexOf('/') + 1), path: d, isDir: true })
      }
      for (const f of files.keys()) {
        if (f.slice(0, f.lastIndexOf('/')) === n) out.push({ name: f.slice(f.lastIndexOf('/') + 1), path: f, isDir: false })
      }
      return out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    },
    async exists(path) {
      const n = normalize(path)
      if (files.has(n)) return true
      for (const f of files.keys()) if (f.startsWith(n + '/')) return true
      return false
    },
    async createFileOrDir(path) {
      if (!path.includes('.')) return
      if (!files.has(normalize(path))) files.set(normalize(path), '')
      notify()
    },
    async rename(from, to) {
      const c = files.get(normalize(from))
      if (c !== undefined) {
        files.delete(normalize(from))
        files.set(normalize(to), c)
      }
      notify()
    },
    async remove(path) {
      files.delete(normalize(path))
      notify()
    },
    async watchFolder(_path, onChange) {
      listeners.push(onChange)
    },
    async openFileDialog() {
      return window.prompt('Open file:', `${MOCK_ROOT}/welcome.md`)
    },
    async openFolderDialog() {
      return window.prompt('Open folder:', MOCK_ROOT)
    },
    async saveAsDialog(defaultName) {
      return window.prompt('Save as:', `${MOCK_ROOT}/${defaultName || 'untitled.md'}`)
    },
    async openExternal(url) {
      window.open(url, '_blank')
    },
    async revealItem() {},
    async savePastedImage() {
      return null
    },
    async copyImageToAssets() {
      return null
    },
    async setDirty() {},
    async loadSettings() {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(settingsKey) ?? '{}') }
      } catch {
        return { ...DEFAULT_SETTINGS }
      }
    },
    async saveSettings(patch) {
      let cur: Partial<Settings> = {}
      try {
        cur = JSON.parse(localStorage.getItem(settingsKey) ?? '{}')
      } catch {
        /* ignore */
      }
      localStorage.setItem(settingsKey, JSON.stringify({ ...cur, ...patch }))
    },
    onMenu(cb) {
      on('menu', (p) => cb(p as string))
    },
    onOpenPath(cb) {
      on('open-path', (p) => cb(p as string))
      void cb
    },
    onSaveThenClose(cb) {
      on('save-then-close', () => cb())
    }
  }
}
