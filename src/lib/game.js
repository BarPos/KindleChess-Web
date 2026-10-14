import { Chess } from "chess.js"

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

export function packMoves(history) {
  return history.map((move) => move.from + move.to + (move.promotion || "")).join("")
}

export function loadPacked(packed, startFen = START) {
  const chess = new Chess(startFen)
  const moves = []
  const positions = [chess.fen()]
  let index = 0
  const text = String(packed || "").replace(/\s+/g, "")
  while (index + 4 <= text.length) {
    const from = text.slice(index, index + 2)
    const to = text.slice(index + 2, index + 4)
    const piece = chess.get(from)
    const promotionSquare = piece && piece.type === "p" && (to[1] === "8" || to[1] === "1")
    let promotion
    if (promotionSquare && index + 5 <= text.length && "qrbn".includes(text[index + 4])) promotion = text[index + 4]
    let played
    try {
      played = chess.move({ from, to, promotion })
    } catch (ignore) {
      played = null
    }
    if (!played) break
    moves.push({
      san: played.san,
      uci: from + to + (played.promotion || ""),
      color: played.color,
      from: played.from,
      to: played.to,
      piece: played.piece,
      captured: played.captured || "",
      promotion: played.promotion || "",
      number: played.color === "w" ? chess.moveNumber() : chess.moveNumber() - 1
    })
    positions.push(chess.fen())
    index += played.promotion ? 5 : 4
  }
  if (index !== text.length) return null
  return {
    startFen,
    moves,
    positions,
    result: "",
    finalFen: chess.fen()
  }
}

export function loadMovetext(text, startFen = START) {
  const chess = new Chess(startFen)
  const tokens = String(text || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .split(/\s+/)
    .filter((token) => token && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token))
  if (!tokens.length) return null
  for (const token of tokens) {
    try {
      if (!chess.move(token)) return null
    } catch (ignore) {
      return null
    }
  }
  const packed = packMoves(chess.history({ verbose: true }))
  const game = loadPacked(packed, startFen)
  if (!game) return null
  game.result = resultIn(text)
  return game
}

function resultIn(text) {
  const match = String(text).match(/\b(1-0|0-1|1\/2-1\/2)\b/)
  return match ? match[1] : ""
}

export function loadPgnGame(text) {
  const source = String(text || "").trim()
  if (!source) return null
  const chess = new Chess()
  try {
    chess.loadPgn(source, { strict: false })
  } catch (ignore) {
    return null
  }
  const history = chess.history({ verbose: true })
  if (!history.length) return null
  const headers = chess.getHeaders()
  const startFen = headers.SetUp === "1" && headers.FEN ? headers.FEN : START
  const game = loadPacked(packMoves(history), startFen)
  if (!game) return null
  const headerResult = headers.Result && headers.Result !== "*" ? headers.Result : ""
  game.result = /^(1-0|0-1|1\/2-1\/2)$/.test(headerResult) ? headerResult : resultIn(source)
  return game
}

export function readInput(text) {
  const trimmed = String(text || "").trim()
  if (!trimmed) return { kind: "", error: "" }
  try {
    const position = new Chess(trimmed.replace(/\s+/g, " "))
    return { kind: "fen", fen: position.fen(), error: "" }
  } catch (ignore) {
    // A game is not a FEN.
  }
  const packed = trimmed.replace(/\s+/g, "")
  if (/^[a-h][1-8]/.test(packed) && !/[A-Z]/.test(packed)) {
    const game = loadPacked(packed)
    if (game && game.moves.length) return { kind: "game", game, error: "" }
  }
  const game = loadMovetext(trimmed)
  if (game && game.moves.length) return { kind: "game", game, error: "" }
  return { kind: "", error: "Paste a FEN or the moves of a game." }
}
