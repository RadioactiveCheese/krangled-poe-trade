export const CHART_SHAPE_OPTIONS = {
  End: '1',
  Corner: '2',
  Straight: '3',
  Junction: '4',
  Crossing: '5'
} as const

export type ChartShape = keyof typeof CHART_SHAPE_OPTIONS

interface ChartArea {
  baseType: 'Sandy Seabed Chart' | 'Coral Forest Chart' | 'Coral Reef Chart'
  option: string
}

const CHART_AREAS: Record<string, ChartArea> = {
  // English
  'Abyssal Plain': { baseType: 'Sandy Seabed Chart', option: 'AbyssalPlain' },
  'Anchorfield': { baseType: 'Sandy Seabed Chart', option: 'Anchorfield' },
  "Brine King's Domain": { baseType: 'Coral Reef Chart', option: 'BrineKingsDomain' },
  'Clam-infested Shelf': { baseType: 'Coral Reef Chart', option: 'ClamInfestedShelf' },
  'Diving Shoals': { baseType: 'Coral Reef Chart', option: 'DivingShoals' },
  'Hazardous Depths': { baseType: 'Sandy Seabed Chart', option: 'HazardousDepths' },
  'Infested Bathyspheres': { baseType: 'Sandy Seabed Chart', option: 'InfestedBathyspheres' },
  "Kishara's Rest": { baseType: 'Sandy Seabed Chart', option: 'KisharasRest' },
  'Lost Ruins': { baseType: 'Coral Forest Chart', option: 'LostRuins' },
  'Pelagic Abyss': { baseType: 'Coral Forest Chart', option: 'PelagicAbyss' },
  'Sea Pillars': { baseType: 'Coral Forest Chart', option: 'SeaPillars' },
  'Seafloor Ridges': { baseType: 'Coral Reef Chart', option: 'SeafloorRidges' },
  'Sunken Totems': { baseType: 'Coral Reef Chart', option: 'SunkenTotems' },
  'Undersea Groves': { baseType: 'Coral Forest Chart', option: 'UnderseaGroves' },

  // Russian
  'Глубоководное плато': { baseType: 'Sandy Seabed Chart', option: 'AbyssalPlain' },
  'Поле якорей': { baseType: 'Sandy Seabed Chart', option: 'Anchorfield' },
  'Владения Морского царя': { baseType: 'Coral Reef Chart', option: 'BrineKingsDomain' },
  'Поросший ракушками шельф': { baseType: 'Coral Reef Chart', option: 'ClamInfestedShelf' },
  'Водолазная отмель': { baseType: 'Coral Reef Chart', option: 'DivingShoals' },
  'Опасные глубины': { baseType: 'Sandy Seabed Chart', option: 'HazardousDepths' },
  'Заражённые батисферы': { baseType: 'Sandy Seabed Chart', option: 'InfestedBathyspheres' },
  'Могила Кишары': { baseType: 'Sandy Seabed Chart', option: 'KisharasRest' },
  'Затерянные руины': { baseType: 'Coral Forest Chart', option: 'LostRuins' },
  'Морская пучина': { baseType: 'Coral Forest Chart', option: 'PelagicAbyss' },
  'Морские колонны': { baseType: 'Coral Forest Chart', option: 'SeaPillars' },
  'Донные хребты': { baseType: 'Coral Reef Chart', option: 'SeafloorRidges' },
  'Затонувшие тотемы': { baseType: 'Coral Reef Chart', option: 'SunkenTotems' },
  'Подводные рощи': { baseType: 'Coral Forest Chart', option: 'UnderseaGroves' },

  // Korean
  '심연의 평야': { baseType: 'Sandy Seabed Chart', option: 'AbyssalPlain' },
  '정박장': { baseType: 'Sandy Seabed Chart', option: 'Anchorfield' },
  '염수왕의 영토': { baseType: 'Coral Reef Chart', option: 'BrineKingsDomain' },
  '조개투성이 선반': { baseType: 'Coral Reef Chart', option: 'ClamInfestedShelf' },
  '잠수 모래톱': { baseType: 'Coral Reef Chart', option: 'DivingShoals' },
  '위태한 지하': { baseType: 'Sandy Seabed Chart', option: 'HazardousDepths' },
  '감염된 잠수구': { baseType: 'Sandy Seabed Chart', option: 'InfestedBathyspheres' },
  '키샤라의 안식처': { baseType: 'Sandy Seabed Chart', option: 'KisharasRest' },
  '잃어버린 폐허': { baseType: 'Coral Forest Chart', option: 'LostRuins' },
  '원양 심연': { baseType: 'Coral Forest Chart', option: 'PelagicAbyss' },
  '바다 기둥': { baseType: 'Coral Forest Chart', option: 'SeaPillars' },
  '해저 마루': { baseType: 'Coral Reef Chart', option: 'SeafloorRidges' },
  '가라앉은 토템': { baseType: 'Coral Reef Chart', option: 'SunkenTotems' },
  '바다 밑 숲': { baseType: 'Coral Forest Chart', option: 'UnderseaGroves' }
}

export function resolveChartArea (areaName: string, baseType: string): string | undefined {
  const area = CHART_AREAS[areaName]
  return area?.baseType === baseType ? area.option : undefined
}

export function resolveChartShape (shape: string): string | undefined {
  return CHART_SHAPE_OPTIONS[shape as ChartShape]
}
