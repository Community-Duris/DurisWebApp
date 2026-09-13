import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ChatWindowManager from '../ChatWindowManager.vue'
import ChatWindow from '../ChatWindow.vue'
import { useMudStore } from '../../../stores/mudStore.js'
import { useChatHistory } from '../../../composables/useChatHistory.js'
import fixtures from './fixtures/chat-presentation-v1.json'

vi.mock('@/composables/useMudConnection', () => ({
  useMudConnection: () => ({ sendGameCommand: vi.fn() }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

it('carries tell/guild frames once through the actual window manager, persisted history and reload', async () => {
  const store = useMudStore()
  store.setAccount('FixtureAccount', [])
  const manager = mount(ChatWindowManager, { global: { stubs: { ChatWindow: true } } })
  for (const fixture of fixtures.filter(
    (value) => value.recipient === 'Bob' && value.packet.channel !== 'say',
  )) {
    const p = fixture.packet
    store.addChatMessage(p.channel, p.sender, p.text, undefined, undefined, p.presentation)
  }
  await nextTick()
  const history = useChatHistory()
  expect(history.getMessages('Alice')).toHaveLength(3)
  expect(history.getMessages('__guild__')).toHaveLength(3)
  // Deep reactive updates must not insert the same event again.
  store.chatMessages.tell![0]!.highlightClass = 'highlight'
  await nextTick()
  expect(history.getMessages('Alice')).toHaveLength(3)
  history.loadHistory()
  expect(history.getMessages('Alice')[0]!.presentation?.policy).toBe('static')
  expect(history.getMessages('Alice')[2]!.presentation?.policy).toBe('preserve')
  manager.unmount()
  const window = mount(ChatWindow, {
    global: { stubs: { Teleport: true } },
    props: {
      playerName: 'Alice',
      windowType: 'player',
      position: { bottom: 8, right: 8 },
      isMinimized: false,
      unreadCount: 0,
    },
  })
  expect(window.findAll('[data-chat-presentation]')).toHaveLength(2)
  expect(window.text()).toContain(
    fixtures.find((value) => value.recipient === 'Bob' && value.packet.channel === 'tell')!.packet
      .presentation.text,
  )
  expect(window.find('tag').exists()).toBe(false)
  window.unmount()
})
