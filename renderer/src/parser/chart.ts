export const CHART_SHAPE_OPTIONS = {
  // English
  End: '1',
  Corner: '2',
  Straight: '3',
  Junction: '4',
  Crossing: '5',

  // Russian
  Конец: '1',
  Угол: '2',
  Прямая: '3',
  Развилка: '4',
  Перекресток: '5',

  // Korean
  종료: '1',
  모서리: '2',
  직선: '3',
  접점: '4',
  교차: '5',

  // Traditional Chinese
  終點: '1',
  轉角: '2',
  直線: '3',
  交界處: '4',
  十字口: '5'
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
  'Eldritch Depths': { baseType: 'Coral Forest Chart', option: 'EldritchDepths' },
  'Hazardous Depths': { baseType: 'Sandy Seabed Chart', option: 'HazardousDepths' },
  'Infested Bathyspheres': { baseType: 'Sandy Seabed Chart', option: 'InfestedBathyspheres' },
  "Kishara's Rest": { baseType: 'Sandy Seabed Chart', option: 'KisharasRest' },
  'Lost Ruins': { baseType: 'Coral Forest Chart', option: 'LostRuins' },
  'Pelagic Abyss': { baseType: 'Coral Forest Chart', option: 'PelagicAbyss' },
  'Sea Pillars': { baseType: 'Coral Forest Chart', option: 'SeaPillars' },
  'Seafloor Ridges': { baseType: 'Coral Reef Chart', option: 'SeafloorRidges' },
  'Sunken Totems': { baseType: 'Coral Reef Chart', option: 'SunkenTotems' },
  'Undersea Groves': { baseType: 'Coral Forest Chart', option: 'UnderseaGroves' },
  'Unremarkable Seabed': { baseType: 'Sandy Seabed Chart', option: 'UnremarkableSeabed' },

  // Russian
  'Глубоководное плато': { baseType: 'Sandy Seabed Chart', option: 'AbyssalPlain' },
  'Поле якорей': { baseType: 'Sandy Seabed Chart', option: 'Anchorfield' },
  'Владения Морского царя': { baseType: 'Coral Reef Chart', option: 'BrineKingsDomain' },
  'Поросший ракушками шельф': { baseType: 'Coral Reef Chart', option: 'ClamInfestedShelf' },
  'Водолазная отмель': { baseType: 'Coral Reef Chart', option: 'DivingShoals' },
  'Мистические глубины': { baseType: 'Coral Forest Chart', option: 'EldritchDepths' },
  'Опасные глубины': { baseType: 'Sandy Seabed Chart', option: 'HazardousDepths' },
  'Заражённые батисферы': { baseType: 'Sandy Seabed Chart', option: 'InfestedBathyspheres' },
  'Могила Кишары': { baseType: 'Sandy Seabed Chart', option: 'KisharasRest' },
  'Затерянные руины': { baseType: 'Coral Forest Chart', option: 'LostRuins' },
  'Морская пучина': { baseType: 'Coral Forest Chart', option: 'PelagicAbyss' },
  'Морские колонны': { baseType: 'Coral Forest Chart', option: 'SeaPillars' },
  'Донные хребты': { baseType: 'Coral Reef Chart', option: 'SeafloorRidges' },
  'Затонувшие тотемы': { baseType: 'Coral Reef Chart', option: 'SunkenTotems' },
  'Подводные рощи': { baseType: 'Coral Forest Chart', option: 'UnderseaGroves' },
  'Непримечательное дно': { baseType: 'Sandy Seabed Chart', option: 'UnremarkableSeabed' },

  // Korean
  '심연의 평야': { baseType: 'Sandy Seabed Chart', option: 'AbyssalPlain' },
  '정박장': { baseType: 'Sandy Seabed Chart', option: 'Anchorfield' },
  '염수왕의 영토': { baseType: 'Coral Reef Chart', option: 'BrineKingsDomain' },
  '조개투성이 선반': { baseType: 'Coral Reef Chart', option: 'ClamInfestedShelf' },
  '잠수 모래톱': { baseType: 'Coral Reef Chart', option: 'DivingShoals' },
  '섬뜩한 지하': { baseType: 'Coral Forest Chart', option: 'EldritchDepths' },
  '위태한 지하': { baseType: 'Sandy Seabed Chart', option: 'HazardousDepths' },
  '감염된 잠수구': { baseType: 'Sandy Seabed Chart', option: 'InfestedBathyspheres' },
  '키샤라의 안식처': { baseType: 'Sandy Seabed Chart', option: 'KisharasRest' },
  '사라진 유적': { baseType: 'Coral Forest Chart', option: 'LostRuins' },
  '잃어버린 폐허': { baseType: 'Coral Forest Chart', option: 'LostRuins' },
  '원양 심연': { baseType: 'Coral Forest Chart', option: 'PelagicAbyss' },
  '바다 기둥': { baseType: 'Coral Forest Chart', option: 'SeaPillars' },
  '해저 마루': { baseType: 'Coral Reef Chart', option: 'SeafloorRidges' },
  '가라앉은 토템': { baseType: 'Coral Reef Chart', option: 'SunkenTotems' },
  '바다 밑 숲': { baseType: 'Coral Forest Chart', option: 'UnderseaGroves' },
  '평범한 해저': { baseType: 'Sandy Seabed Chart', option: 'UnremarkableSeabed' },

  // Traditional Chinese
  '深海平原': { baseType: 'Sandy Seabed Chart', option: 'AbyssalPlain' },
  '定錨點': { baseType: 'Sandy Seabed Chart', option: 'Anchorfield' },
  '海洋王的領域': { baseType: 'Coral Reef Chart', option: 'BrineKingsDomain' },
  '蛤蜊之架': { baseType: 'Coral Reef Chart', option: 'ClamInfestedShelf' },
  '潛水沙洲': { baseType: 'Coral Reef Chart', option: 'DivingShoals' },
  '異能深溝': { baseType: 'Coral Forest Chart', option: 'EldritchDepths' },
  '危機海淵': { baseType: 'Sandy Seabed Chart', option: 'HazardousDepths' },
  '感染潛水球': { baseType: 'Sandy Seabed Chart', option: 'InfestedBathyspheres' },
  '奇夏拉安眠地': { baseType: 'Sandy Seabed Chart', option: 'KisharasRest' },
  '失落遺跡': { baseType: 'Coral Forest Chart', option: 'LostRuins' },
  '遠洋深淵': { baseType: 'Coral Forest Chart', option: 'PelagicAbyss' },
  '海洋之柱': { baseType: 'Coral Forest Chart', option: 'SeaPillars' },
  '海底山脊': { baseType: 'Coral Reef Chart', option: 'SeafloorRidges' },
  '沉沒圖騰': { baseType: 'Coral Reef Chart', option: 'SunkenTotems' },
  '海底幽林': { baseType: 'Coral Forest Chart', option: 'UnderseaGroves' },
  '平凡海床': { baseType: 'Sandy Seabed Chart', option: 'UnremarkableSeabed' }
}

export function resolveChartArea (areaName: string, baseType: string): string | undefined {
  const area = CHART_AREAS[areaName]
  return area?.baseType === baseType ? area.option : undefined
}

export function resolveChartShape (shape: string): string | undefined {
  return CHART_SHAPE_OPTIONS[shape as ChartShape]
}
