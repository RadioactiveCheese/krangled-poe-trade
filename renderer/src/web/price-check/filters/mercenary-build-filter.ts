import type { MercenaryBuildVariant } from '../trade/mercenary-trade-data'
import type { ItemFilters } from './interfaces'

type MercenaryBuildFilter = NonNullable<ItemFilters['mercenaryBuild']>

export function isMercenaryInfamousActive (
  filter: MercenaryBuildFilter,
  variant: MercenaryBuildVariant
): boolean {
  if (filter.disabled) return false
  return filter.infamous ?? variant.isInfamous
}

export function selectMercenaryBuildVariantTradeId (
  variant: MercenaryBuildVariant,
  infamous?: boolean
): string | undefined {
  const useInfamous = infamous ?? variant.isInfamous
  return useInfamous ? variant.infamousTradeId : variant.normalTradeId
}

export function createMercenaryBuildQueryType (
  filter: MercenaryBuildFilter,
  tradeId: string | undefined,
  baseType: string | undefined
): string | { discriminator: 'mercenary_warrant', option: string } | undefined {
  if (filter.disabled) return baseType
  return tradeId
    ? { discriminator: 'mercenary_warrant', option: tradeId }
    : undefined
}

export function toggleMercenaryInfamous (
  filter: MercenaryBuildFilter,
  variant: MercenaryBuildVariant
): void {
  filter.infamous = !isMercenaryInfamousActive(filter, variant)
  if (filter.infamous) filter.disabled = false
}

export function toggleMercenaryBuild (filter: MercenaryBuildFilter): void {
  filter.disabled = !filter.disabled
  if (filter.disabled) filter.infamous = false
}
