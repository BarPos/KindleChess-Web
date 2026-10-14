import { Chess } from "chess.js"

const POINTS = { p: 1, n: 3, b: 3, r: 5, q: 9 }

export function readPosition(fen) {
  try {
    return new Chess(fen)
  } catch (ignore) {
    return null
  }
}

export function materialStatus(chess) {
  let white = 0
  let black = 0
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || !POINTS[piece.type]) continue
      if (piece.color === "w") white += POINTS[piece.type]
      else black += POINTS[piece.type]
    }
  }
  const diff = white - black
  const diffText = diff === 0 ? "Difference 0" : diff > 0 ? `White +${diff}` : `Black +${-diff}`
  let turnText
  if (chess.isCheckmate()) turnText = chess.turn() === "w" ? "Black wins" : "White wins"
  else if (chess.isStalemate()) turnText = "Stalemate"
  else if (chess.isDraw()) turnText = "Draw"
  else turnText = `${chess.turn() === "w" ? "White" : "Black"} to move${chess.inCheck() ? " · Check" : ""}`
  return `White ${white} • Black ${black}\n${diffText} • ${turnText}`
}

export function gameVerdict(chess) {
  if (chess.isCheckmate()) return chess.turn() === "w" ? "Black wins" : "White wins"
  if (chess.isStalemate()) return "Stalemate"
  if (chess.isDraw()) return "Draw"
  return ""
}

export function kingSquare(chess) {
  if (!chess.inCheck()) return ""
  const turn = chess.turn()
  const files = "abcdefgh"
  const rows = chess.board()
  for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
      const piece = rows[rankIndex][fileIndex]
      if (piece && piece.type === "k" && piece.color === turn) return files[fileIndex] + (8 - rankIndex)
    }
  }
  return ""
}

function playUci(chess, uci) {
  if (!uci || uci.length < 4) return null
  try {
    return chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4]
    })
  } catch (ignore) {
    return null
  }
}

export function describeLine(fen, uciMoves) {
  const chess = new Chess(fen)
  const parts = []
  let first = ""
  for (const uci of uciMoves || []) {
    const turn = chess.turn()
    const moveNumber = chess.moveNumber()
    const played = playUci(chess, uci)
    if (!played) break
    if (!first) first = turn === "w" ? `${moveNumber}. ${played.san}` : `${moveNumber}... ${played.san}`
    if (turn === "w") parts.push(`${moveNumber}. ${played.san}`)
    else if (!parts.length) parts.push(`${moveNumber}... ${played.san}`)
    else parts.push(played.san)
  }
  return { first, full: parts.join(" ") }
}

export function lineMoves(line) {
  if (!line || !line.move) return []
  const rest = Array.isArray(line.continuationArr) ? line.continuationArr : []
  return [line.move, ...rest]
}

export function shortEval(line) {
  if (!line) return ""
  const mate = mateNumber(line)
  if (mate !== null) {
    if (mate === 0) return "Checkmate"
    return `${mate > 0 ? "White" : "Black"} mates in ${Math.abs(mate)}`
  }
  const value = Number(line.eval)
  if (Number.isNaN(value)) return ""
  return (value > 0 ? "+" : "") + value.toFixed(2)
}

export function scoreLine(line) {
  const evalText = shortEval(line)
  if (!evalText) return ""
  const chance = Number(line.winChance)
  if (Number.isNaN(chance)) return evalText
  const white = Math.round(chance)
  return `${evalText} • White ${white}% • Black ${100 - white}%`
}

function mateNumber(line) {
  if (line.mate === null || line.mate === undefined || line.mate === "") return null
  const mate = Number(line.mate)
  return Number.isNaN(mate) ? null : mate
}
