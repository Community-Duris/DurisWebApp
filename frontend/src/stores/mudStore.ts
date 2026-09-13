import { parseChatPresentation } from '../utils/chatPresentation.js'
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  MudConnectionState,
  MudCharacterInfo,
  MudRoom,
  MudVitals,
  MudCharacter,
  MudAffect,
  MudLogEntry,
  MudChatMessage,
  MudRace,
  MudClass,
  MudQuest,
  MudStatLabels,
  MudAccountInfo,
  MudRestedBonus,
  MudGroupStatus,
  MudShipContacts,
  MudShipInfo,
} from '@/types/mud'

export const useMudStore = defineStore('mud', () => {
  // ==========================================================================
  // Connection State
  // ==========================================================================
  const connectionState = ref<MudConnectionState>('disconnected')
  const connectionError = ref<string | null>(null)
  const latency = ref<number | null>(null) // WebSocket latency in ms
  const autoLoginInProgress = ref(false) // True when auto-login is in progress
  const copyoverInProgress = ref(false) // True during server copyover (hotboot)
  const copyoverMessage = ref<string | null>(null) // Message to show during copyover
  const copyoverCharacterName = ref<string | null>(null) // Character to auto-enter after copyover

  // ==========================================================================
  // Account & Authentication
  // ==========================================================================
  const account = ref<string | null>(null)
  const characters = ref<MudCharacterInfo[]>([])
  const selectedCharacter = ref<string | null>(null)

  // ==========================================================================
  // Account Menu State
  // ==========================================================================
  const showAccountMenu = ref(false)
  const showReturnDialog = ref(false) // Dialog shown on death/rent/quit
  const accountMenuReason = ref<'rent' | 'death' | 'quit' | 'suicide' | null>(null)
  const accountInfo = ref<MudAccountInfo | null>(null)
  const restedBonus = ref<MudRestedBonus | null>(null)
  const showReconnectDialog = ref(false)
  const accountError = ref<string | null>(null)

  // ==========================================================================
  // Active Character Data
  // ==========================================================================
  const character = ref<MudCharacter | null>(null)
  const vitals = ref<MudVitals>({
    hp: 0,
    maxHp: 0,
    mana: 0,
    maxMana: 0,
    move: 0,
    maxMove: 0,
    exp: 0,
    tnl: 0,
    platinum: 0,
    gold: 0,
    silver: 0,
    copper: 0,
    position: 'standing',
    fighting: null,
    usesMana: false,
  })
  const affects = ref<MudAffect[]>([])

  // ==========================================================================
  // Current Room
  // ==========================================================================
  const room = ref<MudRoom | null>(null)

  // ==========================================================================
  // Map Data
  // ==========================================================================
  const visitedRooms = ref<Map<number, MudRoom>>(new Map())
  const currentZoneNumber = ref<number | null>(null)
  const currentSection = ref<number>(0)

  // Wilderness ASCII map (from MUD's <map>...</map> tags)
  const wildernessMap = ref<string | null>(null)

  // ==========================================================================
  // Combat
  // ==========================================================================
  const combatTarget = ref<{
    name: string
    health: string
    healthPercent: number
    position: string
  } | null>(null)

  // ==========================================================================
  // Quest
  // ==========================================================================
  const quest = ref<MudQuest | null>(null)
  const questMap = ref<string | null>(null)
  const QUEST_MAP_CACHE_KEY = 'duris_quest_map'

  // ==========================================================================
  // Group
  // ==========================================================================
  const group = ref<MudGroupStatus | null>(null)

  // ==========================================================================
  // Ship Contacts
  // ==========================================================================
  const shipContacts = ref<MudShipContacts | null>(null)

  // ==========================================================================
  // Ship Info (static/slow-changing ship data)
  // ==========================================================================
  const shipInfo = ref<MudShipInfo | null>(null)

  // ==========================================================================
  // Speedwalk
  // ==========================================================================
  const isSpeedwalking = ref(false)
  const speedwalkStepsRemaining = ref(0)
  const speedwalkTarget = ref('')
  let speedwalkAbortFn: (() => void) | null = null

  // ==========================================================================
  // Activity Log
  // ==========================================================================
  const activityLog = ref<MudLogEntry[]>([])
  const maxLogEntries = 1000
  let logIdCounter = 0

  // ==========================================================================
  // Chat Channels
  // ==========================================================================
  const chatMessages = ref<Record<string, MudChatMessage[]>>({})
  const activeChannels = ref<string[]>(['gossip', 'auction', 'guild'])
  let chatIdCounter = 0

  // ==========================================================================
  // Character Creation State
  // ==========================================================================
  const chargenRaces = ref<MudRace[]>([])
  const chargenClasses = ref<MudClass[]>([])
  const chargenStats = ref<{
    stats: MudStatLabels // Quality labels only (e.g., "excellent", "good")
    bonusRemaining: number
  } | null>(null)
  const chargenLoading = ref(false)
  const chargenError = ref<string | null>(null)
  const chargenHometowns = ref<{ id: number; name: string }[]>([])
  const chargenHasHometownChoice = ref(false)
  const chargenNameValid = ref<boolean | null>(null)
  const chargenNameMessage = ref<string | null>(null)

  // ==========================================================================
  // Computed Properties
  // ==========================================================================
  const isConnected = computed(
    () => connectionState.value !== 'disconnected' && connectionState.value !== 'error',
  )

  const isAuthenticated = computed(
    () => connectionState.value === 'authenticated' || connectionState.value === 'in_game',
  )

  const isInGame = computed(() => connectionState.value === 'in_game')

  const hpPercent = computed(() => {
    if (vitals.value.maxHp === 0) return 0
    return Math.min(100, Math.round((vitals.value.hp / vitals.value.maxHp) * 100))
  })

  const manaPercent = computed(() => {
    if (vitals.value.maxMana === 0) return 0
    return Math.min(100, Math.round((vitals.value.mana / vitals.value.maxMana) * 100))
  })

  const movePercent = computed(() => {
    if (vitals.value.maxMove === 0) return 0
    return Math.min(100, Math.round((vitals.value.move / vitals.value.maxMove) * 100))
  })

  const expPercent = computed(() => {
    if (vitals.value.tnl === 0) return 0
    const totalForLevel = vitals.value.exp + vitals.value.tnl
    return Math.min(100, Math.round((vitals.value.exp / totalForLevel) * 100))
  })

  const isFighting = computed(() => vitals.value.fighting !== null)

  // ==========================================================================
  // Actions
  // ==========================================================================

  function setConnectionState(state: MudConnectionState, error?: string) {
    connectionState.value = state
    connectionError.value = error ?? null
    // Clear auto-login flag when auth succeeds or fails
    if (state === 'authenticated' || state === 'error' || state === 'disconnected') {
      autoLoginInProgress.value = false
    }
  }

  function setAutoLoginInProgress(inProgress: boolean) {
    autoLoginInProgress.value = inProgress
  }

  function setCopyoverInProgress(inProgress: boolean, message?: string) {
    copyoverInProgress.value = inProgress
    copyoverMessage.value = message ?? null
    // save current character name for auto-enter after reconnect
    if (inProgress && character.value?.name) {
      copyoverCharacterName.value = character.value.name
    }
  }

  function clearCopyoverState() {
    copyoverInProgress.value = false
    copyoverMessage.value = null
    copyoverCharacterName.value = null
  }

  function setLatency(ms: number | null) {
    latency.value = ms
  }

  function setAccount(accountName: string, chars: MudCharacterInfo[]) {
    account.value = accountName
    characters.value = chars
    connectionState.value = 'authenticated'
    autoLoginInProgress.value = false // Clear auto-login flag
  }

  function clearAccount() {
    account.value = null
    characters.value = []
    selectedCharacter.value = null
    character.value = null
    connectionState.value = 'connected'
    autoLoginInProgress.value = false
  }

  function setCharacter(char: MudCharacter) {
    character.value = char
    selectedCharacter.value = char.name
    connectionState.value = 'in_game'
    autoLoginInProgress.value = false
  }

  function updateVitals(newVitals: Partial<MudVitals>) {
    vitals.value = { ...vitals.value, ...newVitals }
  }

  function setRoom(newRoom: MudRoom) {
    room.value = newRoom
    // Store in visited rooms map
    visitedRooms.value.set(newRoom.vnum, newRoom)
    currentZoneNumber.value = newRoom.zoneNumber
    currentSection.value = newRoom.section
  }

  function setWildernessMap(map: string | null) {
    wildernessMap.value = map
  }

  function setAffects(newAffects: Omit<MudAffect, 'receivedAt'>[]) {
    const now = Date.now()

    // Build a map of existing affects by name for quick lookup
    const existingMap = new Map<string, MudAffect>()
    for (const a of affects.value) {
      existingMap.set(a.name, a)
    }

    // Only update if affects actually changed
    const newNames = newAffects
      .map((a) => a.name)
      .sort()
      .join(',')
    const oldNames = affects.value
      .map((a) => a.name)
      .sort()
      .join(',')
    if (newNames === oldNames) {
      // Same affects, don't update (preserves receivedAt for timers)
      return
    }

    // Map new affects, preserving receivedAt for existing ones
    affects.value = newAffects.map((a) => {
      const existing = existingMap.get(a.name)
      if (existing && existing.duration === a.duration) {
        // Same affect with same duration, preserve receivedAt
        return existing
      }
      // New affect or duration changed, set new receivedAt
      return {
        ...a,
        receivedAt: now,
      }
    })
  }

  function setCombatTarget(
    target: { name: string; health: string; healthPercent: number; position: string } | null,
  ) {
    combatTarget.value = target
  }

  function updateQuest(newQuest: MudQuest) {
    quest.value = newQuest
    // Clear cache if quest changed or no longer active
    if (!newQuest.active || !newQuest.mapBought) {
      clearQuestMapCache()
    }
  }

  function setQuestMap(map: string | null, zoneNumber?: number) {
    questMap.value = map
    // Cache to localStorage with zone identifier
    if (map && zoneNumber) {
      localStorage.setItem(
        QUEST_MAP_CACHE_KEY,
        JSON.stringify({
          map,
          zoneNumber,
          timestamp: Date.now(),
        }),
      )
    }
  }

  function loadCachedQuestMap(zoneNumber: number): boolean {
    const cached = localStorage.getItem(QUEST_MAP_CACHE_KEY)
    if (cached) {
      try {
        const data = JSON.parse(cached)
        // Only use cache if same zone
        if (data.zoneNumber === zoneNumber) {
          questMap.value = data.map
          return true
        }
      } catch {
        // Invalid cache, ignore
      }
    }
    return false
  }

  function clearQuestMapCache() {
    questMap.value = null
    localStorage.removeItem(QUEST_MAP_CACHE_KEY)
  }

  function setGroup(groupData: MudGroupStatus | null) {
    group.value = groupData
  }

  function clearGroup() {
    group.value = null
  }

  function setShipContacts(data: MudShipContacts | null) {
    shipContacts.value = data
  }

  function updateShipHeading(heading: number) {
    if (shipContacts.value) {
      shipContacts.value.heading = heading
    } else {
      shipContacts.value = { heading, speed: 0, contacts: [] }
    }
  }

  function updateShipSpeed(speed: number) {
    if (shipContacts.value) {
      shipContacts.value.speed = speed
    } else {
      shipContacts.value = { heading: 0, speed, contacts: [] }
    }
  }

  function clearShipContacts() {
    shipContacts.value = null
  }

  function setShipInfo(data: MudShipInfo | null) {
    shipInfo.value = data
  }

  function clearShipInfo() {
    shipInfo.value = null
  }

  function startSpeedwalk(target: string, steps: number, abortFn: () => void) {
    isSpeedwalking.value = true
    speedwalkTarget.value = target
    speedwalkStepsRemaining.value = steps
    speedwalkAbortFn = abortFn
  }

  function updateSpeedwalkSteps(steps: number) {
    speedwalkStepsRemaining.value = steps
  }

  function stopSpeedwalk() {
    if (speedwalkAbortFn) {
      addLogEntry('system', 'Speedwalk stopped.')
      speedwalkAbortFn()
      speedwalkAbortFn = null
    }
    isSpeedwalking.value = false
    speedwalkStepsRemaining.value = 0
    speedwalkTarget.value = ''
  }

  function clearSpeedwalk() {
    isSpeedwalking.value = false
    speedwalkStepsRemaining.value = 0
    speedwalkTarget.value = ''
    speedwalkAbortFn = null
  }

  function addLogEntry(category: MudLogEntry['category'], text: string, highlightClass?: string) {
    const entry: MudLogEntry = {
      id: ++logIdCounter,
      timestamp: new Date(),
      category,
      text,
      highlightClass,
    }
    activityLog.value.push(entry)

    // Trim old entries if exceeding max (use splice to mutate in place for better reactivity)
    if (activityLog.value.length > maxLogEntries) {
      activityLog.value.splice(0, activityLog.value.length - maxLogEntries)
    }
  }

  function clearLog() {
    activityLog.value = []
  }

  function addChatMessage(
    channel: string,
    sender: string,
    text: string,
    highlightClass?: string,
    alignment?: 'good' | 'evil' | 'undead' | 'neutral',
    presentation?: unknown,
  ) {
    const message: MudChatMessage = {
      presentation: parseChatPresentation(presentation, channel),
      id: ++chatIdCounter,
      timestamp: new Date(),
      channel,
      sender,
      text,
      highlightClass,
      alignment,
    }

    if (!chatMessages.value[channel]) {
      chatMessages.value[channel] = []
    }
    chatMessages.value[channel].push(message)

    // Trim old messages per channel (use splice to mutate in place)
    if (chatMessages.value[channel].length > 500) {
      chatMessages.value[channel].splice(0, chatMessages.value[channel].length - 500)
    }
  }

  function clearChatChannel(channel?: string) {
    if (channel && channel !== 'all') {
      // Clear specific channel - use splice to maintain reactivity
      if (chatMessages.value[channel]) {
        chatMessages.value[channel].splice(0, chatMessages.value[channel].length)
      }
    } else {
      // Clear all channels
      Object.keys(chatMessages.value).forEach((key) => {
        const messages = chatMessages.value[key]
        if (messages) {
          messages.splice(0, messages.length)
        }
      })
    }
  }

  function setChargenOptions(races: MudRace[]) {
    chargenRaces.value = races
    chargenLoading.value = false
    chargenError.value = null
  }

  function setChargenStats(stats: MudStatLabels, bonusRemaining: number) {
    chargenStats.value = { stats, bonusRemaining }
    chargenLoading.value = false
  }

  function updateChargenBonus(stats: MudStatLabels, bonusRemaining: number) {
    if (chargenStats.value) {
      chargenStats.value = { stats, bonusRemaining }
    }
  }

  function setChargenLoading(loading: boolean) {
    chargenLoading.value = loading
  }

  function setChargenError(error: string | null) {
    chargenError.value = error
    chargenLoading.value = false
  }

  function setChargenHometowns(options: { id: number; name: string }[], hasChoice: boolean) {
    chargenHometowns.value = options
    chargenHasHometownChoice.value = hasChoice
    chargenLoading.value = false
  }

  function setChargenNameValidation(valid: boolean | null, message: string | null) {
    chargenNameValid.value = valid
    chargenNameMessage.value = message
  }

  function clearChargenState() {
    chargenRaces.value = []
    chargenClasses.value = []
    chargenStats.value = null
    chargenLoading.value = false
    chargenError.value = null
    chargenHometowns.value = []
    chargenHasHometownChoice.value = false
    chargenNameValid.value = null
    chargenNameMessage.value = null
  }

  // ==========================================================================
  // Account Menu Actions
  // ==========================================================================

  function openAccountMenu(reason?: 'rent' | 'death' | 'quit' | 'suicide') {
    showAccountMenu.value = true
    accountMenuReason.value = reason ?? null
    accountError.value = null
  }

  function closeAccountMenu() {
    showAccountMenu.value = false
    accountMenuReason.value = null
    accountError.value = null
  }

  function openReturnDialog(reason: 'rent' | 'death' | 'quit' | 'suicide') {
    showReturnDialog.value = true
    accountMenuReason.value = reason
  }

  function confirmReturnToMenu() {
    // User confirmed - transition to character select
    showReturnDialog.value = false
    connectionState.value = 'authenticated'
    autoLoginInProgress.value = false
    // Clear in-game state
    character.value = null
    vitals.value = {
      hp: 0,
      maxHp: 0,
      mana: 0,
      maxMana: 0,
      move: 0,
      maxMove: 0,
      exp: 0,
      tnl: 0,
      platinum: 0,
      gold: 0,
      silver: 0,
      copper: 0,
      position: 'standing',
      fighting: null,
      usesMana: false,
    }
    room.value = null
    combatTarget.value = null
    quest.value = null
  }

  function cancelReturnToMenu() {
    // User cancelled - just close dialog, stay on game view
    showReturnDialog.value = false
    accountMenuReason.value = null
  }

  function setAccountInfo(info: MudAccountInfo) {
    accountInfo.value = info
  }

  function setRestedBonus(bonus: MudRestedBonus) {
    restedBonus.value = bonus
  }

  function setAccountError(error: string | null) {
    accountError.value = error
  }

  function removeCharacter(name: string) {
    characters.value = characters.value.filter((c) => c.name !== name)
  }

  function updateCharacters(chars: MudCharacterInfo[]) {
    characters.value = chars
  }

  function openReconnectDialog() {
    showReconnectDialog.value = true
  }

  function closeReconnectDialog() {
    showReconnectDialog.value = false
  }

  function reset() {
    connectionState.value = 'disconnected'
    connectionError.value = null
    autoLoginInProgress.value = false
    copyoverInProgress.value = false
    copyoverMessage.value = null
    copyoverCharacterName.value = null
    account.value = null
    characters.value = []
    selectedCharacter.value = null
    character.value = null
    vitals.value = {
      hp: 0,
      maxHp: 0,
      mana: 0,
      maxMana: 0,
      move: 0,
      maxMove: 0,
      exp: 0,
      tnl: 0,
      platinum: 0,
      gold: 0,
      silver: 0,
      copper: 0,
      position: 'standing',
      fighting: null,
      usesMana: false,
    }
    affects.value = []
    room.value = null
    visitedRooms.value.clear()
    currentZoneNumber.value = null
    currentSection.value = 0
    combatTarget.value = null
    quest.value = null
    group.value = null
    activityLog.value = []
    chatMessages.value = {}
    // Reset account menu state
    showAccountMenu.value = false
    accountMenuReason.value = null
    accountInfo.value = null
    restedBonus.value = null
    showReconnectDialog.value = false
    accountError.value = null
    clearChargenState()
  }

  return {
    // State
    connectionState,
    connectionError,
    latency,
    autoLoginInProgress,
    copyoverInProgress,
    copyoverMessage,
    copyoverCharacterName,
    account,
    characters,
    selectedCharacter,
    character,
    vitals,
    affects,
    room,
    visitedRooms,
    currentZoneNumber,
    currentSection,
    combatTarget,
    quest,
    questMap,
    group,
    activityLog,
    chatMessages,
    activeChannels,
    chargenRaces,
    chargenClasses,
    chargenStats,
    chargenLoading,
    chargenError,
    chargenHometowns,
    chargenHasHometownChoice,
    chargenNameValid,
    chargenNameMessage,
    // Account menu state
    showAccountMenu,
    showReturnDialog,
    accountMenuReason,
    accountInfo,
    restedBonus,
    showReconnectDialog,
    accountError,

    // Computed
    isConnected,
    isAuthenticated,
    isInGame,
    hpPercent,
    manaPercent,
    movePercent,
    expPercent,
    isFighting,

    // Actions
    setConnectionState,
    setAutoLoginInProgress,
    setCopyoverInProgress,
    clearCopyoverState,
    setLatency,
    setAccount,
    clearAccount,
    setCharacter,
    updateVitals,
    setRoom,
    setWildernessMap,
    wildernessMap,
    setAffects,
    setCombatTarget,
    updateQuest,
    setQuestMap,
    loadCachedQuestMap,
    clearQuestMapCache,
    setGroup,
    clearGroup,
    // Ship contacts
    shipContacts,
    setShipContacts,
    updateShipHeading,
    updateShipSpeed,
    clearShipContacts,
    // Ship info
    shipInfo,
    setShipInfo,
    clearShipInfo,
    // Speedwalk state
    isSpeedwalking,
    speedwalkStepsRemaining,
    speedwalkTarget,
    startSpeedwalk,
    updateSpeedwalkSteps,
    stopSpeedwalk,
    clearSpeedwalk,
    addLogEntry,
    clearLog,
    addChatMessage,
    clearChatChannel,
    setChargenOptions,
    setChargenStats,
    updateChargenBonus,
    setChargenLoading,
    setChargenError,
    setChargenHometowns,
    setChargenNameValidation,
    clearChargenState,
    // Account menu actions
    openAccountMenu,
    closeAccountMenu,
    openReturnDialog,
    confirmReturnToMenu,
    cancelReturnToMenu,
    setAccountInfo,
    setRestedBonus,
    setAccountError,
    removeCharacter,
    updateCharacters,
    openReconnectDialog,
    closeReconnectDialog,
    reset,
  }
})
