<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { Chess } from "chess.js"
import ChessBoard from "./ChessBoard.vue"
import { analyzeFen, disposeEngine, stopEngine } from "../lib/engine"
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
  if (variation.value && !variation.value.analysis) return null
  if (variation.value?.analysis) return whiteScore(variation.value.analysis, new Chess(variation.value.fen).turn())
  const found = analyses.value[ply.value]
  if (!found?.best) return null
  return whiteScore(found.best, found.turn)
})

const viewFen = computed(() => variation.value?.fen || positions[ply.value])
const played = computed(() => (ply.value === 0 ? null : moves[ply.value - 1]))
const grade = computed(() => (played.value ? grades.value[ply.value - 1] : ""))
const arrows = computed(() => {
  if (variation.value && !variation.value.analysis) return []
  if (variation.value?.analysis) return [{ from: variation.value.analysis.uci.slice(0, 2), to: variation.value.analysis.uci.slice(2, 4), rank: 1 }]
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

const explanation = computed(() => {
  if (!played.value || !grade.value) return ""
  if (grade.value === "book") return "Book: this move follows a recognized opening line, so it is not judged against the engine’s move quality thresholds."
  const before = analyses.value[ply.value - 1]
  const after = analyses.value[ply.value]
  if (!before?.best || !after?.best) return "The engine needs both positions analyzed before it can explain this move."
  const bestMove = sanFor(positions[ply.value - 1], before.best.uci)
  const loss = moveLoss(before.best, after.best, positions[ply.value]) * 100
  if (grade.value === "miss" && before.best.mate != null) {
    return `You missed a forced mate. The engine preferred ${bestMove}${before.best.mate === 1 ? ", which checkmates in one" : `, which mates in ${Math.abs(before.best.mate)} moves`}.`
  }
  const comparison = `The engine’s top choice was ${bestMove}. This move gave up about ${loss.toFixed(1)} percentage points of expected score versus that choice.`
  const descriptions = {
    brilliant: "Brilliant: this is the engine’s top move and the app’s material check flagged it as a sacrifice or exposed piece. That label is a heuristic, not proof of a forced tactic.",
    great: "Great: you found the top engine move, and it is clearly better than the next choice.",
    best: "Best: this matches the engine’s top choice or is effectively tied with it.",
    excellent: "Excellent: a near top move, losing less than 2 expected-score points by the app’s thresholds.",
    good: "Good: a solid move, with a small drop of under 5 expected-score points.",
    inaccuracy: "Inaccuracy: this gives up a modest part of the position, under 10 expected-score points.",
    mistake: "Mistake: this gives up a substantial part of the position, under 20 expected-score points.",
    miss: "Miss: a winning opportunity was available, but this move lets the advantage slip.",
    blunder: "Blunder: this gives up at least 20 expected-score points compared with the engine’s top move."
  }
  return `${descriptions[grade.value] || "Move rating"} ${comparison}`
})

function sanFor(fen, uci) {
  try {
    const chess = new Chess(fen)
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    return move?.san || uci
  } catch (ignore) { return uci }
}

function moveLoss(best, after, afterFen) {
  const bestValue = best.mate != null ? (best.mate > 0 ? 1 : 0) : 1 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, best.cp || 0))))
  const chess = new Chess(afterFen)
  const playedValue = chess.isCheckmate() ? 1 : after?.mate != null
    ? (after.mate > 0 ? 0 : 1)
    : 1 - 1 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, after?.cp || 0))))
  return Math.max(0, bestValue - playedValue)
}

const missedMates = computed(() => {
  const stats = { w: { one: 0, more: 0 }, b: { one: 0, more: 0 } }
  moves.forEach((move, index) => {
    const best = analyses.value[index]?.best
    if (best?.mate == null || best.mate <= 0 || move.uci === best.uci) return
    const after = analyses.value[index + 1]?.best
    if (after?.mate != null && after.mate < 0) return
    if (best.mate === 1) stats[move.color].one += 1
    else stats[move.color].more += 1
  })
  return stats
})

const variation = ref(null)
const variationBusy = ref(false)
const variationError = ref("")
let variationRequestId = 0
const selectedSquare = ref("")
const pendingPromotion = ref([])
const boardMoves = computed(() => {
  try { return new Chess(variation.value?.fen || positions[ply.value]).moves({ verbose: true }) } catch (ignore) { return [] }
})
const boardTargets = computed(() => boardMoves.value.filter((move) => move.from === selectedSquare.value).map((move) => move.to))
const currentRecommendation = computed(() => variation.value?.analysis || analyses.value[ply.value]?.best || null)
const variationGrade = computed(() => {
  if (!variation.value?.analysis || !variation.value.beforeAnalysis?.best) return ""
  return classifyMove(
    variation.value.move,
    variation.value.beforeAnalysis,
    variation.value.afterAnalysis,
    new Chess(variation.value.beforeFen),
    new Chess(variation.value.fen),
    false
  )
})
const variationRatingExplanation = computed(() => {
  if (!variation.value) return ""
  if (!variation.value.analysis) return "Waiting for Stockfish to analyze this move."
  if (!variationGrade.value) return "Stockfish could not compare this move with the best line."
  if (variationGrade.value === "book") return "This move follows a recognized opening line."
  const best = variation.value.beforeAnalysis?.best
  if (!best) return "The position before this move has not been analyzed yet."
  const bestMove = sanFor(variation.value.beforeFen, best.uci)
  const loss = moveLoss(best, variation.value.analysis, variation.value.fen) * 100
  if (variationGrade.value === "miss" && best.mate != null && best.mate > 0) {
    return `The top move ${bestMove} had a forced mate. This move misses it.`
  }
  return `Stockfish’s top choice was ${bestMove}. This move gives up about ${loss.toFixed(1)} percentage points of expected score.`
})
const promotionRecommendation = computed(() => {
  if (!pendingPromotion.value.length || !currentRecommendation.value?.uci) return "Stockfish is still analyzing this position."
  const best = currentRecommendation.value.uci
  const sameMove = pendingPromotion.value.find((move) => move.from + move.to + (move.promotion || "") === best)
  if (sameMove) return `Stockfish recommends promoting to ${promotionName(sameMove.promotion)}.`
  return `Stockfish’s top choice is ${sanFor(variation.value?.fen || positions[ply.value], best)}; this promotion is not its top move.`
})

function promotionName(piece) {
  return ({ q: "Queen", r: "Rook", b: "Bishop", n: "Knight" })[piece] || "Queen"
}

function playBoardMove(candidate) {
  explore({
    san: candidate.san,
    uci: candidate.from + candidate.to + (candidate.promotion || ""),
    from: candidate.from,
    to: candidate.to,
    promotion: candidate.promotion || ""
  })
  selectedSquare.value = ""
  pendingPromotion.value = []
}

function onBoardSquare(square) {
  const fen = variation.value?.fen || positions[ply.value]
  const chess = new Chess(fen)
  if (!selectedSquare.value) {
    if (chess.get(square)?.color === chess.turn()) selectedSquare.value = square
    return
  }
  const candidates = boardMoves.value.filter((move) => move.from === selectedSquare.value && move.to === square)
  if (candidates.length > 1 && candidates.every((move) => move.promotion)) {
    pendingPromotion.value = candidates
    return
  }
  if (candidates.length) {
    playBoardMove(candidates[0])
    return
  }
  selectedSquare.value = chess.get(square)?.color === chess.turn() ? square : ""
}

async function explore(move) {
  const requestId = ++variationRequestId
  const baseFen = variation.value?.fen || positions[ply.value]
  const previousPath = variation.value?.path || []
  const beforeAnalysis = variation.value?.afterAnalysis || analyses.value[ply.value]
  const chess = new Chess(baseFen)
  const played = chess.move({ from: move.from, to: move.to, promotion: move.promotion || undefined })
  const playedMove = {
    ...move,
    san: played.san,
    uci: played.from + played.to + (played.promotion || ""),
    from: played.from,
    to: played.to,
    promotion: played.promotion || "",
    color: played.color,
    piece: played.piece,
    captured: played.captured || ""
  }
  variationBusy.value = true
  variationError.value = ""
  const selectedVariation = { requestId, move: playedMove, path: previousPath.concat(played.san), beforeFen: baseFen, beforeAnalysis, fen: chess.fen(), analysis: chess.isCheckmate() ? { uci: "", mate: -1, cp: null } : chess.isDraw() ? { uci: "", mate: null, cp: 0 } : null, afterAnalysis: null }
  variation.value = selectedVariation
  if (variation.value.analysis) {
    selectedVariation.afterAnalysis = { turn: chess.turn(), best: null, second: null, bestUci: "" }
    variationBusy.value = false
    return
  }
  try {
    const result = await analyzeFen(chess.fen(), props.depth)
    if (variation.value?.requestId === requestId) {
      variation.value.analysis = result.lines[0] || (result.best ? { uci: result.best, cp: null, mate: null } : null)
      variation.value.afterAnalysis = {
        turn: chess.turn(),
        lines: result.lines,
        best: result.lines[0] || null,
        second: result.lines[1] || null,
        bestUci: result.lines[0]?.uci || result.best || ""
      }
      if (!variation.value.analysis) variationError.value = "Stockfish returned no evaluation for this position."
    }
  } catch (error) {
    if (variation.value?.requestId === requestId) variationError.value = error.message || "Could not analyze this move."
  } finally {
    if (variation.value?.requestId === requestId) variationBusy.value = false
  }
}

function restoreGame() {
  variation.value = null
  variationError.value = ""
  selectedSquare.value = ""
  pendingPromotion.value = []
}

function scrollToCurrentMove() {
  nextTick(() => {
    const list = moveListEl.value
    const selected = list?.querySelector(".move-row.is-selected")
    if (!list || !selected) return
    const top = list.scrollTop + selected.getBoundingClientRect().top - list.getBoundingClientRect().top
    list.scrollTo({ top, behavior: "smooth" })
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
    // Free the WASM heap after the review is graded; leaving it alive OOMs on reopen.
    disposeEngine()
  } catch (error) {
    analyzing.value = false
    failed.value = error.message || "Stockfish could not start on this phone."
    status.value = failed.value
    disposeEngine()
  }
})

onUnmounted(() => {
  alive = false
  stopEngine()
  disposeEngine()
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
              :from="variation ? variation.move.from : played?.from || ''"
              :to="variation ? variation.move.to : played?.to || ''"
              :arrows="arrows"
              :interactive="true"
              :selected="selectedSquare"
              :marks="boardTargets"
              @square="onBoardSquare"
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
          <div v-if="pendingPromotion.length" class="promotion-choice">
            <p>Choose a piece to promote to.</p>
            <p class="promotion-recommendation">{{ promotionRecommendation }}</p>
            <div class="promotion-options">
              <button v-for="move in pendingPromotion" :key="move.promotion" type="button" @click="playBoardMove(move)">{{ promotionName(move.promotion) }}</button>
            </div>
          </div>
          <template v-if="variation">
            <p class="last-move">Exploring {{ variation.path.join(" ") }}</p>
            <p class="move-rating" :data-grade="variationGrade || undefined">{{ variationBusy && !variation.analysis ? "Analyzing move…" : variationGrade ? CLASS_LABEL[variationGrade] : variation.analysis ? "Unrated" : "" }}</p>
            <p v-if="variationRatingExplanation" class="move-explanation">{{ variationRatingExplanation }}</p>
            <p class="variation-eval">Position evaluation: {{ variationBusy && !variation.analysis ? "Analyzing…" : formatEval(whiteScore(variation.analysis, new Chess(variation.fen).turn())) || "—" }}</p>
            <p v-if="variation.analysis" class="move-explanation">The engine evaluates this position at {{ formatEval(whiteScore(variation.analysis, new Chess(variation.fen).turn())) }}{{ variation.analysis.uci ? ` and recommends ${sanFor(variation.fen, variation.analysis.uci)} next` : "" }}.</p>
            <p v-if="variationError" class="move-explanation">{{ variationError }}</p>
            <button type="button" class="restore-button" @click="restoreGame">Back to game analysis</button>
          </template>
          <template v-else>
            <p class="last-move">{{ moveLabel }}</p>
            <p v-if="moveRating" class="move-rating" :data-grade="grade || undefined">{{ moveRating }}</p>
            <p v-if="explanation" class="move-explanation">{{ explanation }}</p>
          </template>
        </div>
        <p v-if="failed" class="convert-note">{{ failed }}</p>
      </section>
      <section class="review-side">
        <div v-if="moves.length && !variation" ref="moveListEl" class="move-list">
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
        <div v-if="moves.length && !variation" class="score-box">
          <p>White accuracy {{ scores.w == null ? "…" : scores.w.toFixed(1) + "%" }}</p>
          <p>Estimated rating {{ estimatedRating(scores.w) ?? "…" }}</p>
          <p>Black accuracy {{ scores.b == null ? "…" : scores.b.toFixed(1) + "%" }}</p>
          <p>Estimated rating {{ estimatedRating(scores.b) ?? "…" }}</p>
          <p>Missed mate in one: White {{ missedMates.w.one }}, Black {{ missedMates.b.one }}</p>
          <p>Missed longer forced mate: White {{ missedMates.w.more }}, Black {{ missedMates.b.more }}</p>
          <p class="credits">The rating is a fictional estimate from the accuracy score. It is not a real Elo.</p>
          <p class="class-counts">
            <span v-for="name in CLASS_ORDER" :key="name">{{ CLASS_LABEL[name] }} {{ counts[name] }}</span>
          </p>
        </div>
        <svg v-if="graphLine && !variation" class="eval-graph" viewBox="0 0 100 100" role="img" aria-label="Evaluation across the game">
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
        <p v-if="graphLine && !variation" class="phase-names">
          <span v-for="mark in phaseMarks" :key="mark.phase">{{ mark.phase }}</span>
        </p>
        <div v-if="opening && !variation" class="score-box">
          <p class="settings-title">{{ opening.name }}</p>
          <p>{{ opening.eco }}</p>
          <p>Reviewed on this phone: White {{ record.white }}, draws {{ record.draw }}, Black {{ record.black }}.</p>
          <p>{{ course.text }}</p>
        </div>
      </section>
    </div>
  </main>
</template>
