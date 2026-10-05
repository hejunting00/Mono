// In-app dialog controller (replaces window.prompt/confirm which are
// unavailable inside the Tauri webview).
import { reactive } from 'vue'

export type DialogMode = 'input' | 'confirm' | 'alert'

interface DialogState {
  visible: boolean
  mode: DialogMode
  title: string
  message: string
  value: string
  resolver: ((v: string | boolean | null) => void) | null
}

export const dialogState = reactive<DialogState>({
  visible: false,
  mode: 'input',
  title: '',
  message: '',
  value: '',
  resolver: null
})

function close(result: string | boolean | null): void {
  dialogState.visible = false
  const r = dialogState.resolver
  dialogState.resolver = null
  r?.(result)
}

export function uiPrompt(opts: { title: string; message?: string; value?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    if (dialogState.resolver) close(null)
    Object.assign(dialogState, {
      visible: true,
      mode: 'input',
      title: opts.title,
      message: opts.message ?? '',
      value: opts.value ?? '',
      resolver: (v: string | boolean | null) => resolve(typeof v === 'string' ? v : null)
    })
  })
}

export function uiConfirm(opts: { title: string; message?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    if (dialogState.resolver) close(null)
    Object.assign(dialogState, {
      visible: true,
      mode: 'confirm',
      title: opts.title,
      message: opts.message ?? '',
      value: '',
      resolver: (v: string | boolean | null) => resolve(v === true)
    })
  })
}

export function uiAlert(opts: { title: string; message?: string }): Promise<void> {
  return new Promise((resolve) => {
    if (dialogState.resolver) close(null)
    Object.assign(dialogState, {
      visible: true,
      mode: 'alert',
      title: opts.title,
      message: opts.message ?? '',
      value: '',
      resolver: () => resolve()
    })
  })
}

export function _dialogClose(result: string | boolean | null): void {
  close(result)
}
