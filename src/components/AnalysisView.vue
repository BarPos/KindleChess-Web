<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue"
import { Chess } from "chess.js"
import ChessBoard from "./ChessBoard.vue"
import { startAnalysis } from "../lib/analyze"
import { describeLine, gameVerdict, lineMoves, materialStatus, scoreLine, shortEval } from "../lib/position"

const props = defineProps({
  fen: { type: String, required: true },
  pieces: { type: String, default: "" },
  board: { type: String, default: "" },
  depth: { type: Number, default: 12 },
  variants: { type: Number, default: 1 },
  pieceNote: { type: String, default: "" },
  boardNote: { type: String, default: "" }
})

const chess = new Chess(props.fen)
const normalizedFen = chess.fen()
const verdict = gameVerdict(chess)
const engineFen = fenForEngine(normalizedFen)

function fenForEngine(fen) {
  const parts = fen.split(" ")
  if (parts.length < 4 || parts[3] === "-") return { fen, droppedEp: false }
  const next = parts.slice()
  next[3] = "-"
  return { fen: next.join(" "), droppedEp: true }
}
const analysis = ref({
  lines: [],
  status: verdict ? "" : "Analyzing…",
  done: Boolean(verdict),
  error: ""
})
const picked = ref("")

const selected = computed(() => {
  const lines = analysis.value.lines
  if (!lines.length) return null
  return lines.find((line) => line.move === picked.value) || lines[0]
})

const described = computed(() => {
  if (!selected.value) return { first: "", full: "" }
  const text = describeLine(normalizedFen, lineMoves(selected.value))
  return {
    first: text.first || selected.value.san || selected.value.move || "",
    full: text.full || selected.value.san || ""
  }
})

const statusText = computed(() => {
  const base = materialStatus(chess)
  if (verdict) return base
  if (selected.value) return `${base}\n${scoreLine(selected.value)}`
  if (analysis.value.error) return base
  return `${base}\nAnalyzing…`
})

const headline = computed(() => {
  if (verdict) return verdict
  if (described.value.first) return described.value.first
  if (analysis.value.error) return "No move"
  return "Analyzing…"
})

const logText = computed(() => {
  const notes = []
  if (props.pieceNote) notes.push(`Unknown piece set: ${props.pieceNote}`)
  if (props.boardNote) notes.push(`Unknown board: ${props.boardNote}`)
  if (engineFen.droppedEp) notes.push("En passant was left out of the search")
  if (!verdict && analysis.value.status) notes.push(analysis.value.status)
  return notes.join(" · ")
})

const fromSquare = computed(() => selected.value?.from || selected.value?.move?.slice(0, 2) || "")
const toSquare = computed(() => selected.value?.to || selected.value?.move?.slice(2, 4) || "")
const summary = computed(() => (verdict ? "" : selected.value?.text || ""))
const showLine = computed(() => described.value.full && described.value.full !== described.value.first)

let stop = () => {}

onMounted(() => {
  if (verdict) return
  stop = startAnalysis(
    { fen: engineFen.fen, depth: props.depth, variants: props.variants },
    (next) => {
      analysis.value = next
    }
  )
})

onUnmounted(() => stop())

function choose(move) {
  picked.value = move
}
</script>

<template>
  <main class="column">
    <p class="log" aria-live="polite">{{ logText }}</p>
    <ChessBoard
      :fen="normalizedFen"
      :pieces="pieces"
      :board="board"
      :from="fromSquare"
      :to="toSquare"
    />
    <div class="readout">
      <p class="status">{{ statusText }}</p>
      <p class="last-move">{{ headline }}</p>
    </div>
    <p v-if="summary" class="summary">{{ summary }}</p>
    <p v-if="showLine" class="continuation">{{ described.full }}</p>
    <div v-if="analysis.lines.length > 1" class="lines">
      <button
        v-for="line in analysis.lines"
        :key="line.move"
        type="button"
        class="line-option"
        :class="{ 'is-selected': line.move === selected?.move }"
        @click="choose(line.move)"
      >
        <span>{{ describeLine(normalizedFen, [line.move]).first || line.san || line.move }}</span>
        <span class="line-eval">{{ shortEval(line) }}</span>
      </button>
    </div>
    <p class="help-row">
      <a class="text-button" href="./">Help</a>
    </p>
  </main>
</template>
