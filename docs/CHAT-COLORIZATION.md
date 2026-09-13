# Recipient colors in web chat

This client implements [Duris server #288](https://github.com/Community-Duris/Duris/issues/288), tracked locally
by [#43](https://github.com/Community-Duris/DurisWebApp/issues/43). The authoritative wire contract is
[`STRUCTURED_CHAT_COLORIZATION.md`](https://github.com/Community-Duris/Duris/blob/master/docs/guides/STRUCTURED_CHAT_COLORIZATION.md)
in the server repository.

Players use server commands such as `toggle color tell brightcyan`, `toggle color gcc yellow`,
`toggle color preview say brightgreen`, and `toggle color reset all`. These are character preferences;
the browser does not keep a competing color setting. A preview does not save. Reconnect uses the saved
server choice. Existing characters and packets without a presentation snapshot keep the existing client layout.

Say, tell/reply and guild chat can carry a version 1 `presentation` snapshot. `parseChatPresentation`
validates its canonical channel pair, numeric palette IDs and contiguous Unicode code point runs. The full
line replaces the normal sender/body display once. The chat panel keeps its channel label and timestamp;
its formatted line can still open a direct chat. Floating windows use the same escaped Vue component.
The server has already applied recipient language/visibility rules and chosen the frame. There is no browser
animation timer, color guessing or second application of a base color.

The exact ID mapping is exported by `src/utils/chatPalette.ts`: 0 is default; 16–23 are black, blue, green,
cyan, red, magenta, yellow and white; 24–31 are their bright variants. This differs from ANSI SGR numeric order.
Named `--mud-black`, `--mud-blue`, …, `--mud-bright-white` CSS variables can replace the documented hex defaults.
`--mud-background` and `--mud-foreground` control default colors independently of white. Foreground brightness
adds bold; authored background brightness selects the server's historical underline behavior when requested.
Blink remains steady in the browser for accessibility. Authored text is never inserted as HTML by this path.

Each packet creates one store message and one applicable history entry. A reset affects new messages; existing
history retains its frozen frame. Saved snapshots are validated again on rendering, so malformed storage or
future protocol versions fall back to the legacy message. The existing local history format remains version 1
with an optional field. This change adds no credentials, server endpoints or preference persistence API.

The server harness exports the synthetic fixture in
`frontend/src/components/mud/__tests__/fixtures/chat-presentation-v1.json`. It contains real production-rendered
say/tell/guild frames for two recipients, reset and reconnect. Tests compare rendered text and palette values,
reject malformed metadata, dispatch through the actual WebSocket handler, and exercise the real store, panel,
window manager and persisted-history reload. The floating window's input reference uses its actual component
element so opening or expanding the window can focus the input without a runtime error.

Run frontend `format:check`, `lint`, `type-check`, `test:unit --run` and `build`. No backend behavior changes.
