<template>
  <div v-if="item" class="flex flex-row items-start max-w-[48rem] shadow-2xl">
    <div v-if="item.icon" class="flex-none bg-gray-800 bg-opacity-80 self-stretch flex items-center">
      <ui-detailed-item-img
        :icon="item.icon.url"
        :item-width="item.icon.w"
        :item-height="item.icon.h"
        :sockets="item.sockets"
      />
    </div>
    <div class="flex flex-col min-w-[22rem] max-w-[36rem] bg-black text-center border border-gray-700 font-poe">
      <div
        class="relative flex flex-col items-center justify-center text-base px-12 leading-tight overflow-hidden font-poe-sc"
        :class="$style[`${frameRarity}-title`]"
      >
        <div v-if="item.title.length" class="relative z-10">{{ item.title[0] }}</div>
        <div v-if="item.title.length > 1" class="relative z-10">{{ item.title[1] }}</div>
        <span
          v-for="cap in capMarkers"
          :key="cap.side"
          data-testid="header-cap"
          :data-influence="cap.kind === 'influence' ? cap.type : undefined"
          :data-symbol="cap.kind === 'symbol' ? cap.type : undefined"
          :title="cap.label"
          class="absolute top-1/2 -translate-y-1/2 w-7 h-7 z-20 pointer-events-none drop-shadow"
          :class="cap.side === 'l' ? 'left-1.5' : 'right-1.5'"
        >
          <img :src="cap.icon" :alt="cap.label" class="block w-full h-full">
        </span>
      </div>
      <div class="flex flex-col px-3 py-1 text-sm leading-snug">
        <template v-for="(section, index) in sections" :key="section.key">
          <div
            v-if="section.key === 'explicitMods' && frameRarity !== 'Unique' && makeupViewEnabled && makeupGroups.length"
            data-testid="affix-makeup"
          >
            <template v-for="(group, groupIndex) in makeupGroups" :key="group[0].side">
              <div v-if="groupIndex > 0" :class="$style['affix-group-separator']" />
              <div
                v-for="affix in group"
                :key="`${affix.modName}-${affix.tier}-${affix.lines[0].text}`"
                data-testid="affix-row"
                class="grid grid-cols-[1.5rem_minmax(13rem,1fr)_6rem] items-center min-h-[1.375rem]"
              >
                <span
                  class="text-xs text-right"
                  :class="tierClass(affix.lines[0])"
                >{{ affix.tier ?? '' }}</span>
                <span class="text-center">
                  <template v-for="({ line, art }, lineIndex) in affix.rows" :key="`${line.text}-${lineIndex}`">
                    <img
                      v-if="art"
                      :src="art"
                      :alt="line.text"
                      class="block w-full h-5 object-contain"
                      draggable="false"
                    >
                    <span v-else class="block" :class="$style[`number-color-${line.color}`]">{{ line.text }}</span>
                  </template>
                </span>
                <span :class="$style['affix-mod-name']">{{ affix.modName }}</span>
              </div>
            </template>
          </div>
          <div v-else-if="section.content?.length">
            <div
              v-for="({ line, veiledArt, bandStyle, bandIcon }, lineIndex) in section.content"
              :key="`${line.text}-${lineIndex}`"
              data-testid="modifier-line"
              :data-mod-influence="line.influence"
              class="grid grid-cols-[3.25rem_1fr_3.25rem] items-center"
              :style="bandStyle"
            >
              <span
                class="text-xs text-left pl-0.5"
                :class="line.influence ? $style[`influence-${line.influence}`] : tierClass(line)"
              >{{ gutterTier(line) }}</span>
              <img
                v-if="veiledArt"
                :src="veiledArt"
                :alt="line.text"
                class="block w-full h-5 object-contain"
                draggable="false"
              >
              <span v-else class="text-center whitespace-pre-line">
                <span
                  v-if="inlineTier(line)"
                  :class="line.influence ? $style[`influence-${line.influence}`] : 'text-poe-tier-neutral'"
                >{{ inlineTier(line) + ' ' }}</span>
                <span :class="line.influence ? $style[`influence-${line.influence}`] : line.value != null ? 'text-gray-400' : $style[`number-color-${line.color}`]">{{ line.text }}</span>
                <span v-if="line.value != null" :class="line.influence ? $style[`influence-${line.influence}`] : $style[`number-color-${line.color}`]">{{ line.value }}</span>
                <img
                  v-if="bandIcon"
                  :src="bandIcon"
                  alt=""
                  class="inline-block h-4 align-text-bottom ml-1"
                  draggable="false"
                >
              </span>
              <span />
            </div>
          </div>
          <template v-if="dividerVisible[index]">
            <div
              v-if="frameRarity !== 'Normal'"
              :class="$style[`${frameRarity}-separator`]"
            />
            <hr
              v-else
              class="block h-[2px] bg-gradient-to-r from-transparent via-gray-400 to-transparent my-1 border-0"
            >
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import type { PricingResult } from './pathofexile-trade'
import { groupAffixesByMod, makeupViewEnabled } from './trade-tooltip'
import type { DisplayInfluence, DisplayItemLine, DisplayItemSymbol } from './trade-tooltip'
import UiDetailedItemImg from '@/web/ui/UiDetailedItemImg.vue'

const props = defineProps<{
  result: PricingResult
}>()

const item = computed(() => props.result.displayItem)

const INFLUENCE_CAPS: Record<DisplayInfluence, { label: string, icon: string }> = {
  'shaper': { label: 'Shaper', icon: '/images/influence-Shaper.png' },
  'elder': { label: 'Elder', icon: '/images/influence-Elder.png' },
  'crusader': { label: 'Crusader', icon: '/images/influence-Crusader.png' },
  'hunter': { label: 'Hunter', icon: '/images/influence-Hunter.png' },
  'redeemer': { label: 'Redeemer', icon: '/images/influence-Redeemer.png' },
  'warlord': { label: 'Warlord', icon: '/images/influence-Warlord.png' },
  'searing-exarch': { label: 'Searing Exarch', icon: '/images/influence-SearingExarch.png' },
  'eater-of-worlds': { label: 'Eater of Worlds', icon: '/images/influence-EaterOfWorlds.png' }
}

const ITEM_SYMBOL_CAPS: Record<DisplayItemSymbol, { label: string, icon: string }> = {
  foresight: { label: 'Foresight (Hinekora\'s Lock)', icon: '/images/item-symbols/foresight.png' },
  breach: { label: 'Foulborn', icon: '/images/item-symbols/breach.png' },
  vestigial: { label: 'Vestigial', icon: '/images/item-symbols/vestigial.png' },
  synthesised: { label: 'Synthesised', icon: '/images/item-symbols/synthesised.png' },
  veiled: { label: 'Veiled', icon: '/images/item-symbols/veiled.png' },
  memory: { label: 'Memory Strands', icon: '/images/item-symbols/memory.png' }
}

/* The two header caps hold at most two markers: influence emblems first
   (the game's and trade site's idiom), item symbols fill what's left, and a
   lone marker is mirrored into both caps. */
const capMarkers = computed(() => {
  const display = item.value
  if (!display) return []
  const markers = [
    ...display.influences.map(type => ({ kind: 'influence' as const, type: type as string, ...INFLUENCE_CAPS[type] })),
    ...(display.symbols ?? []).map(type => ({ kind: 'symbol' as const, type: type as string, ...ITEM_SYMBOL_CAPS[type] }))
  ].slice(0, 2)
  if (!markers.length) return []
  return [
    { side: 'l' as const, ...markers[0] },
    { side: 'r' as const, ...(markers[1] ?? markers[0]) }
  ]
})

const frameRarity = computed(() => {
  const byFrame = ['Normal', 'Magic', 'Rare', 'Unique']
  const fromFrame = props.result.displayItem?.frameType != null
    ? byFrame[props.result.displayItem.frameType]
    : undefined
  if (fromFrame) return fromFrame
  const rarity = props.result.displayItem?.rarity
  return byFrame.includes(rarity ?? '') ? rarity! : 'Normal'
})

/* Derived per-line display data, computed once per line here rather than
   re-derived in every template binding. */
interface DisplayRow {
  line: DisplayItemLine
  veiledArt?: string
  bandStyle?: CSSProperties
  bandIcon?: string
}

function toDisplayRow (line: DisplayItemLine): DisplayRow {
  const band = VALUE_BANDS.find(band => band.match(line))
  return {
    line,
    veiledArt: veiledArt(line),
    bandStyle: band && {
      backgroundImage: `url(${band.art})`,
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center'
    },
    bandIcon: band?.icon
  }
}

const sections = computed(() => {
  const display = item.value
  if (!display) return []
  const result: Array<{ key: string, content?: DisplayItemLine[] }> = [
    { key: 'nameBlock', content: display.nameBlock },
    { key: 'itemProps', content: display.itemProps },
    { key: 'enchantMods', content: display.enchantMods },
    { key: 'implicitMods', content: display.implicitMods },
    {
      key: 'explicitMods',
      // Source order, like the trade site — it does NOT group prefixes first.
      content: [
        display.fracturedMods,
        display.explicitMods,
        display.craftedMods,
        display.veiledMods
      ].flatMap(group => group ?? [])
    },
    // One section for all tags, so no separator lands between them.
    { key: 'itemTags', content: display.itemTags }
  ]
  return result.map(({ key, content }) => ({ key, content: content?.map(toDisplayRow) }))
})

const dividerVisible = computed(() => sections.value.map((section, index) => {
  return Boolean(section.content?.length) && sections.value.slice(index + 1).some(next => Boolean(next.content?.length))
}))

/* The item-makeup view: an alternative to trade-site parity — one row per
   modifier, prefixes before suffixes, the affix name in a stable right
   column. Toggled by the button in the results header (makeupViewEnabled). */
const makeupGroups = computed(() => {
  const display = item.value
  if (!display) return []
  const affixes = groupAffixesByMod([
    display.fracturedMods,
    display.explicitMods,
    display.craftedMods,
    display.veiledMods
  ]).map(affix => ({
    ...affix,
    rows: affix.lines.map(line => ({ line, art: veiledArt(line) }))
  }))
  return [
    affixes.filter(affix => affix.side === 'prefix'),
    affixes.filter(affix => affix.side === 'suffix')
  ].filter(group => group.length)
})

/* Numeric tiers sit in the left gutter; word tiers (eldritch
   "Lesser".."Perfect") read as part of the mod, so they go inline.
   P = prefix, S = suffix, R = the rank the trade API reports for
   crafted/bench mods ("R2") — ranks belong in the gutter but carry the
   neutral colour since they are neither prefix nor suffix. */
function isNumericTier (tier: string): boolean {
  return /^[PSR]\d/.test(tier)
}
function gutterTier (line: DisplayItemLine): string {
  return line.tier && isNumericTier(line.tier) ? line.tier : ''
}
function inlineTier (line: DisplayItemLine): string {
  return line.tier && !isNumericTier(line.tier) ? line.tier : ''
}
function tierClass (line: DisplayItemLine): string {
  if (!line.tier) return ''
  if (line.tier.startsWith('P')) return 'text-poe-tier-prefix'
  if (line.tier.startsWith('S')) return 'text-poe-tier-suffix'
  return 'text-poe-tier-neutral'
}

/* Certain named values carry the game's own chrome: a title band drawn
   behind the row, and for Memory Strands a crystal icon beside the value.
   Matched on the API's property type (stable across locales), with the
   English text as a fallback for lines that arrive without one. */
const VALUE_BANDS: Array<{ match: (line: DisplayItemLine) => boolean, art: string, icon?: string }> = [
  {
    match: line => line.propType === 110 || /^Intangibility\b/.test(line.text),
    art: '/images/item-display/intangibility-title.png'
  },
  {
    match: line => line.propType === 99 || /^Memor(?:y Strands|ies)\b/.test(line.text),
    art: '/images/item-display/memory-title.png',
    icon: '/images/item-display/memory-icon.png'
  }
]

/* The ornate strip IS the unrevealed modifier — it replaces the text row.
   One of six variants, picked per tooltip the way the game varies them.
   Unrecognized (localized) veiled labels keep their text. */
const veiledVariant = Math.floor(Math.random() * 6) + 1
function veiledArt (line: DisplayItemLine): string | undefined {
  if (line.modCategory !== 'veiled') return undefined
  const side = line.text === 'Unrevealed Prefix'
    ? 'prefix'
    : line.text === 'Unrevealed Suffix' ? 'suffix' : undefined
  if (!side) return undefined
  return `/images/veiled/${side}_0${veiledVariant}a.png`
}
</script>

<style lang="postcss" module>
.Magic-separator,
.Rare-separator,
.Unique-separator {
  @apply bg-center bg-no-repeat h-1;
}
.Magic-separator { @apply bg-[url(/images/item-display/separator-magic.png)]; }
.Rare-separator { @apply bg-[url(/images/item-display/separator-rare.png)]; }
.Unique-separator { @apply bg-[url(/images/item-display/separator-unique.png)]; }

/* Soft divider between the prefix and suffix groups of the makeup view. */
.affix-group-separator {
  @apply h-[2px] my-1 bg-center bg-no-repeat opacity-40;
  background-image: url('/images/item-display/separator-rare.png');
}
.affix-mod-name {
  @apply pl-2 self-center text-right text-xs;
  color: #8b8b7a;
  line-height: 1.15;
}

/* rem throughout, so the frame art tracks the app font-size setting. */
.Normal-title,
.Magic-title {
  @apply h-[2.125rem];
}
.Rare-title,
.Unique-title {
  @apply h-14;
}
.Normal-title {
  @apply text-normal;
  background-image: url('/images/item-display/normal-left.png'), url('/images/item-display/normal-right.png'), url('/images/item-display/normal-middle.png');
  background-position: top left, top right, top center;
  background-repeat: no-repeat, no-repeat, repeat-x;
  background-size: 1.8125rem auto, 1.8125rem auto, 1.8125rem auto;
}
.Magic-title {
  @apply text-magic;
  background-image: url('/images/item-display/magic-left.png'), url('/images/item-display/magic-right.png'), url('/images/item-display/magic-middle.png');
  background-position: top left, top right, top center;
  background-repeat: no-repeat, no-repeat, repeat-x;
  background-size: 1.8125rem auto, 1.8125rem auto, 1.8125rem auto;
}
.Rare-title {
  @apply text-rare;
  background-image: url('/images/item-display/rare-double-left.png'), url('/images/item-display/rare-double-right.png'), url('/images/item-display/rare-double-middle.png');
  background-position: top left, top right, top center;
  background-repeat: no-repeat, no-repeat, repeat-x;
  background-size: 2.875rem auto, 2.875rem auto, 2.875rem auto;
}
.Unique-title {
  @apply text-unique;
  background-image: url('/images/item-display/unique-double-left.png'), url('/images/item-display/unique-double-right.png'), url('/images/item-display/unique-double-middle.png');
  background-position: top left, top right, top center;
  background-repeat: no-repeat, no-repeat, repeat-x;
  background-size: 2.875rem auto, 2.875rem auto, 2.875rem auto;
}

.influence-searing-exarch { color: #ff6a3d; }
.influence-eater-of-worlds { color: #3ad1c0; }

.number-color-0 { @apply text-white; }
.number-color-1 { @apply text-poe-augmented; }
.number-color-2 { @apply text-poe-unmet; }
.number-color-3 { @apply text-normal; }
.number-color-4 { @apply text-poe-fire; }
.number-color-5 { @apply text-poe-cold; }
.number-color-6 { @apply text-poe-lightning; }
.number-color-7 { @apply text-poe-chaos; }
.number-color-8 { @apply text-unique; }
.number-color-10 { @apply text-poe-currency; }
.number-color-12 { @apply text-poe-divination; }
.number-color-8729 {
  @apply text-poe-enchant;
}
.number-color-8730 {
  @apply text-poe-fractured;
}
.number-color-8734 {
  @apply text-poe-crafted;
}
</style>
