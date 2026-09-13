// Duris uses BGR bit order (blue=17, red=20), not ANSI SGR numeric order.
// Named CSS variables allow a client theme to replace colors without remapping IDs.
export const chatPalette = [
  ['black', '#000000'],
  ['blue', '#bd93f9'],
  ['green', '#50fa7b'],
  ['cyan', '#8be9fd'],
  ['red', '#ff5555'],
  ['magenta', '#ff79c6'],
  ['yellow', '#f1fa8c'],
  ['white', '#f8f8f2'],
  ['bright-black', '#6272a4'],
  ['bright-blue', '#d6acff'],
  ['bright-green', '#69ff94'],
  ['bright-cyan', '#a4ffff'],
  ['bright-red', '#ff6e6e'],
  ['bright-magenta', '#ff92df'],
  ['bright-yellow', '#ffffa5'],
  ['bright-white', '#ffffff'],
] as const

export function chatColor(id: number, background = false): string {
  const entry = chatPalette[id - 16]
  return entry
    ? `var(--mud-${entry[0]}, ${entry[1]})`
    : background
      ? 'var(--mud-background, #1a1a1a)'
      : 'var(--mud-foreground, #e0e0e0)'
}
