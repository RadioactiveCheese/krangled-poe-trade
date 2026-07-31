// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TooltipItem from '@/web/price-check/trade/TooltipItem.vue'
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

  it('draws title bands behind Intangibility and Memories values, with the memory icon', () => {
    const result = {
      displayItem: {
        title: ['Fixture Mantle', 'Vaal Regalia'],
        rarity: 'Rare',
        frameType: 2,
        influences: [],
        nameBlock: [
          { text: 'Intangibility: ', value: '12%', color: TradeNumberColors.Augmented },
          { text: 'Memories: ', value: '3', color: TradeNumberColors.Augmented },
          { text: 'Quality: ', value: '+20%', color: TradeNumberColors.Augmented }
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
})
