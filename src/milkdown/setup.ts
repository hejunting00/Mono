// Milkdown editor assembly: presets, plugins, and theme wiring.
import { Editor, rootCtx, defaultValueCtx, parserCtx, serializerCtx, editorViewCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { history } from '@milkdown/kit/plugin/history'
import { cursor } from '@milkdown/kit/plugin/cursor'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration } from '@milkdown/kit/prose/view'
import { DecorationSet } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { codeBlockComponent } from '@milkdown/kit/component/code-block'
import { tableBlock } from '@milkdown/kit/component/table-block'
import { imageBlockComponent } from '@milkdown/kit/component/image-block'
import type { EditorView } from '@milkdown/kit/prose/view'

// Highlight plugin backing the find panel
export const findMatchKey = new PluginKey<DecorationSet>('mdreadFindMatch')
export const findMatchPlugin = new Plugin<DecorationSet>({
  key: findMatchKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, old) {
      const meta = tr.getMeta(findMatchKey)
      if (meta !== undefined) return meta
      if (tr.docChanged) return old.map(tr.mapping, tr.doc)
      return old
    }
  },
  props: {
    decorations(state) {
      return findMatchKey.getState(state)
    }
  }
})

export const findMatchExtension = $prose(() => findMatchPlugin)

// Marks the top-level block containing the caret; focus mode dims the rest.
export const activeBlockKey = new PluginKey<DecorationSet>('mdreadActiveBlock')
export const activeBlockExtension = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: activeBlockKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, old) {
          if (tr.docChanged || tr.selectionSet) {
            try {
              const { $from } = tr.selection
              if ($from.depth === 0) return DecorationSet.empty
              const start = $from.before(1)
              const end = $from.after(1)
              return DecorationSet.create(tr.doc, [Decoration.node(start, end, { class: 'block-active' })])
            } catch {
              return DecorationSet.empty
            }
          }
          return old.map(tr.mapping, tr.doc)
        }
      },
      props: {
        decorations(state) {
          return activeBlockKey.getState(state)
        }
      }
    })
)

export interface MilkdownInstance {
  editor: Editor
  getView(): EditorView
  /** Parse markdown into a ProseMirror state (for tab state creation). */
  parse(md: string): unknown
  /** Serialize the current document back to markdown. */
  serialize(): string
  destroy(): Promise<void>
}

export async function createMilkdownEditor(
  root: HTMLElement,
  initialDoc: string,
  onMarkdownUpdated: (md: string) => void
): Promise<MilkdownInstance> {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, initialDoc)
      ctx.get(listenerCtx).markdownUpdated((_, md) => onMarkdownUpdated(md))
    })
    .use(commonmark)
    .use(gfm)
    .use(listener)
    .use(history)
    .use(cursor)
    .use(findMatchExtension)
    .use(activeBlockExtension)
    .use(codeBlockComponent)
    .use(tableBlock)
    .use(imageBlockComponent)
    .create()

  let view: EditorView | null = null
  editor.action((ctx) => {
    view = ctx.get(editorViewCtx)
  })
  const getView = (): EditorView => {
    if (!view) editor.action((ctx) => (view = ctx.get(editorViewCtx)))
    return view!
  }

  return {
    editor,
    getView,
    parse(md: string) {
      let parsed: unknown = null
      editor.action((ctx) => {
        const parser = ctx.get(parserCtx)
        parsed = parser(md)
      })
      return parsed
    },
    serialize(): string {
      let md = ''
      editor.action((ctx) => {
        const serializer = ctx.get(serializerCtx)
        md = serializer(getView().state.doc)
      })
      return md
    },
    async destroy() {
      await editor.destroy()
    }
  }
}
