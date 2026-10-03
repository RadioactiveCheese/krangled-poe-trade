# Fork feature: Currency calculator widget (KamilChowaniec)

- **Fork:** [KamilChowaniec/awakened-poe-trade](https://github.com/KamilChowaniec/awakened-poe-trade)
- **Commit:** [`7ff1be35`](https://github.com/KamilChowaniec/awakened-poe-trade/commit/7ff1be35e9e6bb22499e54cb11c1ad8da3d7b51f) "Add currency calculator widget"
- **Mockup:** [`kamilchowaniec-mockup.html`](./kamilchowaniec-mockup.html), a static HTML page you open in a browser
- **Status:** evaluation only. Nothing has been ported.

## What it does

The fork adds a small overlay widget called **Calculator**. It has one text field where you type
an arithmetic expression using chaos (`c`) and divine (`d`) amounts. The widget shows the result
in divines and in chaos at the same time.

- **Opening it:** a calculator icon (`fa-calculator`) appears in the widget menu bar. Click it to
  show or hide the widget. There is no hotkey. The widget uses the `invisible-on-blur` flag, so it
  disappears when the game has focus and comes back when the overlay is open.
- **Input:** an expression such as `3d + 45c`, `(2.5d - 80c) / 4`, `12 * 7c` or `-1d + 300c`.
  - It supports `+ - * /`, parentheses, unary `+` and `-`, decimals (`1.5`, `.5`), and a
    case-insensitive unit suffix (`c` or `d`) on each number. A number with no suffix counts as
    chaos.
  - Spaces are ignored.
- **Output** (three read-only cells under the input):
  1. A split row, for example **3 [div] 45 [chaos]**: whole divines plus the leftover chaos,
     rounded to whole chaos.
  2. The same total in divines only, to 2 decimal places.
  3. The same total in chaos only, rounded to whole chaos.
- **Header:** shows the current divine-to-chaos rate (`⇄ 212`). While poe.ninja is loading it
  shows the spinning DNA icon. This matches the price-check window header.
- **Invalid input:** when the expression doesn't parse, the widget keeps the last valid result,
  so the numbers don't flicker while you type. An empty field gives 0.

## How it works in the fork

| File | Role |
|---|---|
| `renderer/src/web/overlay/WidgetCalculator.vue` | The widget, about 70 lines, written with `<script setup>`. It holds `expression` in a `ref`, computes `result` with `MathParser`, and shows three `CurrencySplit` cells. |
| `renderer/src/web/overlay/mathParser.ts` | A hand-written shunting-yard evaluator. It splits the text into tokens on `+-*/()`. A regex built from the unit keys (`^(\d+(\.\d+)?\|\.\d+)(c\|d)?$`) matches each number with its unit. It tracks unary operators and collapses `--`. Any error is caught and returned as `NaN`. |
| `renderer/src/web/ui/CurrencySplit.vue` | A general component that shows an amount in chaos as a greedy split across a list of `{name, value, image}` currencies. Every currency except the smallest is truncated to a whole number. The smallest one gets the remainder, rounded to `roundPrecision`. |
| `renderer/src/web/overlay/widgets.ts` | Adds `CalculatorWidget extends Widget { anchor }`. |
| `renderer/src/web/Config.ts` | Adds a default instance (`wmId: 7`, `wmType: 'calculator'`, top-left 50/50). Adds a `configVersion 17` migration that puts the widget after item-search, with a new `wmId`. |
| `OverlayWindow.vue`, `WidgetMenu.vue` | Register the component and add the menu icon. These are the old hard-coded registration points. |
| `app_i18n.json` (en, ru) | Adds `calculator.title` and `calculator.formula_input`. |

**Data flow:**

1. `usePoeninja().queuePricesFetch()` runs and `xchgRate` loads. This is the poe.ninja "Divine Orb" chaos value. The widget rounds it and calls it `stableOrbCost`.
2. `MathParser.evaluate(expr, { c: 1, d: stableOrbCost })` returns a value in chaos.
3. Three `CurrencySplit` views of that chaos value are rendered.

The widget makes no network calls of its own. It reuses the poe.ninja data that the price-check
window already downloads.

## Edge cases and bugs found while reading the diff

- **No exchange rate yet** (still loading, a non-popular league, or a non-`pc-ggg` realm):
  `stableOrbCost` becomes `0`, so `d` is worth 0 and the divine cells divide by 0. They show
  `NaN` or `Infinity`. The fork doesn't guard against this.
- **Unit names:** only `c` and `d` work. Inputs like `5div`, `5ex` or `5 chaos` fail to parse,
  and the widget silently keeps the previous result. Other currencies are not supported.
- **Rounding:** the rate is rounded to an integer before any maths. This is fine at about 200c per
  divine but gets inaccurate if the rate is low.
- **Negative results:** the split cell truncates toward zero. For example, `-1.5d` displays as
  `-1 d -106 c`. That is correct but looks odd.
- `CurrencySplit` sorts the `currencies` prop in place with `.sort()`, which mutates the prop. It
  works because the fork passes a new array literal each time.
- `result` reads its own `.value` inside its computed getter to keep the last valid value. On the
  very first `NaN` this returns `undefined`. It works, but it's fragile. An explicit
  `lastValid` ref would be clearer.
- There is no hotkey, no history, no copy-to-clipboard, and no "paste the price from the last
  price check" link.

## Overlap with this repo

- Nothing like it exists here. A search of `renderer/src` for `calculator` finds nothing, and
  there is no expression parser and no `CurrencySplit` equivalent.
- What already exists:
  - `usePoeninja()` in `renderer/src/web/background/Prices.ts` still exposes `xchgRate`,
    `initialLoading` and `queuePricesFetch`, so the data source can be used as is. This repo now
    calls the poe.ninja `poe1/api/economy/current/dense/overviews` endpoint, but `xchgRate` is
    still taken from "Divine Orb".
  - The `⇄ rate` header in `PriceCheckWindow.vue` (around lines 30-33 and 223) uses the same
    pattern as the fork, so the header markup can be copied directly.
- **Architecture difference:** this repo registers widgets through
  `renderer/src/web/overlay/widget-registry.ts`. Each component declares a static
  `widget: WidgetSpec` (`type`, `instances`, `initInstance`). The fork instead edits
  `OverlayWindow.vue`'s `components` and adds a `wmType` branch in `WidgetMenu.vue`. In this repo,
  the menu takes its icon from the `wmTitle` `{icon=fa-calculator}` convention, not from a
  per-type `v-if`.

## Porting notes

1. Copy `mathParser.ts`, preferably to `renderer/src/web/calculator/`, and add unit tests (see
   below).
2. Copy `CurrencySplit.vue` into `renderer/src/web/ui/`. Fix the in-place `.sort()` and guard
   against `value <= 0`.
3. Rewrite `WidgetCalculator.vue` with a `widget: WidgetSpec` block and register it in
   `widget-registry.ts`. Set `wmTitle: '{icon=fa-calculator}'` so the existing menu shows the
   icon. Then choose one option:
   - `instances: 'single'`: needs a new `configVersion < 24` migration in `Config.ts`.
     `defaultConfig()` only creates single-instance widgets for new configs, so existing users
     won't get the widget otherwise.
   - `instances: 'multi'`: no migration needed. Users add it from the menu's `…` → *Add* list,
     like Timer and Stash search.
4. Drop the fork's `wmFlags[0] === 'uninitialized'` hack. `initInstance` replaces it.
5. Add i18n keys for every locale in `renderer/public/data/*/app_i18n.json`, not only en and ru.
6. Show a "rate unavailable" state when `xchgRate` is `undefined`, instead of treating `d` as 0.
7. Optional extras: accept `div` and `chaos` aliases, allow an optional hotkey (via
   `MAIN->CLIENT::widget-action`, as in `WidgetDelveGrid.vue`), and add copy-to-clipboard.

**Effort: S.** The fork's code is about 220 lines in total and depends only on `usePoeninja()`,
which already exists here. Most of the work is adapting it to the widget registry, writing parser
tests, and fixing the zero-rate case. A config migration is only needed for the single-instance
option.

**Tests to add** (per AGENTS.md):

- Parser:
  - operator precedence
  - unary minus and double negation
  - decimals and leading-dot numbers
  - case-insensitive units
  - an unknown unit gives `NaN`
  - empty input gives `0`
- `CurrencySplit` maths:
  - an exact divine amount
  - a remainder
  - negative values
  - a zero rate

## Risks

- **ToS:** low. It's a passive calculator that reads data the app already downloads. It has no
  game input automation and doesn't read memory.
- **API rate limits:** none added. It reuses the cached poe.ninja download, which refreshes about
  every 31 minutes and only while the user is interacting. It never calls the trade API.
- **Maintenance:**
  - It depends on poe.ninja keeping a "Divine Orb" entry and on `xchgRate`'s `>= 30c`
    sanity check.
  - The hard-coded `c`/`d` units would need changing if a PoE2 mode or a different base currency
    is added. PoE2 uses exalts as the main unit, and `usePoeninja` is hard-wired to `poe1`.
  - A hand-written parser is a small amount of extra code that needs tests. Use it instead of
    `eval`/`Function`, which must never be used on user input in the overlay.
- **UX:** the widget is hidden by default and has no hotkey, so few users will find it unless the
  menu icon makes it obvious.
