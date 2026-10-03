// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { createTradeRequest } from '@/web/price-check/trade/pathofexile-trade'
import { FilterTag, type FilterOrGroup, type ItemFilters, type StatFilter } from '@/web/price-check/filters/interfaces'
import { createFilters } from '@/web/price-check/filters/create-item-filters'
import { ItemRarity, type ParsedItem } from '@/parser'
import { StatBetter, type BaseType, type Stat } from '@/assets/data'
import { isMaximumSupportTier } from '@/web/price-check/filters/pseudo/mercenary'

function itemFilters (): ItemFilters {
  const normal = mercenaryBuild('Warpriest', 'AurasMinionsTemplarSmite', { skills: [] })
  const infamous = mercenaryBuild('Infamous Warpriest', 'AurasMinionsTemplarSmiteNoble', 'Warpriest')
  return createFilters({
    info: {
      name: 'Mercenary Warrant',
      refName: 'Mercenary Warrant',
      namespace: 'ITEM',
      icon: '/MercenaryWarrant.png',
      tradeDisc: 'mercenary_warrant'
    },
    rarity: ItemRarity.Normal,
    itemLevel: 83,
    mercenaryBuild: normal,
    mercenaryBuildVariant: infamous,
    mercenaryInfamousVariant: infamous
  } as ParsedItem, {
    league: 'Standard',
    currency: 'chaos',
    collapseListings: 'app',
    activateStockFilter: false,
    exact: true,
    useEn: false
  })
}

function stat (overrides: Partial<StatFilter> & Pick<StatFilter, 'tradeId' | 'statRef'>): StatFilter {
  return {
    text: overrides.statRef,
    tag: FilterTag.MercenarySupport,
    sources: [],
    disabled: false,
    ...overrides
  }
}

describe('Mercenary and Heist grouped trade queries', () => {
  it('recognizes naturally capped support families without treating synthetic lower tiers as maximum', () => {
    const support = mercenaryStat('Knockback', 'mercenary.knockback')
    support.mercenary!.tier = 1
    expect(isMaximumSupportTier(support)).toBe(true)
    support.modFamily = ['Knockback']
    expect(isMaximumSupportTier(support)).toBe(true)
    support.modFamily = ['Knockback', 'Knockback T2', 'Knockback T3']
    support.mercenary!.syntheticFamily = true
    expect(isMaximumSupportTier(support)).toBe(false)
    support.mercenary!.tier = 3
    expect(isMaximumSupportTier(support)).toBe(true)
    support.mercenary!.tier = 4
    expect(isMaximumSupportTier(support)).toBe(true)
  })

  it.each([
    [1, 1, false],
    [1, 2, false],
    [0, 2, true],
    [0, 1, true]
  ])('omits a redundant maximum-tier group only when required/N-1 supports guarantee it (%s, %s)', (required, optional, needsTierGroup) => {
    const families = Array.from({ length: 5 }, (_, index) => [mercenaryStat(`S${index}`, `mercenary.s${index}`)])
    const supports = Array.from({ length: required + optional }, (_, index) => stat({
      tradeId: [`mercenary.s${index}`], statRef: `S${index}`,
      option: { value: index < required ? 1 : 0 },
      mercenary: { tier: 1, maxTier: index === 0 }
    }))
    const request = createTradeRequest(itemFilters(), [{
      group: 'mercenary', expanded: true,
      meta: stat({ tradeId: ['mercenary.skill_primary'], statRef: 'Primary', tag: FilterTag.MercenaryPrimary }),
      stats: [stat({ tradeId: ['item.mercenary_6link'], statRef: '6-Link', tag: FilterTag.Property,
        mercenary: { supportFamilies: families }, roll: roll(1) }), ...supports]
    }])
    // Every six-link query counts all five families; the separate maximum-tier
    // query contains those families with a count of one instead.
    const groups = request.query.stats.filter(group => group.type === 'mercenary')
    expect(groups.length).toBe(needsTierGroup ? 3 : 2)
  })

  it('combines exact build selection with required and optional N-1 Mercenary supports', () => {
    const stats: FilterOrGroup[] = [{
      group: 'mercenary',
      expanded: true,
      meta: stat({
        tradeId: ['mercenary.skill_primary'],
        statRef: 'Primary Skill',
        tag: FilterTag.MercenaryPrimary,
        disabled: true
      }),
      stats: [
        stat({ tradeId: ['mercenary.support_required'], statRef: 'Required', option: { value: 1 } }),
        stat({ tradeId: ['mercenary.support_optional_a'], statRef: 'Optional A', option: { value: 0 } }),
        stat({ tradeId: ['mercenary.support_optional_b'], statRef: 'Optional B', option: { value: 0 } })
      ]
    }]

    const request = createTradeRequest(itemFilters(), stats)
    expect(request.query.type).toEqual({
      discriminator: 'mercenary_warrant',
      option: 'AurasMinionsTemplarSmiteNoble'
    })
    expect(request.query.stats[0].filters).toContainEqual({
      id: 'mercenary.skill_primary',
      value: { min: undefined, max: undefined, option: undefined },
      disabled: false
    })

    const optionalGroup = request.query.stats.find(group => group.type === 'mercenary')
    expect(optionalGroup?.value).toEqual({ min: 5 })
    expect(optionalGroup?.filters.map(filter => filter.id)).toEqual([
      'mercenary.skill_primary',
      'mercenary.skill_primary',
      'mercenary.support_required',
      'mercenary.support_required',
      'mercenary.support_optional_a',
      'mercenary.support_optional_b'
    ])
  })

  it('can switch normal and Infamous variants or relax the exact build', () => {
    const filters = itemFilters()
    expect(filters.mercenaryBuild?.variants).toEqual({
      normal: { value: 'Warpriest', tradeId: 'AurasMinionsTemplarSmite' },
      infamous: { value: 'Infamous Warpriest', tradeId: 'AurasMinionsTemplarSmiteNoble' }
    })

    filters.mercenaryBuild!.tradeId = filters.mercenaryBuild!.variants!.normal.tradeId
    expect(createTradeRequest(filters, []).query.type).toEqual({
      discriminator: 'mercenary_warrant',
      option: 'AurasMinionsTemplarSmite'
    })

    filters.mercenaryBuild!.disabled = true
    expect(createTradeRequest(filters, []).query.type).toEqual({
      discriminator: 'mercenary_warrant',
      option: 'Mercenary Warrant'
    })
  })

  it('serializes six-link support families without synthetic modifier sources', () => {
    const families = Array.from({ length: 5 }, (_, index) => [mercenaryStat(
      `Support ${index + 1}`,
      `mercenary.support_${index + 1}`
    )])
    const sixLink = stat({
      tradeId: ['item.mercenary_6link'],
      statRef: '6-Link',
      tag: FilterTag.Property,
      mercenary: { supportFamilies: families },
      roll: roll(0)
    })

    const request = createTradeRequest(itemFilters(), [{
      group: 'mercenary',
      expanded: true,
      meta: stat({
        tradeId: ['mercenary.skill_primary'],
        statRef: 'Primary Skill',
        tag: FilterTag.MercenaryPrimary
      }),
      stats: [sixLink]
    }])

    expect(sixLink.sources).toEqual([])
    const sixLinkGroup = request.query.stats.find(group => group.type === 'mercenary')
    expect(sixLinkGroup?.filters.map(filter => filter.id)).toEqual(expect.arrayContaining(
      families.map(family => family[0].trade.ids.pseudo[0])
    ))
  })

  it('serializes revealed and total Heist wings exactly once through property filters', () => {
    const stats: FilterOrGroup[] = [
      stat({
        tradeId: ['item.heist_wings_revealed'],
        statRef: 'Wings Revealed',
        tag: FilterTag.Property,
        roll: roll(3)
      }),
      stat({
        tradeId: ['item.heist_wings_total'],
        statRef: 'Total Wings',
        tag: FilterTag.Property,
        roll: roll(4)
      })
    ]

    const request = createTradeRequest(itemFilters(), stats)
    expect(request.query.filters.heist_filters?.filters.heist_wings).toEqual({ min: 3 })
    expect(request.query.filters.heist_filters?.filters.heist_max_wings).toEqual({ min: 4 })
  })
})

function roll (value: number): NonNullable<StatFilter['roll']> {
  return {
    value,
    min: value,
    max: undefined,
    default: { min: value, max: value },
    dp: false,
    isNegated: false
  }
}

function mercenaryStat (ref: string, tradeId: string): Stat {
  return {
    ref,
    matchers: [{ string: ref }],
    better: StatBetter.NotComparable,
    mercenary: { tier: 3 },
    trade: { ids: { pseudo: [tradeId] } }
  }
}

function mercenaryBuild (
  refName: string,
  mercenaryTradeId: string,
  mercenaryBuild: BaseType['mercenaryBuild']
): BaseType {
  return {
    name: refName,
    refName,
    namespace: 'MERCENARY_BUILD',
    icon: '',
    mercenaryBuild,
    mercenaryTradeId
  }
}
