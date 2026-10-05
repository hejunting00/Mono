<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <div class="statusbar">{{ text }}</div>
</template>
