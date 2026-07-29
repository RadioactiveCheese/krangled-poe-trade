export interface MercenaryWarrantDetails {
  build: string
  level: number
}

export interface MercenaryWarrantLabels {
  MERCENARY_BUILD: string
  MERCENARY_LEVEL: string
}

export function parseMercenaryWarrantDetails (
  section: readonly string[],
  labels: MercenaryWarrantLabels
): MercenaryWarrantDetails | undefined {
  if (section.length !== 2) return

  const build = parseField(section[0], labels.MERCENARY_BUILD)
  const levelText = parseField(section[1], labels.MERCENARY_LEVEL)
  if (!build || !levelText || !/^\d+$/u.test(levelText)) return

  const level = Number(levelText)
  if (!/\p{L}/u.test(build) || level < 1 || level > 100) return

  return { build, level }
}

function parseField (line: string, label: string): string | undefined {
  for (const separator of [':', '：']) {
    const prefix = `${label}${separator}`
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim()
  }
}
