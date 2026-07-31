<template>
  <div
    v-if="icon"
    class="inline-block relative overflow-hidden align-top bg-gray-900 bg-opacity-60"
    :style="containerStyle"
  >
    <img :src="icon" class="block w-full h-full object-contain" draggable="false">
    <div v-if="layout.length" class="absolute inset-0 pointer-events-none">
      <img
        v-for="link in links"
        :key="link.key"
        :src="link.src"
        class="absolute z-0"
        :style="link.style"
        draggable="false"
      >
      <div
        v-for="socket in layout"
        :key="socket.index"
        class="absolute z-10 bg-no-repeat drop-shadow"
        :style="socket.style"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import type { DisplaySocket } from '@/web/price-check/trade/trade-tooltip'

const props = withDefaults(defineProps<{
  icon: string
  itemWidth?: number
  itemHeight?: number
  sockets?: DisplaySocket[]
}>(), {
  itemWidth: 1,
  itemHeight: 1,
  sockets: () => []
})

/* rem, so the whole overlay tracks the app font-size setting. */
const CELL = 3
const SOCKET_SIZE = 1.625
const LINK_SIZE = CELL * 0.45 // the link sprite's aspect (14/31)

const containerStyle = computed<CSSProperties>(() => ({
  width: `${Math.max(1, props.itemWidth) * CELL}rem`,
  height: `${Math.max(1, props.itemHeight) * CELL}rem`
}))

/* Sockets sit on the item's own grid — one cell of pitch, columns on cell
   centres — with the block centred in the art. Snake order matches the game:
   L,R then R,L then L,R; the third socket on a 2-wide item lands lower-right. */
function socketCenter (index: number): { x: number, y: number } {
  const width = Math.max(1, props.itemWidth)
  const height = Math.max(1, props.itemHeight)
  const cols = width >= 2 ? 2 : 1
  const rows = Math.ceil((props.sockets?.length ?? 0) / cols)
  const row = Math.floor(index / cols)
  const y = (height - (rows - 1)) / 2 + row
  if (cols === 1) return { x: width / 2, y }
  const fromLeft = row % 2 === 0 ? index % 2 === 0 : index % 2 === 1
  return { x: fromLeft ? 0.5 : width - 0.5, y }
}

/* The game's socket sprites — one PNG per socket colour, pre-sliced offline
   from item-display/socket-sheet.png. */
function socketSprite (socket: DisplaySocket): string {
  const color = socket.sColour ?? ({ S: 'R', D: 'G', I: 'B', G: 'W', A: 'A' } as Record<string, string>)[socket.attr ?? '']
  const sprite = ({ R: 'r', G: 'g', B: 'b', W: 'w', A: 'a' } as Record<string, string>)[color ?? ''] ?? 'w'
  return `/images/item-display/socket-${sprite}.png`
}

const layout = computed(() => (props.sockets ?? []).map((socket, index) => {
  const center = socketCenter(index)
  return {
    index,
    socket,
    center,
    style: {
      left: `${center.x * CELL - SOCKET_SIZE / 2}rem`,
      top: `${center.y * CELL - SOCKET_SIZE / 2}rem`,
      width: `${SOCKET_SIZE}rem`,
      height: `${SOCKET_SIZE}rem`,
      backgroundImage: `url(${socketSprite(socket)})`,
      backgroundSize: '100% 100%'
    } as CSSProperties
  }
}))

/* Adjacent sockets on the grid are exactly one cell apart, so a link is
   always axis-aligned — horizontal and vertical gold connector sprites. */
const links = computed(() => layout.value.slice(0, -1).flatMap((socket, index) => {
  const next = layout.value[index + 1]
  if (socket.socket.group !== next.socket.group) return []
  const from = socket.center
  const to = next.center
  const dx = to.x - from.x
  const dy = to.y - from.y
  const vertical = Math.abs(dy) > Math.abs(dx)
  const style: CSSProperties = vertical
    ? {
        left: `${from.x * CELL - LINK_SIZE / 2}rem`,
        top: `${Math.min(from.y, to.y) * CELL}rem`,
        width: `${LINK_SIZE}rem`,
        height: `${Math.abs(dy) * CELL}rem`
      }
    : {
        left: `${Math.min(from.x, to.x) * CELL}rem`,
        top: `${from.y * CELL - LINK_SIZE / 2}rem`,
        width: `${Math.abs(dx) * CELL}rem`,
        height: `${LINK_SIZE}rem`
      }
  return [{
    key: `${index}-${index + 1}`,
    src: vertical ? '/images/item-display/socket-link-v.png' : '/images/item-display/socket-link-h.png',
    style
  }]
}))
</script>
