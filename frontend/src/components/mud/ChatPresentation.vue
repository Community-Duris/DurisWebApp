<script setup lang="ts">
import { computed } from 'vue'
import { parseChatPresentation } from '../../utils/chatPresentation.js'
import { chatColor } from '../../utils/chatPalette.js'

const props = defineProps<{ presentation?: unknown; channel: string; sender?: string }>()
const emit = defineEmits<{ activate: [] }>()
const snapshot = computed(() => parseChatPresentation(props.presentation, props.channel))
const segments = computed(() => {
  const value = snapshot.value
  if (!value || value.policy === 'preserve') return undefined
  const text = Array.from(value.text)
  return value.runs.map(([start, end, foreground, background]) => ({
    start,
    text: text.slice(start, end).join(''),
    style: {
      color: chatColor(foreground),
      backgroundColor: chatColor(background ? (background & 7) + 16 : 0, true),
      fontWeight: foreground >= 24 ? 'bold' : 'normal',
      textDecoration: background >= 24 && value.underline ? 'underline' : 'none',
    },
  }))
})
</script>

<template>
  <span v-if="segments" class="whitespace-pre-wrap break-words" data-chat-presentation
    :role="sender ? 'button' : undefined" :tabindex="sender ? 0 : undefined"
    :aria-label="sender ? `Open chat with ${sender}` : undefined"
    @click="sender && emit('activate')" @keydown.enter="sender && emit('activate')">
    <span v-for="segment in segments" :key="segment.start" :style="segment.style">{{ segment.text }}</span>
  </span>
  <slot v-else />
</template>
