import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ChatPresentation from '../ChatPresentation.vue'
import MudChatPanel from '../MudChatPanel.vue'
import { parseChatPresentation, validChatContent } from '../../../utils/chatPresentation.js'
import { chatColor, chatPalette } from '../../../utils/chatPalette.js'
import { useMudStore } from '../../../stores/mudStore.js'
import fixtures from './fixtures/chat-presentation-v1.json'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('recipient presentation from the production server harness', () => {
  for (const fixture of fixtures.filter((entry) => entry.case !== 'reset')) {
    it(`${fixture.packet.channel} ${fixture.case} for ${fixture.recipient}`, () => {
      const { packet } = fixture
      const snapshot = parseChatPresentation(packet.presentation, packet.channel)
      expect(snapshot).toBeDefined()
      const wrapper = mount(ChatPresentation, {
        props: { channel: packet.channel, presentation: packet.presentation },
        slots: { default: 'Legacy chat layout' },
      })
      expect(wrapper.text()).toBe(packet.presentation.text)
      expect(wrapper.find('tag').exists()).toBe(false)
      const spans = wrapper.findAll('[data-chat-presentation] > span')
      expect(spans).toHaveLength(packet.presentation.runs.length)
      packet.presentation.runs.forEach((run, index) => {
        expect(spans[index]!.attributes('style')).toContain(chatColor(run[2]!))
      })
      expect(
        spans.some(
          (span) =>
            span.text() === 'forest' && (span.attributes('style') ?? '').includes('--mud-green'),
        ),
      ).toBe(true)
      wrapper.unmount()
    })
  }
  for (const fixture of fixtures.filter((entry) => entry.case === 'reset')) {
    it(`${fixture.packet.channel} reset for ${fixture.recipient}`, () => {
      const wrapper = mount(ChatPresentation, {
        props: { channel: fixture.packet.channel, presentation: fixture.packet.presentation },
        slots: { default: 'Legacy chat layout' },
      })
      expect(wrapper.text()).toBe('Legacy chat layout')
      expect(wrapper.find('[data-chat-presentation]').exists()).toBe(false)
      wrapper.unmount()
    })
  }

  it('maps all 16 palette IDs in Duris BGR order and keeps normal distinct', () => {
    expect(chatPalette).toHaveLength(16)
    expect(chatColor(17)).toContain('--mud-blue')
    expect(chatColor(20)).toContain('--mud-red')
    expect(chatColor(27)).toContain('--mud-bright-cyan')
    expect(chatColor(0)).not.toBe(chatColor(23))
    expect(chatColor(31)).toContain('--mud-bright-white')
  })

  it('rejects untrusted or unsupported snapshots and retains legacy content', () => {
    const original = fixtures[0]!.packet.presentation
    const invalid: unknown[] = [
      null,
      {},
      { ...original, version: 2 },
      { ...original, channelId: 12 },
      { ...original, channel: 'chat.tell' },
      { ...original, policy: 'javascript' },
      { ...original, text: '\u001b[31m' },
      { ...original, text: 'a'.repeat(32769) },
      { ...original, runs: Array(4097).fill([0, 1, 20, 0]) },
      { ...original, runs: [[0, 1, 1, 0]] },
      { ...original, runs: [[1, 2, 20, 0]] },
      { ...original, runs: [[0, 999999, 20, 0]] },
      { ...original, underline: 'true' },
      { ...original, runs: [[0, 1, 'red', 0]] },
      { ...original, runs: [[0, 1.5, 20, 0]] },
    ]
    for (const presentation of invalid) {
      expect(parseChatPresentation(presentation, 'say')).toBeUndefined()
      const wrapper = mount(ChatPresentation, {
        props: { channel: 'say', presentation },
        slots: { default: 'Safe fallback' },
      })
      expect(wrapper.text()).toBe('Safe fallback')
      wrapper.unmount()
    }
    expect(parseChatPresentation(original, '__proto__')).toBeUndefined()
    expect(validChatContent({ channel: 'say', sender: 'Bob', text: 'old server' })).toBe(true)
    expect(validChatContent({ channel: '__proto__', sender: 'Bob', text: 'bad' })).toBe(false)
    expect(validChatContent({ channel: 'say', sender: {}, text: 'bad' })).toBe(false)
  })

  it('renders each store event once in the actual chat panel and resets per message', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useMudStore()
    const wrapper = mount(MudChatPanel, {
      global: { plugins: [pinia], stubs: { ChatWindowManager: true } },
    })
    for (const fixture of fixtures) {
      const p = fixture.packet
      store.addChatMessage(p.channel, p.sender, p.text, undefined, undefined, p.presentation)
    }
    await nextTick()
    expect(wrapper.findAll('[data-chat-presentation]')).toHaveLength(12)
    expect(Object.values(store.chatMessages).flat()).toHaveLength(18)
    // Earlier frozen frames survive later reset packets without recoloring history.
    expect(wrapper.findAll('[data-chat-presentation]')[0]!.text()).toBe(
      fixtures[0]!.packet.presentation.text,
    )
    wrapper.unmount()
  })
})
