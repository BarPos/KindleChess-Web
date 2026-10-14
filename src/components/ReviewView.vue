<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { Chess } from "chess.js"
import ChessBoard from "./ChessBoard.vue"
import { analyzeFen, stopEngine } from "../lib/engine"
import { courseFor, openingReport, rememberGame, recordFor } from "../lib/openings"
import {
  CLASS_LABEL,
  CLASS_ORDER,
  classifyMove,
  estimatedRating,
  formatEval,
  moveAccuracy,
  phaseOf,
  tally,
  whiteChance,
  whiteScore
} from "../lib/review"

const props = defineProps({
  game: { type: Object, default: null },
  fen: { type: String, default: "" },
  pieces: { type: String, default: "" },
  board: { type: String, default: "" },
  depth: { type: Number, default: 12 },
  result: { type: String, default: "" }
})

const positions = props.game ? props.game.positions : [props.fen]
const moves = props.game ? props.game.moves : []
const packed = props.game ? moves.map((move) => move.uci).join("") : ""
const report = openingReport(positions)
const ply = ref(moves.length ? Math.min(1, moves.length) : 0)
const analyses = ref([])
const status = ref("Starting Stockfish on this phone…")
const analyzing = ref(true)
const failed = ref("")
const moveListEl = ref(null)
let alive = true

const grades = computed(() => moves.map((move, index) => {
  const before = analyses.value[index]
  const after = analyses.value[index + 1]
  if (!before || !after) return ""
  return classifyMove(
    move,
    before,
    after,
    new Chess(positions[index]),
    new Chess(positions[index + 1]),
    index < report.bookPlies
  )
}))

const scores = computed(() => {
  const sides = { w: [], b: [] }
  moves.forEach((move, index) => {
    if (grades.value[index] === "book") return
    const before = analyses.value[index]
    const after = analyses.value[index + 1]
    if (!before?.best || !after?.best) return
    const bestExp = before.best.mate != null && before.best.mate !== 0
      ? (before.best.mate > 0 ? 1 : 0)
      : 1 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, before.best.cp || 0))))
    const afterChess = new Chess(positions[index + 1])
    const playedExp = afterChess.isCheckmate()
      ? 1
      : 1 - (after.best.mate != null && after.best.mate !== 0
        ? (after.best.mate > 0 ? 1 : 0)
        : 1 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, after.best.cp || 0)))))
    const accuracy = moveAccuracy(bestExp, playedExp)
    if (accuracy != null) sides[move.color].push(accuracy)
  })
  return {
    w: sideAccuracy("w", sides.w),
    b: sideAccuracy("b", sides.b)
  }
})

function sideAccuracy(color, values) {
  const played = moves.filter((move) => move.color === color)
  if (!played.length) return null
  const known = played.every((move) => grades.value[moves.indexOf(move)])
  if (!known) return values.length ? average(values) : null
  if (!values.length) return 100
  return average(values)
}

const currentScore = computed(() => {
  const found = analyses.value[ply.value]
  if (!found?.best) return null
  return whiteScore(found.best, found.turn)
})

const viewFen = computed(() => positions[ply.value])
const played = computed(() => (ply.value === 0 ? null : moves[ply.value - 1]))
const grade = computed(() => (played.value ? grades.value[ply.value - 1] : ""))
const arrows = computed(() => {
  const found = analyses.value[ply.value]
  if (!found) return []
  return found.lines.slice(0, 2).map((line, index) => ({
    from: line.uci.slice(0, 2),
    to: line.uci.slice(2, 4),
    rank: index + 1
  }))
})

const graph = computed(() => positions.map((fen, index) => {
  const found = analyses.value[index]
  const chess = new Chess(fen)
  return {
    index,
    phase: phaseOf(chess),
    chance: found?.best ? whiteChance(whiteScore(found.best, found.turn)) : null
  }
}))

const graphLine = computed(() => {
  const ready = graph.value.filter((point) => point.chance != null)
  if (ready.length < 2) return ""
  return ready.map((point, index) => {
    const x = (point.index / Math.max(1, positions.length - 1)) * 100
    const y = 100 - point.chance
    return (index === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2)
  }).join(" ")
})

const phaseMarks = computed(() => {
  const marks = []
  let previous = ""
  graph.value.forEach((point) => {
    if (point.phase !== previous) {
      marks.push({
        phase: point.phase,
        x: (point.index / Math.max(1, positions.length - 1)) * 100
      })
      previous = point.phase
    }
  })
  return marks
})

const counts = computed(() => tally(grades.value))
const opening = computed(() => report.opening)
const course = computed(() => (opening.value ? courseFor(opening.value.name) : null))
const record = ref(recordFor(opening.value?.name))
const moveLabel = computed(() => {
  if (!moves.length) return currentScore.value ? formatEval(currentScore.value) : "Analyzing…"
  if (!played.value) return "Start"
  const prefix = played.value.color === "w" ? played.value.number + ". " : played.value.number + "... "
  return prefix + played.value.san
})
const moveRating = computed(() => {
  if (!played.value) return ""
  return grade.value ? CLASS_LABEL[grade.value] : "…"
})

function scrollToCurrentMove() {
  nextTick(() => {
    const selected = moveListEl.value?.querySelector(".move-row.is-selected")
    selected?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  })
}

watch(ply, scrollToCurrentMove)
watch(grades, scrollToCurrentMove)

function average(values) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function go(next) {
  ply.value = Math.max(0, Math.min(positions.length - 1, next))
}

function onKey(event) {
  if (event.key === "ArrowLeft") go(ply.value - 1)
  if (event.key === "ArrowRight") go(ply.value + 1)
  if (event.key === "Home") go(0)
  if (event.key === "End") go(positions.length - 1)
}

onMounted(async () => {
  window.addEventListener("keydown", onKey)
  if (opening.value && props.result) record.value = rememberGame(opening.value.name, packed, props.result)
  try {
    for (let index = 0; index < positions.length; index += 1) {
      if (!alive) return
      status.value = moves.length
        ? `Reading move ${Math.min(index + 1, moves.length)} of ${moves.length}`
        : "Reading this position…"
      const position = new Chess(positions[index])
      if (position.isGameOver()) {
        analyses.value = analyses.value.concat([{
          turn: position.turn(),
          lines: [],
          best: null,
          second: null,
          bestUci: ""
        }])
        continue
      }
      const result = await analyzeFen(positions[index], props.depth)
      if (!alive) return
      const lines = result.lines.length ? result.lines : (result.best ? [{ uci: result.best, cp: 0, mate: null, multipv: 1 }] : [])
      analyses.value = analyses.value.concat([{
        turn: positions[index].split(" ")[1],
        lines,
        best: lines[0] || null,
        second: lines[1] || null,
        bestUci: lines[0]?.uci || result.best || ""
      }])
    }
    analyzing.value = false
    status.value = ""
  } catch (error) {
    analyzing.value = false
    failed.value = error.message || "Stockfish could not start on this phone."
    status.value = failed.value
  }
})

onUnmounted(() => {
  alive = false
  stopEngine()
  window.removeEventListener("keydown", onKey)
})
</script>

<template>
  <main class="review">
    <p v-if="analyzing || failed" class="log" aria-live="polite">{{ status }}</p>
    <div class="review-grid">
      <section>
        <div class="board-row">
          <div class="eval-col">
            <span class="eval-readout">{{ formatEval(currentScore) || "…" }}</span>
            <div class="eval-bar" aria-hidden="true">
              <div class="eval-fill" :style="{ height: whiteChance(currentScore) + '%' }"></div>
            </div>
          </div>
          <div class="board-frame">
            <ChessBoard
              :fen="viewFen"
              :pieces="pieces"
              :board="board"
              :from="played?.from || ''"
              :to="played?.to || ''"
              :arrows="arrows"
            />
          </div>
        </div>
        <div v-if="moves.length" class="transport">
          <button type="button" @click="go(0)">Start</button>
          <button type="button" @click="go(ply - 1)">Previous</button>
          <button type="button" @click="go(ply + 1)">Next</button>
          <button type="button" @click="go(positions.length - 1)">End</button>
        </div>
        <div class="move-callout">
          <p class="last-move">{{ moveLabel }}</p>
          <p v-if="moveRating" class="move-rating" :data-grade="grade || undefined">{{ moveRating }}</p>
        </div>
        <p v-if="failed" class="convert-note">{{ failed }}</p>
      </section>
      <section class="review-side">
        <div v-if="moves.length" ref="moveListEl" class="move-list">
          <button
            v-for="(move, index) in moves"
            :key="move.uci + index"
            type="button"
            class="move-row"
            :class="{ 'is-selected': ply === index + 1 }"
            @click="go(index + 1)"
          >
            <span>{{ move.color === "w" ? move.number + ". " : move.number + "... " }}{{ move.san }}</span>
            <span>{{ grades[index] ? CLASS_LABEL[grades[index]] : "" }}</span>
          </button>
        </div>
        <p v-else class="summary">
          This address is one position. A finished Kindle game uses the move list in the code.
        </p>
        <div v-if="moves.length" class="score-box">
          <p>White accuracy {{ scores.w == null ? "…" : scores.w.toFixed(1) + "%" }}</p>
          <p>Estimated rating {{ estimatedRating(scores.w) ?? "…" }}</p>
          <p>Black accuracy {{ scores.b == null ? "…" : scores.b.toFixed(1) + "%" }}</p>
          <p>Estimated rating {{ estimatedRating(scores.b) ?? "…" }}</p>
          <p class="credits">The rating is a fictional estimate from the accuracy score. It is not a real Elo.</p>
          <p class="class-counts">
            <span v-for="name in CLASS_ORDER" :key="name">{{ CLASS_LABEL[name] }} {{ counts[name] }}</span>
          </p>
        </div>
        <svg v-if="graphLine" class="eval-graph" viewBox="0 0 100 100" role="img" aria-label="Evaluation across the game">
          <line x1="0" y1="50" x2="100" y2="50" stroke="#000" stroke-width="0.4" />
          <path :d="graphLine" fill="none" stroke="#000" stroke-width="1.1" />
          <line
            v-for="mark in phaseMarks"
            :key="mark.phase"
            :x1="mark.x"
            y1="0"
            :x2="mark.x"
            y2="100"
            stroke="#000"
            stroke-width="0.3"
            stroke-dasharray="1 1"
          />
        </svg>
        <p v-if="graphLine" class="phase-names">
          <span v-for="mark in phaseMarks" :key="mark.phase">{{ mark.phase }}</span>
        </p>
        <div v-if="opening" class="score-box">
          <p class="settings-title">{{ opening.name }}</p>
          <p>{{ opening.eco }}</p>
          <p>Reviewed on this phone: White {{ record.white }}, draws {{ record.draw }}, Black {{ record.black }}.</p>
          <p>{{ course.text }}</p>
        </div>
      </section>
    </div>
  </main>
</template>
