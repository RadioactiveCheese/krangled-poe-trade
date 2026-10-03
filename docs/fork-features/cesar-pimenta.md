# Fork features: cesar-pimenta/awakened-poe-trade

Survey of the "compare with equipped / My Build" feature stack in
[cesar-pimenta/awakened-poe-trade](https://github.com/cesar-pimenta/awakened-poe-trade).
This is an evaluation only. Nothing here is ported. The mockup is in
[`cesar-pimenta-mockup.html`](./cesar-pimenta-mockup.html).

The fork's README is the unchanged upstream README, so it has no feature docs. Everything below
comes from reading the commit diffs. Code comments are in Portuguese.

| Commit | Title |
|---|---|
| `04ec04d` | add Portuguese (pt) language support (noted only; see the end) |
| `4e28d8a` | add item-compare widget |
| `9e7f672` | add My Build panel with character import and gear-wide impact |
| `534f42d` | compare banner in price check, two rings, build panel icons |
| `e5d25e3` | estimate main skill DPS from gear |
| `62a0f68` | evaluate support gems in the skill DPS estimate |
| `1651994` | skill setups: main and secondary skills with linked supports |
| `b2d45c6` | (follow-up) support gem lines can have qualifiers in the middle |

All new code is in one folder, `renderer/src/web/item-compare/`, about 1,100 lines of TS/Vue. It
also touches `Config.ts`, `widget-registry.ts`, `SettingsWindow.vue`, `price-check/CheckedItem.vue`
and `app_i18n.json` (en + pt).

---

## 1. What the user sees

### 1.1 Item-compare widget (`4e28d8a`)

- A new hotkey, **Ctrl + Shift + D** by default (`item-compare` widget, `copy-item` action). Pressing
  it over an item opens a small panel next to the inventory or stash, anchored like the item-check
  widget.
- The first time, the user hovers their **own equipped item**, presses the hotkey and clicks
  **"I use this item"**. The item's raw clipboard text is saved in `config.json` under the
  widget's `equippedItems`.
- After that, pressing the hotkey on any item that fits the same slot shows a table with
  **Equipped | New | Δ** columns:
  - Property rows (blue): total, physical and elemental DPS, crit, APS, armour, evasion, ES, ward
    (block was in the first version but was dropped).
  - One row per stat ref found on either item, sorted by |Δ|, and coloured green or red using the
    stat's `better` direction from the stat data.
  - A summary line: "N stats better, M worse".
- The settings page has the hotkey, a how-to note and a list of saved items with Delete buttons.
- Slot matching (`sameSlot`): same `ItemCategory`. Any one-handed weapon matches any other
  one-handed weapon, and the same goes for two-handers. After `534f42d`, up to two rings can be
  saved, and a ring candidate shows tabs so you can pick which ring to compare against.

### 1.2 My Build panel and gear-wide impact (`9e7f672`, `534f42d`)

- A new movable overlay widget, **"My Build"** (`build-summary`, `fa-user-shield` icon in the
  widget menu). It lists every saved equipped item with its icon, its name and a localized slot
  label. A globe icon marks items imported from the site.
- **Character import**: a character-name input with a `<datalist>`, a **List** button and an
  **Import** button.
  - **List** calls `GET {poeWebApi}/character-window/get-characters?accountName=…&realm=pc`.
  - **Import** calls `GET {poeWebApi}/character-window/get-items?accountName=…&character=…&realm=pc`.
  - Both go through `Host.proxy`, the app's `/proxy/` route in `main/src/proxy.ts`. That route
    uses `net.request({ useSessionCookies: true })`, so the request is anonymous unless the user
    has logged in to pathofexile.com in the built-in browser. In that case the POESESSID session
    cookie goes along automatically. The fork never asks for POESESSID or OAuth.
  - The account name comes from the existing **Account name** setting under price check.
  - Privacy: the legacy character-window endpoints only return data for **public** profiles
    unless the request carries the owner's session. The error message says this: "Make sure your
    profile is public (or log in via the builtin Browser)…".
  - Only the 10 gear slots are imported (Weapon, Offhand, Helm, BodyArmour, Gloves, Boots, Belt,
    Amulet, Ring, Ring2). Flasks, jewels, **socketed gems** and the passive tree are ignored.
    Imported items replace saved items in the same categories. Items you saved by hand in other
    categories are kept.
  - `realm=pc` is hard-coded. `poeWebApi()` switches between www, ru and the tw/kakao hosts based
    on the realm setting.
- **Gear totals**: a table that adds up life, %life, ES, %ES, mana, armour, evasion, ward,
  fire/cold/lightning/chaos resistance, attributes, move/attack/cast speed, global crit and crit
  multi, plus **Weapon DPS (est.)** and, later, **Skill DPS (est.)**. A note says "Sums gear only
  (passive tree, gems and buffs are not included)."
- **Gear-wide impact** in the compare widget: when two or more items are saved, a second table,
  "Impact on your gear totals", replaces the matching saved item with the candidate and shows the
  before, after and Δ of each total. If a fire, cold or lightning total was at least 75% and falls
  below 75% after the swap, it shows ⚠ and the warning "This swap drops a resistance below 75%
  (gear only)".

### 1.3 Compare banner in price check (`534f42d`)

- `CompareBanner.vue` is inserted into `CheckedItem.vue` right under the item name, so it
  appears in every normal price check.
- It renders only when at least one saved equipped item fits the same slot. It is a full-width,
  clickable bar:
  - green with ↑ "Better than your equipped item" when (better rows − worse rows) > 0,
  - red with ↓ "Worse than your equipped item" when that number is below 0,
  - grey with = "On par…" when it is 0.
- Clicking the bar expands the same `CompareTables` shown in the compare widget: per-stat Δ,
  gear-wide impact and the resistance warning. Ring tabs appear when two rings are saved.
- **The verdict is a plain count of rows.** "+1 to Strength" outweighs "−80 to maximum Life" if
  there are more small green rows. There is no weighting.

### 1.4 Skill DPS estimate (`e5d25e3`)

- Pressing the compare hotkey on an **active attack skill gem** shows "Attack Damage: X% of base,
  Added Damage Effectiveness: Y%" and a **"This is my main skill"** button.
- The gem is found with regexes on the raw text (`Attack Damage:` / `Effectiveness of Added
  Damage:` in English and Portuguese only). Gems without an Attack Damage line are rejected, so
  **spells are not supported**.
- Skill DPS formula (`build-stats.ts → buildTotals`):

  ```
  avgHit   = (weaponPhys + weaponEle + gearFlatToAttacks × effectiveness) × attackDamage%
  aps      = weaponAPS × (1 + Σ gear %increased Attack Speed)
  crit     = min(100, weaponCrit × (1 + Σ gear %increased Global Crit))
  critMult = 150 + Σ gear +% Global Crit Multi
  skillDps = avgHit × aps × (1 + crit × (critMult − 100))
  ```

  In dual wield, only the weapon with the highest DPS is used. Weapon-local attack speed, crit
  and %phys are skipped on weapons because they already show in the weapon's properties.

### 1.5 Support-gem evaluation (`62a0f68`, `b2d45c6`)

- Pressing the hotkey on a **support gem** lists each "Supported Skills …" line with ✓
  (recognized) or − (ignored, with a tooltip saying it is not used in the estimate). It then
  shows **"If added: +N% skill DPS"** and one row per linked support, **"Replacing X: ±N%"**,
  each with a Replace button. You can link up to 6 supports.
- Recognized support effects: `N% more/less [type] Damage` (scoped to phys/fire/cold/lightning/
  chaos/elemental/all), `N% more/less Attack Speed`, `N% increased Attack Speed`, and
  `N to M added <type> Damage`. Damage-over-time lines (bleed, poison, ignite, "over Time") are
  ignored. `b2d45c6` lets qualifiers appear in the middle ("Supported Attack Skills …").
- The damage model gains per-type buckets. Weapon elemental damage is **split evenly into
  fire/cold/lightning** because it does not know the real split. Gear "Adds # to # Elemental
  Damage to Attacks" is also split in three. The skill's own "X% of Physical Damage Converted to
  Y" lines are applied (phys→element only). Scoped "more" multipliers are applied per bucket.

### 1.6 Skill setups (`1651994`)

- A gem now becomes a **skill setup** (`{ skill, supports[], socketedIn? }`). The widget keeps
  `skillSetups[]` plus a `mainSetup` index. Old `mainSkill`/`supportGems` config is migrated
  lazily the first time `skillSetups()` reads it.
- My Build lists every setup with a ★ that marks the main skill (click to change it), the gem
  icon, "Main/Secondary skill", a **"Socketed in: <gear>"** dropdown, and the linked supports
  indented below. Remove buttons appear on hover.
- Active gem in compare: **"Add as new skill"**, or **Replace** on an existing setup. Linked
  supports are kept.
- Support gem in compare: **"Link to which skill?"** tabs (★ on the main one). The DPS deltas are
  calculated for the selected setup.
- Totals and gear-swap impact always use the **main** setup. `socketedIn` is only stored and
  shown. Nothing reads it in the calculation, and swapping the item a gem sits in does not move
  or remove the gem.

---

## 2. How it works (files and data flow)

```
hotkey ─► main process copy-item(target:'item-compare') ─► MAIN->CLIENT::item-text
        ─► WidgetItemCompare.vue: parseClipboard(rawText)
             ├─ support gem?  support.ts parseSupportGem ─► supportEval via buildTotals ×(n+1)
             ├─ active gem?   skill.ts   parseMainSkill  ─► add/replace SkillSetup
             └─ gear          build-stats.ts gearFromParsedItem ─► GearItem
                               equipped-store.ts equippedMatches(sameSlot)
                               CompareTables.vue: compareStats / compareProperties
                                                  buildTotals(all) vs buildTotals(swapped)

price check ─► CheckedItem.vue ─► CompareBanner.vue (same pipeline, collapsed by default)

My Build ─► character-api.ts fetchCharacters / fetchEquippedItems (Host.proxy → /proxy/)
         ─► convertApiItems: API JSON → ApiItemData (props parsed from "properties",
            mods matched against an English matcher index built from data/en/stats.ndjson)
         ─► saved in ItemCompareWidget.equippedItems[] as { category, api }
```

Key types and functions:

- `GearItem` (`build-stats.ts`): one shape for both clipboard items and API items. It has
  `label`, `slot`, `icon`, `category`, `isWeapon`, `props` {phys, ele, aps, crit, ar, ev, es, ward}
  and `stats: Map<ref, summedValue>`.
- `gearFromParsedItem` reads `ParsedItem.statsByType` (sum of `source.contributes.value`).
- `convertApiItems` / `loadEnMatchers` (`character-api.ts`): the API returns English mod text. The
  fork lazily fetches `data/en/stats.ndjson`, swaps numbers for `#` and maps that text to stat
  refs. The value is the **average of all numbers in the line**, so "Adds 5 to 10" gives 7.5. For a
  hybrid line such as "+20 to Strength and Intelligence" it is still a single number, which is
  fine. Ranges in properties are averaged the same way.
- `CONTRIBUTIONS` (`build-stats.ts`): a hard-coded list of 45 English stat refs mapped to total
  keys. **Checked against this repo's `renderer/public/data/en/stats.ndjson` (9,204 refs): all 45
  refs exist** today. Anything not in the list (e.g. "% increased Elemental Damage with Attack
  Skills", "% increased Physical Damage" from gear, "+# to Accuracy") is silently left out of the
  totals and the DPS.
- Persistence: everything is inside the `item-compare` widget entry in `config.json`. That is the
  raw clipboard text of each item and gem (re-parsed on every computed evaluation) and the
  converted API payload for imported items. `build-summary` only stores `characterName` and its
  anchor.
- Config migrations: `configVersion` 18→19 adds the `item-compare` widget and 19→20 adds
  `build-summary`.

---

## 3. Overlap with this repo

| Fork piece | This repo today |
|---|---|
| Compare with equipped | **Nothing similar.** No saved-equipment concept anywhere in `renderer/src`. |
| Weapon DPS | `item-check/ItemInfo.vue` shows pDPS/eDPS/total for the hovered weapon only. `price-check/filters/pseudo/item-property.ts` builds Q20 DPS filters. |
| Character API | **None.** The only account-related code is `Config.accountName` (price-check settings) used for "own listing" detection. No `character-window` calls. |
| Proxy | `main/src/proxy.ts` already allows `www.pathofexile.com`, `ru.pathofexile.com`, `pathofexile.tw` and `poe.kakaogames.com` with session cookies. The fork's calls would work unchanged. |
| Stat data | `STAT_BY_REF_V2`, `ITEM_BY_REF`, `StatBetter` and `ParsedItem.statsByType`/`weapon*`/`armour*`/`info.icon` all exist here with the same names. |
| Widget infra | Same `WidgetSpec`/`registry.widgets.push` pattern (`overlay/widget-registry.ts`), same `copy-item` host action with a free-form `target` (`ipc/types.ts`). |
| Settings | `settings/SettingsWindow.vue` still has `menuByType` with the same shape. |
| Price-check insertion point | `price-check/CheckedItem.vue` still starts with `<filter-name>` then `<price-trend>`. The banner would go between them. (Upstream's `price-prediction` block, which the fork anchored to, is gone here.) |
| Theming | This repo has a CSS-variable theme system (`renderer/public/themes/default.css`, `tailwind.config.js`). The fork's `bg-green-900`/`text-green-300` classes exist in the Tailwind palette but are **not** theme tokens, so a port should use `surface`/`danger`/`accent` or add tokens. |
| Languages | This repo ships en, ru, ko, cmn-Hant. **No pt.** `skill.ts`/`support.ts` gem regexes only handle en and pt, so gem features would only work for English clients. |

---

## 4. Porting notes and effort

| Piece | Effort | Why |
|---|---|---|
| Item-compare widget + per-stat table | **S–M** | Self-contained folder. Hooks are `widget-registry.ts`, `Config.ts` (new migration at `configVersion` 24, since this repo is already at 23), `getConfigForHost` hotkey, `SettingsWindow.vue`, and i18n for en/ru/ko/cmn-Hant. |
| Compare banner in price check | **S** once the above exists | One component plus one line in `CheckedItem.vue`. The verdict heuristic should be redesigned (see risks). |
| My Build panel + gear totals + res-cap warning | **M** | New widget, plus a hand-kept list of stat refs. Needs tests that pin the ref list against `stats.ndjson` (AGENTS.md "live metadata" rule) and fixtures for the API JSON conversion. |
| Character import | **M** | The code is small, but it needs error UX for private profiles, 403/429 handling, rate-limit headers, realm handling (hard-coded `pc`), and a decision on whether to rely on the legacy endpoint at all. |
| Skill DPS + supports + setups | **L** | Text-regex gem parsing in every client language, a damage model that needs many more stat refs to be useful, a migration for the setup format, and a lot of UI. Hard to test well and hard to keep correct across patches. |

**Overall: L** for the full stack, or **M** for "compare + banner + gear totals" without DPS.

Suggested port order if we go ahead:
1. `compare.ts` + `build-stats.ts` (pure functions, unit-test them first),
2. compare widget,
3. banner,
4. My Build panel without import,
5. import,
6. leave DPS out or make it opt-in behind an "experimental" toggle.

Code-quality notes for a port:
- `parseClipboard` is re-run on every saved item inside computeds, including in the price-check
  banner on every check. Cache the parsed `GearItem` when saving.
- `equippedItems` mixes clipboard text in the active language with English API payloads. The
  totals work because both map to language-neutral stat refs, but `savedName` reads "line 3 of
  the raw text", which breaks for magic/normal items.
- The lazy migration in `skillSetups()` writes to config inside a computed getter. Move it into
  `upgradeConfig`.
- Ring and 1H matching is heuristic. A 1H weapon candidate in dual wield compares against
  whichever 1H was saved first.

---

## 5. Risks

**API / ToS**
- `character-window/get-characters` and `get-items` are GGG's **legacy, undocumented**
  endpoints. Path of Building and similar tools use them too, but GGG's supported route for
  third-party apps is the OAuth API (`/character` scope, which needs a registered client). These
  endpoints have rate limits and have changed without notice before.
- Logging in through the built-in browser sends the real POESESSID with these calls. That is
  the same mechanism trade already uses, but it now covers account data. Privacy-wise, the
  default (public-profile-only) behaviour is safe, and no credentials are stored by the feature.
- The app User-Agent stays `app.userAgentFallback`. GGG asks third-party tools to identify
  themselves. This applies to trade too.

**DPS model accuracy (naive)**
- It ignores the passive tree, jewels, auras, buffs, flasks, charges, enemy resistances,
  accuracy, every "% increased damage" source (gear included), damage-type-specific crit, and
  shock/exposure.
- Weapon elemental damage is split evenly by thirds. Only phys→X conversion is handled.
- Spells, minions, totems/traps/mines and DoT builds get nothing.
- Fine for a **relative** "is this support or weapon better for this one skill" signal. It
  should not be labelled DPS without a strong "estimate" caveat. Numbers will disagree with PoB
  and in-game values, which tends to produce bug reports.
- The banner verdict is an unweighted count of better and worse rows. It is misleading on the
  most common decision (rares with different mod sets) and is the most visible part of the
  feature.
- The resistance warning is gear-only and assumes a 75% cap. It ignores the tree, the
  league/act penalty and max-res mods.

**Maintenance**
- Hard-coded English stat refs (45 today, all present) and per-language gem-text regexes need
  checking every patch, and each new client language needs new regexes.
- PoE2 and other games: PoE2 would need different slot and stat logic.
- Config grows with full item text for 10–12 items plus gems. That is fine for size, but it
  ties `config.json` to parser behaviour.
- About 1,100 lines of new UI and model code with no tests in the fork.

---

## 6. Portuguese language commit (`04ec04d`, note only)

This commit adds a `pt` client language: `renderer/public/data/pt/{app_i18n.json, client_strings.js,
items.ndjson, stats.ndjson}` (about 14k lines), a pt entry in `make-index-files.mjs`, `Config.ts`,
`general.vue`, `client-log.ts` and `hotkeyable-actions.ts`. A later commit (`6acb11f`) adds a pt
data-generation pipeline and parser test harness. It is separate from the compare features,
except that `skill.ts`/`support.ts` hard-code pt and en gem text. Not evaluated further here.
