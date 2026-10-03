// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FullscreenImage from '@/web/ui/FullscreenImage.vue'

const wrappers: ReturnType<typeof mount>[] = []
function image (disabled = false) {
  const wrapper = mount(FullscreenImage, { props: { src: 'https://example.test/image.png', disabled } })
  wrappers.push(wrapper)
  vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({
    left: 100, right: 300, top: 100, bottom: 200, width: 200, height: 100, x: 100, y: 100, toJSON: () => ({})
  })
  return wrapper
}
const enlarged = () => document.body.querySelectorAll('img').length
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks()
})

describe('FullscreenImage deliberate entry', () => {
  it('ignores an image appearing under a stationary pointer and requires leave before entry', async () => {
    const wrapper = image()
    await wrapper.trigger('mouseenter')
    expect(enlarged()).toBe(0)
    await wrapper.trigger('mousemove', { clientX: 200, clientY: 150, movementX: 0, movementY: 0 })
    await wrapper.trigger('mousemove', { clientX: 110, clientY: 150, movementX: 30, movementY: 0 })
    expect(enlarged()).toBe(0)
    await wrapper.trigger('mouseleave')
    await wrapper.trigger('mousemove', { clientX: 110, clientY: 150, movementX: 30, movementY: 0 })
    expect(enlarged()).toBe(1)
    await wrapper.trigger('mouseleave')
    expect(enlarged()).toBe(0)
  })

  it.each([
    { clientX: 110, clientY: 150, movementX: 30, movementY: 0 },
    { clientX: 200, clientY: 110, movementX: 0, movementY: 30 }
  ])('opens after movement across a horizontal or vertical edge', async movement => {
    const wrapper = image()
    await wrapper.trigger('mousemove', movement)
    expect(enlarged()).toBe(1)
  })

  it('allows an explicit click even after stationary-pointer suppression', async () => {
    const wrapper = image()
    await wrapper.trigger('mousemove', { clientX: 200, clientY: 150, movementX: 0, movementY: 0 })
    await wrapper.trigger('click')
    expect(enlarged()).toBe(1)
  })

  it('can preserve a complete screenshot in a differently shaped preview frame', async () => {
    const wrapper = image()
    expect(wrapper.find('img').element.style.objectFit).toBe('cover')
    await wrapper.setProps({ fit: 'contain' })
    expect(wrapper.find('img').element.style.objectFit).toBe('contain')
    await wrapper.trigger('click')
    expect(enlarged()).toBe(1)
    // Fullscreen retains its own natural sizing; preview-fit only affects the thumbnail.
    expect(document.body.querySelector('img')!.style.objectFit).toBe('')
  })

  it('does not enlarge while disabled for editing or moving', async () => {
    const wrapper = image(true)
    await wrapper.trigger('mousemove', { clientX: 110, clientY: 150, movementX: 30, movementY: 0 })
    await wrapper.trigger('click')
    expect(enlarged()).toBe(0)
    await wrapper.setProps({ disabled: false })
    expect(enlarged()).toBe(0)
    await wrapper.trigger('click')
    expect(enlarged()).toBe(1)
    await wrapper.setProps({ disabled: true })
    expect(enlarged()).toBe(0)
  })
})
