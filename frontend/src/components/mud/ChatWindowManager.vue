<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useMudStore } from '@/stores/mudStore'
import { useChatHistory } from '@/composables/useChatHistory'
import { useChatWindows } from '@/composables/useChatWindows'
import { stripAnsiCodes } from '@/utils/ansiParser'
import { CHANNEL_KEYS } from '@/types/chat'
import type { ChatWindowType } from '@/types/chat'
import ChatWindow from './ChatWindow.vue'

// hide on mobile/pwa
const isMobile = useMediaQuery('(max-width: 768px)')

const store = useMudStore()
const { addMessage, clearHistory } = useChatHistory()
const {
  openWindows,
  openWindow,
  openWindowMinimized,
  closeWindow,
  minimizeWindow,
  focusWindow,
  incrementUnread,
  getWindowPosition,
  getWindow,
  isWindowOpen,
} = useChatWindows()

// track last seen message ids to avoid duplicate processing
const lastSeenTellId = ref(0)
const lastSeenPetitionId = ref(0)
const lastSeenGsayId = ref(0)
const lastSeenGccId = ref(0)

/**
 * parse sender format like "Arih -> Jestros" or just "Jestros"
 * returns { sender: string, target: string | null }
 */
function parseSenderFormat(rawSender: string): { sender: string; target: string | null } {
  const parts = rawSender.split(' -> ')
  if (parts.length === 2) {
    return { sender: parts[0]!.trim(), target: parts[1]!.trim() }
  }
  return { sender: rawSender.trim(), target: null }
}

/**
 * check if sender is our own character (for skipping own messages)
 */
function isOwnMessage(sender: string, myName: string): boolean {
  const senderLower = sender.toLowerCase()
  return senderLower.startsWith('you') || senderLower === myName
}

// computed: get messages from store
const tellMessages = computed(() => store.chatMessages['tell'] || [])
const petitionMessages = computed(() => store.chatMessages['petition'] || [])
const gsayMessages = computed(() => store.chatMessages['gsay'] || [])
const gccMessages = computed(() => store.chatMessages['gcc'] || [])

// watch for new tell messages
watch(
  tellMessages,
  (messages) => {
    if (!messages.length) return

    const myName = store.character?.name?.toLowerCase() || ''

    // process new messages
    for (const msg of messages) {
      if (msg.id <= lastSeenTellId.value) continue
      lastSeenTellId.value = msg.id

      const rawSender = stripAnsiCodes(msg.sender)
      const { sender, target } = parseSenderFormat(rawSender)

      // handle outgoing messages (sender is "You" or our character name)
      if (isOwnMessage(sender, myName)) {
        // outgoing: "You -> Target" - extract target and add as sent
        if (target && !isMobile.value) {
          addMessage(target, {
            timestamp: Date.now(),
            direction: 'sent',
            text: msg.text,
            presentation: msg.presentation,
            type: 'tell',
          })
        }
        continue
      }

      // incoming tells: sender is just the player name
      const playerName = sender

      // add incoming message to history
      addMessage(playerName, {
        timestamp: Date.now(),
        direction: 'received',
        text: msg.text,
        presentation: msg.presentation,
        type: 'tell',
      })

      // auto-popup or increment unread (desktop only)
      if (!isMobile.value) {
        if (!isWindowOpen(playerName)) {
          // new player - auto popup minimized window
          openWindowMinimized(playerName)
        } else {
          // existing window - increment unread if minimized
          const window = getWindow(playerName)
          if (window?.isMinimized) {
            incrementUnread(playerName)
          }
        }
      }
    }
  },
  { deep: true },
)

// watch for new petition messages (for gods)
watch(
  petitionMessages,
  (messages) => {
    if (!messages.length) return

    const myName = store.character?.name?.toLowerCase() || ''

    // process new messages
    for (const msg of messages) {
      if (msg.id <= lastSeenPetitionId.value) continue
      lastSeenPetitionId.value = msg.id

      const rawSender = stripAnsiCodes(msg.sender)
      const { sender, target } = parseSenderFormat(rawSender)

      // handle outgoing messages (sender is "You" or our character name)
      if (isOwnMessage(sender, myName)) {
        // outgoing: "CharName -> Target" - extract target and add as sent
        if (target && !isMobile.value) {
          addMessage(target, {
            timestamp: Date.now(),
            direction: 'sent',
            text: msg.text,
            presentation: msg.presentation,
            type: 'ptell',
          })
        }
        continue
      }

      // incoming ptells: sender is just the player name
      const playerName = sender

      // add incoming message to history
      addMessage(playerName, {
        timestamp: Date.now(),
        direction: 'received',
        text: msg.text,
        presentation: msg.presentation,
        type: 'ptell',
      })

      // auto-popup or increment unread (desktop only)
      if (!isMobile.value) {
        if (!isWindowOpen(playerName)) {
          // new player - auto popup minimized window
          openWindowMinimized(playerName)
        } else {
          // existing window - increment unread if minimized
          const window = getWindow(playerName)
          if (window?.isMinimized) {
            incrementUnread(playerName)
          }
        }
      }
    }
  },
  { deep: true },
)

// watch for new gsay (group) messages
watch(
  gsayMessages,
  (messages) => {
    if (!messages.length) return

    const myName = store.character?.name?.toLowerCase() || ''

    for (const msg of messages) {
      if (msg.id <= lastSeenGsayId.value) continue
      lastSeenGsayId.value = msg.id

      const rawSender = stripAnsiCodes(msg.sender)
      const { sender } = parseSenderFormat(rawSender)

      // handle outgoing messages (sender is "You" or our character name)
      if (isOwnMessage(sender, myName)) {
        // outgoing gsay - add as sent
        if (!isMobile.value) {
          addMessage(CHANNEL_KEYS.group, {
            timestamp: Date.now(),
            direction: 'sent',
            text: msg.text,
            presentation: msg.presentation,
            type: 'gsay',
          })
        }
        continue
      }

      // add incoming message to history
      addMessage(CHANNEL_KEYS.group, {
        timestamp: Date.now(),
        direction: 'received',
        sender: sender,
        text: msg.text,
        presentation: msg.presentation,
        type: 'gsay',
      })

      // auto-popup or increment unread (desktop only)
      if (!isMobile.value) {
        if (!isWindowOpen('Group', 'group')) {
          openWindowMinimized('Group', 'group')
        } else {
          const window = getWindow('Group', 'group')
          if (window?.isMinimized) {
            incrementUnread('Group', 'group')
          }
        }
      }
    }
  },
  { deep: true },
)

// watch for new gcc (guild) messages
watch(
  gccMessages,
  (messages) => {
    if (!messages.length) return

    const myName = store.character?.name?.toLowerCase() || ''

    for (const msg of messages) {
      if (msg.id <= lastSeenGccId.value) continue
      lastSeenGccId.value = msg.id

      const rawSender = stripAnsiCodes(msg.sender)
      const { sender } = parseSenderFormat(rawSender)

      // handle outgoing messages (sender is "You" or our character name)
      if (isOwnMessage(sender, myName)) {
        // outgoing gcc - add as sent
        if (!isMobile.value) {
          addMessage(CHANNEL_KEYS.guild, {
            timestamp: Date.now(),
            direction: 'sent',
            text: msg.text,
            presentation: msg.presentation,
            type: 'gcc',
          })
        }
        continue
      }

      // add incoming message to history
      addMessage(CHANNEL_KEYS.guild, {
        timestamp: Date.now(),
        direction: 'received',
        sender: sender,
        text: msg.text,
        presentation: msg.presentation,
        type: 'gcc',
      })

      // auto-popup or increment unread (desktop only)
      if (!isMobile.value) {
        if (!isWindowOpen('Guild', 'guild')) {
          openWindowMinimized('Guild', 'guild')
        } else {
          const window = getWindow('Guild', 'guild')
          if (window?.isMinimized) {
            incrementUnread('Guild', 'guild')
          }
        }
      }
    }
  },
  { deep: true },
)

// get history key for a window
const getHistoryKey = (playerName: string, windowType: ChatWindowType): string => {
  if (windowType === 'group') return CHANNEL_KEYS.group
  if (windowType === 'guild') return CHANNEL_KEYS.guild
  return playerName
}

// handle clear history for a window
const handleClearHistory = (playerName: string, windowType: ChatWindowType) => {
  clearHistory(getHistoryKey(playerName, windowType))
}

// expose openWindow for parent components
defineExpose({
  openWindow,
})
</script>

<template>
  <!-- hide chat windows on mobile -->
  <template v-if="!isMobile">
    <ChatWindow
      v-for="(window, index) in openWindows"
      :key="window.id"
      :player-name="window.playerName"
      :window-type="window.windowType"
      :position="getWindowPosition(index)"
      :is-minimized="window.isMinimized"
      :unread-count="window.unreadCount"
      @close="closeWindow(window.playerName, window.windowType)"
      @minimize="minimizeWindow(window.playerName, window.windowType)"
      @focus="focusWindow(window.playerName, window.windowType)"
      @clear-history="handleClearHistory(window.playerName, window.windowType)"
    />
  </template>
</template>
