/** Version 1 snapshots describe one already rendered, recipient-approved line. */
export interface ChatPresentation {
  version: 1
  channelId: number
  channel: string
  policy: 'preserve' | 'static' | 'animated'
  text: string
  underline: boolean
  /** Half-open Unicode code point offsets, foreground and background IDs. */
  runs: [number, number, number, number][]
}

const channels: Record<string, readonly [number, string]> = {
  say: [11, 'chat.say'],
  tell: [12, 'chat.tell'],
  gcc: [18, 'chat.guild'],
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function color(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (value === 0 || (value >= 16 && value <= 31))
  )
}

/** Validate again at rendering so persisted browser history is not trusted. */
export function parseChatPresentation(
  value: unknown,
  legacyChannel: string,
): ChatPresentation | undefined {
  const expected = Object.prototype.hasOwnProperty.call(channels, legacyChannel)
    ? channels[legacyChannel]
    : undefined
  if (
    !expected ||
    !record(value) ||
    value.version !== 1 ||
    value.channelId !== expected[0] ||
    value.channel !== expected[1] ||
    (value.policy !== 'preserve' && value.policy !== 'static' && value.policy !== 'animated') ||
    typeof value.text !== 'string' ||
    value.text.length > 32768 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value.text) ||
    typeof value.underline !== 'boolean' ||
    !Array.isArray(value.runs) ||
    value.runs.length > 4096
  )
    return undefined

  const length = Array.from(value.text).length
  if (length > 16384) return undefined
  const runs: ChatPresentation['runs'] = []
  let offset = 0
  for (const run of value.runs) {
    if (
      !Array.isArray(run) ||
      run.length !== 4 ||
      run[0] !== offset ||
      !Number.isInteger(run[1]) ||
      run[1] <= offset ||
      run[1] > length ||
      !color(run[2]) ||
      !color(run[3])
    )
      return undefined
    runs.push([offset, run[1], run[2], run[3]])
    offset = run[1]
  }
  if (offset !== length) return undefined
  // Reconstruct validated fields; never copy arbitrary server properties/styles.
  return {
    version: 1,
    channelId: expected[0],
    channel: expected[1],
    policy:
      value.policy === 'animated' ? 'animated' : value.policy === 'static' ? 'static' : 'preserve',
    text: value.text,
    underline: value.underline,
    runs,
  }
}

/** Reject malformed legacy chat fields before triggers or rendering see them. */
export function validChatContent(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.channel === 'string' &&
    !['__proto__', 'constructor', 'prototype'].includes(value.channel) &&
    value.channel.length <= 64 &&
    typeof value.sender === 'string' &&
    value.sender.length <= 65536 &&
    typeof value.text === 'string' &&
    value.text.length <= 65536
  )
}
