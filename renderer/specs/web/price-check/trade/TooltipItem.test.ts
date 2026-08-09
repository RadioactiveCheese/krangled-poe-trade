// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TooltipItem from '@/web/price-check/trade/TooltipItem.vue'
import { makeupViewEnabled } from '@/web/price-check/trade/trade-tooltip'

afterEach(() => {
  makeupViewEnabled.value = false
})
import type { PricingResult } from '@/web/price-check/trade/pathofexile-trade'
import { TradeNumberColors, type DisplayInfluence, type DisplayItemLine, type DisplayItemSymbol } from '@/web/price-check/trade/trade-tooltip'

const ALL_INFLUENCES: DisplayInfluence[] = [
  'shaper',
  'elder',
  'crusader',
  'hunter',
  'redeemer',
  'warlord',
  'searing-exarch',
  'eater-of-worlds'
]

function mountTooltip (
  influences: DisplayInfluence[],
  implicitMods?: DisplayItemLine[],
  symbols?: DisplayItemSymbol[]
) {
  const result = {
    displayItem: {
      title: ['Fixture Mantle', 'Vaal Regalia'],
      rarity: 'Rare',
      frameType: 2,
      influences,
      symbols,
      implicitMods
    }
  } as unknown as PricingResult

  return mount(TooltipItem, {
    props: { result },
    global: {
      stubs: { UiDetailedItemImg: true }
    }
  })
}

describe('Trade listing tooltip header caps', () => {
  it('shows roll ranges and item-level requirements in makeup rows', async () => {
    makeupViewEnabled.value = true
    const wrapper = mountTooltip([], undefined)
    await wrapper.setProps({
      result: {
        displayItem: {
          title: ['Corpse Coat', 'Royal Plate'],
          rarity: 'Rare',
          influences: [],
          explicitMods: [{
            text: '107% increased Armour',
            color: 1,
            tier: 'P3 + P4',
            modName: 'Girded + Armadillo’s',
            modCategory: 'explicit',
            affixParts: [
              { name: 'Girded', tier: 'P3', level: 72, range: '80–91' },
              { name: 'Armadillo’s', tier: 'P4', level: 29, range: '21–26' }
            ]
          }]
        }
      } as unknown as PricingResult
    })

    const row = wrapper.find('[data-testid="affix-row"]')
    expect(row.text()).toContain('P3 [80–91] + P4 [21–26]')
    expect(row.text()).toContain('Girded (≥72) + Armadillo’s (≥29)')
  })

  it('renders the trade-site summary footer', () => {
    const wrapper = mount(TooltipItem, {
      props: {
        result: {
          displayItem: {
            title: ['Blight Burst', 'Karui Maul'],
            rarity: 'Rare',
            influences: [],
            summary: [
              { label: 'DPS', value: '339' },
              { label: 'Physical DPS', value: '227.5', color: 'physical' },
              { label: 'Elemental DPS', value: '111.5', color: 'elemental' }
            ]
          }
        } as unknown as PricingResult
      },
      global: { stubs: { UiDetailedItemImg: true } }
    })

    expect(wrapper.find('[data-testid="item-summary"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="item-summary-value"]').map(row => row.text()))
      .toEqual(['DPS:339', 'Physical DPS:227.5', 'Elemental DPS:111.5'])
  })

  it('renders every supplied defence for hybrid armour', () => {
    const wrapper = mount(TooltipItem, {
      props: {
        result: {
          displayItem: {
            title: ['Hybrid Fixture', 'Armour'],
            rarity: 'Rare',
            influences: [],
            summary: [
              { label: 'Base Percentile', value: '72%' },
              { label: 'Armour', value: '1240' },
              { label: 'Evasion Rating', value: '980' },
              { label: 'Energy Shield', value: '210' },
              { label: 'Ward', value: '85' }
            ]
          }
        } as unknown as PricingResult
      },
      global: { stubs: { UiDetailedItemImg: true } }
    })

    expect(wrapper.findAll('[data-testid="item-summary-value"]').map(row => row.text()))
      .toEqual([
        'Base Percentile:72%',
        'Armour:1240',
        'Evasion Rating:980',
        'Energy Shield:210',
        'Ward:85'
      ])
  })

  it('seats the first two influences in the header caps, in order', () => {
    const wrapper = mountTooltip(ALL_INFLUENCES)
    const caps = wrapper.findAll('[data-testid="header-cap"]')

    expect(caps).toHaveLength(2)
    expect(caps.map(cap => cap.attributes('data-influence'))).toEqual(['shaper', 'elder'])
    expect(caps.map(cap => cap.attributes('title'))).toEqual(['Shaper', 'Elder'])
    expect(caps[0].find('img').attributes('src')).toBe('/images/influence-Shaper.png')
  })

  it('mirrors a lone influence into both caps', () => {
    const caps = mountTooltip(['elder']).findAll('[data-testid="header-cap"]')
    expect(caps.map(cap => cap.attributes('data-influence'))).toEqual(['elder', 'elder'])
  })

  it('renders the Searing Exarch and Eater of Worlds emblem art', () => {
    const wrapper = mountTooltip(['searing-exarch', 'eater-of-worlds'])
    expect(wrapper.find('[data-influence="searing-exarch"] img').attributes('src'))
      .toBe('/images/influence-SearingExarch.png')
    expect(wrapper.find('[data-influence="eater-of-worlds"] img').attributes('src'))
      .toBe('/images/influence-EaterOfWorlds.png')
  })

  it('fills leftover cap slots with item symbols, influence first', () => {
    const wrapper = mountTooltip(['shaper'], undefined, ['synthesised'])
    const caps = wrapper.findAll('[data-testid="header-cap"]')
    expect(caps[0].attributes('data-influence')).toBe('shaper')
    expect(caps[1].attributes('data-symbol')).toBe('synthesised')
    expect(caps[1].find('img').attributes('src')).toBe('/images/item-symbols/synthesised.png')
  })

  it('mirrors a lone item symbol when there is no influence', () => {
    const caps = mountTooltip([], undefined, ['veiled']).findAll('[data-testid="header-cap"]')
    expect(caps.map(cap => cap.attributes('data-symbol'))).toEqual(['veiled', 'veiled'])
  })

  it('marks items with Hinekora\'s Lock applied with the foresight emblem', () => {
    const caps = mountTooltip([], undefined, ['foresight']).findAll('[data-testid="header-cap"]')
    expect(caps.map(cap => cap.attributes('data-symbol'))).toEqual(['foresight', 'foresight'])
    expect(caps[0].find('img').attributes('src')).toBe('/images/item-symbols/foresight.png')
  })

  it('renders the Foulborn, Vestigial, and Memory Strand symbol art', () => {
    const breach = mountTooltip([], undefined, ['breach', 'vestigial']).findAll('[data-testid="header-cap"]')
    expect(breach.map(cap => cap.attributes('data-symbol'))).toEqual(['breach', 'vestigial'])
    expect(breach[0].attributes('title')).toBe('Foulborn')
    expect(breach[0].find('img').attributes('src')).toBe('/images/item-symbols/breach.png')
    expect(breach[1].find('img').attributes('src')).toBe('/images/item-symbols/vestigial.png')

    const memory = mountTooltip([], undefined, ['memory']).findAll('[data-testid="header-cap"]')
    expect(memory.map(cap => cap.attributes('data-symbol'))).toEqual(['memory', 'memory'])
    expect(memory[0].find('img').attributes('src')).toBe('/images/item-symbols/memory.png')
  })

  it('renders no caps when the API reports no influence or symbols', () => {
    expect(mountTooltip([]).findAll('[data-testid="header-cap"]')).toHaveLength(0)
  })
})

describe('Trade listing tooltip modifier lines', () => {
  it('colors only associated Eldritch implicit lines and renders their tiers', () => {
    const wrapper = mountTooltip(
      ['searing-exarch', 'eater-of-worlds'],
      [
        {
          text: '+12% to all Elemental Resistances',
          color: TradeNumberColors.Augmented
        },
        {
          text: '5% Chance to Block Spell Damage',
          tier: 'Lesser',
          color: TradeNumberColors.Augmented,
          influence: 'eater-of-worlds'
        },
        {
          text: '17% increased Global Physical Damage',
          tier: 'Lesser',
          color: TradeNumberColors.Augmented,
          influence: 'searing-exarch'
        }
      ]
    )

    const ordinary = wrapper.findAll('[data-testid="modifier-line"]')
      .find(line => line.text() === '+12% to all Elemental Resistances')!
    const eater = wrapper.find('[data-mod-influence="eater-of-worlds"]')
    const exarch = wrapper.find('[data-mod-influence="searing-exarch"]')

    expect(ordinary.text()).toBe('+12% to all Elemental Resistances')
    expect(ordinary.html()).not.toContain('influence-eater-of-worlds')
    expect(ordinary.html()).not.toContain('influence-searing-exarch')
    expect(eater.text()).toContain('Lesser')
    expect(eater.html()).toContain('influence-eater-of-worlds')
    expect(exarch.text()).toContain('Lesser')
    expect(exarch.html()).toContain('influence-searing-exarch')
  })

  it('puts numeric tiers in the left gutter and keeps word tiers inline with the mod', () => {
    const wrapper = mountTooltip([], [
      { text: '+97 to maximum Energy Shield', tier: 'P1', color: TradeNumberColors.Augmented },
      { text: 'Intangibility', tier: 'Greater', color: TradeNumberColors.Augmented }
    ])

    const [numeric, word] = wrapper.findAll('[data-testid="modifier-line"]')
    expect(numeric.find('.text-poe-tier-prefix').text()).toBe('P1')
    expect(word.text()).toContain('Greater Intangibility')
  })

  it('renders crafted-mod ranks (R-prefix) in the gutter with the neutral colour', () => {
    const wrapper = mountTooltip([], [
      { text: '63% increased Energy Shield', tier: 'R2', color: TradeNumberColors.Crafted }
    ])
    const line = wrapper.find('[data-testid="modifier-line"]')
    expect(line.find('.text-poe-tier-neutral').text()).toBe('R2')
    expect(line.text()).not.toContain('R2 63%')
  })

  it('draws title bands behind Intangibility and Memory Strand values, with the memory icon', () => {
    const result = {
      displayItem: {
        title: ['Fixture Mantle', 'Vaal Regalia'],
        rarity: 'Rare',
        frameType: 2,
        influences: [],
        nameBlock: [
          // Property types as the live API reports them: 110 = Intangibility,
          // 99 = Memory Strands, 6 = Quality.
          { text: 'Intangibility: ', value: '8%', color: TradeNumberColors.White, propType: 110 },
          { text: 'Memory Strands: ', value: '74', color: TradeNumberColors.White, propType: 99 },
          { text: 'Quality: ', value: '+20%', color: TradeNumberColors.Augmented, propType: 6 }
        ]
      }
    } as unknown as PricingResult
    const wrapper = mount(TooltipItem, {
      props: { result },
      global: { stubs: { UiDetailedItemImg: true } }
    })

    const [intangibility, memories, quality] = wrapper.findAll('[data-testid="modifier-line"]')
    expect(intangibility.attributes('style')).toContain('/images/item-display/intangibility-title.png')
    expect(intangibility.find('img').exists()).toBe(false)
    expect(memories.attributes('style')).toContain('/images/item-display/memory-title.png')
    expect(memories.find('img').attributes('src')).toBe('/images/item-display/memory-icon.png')
    expect(quality.attributes('style')).toBeUndefined()
  })

  it('falls back to matching band lines by text when no property type is present', () => {
    const wrapper = mountTooltip([], [
      { text: 'Intangibility: 8%', color: TradeNumberColors.Augmented },
      { text: 'Memory Strands: 74', color: TradeNumberColors.Augmented }
    ])
    const [intangibility, memories] = wrapper.findAll('[data-testid="modifier-line"]')
    expect(intangibility.attributes('style')).toContain('intangibility-title.png')
    expect(memories.attributes('style')).toContain('memory-title.png')
  })

  it('regroups the affix block by underlying mod while the makeup toggle is on', async () => {
    const result = {
      displayItem: {
        title: ['Fixture Mantle', 'Vaal Regalia'],
        rarity: 'Rare',
        frameType: 2,
        influences: [],
        explicitMods: [
          { text: '+17 to Strength', tier: 'S8', color: TradeNumberColors.Augmented, modCategory: 'explicit', modName: 'of the Apt' },
          { text: '+18 to Dexterity', tier: 'S8', color: TradeNumberColors.Augmented, modCategory: 'explicit', modName: 'of the Apt' },
          { text: '+123 to maximum Life', tier: 'P1', color: TradeNumberColors.Augmented, modCategory: 'explicit', modName: 'Vigorous' }
        ],
        veiledMods: [
          { text: 'Unrevealed Suffix', color: TradeNumberColors.Augmented, modCategory: 'veiled' }
        ]
      }
    } as unknown as PricingResult
    const wrapper = mount(TooltipItem, {
      props: { result },
      global: { stubs: { UiDetailedItemImg: true } }
    })

    // Default view: trade-site parity — flat lines in source order.
    expect(wrapper.find('[data-testid="affix-makeup"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="modifier-line"]')).toHaveLength(4)

    makeupViewEnabled.value = true
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('[data-testid="affix-row"]')
    expect(rows).toHaveLength(3)
    // Prefixes first; the hybrid mod's two stat lines share one row with
    // its name in the right column.
    expect(rows[0].text()).toContain('+123 to maximum Life')
    expect(rows[0].text()).toContain('Vigorous')
    expect(rows[1].text()).toContain('+17 to Strength')
    expect(rows[1].text()).toContain('+18 to Dexterity')
    expect(rows[1].text()).toContain('of the Apt')
    expect(rows[2].find('img').attributes('src')).toMatch(/^\/images\/veiled\/suffix_0[1-6]a\.png$/)

    makeupViewEnabled.value = false
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="affix-makeup"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="modifier-line"]')).toHaveLength(4)
  })

  it('renders unrevealed veiled mods as the ornament image instead of text', () => {
    const result = {
      displayItem: {
        title: ['Fixture Mantle', 'Vaal Regalia'],
        rarity: 'Rare',
        frameType: 2,
        influences: [],
        veiledMods: [
          { text: 'Unrevealed Suffix', color: TradeNumberColors.Augmented, modCategory: 'veiled' },
          { text: 'Préfixe voilé', color: TradeNumberColors.Augmented, modCategory: 'veiled' }
        ]
      }
    } as unknown as PricingResult
    const wrapper = mount(TooltipItem, {
      props: { result },
      global: { stubs: { UiDetailedItemImg: true } }
    })

    const lines = wrapper.findAll('[data-testid="modifier-line"]')
    const ornament = lines[0].find('img')
    expect(ornament.attributes('src')).toMatch(/^\/images\/veiled\/suffix_0[1-6]a\.png$/)
    expect(lines[0].text()).not.toContain('Unrevealed Suffix')
    // Unrecognized localized labels keep their text.
    expect(lines[1].find('img').exists()).toBe(false)
    expect(lines[1].text()).toContain('Préfixe voilé')
  })

  it('keeps unique item tooltips in the standard view when makeup mode is enabled', async () => {
    const result = {
      displayItem: {
        title: ['Fixture Unique', 'Vaal Regalia'],
        rarity: 'Unique',
        frameType: 3,
        influences: [],
        explicitMods: [
          { text: '+123 to maximum Life', tier: 'P1', color: TradeNumberColors.Unique, modCategory: 'explicit', modName: 'Vigorous' }
        ]
      }
    } as unknown as PricingResult
    const wrapper = mount(TooltipItem, {
      props: { result },
      global: { stubs: { UiDetailedItemImg: true } }
    })

    const previousMakeupView = makeupViewEnabled.value
    try {
      makeupViewEnabled.value = true
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="affix-makeup"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-testid="modifier-line"]')).toHaveLength(1)
    } finally {
      makeupViewEnabled.value = previousMakeupView
    }
  })
})
