// Arithmetic over chaos/divine amounts, e.g. `3d + 45c` or `(2.5div - 80) / 4`.
// Hand-written recursive descent: user input must never reach eval/Function.

export type EvalResult =
  { ok: true, chaos: number } |
  { ok: false, reason: 'invalid' | 'no-rate' }

const UNITS: Record<string, 'chaos' | 'divine'> = {
  c: 'chaos',
  chaos: 'chaos',
  d: 'divine',
  div: 'divine',
  divs: 'divine',
  divine: 'divine',
  divines: 'divine'
}

type Op = '+' | '-' | '*' | '/' | '(' | ')'

type Token =
  { type: 'num', value: number, unit: 'chaos' | 'divine' } |
  { type: 'op', value: Op }

class EvalError extends Error {
  constructor (readonly reason: 'invalid' | 'no-rate') {
    super(reason)
  }
}

function tokenize (input: string): Token[] {
  const tokens: Token[] = []
  const re = /\s*(?:(\d+(?:\.\d*)?|\.\d+)\s*([a-z]*)|([-+*/()]))/iy
  let pos = 0
  while (pos < input.length) {
    if (/^\s*$/.test(input.slice(pos))) break
    re.lastIndex = pos
    const m = re.exec(input)
    if (!m) throw new EvalError('invalid')
    pos = re.lastIndex
    if (m[1] != null) {
      const unit = m[2] ? UNITS[m[2].toLowerCase()] : 'chaos'
      if (!unit) throw new EvalError('invalid')
      tokens.push({ type: 'num', value: Number(m[1]), unit })
    } else {
      tokens.push({ type: 'op', value: m[3] as Op })
    }
  }
  return tokens
}

export function evaluate (input: string, divineRate: number | undefined): EvalResult {
  let tokens: Token[]
  try {
    tokens = tokenize(input)
  } catch (e) {
    return { ok: false, reason: (e as EvalError).reason }
  }
  if (!tokens.length) return { ok: true, chaos: 0 }

  let i = 0
  const peekOp = () => {
    const t = tokens[i]
    return (t?.type === 'op') ? t.value : undefined
  }

  function expr (): number {
    let value = term()
    for (let op = peekOp(); op === '+' || op === '-'; op = peekOp()) {
      i++
      value = (op === '+') ? value + term() : value - term()
    }
    return value
  }

  function term (): number {
    let value = unary()
    for (let op = peekOp(); op === '*' || op === '/'; op = peekOp()) {
      i++
      value = (op === '*') ? value * unary() : value / unary()
    }
    return value
  }

  function unary (): number {
    const op = peekOp()
    if (op === '-') { i++; return -unary() }
    if (op === '+') { i++; return unary() }
    return primary()
  }

  function primary (): number {
    const t = tokens[i++]
    if (t == null) throw new EvalError('invalid')
    if (t.type === 'num') {
      if (t.unit === 'chaos') return t.value
      if (divineRate == null || !(divineRate > 0)) throw new EvalError('no-rate')
      return t.value * divineRate
    }
    if (t.value === '(') {
      const value = expr()
      if (peekOp() !== ')') throw new EvalError('invalid')
      i++
      return value
    }
    throw new EvalError('invalid')
  }

  try {
    const chaos = expr()
    if (i !== tokens.length || !Number.isFinite(chaos)) {
      return { ok: false, reason: 'invalid' }
    }
    return { ok: true, chaos }
  } catch (e) {
    if (e instanceof EvalError) return { ok: false, reason: e.reason }
    throw e
  }
}

// Whole divines plus leftover chaos, rounded to whole chaos.
export function splitChaos (chaos: number, divineRate: number): { negative: boolean, divine: number, chaos: number } {
  const negative = chaos < 0
  const abs = Math.abs(chaos)
  let divine = Math.floor(abs / divineRate)
  let rest = Math.round(abs - divine * divineRate)
  if (rest >= Math.round(divineRate)) {
    divine += 1
    rest = 0
  }
  return { negative: negative && (divine > 0 || rest > 0), divine, chaos: rest }
}
