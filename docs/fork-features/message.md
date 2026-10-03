# Fork feature: message/awakened-poe-trade — Gem corruption widget + exact min roll

Source fork: https://github.com/message/awakened-poe-trade

| Commit | Title |
| --- | --- |
| `64622300` | Gem corruption |
| `a0d3eb46` | Gem corruption options tab |
| `a7b4b04a` | Add exact min roll option, style gem corruption slider, remove patron ... |

Mockup: [`message-mockup.html`](./message-mockup.html) (static, open in a browser).

Note: `a7b4b04a` edits a range slider and an i18n key (`min_multiple_off`) that are not in
`a0d3eb46`, so at least one unlisted commit sits between them in the fork. The description
below is the state after all three commits, with that slider filled in.

## What it does (user-facing)

There are two separate features.

### 1. Gem corruption widget (new overlay widget, not part of the price-check window)

- A new single-instance widget, `gem-corruption`, with a skull icon
  (`{icon=fa-skull-crossbones}`) in the widget menu. It is hidden by default and gets added to
  existing configs by a config migration.
- When the widget is shown it calls `queuePricesFetch()` and lists every non-Vaal skill gem
  that poe.ninja prices at **max level, 20% quality, uncorrupted** and at **max level + 1,
  20% quality, corrupted**. In short, it is a "Vaal-orb a gem for a +1 level" flip finder.
- Each row (5 per page, with pagination) shows:
  - gem icon and name;
  - a **Buy · 20/20** button with the cheaper of: a 20/20 gem bought outright, or a
    **20/0 gem + 20× Gemcutter's Prism**. When the prism route is cheaper, the label drops
    `/20` and shows a small GCP icon;
  - a **Sell · 21/20c** button with the corrupted +1 level price, then
    `(+profit, margin %, sell/buy ×)` in green or red.
- Clicking **Buy** or **Sell** builds a virtual gem item (`createVirtualItem`) and sends it
  to the normal price-check window with `Host.selfDispatch('MAIN->CLIENT::item-text')`, so
  the user gets live trade listings. Buy uses quality 0 when the prism route was cheaper;
  Sell uses `maxLevel+1`, quality 20, corrupted.
- A text box at the top filters rows by name.
- Settings tab "Gem corruption" (opened from the widget's settings menu):
  - toggles: include **Transfigured**, include **Awakened**, include **Unconfirmed prices**
    (rows where some reference variant is missing on poe.ninja);
  - **Min sell/buy ratio** slider, 0–20 in 0.5 steps, default **7×**, 0 = off. Rows with
    `sell / buy` below the ratio are hidden.
- Rows are sorted by absolute chaos profit (the first commit sorted by margin).

### 2. Exact min roll (price-check setting)

- New checkbox in Price check settings: "Search for the exact rolled value instead of a
  lower bound". The fork turns it **on for every existing user** (migration sets
  `exactMinRoll = true`) and it is on by default for new configs.
- When on, `filterFillMinMax` sets a positive stat's `min` (or a negative stat's `max`) to
  the item's actual rolled value. The "Fill stat values ±N%" offset no longer applies to the
  side that gets filled. The `default` range, which the filter's reset uses, still uses the
  percentage.

The same commit also removes the Patreon / patron podium from Settings and CheckedItem.
That has nothing to do with these features, and we should not port it.

## How it works

### Files in the fork

- `renderer/src/web/gem-corruption/calc.ts`
  - `gemCorruptionCandidates()` loops over `ITEMS_ITERATOR('"namespace":"GEM"')` and skips
    Vaal gems.
  - `computeCorruptionEv(gem, { findPriceByQuery })` looks up these poe.ninja variants
    (namespace `GEM`, `refName`):
    `L`, `L/20`, `L/20c`, `L+1/20c`, `L-1/20c`, `L/23c → 22c → 21c`, `Vaal <gem>` at `Lc`,
    plus `ITEM` prices for Gemcutter's Prism and Vaal Orb (`L` = `gem.maxLevel`).
  - It drops any corrupted variant priced above **8×** the 20/20 price (`MAX_PRICE_MULTIPLE`),
    because poe.ninja's dense endpoint has no listing count or confidence.
  - `baselineCost = min(L/20, L + 20×GCP)`; `profit = sell(L+1/20c) − baselineCost − vaalOrb`;
    `profitMargin = profit / baselineCost`.
  - It returns `null` (row hidden) when baseline, Vaal Orb or the +1 price is missing. Other
    missing variants only go into `missing[]`, which marks the row "unconfirmed".
  - The name says "EV", but the result is **not** an expected value. Only the +1 level
    outcome is priced; the other variants are kept in `breakdown` and only logged. The
    default 7× ratio filter is how the fork accounts for the low hit chance.
- `renderer/src/web/gem-corruption/WidgetGemCorruption.vue`: the widget (list, name
  filter, pagination, Buy/Sell dispatch). It recomputes on `watch(xchgRate)`, which in
  practice means "after each poe.ninja refresh".
- `renderer/src/web/gem-corruption/settings-gem-corruption.vue`: the options tab
  (`UiToggle` ×3 and a styled `<input type=range>`).
- `renderer/src/web/gem-corruption/widget.ts`: `GemCorruptionWidget` config interface.
- Wiring: `overlay/widget-registry.ts` (register), `settings/SettingsWindow.vue`
  (`menuByType('gem-corruption')`), `Config.ts` migration that pushes the widget, the
  `gem_corruption` i18n block, and a dark-theme override for the `light` tippy theme in
  `ui/Popover.vue`.
- Exact min roll: `exactMinRoll` gets threaded through `PriceCheckWidget`, `CheckedItem.vue`,
  `create-presets.ts`, `FiltersCreationContext`, `createExactStatFilters`,
  `initUiModFilters`, `calculatedStatToFilter`, `filterFillMinMax`, and the pseudo,
  item-property and mercenary helpers.

### Data flow

```
widget shown ─▶ usePoeninja().queuePricesFetch() ─▶ poe.ninja dense overviews (already used by app)
xchgRate changes ─▶ for each gem: findPriceByQuery(GEM, refName, "20/20" | "21/20c" | …)
                 ─▶ CorruptionResult[] ─▶ filters (name, transfigured, awakened, unconfirmed, ratio)
click Buy/Sell ─▶ createVirtualItem(Gem, level, quality, corrupted) ─▶ selfDispatch item-text ─▶ price-check window
```

The feature makes no new network calls and does no trade API queries until the user clicks a
button. After that, it is a normal price check.

## Overlap with this repo

- **Nothing like the corruption widget exists here.** The closest pieces are the
  related-items list and `trends/getDetailsId.ts → forSkillGem`, which maps one gem to one
  poe.ninja variant. Nothing lists gems across the board or compares corruption outcomes.
- Everything the fork needs is already present on `main`: `usePoeninja()` in
  `renderer/src/web/background/Prices.ts` (same `findPriceByQuery`, `queuePricesFetch`,
  `xchgRate`, `displayRounding`), `ITEMS_ITERATOR` and `ITEM_BY_REF` in
  `renderer/src/assets/data/index.ts`, `createVirtualItem` in
  `renderer/src/parser/ParsedItem.ts`, the widget registry
  (`renderer/src/web/overlay/widget-registry.ts`, where `WidgetItemSearch` is the pattern
  to copy), and `SettingsWindow.vue → menuByType` (with an `item-search` case to copy).
- `WidgetItemSearch.vue` already uses `usePoeninja()` the same way, so it is the closest
  in-repo template.
- **Exact min roll mostly overlaps with what already exists.** Price-check settings already
  have "Fill stat values: N% / Exact value" (`searchStatRange = 0`). With `0`,
  `filterDefault.min` is already the rolled value. The fork's flag differs in three ways:
  1. it applies even when a non-zero ± range is chosen (it overrides that range for the
     lower bound only);
  2. it ignores the forced `Math.min(2, searchStatRange)` used in exact/bulk mode;
  3. it uses the rounded `roll.value`, not `percentRoll(..., Math.floor)`. With decimal
     stats this can exclude listings that the floored bound would match.
- Our `Config.ts` is at `configVersion: 23`, while the fork's migrations use 19 and 20. A
  port needs new version numbers.

## Porting notes and effort

**Gem corruption widget: M.** The four new files mostly copy over as they are. The work is
in the wiring (registry, settings menu, config migration, i18n for every locale we ship), and
above all in checking the poe.ninja variant keys:

- The fork builds variant strings itself (`${maxLevel}`, `${maxLevel}/20`, …). Our
  `forSkillGem` shows that poe.ninja keys don't always follow that pattern. Gems under level
  20 use `1`, some special supports and Portal/Brand Recall have exceptions, and quality
  16–20 is bucketed. Per `AGENTS.md`, the port should pull the current poe.ninja gem
  overview, compare **every** gem's variant keys (normal, transfigured, awakened, max-level
  < 20 gems) against what `calc.ts` builds, and add tests for misses. Better still, reuse or
  extend `forSkillGem` so we keep a single mapping.
- `isAwakened` uses `refName.startsWith('Awakened ')`. Check that against current gem data
  too (there are also Exceptional supports and alt-quality names).
- Decide whether to make it a real EV. Weight the outcomes by Vaal Orb probabilities and
  include "same", "−1 level", "quality up" and "Vaal transform" instead of ranking only the
  success case. If not, rename the "EV" wording.
- Skip the patron removal and the Popover theme override, unless our theme already needs
  that override.

**Exact min roll: S.** It is about 15 lines threaded through filter creation. But it
overlaps with "Exact value", and the fork turns it on for everyone through a migration. If we
port it, we should default it **off** and maybe fold it into the existing "Fill stat values"
radio group as "min = exact, max = open".

## Mechanics check (PoE 1)

The fork models a Vaal Orb on a gem as one of: no change, +1 level, −1 level, quality up
(priced as 21/22/23c), random quality down, or turning into the Vaal version. That matches
the long-standing PoE 1 rules as I know them. I could **not** check them against poewiki
live: the request was blocked by bot protection, and the fandom mirror returned 402. Re-verify
the outcome table and odds against the current patch notes or poewiki before relying on any
EV numbers. The fork's own logic doesn't depend on the odds, because it only prices the +1
outcome. It does depend on poe.ninja still publishing `L+1/20c` variants, which it does for
popular gems (awakened 6/20c, 21/20c and similar).

## Risks

- **Thin and noisy data:** `21/20c` listings are rare, and poe.ninja dense prices have no
  confidence signal. The fork's 8× outlier cap is a heuristic, and the "unconfirmed" flag
  only says that *other* variants are missing, not that the sell price is reliable.
- **Misleading profit:** each row shows success-case profit. Without probability weighting
  (about 1/8 for +1 level), users can read +5000c as expected profit. The 7× default ratio
  helps but doesn't fix this.
- **Variant-key drift:** hand-built variant strings can silently miss gems (rows vanish
  rather than error).
- **CPU:** `findPriceByQuery` does a linear `indexOf` over the price blob. Running it about
  8× per gem for every gem (~700+ gems) on each `xchgRate` change is several thousand string
  scans. It's probably fine, but measure it.
- **Exact min roll default:** forcing it on changes every user's search results, and it can
  over-constrain decimal stats.
- League support: `usePoeninja` only loads for popular PC leagues, so in other leagues the
  widget stays stuck on "Waiting for poe.ninja prices…".
