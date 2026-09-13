import type { ChatPresentation } from '../utils/chatPresentation.js'
// storage version for future migrations
export const CHAT_STORAGE_VERSION = 1

// chat window types
export type ChatWindowType = 'player' | 'group' | 'guild'

// message types per window type
export type ChatMessageType = 'tell' | 'ptell' | 'gsay' | 'gcc'

// individual chat message in history
export interface ChatHistoryMessage {
  id: string // unique id (uuid)
  timestamp: number // unix timestamp
  direction: 'sent' | 'received'
  sender?: string // sender name for group/guild chats
  presentation?: ChatPresentation
  text: string
  type: ChatMessageType
}

// stored chat history for one player/channel
export interface ChatHistoryEntry {
  playerName: string // player name or channel identifier (e.g., "__group__", "__guild__")
  messages: ChatHistoryMessage[]
  lastActivity: number // for sorting recent chats
}

// localStorage structure
export interface ChatHistoryStorage {
  version: number
  histories: Record<string, ChatHistoryEntry> // keyed by playerName.toLowerCase()
}

// open chat window state
export interface ChatWindowState {
  id: string // unique window id
  playerName: string // target player name or channel display name
  windowType: ChatWindowType // player, group, or guild
  isMinimized: boolean // collapsed to title bar only
  unreadCount: number // messages received while minimized
}

// channel keys for group/guild
export const CHANNEL_KEYS = {
  group: '__group__',
  guild: '__guild__',
} as const
