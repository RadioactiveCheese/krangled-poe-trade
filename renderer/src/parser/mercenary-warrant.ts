export interface MercenaryWarrantDetails {
  build: string
  level: number
}

export function parseMercenaryWarrantDetails (
  section: readonly string[]
): MercenaryWarrantDetails | undefined {
  if (section.length !== 2) return

  const buildMatch = section[0].match(/^.*?[:：]\s*(.+)$/u)
  const levelMatch = section[1].match(/^.*?[:：]\s*(\d+)$/u)
  if (!buildMatch || !levelMatch) return

  const build = buildMatch[1].trim()
  const level = Number(levelMatch[1])
  if (!/\p{L}/u.test(build) || level < 1 || level > 100) return

  return {
    build,
    level
  }
}
