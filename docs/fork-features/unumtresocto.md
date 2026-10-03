# Fork feature: unumtresocto, "Alt crafting widget"

- Fork: [unumtresocto/awakened-poe-trade](https://github.com/unumtresocto/awakened-poe-trade)
- Commit: `39e67094b64ee8f74b9ff064543b480f7498c751` ("add alt crafting widget")
- Mockup: [`unumtresocto-mockup.html`](./unumtresocto-mockup.html)

> **Summary: this is an input-automation bot, not an informational widget.**
> Pressing the hotkey starts a loop that copies the item text, checks it against
> the user's regexes, and right/left-clicks Orbs of Alteration and Augmentation
> onto the item until a match turns up. Each server action comes from a
> synthetic input event, with no human input per action. That breaks GGG's
> "one action per keypress" rule. **Recommendation: do not port the
> automation.** Only the regex-preset UI is worth keeping, and only as a
> passive "does this item match?" checker.

## What the user sees and does

1. A new single-instance overlay widget, **"Alt Crafting"** (`wmType: "alt-crafting"`),
   shows up in the overlay (default anchor top-left, 34% / 56%). It hides when the
   game window takes focus (`invisible-on-blur`).
2. The widget contains:
   - an **ALL** checkbox that switches the match mode between `ANY` (one enabled
     matcher is enough) and `ALL` (every enabled matcher must match; one entry can
     hold alternatives as `a||b`),
   - **Load preset / Save preset / Delete preset** buttons, each of which swaps the
     body for a row of preset-name buttons and a Cancel button,
   - the current preset name, a free-text "Enter new mod" input, **Add** and
     **Reset** buttons,
   - a list of matchers. Each row has an enable checkbox, the matcher text, and an
     `x` remove button.
3. Three presets ship by default: `physaxe` (tyrannical, emperor, dictator,
   merciless, flaring, cruel, conqueror), `physjew` (annealed, razor, tempered,
   flaring, training, venom) and `tinctura` (`unleashed||overpowering`,
   `horticultural||medicinal`). The matchers are **mod affix names** (e.g.
   "Tyrannical" = % increased physical damage), not stat text.
4. A hotkey, **F7** by default, can be set in Settings → Hotkeys:
   - **F7** starts crafting,
   - **Shift + F7** stops it (the binding is added automatically).
5. While it runs, the bot holds Shift and loops:
   1. sends Ctrl+C (via `pressKeysToCopyItemText`) and reads the item text from the clipboard,
   2. if the lowercased text matches the enabled matchers, it **stops**,
   3. if the item lacks an open prefix or suffix (crude `includes("prefix")` /
      `includes("suffix")` check on the advanced copy), it right-clicks the
      **Augmentation** orb twice, then left-clicks the item,
   4. otherwise it left-clicks the item with the held Alteration orb, re-picking
      Alteration first if the last action was an Aug.
   It repeats until it gets a match, the user presses Shift+F7, or a clipboard error occurs.

## How it works

| Piece | File (in the fork) | Notes |
|---|---|---|
| Widget UI | `renderer/src/web/alt-crafting/WidgetAltCrafting.vue` | Preset CRUD writes into `AppConfig().widgets` via `updateConfig` + `saveConfig` + `pushHostConfig`. A `watch([mods, searchMode])` sends the enabled matcher list to main on every change. |
| Row component | `renderer/src/web/alt-crafting/AltCraftingModEntry.vue` | Checkbox, label and remove button. Contains leftover map-check tag CSS. |
| Dead code | `renderer/src/web/alt-crafting/common.ts`, `settings-alt-crafting.vue` | Copied from map-check and never used. `searchMods()` (a `STATS_ITERATOR` lookup) is also unused. |
| Types | `renderer/src/web/overlay/widgets.ts` | `AltCraftingMod { matcher, id, comment?, isEnabled? }`, `AltCraftingWidget { hotkey, presets, anchor, currentPreset?, searchMode? }` |
| Registry | `renderer/src/web/overlay/widget-registry.ts` | `registry.widgets.push(WidgetAltCrafting)` |
| Config | `renderer/src/web/Config.ts` | Migration `configVersion < 19` pushes the default widget. `getConfigForHost()` registers `hotkey` → `{type:'alt-crafting'}` and `Shift + hotkey` → `{type:'alt-crafting', stop:true}`. |
| IPC | `ipc/types.ts` | New `ShortcutAction` `{type:'alt-crafting', stop?}` and `user-action` `{action:'alt-crafting-update', mods, mode}`. |
| Bot loop | `main/src/alt-crafting/AltCrafting.ts` | `startCrafting()` / `stopCrafting()` / `setupAltCrafting()`. Clicks go to an **external daemon** over the Unix socket `/tmp/input_daemon.sock` (`CLICK_ABS x y`, `CLICK_RIGHT_ABS`, `KEY_DOWN 42`, `KEY_UP 42`), with a 100 ms delay per action and ±10 px jitter on the "reset" click. |
| Hotkey dispatch | `main/src/shortcuts/Shortcuts.ts` | New `alt-crafting` branch. `pressKeysToCopyItemText` is exported for reuse. |
| Settings | `renderer/src/web/settings/hotkeys.vue` | Adds a hotkey row and a stray `settings.alt_crafting` label. |

**Data flow:** widget matchers → IPC `alt-crafting-update` → module globals
`CURRENT_MODS` / `SEARCH_MODE` in main → hotkey → `startCrafting` loop →
clipboard text → `new RegExp(mod.toLowerCase()).test(clip)` → daemon socket clicks.

### Where the "mod data" comes from

There is none. The +7.8k lines come almost entirely from two **new `yarn.lock` files**
(`main/yarn.lock` ~2.7k, `renderer/yarn.lock` ~3.4k) plus Prettier reformatting
of `ipc/types.ts`, `Shortcuts.ts`, `Config.ts` and `hotkeys.vue`. The real feature is
about 750 lines. Matchers are typed in by hand. Nothing ties them to the game's mod
tables, so there is nothing to keep current except the user's own regexes, which
break silently when GGG renames an affix.

### Edge cases and defects observed

- **Hard-coded screen coordinates**: item at `(2384, 550)`, Alt at `(2070, 370)`,
  Aug at `(2220, 440)`, reset at `(2000, 800)`. These assume a second monitor
  offset by 1920 px and one specific stash-tab layout, and ignore `GameWindow.bounds`
  and DPI. They will click the wrong place on any other setup.
- **Linux/macOS only**: the click daemon is reached through `/tmp/input_daemon.sock`. That
  daemon is not part of the repo, and it does not exist on Windows.
- The prefix/suffix check is a substring test. It treats any item whose advanced
  text has at least one "Prefix" and one "Suffix" header as full, so it never
  checks open-slot counts.
- With 0 matchers in `ALL` mode, `CURRENT_MODS.some(p)` is false, so it rolls forever.
- Matchers are compiled with `new RegExp` without escaping, so user text containing `(`
  or `+` can throw and kill the loop.
- No currency-count check, so it keeps clicking after the orbs run out. No max-iteration cap.
- `id: new Date().toString()` means two mods added within the same second collide.
- Shift is pressed both through the daemon and through `uIOhook`, but only released through the daemon.
- Missing i18n keys (`alt_crafting` namespace, `settings.alt_crafting`), and the
  fork's migration number (19) clashes with ours (we're at 23).

## Overlap with this repo

- **Nothing equivalent exists.** We have no crafting automation and no
  regex-on-clipboard matcher widget.
- Similar passive pieces:
  - `renderer/src/web/stash-search/WidgetStashSearch.vue`: a multi-instance list of
    saved search strings that pastes into the stash search box. This is the closest
    UI and the right pattern for presets (one widget instance per preset).
  - `renderer/src/web/map-check/`: matcher lists with good/warn/deadly decisions,
    applied to copied item text. The fork's `common.ts` is a copy of this code.
  - Price check already parses the item (`renderer/src/parser/`) with real mod tiers and
    affix names. A passive "does my item hit target?" check should use parsed
    `item.newMods` rather than regex on raw text.

## Porting notes and effort

| Option | Effort | Notes |
|---|---|---|
| Port as-is (bot) | n/a | **Rejected.** Breaks GGG ToS, needs an out-of-tree input daemon, and only works with hard-coded coordinates. |
| Passive "Craft target" checker: presets of affix/regex targets; on the normal price-check/item-check hotkey (one user keypress = one copy) show which targets the item hits and whether it has open prefix/suffix slots | **S–M** | New widget + `widgets.ts` type + registry entry + config migration v24 + i18n. Reuse the parsed item (`ParsedItem.newMods`, `info.refName`) instead of raw regex. No `main/` changes and no new IPC. |
| Same, with matchers chosen from real mod data (stat autocomplete from `renderer/public/data/<lang>/stats.ndjson` via `STATS_ITERATOR`; affix *names* are not shipped today and would need a new data export) | **M** | Needs a mod/affix index and, per AGENTS.md, a test comparing the local list to the current dataset so renames get caught. |

## Risks

- **ToS / account safety (critical):** the core loop automates server actions
  (currency use) with synthetic clicks. GGG bans for this. Shipping it would also put
  the whole overlay at risk of being treated as a bot tool. Note that even
  copying item text in a loop without user input is automation.
- **Stale data:** matchers are free-text affix names. Affix renames and new tiers in
  each patch break presets silently. There's no link to the game data we already ship.
- **Maintenance:** platform-specific external daemon, hard-coded geometry,
  global mutable state in main, dead copied code, and a whole-file reformat that
  makes merging upstream painful.
