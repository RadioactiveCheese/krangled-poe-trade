// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import OnlineFilterCore from '@/web/price-check/trade/OnlineFilterCore.vue'
import type { ItemFilters } from '@/web/price-check/filters/interfaces'

vi.mock('@/web/i18n', () => ({ useI18nNs: () => ({ t: (key: string) => key }) }))
vi.mock('@/web/background/Leagues', () => ({ useLeagues: () => ({ list: ref([{ id: 'Standard' }]) }) }))

function filters (): ItemFilters['trade'] {
  return { offline: false, onlineInLeague: false, merchantOnly: true, listed: null, currency: null,
    league: 'Standard', collapseListings: 'api', collapseMerchant: false }
}

describe('shared online/default filter controls', () => {
  it('allows only merchant and currency settings to change defaults', async () => {
    const model = filters()
    const wrapper = mount(OnlineFilterCore, { props: { filters: model, api: 'trade', context: 'settings' } })
    const button = (label: string) => wrapper.findAll('button').find(button => button.text() === label)!
    expect(button(':offline_toggle').attributes('disabled')).toBeDefined()
    expect(button(':listed_any_time').attributes('disabled')).toBeDefined()
    expect(button('Standard').attributes('disabled')).toBeDefined()
    expect(button(':merchant_toggle').attributes('disabled')).toBeUndefined()
    await button(':merchant_toggle').trigger('click')
    await button(':currency_only_div').trigger('click')
    expect(model.merchantOnly).toBe(false)
    expect(model.currency).toBe('divine')
    await button(':currency_any').trigger('click')
    expect(model.currency).toBeNull()
    wrapper.unmount()
  })

  it('restores the normal offline listing contract in price checks', async () => {
    const model = filters()
    const wrapper = mount(OnlineFilterCore, { props: { filters: model, api: 'trade' } })
    const offline = wrapper.findAll('button').find(button => button.text() === ':offline_toggle')!
    await offline.trigger('click')
    expect(model.offline).toBe(true)
    expect(model.listed).toBe('2months')
    await offline.trigger('click')
    expect(model.offline).toBe(false)
    expect(model.listed).toBeNull()
    wrapper.unmount()
  })

  it('keeps bulk online-in-league independent of Trade-only listing and currency controls', async () => {
    const model = filters()
    const wrapper = mount(OnlineFilterCore, { props: { filters: model, api: 'bulk' } })
    expect(wrapper.text()).not.toContain(':listed_any_time')
    expect(wrapper.text()).not.toContain(':currency_any')
    const league = wrapper.findAll('button').find(button => button.text() === ':in_league_toggle')!
    await league.trigger('click')
    expect(model.onlineInLeague).toBe(true)
    wrapper.unmount()
  })
})
