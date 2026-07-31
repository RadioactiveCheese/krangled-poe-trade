// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiDetailedItemImg from '@/web/ui/UiDetailedItemImg.vue'
import type { DisplaySocket } from '@/web/price-check/trade/trade-tooltip'

// Geometry constants mirrored from the component: cell 3rem, socket 1.625rem,
// link thickness 1.35rem (0.45 * cell).
const CELL = 3
const SOCKET = 1.625
const LINK = CELL * 0.45

function mountImg (itemWidth: number, itemHeight: number, sockets: DisplaySocket[]) {
  return mount(UiDetailedItemImg, {
    props: { icon: '/fake-item.png', itemWidth, itemHeight, sockets }
  })
}

function socketStyles (wrapper: ReturnType<typeof mountImg>) {
  return wrapper.findAll('div.absolute.z-10').map(node => node.attributes('style'))
}

function socketLeftTop (style: string | undefined): [number, number] {
  const left = Number(/left: ([\d.]+)rem/.exec(style ?? '')?.[1])
  const top = Number(/top: ([\d.]+)rem/.exec(style ?? '')?.[1])
  return [left, top]
}

/** Convert a socket centre in cell units to the expected [left, top] rem. */
function at (x: number, y: number): [number, number] {
  return [x * CELL - SOCKET / 2, y * CELL - SOCKET / 2]
}

const R = (group = 0): DisplaySocket => ({ group, sColour: 'R' })

describe('UiDetailedItemImg socket layout', () => {
  it('centres a lone socket in a 2-wide item, on the left cell', () => {
    const [socket] = socketStyles(mountImg(2, 3, [R()]))
    expect(socketLeftTop(socket)).toEqual(at(0.5, 1.5))
  })

  it('keeps a full 2x3 six-socket block on cell centres', () => {
    const styles = socketStyles(mountImg(2, 3, [R(), R(), R(), R(), R(), R()]))
    expect(styles.map(socketLeftTop)).toEqual([
      at(0.5, 0.5), at(1.5, 0.5),
      at(1.5, 1.5), at(0.5, 1.5),
      at(0.5, 2.5), at(1.5, 2.5)
    ])
  })

  it('snakes so the third socket lands lower-right, block centred', () => {
    const styles = socketStyles(mountImg(2, 3, [R(), R(), R()]))
    expect(styles.map(socketLeftTop)).toEqual([
      at(0.5, 1), at(1.5, 1),
      at(1.5, 2) // row 2 runs right-to-left: third socket is on the RIGHT
    ])
  })

  it('centres a four-socket block on a 2x3 item with one-cell pitch', () => {
    const styles = socketStyles(mountImg(2, 3, [R(), R(), R(), R()]))
    expect(styles.map(socketLeftTop)).toEqual([
      at(0.5, 1), at(1.5, 1),
      at(1.5, 2), at(0.5, 2)
    ])
  })

  it('stacks 1-wide items in a single centred column', () => {
    const styles = socketStyles(mountImg(1, 3, [R(), R(), R()]))
    expect(styles.map(socketLeftTop)).toEqual([
      at(0.5, 0.5), at(0.5, 1.5), at(0.5, 2.5)
    ])
  })

  it('maps socket colours and attributes to the right sprites', () => {
    const styles = socketStyles(mountImg(2, 2, [
      { group: 0, sColour: 'G' },
      { group: 0, attr: 'I' },   // Int -> blue
      { group: 0, attr: 'A' }    // abyssal
    ]))
    expect(styles[0]).toContain('socket-g.png')
    expect(styles[1]).toContain('socket-b.png')
    expect(styles[2]).toContain('socket-a.png')
  })
})

describe('UiDetailedItemImg link geometry', () => {
  it('draws axis-aligned links with the right sprite per orientation', () => {
    const wrapper = mountImg(2, 3, [R(), R(), R(), R()])
    const links = wrapper.findAll('img.absolute.z-0')
    expect(links).toHaveLength(3)

    // 0-1: horizontal across row 1
    expect(links[0].attributes('src')).toBe('/images/item-display/socket-link-h.png')
    expect(links[0].attributes('style')).toContain(`left: ${0.5 * CELL}rem`)
    expect(links[0].attributes('style')).toContain(`top: ${1 * CELL - LINK / 2}rem`)
    expect(links[0].attributes('style')).toContain(`width: ${CELL}rem`)

    // 1-2: vertical down the right column
    expect(links[1].attributes('src')).toBe('/images/item-display/socket-link-v.png')
    expect(links[1].attributes('style')).toContain(`left: ${1.5 * CELL - LINK / 2}rem`)
    expect(links[1].attributes('style')).toContain(`top: ${1 * CELL}rem`)
    expect(links[1].attributes('style')).toContain(`height: ${CELL}rem`)

    // 2-3: horizontal back across row 2
    expect(links[2].attributes('src')).toBe('/images/item-display/socket-link-h.png')
  })

  it('breaks links between different socket groups', () => {
    const wrapper = mountImg(2, 3, [R(0), R(0), R(1), R(1)])
    const links = wrapper.findAll('img.absolute.z-0')
    // 0-1 linked, 1-2 skipped (group change), 2-3 linked
    expect(links).toHaveLength(2)
  })
})
