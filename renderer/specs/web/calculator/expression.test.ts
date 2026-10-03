import { describe, expect, it } from 'vitest'
import { evaluate, splitChaos } from '@/web/calculator/expression'

const RATE = 200

function chaos (input: string, rate: number | undefined = RATE) {
  const res = evaluate(input, rate)
  if (!res.ok) throw new Error(`expected ok for "${input}", got ${res.reason}`)
  return res.chaos
}

describe('calculator expression', () => {
  it('treats empty input as zero', () => {
    expect(chaos('')).toBe(0)
    expect(chaos('   ')).toBe(0)
  })

  it('defaults bare numbers to chaos', () => {
    expect(chaos('45')).toBe(45)
  })

  it('converts divine units with the given rate', () => {
    expect(chaos('3d + 45c')).toBe(645)
    expect(chaos('1.5 div')).toBe(300)
    expect(chaos('2 Divines')).toBe(400)
    expect(chaos('10 chaos')).toBe(10)
    expect(chaos('.5D')).toBe(100)
  })

  it('uses the unrounded rate', () => {
    expect(chaos('2d', 212.6)).toBeCloseTo(425.2)
  })

  it('respects operator precedence and parentheses', () => {
    expect(chaos('1 + 2 * 3')).toBe(7)
    expect(chaos('(1 + 2) * 3')).toBe(9)
    expect(chaos('(2.5d - 80c) / 4')).toBe(105)
    expect(chaos('10 - 4 - 3')).toBe(3)
    expect(chaos('24 / 4 / 2')).toBe(3)
  })

  it('handles unary signs', () => {
    expect(chaos('-1d + 300c')).toBe(100)
    expect(chaos('--5')).toBe(5)
    expect(chaos('2 * -3')).toBe(-6)
    expect(chaos('+4')).toBe(4)
  })

  it('rejects malformed input', () => {
    for (const input of ['5ex', '1 +', '(1 + 2', '1 + 2)', '2c3', '1e5', '*2', '5 divine orbs', 'abc']) {
      expect(evaluate(input, RATE)).toEqual({ ok: false, reason: 'invalid' })
    }
  })

  it('rejects absurdly deep nesting instead of overflowing the stack', () => {
    expect(chaos('(((((1)))))')).toBe(1)
    expect(chaos('-'.repeat(50) + '1')).toBe(1)
    for (const input of ['('.repeat(20000) + '1' + ')'.repeat(20000), '-'.repeat(20000) + '1']) {
      expect(evaluate(input, RATE)).toEqual({ ok: false, reason: 'invalid' })
    }
  })

  it('rejects division by zero', () => {
    expect(evaluate('5 / 0', RATE)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('reports a missing rate only when divines are used', () => {
    expect(evaluate('3d', undefined)).toEqual({ ok: false, reason: 'no-rate' })
    expect(evaluate('3d', 0)).toEqual({ ok: false, reason: 'no-rate' })
    expect(chaos('30 + 15', undefined)).toBe(45)
  })
})

describe('splitChaos', () => {
  it('splits into whole divines and leftover chaos', () => {
    expect(splitChaos(645, 200)).toEqual({ negative: false, divine: 3, chaos: 45 })
    expect(splitChaos(400, 200)).toEqual({ negative: false, divine: 2, chaos: 0 })
    expect(splitChaos(45, 200)).toEqual({ negative: false, divine: 0, chaos: 45 })
  })

  it('carries a remainder that rounds up to a full divine', () => {
    expect(splitChaos(399.8, 200)).toEqual({ negative: false, divine: 2, chaos: 0 })
  })

  it('keeps the sign out of the parts', () => {
    expect(splitChaos(-300, 200)).toEqual({ negative: true, divine: 1, chaos: 100 })
    expect(splitChaos(-0.2, 200)).toEqual({ negative: false, divine: 0, chaos: 0 })
  })
})
