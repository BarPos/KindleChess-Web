const CLASS_ORDER = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"]

export const CLASS_LABEL = {
  brilliant: "Brilliant",
  great: "Great",
  best: "Best",
  excellent: "Excellent",
  good: "Good",
  book: "Book",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  miss: "Miss",
  blunder: "Blunder"
}

export function expectedPoints(cp) {
  const capped = Math.max(-1000, Math.min(1000, Number(cp) || 0))
  return 1 / (1 + Math.exp(-0.00368208 * capped))
}

export function whiteScore(line, turn) {
  if (!line) return null
  if (line.mate != null && line.mate !== 0) {
    const whiteMate = turn === "w" ? line.mate : -line.mate
    return { mate: whiteMate, cp: whiteMate > 0 ? 10000 : -10000 }
  }
  const cp = Number(line.cp)
  if (Number.isNaN(cp)) return null
  return { mate: null, cp: turn === "w" ? cp : -cp }
}

export function formatEval(score) {
  if (!score) return ""
  if (score.mate != null && score.mate !== 0) return (score.mate > 0 ? "+" : "-") + "M" + Math.abs(score.mate)
  const pawns = score.cp / 100
  return (pawns > 0 ? "+" : "") + pawns.toFixed(2)
}

export function whiteChance(score) {
  if (!score) return 50
  if (score.mate != null && score.mate !== 0) return score.mate > 0 ? 100 : 0
  return expectedPoints(score.cp) * 100
}

function moverExpected(score) {
  if (!score) return null
  if (score.mate != null && score.mate !== 0) return score.mate > 0 ? 1 : 0
  return expectedPoints(score.cp)
}

function material(chess, color) {
  const points = { p: 1, n: 3, b: 3, r: 5, q: 9 }
  let total = 0
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.color === color && points[piece.type]) total += points[piece.type]
    }
  }
  return total
}

function hangingPiece(chess, move) {
  if (!move || move.piece === "p") return false
  const enemy = move.color === "w" ? "b" : "w"
  const attacked = chess.attackers(move.to, enemy).length > 0
  const defended = chess.attackers(move.to, move.color).length > 0
  return attacked && !defended
}

export function classifyMove(move, before, after, beforeChess, afterChess, isBook) {
  if (isBook) return "book"
  if (!before?.best) return ""
  const bestExp = moverExpected(before.best)
  const secondExp = before.second ? moverExpected(before.second) : null
  let playedExp = null
  if (afterChess.isCheckmate()) playedExp = 1
  else if (afterChess.isGameOver()) playedExp = 0.5
  else if (after?.best) playedExp = 1 - moverExpected(after.best)
  if (bestExp == null || playedExp == null) return ""
  const loss = Math.max(0, bestExp - playedExp)
  const playedBest = move.uci === before.bestUci || move.uci === before.best?.uci
  const nearBest = playedBest || loss < 0.005
  if (nearBest) {
    const drop = material(beforeChess, move.color) - material(afterChess, move.color)
    const sacrifice = drop >= 3 || hangingPiece(afterChess, move)
    if (playedBest && sacrifice && bestExp < 0.9 && playedExp >= 0.4) return "brilliant"
    if (playedBest && secondExp != null && bestExp - secondExp >= 0.1 && bestExp < 0.92) return "great"
    return "best"
  }
  if (bestExp >= 0.72 && playedExp <= 0.58 && playedExp >= 0.4) return "miss"
  if (loss < 0.02) return "excellent"
  if (loss < 0.05) return "good"
  if (loss < 0.1) return "inaccuracy"
  if (loss < 0.2) return "mistake"
  return "blunder"
}

export function moveAccuracy(bestExp, playedExp) {
  if (bestExp == null || playedExp == null) return null
  const loss = Math.max(0, (bestExp - playedExp) * 100)
  const raw = 103.16681007172983 * Math.exp(-0.04354415386775905 * loss) - 3.166924740191411
  return Math.max(0, Math.min(100, raw))
}

export function estimatedRating(accuracy) {
  if (accuracy == null || Number.isNaN(accuracy)) return null
  const value = Math.max(0, Math.min(100, accuracy))
  return Math.round(Math.min(2800, Math.max(100, (value - 15) * 30)))
}

export function phaseOf(chess) {
  let queens = 0
  let pieces = 0
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue
      if (piece.type === "q") queens += 1
      if ("qrbn".includes(piece.type)) pieces += 1
    }
  }
  if ((queens === 0 && pieces <= 6) || pieces <= 4) return "endgame"
  if (chess.moveNumber() <= 12) return "opening"
  return "middlegame"
}

export function tally(grades) {
  const counts = {}
  for (const name of CLASS_ORDER) counts[name] = 0
  for (const grade of grades) {
    if (grade && counts[grade] != null) counts[grade] += 1
  }
  return counts
}

export { CLASS_ORDER }
