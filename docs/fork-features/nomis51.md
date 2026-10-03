# Fork feature: nomis51 — Trade Manager

- Fork: [nomis51/awakened-poe-trade](https://github.com/nomis51/awakened-poe-trade)
- Status upstream: never merged; the work dates from Jul–Oct 2020 (67 commits ahead of SnosMe `master`, 846 behind at time of survey). The code targets the old single-package Vue 2 / `robotjs` / `electron-overlay-window` architecture, so none of it can be cherry-picked.
- Mockup: [`nomis51-mockup.html`](./nomis51-mockup.html) (static, sample data)

Key commits: `950af35` TradeManager in main, `9dd54b5` incoming offer UI, `07bf3e7` outgoing offer UI, `47f56c8` whispers and chat commands, `2249297` trade accepted/cancelled with auto-whisper and auto-kick, `763216a` item highlight via in-game search, `dd5ec8e` "has joined the area" detection, `404e057` join hideout, `2211e70` settings, `18900c1` Russian outgoing whispers, `0bba462` trade log (nedb).

## What the user sees and does

A trade-helper in the style of Poe-Trades-Companion / MercuryTrade, built into the overlay.

**Incoming offers (you are the seller).** When someone whispers you a trade-site message, a small 5rem × 5rem card appears in a row centered at the bottom of the screen, with a "new offer" sound. Each card shows the item name (truncated, full text plus player, time, stash tab and position in a hover tooltip), the currency icon and the amount.

| Input on card | Effect |
|---|---|
| Click (first time) | `/invite <player>` |
| Click (after invite) | `/tradewith <player>` |
| Ctrl+click | whisper "sold" template, card removed |
| Ctrl+Shift+click | whisper "still interested?" template |
| Alt+click | Ctrl+F in stash, paste item name (highlight) |
| Clock button (before invite) | whisper "busy" template |
| X button (before invite) | dismiss card, nothing sent |
| Person+ button (after invite) | `/invite` again |
| X button (after invite) | `/kick <player>`, card removed |

When the buyer enters your area ("X has joined the area"), a person icon appears on the card and a "knock on door" sound plays.

**Outgoing offers (you are the buyer).** When you click "Whisper" on the trade site, the copied whisper text is picked up from the clipboard, and a wider card appears in a scrolling column on the right edge, showing item, seller, time copied and an elapsed-seconds counter. Buttons: house (`/hideout <seller>`), $ (`/tradewith <seller>`), X (dismiss). Cards dismiss themselves after 60 s unless you joined the hideout.

**Settings page** (Settings → Trade manager): editable whisper templates for thanks / sold / busy / still interested with `{item}` and `{price}` tokens; Yes/No radios for *Auto kick*, *Automatically send "Thanks" whisper*, *Auto whisper (for outgoing offers)* (**all three default to Yes**); three custom sound file pickers (new offer, buyer joined, UI click), loaded through a custom `user-file://` protocol, "Restart required".

**Trade log.** Each "Thanks" whisper inserts a row `{time, item, price, player, league, location}` into an nedb file at `./apt-data/trades.db`. **No stats UI was ever built**: the commit title says "show stats after", but the fork has no component that reads the DB. The stats panel in the mockup is a proposal of what that would look like, not a fork feature.

## How it works

### Main process — `src/main/trade-manager/index.ts` (`TradeManager` singleton)

1. `start()` polls `find-process` for `pathofexile|wine64-preloader` (retry every 30 s), derives `<exe dir>/logs/Client.txt`, seeks to EOF.
2. `listenIncomingTradeOffers()` uses `fs.watchFile` (1 s interval), debounced 500 ms, to read new bytes and split on `EOL`.
3. `listenOutgoingTradeOffers()` **polls the clipboard every 500 ms** and parses any new text as a possible outgoing whisper. Polling is paused for 500 ms around its own clipboard writes.
4. `parse(line)` classifies log lines **using the English validators only**: `incomingOffer`, `tradeAccepted`, `tradeCancelled`, `playerJoined`. It then tries each language's parser for that type. Results are sent to the overlay over IPC (`NEW_INCOMING_OFFER`, `NEW_OUTGOING_OFFER`, `TRADE_ACCEPTED`, `TRADE_CANCELLED`, `PLAYER_JOINED`).
5. Actions arrive from the renderer over `ipcMain.on(...)`, go into a `Queue`, and each one does `focusPoE()` then `typeInChat("/invite …")` etc. `highlightOfferItem` writes the item name to the clipboard, then `robotjs.keyTap('F',['Ctrl'])` and `keyTap('V',['Ctrl'])`, then restores the clipboard after 120 ms.

### Parsers — `src/main/trade-manager/parsers/{en,ru}.ts`

Substring slicing via a `String.prototype.textBetween` helper rather than named-group regexes.

| Type | EN validator | RU |
|---|---|---|
| incomingOffer | `/@From .+:* Hi, (I would\|I'd) like to buy your .+ (listed for\|for my) .+ in .+/` | disabled (`validate: () => false`) |
| outgoingOffer (clipboard) | `/@.+:* Hi, (I would\|I'd) like to buy your .+ (listed for\|for my) .+ in .+/` | `/@.+:* Здравствуйте, хочу купить у вас .+ за .+ в лиге .+/` |
| tradeAccepted | `/Trade accepted/` | `/Сделка принята/` (unreachable, see below) |
| tradeCancelled | `/Trade cancelled\|Player not found in this area/` | `/Сделка отменена\|Игрок не найден в этой области/` (unreachable) |
| playerJoined | `/.+ has joined the area/` | `/.+ присоединился к области/` (unreachable) |

Because classification only uses `parsing.en.*.validate`, the RU log-line parsers never run, so in practice only **English incoming, English and Russian outgoing** work. Time is `line.substring(0,19)`. Price is split on the first space and mapped to a hard-coded currency icon table (`Config.ts`, 2020-era poecdn URLs, `alch`/`alc` key mismatch). Stash tab and position are parsed from `(stash tab "…"; position: left N, top N)`.

### Renderer — `src/web/trade-manager/**`

- `IncomingOffersContainer.vue` / `IncomingOffer.vue`: offer list, per-card state (`partyInviteSent`, `tradeRequestSent`, `playerJoined`), sounds via `new Audio()`.
- `OutgoingOffersContainer.vue` / `OutgoingOffer.vue`: list, 60 s expiry timer.
- `TRADE_ACCEPTED` handler: picks the **first** offer with `tradeRequestSent`. It does not match the player, because the "Trade accepted." line has no name. If `autoThanks` is on, it calls `sendThanksWhisper(offer, autoKick)`, which whispers thanks and then `/kick`s 120 ms later. If only `autoKick` is on, it just kicks.
- Settings at `src/web/settings/trade-manager.vue`. The overlay was made click-through-except-cards by a forked `electron-overlay-window` that brings PoE back to the top on focus (`449e8ef`).

## Automatic vs. one-input-per-action (ToS)

GGG's third-party policy allows **one server action per user input**. Classified against that:

| Behavior | Trigger | Verdict |
|---|---|---|
| Invite / tradewith / kick / hideout / busy / sold / still-interested buttons | one click → one chat command | **Safe**, same model as this repo's existing chat-command hotkeys |
| Alt+click item highlight | one click → Ctrl+F + paste (client-side search, no server action) | **Safe**, same as the existing `stashSearch()` |
| **Auto whisper (outgoing)** | copying text on the trade website causes the app to focus PoE and *send* the whisper in-game | **Risky.** The in-game action happens with no in-game input. The click was on a browser page, and any matching clipboard text triggers it. Default **on**. |
| **Auto thanks on "Trade accepted"** | a log line → whisper sent | **Violates** one-action-per-input: a server action with no user input at all. Default **on**. |
| **Auto kick on "Trade accepted"** | a log line → `/kick` sent (combined with auto-thanks this is *two* server actions from zero inputs) | **Violates.** Default **on**. |
| Remove (X after invite) | one click → `/kick` | Safe |
| Thank + kick in one handler (`4092feb`) | if exposed as a manual button, one click → two chat messages | **Risky**. Split into two inputs. |

There is also a correctness risk on top of the policy one. "Trade accepted" carries no player name, so auto-thanks/kick targets whichever card first had a trade request sent, which can be the wrong player.

## Overlap with this repo

This repo already has most of the plumbing; the fork's main-process code is obsolete.

| Fork piece | Existing equivalent here |
|---|---|
| Find PoE process, watch Client.txt | `main/src/host-files/GameLogWatcher.ts`: configurable path with guessed defaults, `watchFile` 450 ms, reads to EOF, broadcasts `MAIN->CLIENT::game-log` |
| Whisper parsing | `renderer/src/web/client-log/client-log.ts` `handleLine()`. It already parses `@From` / `@To` / system / party / guild channels via `CLIENT_STRINGS` and **trade whispers in 9 languages** (`TRADE_WHISPER`, `TRADE_BULK_WHISPER`, with gem and stash-tab groups). The parsed `entry` is currently discarded (`// console.log(entry)`); this is the obvious hook. |
| `typeInChat` | `main/src/shortcuts/text-box.ts` `typeInChat(text, send, clipboard)`, uiohook-based, with clipboard restore |
| Ctrl+F highlight | `text-box.ts` `stashSearch()` and `CLIENT->MAIN::user-action { action: 'stash-search' }` |
| Chat-command hotkeys | `docs/chat-commands.md`, `Shortcuts.ts` (`@last` placeholder for "reply to last whisper") |
| Widgets | `renderer/src/web/overlay/widget-registry.ts`, `Widget.vue`, `widgets.ts` |
| Settings | `renderer/src/web/settings/*.vue`, `Config.ts` (versioned config migrations) |
| Trade log / stats | nothing |
| "has joined the area", "Trade accepted/cancelled" | not parsed. `CLIENT_STRINGS.CHAT_SYSTEM` matches `: …` lines but there are no specific strings. |
| Clipboard polling for outgoing | nothing. `HostClipboard` only reads on demand. |

## Porting notes

What a port would actually be:

1. **Parsing.** Finish `client-log.ts`: emit typed `IncomingOffer` / `OutgoingOffer` events (`@To` with a trade body = outgoing; this avoids clipboard polling entirely) and add `CLIENT_STRINGS` keys for "has joined the area", "Trade accepted.", "Trade cancelled." in each `renderer/public/data/<lang>/client_strings.js`. Per `AGENTS.md`, verify those strings against the current game client data for every supported language and add vitest specs under `renderer/specs` for every whisper template, including bulk and gem forms and guild-tagged names.
2. **IPC.** Extend `ipc/types.ts` `CLIENT->MAIN::user-action` with `{ action: 'chat-command', text }` (or reuse the hotkey `typeInChat` path), handled in `Shortcuts.ts`, gated on `overlay.assertGameActive()`.
3. **UI.** New widget `renderer/src/web/trade-manager/WidgetTradeManager.vue` registered in `widget-registry.ts` / `widgets.ts`. The hard part is that this repo's overlay is **not clickable while the game is focused**: widgets are only interactive after the overlay is activated (Shift+Space). nomis51 used a patched `electron-overlay-window` that is incompatible with the current one. Options are (a) cards visible passively, actions via hotkeys ("invite newest buyer", "trade with active offer"), with clicks only in active-overlay mode; or (b) a small always-interactive region, which would need `setIgnoreMouseEvents` forwarding work in `main/src/windowing/OverlayWindow.ts`, a real change with focus-stealing side effects.
4. **Sounds.** Use `<audio>` with bundled defaults. For custom files, reuse `main/src/host-files/file-uploads.ts` rather than a new `user-file://` protocol.
5. **Trade log and stats.** Persist in renderer `localStorage` / config, or a JSON file in `app.getPath('userData')`, never CWD-relative like `./apt-data`. Log on a user-confirmed "Done" action (not on auto-thanks).
6. **Drop:** clipboard polling, auto-whisper, auto-thanks, auto-kick, `find-process`, `robotjs`, nedb.

**Effort: L** (about M if limited to passive incoming cards + hotkeys). Parsing and chat plumbing exist, so the logic is maybe 2–3 days. The overlay-interaction model (clickable cards while the game has focus), multi-language system-message strings with tests, per-offer state machine, settings + config migration, and a stats view push it to L. None of the fork's code is reusable as-is (Vue 2, robotjs, pre-monorepo).

## Risks

- **ToS:** auto-whisper, auto-thanks and auto-kick are automatic server actions; they must not be ported. Thank+kick on one click should become two inputs.
- **Wrong-target actions:** "Trade accepted" has no player name; any automation keyed on it can hit the wrong player.
- **Clipboard polling** reads everything the user copies every 500 ms. That is a privacy and perf concern, and unnecessary since `@To` lines are in Client.txt.
- **Focus stealing:** every action calls `focusPoE()` and types into chat. If the chat box is already open or a modifier is held, text goes to the wrong place. The fork works around this with `clearKeyModifiers()`; the existing `typeInChat` handles the clipboard restore.
- **Localisation:** fork only handles EN incoming; this repo's users span 9 client languages, so every new system string needs a verified translation.
