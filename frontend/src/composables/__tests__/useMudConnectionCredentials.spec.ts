import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

const {
  store,
  storeMudCredentials,
  clearMudCredentials,
  getMudCredentials,
  sockets,
  siteConfiguration,
} = vi.hoisted(() => ({
  store: {
    copyoverInProgress: false,
    copyoverCharacterName: null,
    chargenLoading: false,
    setConnectionState: vi.fn(),
    setAccount: vi.fn(),
    clearCopyoverState: vi.fn(),
    setCharacter: vi.fn(),
    setLatency: vi.fn(),
    reset: vi.fn(),
    openReconnectDialog: vi.fn(),
    addLogEntry: vi.fn(),
    addChatMessage: vi.fn(),
  },
  storeMudCredentials: vi.fn(),
  clearMudCredentials: vi.fn(),
  getMudCredentials: vi.fn(() => null),
  sockets: [] as FakeSocket[],
  siteConfiguration: {
    mudWsUrl: { value: 'wss://mud.test' as string | null },
    loadConfig: vi.fn<() => Promise<void>>(),
    isLoaded: { value: true },
    isAvailable: { value: true },
  },
}))

class FakeSocket {
  static OPEN = 1
  readyState = FakeSocket.OPEN
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: ((error: unknown) => void) | null = null
  sent: string[] = []

  constructor(public readonly url: string) {
    sockets.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 3
    this.onclose?.({ code: 1000, reason: 'test reconnect' })
  }
}

vi.mock('@/stores/mudStore', () => ({
  useMudStore: () => store,
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    storeMudCredentials,
    clearMudCredentials,
    getMudCredentials,
  }),
}))

vi.mock('@/composables/useSiteConfig', () => {
  return { useSiteConfig: () => siteConfiguration }
})

vi.mock('@/composables/useTimers', () => ({
  useTimers: () => ({
    startAllTimers: vi.fn(),
    stopAllTimers: vi.fn(),
    setSendCommand: vi.fn(),
    setAddLogEntry: vi.fn(),
  }),
}))

vi.mock('@/composables/useTriggers', () => ({
  useTriggers: () => ({
    processLine: vi.fn(() => ({
      gagged: false,
      highlightClass: undefined,
      soundsToPlay: [],
      commandsToSend: [],
      echoTexts: [],
      matchedTriggers: [],
    })),
    playSounds: vi.fn(),
    evaluateGmcpTriggers: vi.fn(() => ({
      soundsToPlay: [],
      commandsToSend: [],
      echoTexts: [],
    })),
    echoTriggers: vi.fn(),
  }),
}))

vi.mock('@/utils/duriswebAuth', () => ({
  buildDurisWebClientInfo: vi.fn(() => ({ client: 'DurisWeb', version: '1.0.0' })),
}))

import { useMudConnection } from '../useMudConnection'
import chatFixtures from '../../components/mud/__tests__/fixtures/chat-presentation-v1.json'

let activeWrapper: VueWrapper | null = null

function createConnection() {
  const Harness = defineComponent({
    setup() {
      return useMudConnection()
    },
    render() {
      return h('div')
    },
  })

  activeWrapper = mount(Harness)
  return activeWrapper.vm as unknown as ReturnType<typeof useMudConnection>
}

describe('useMudConnection credential lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    sockets.length = 0
    siteConfiguration.mudWsUrl.value = 'wss://mud.test'
    siteConfiguration.isLoaded.value = true
    siteConfiguration.isAvailable.value = true
    siteConfiguration.loadConfig.mockResolvedValue()
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    })
    window.__mudWebSocket = null
    window.__mudLoggingIn = false
    window.__mudConnecting = false
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
    window.__mudWebSocket = null
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('sends non-privileged client metadata on connection open', async () => {
    const connection = createConnection()
    await connection.connect()
    sockets[0]!.onopen?.()

    expect(JSON.parse(sockets[0]!.sent[0]!)).toEqual({
      type: 'gmcp',
      package: 'Client.Info',
      data: { client: 'DurisWeb', version: '1.0.0' },
    })
    expect(JSON.parse(sockets[0]!.sent[0]!).data).not.toHaveProperty('sig')
  })

  it('clears the connecting state when site configuration is unavailable', async () => {
    siteConfiguration.mudWsUrl.value = null
    siteConfiguration.isLoaded.value = false
    siteConfiguration.isAvailable.value = false
    const connection = createConnection()

    await connection.connect()

    expect(window.__mudConnecting).toBe(false)
    expect(store.setConnectionState).toHaveBeenLastCalledWith('error', 'Failed to connect')
    expect(sockets).toHaveLength(0)

    siteConfiguration.mudWsUrl.value = 'wss://mud.test'
    siteConfiguration.isAvailable.value = true
    await connection.connect()
    expect(sockets).toHaveLength(1)
  })

  it('stores pending credentials only after a successful auth response', async () => {
    const connection = createConnection()
    await connection.login('Cwial', 'temporary-password')

    expect(storeMudCredentials).not.toHaveBeenCalled()
    expect(sockets).toHaveLength(1)

    sockets[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'auth',
        status: 'success',
        data: { account: 'Cwial', characters: [] },
      }),
    })

    expect(storeMudCredentials).toHaveBeenCalledWith('Cwial', 'temporary-password')
    expect(clearMudCredentials).not.toHaveBeenCalled()
  })

  it('clears stored credentials after a failed auth response', async () => {
    const connection = createConnection()
    await connection.login('Cwial', 'temporary-password')

    sockets[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'auth',
        status: 'failed',
        error: 'Invalid credentials',
      }),
    })

    expect(storeMudCredentials).not.toHaveBeenCalled()
    expect(clearMudCredentials).toHaveBeenCalledTimes(1)
  })
  it('delivers one presentation snapshot per packet through reconnect and default reset', async () => {
    const connection = createConnection()
    await connection.connect()
    for (const fixture of chatFixtures.filter((entry) => entry.recipient === 'Bob')) {
      const packet = {
        type: 'gmcp',
        package: 'Comm.Channel',
        data: { ...fixture.packet, timestamp: 1 },
      }
      sockets.at(-1)!.onmessage?.({ data: JSON.stringify(packet) })
      expect(store.addChatMessage).toHaveBeenLastCalledWith(
        fixture.packet.channel,
        fixture.packet.sender,
        fixture.packet.text,
        undefined,
        undefined,
        fixture.packet.presentation,
      )
      if (fixture.case === 'selected') {
        connection.disconnect()
        await connection.connect()
      }
    }
    expect(store.addChatMessage).toHaveBeenCalledTimes(9)
    const socket = sockets.at(-1)!
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'gmcp',
        package: 'Comm.Channel',
        data: { channel: 'say', sender: {}, text: 'invalid' },
      }),
    })
    expect(store.addChatMessage).toHaveBeenCalledTimes(9)
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'gmcp',
        package: 'Comm.Channel',
        data: { channel: 'say', sender: 'Bob', text: 'old server' },
      }),
    })
    expect(store.addChatMessage).toHaveBeenCalledTimes(10)
    expect(store.addChatMessage).toHaveBeenLastCalledWith(
      'say',
      'Bob',
      'old server',
      undefined,
      undefined,
      undefined,
    )
  })
})
