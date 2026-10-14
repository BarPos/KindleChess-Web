<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { Chess } from "chess.js"
import { kingSquare } from "../lib/position"
import { pieceImage } from "../lib/skins"

const props = defineProps({
  fen: { type: String, required: true },
  pieces: { type: String, default: "" },
  board: { type: String, default: "" },
  from: { type: String, default: "" },
  to: { type: String, default: "" },
  selected: { type: String, default: "" },
  marks: { type: Array, default: () => [] },
  arrows: { type: Array, default: () => [] },
  interactive: { type: Boolean, default: false }
})

const emit = defineEmits(["square"])

const NAMES = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" }
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"]
const ANIMATION_MS = 180

const position = computed(() => new Chess(props.fen))
const flying = ref([])
const hidden = ref(new Set())
let previousFen = props.fen
let animationTimer = 0

const squares = computed(() => {
  const rows = position.value.board()
  const list = []
  for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
      const rank = 8 - rankIndex
      const file = FILES[fileIndex]
      const id = file + rank
      const piece = rows[rankIndex][fileIndex]
      list.push({
        id,
        piece,
        light: (rankIndex + fileIndex) % 2 === 0,
        fileLabel: rank === 1 ? file : "",
        rankLabel: file === "a" ? String(rank) : ""
      })
    }
  }
  return list
})

const checkId = computed(() => kingSquare(position.value))

const boardStyle = computed(() => {
  if (!props.board) return undefined
  return { backgroundImage: `url("/img/boards/${props.board}")` }
})

function pieceAlt(piece) {
  const side = piece.color === "w" ? "White" : "Black"
  return `${side} ${NAMES[piece.type] || "piece"}`
}

function pieceKey(piece) {
  return piece.color + piece.type
}

function occupancy(fen) {
  const chess = new Chess(fen)
  const map = new Map()
  const rows = chess.board()
  for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
      const piece = rows[rankIndex][fileIndex]
      if (!piece) continue
      map.set(FILES[fileIndex] + (8 - rankIndex), pieceKey(piece))
    }
  }
  return map
}

function squareOffset(square) {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1])
  return {
    left: (file / 8) * 100,
    top: ((8 - rank) / 8) * 100
  }
}

function point(square) {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1])
  return { x: file + 0.5, y: 8.5 - rank }
}

function arrowLine(arrow) {
  const start = point(arrow.from)
  const end = point(arrow.to)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  return {
    x1: start.x + ux * 0.15,
    y1: start.y + uy * 0.15,
    x2: end.x - ux * 0.45,
    y2: end.y - uy * 0.45,
    width: arrow.rank === 2 ? 0.07 : 0.12
  }
}

function clearAnimation() {
  if (animationTimer) {
    clearTimeout(animationTimer)
    animationTimer = 0
  }
  flying.value = []
  hidden.value = new Set()
}

function animateTransition(fromFen, toFen) {
  const before = occupancy(fromFen)
  const after = occupancy(toFen)
  const vacated = []
  const arrived = []

  for (const [square, key] of before) {
    if (after.get(square) !== key) vacated.push({ square, key })
  }
  for (const [square, key] of after) {
    if (before.get(square) !== key) arrived.push({ square, key })
  }

  const moves = []
  const usedFrom = new Set()
  const usedTo = new Set()

  for (const next of arrived) {
    const match = vacated.find((previous) => previous.key === next.key && !usedFrom.has(previous.square))
    if (!match || match.square === next.square) continue
    usedFrom.add(match.square)
    usedTo.add(next.square)
    moves.push({
      key: next.key,
      from: match.square,
      to: next.square,
      src: pieceImage(props.pieces, next.key),
      alt: pieceAlt({ color: next.key[0], type: next.key[1] }),
      start: squareOffset(match.square),
      end: squareOffset(next.square),
      moving: false
    })
  }

  // Single ply (or castling) only — big jumps snap into place.
  if (!moves.length || moves.length > 2) {
    clearAnimation()
    return
  }

  clearAnimation()
  hidden.value = new Set(moves.map((move) => move.to))
  flying.value = moves

  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flying.value = flying.value.map((move) => ({ ...move, moving: true }))
      })
    })
  })

  animationTimer = window.setTimeout(() => {
    clearAnimation()
  }, ANIMATION_MS + 40)
}

watch(
  () => props.fen,
  (nextFen) => {
    if (nextFen === previousFen) return
    animateTransition(previousFen, nextFen)
    previousFen = nextFen
  }
)

onBeforeUnmount(clearAnimation)
</script>

<template>
  <div
    class="board"
    :class="{ skin: board, interactive }"
    :style="boardStyle"
    :role="interactive ? 'group' : 'img'"
    :aria-label="position.turn() === 'w' ? 'Chess board. White to move.' : 'Chess board. Black to move.'"
  >
    <div
      v-for="square in squares"
      :key="square.id"
      class="square"
      :class="{
        light: square.light,
        dark: !square.light,
        from: square.id === from || square.id === selected,
        to: square.id === to
      }"
      @click="interactive && emit('square', square.id)"
    >
      <span v-if="square.rankLabel" class="rank-label">{{ square.rankLabel }}</span>
      <span v-if="square.fileLabel" class="file-label">{{ square.fileLabel }}</span>
      <img
        v-if="square.piece && !hidden.has(square.id)"
        class="piece"
        :src="pieceImage(pieces, square.piece.color + square.piece.type)"
        :alt="pieceAlt(square.piece)"
        draggable="false"
      />
      <span v-if="square.id === checkId" class="check-mark"></span>
      <span v-if="square.id === to || marks.includes(square.id)" class="move-dot"></span>
    </div>
    <div
      v-for="move in flying"
      :key="move.key + move.from + move.to"
      class="piece flying-piece"
      :class="{ moving: move.moving }"
      :style="{
        left: (move.moving ? move.end.left : move.start.left) + '%',
        top: (move.moving ? move.end.top : move.start.top) + '%'
      }"
    >
      <img :src="move.src" :alt="move.alt" draggable="false" />
    </div>
    <svg v-if="arrows.length" class="arrows" viewBox="0 0 8 8" aria-hidden="true">
      <defs>
        <marker id="arrow-head" markerWidth="3" markerHeight="3" refX="2.2" refY="1.5" orient="auto">
          <path d="M0,0 L3,1.5 L0,3 Z" fill="#000" />
        </marker>
      </defs>
      <line
        v-for="(arrow, index) in arrows"
        :key="arrow.from + arrow.to + index"
        :x1="arrowLine(arrow).x1"
        :y1="arrowLine(arrow).y1"
        :x2="arrowLine(arrow).x2"
        :y2="arrowLine(arrow).y2"
        :stroke-width="arrowLine(arrow).width"
        stroke="#000"
        marker-end="url(#arrow-head)"
      />
    </svg>
  </div>
</template>
