<script setup lang="ts">
import ChatPresentation from './ChatPresentation.vue'
import { ref, computed, watch, nextTick } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { parseAnsiToHtml, stripAnsiCodes } from '@/utils/ansiParser'
import { Trash2, Minus, Plus, ArrowDown, PictureInPicture2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import ChatWindowManager from './ChatWindowManager.vue'

const store = useMudStore()

// Minimized state - use defineModel for two-way binding with parent
const isMinimized = defineModel<boolean>('minimized', { default: false })

// Emit for detaching
const emit = defineEmits<{
  detach: []
}>()

// Track active tab
const activeTab = ref('all')

// Track unread counts per channel
const unreadCounts = ref<Record<string, number>>({})
const lastReadId = ref<Record<string, number>>({})

// Ref to scroll container for auto-scroll
const scrollContainer = ref<HTMLElement | null>(null)

// Smart auto-scroll - only scroll if user is at bottom
const autoScroll = ref(true)
const isAtBottom = ref(true)

const handleScroll = () => {
  if (scrollContainer.value) {
    const el = scrollContainer.value
    const threshold = 50
    isAtBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    autoScroll.value = isAtBottom.value
  }
}

const scrollToBottom = () => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    autoScroll.value = true
    isAtBottom.value = true
  }
}

// Base channel config
const baseChannels: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'say', label: 'Room' },
  { key: 'nchat', label: 'NChat' },
  { key: 'tell', label: 'PM' },
  { key: 'gcc', label: 'Guild' },
  { key: 'gsay', label: 'Group' },
]

// Channel config - includes God tab for level 57+ (Avatar+)
const channelConfig = computed(() => {
  const channels = [...baseChannels]
  // Add God tab for immortals (level 57+)
  if (store.character && store.character.level >= 57) {
    channels.push({ key: 'god', label: 'God' })
  }
  return channels
})

// Message type with channel added
type ChatMessageWithChannel = {
  id: number
  timestamp: Date
  sender: string
  text: string
  channel: string
  alignment?: string
  presentation?: unknown
}

// Get current channel messages
const currentMessages = computed(() => {
  if (activeTab.value === 'all') {
    // Combine all channels and sort by id
    const allMessages: ChatMessageWithChannel[] = []
    for (const [channel, messages] of Object.entries(store.chatMessages)) {
      for (const msg of messages) {
        allMessages.push({ ...msg, channel })
      }
    }
    return allMessages.sort((a, b) => a.id - b.id)
  }
  // "god" tab combines petition and wizmsg channels
  if (activeTab.value === 'god') {
    const godMessages: ChatMessageWithChannel[] = []
    const petition = store.chatMessages['petition'] || []
    const wizmsg = store.chatMessages['wizmsg'] || []
    for (const msg of petition) {
      godMessages.push({ ...msg, channel: 'petition' })
    }
    for (const msg of wizmsg) {
      godMessages.push({ ...msg, channel: 'wizmsg' })
    }
    return godMessages.sort((a, b) => a.id - b.id)
  }
  return (store.chatMessages[activeTab.value] || []).map((m) => ({
    ...m,
    channel: activeTab.value,
  }))
})

// Watch for new messages to update unread counts and auto-scroll
watch(
  () => store.chatMessages,
  (newMessages) => {
    Object.keys(newMessages).forEach((channel) => {
      const messages = newMessages[channel]
      if (messages && messages.length > 0) {
        // Check if viewing this channel (or god tab viewing petition/wizmsg)
        const isViewingChannel =
          channel === activeTab.value ||
          (activeTab.value === 'god' && (channel === 'petition' || channel === 'wizmsg'))

        // Update unread count if not on this tab
        if (!isViewingChannel && activeTab.value !== 'all') {
          const lastRead = lastReadId.value[channel] || 0
          unreadCounts.value[channel] = messages.filter((m) => m.id > lastRead).length
        }

        // Auto-scroll if on this tab OR if on 'all' tab (only if user is at bottom)
        if ((isViewingChannel || activeTab.value === 'all') && autoScroll.value) {
          nextTick(() => scrollToBottom())
        }
      }
    })
  },
  { deep: true },
)

// Clear unread when switching tabs
watch(activeTab, (newTab) => {
  // God tab clears both petition and wizmsg unread counts
  if (newTab === 'god') {
    unreadCounts.value['petition'] = 0
    unreadCounts.value['wizmsg'] = 0
    // Update lastReadId for both channels
    const petition = store.chatMessages['petition']
    const wizmsg = store.chatMessages['wizmsg']
    if (petition && petition.length > 0) {
      const lastPetition = petition[petition.length - 1]
      if (lastPetition) lastReadId.value['petition'] = lastPetition.id
    }
    if (wizmsg && wizmsg.length > 0) {
      const lastWizmsg = wizmsg[wizmsg.length - 1]
      if (lastWizmsg) lastReadId.value['wizmsg'] = lastWizmsg.id
    }
  } else {
    unreadCounts.value[newTab] = 0
    const messages = store.chatMessages[newTab]
    if (messages && messages.length > 0) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg) {
        lastReadId.value[newTab] = lastMsg.id
      }
    }
  }

  // Auto-scroll when switching tabs (only if user was at bottom)
  if (autoScroll.value) {
    nextTick(() => scrollToBottom())
  }
})

// Format timestamp in browser's local timezone (HH:MM:SS)
const formatTime = (date: Date): string => {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

// Channel colors
const channelColors: Record<string, string> = {
  say: 'text-white',
  nchat: 'text-yellow-400',
  gcc: 'text-cyan-400',
  tell: 'text-purple-400',
  gsay: 'text-green-400',
  petition: 'text-red-400',
  wizmsg: 'text-amber-400',
  god: 'text-amber-400',
}

// Alignment colors for nchat
const alignmentColors: Record<string, string> = {
  good: 'text-yellow-400',
  evil: 'text-red-400',
  undead: 'text-red-400',
  neutral: 'text-white',
}

// Get channel color for sender name (uses alignment for nchat)
const getSenderColor = (channel: string, alignment?: string): string => {
  // For nchat, use alignment-based colors
  if (channel === 'nchat' && alignment) {
    return alignmentColors[alignment] || 'text-yellow-400'
  }
  return channelColors[channel.toLowerCase()] || 'text-gray-300'
}

// Get channel label for All tab prefix (includes alignment for nchat)
const getChannelPrefix = (channel: string, alignment?: string): string => {
  if (channel === 'nchat' && alignment) {
    const alignLabel = alignment.charAt(0).toUpperCase() + alignment.slice(1)
    return `NChat ${alignLabel}`
  }
  // God channels
  if (channel === 'petition') return 'Petition'
  if (channel === 'wizmsg') return 'Wiz'
  const config = channelConfig.value.find((c) => c.key === channel)
  return config?.label || channel
}

// Switch channel
const switchChannel = (channel: string) => {
  activeTab.value = channel
}

// Get unread count for channel
const getUnreadCount = (channel: string): number => {
  if (channel === 'all') return 0
  // God tab combines petition and wizmsg
  if (channel === 'god') {
    return (unreadCounts.value['petition'] || 0) + (unreadCounts.value['wizmsg'] || 0)
  }
  return unreadCounts.value[channel] || 0
}

// Clear current channel
const clearCurrentChannel = () => {
  // God tab clears both petition and wizmsg
  if (activeTab.value === 'god') {
    store.clearChatChannel('petition')
    store.clearChatChannel('wizmsg')
    unreadCounts.value['petition'] = 0
    unreadCounts.value['wizmsg'] = 0
    lastReadId.value['petition'] = 0
    lastReadId.value['wizmsg'] = 0
  } else if (activeTab.value === 'all') {
    // Clear all channels
    for (const channel of Object.keys(store.chatMessages)) {
      store.clearChatChannel(channel)
    }
    unreadCounts.value = {}
    lastReadId.value = {}
  } else {
    store.clearChatChannel(activeTab.value)
    unreadCounts.value[activeTab.value] = 0
    lastReadId.value[activeTab.value] = 0
  }
}

// Chat window manager ref
const chatManagerRef = ref<InstanceType<typeof ChatWindowManager> | null>(null)

// Open direct chat with a player
const openDirectChat = (senderName: string) => {
  // strip ansi codes to get clean player name
  const cleanName = stripAnsiCodes(senderName)

  // parse sender format like "Arih -> Jestros" to extract actual player
  // for outgoing: "You -> Target" or "CharName -> Target" - use target
  // for incoming: just "PlayerName" - use as-is
  const parts = cleanName.split(' -> ')
  const playerName = parts.length === 2 ? parts[1]!.trim() : cleanName.trim()

  chatManagerRef.value?.openWindow(playerName)
}
</script>

<template>
  <div
    class="flex flex-col border rounded-lg bg-card overflow-hidden font-mono text-sm"
    :class="isMinimized ? 'h-auto' : 'h-full'"
  >
    <!-- Header with title and tabs -->
    <div class="flex items-center justify-between px-3 py-1 bg-muted/30">
      <div class="flex items-center gap-1">
        <span class="text-muted-foreground">Chat</span>
        <Button
          v-if="!isMinimized && !isAtBottom"
          variant="ghost"
          size="icon"
          class="h-5 w-5 text-muted-foreground hover:text-foreground"
          title="Scroll to bottom"
          @click="scrollToBottom"
        >
          <ArrowDown class="h-3 w-3" />
        </Button>
        <Button
          v-if="!isMinimized"
          variant="ghost"
          size="icon"
          class="h-5 w-5 text-muted-foreground hover:text-destructive"
          title="Clear chat"
          @click="clearCurrentChannel"
        >
          <Trash2 class="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-5 w-5 text-muted-foreground hover:text-foreground"
          title="Pop out to floating window"
          @click="emit('detach')"
        >
          <PictureInPicture2 class="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-5 w-5 text-muted-foreground hover:text-foreground"
          :title="isMinimized ? 'Expand chat' : 'Minimize chat'"
          @click="isMinimized = !isMinimized"
        >
          <Plus v-if="isMinimized" class="h-3 w-3" />
          <Minus v-else class="h-3 w-3" />
        </Button>
      </div>
      <div v-if="!isMinimized" class="flex items-center">
        <template v-for="(config, index) in channelConfig" :key="config.key">
          <button
            class="px-1 transition-colors"
            :class="[
              activeTab === config.key
                ? 'text-white'
                : 'text-muted-foreground hover:text-foreground'
            ]"
            @click="switchChannel(config.key)"
          >
            {{ config.label }}<span v-if="getUnreadCount(config.key) > 0" class="text-red-400"> ({{ getUnreadCount(config.key) }})</span>
          </button>
          <span v-if="index < channelConfig.length - 1" class="text-muted-foreground px-1">|</span>
        </template>
      </div>
    </div>

    <!-- Separator line -->
    <div v-if="!isMinimized" class="border-b" />

    <!-- Messages area -->
    <div
      v-if="!isMinimized"
      ref="scrollContainer"
      class="flex-1 overflow-y-auto px-3 py-1 space-y-0.5"
      @scroll="handleScroll"
    >
      <div
        v-if="currentMessages.length === 0"
        class="text-muted-foreground text-center py-2 text-xs"
      >
        No messages yet
      </div>
      <div
        v-for="message in currentMessages"
        :key="message.id"
        class="flex items-baseline gap-1 leading-tight"
      >
        <span class="text-muted-foreground/60 shrink-0 text-xs">[{{ formatTime(message.timestamp) }}]</span>
        <span v-if="activeTab === 'all'" :class="getSenderColor(message.channel, message.alignment)" class="shrink-0">
          ({{ getChannelPrefix(message.channel, message.alignment) }})
        </span>
        <ChatPresentation :presentation="message.presentation" :channel="message.channel"
          :sender="stripAnsiCodes(message.sender)" @activate="openDirectChat(message.sender)">
        <span
          :class="getSenderColor(message.channel, message.alignment)"
          class="shrink-0 underline decoration-dotted cursor-pointer hover:decoration-solid"
          v-html="parseAnsiToHtml(message.sender)"
          @click="openDirectChat(message.sender)"
        />
        <span class="text-muted-foreground">:</span>
        <span class="text-foreground/90" v-html="parseAnsiToHtml(message.text)" />
        </ChatPresentation>
      </div>
    </div>

    <!-- Chat window manager (renders floating chat windows) -->
    <ChatWindowManager ref="chatManagerRef" />
  </div>
</template>
