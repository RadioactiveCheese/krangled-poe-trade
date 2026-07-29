import { describe, expect, it, vi } from 'vitest'
import type { ItemFilters } from '@/web/price-check/filters/interfaces'

vi.mock('@/web/Config', () => ({
  poeWebApi: () => 'www.pathofexile.com'
}))

import { createTradeRequest } from '@/web/price-check/trade/pathofexile-trade'

function filters (vestigial: boolean): ItemFilters {
  return {
    searchExact: {
      name: "Zahndethus' Cassock",
      baseType: "Sage's Robe"
    },
    vestigial: { value: vestigial },
    trade: {
      offline: false,
      onlineInLeague: false,
      merchantOnly: false,
      listed: undefined,
      currency: undefined,
      league: 'Allflame',
      collapseListings: 'app'
    }
  }
}

describe('Vestigial trade query', () => {
  it.each([
    [true, 'true'],
    [false, 'false']
  ])('serializes the Vestigial item state %s', (value, option) => {
    const request = createTradeRequest(filters(value), [])

    expect(request.query).toMatchObject({
      name: "Zahndethus' Cassock",
      type: "Sage's Robe",
      filters: {
        misc_filters: {
          filters: {
            vestigial: { option }
          }
        }
      }
    })
  })
})
