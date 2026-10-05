// Clipboard helpers that work in both the desktop app and the browser.
import { isTauri } from './env'

export async function copyText(text: string): Promise<void> {
  if (isTauri()) {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeText(text)
    return
  }
  await navigator.clipboard.writeText(text)
}

export async function readClipboardText(): Promise<string | null> {
  try {
    if (isTauri()) {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
      return await readText()
    }
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}
