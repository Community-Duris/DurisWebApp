import type { ChatPresentation } from '../utils/chatPresentation.js'
// MUD Client TypeScript Types
// Based on WebSocket PRD Protocol Specification

// =============================================================================
// Connection States
// =============================================================================

export type MudConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'authenticating'
  | 'authenticated'
  | 'in_game'
  | 'error'

// =============================================================================
// Client -> Server Commands
// =============================================================================

export interface MudCommandBase {
  type: 'cmd'
}

export interface MudLoginCommand extends MudCommandBase {
  cmd: 'login'
  data: {
    account: string
    password: string
  }
}

export interface MudRegisterCommand extends MudCommandBase {
  cmd: 'register'
  data: {
    account: string
    password: string
    email: string
  }
}

export interface MudChargenOptionsCommand extends MudCommandBase {
  cmd: 'chargen_options'
}

export interface MudRollStatsCommand extends MudCommandBase {
  cmd: 'roll_stats'
  data: {
    race: number
  }
}

export interface MudAddBonusCommand extends MudCommandBase {
  cmd: 'add_bonus'
  data: {
    stat: string
  }
}

export interface MudCreateCharacterCommand extends MudCommandBase {
  cmd: 'create_character'
  data: {
    name: string
    race: number
    class: number
    sex: number
    alignment: string
    // Stats are stored server-side in the descriptor
  }
}

export interface MudEnterCommand extends MudCommandBase {
  cmd: 'enter'
  data: {
    character: string
  }
}

export interface MudGameCommand extends MudCommandBase {
  cmd: 'game'
  data: string
}

export interface MudGetHometownsCommand extends MudCommandBase {
  cmd: 'get_hometowns'
  data: {
    race: number
  }
}

export interface MudValidateNameCommand extends MudCommandBase {
  cmd: 'validate_name'
  data: {
    name: string
  }
}

export interface MudSwapStatsCommand extends MudCommandBase {
  cmd: 'swap_stats'
  data: {
    stat1: string
    stat2: string
  }
}

// Account Menu Commands
export interface MudAccountInfoCommand extends MudCommandBase {
  cmd: 'account_info'
}

export interface MudChangeEmailCommand extends MudCommandBase {
  cmd: 'change_email'
  data: {
    newEmail: string
  }
}

export interface MudChangePasswordCommand extends MudCommandBase {
  cmd: 'change_password'
  data: {
    currentPassword: string
    newPassword: string
  }
}

export interface MudDeleteCharacterCommand extends MudCommandBase {
  cmd: 'delete_character'
  data: {
    name: string
    confirm: boolean
  }
}

export interface MudRestedBonusCommand extends MudCommandBase {
  cmd: 'rested_bonus'
}

export interface MudLogoutCommand extends MudCommandBase {
  cmd: 'logout'
}

export type MudClientCommand =
  | MudLoginCommand
  | MudRegisterCommand
  | MudChargenOptionsCommand
  | MudRollStatsCommand
  | MudAddBonusCommand
  | MudSwapStatsCommand
  | MudCreateCharacterCommand
  | MudEnterCommand
  | MudGameCommand
  | MudGetHometownsCommand
  | MudValidateNameCommand
  | MudAccountInfoCommand
  | MudChangeEmailCommand
  | MudChangePasswordCommand
  | MudDeleteCharacterCommand
  | MudRestedBonusCommand
  | MudLogoutCommand

// =============================================================================
// Server -> Client Messages
// =============================================================================

// Auth Response
export interface MudAuthSuccessMessage {
  type: 'auth'
  status: 'success' | 'registered'
  data: {
    account: string
    characters: MudCharacterInfo[]
  }
}

export interface MudAuthReconnectedMessage {
  type: 'auth'
  status: 'reconnected'
  data: {
    account: string
    character: {
      name: string
      level: number
      race: string
      class: string
    }
  }
}

export interface MudAuthFailedMessage {
  type: 'auth'
  status: 'failed'
  error: string
}

export type MudAuthMessage =
  | MudAuthSuccessMessage
  | MudAuthReconnectedMessage
  | MudAuthFailedMessage

// =============================================================================
// Account Menu Messages (Server -> Client)
// =============================================================================

// Extended character info for account menu
export interface MudAccountCharacterInfo extends MudCharacterInfo {
  lastPlayed?: string
}

// Account info response
export interface MudAccountInfo {
  name: string
  email: string
  created: string
  lastLogin: string
  totalPlaytime: number // seconds
  immortalLevel: number
  characters: MudAccountCharacterInfo[]
}

// Rested bonus for a character
export interface MudRestedBonusCharacter {
  name: string
  restedPercent: number
  restedHours: number
  maxHours: number
}

// Rested bonus response
export interface MudRestedBonus {
  characters: MudRestedBonusCharacter[]
}

// Account action messages
export interface MudAccountInfoMessage {
  type: 'account'
  action: 'info'
  data: MudAccountInfo
}

export interface MudAccountEmailChangedMessage {
  type: 'account'
  action: 'email_changed'
  data: {
    email: string
  }
}

export interface MudAccountPasswordChangedMessage {
  type: 'account'
  action: 'password_changed'
}

export interface MudAccountCharacterDeletedMessage {
  type: 'account'
  action: 'character_deleted'
  data: {
    name: string
    characters: MudCharacterInfo[]
  }
}

export interface MudAccountRestedBonusMessage {
  type: 'account'
  action: 'rested_bonus'
  data: MudRestedBonus
}

export interface MudAccountReturnToMenuMessage {
  type: 'account'
  action: 'return_to_menu'
  reason: 'rent' | 'death' | 'quit' | 'suicide'
  data: {
    characters: MudCharacterInfo[]
  }
}

export interface MudAccountLoggedOutMessage {
  type: 'account'
  action: 'logged_out'
}

export interface MudAccountErrorMessage {
  type: 'account'
  action: 'error'
  error: string
}

export type MudAccountMessage =
  | MudAccountInfoMessage
  | MudAccountEmailChangedMessage
  | MudAccountPasswordChangedMessage
  | MudAccountCharacterDeletedMessage
  | MudAccountRestedBonusMessage
  | MudAccountReturnToMenuMessage
  | MudAccountLoggedOutMessage
  | MudAccountErrorMessage

// Character Generation
export interface MudChargenOptionsMessage {
  type: 'chargen_options'
  races: MudRace[]
}

// Stats as quality labels (not numbers - to prevent cheating via GMCP inspection)
export interface MudStatLabels {
  [key: string]: string // Allow string indexing
  str: string
  dex: string
  agi: string
  con: string
  pow: string
  int: string
  wis: string
  cha: string
  luk: string // Luck - swappable
  kar: string // Karma/Unused - not swappable
}

export interface MudChargenStatsMessage {
  type: 'roll_stats'
  stats: MudStatLabels
  bonusRemaining: number
}

export interface MudChargenBonusMessage {
  type: 'bonus_added'
  stats: MudStatLabels
  bonusRemaining: number
  boostedStat: string
}

export interface MudChargenSwappedMessage {
  type: 'stats_swapped'
  stats: MudStatLabels
  swapped1: string
  swapped2: string
}

export interface MudChargenCompleteMessage {
  type: 'create_character'
  status: 'validated' | 'created' | 'error'
  message: string
  name?: string
  race?: string
  class?: string
  faction?: 'good' | 'evil'
  hardcore?: boolean
  newbie?: boolean
  hometown?: string
}

// Hometown for character creation
export interface MudHometown {
  id: number
  name: string
}

export interface MudHometownsMessage {
  type: 'hometowns'
  options: MudHometown[]
  hasChoice: boolean
}

export interface MudValidateNameMessage {
  type: 'validate_name'
  valid: boolean
  message: string
}

export type MudChargenMessage =
  | MudChargenOptionsMessage
  | MudChargenStatsMessage
  | MudChargenBonusMessage
  | MudChargenSwappedMessage
  | MudChargenCompleteMessage
  | MudHometownsMessage
  | MudValidateNameMessage

// Room entity types
export interface RoomPlayer {
  name: string
}

export interface RoomNpc {
  name: string
  colored_name?: string
  vnum: number
  keyword?: string
  fighting?: string
}

export interface RoomItem {
  name: string
  colored_name?: string
  vnum: number
}

// GMCP Messages
export interface MudGmcpRoomInfo {
  type: 'gmcp'
  package: 'Room.Info'
  data: {
    vnum: number
    name: string
    description: string
    area: string
    zoneNumber: number
    terrain: string
    x: number
    y: number
    z: number
    section: number
    exits: Record<string, MudExit>
    players: RoomPlayer[]
    npcs: RoomNpc[]
    items: RoomItem[]
  }
}

export interface MudGmcpRoomMap {
  type: 'gmcp'
  package: 'Room.Map'
  data: {
    map: string
  }
}

export interface MudGmcpCharVitals {
  type: 'gmcp'
  package: 'Char.Vitals'
  data: {
    hp: number
    maxHp: number
    mana: number
    maxMana: number
    move: number
    maxMove: number
    exp: number
    tnl: number
    gold: number
    position: string
    fighting: string | null
  }
}

export interface MudGmcpCharStatus {
  type: 'gmcp'
  package: 'Char.Status'
  data: {
    name: string
    level: number
    class: string
    class2?: string // Secondary class for dual-class characters
    race: string
    alignment: string
    guild: string
    title: string
  }
}

export interface MudGmcpCharAffects {
  type: 'gmcp'
  package: 'Char.Affects'
  data: MudAffect[]
}

export interface MudGmcpCombatUpdate {
  type: 'gmcp'
  package: 'Combat.Update'
  data: {
    target: {
      name: string
      health: string
      healthPercent: number
      position: string
    }
    round: {
      attacker: string
      damage: number
      damageType: string
      critical: boolean
      message: string
    }
  }
}

export interface MudGmcpCommChannel {
  type: 'gmcp'
  package: 'Comm.Channel'
  data: {
    channel: string
    sender: string
    text: string
    presentation?: unknown
    timestamp: number
    /** Racewar alignment for nchat (good, evil, undead, neutral) */
    alignment?: 'good' | 'evil' | 'undead' | 'neutral'
  }
}

export interface MudGmcpQuestStatus {
  type: 'gmcp'
  package: 'Quest.Status'
  data: {
    active: boolean
    type: 'ask' | 'kill' | null
    target: string
    remaining: number
    killCount?: number
    killRequired?: number
    mapBought?: boolean
    zoneNumber?: number
  }
}

export interface MudGmcpQuestMap {
  type: 'gmcp'
  package: 'Quest.Map'
  data: {
    map: string
    zoneNumber: number
  }
}

// Group member in Group.Status GMCP message
export interface MudGroupMember {
  name: string
  level: number
  class: string | null
  race: string | null
  hp: number
  maxHp: number
  move: number
  maxMove: number
  position: string
  rank: 'head' | 'front' | 'back'
  isNpc: boolean
  inRoom: boolean
  targetNum: number | null // For NPCs: LIFO number (1 = most recent in room)
  targetKeyword: string | null // For NPCs: first keyword (e.g., "orc")
}

// Group status from GMCP
export interface MudGroupStatus {
  members: MudGroupMember[]
  size: number
  maxSize: number
}

export interface MudGmcpGroupStatus {
  type: 'gmcp'
  package: 'Group.Status'
  data: MudGroupStatus
}

// Ship contact in Ship.Contacts GMCP message
export interface MudShipContact {
  id: string // 2-letter identifier (e.g., "AB")
  name: string // Ship name
  x: number // X coordinate
  y: number // Y coordinate
  range: number // Distance in nautical miles
  bearing: number // Bearing in degrees (0-359)
  heading: number // Ship's heading in degrees
  speed: number // Ship's speed
  arc: string // Firing arc (e.g., "FB" for full broadside)
  race: 'good' | 'evil' | 'undead' | 'squid' | 'unknown'
  status: 'flying' | 'sinking' | 'docked' | 'anchored' | ''
  targeting_you: boolean // Is this ship targeting you?
  you_targeting: boolean // Are you targeting this ship?
}

// Ship contacts data from GMCP
export interface MudShipContacts {
  heading: number // Your ship's heading
  speed: number // Your ship's speed
  contacts: MudShipContact[] // List of nearby ships
  worldX?: number // World X coordinate (verified clients only)
  worldY?: number // World Y coordinate (verified clients only)
}

export interface MudGmcpShipContacts {
  type: 'gmcp'
  package: 'Ship.Contacts'
  data: MudShipContacts
}

// Ship info data from GMCP (static/slow-changing ship data)
export interface MudShipInfo {
  name: string
  id: string
  captain: string
  class: number
  frags: number
  status: string // ANSI-encoded status like "&+yUNDOCKED&N"
  maxSpeed: number
  contactRange: number // Detection range (35 + crew modifier)
  sail: number
  maxSail: number
  crewStamina: number
  maxCrewStamina: number
  repairStock: number
  crewType: string // ANSI-encoded crew type name
  chiefs: {
    sail: string // ANSI-encoded sailing chief name (empty if none)
    guns: string // ANSI-encoded gunnery chief name (empty if none)
    repair: string // ANSI-encoded repair chief name (empty if none)
  }
  skills: {
    sail: number // Deck/sailing skill level
    guns: number // Gunnery skill level
    repair: number // Repair skill level
  }
  skillMods: {
    sail: number // Sail skill modifier (from crew type + chief)
    guns: number // Guns skill modifier (from crew type + chief)
    repair: number // Repair skill modifier (from crew type + chief)
  }
  people: number
  maxPeople: number
  armor: {
    bow: [number, number]
    port: [number, number]
    stern: [number, number]
    starboard: [number, number]
  }
  internal: {
    bow: [number, number]
    port: [number, number]
    stern: [number, number]
    starboard: [number, number]
  }
  weapons: Array<{
    slot: number
    name: string
    position: 'bow' | 'port' | 'stern' | 'starboard'
    ammo: number
    maxAmmo: number
    damage: number
    ready: boolean
  }>
  equipment: Array<{
    slot: number
    name: string // ANSI-encoded equipment name
    ready: boolean
  }>
  cargo: {
    current: number
    max: number
    items: Array<{
      slot: number
      name: string
      crates: number
      invoicePrice: number
      contraband: boolean
    }>
  }
}

export interface MudGmcpShipInfo {
  type: 'gmcp'
  package: 'Ship.Info'
  data: MudShipInfo
}

export type MudGmcpMessage =
  | MudGmcpRoomInfo
  | MudGmcpRoomMap
  | MudGmcpCharVitals
  | MudGmcpCharStatus
  | MudGmcpCharAffects
  | MudGmcpCombatUpdate
  | MudGmcpCommChannel
  | MudGmcpQuestStatus
  | MudGmcpQuestMap
  | MudGmcpGroupStatus
  | MudGmcpShipContacts
  | MudGmcpShipInfo

// Text Messages
export interface MudTextMessage {
  type: 'text'
  category: 'combat' | 'movement' | 'info' | 'system' | 'channel'
  data: string
}

// System Messages (connection status, welcome, etc.)
export interface MudSystemMessage {
  type: 'system'
  data: {
    status: string
    message: string
  }
}

// Pong Message (response to ping for latency measurement)
export interface MudPongMessage {
  type: 'pong'
}

// All Server Messages
export type MudServerMessage =
  | MudAuthMessage
  | MudAccountMessage
  | MudChargenMessage
  | MudGmcpMessage
  | MudTextMessage
  | MudSystemMessage
  | MudPongMessage

// =============================================================================
// Game Data Types
// =============================================================================

export interface MudStats {
  str: number
  dex: number
  agi: number
  con: number
  pow: number
  int: number
  wis: number
  cha: number
}

export interface MudCharacterInfo {
  name: string
  class: string
  level: number
  race: string
  secondaryClass?: string
  secondaryLevel?: number
  lastRoom?: string
}

export interface MudChargenClass {
  id: number
  name: string
  ansi: string
  alignment: 'good' | 'evil' | 'neutral' | 'any' | 'good_neutral' | 'neutral_evil'
}

export interface MudRace {
  id: number
  name: string
  ansi: string
  faction: 'good' | 'evil' | 'neutral'
  classes: MudChargenClass[]
}

export interface MudClass {
  id: string
  name: string
  description: string
  alignments: ('good' | 'neutral' | 'evil')[]
  primaryStat: keyof MudStats
  races: string[]
}

export interface MudExit {
  vnum: number
  name?: string
  door?: string
  closed?: boolean
  locked?: boolean
}

export interface MudAffect {
  name: string
  duration: number // Duration in seconds from server
  icon: string
  receivedAt: number // Timestamp when this affect was received (for countdown)
}

// =============================================================================
// UI State Types
// =============================================================================

export interface MudRoom {
  vnum: number
  name: string
  colored_name?: string
  description: string
  area: string
  colored_area?: string
  zoneNumber: number
  terrain: string
  x: number
  y: number
  z: number
  section: number
  exits: Record<string, MudExit>
  players: RoomPlayer[]
  npcs: RoomNpc[]
  items: RoomItem[]
}

export interface MudVitals {
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  move: number
  maxMove: number
  exp: number
  tnl: number
  platinum: number
  gold: number
  silver: number
  copper: number
  position: string
  fighting: string | null
  usesMana: boolean
}

export interface MudCharacter {
  name: string
  level: number
  class: string
  class2?: string // Secondary class for dual-class characters
  race: string
  alignment: string
  guild: string
  title: string
}

export interface MudQuest {
  active: boolean
  type: 'ask' | 'kill' | null
  target: string
  remaining: number
  killCount?: number
  killRequired?: number
  mapBought?: boolean
  zoneNumber?: number
}

export interface MudLogEntry {
  id: number
  timestamp: Date
  category: 'combat' | 'movement' | 'info' | 'system' | 'channel'
  text: string
  /** CSS class for trigger highlight (e.g., "bg-red-900/60 text-red-100") */
  highlightClass?: string
}

export interface MudChatMessage {
  id: number
  timestamp: Date
  channel: string
  sender: string
  presentation?: ChatPresentation
  text: string
  /** CSS class for trigger highlight */
  highlightClass?: string
  /** Racewar alignment for nchat (good, evil, undead, neutral) */
  alignment?: 'good' | 'evil' | 'undead' | 'neutral'
}

export type MudDirection =
  | 'north'
  | 'east'
  | 'south'
  | 'west'
  | 'up'
  | 'down'
  | 'northeast'
  | 'northwest'
  | 'southeast'
  | 'southwest'

export const MUD_DIRECTIONS: MudDirection[] = [
  'north',
  'east',
  'south',
  'west',
  'up',
  'down',
  'northeast',
  'northwest',
  'southeast',
  'southwest',
]

export const MUD_DIRECTION_SHORTCUTS: Record<MudDirection, string> = {
  north: 'n',
  east: 'e',
  south: 's',
  west: 'w',
  up: 'u',
  down: 'd',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
}
