<script setup lang="ts">
import ChatPresentation from './ChatPresentation.vue'
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { useMudConnection } from '@/composables/useMudConnection'
import { useChatHistory } from '@/composables/useChatHistory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { X, Minus, Plus, Send, Trash2 } from 'lucide-vue-next'
import type { ChatWindowType, ChatMessageType } from '@/types/chat'
import { CHANNEL_KEYS } from '@/types/chat'

const props = defineProps<{
  playerName: string
  windowType: ChatWindowType
  position: { bottom: number; right: number } // CSS positioning
  isMinimized: boolean
  unreadCount: number
}>()

const emit = defineEmits<{
  close: []
  minimize: []
  focus: []
  clearHistory: []
}>()

const store = useMudStore()
const { sendGameCommand } = useMudConnection()
const { getMessages } = useChatHistory()

// check if current user is god (level 57+)
const isGod = computed(() => store.character && store.character.level >= 57)

// active tab for tell/ptell (only for player windows)
const activeTab = ref<'tell' | 'ptell'>('tell')

// message input
const message = ref('')
const inputRef = ref<InstanceType<typeof Input> | null>(null)
const focusInput = () => {
  const element: unknown = inputRef.value?.$el
  if (element instanceof HTMLInputElement) element.focus()
}

// scroll container ref
const messagesRef = ref<HTMLElement | null>(null)

// get history key based on window type
const historyKey = computed(() => {
  if (props.windowType === 'group') return CHANNEL_KEYS.group
  if (props.windowType === 'guild') return CHANNEL_KEYS.guild
  return props.playerName
})

// get messages from history (filtered by tab for player windows with god)
const messages = computed(() => {
  const allMessages = getMessages(historyKey.value)
  // for player windows with god level, filter by active tab (tell/ptell)
  if (props.windowType === 'player' && isGod.value) {
    return allMessages.filter((msg) => msg.type === activeTab.value)
  }
  return allMessages
})

// display name for header
const displayName = computed(() => {
  if (props.windowType === 'group') return 'Group'
  if (props.windowType === 'guild') return 'Guild'
  return props.playerName
})

// placeholder text
const placeholderText = computed(() => {
  if (props.windowType === 'group') return 'group message...'
  if (props.windowType === 'guild') return 'guild message...'
  return `message ${props.playerName}...`
})

// empty state text
const emptyText = computed(() => {
  if (props.windowType === 'group') return 'no group messages yet'
  if (props.windowType === 'guild') return 'no guild messages yet'
  if (isGod.value) return `no ${activeTab.value} messages yet`
  return `send a message to ${props.playerName}`
})

// scroll to bottom of history
const scrollToBottom = () => {
  if (messagesRef.value) {
    nextTick(() => {
      messagesRef.value!.scrollTop = messagesRef.value!.scrollHeight
    })
  }
}

// send message
const sendMessage = () => {
  const text = message.value.trim()
  if (!text) return

  let command: string
  let type: ChatMessageType

  if (props.windowType === 'group') {
    command = `gsay ${text}`
    type = 'gsay'
  } else if (props.windowType === 'guild') {
    command = `gcc ${text}`
    type = 'gcc'
  } else {
    type = activeTab.value
    if (type === 'ptell') {
      command = `ptell ${props.playerName} ${text}`
    } else {
      command = `tell ${props.playerName} ${text}`
    }
  }

  sendGameCommand(command)

  // note: message is added to history by ChatWindowManager when GMCP echoes back
  // don't add here to avoid duplicates

  message.value = ''

  // focus back on input and scroll to bottom
  nextTick(() => {
    focusInput()
    scrollToBottom()
  })
}

// handle enter key
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

// handle header click - focus window
const handleHeaderClick = () => {
  if (props.isMinimized) {
    emit('minimize') // toggle to expand
  } else {
    emit('focus')
  }
}

// scroll to bottom on mount
onMounted(() => {
  if (!props.isMinimized) {
    nextTick(() => {
      scrollToBottom()
      focusInput()
    })
  }
})

// focus input when window expands
watch(
  () => props.isMinimized,
  (minimized) => {
    if (!minimized) {
      nextTick(() => {
        focusInput()
        scrollToBottom()
      })
    }
  },
)

// scroll to bottom when new messages arrive
watch(
  () => messages.value.length,
  () => {
    if (!props.isMinimized) {
      scrollToBottom()
    }
  },
)

// format timestamp
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed z-50 flex flex-col bg-background border border-border rounded-lg shadow-lg overflow-hidden transition-all duration-150"
      :style="{ bottom: `${position.bottom}px`, right: `${position.right}px`, width: '280px' }"
    >
      <!-- header bar (always visible) -->
      <div
        class="h-8 bg-muted flex items-center justify-between px-2 cursor-pointer select-none shrink-0"
        @click="handleHeaderClick"
      >
        <div class="flex items-center gap-2 font-mono text-sm truncate">
          <span
            class="truncate"
            :class="isMinimized && unreadCount > 0 ? 'text-red-400 font-semibold' : ''"
          >{{ displayName }}</span>
          <span
            v-if="unreadCount > 0"
            class="bg-red-500 text-white text-xs px-1.5 rounded-full min-w-[1.25rem] text-center"
          >{{ unreadCount }}</span>
        </div>
        <div class="flex items-center gap-0.5" @click.stop>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            :title="isMinimized ? 'expand' : 'minimize'"
            @click="emit('minimize')"
          >
            <Plus v-if="isMinimized" class="h-3 w-3" />
            <Minus v-else class="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 hover:bg-destructive hover:text-destructive-foreground"
            title="close"
            @click="emit('close')"
          >
            <X class="h-3 w-3" />
          </Button>
        </div>
      </div>

      <!-- collapsible content -->
      <template v-if="!isMinimized">
        <!-- message history area -->
        <div
          ref="messagesRef"
          class="h-52 overflow-y-auto p-2 space-y-2 font-mono text-xs bg-muted/20"
        >
          <div v-if="messages.length === 0" class="text-muted-foreground text-center py-4">
            {{ emptyText }}
          </div>
          <!-- chat bubbles -->
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="flex flex-col"
            :class="msg.direction === 'sent' ? 'items-end' : 'items-start'"
          >
            <!-- sender name for group/guild received messages -->
            <span
              v-if="windowType !== 'player' && msg.direction === 'received' && msg.sender"
              class="text-[10px] mb-0.5 px-1"
              :class="windowType === 'group' ? 'text-yellow-400' : 'text-green-400'"
            >
              {{ msg.sender }}
            </span>
            <!-- message bubble -->
            <div
              class="max-w-[85%] px-2.5 py-1.5 rounded-lg break-words"
              :class="[
                msg.direction === 'sent'
                  ? 'bg-blue-500 rounded-br-sm'
                  : [
                      'rounded-bl-sm',
                      msg.type === 'ptell' ? 'bg-red-500/20' :
                      msg.type === 'gsay' || windowType === 'group' ? 'bg-green-500/20' :
                      msg.type === 'gcc' || windowType === 'guild' ? 'bg-purple-500/20' :
                      'bg-muted'
                    ]
              ]"
            >
              <p :class="msg.direction === 'sent' ? 'text-white' : 'text-foreground/90'"><ChatPresentation :presentation="msg.presentation" :channel="msg.type">{{ msg.text }}</ChatPresentation></p>
            </div>
            <!-- timestamp -->
            <span class="text-[9px] text-muted-foreground/50 mt-0.5 px-1">
              {{ formatTime(msg.timestamp) }}
            </span>
          </div>
        </div>

        <!-- action bar (only show tabs for player windows with god) -->
        <div class="flex items-center gap-1 px-2 py-1 border-t border-border/50">
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 shrink-0"
            title="clear history"
            @click="emit('clearHistory')"
          >
            <Trash2 class="h-3 w-3" />
          </Button>
          <!-- tab switcher for tell/ptell if god and player window -->
          <Tabs
            v-if="isGod && windowType === 'player'"
            :model-value="activeTab"
            class="flex-1"
            @update:model-value="(val) => activeTab = val as 'tell' | 'ptell'"
          >
            <TabsList class="h-6 w-full grid grid-cols-2">
              <TabsTrigger value="tell" class="text-xs h-5 px-2">tell</TabsTrigger>
              <TabsTrigger value="ptell" class="text-xs h-5 px-2">ptell</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <!-- input area -->
        <div class="flex gap-1 p-2 border-t border-border/50">
          <Input
            ref="inputRef"
            v-model="message"
            :placeholder="placeholderText"
            class="flex-1 h-7 text-xs font-mono"
            @keydown="handleKeydown"
          />
          <Button
            size="icon"
            class="h-7 w-7 shrink-0"
            :disabled="!message.trim()"
            @click="sendMessage"
          >
            <Send class="h-3 w-3" />
          </Button>
        </div>
      </template>
    </div>
  </Teleport>
</template>
