<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { getApi, type DirEntry } from '../../lib/tauri'
import { t } from '../../lib/i18n'
import { uiPrompt, uiConfirm } from '../../lib/uidialog'

const props = defineProps<{ root: string | null; activePath: string | null }>()
const emit = defineEmits<{ open: [string]; 'open-folder': [string] }>()

interface TreeItem extends DirEntry {
  depth: number
  children?: TreeItem[]
}

const items = ref<TreeItem[]>([])
const expanded = ref(new Set<string>())
const menu = ref<{ x: number; y: number; entry: DirEntry } | null>(null)

async function reload(): Promise<void> {
  items.value = []
  if (!props.root) return
  const load = async (path: string, depth: number): Promise<TreeItem[]> => {
    let entries: DirEntry[]
    try {
      entries = await getApi().readDir(path)
    } catch {
      return []
    }
    const out: TreeItem[] = []
    for (const e of entries) {
      const item: TreeItem = { ...e, depth }
      if (e.isDir && expanded.value.has(e.path)) {
        item.children = await load(e.path, depth + 1)
      }
      out.push(item)
    }
    return out
  }
  items.value = await load(props.root, 0)
}

function toggleExpand(entry: DirEntry): void {
  if (expanded.value.has(entry.path)) expanded.value.delete(entry.path)
  else expanded.value.add(entry.path)
  void reload()
}

function open(entry: DirEntry): void {
  if (entry.isDir) toggleExpand(entry)
  else emit('open', entry.path)
}

// context menu actions
async function ctxNewFile(): Promise<void> {
  if (!menu.value) return
  const dir = menu.value.entry.isDir ? menu.value.entry.path : parentOf(menu.value.entry.path)
  const name = await uiPrompt({ title: t('newFolderPrompt'), value: t('untitledFile') })
  if (!name) return
  await getApi().createFileOrDir(dir + '/' + name, false)
  menu.value = null
  void reload()
}

async function ctxRename(): Promise<void> {
  if (!menu.value) return
  const entry = menu.value.entry
  const name = await uiPrompt({ title: t('renamePrompt'), value: entry.name })
  if (!name || name === entry.name) return
  await getApi().rename(entry.path, parentOf(entry.path) + '/' + name)
  menu.value = null
  void reload()
}

async function ctxDelete(): Promise<void> {
  if (!menu.value) return
  if (!(await uiConfirm({ title: t('deleteConfirm'), message: menu.value.entry.name }))) return
  await getApi().remove(menu.value.entry.path)
  menu.value = null
  void reload()
}

async function ctxNewFolder(): Promise<void> {
  if (!menu.value) return
  const dir = menu.value.entry.isDir ? menu.value.entry.path : parentOf(menu.value.entry.path)
  const name = await uiPrompt({ title: t('renamePrompt'), value: 'new-folder' })
  if (!name) return
  await getApi().createFileOrDir(dir + '/' + name, true)
  menu.value = null
  void reload()
}

function ctxReveal(): void {
  if (menu.value) void getApi().revealItem(menu.value.entry.path)
  menu.value = null
}

function parentOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i === -1 ? '' : p.slice(0, i)
}

onMounted(reload)
watch(() => props.root, reload)
defineExpose({ reload })
</script>

<template>
  <div class="filetree" @click="menu = null">
    <div v-if="!root" class="tree-empty">{{ t('noFolder') }}</div>
    <template v-else>
      <template v-for="item in items" :key="item.path">
        <div
          class="tree-row"
          :class="{ 'tree-active': item.path === activePath }"
          :style="{ paddingLeft: 8 + item.depth * 14 + 'px' }"
          :title="item.path"
          @click="open(item)"
          @contextmenu.prevent.stop="menu = { x: $event.clientX, y: $event.clientY, entry: item }"
        >
          <span class="tree-icon">{{ item.isDir ? (expanded.has(item.path) ? '▾' : '▸') : '📄' }}</span>
          <span class="tree-label">{{ item.name }}</span>
        </div>
        <template v-if="item.children">
          <div
            v-for="child in item.children"
            :key="child.path"
            class="tree-row"
            :class="{ 'tree-active': child.path === activePath }"
            :style="{ paddingLeft: 8 + child.depth * 14 + 'px' }"
            :title="child.path"
            @click="child.isDir ? toggleExpand(child) : emit('open', child.path)"
            @contextmenu.prevent.stop="menu = { x: $event.clientX, y: $event.clientY, entry: child }"
          >
            <span class="tree-icon">{{ child.isDir ? (expanded.has(child.path) ? '▾' : '▸') : '📄' }}</span>
            <span class="tree-label">{{ child.name }}</span>
          </div>
        </template>
      </template>
    </template>

    <div v-if="menu" class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @click.stop>
      <div v-if="menu.entry.isDir" class="ctx-item" @click="ctxNewFile">{{ t('newFile') }}</div>
      <div v-if="menu.entry.isDir" class="ctx-item" @click="ctxNewFolder">{{ t('openFolderFull') }}</div>
      <div class="ctx-item" @click="ctxRename">{{ t('rename') }}</div>
      <div class="ctx-item" @click="ctxDelete">{{ t('delete') }}</div>
      <div class="ctx-item" @click="ctxReveal">{{ t('reveal') }}</div>
    </div>
  </div>
</template>
