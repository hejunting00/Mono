// Environment helpers shared across the app.
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  return dir.replace(/[\\/]+$/, '') + sep + name
}

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i === -1 ? '' : p.slice(0, i)
}

export function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i === -1 ? p : p.slice(i + 1)
}

/** Map a local file path to an asset-protocol URL usable in <img src>. */
export function fileUrl(path: string): string {
  if (!isTauri()) return path
  // convertFileSrc is imported lazily to keep the mock path import-free
  return (window as unknown as { __convertFileSrc?: (p: string) => string }).__convertFileSrc?.(path) ?? path
}
