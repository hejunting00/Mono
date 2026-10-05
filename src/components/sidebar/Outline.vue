<script setup lang="ts">
import { ref, watch } from 'vue'
import { t } from '../../lib/i18n'

const props = defineProps<{ markdown: string }>()
const emit = defineEmits<{ jump: [string] }>()

interface HeadingItem {
  level: number
  text: string
}

const items = ref<HeadingItem[]>([])

watch(
  () => props.markdown,
  (md) => {
    const out: HeadingItem[] = []
    let inFence = false
    for (const line of md.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence
        continue
      }
      if (inFence) continue
      const m = /^(#{1,6})\s+(.*)$/.exec(line)
      if (m) {
        let text = m[2].trim()
        if (text.length > 60) text = text.slice(0, 60) + '…'
        out.push({ level: m[1].length, text: text || '(untitled)' })
      }
    }
    items.value = out
  },
  { immediate: true }
)
</script>

<template>
  <div class="outline">
    <div v-if="items.length === 0" class="outline-empty">{{ t('noHeadings') }}</div>
    <div
      v-for="(item, i) in items"
      :key="i"
      class="outline-item"
      :style="{ paddingLeft: 8 + (item.level - 1) * 12 + 'px' }"
      @click="emit('jump', item.text)"
    >
      {{ item.text }}
    </div>
  </div>
</template>
