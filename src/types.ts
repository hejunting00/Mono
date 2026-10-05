// Shared app types.
export interface Tab {
  id: number
  path: string | null
  name: string
  md: string
  scrollTop: number
  dirty: boolean
  mtime: number
}
