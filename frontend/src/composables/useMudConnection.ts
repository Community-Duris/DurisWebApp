import { validChatContent } from '../utils/chatPresentation.js'
import { ref, onUnmounted } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { useTriggers } from '@/composables/useTriggers'
import { useTimers } from '@/composables/useTimers'
import { useSiteConfig } from '@/composables/useSiteConfig'
import { useAuth } from '@/composables/useAuth'
import { buildDurisWebClientInfo } from '@/utils/duriswebAuth'
import type {
  MudClientCommand,
  MudServerMessage,
  MudAuthMessage,
  MudAuthReconnectedMessage,
  MudChargenMessage,
  MudGmcpMessage,
  MudTextMessage,
  MudSystemMessage,
  MudHometownsMessage,
  MudValidateNameMessage,
  MudAccountMessage,
} from '@/types/mud'
import type { TriggerActionSound } from '@/types/trigger'

// Singleton WebSocket instance - use window to survive HMR
declare global {
  interface Window {
    __mudWebSocket?: WebSocket | null
    __mudConnecting?: boolean
    __mudLoggingIn?: boolean
  }
}

// Get or create WebSocket ref that survives HMR
const getWsRef = () => {
  if (typeof window !== 'undefined') {
    return window.__mudWebSocket ?? null
  }
  return null
}

const setWsRef = (socket: WebSocket | null) => {
  if (typeof window !== 'undefined') {
    window.__mudWebSocket = socket
  }
}

const isConnecting = () => {
  return typeof window !== 'undefined' && window.__mudConnecting === true
}

const setConnecting = (value: boolean) => {
  if (typeof window !== 'undefined') {
    window.__mudConnecting = value
  }
}

const LOGIN_COOLDOWN_MS = 2000 // 2 seconds between login attempts across all tabs

const isLoggingIn = () => {
  if (typeof window === 'undefined') return false
  // check both window flag (current tab) and localStorage (cross-tab)
  if (window.__mudLoggingIn) return true
  const lastAttempt = localStorage.getItem('__mudLastLoginAttempt')
  if (lastAttempt) {
    const elapsed = Date.now() - parseInt(lastAttempt, 10)
    if (elapsed < LOGIN_COOLDOWN_MS) return true
  }
  return false
}

const setLoggingIn = (value: boolean) => {
  if (typeof window === 'undefined') return
  window.__mudLoggingIn = value
  if (value) {
    localStorage.setItem('__mudLastLoginAttempt', Date.now().toString())
  }
}

const reconnectAttempts = ref(0)
const maxReconnectAttempts = 5
const _reconnectDelay = 3000 // 3 seconds (reserved for future use)
let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null
let pingIntervalId: ReturnType<typeof setInterval> | null = null
let lastCommandSentAt: number | null = null // Track when command was sent for latency
const PING_INTERVAL = 30000 // 30 seconds - keeps MUD connection alive

// copyover reconnect settings
const COPYOVER_FAST_INTERVAL = 500 // 500ms during fast phase
const COPYOVER_FAST_DURATION = 10000 // 10 seconds of fast polling
const COPYOVER_SLOW_INTERVAL = 2000 // 2s during slow phase
const COPYOVER_MAX_ATTEMPTS = 30 // total max attempts
let copyoverReconnectAttempts = 0
let copyoverFastPhaseEnd: number | null = null
let copyoverReconnectTimeoutId: ReturnType<typeof setTimeout> | null = null

/** Manages one browser MUD connection and its authentication lifecycle. */
export function useMudConnection() {
  const store = useMudStore()
  const { storeMudCredentials, getMudCredentials, clearMudCredentials } = useAuth()
  const { mudWsUrl, loadConfig, isLoaded, isAvailable } = useSiteConfig()
  const { startAllTimers, stopAllTimers, setSendCommand, setAddLogEntry } = useTimers()
  let pendingAuthCredentials: { account: string; password: string } | null = null

  /** Returns the validated browser MUD endpoint or fails while configuration is unavailable. */
  const getMudWsUrl = () => {
    if (!mudWsUrl.value) throw new Error('Site configuration is unavailable')
    return mudWsUrl.value
  }

  /** Waits for the shared site configuration and rejects an unavailable response. */
  const ensureConfigLoaded = async () => {
    if (!isLoaded.value) {
      await loadConfig()
    }
    if (!isAvailable.value) throw new Error('Site configuration is unavailable')
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /** Opens at most one MUD socket and resets connection state after any setup failure. */
  const connect = async () => {
    const existingWs = getWsRef()

    // Don't reconnect if already connected
    if (existingWs && existingWs.readyState === WebSocket.OPEN) {
      console.log('[MUD] Already connected, reusing existing WebSocket')
      return
    }

    // Don't create multiple connections simultaneously
    if (isConnecting()) {
      console.log('[MUD] Connection already in progress, skipping')
      return
    }

    // Close any existing connection
    if (existingWs) {
      try {
        existingWs.close()
      } catch {
        // Ignore errors when closing
      }
      setWsRef(null)
    }

    setConnecting(true)
    store.setConnectionState('connecting')

    try {
      // Configuration failures use the same cleanup path as constructor failures.
      await ensureConfigLoaded()
      const wsUrl = getMudWsUrl()
      const newWs = new WebSocket(wsUrl)
      setWsRef(newWs)

      newWs.onopen = async () => {
        setConnecting(false)
        // Don't set 'connected' yet - wait for welcome message from MUD
        reconnectAttempts.value = 0

        // Send non-privileged client metadata. Service authentication belongs
        // only to the backend bridge and must never be bundled into the UI.
        try {
          newWs.send(
            JSON.stringify({
              type: 'gmcp',
              package: 'Client.Info',
              data: buildDurisWebClientInfo(),
            }),
          )
        } catch (e) {
          console.error('failed to send client info:', e)
        }

        // Start ping interval to keep MUD connection alive (through proxies)
        if (pingIntervalId) {
          clearInterval(pingIntervalId)
        }
        pingIntervalId = setInterval(() => {
          const ws = getWsRef()
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, PING_INTERVAL)

        // Auto-login will be triggered by MudLoginPanel.onMounted when it mounts
      }

      newWs.onmessage = (event) => {
        try {
          const message: MudServerMessage = JSON.parse(event.data)
          handleMessage(message)
        } catch (error) {
          console.error('Failed to parse MUD message:', error, 'Raw:', event.data)
        }
      }

      newWs.onerror = (error) => {
        console.error('MUD WebSocket error:', error)
        pendingAuthCredentials = null
        setConnecting(false)
        store.setConnectionState('error', 'Connection error')
      }

      newWs.onclose = (event) => {
        console.log('[MUD] WebSocket closed', event.code, event.reason)
        pendingAuthCredentials = null
        setConnecting(false)
        setLoggingIn(false) // Clear login in progress flag
        setWsRef(null)

        // Stop all timers when disconnected
        stopAllTimers()

        // Clear ping interval
        if (pingIntervalId) {
          clearInterval(pingIntervalId)
          pingIntervalId = null
        }

        // Check if this is a copyover disconnect
        if (store.copyoverInProgress) {
          // don't change connection state to disconnected - keep showing copyover banner
          console.log('[MUD] Copyover in progress, starting fast reconnect...')
          copyoverReconnectAttempts = 0
          copyoverFastPhaseEnd = Date.now() + COPYOVER_FAST_DURATION
          attemptCopyoverReconnect()
          return
        }

        store.setConnectionState('disconnected')

        // show reconnect dialog on any disconnect (clean or not)
        // this prevents auto-login from triggering when kicked by another session
        store.openReconnectDialog()
      }
    } catch (error) {
      console.error('Failed to create MUD WebSocket:', error)
      pendingAuthCredentials = null
      setConnecting(false)
      store.setConnectionState('error', 'Failed to connect')
    }
  }

  const disconnect = () => {
    // Clear any pending reconnect timeout
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId)
      reconnectTimeoutId = null
    }
    // Clear copyover reconnect timeout
    if (copyoverReconnectTimeoutId) {
      clearTimeout(copyoverReconnectTimeoutId)
      copyoverReconnectTimeoutId = null
    }
    // Clear ping interval
    if (pingIntervalId) {
      clearInterval(pingIntervalId)
      pingIntervalId = null
    }
    lastCommandSentAt = null
    store.setLatency(null)
    reconnectAttempts.value = maxReconnectAttempts // Prevent auto-reconnect
    setLoggingIn(false) // Clear login in progress flag
    store.clearCopyoverState() // Clear copyover state
    const ws = getWsRef()
    if (ws) {
      ws.close()
      setWsRef(null)
    }
    store.reset()
  }

  // ==========================================================================
  // Copyover Reconnection
  // ==========================================================================

  const attemptCopyoverReconnect = async () => {
    if (copyoverReconnectAttempts >= COPYOVER_MAX_ATTEMPTS) {
      console.log('[MUD] Copyover reconnect failed after max attempts')
      store.clearCopyoverState()
      store.setConnectionState('error', 'Failed to reconnect after server update')
      return
    }

    copyoverReconnectAttempts++

    // determine interval based on phase
    const now = Date.now()
    const inFastPhase = copyoverFastPhaseEnd && now < copyoverFastPhaseEnd
    const interval = inFastPhase ? COPYOVER_FAST_INTERVAL : COPYOVER_SLOW_INTERVAL

    console.log(
      `[MUD] Copyover reconnect attempt ${copyoverReconnectAttempts}/${COPYOVER_MAX_ATTEMPTS} (${inFastPhase ? 'fast' : 'slow'} phase)`,
    )

    try {
      await connect()

      // wait a bit for connection to establish
      await new Promise((resolve) => setTimeout(resolve, 100))

      const ws = getWsRef()
      if (ws && ws.readyState === WebSocket.OPEN) {
        // connected! auto-login will be handled by MudLoginPanel
        console.log('[MUD] Copyover reconnect successful, waiting for auto-login')
        // don't clear copyover state yet - wait for successful auth
        return
      }
    } catch (err) {
      console.log('[MUD] Copyover reconnect attempt failed:', err)
    }

    // schedule next attempt
    copyoverReconnectTimeoutId = setTimeout(attemptCopyoverReconnect, interval)
  }

  // ==========================================================================
  // Message Handling
  // ==========================================================================

  const handleMessage = (message: MudServerMessage) => {
    switch (message.type) {
      case 'pong':
        // Ignore - latency is measured via backend WebSocket instead
        break
      case 'auth':
        handleAuthMessage(message as MudAuthMessage)
        break
      case 'account':
        handleAccountMessage(message as MudAccountMessage)
        break
      case 'chargen_options':
      case 'roll_stats':
      case 'bonus_added':
      case 'stats_swapped':
      case 'create_character':
        handleChargenMessage(message as MudChargenMessage)
        break
      case 'hometowns':
        handleHometownsMessage(message as MudHometownsMessage)
        break
      case 'validate_name':
        handleValidateNameMessage(message as MudValidateNameMessage)
        break
      case 'gmcp':
        handleGmcpMessage(message as MudGmcpMessage)
        break
      case 'text':
        handleTextMessage(message as MudTextMessage)
        break
      case 'system':
        // System messages (welcome, server status, etc.) - just log them
        handleSystemMessage(message as MudSystemMessage)
        break
      default:
        console.warn('Unknown message type:', message)
    }
  }

  const handleSystemMessage = (message: MudSystemMessage) => {
    // Add system messages to the activity log
    if (message.data?.message) {
      store.addLogEntry('system', message.data.message)
    }

    // Welcome message - MUD is ready for login
    if (message.data?.status === 'connected') {
      store.setConnectionState('connected')

      // if this is a copyover reconnect, auto-login with stored credentials
      if (store.copyoverInProgress) {
        const creds = getMudCredentials()
        if (creds) {
          pendingAuthCredentials = creds
          console.log('[MUD] Copyover: auto-login with stored credentials')
          store.setConnectionState('authenticating')
          // small delay to ensure mud is ready
          setTimeout(() => {
            sendCommand({
              type: 'cmd',
              cmd: 'login',
              data: { account: creds.account, password: creds.password },
            })
          }, 100)
        } else {
          console.log('[MUD] Copyover: no stored credentials, clearing copyover state')
          store.clearCopyoverState()
        }
      }
    }

    // Copyover message - server is updating, prepare for reconnect
    if (message.data?.status === 'copyover') {
      console.log('[MUD] Copyover initiated:', message.data.message)
      store.setCopyoverInProgress(true, message.data.message || 'Server updating, please wait...')
      // websocket will close after this, onclose handler will start copyover reconnect
    }

    // If this is an error during chargen, set the error state
    if (message.data?.status === 'error' && store.chargenLoading) {
      store.setChargenError(message.data.message)
    }
  }

  // Helper function to initialize and start timers when entering game
  const initializeTimers = () => {
    // Wire up timer system with MUD connection functions
    setSendCommand((command: string) => sendGameCommand(command))
    setAddLogEntry((category: string, text: string) =>
      store.addLogEntry(category as 'system', text),
    )
    // Start all enabled timers
    startAllTimers()
  }

  const handleAuthMessage = (message: MudAuthMessage) => {
    if (message.status === 'success' || message.status === 'registered') {
      if (pendingAuthCredentials) {
        storeMudCredentials(
          message.data.account || pendingAuthCredentials.account,
          pendingAuthCredentials.password,
        )
        pendingAuthCredentials = null
      }

      store.setAccount(message.data.account, message.data.characters)

      // if this was a copyover, auto-enter the previous character
      if (store.copyoverInProgress && store.copyoverCharacterName) {
        const charName = store.copyoverCharacterName
        console.log('[MUD] Copyover: auto-entering character:', charName)
        store.clearCopyoverState()
        // small delay to ensure state is updated
        setTimeout(() => {
          sendCommand({
            type: 'cmd',
            cmd: 'enter',
            data: { character: charName },
          })
        }, 100)
      } else {
        store.clearCopyoverState()
      }
    } else if (message.status === 'reconnected') {
      pendingAuthCredentials = null
      // Reconnected to existing character - go directly to in_game state
      const reconnectMsg = message as MudAuthReconnectedMessage
      store.setAccount(reconnectMsg.data.account, [])
      store.setCharacter({
        name: reconnectMsg.data.character.name,
        level: reconnectMsg.data.character.level,
        race: reconnectMsg.data.character.race,
        class: reconnectMsg.data.character.class,
        alignment: '',
        guild: '',
        title: '',
      })
      store.setConnectionState('in_game')
      store.clearCopyoverState() // clear copyover on successful reconnect
      initializeTimers()
      store.addLogEntry('system', `Reconnected as ${reconnectMsg.data.character.name}`)
    } else if (message.status === 'failed') {
      pendingAuthCredentials = null
      clearMudCredentials()
      store.setConnectionState('error', message.error)
      store.clearCopyoverState() // clear copyover on auth failure
    }
  }

  const handleAccountMessage = (message: MudAccountMessage) => {
    switch (message.action) {
      case 'info':
        store.setAccountInfo(message.data)
        break
      case 'email_changed':
        // Update email in account info if we have it
        if (store.accountInfo) {
          store.setAccountInfo({
            ...store.accountInfo,
            email: message.data.email,
          })
        }
        store.addLogEntry('system', 'Email address updated successfully')
        break
      case 'password_changed':
        store.addLogEntry('system', 'Password changed successfully')
        break
      case 'character_deleted':
        store.removeCharacter(message.data.name)
        store.updateCharacters(message.data.characters)
        store.addLogEntry('system', `Character ${message.data.name} has been deleted`)
        break
      case 'rested_bonus':
        store.setRestedBonus(message.data)
        break
      case 'return_to_menu':
        // Player rented/died/quit - show confirmation dialog
        // Keep game view visible so user can see death logs
        store.updateCharacters(message.data.characters)
        store.openReturnDialog(message.reason)
        // State stays as 'in_game' until user confirms
        break
      case 'logged_out':
        // Logged out - show reconnect dialog
        store.openReconnectDialog()
        store.setConnectionState('connected')
        store.clearAccount()
        break
      case 'error':
        store.setAccountError(message.error)
        break
    }
  }

  const handleChargenMessage = (message: MudChargenMessage) => {
    switch (message.type) {
      case 'chargen_options':
        store.setChargenOptions(message.races)
        store.setChargenLoading(false)
        break
      case 'roll_stats':
        // Stats are now quality labels, not numbers
        if (message.stats && message.bonusRemaining !== undefined) {
          store.setChargenStats(message.stats, message.bonusRemaining)
        }
        store.setChargenLoading(false)
        break
      case 'bonus_added':
        // Update stats after bonus allocation
        store.updateChargenBonus(message.stats, message.bonusRemaining)
        break
      case 'stats_swapped':
        // Update stats after swap
        if (message.stats) {
          store.setChargenStats(message.stats, store.chargenStats?.bonusRemaining ?? 0)
        }
        break
      case 'create_character':
        console.log('[MUD] create_character response:', message)
        store.setChargenLoading(false)
        if (message.status === 'error') {
          store.setChargenError(message.message)
        } else if (message.status === 'created') {
          // Character created successfully - enter the game
          store.clearChargenState()
          store.addLogEntry('system', message.message)
          // Set initial character data from response
          if (message.name && message.race && message.class) {
            store.setCharacter({
              name: message.name,
              level: 1,
              race: message.race,
              class: message.class,
              alignment: message.faction === 'good' ? 'good' : 'evil',
              guild: '',
              title: '',
            })
          }
          // Transition to in_game state
          store.setConnectionState('in_game')
          initializeTimers()
        } else if (message.status === 'validated') {
          // Name validated, ready for next step
          store.addLogEntry('system', message.message)
        }
        break
    }
  }

  const handleHometownsMessage = (message: MudHometownsMessage) => {
    console.log('[MUD] hometowns response:', message)
    store.setChargenHometowns(message.options, message.hasChoice)
  }

  const handleValidateNameMessage = (message: MudValidateNameMessage) => {
    console.log('[MUD] validate_name response:', message)
    store.setChargenNameValidation(message.valid, message.message)
  }

  // Transform server Room.Info format to frontend MudRoom format
  const transformRoomInfo = (data: Record<string, unknown>) => {
    // Direction abbreviation to full name mapping
    const dirMap: Record<string, string> = {
      n: 'north',
      e: 'east',
      s: 'south',
      w: 'west',
      u: 'up',
      d: 'down',
      ne: 'northeast',
      nw: 'northwest',
      se: 'southeast',
      sw: 'southwest',
    }

    // Transform exits from {n: 12345} to {north: {vnum: 12345}}
    const exits: Record<
      string,
      { vnum: number; name?: string; door?: string; closed?: boolean; locked?: boolean }
    > = {}
    const serverExits = data.exits as Record<string, number> | undefined
    const serverDoors = data.doors as
      | Record<string, { name?: string; closed?: boolean; locked?: boolean }>
      | undefined

    if (serverExits) {
      for (const [abbrev, vnum] of Object.entries(serverExits)) {
        const fullDir = dirMap[abbrev] || abbrev
        exits[fullDir] = { vnum }
        // Add door info if present
        if (serverDoors?.[abbrev]) {
          exits[fullDir].door = serverDoors[abbrev].name
          exits[fullDir].closed = serverDoors[abbrev].closed
          exits[fullDir].locked = serverDoors[abbrev].locked
        }
      }
    }

    // Extract coords from nested object
    const coords = data.coords as { x?: number; y?: number; z?: number } | undefined

    return {
      vnum: data.num as number,
      name: data.name as string,
      colored_name: data.colored_name as string | undefined,
      description: (data.description as string) || '',
      area: data.area as string,
      colored_area: data.colored_area as string | undefined,
      zoneNumber: data.zone as number,
      terrain: data.environment as string,
      x: coords?.x ?? 0,
      y: coords?.y ?? 0,
      z: coords?.z ?? 0,
      section: (data.section as number) || 0,
      exits,
      players: (data.players as { name: string }[]) || [],
      npcs: (data.npcs as { name: string; colored_name?: string; vnum: number }[]) || [],
      items: (data.items as { name: string; colored_name?: string; vnum: number }[]) || [],
    }
  }

  // Check if zone is a wilderness zone (too large to render with Cytoscape)
  const isWildernessZone = (zoneNumber: number): boolean => {
    return (
      (zoneNumber >= 5000 && zoneNumber <= 6599) || // Surface
      (zoneNumber >= 6600 && zoneNumber <= 6999) || // Newbie Maps
      (zoneNumber >= 7000 && zoneNumber <= 8599) || // Underdark
      (zoneNumber >= 1200 && zoneNumber <= 1238) // Alatorin
    )
  }

  const handleGmcpMessage = (message: MudGmcpMessage) => {
    switch (message.package) {
      case 'Room.Info': {
        const roomData = transformRoomInfo(message.data as Record<string, unknown>)
        store.setRoom(roomData)
        // Clear wilderness map when entering a non-wilderness zone
        if (!isWildernessZone(roomData.zoneNumber)) {
          store.setWildernessMap(null)
        }
        break
      }
      case 'Char.Vitals': {
        store.updateVitals(message.data)
        // evaluate gmcp-only triggers when vitals change
        const { evaluateGmcpTriggers, playSounds } = useTriggers()
        const gmcpResult = evaluateGmcpTriggers()
        if (gmcpResult.soundsToPlay.length > 0) {
          playSounds(gmcpResult.soundsToPlay)
        }
        for (const { command, delay } of gmcpResult.commandsToSend) {
          if (delay > 0) {
            setTimeout(() => sendGameCommand(command), delay)
          } else {
            sendGameCommand(command)
          }
        }
        // echo texts for gmcp triggers
        if (gmcpResult.echoTexts.length > 0) {
          for (const text of gmcpResult.echoTexts) {
            store.addLogEntry('system', text)
          }
        }
        break
      }
      case 'Char.Status':
        store.setCharacter(message.data)
        break
      case 'Char.Affects':
        store.setAffects(message.data)
        break
      case 'Combat.Update':
        store.setCombatTarget(message.data.target)
        if (message.data.round?.message) {
          store.addLogEntry('combat', message.data.round.message)
        }
        break
      case 'Comm.Channel': {
        if (!validChatContent(message.data)) break
        // Process chat through triggers
        const { processLine, playSounds } = useTriggers()
        const chatText = `[${message.data.channel}] ${message.data.sender}: ${message.data.text}`
        const result = processLine(chatText)

        // If gagged, don't add to chat
        if (!result.gagged) {
          store.addChatMessage(
            message.data.channel,
            message.data.sender,
            message.data.text,
            result.highlightClass,
            message.data.alignment,
            message.data.presentation,
          )
        }

        // Play sounds if any
        if (result.soundsToPlay.length > 0) {
          playSounds(result.soundsToPlay)
        }

        // Send commands if any
        for (const { command, delay } of result.commandsToSend) {
          if (delay > 0) {
            setTimeout(() => sendGameCommand(command), delay)
          } else {
            sendGameCommand(command)
          }
        }
        break
      }
      case 'Quest.Status':
        store.updateQuest(message.data)
        // If quest has map but we don't have it in memory, try cache
        if (message.data.mapBought && !store.questMap && message.data.zoneNumber) {
          store.loadCachedQuestMap(message.data.zoneNumber)
        }
        break
      case 'Quest.Map':
        // Quest map for bartender quests (cached on frontend)
        store.setQuestMap(message.data.map, message.data.zoneNumber)
        break
      case 'Room.Map':
        // ASCII map for wilderness zones
        store.setWildernessMap(message.data.map)
        break
      case 'Group.Status':
        // Group member status update
        store.setGroup(message.data)
        break
      case 'Ship.Contacts':
        // Ship radar contacts update
        store.setShipContacts(message.data)
        break
      case 'Ship.Info':
        // Ship status info (static/slow-changing data)
        console.log('[GMCP] Ship.Info received:', message.data)
        store.setShipInfo(message.data)
        break
    }
  }

  const handleTextMessage = (message: MudTextMessage) => {
    // Calculate latency from command send to response receive
    if (lastCommandSentAt !== null) {
      const latency = Math.round(performance.now() - lastCommandSentAt)
      store.setLatency(latency)
      lastCommandSentAt = null
    }

    // Process through triggers BEFORE adding to log
    const { processLine, playSounds, echoTriggers } = useTriggers()

    // Split by newlines to process each line individually
    // This allows per-line highlighting and gagging
    const lines = message.data.split(/(\r?\n)/)

    // Accumulate sounds, commands, and echo texts across all lines
    const allSoundsToPlay: TriggerActionSound[] = []
    const allCommandsToSend: Array<{ command: string; delay: number }> = []
    const allEchoTexts: string[] = []
    const allMatchedTriggers: Set<string> = new Set()

    for (const line of lines) {
      // Skip pure newline separators (they're just the split artifacts)
      if (/^[\r\n]+$/.test(line)) {
        continue
      }

      // Preserve empty lines for spacing
      if (!line) {
        store.addLogEntry(message.category, '')
        continue
      }

      const result = processLine(line)

      // Track matched triggers for echo
      result.matchedTriggers.forEach((t) => allMatchedTriggers.add(t.name))

      // Accumulate sounds, commands, and echo texts
      allSoundsToPlay.push(...result.soundsToPlay)
      allCommandsToSend.push(...result.commandsToSend)
      allEchoTexts.push(...result.echoTexts)

      // If gagged, don't add this line to log
      if (result.gagged) {
        // Optionally echo that a gag occurred
        if (echoTriggers.value && result.matchedTriggers.length > 0) {
          const triggerNames = result.matchedTriggers.map((t) => t.name).join(', ')
          store.addLogEntry('system', `&+L[Gagged by: ${triggerNames}]&n`)
        }
      } else {
        // Add log entry with highlight info for this specific line
        store.addLogEntry(message.category, line, result.highlightClass)
      }

      // Parse ship status from text output (strip ANSI escape sequences first)
      const plainLine = line.replace(/\x1B\[[0-9;]*m/g, '')
      const headingMatch = plainLine.match(/^Heading set to (\d+)\./)
      if (headingMatch?.[1]) {
        store.updateShipHeading(parseInt(headingMatch[1], 10))
      }
      const speedMatch = plainLine.match(/^Speed set to (\d+)\./)
      if (speedMatch?.[1]) {
        store.updateShipSpeed(parseInt(speedMatch[1], 10))
      }
    }

    // Display echo texts in activity log
    for (const echoText of allEchoTexts) {
      store.addLogEntry('system', echoText)
    }

    // Echo all trigger matches if enabled (once, not per line)
    if (echoTriggers.value && allMatchedTriggers.size > 0) {
      const triggerNames = Array.from(allMatchedTriggers).join(', ')
      store.addLogEntry('system', `&+L[Triggered: ${triggerNames}]&n`)
    }

    // Play sounds
    if (allSoundsToPlay.length > 0) {
      playSounds(allSoundsToPlay)
    }

    // Send commands (with delay support)
    if (allCommandsToSend.length > 0) {
      for (const { command, delay } of allCommandsToSend) {
        if (delay > 0) {
          setTimeout(() => {
            sendGameCommand(command)
          }, delay)
        } else {
          sendGameCommand(command)
        }
      }
    }
  }

  // ==========================================================================
  // Command Sending
  // ==========================================================================

  const sendCommand = (command: MudClientCommand) => {
    const ws = getWsRef()
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(command))
      return true
    }
    return false
  }

  // Convenience methods for common commands
  const login = async (account: string, password: string) => {
    // prevent duplicate login attempts
    if (isLoggingIn()) {
      console.log('[MUD] Login already in progress, skipping duplicate')
      return false
    }
    setLoggingIn(true)
    pendingAuthCredentials = { account, password }

    try {
      const ws = getWsRef()
      // connect first if not already connected
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        store.setConnectionState('connecting')
        await connect()
        // wait for connection to be ready
        await new Promise<void>((resolve) => {
          const checkConnection = () => {
            const currentWs = getWsRef()
            if (currentWs && currentWs.readyState === WebSocket.OPEN) {
              resolve()
            } else {
              setTimeout(checkConnection, 50)
            }
          }
          checkConnection()
        })
      }
      store.setConnectionState('authenticating')
      return sendCommand({
        type: 'cmd',
        cmd: 'login',
        data: { account, password },
      })
    } finally {
      // clear login flag after a short delay to prevent rapid re-attempts
      setTimeout(() => setLoggingIn(false), 1000)
    }
  }

  const register = async (account: string, password: string, email: string) => {
    pendingAuthCredentials = { account, password }
    const ws = getWsRef()
    // connect first if not already connected
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      store.setConnectionState('connecting')
      await connect()
      // wait for connection to be ready
      await new Promise<void>((resolve) => {
        const checkConnection = () => {
          const currentWs = getWsRef()
          if (currentWs && currentWs.readyState === WebSocket.OPEN) {
            resolve()
          } else {
            setTimeout(checkConnection, 50)
          }
        }
        checkConnection()
      })
    }
    store.setConnectionState('authenticating')
    return sendCommand({
      type: 'cmd',
      cmd: 'register',
      data: { account, password, email },
    })
  }

  const requestChargenOptions = () => {
    store.setChargenLoading(true)
    store.setChargenError(null)
    return sendCommand({
      type: 'cmd',
      cmd: 'chargen_options',
    })
  }

  const rollStats = (raceId: number) => {
    store.setChargenLoading(true)
    store.setChargenError(null)
    return sendCommand({
      type: 'cmd',
      cmd: 'roll_stats',
      data: { race: raceId },
    })
  }

  const addBonus = (stat: string) => {
    return sendCommand({
      type: 'cmd',
      cmd: 'add_bonus',
      data: { stat },
    })
  }

  const swapStats = (stat1: string, stat2: string) => {
    return sendCommand({
      type: 'cmd',
      cmd: 'swap_stats',
      data: { stat1, stat2 },
    })
  }

  const getHometowns = (raceId: number) => {
    return sendCommand({
      type: 'cmd',
      cmd: 'get_hometowns',
      data: { race: raceId },
    })
  }

  const validateName = (name: string) => {
    store.setChargenNameValidation(null, null) // Reset validation state
    return sendCommand({
      type: 'cmd',
      cmd: 'validate_name',
      data: { name },
    })
  }

  const createCharacter = (
    name: string,
    race: number,
    charClass: number,
    sex: number,
    alignment: string,
    hometown?: number,
    hardcore?: boolean,
    newbie?: boolean,
  ) => {
    const cmd = {
      type: 'cmd',
      cmd: 'create_character',
      data: {
        name,
        race,
        class: charClass,
        sex,
        alignment,
        hometown: hometown ?? -1,
        hardcore: hardcore ?? false,
        newbie: newbie ?? true,
      },
    }
    console.log('[MUD] Sending create_character:', JSON.stringify(cmd))
    store.setChargenLoading(true)
    store.setChargenError(null)
    return sendCommand(cmd as any)
  }

  const enterWorld = (characterName: string) => {
    return sendCommand({
      type: 'cmd',
      cmd: 'enter',
      data: { character: characterName },
    })
  }

  const sendGameCommand = (command: string) => {
    // Track when command sent for latency measurement
    lastCommandSentAt = performance.now()
    return sendCommand({
      type: 'cmd',
      cmd: 'game',
      data: command,
    })
  }

  // Convenience movement commands
  const move = (direction: string) => {
    return sendGameCommand(direction)
  }

  // ==========================================================================
  // Account Menu Commands
  // ==========================================================================

  const getAccountInfo = () => {
    return sendCommand({
      type: 'cmd',
      cmd: 'account_info',
    })
  }

  const changeEmail = (newEmail: string) => {
    return sendCommand({
      type: 'cmd',
      cmd: 'change_email',
      data: { newEmail },
    })
  }

  const changePassword = (currentPassword: string, newPassword: string) => {
    return sendCommand({
      type: 'cmd',
      cmd: 'change_password',
      data: { currentPassword, newPassword },
    })
  }

  const deleteCharacter = (name: string, confirm: boolean = true) => {
    return sendCommand({
      type: 'cmd',
      cmd: 'delete_character',
      data: { name, confirm },
    })
  }

  const getRestedBonus = () => {
    return sendCommand({
      type: 'cmd',
      cmd: 'rested_bonus',
    })
  }

  const logout = () => {
    return sendCommand({
      type: 'cmd',
      cmd: 'logout',
    })
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  // Clean up on unmount
  onUnmounted(() => {
    // Don't disconnect on unmount - keep connection alive across views
    // disconnect() would be called here if we wanted to close on unmount
  })

  return {
    // Connection
    connect,
    disconnect,

    // Commands
    sendCommand,
    login,
    register,
    requestChargenOptions,
    rollStats,
    addBonus,
    swapStats,
    getHometowns,
    validateName,
    createCharacter,
    enterWorld,
    sendGameCommand,
    move,

    // Account menu commands
    getAccountInfo,
    changeEmail,
    changePassword,
    deleteCharacter,
    getRestedBonus,
    logout,

    // State (from store)
    get isConnected() {
      return store.isConnected
    },
    get connectionState() {
      return store.connectionState
    },
    get connectionError() {
      return store.connectionError
    },
  }
}
