# Fork survey: maybe2105/awakened-poe-trade

Feature: "Automatic orb usage with stash grid support", plus follow-up commits
with vague messages, and an unrelated `kirac.ahk` script.

**Verdict: this breaks GGG's third-party tool policy. Do not port the automation.**
At most, a small read-only piece (described below) is worth thinking about.

## Commits reviewed

| SHA | Message | What changed |
|-----|---------|--------------|
| `8c990c84` | feat: Add automatic orb usage functionality with stash grid support | New `use-orb` / `use-orb-stash` shortcut actions in `main/src/shortcuts/`, `docs/automatic-orb-usage.md`, example configs, CI workflow |
| `37a529b9` | Processing item at cursor | Renderer widget `renderer/src/web/orb-usage/WidgetOrbUsage.vue`. The match check moves from copying item text to sampling pixel colour under the cursor (`main/src/vision/`). Adds colour calibration hotkeys. |
| `271a65ec` | wip | Bundles OpenCV/Tesseract WASM and traineddata under `main/cv-ocr/`. Adds screenshot plumbing in `OverlayWindow`. |
| `b0bc7aaf` | working | Registers the widget, adds config defaults and i18n strings |
| `1cd6ace1` | single item spam | Single-item mode loops up to `maxAttempts` orb applications on the hovered item while holding Shift |
| `5ce12fd1` | Human movement | Random timing jitter, random click position inside each cell, and multi-round passes over the stash |
| `73abcca3` | full feature | Splits the code into `orb-usage/{processor,stash-processor,cursor-processor}.ts`, makes Tesseract optional, changes hotkeys |
| `ac8d57f1` | kirac | Adds a standalone ~2000-line AutoHotkey v2 script, `kirac.ahk`, that is unrelated to the overlay |

## What it does (as the user sees it)

1. The user puts Orbs of Alteration or Chaos Orbs on the cursor (or sets an
   orb position) and opens a stash tab. They type a regex into PoE's own stash
   search box, so items that match are highlighted and the rest are greyed out.
2. In the Orb Usage widget, the user sets the stash grid size (12x12 or 24x24),
   the item footprint, delays between items and rounds, and a maximum number of
   attempts. They can optionally calibrate the "matched" and "unmatched" colours
   (saturation and value) by hovering an item and pressing a calibration hotkey.
3. The user presses one hotkey (F10 for the hovered item or the stash, Ctrl+F10
   to force stash mode). The tool then runs unattended:
   - **Single item mode** keeps applying the held orb to the hovered item until
     it shows as "matched" or it hits `maxAttempts`.
   - **Stash mode** holds Shift, moves the cursor across every grid cell, skips
     cells that look highlighted or empty, and clicks the rest. It repeats in
     rounds until every item matches or the limits are reached.
4. Stop conditions: the item or every item matches; `maxAttempts` or the
   round limit is reached; or the user presses F11. (Code to stop when the
   user moves the mouse out of the stash area was started, then commented
   out.) The widget shows status (running/idle, mode).

`kirac.ahk` is a separate AHK script. On Ctrl+K it moves the cursor over each
Kirac mission slot, reads the tooltip with Windows OCR, and draws an icon over
each mission type. It does not click.

## How it works (high level)

- **Input injection**: synthetic key presses (Shift held down, modifier taps)
  through `uiohook-napi`, and synthetic mouse moves and clicks through
  `@nut-tree-fork/nut-js`, sent to the game window.
- **Mouse movement simulation**: computes the screen position of each cell
  from the stash geometry and moves the cursor there along an eased
  (overshoot-style) path.
- **Match detection**: the first version copied each item's text (Ctrl+C)
  and tested it against a regex. Later versions take a screenshot and measure
  the HSV saturation and value of a small area under the cursor, deciding
  whether PoE's stash search has highlighted the item or greyed it out.
  Tesseract OCR is bundled but becomes optional.
- **Loop**: check, click if not matched, wait a random delay, move on. This
  repeats across cells and rounds with no user input after the first hotkey.

## Multiple actions per input, and "human" movement

- **Yes, one keypress triggers many server actions.** One press can apply
  hundreds of orbs across a whole stash tab. Each orb use is a separate
  server-side crafting action.
- **Yes, the "Human movement" and easing work is there to make the automated
  input look like a person.** The commit adds random timeout variance,
  random click positions inside each item's area, and eased cursor paths
  instead of instant jumps. It serves no purpose for the user. It only makes
  the input pattern look less like a bot.

## ToS / third-party policy assessment

GGG's third-party tool policy allows a tool to perform at most one server
action per user input, and it explicitly bans macros that automate gameplay,
including crafting. This feature:

- performs many server actions (orb applications) per keypress;
- automates crafting (alteration/chaos spamming) end to end;
- tries to make its input look human, which suggests the author knew it
  breaks the rules.

**Verdict: clear violation.** Shipping it would put every user at risk of an
account ban, and it would damage this project's standing (upstream APT relies
on being policy-compliant). `kirac.ahk` only moves the cursor and reads
tooltips (no clicks or server actions), so it is less clear-cut. It still
moves the mouse automatically many times per keypress, and it is a standalone
AHK script unrelated to this codebase. It is out of scope.

## Policy-safe pieces worth considering

Most of the fork is the automation loop, which we reject. Two ideas could be
separated out as read-only helpers that never send input to the game:

1. **Target-mod checker / "hit" notice.** The user lists target mods (regex
   or picked from the stat list). When they price-check or hover an item
   with the app's existing copy flow, the overlay shows whether the target
   mods are present ("HIT: 2/2 mods") and can play a sound. The user still
   clicks every orb themselves, so it stays one action per input. This
   overlaps with the existing item-check and price-check widgets. If built,
   it should reuse their parser and stat matching rather than the fork's
   pixel sampling.
2. **Stash-search regex builder.** The fork depends on PoE's built-in stash
   search highlighting. A helper that builds or stores those regex strings
   for the user to paste is policy-safe (several community tools already do
   this). The app already has a stash search widget, so this would extend it.

None of the fork's code should be reused for these. The pixel and HSV
detection, the bundled OCR binaries, the input injection, and the
humanisation are all specific to automation.

## Recommendation

- **Do not port** the orb-usage automation, the humanised movement, or
  `kirac.ahk`.
- **Optionally** track a separate, read-only "craft target highlighter" idea
  built on the existing item parser: the user configures target mods, and the
  overlay tells them when an item they check has hit. The mockup
  (`maybe2105-mockup.html`) shows only that configuration and status
  surface. It deliberately has no start/run controls.
