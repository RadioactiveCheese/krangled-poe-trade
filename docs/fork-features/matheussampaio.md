# Fork feature: Inscribed Ultimatum price check (matheussampaio)

- Fork: [matheussampaio/awakened-poe-trade](https://github.com/matheussampaio/awakened-poe-trade)
- Commit: [`3dca23d6`](https://github.com/matheussampaio/awakened-poe-trade/commit/3dca23d6fee18c08184e882fd8be7df52bf98f06) "feat: add inscribed ultimatum price check"
- Size: about 3.7k diff lines, but 3,231 of them are a newly committed `renderer/yarn.lock`. The real change is roughly 350 lines across 10 files. No game data is added; the only data change is three English client strings.
- Mockup: [`matheussampaio-mockup.html`](./matheussampaio-mockup.html)

## What it does for the user

When you price check an **Inscribed Ultimatum**, the normal price-check window still opens with:

- the exact preset selected (searching by base type `Inscribed Ultimatum`), and
- an **Area Level** filter rounded down to a bracket (`1, 68, 73, 78, 81, 83`).

Below the trade results, a new dashed box (styled like the existing "stack value" box) shows a quick poe.ninja value of the trial:

| Row | Content |
| --- | --- |
| Cost | Sacrifice item icon, quantity, name, and poe.ninja price for the whole quantity, plus Trade buttons |
| Reward | Reward item icon, quantity, name, and price, plus Trade buttons |
| Profit | Reward minus cost, green if positive and red if negative, shown in chaos or divine |

For the "Doubles sacrificed Currency / Divination Cards" rewards, the reward is the sacrificed item at twice the quantity. For unique-exchange trials, the reward is the named unique. If either item is not found in the local item DB or on poe.ninja, its row is hidden, and Profit is hidden too.

There are no new settings and no new i18n UI strings. The labels "Cost:", "Reward:" and "Profit:" are hard-coded English.

## How it works

Data flow: clipboard text, then `Parser.ts` (`parseInscribedUltimatum`), then `ParsedItem.ultimatum`, then `create-item-filters.ts` and `create-presets.ts`, then `CheckedItem.vue`, which renders the new `UltimatumValue.vue`. That component looks prices up with `usePoeninja()`.

Key changes:

- `renderer/public/data/en/client_strings.js` and `assets/data/interfaces.ts`: new `ULTIMATUM_CHALLENGE` (`'Challenge: '`), `ULTIMATUM_SACRIFICE` (`'Requires Sacrifice: '`) and `ULTIMATUM_REWARD` (`'Reward: '`). Only `en` is added, so other languages would get `undefined` prefixes.
- `parser/ParsedItem.ts`: new `ultimatum?: { type, sacrifice: {item, quantity}, reward: {item, quantity}, monsterLife?, modifiers[] }`.
- `parser/Parser.ts`:
  - `parseInscribedUltimatum` is registered after `parseAreaLevel`. It only runs when `info.refName === 'Inscribed Ultimatum'` and requires `Area Level:` in the same section.
  - It parses `Requires Sacrifice: <name>[ xN]`.
  - It reads `Reward: ...` and sets `type` (the poe.ninja namespace) with a substring check: contains "divination card" gives `DIVINATION_CARD`, contains "currency" gives `ITEM`, and anything else gives `UNIQUE`. A reward starting with `Doubles ` means the sacrifice item at twice the quantity.
  - Every later non-empty line in the section goes into `modifiers`. `N% more Monster Life` is also stored as `monsterLife`.
  - **`itemTextToSections` changes globally**: any line that starts with `(` or ends with `)` is dropped for every item. The goal was presumably to strip reminder text.
- `price-check/filters/create-item-filters.ts`: adds the bracketed `areaLevel` filter and a new `ultimatumMonsterLife` filter. That filter is **never used by `pathofexile-trade.ts`**, so it has no effect.
- `price-check/filters/create-presets.ts`: forces the exact preset for this base.
- `price-check/ultimatum-value/UltimatumValue.vue` (new, 218 lines):
  - looks up `ITEM_BY_REF(type, name)` and `findPriceByQuery({ ns, name, variant })`
  - multiplies the price by quantity, converts it with `autoCurrency`, and computes profit in chaos using the Divine Orb price
  - builds trade links with `createTradeRequest(...)`, then wraps the result as `{ exchange: query }` against `/trade/exchange/`. That is not a valid bulk-exchange query (it has no `have`/`want`), so the Trade buttons almost certainly open an empty or invalid search.
  - leaves debug code behind: `console.log`, and `window.httpPostBody = ...`, which is a TypeScript error under strict typing.
- `ui/ItemQuickPrice.vue`: new optional `showItemName` and `itemQuantity` props, which render "`N ×` [icon] Name" before the arrow.
- `CheckedItem.vue`: renders `<ultimatum-value :item :league>` under `<stack-value>`.

## Overlap with this repo

This repo does **not** handle Inscribed Ultimatums today:

- No parser code for them. `grep -ri ultimatum renderer/src` finds nothing.
- No `ultimatum` field on `ParsedItem`.
- No `ultimatum_filters` in `pathofexile-trade.ts`.
- `Inscribed Ultimatum` exists as a plain `ITEM` base in `renderer/public/data/en/items.ndjson`, so it price-checks as a bare base type with no area level, which gives useless results.

Pieces that already exist and could be reused:

- `parseAreaLevelNested`
- the `areaLevel` filter, which goes to `map_filters.filters.area_level`
- the `floorToBracket` helper
- `StackValue.vue`, the pattern for the value box
- `ItemQuickPrice.vue`
- `usePoeninja().findPriceByQuery` and `autoCurrency`

## Live trade API check (2026-10-03)

Checked against `https://www.pathofexile.com/api/trade/data/filters` and `/stats`:

- `map_filters.area_level` still exists. The fork's main query depends on it.
- The live API has a dedicated **`ultimatum_filters`** group, and **the fork does not use any of it**:
  - `ultimatum_challenge`: `Exterminate`, `Survival`, `Defense`, `Conquer`
  - `ultimatum_reward`: `DoubleCurrency`, `DoubleDivCards`, `MirrorRare`, `ExchangeUnique`
  - `ultimatum_input` "Required Item": a known-item picker covering uniques, cards and currency
  - `ultimatum_output` "Reward Unique": a known-item picker covering uniques
- Stat `explicit.stat_95249895` "#% more Monster Life" exists (also as implicit and fractured). The fork parses this value but never sends it.

As a result, the fork's main trade search returns **every** Inscribed Ultimatum at or above the area level, whatever the sacrifice or reward. The poe.ninja value box is the only part that tells you anything about this specific trial.

## Porting notes

**Effort: M.** The fork's code itself would be S, but it should not be copied as is. A good port should:

1. Port `parseInscribedUltimatum` without the global `itemTextToSections` change.
   - In Advanced Mod Descriptions, mod lines end with ` (implicit)`, ` (enchant)` and similar (see `parser/advanced-mod-desc.ts`). Dropping every line that ends in `)` would silently break implicit and enchant parsing for normal items.
   - Strip reminder text only inside the ultimatum parser.
2. Build a reward kind (`DoubleCurrency`, `DoubleDivCards`, `MirrorRare` or `ExchangeUnique`) instead of the substring check. In the fork, "Mirrored Rare Item" rewards fall into `UNIQUE` and silently show nothing. Also parse `Challenge:` into the challenge ID.
3. Add `ultimatum_filters` to `ItemFilters`, `create-item-filters.ts`, `pathofexile-trade.ts` (`query.filters.ultimatum_filters.filters.{ultimatum_challenge,ultimatum_reward,ultimatum_input,ultimatum_output}`) and `FiltersBlock.vue`.
   - `ultimatum_input` and `ultimatum_output` take known-item names; check the value format (plain name versus `Name Base`) against a live search.
   - Optionally send the Monster Life stat.
4. Reuse the value box with i18n strings and real trade links. A plain `/trade/search` with the ultimatum filters, or a bulk exchange `want` for the sacrifice currency, would work.
5. Add `ULTIMATUM_*` client strings for every locale in `renderer/public/data/*/client_strings.js`, not just `en`.
6. Add parser tests using real clipboard text for each of the four reward kinds. AGENTS.md asks for tests whenever behavior depends on live metadata.

Files a port would touch:

- `renderer/src/parser/Parser.ts`, `parser/ParsedItem.ts`
- `assets/data/interfaces.ts`, `public/data/*/client_strings.js`
- `web/price-check/filters/{interfaces,create-item-filters,create-presets}.ts`, `filters/FiltersBlock.vue`
- `web/price-check/trade/pathofexile-trade.ts`
- `web/price-check/CheckedItem.vue`, a new `web/price-check/ultimatum-value/UltimatumValue.vue`
- `web/ui/ItemQuickPrice.vue`
- the i18n files under `renderer/src/assets/i18n/`

## Risks

- **Global parser regression** from the `(`/`)` line filter. This is the biggest risk if the commit is cherry-picked.
- **Stale or incorrect IDs.** The fork does not hard-code any trade filter IDs besides `area_level`, which still exists. It does rely on English clipboard phrasing (`Requires Sacrifice: `, `Reward: `, `Doubles `, `% more Monster Life`, `Can be used in`), and that phrasing can change between patches. The live `ultimatum_reward` option IDs (`DoubleCurrency` and the others) are the authoritative list to map against.
- **Price data.** Values come from poe.ninja through `findPriceByQuery`. Names that differ between clipboard and poe.ninja, such as unique variants or Foulborn uniques, quietly hide the rows.
- **Broken trade buttons and debug leftovers** in `UltimatumValue.vue`: an invalid exchange query, `console.log`, and `window.httpPostBody`.
- **Committed `renderer/yarn.lock`**: this repo uses npm. Do not bring it over.
