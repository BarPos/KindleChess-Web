// Piece and board ids match KindleChess/script.js.
export const PIECE_SETS = ["3d_chesskid", "3d_plastic", "3d_staunton", "3d_wood", "8_bit", "8qetl", "alpha", "bases", "book", "bubblegum", "ca09k", "cases", "classic", "club", "condal", "dash", "ejgfv", "game_room", "glass", "gothic", "graffiti", "icy_sea", "light", "lolz", "luca", "marble", "maya", "metal", "modern", "nature", "neo_wood", "neon", "newspaper", "ocean", "sky", "space", "tigers", "tournament", "vintage", "wood"]
export const BOARD_SETS = ["4fs27.png", "6m5lc.png", "8_bit.png", "9rdwe.png", "bases.png", "bju81.png", "blue.png", "brown.png", "burled_wood.png", "checkers.png", "dark_wood.png", "dash.png", "g715q.png", "glass.png", "icy_sea.png", "light.png", "lolz.png", "marble.png", "metal.png", "my2xa.png", "neon.png", "newspaper.png", "ohdxn.png", "orange.png", "parchment.png", "purple.png", "red.png", "sand.png", "stone.png", "tan.png", "tournament.png", "translucent.png", "walnut.png", "z4m3d.png"]

export function skinLabel(id) {
  const name = String(id || "").replace(/\.png$/i, "").replace(/_/g, " ")
  return name.split(" ").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

export function boardCode(file) {
  return String(file || "").replace(/\.png$/i, "")
}

export function pieceImage(set, code) {
  const color = code.charAt(0)
  const type = code.charAt(1)
  if (!set) return `/img/chesspieces/wikipedia/${color}${type.toUpperCase()}.png`
  return `/img/pieces/${set}/${color}${type.toLowerCase()}.png`
}

export function boardImage(file) {
  return `/img/boards/${file}`
}

function clampInt(value, fallback, min, max) {
  if (value === null || value === undefined || value === "") return fallback
  const number = Number(value)
  if (!Number.isInteger(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

export function normalizePiece(value) {
  const id = String(value || "").trim().toLowerCase()
  if (!id || id === "default" || id === "wikipedia") return ""
  return PIECE_SETS.includes(id) ? id : ""
}

export function normalizeBoard(value) {
  let id = String(value || "").trim().toLowerCase()
  if (!id || id === "default") return ""
  if (!id.endsWith(".png")) id += ".png"
  return BOARD_SETS.includes(id) ? id : ""
}

export function parseQuery(search) {
  const params = new URLSearchParams(search.charAt(0) === "?" ? search.slice(1) : search)
  const fen = (params.get("fen") || "").trim().replace(/\s+/g, " ")
  const rawPieces = (params.get("pieces") || "").trim()
  const rawBoard = (params.get("board") || "").trim()
  const pieces = normalizePiece(rawPieces)
  const board = normalizeBoard(rawBoard)
  const pieceIgnored = rawPieces && !pieces && !/^(default|wikipedia)$/i.test(rawPieces)
  const boardIgnored = rawBoard && !board && !/^default$/i.test(rawBoard)
  return {
    fen,
    moves: (params.get("m") || "").trim(),
    result: (params.get("r") || "").trim(),
    pieces,
    board,
    depth: clampInt(params.get("depth"), 12, 1, 18),
    variants: clampInt(params.get("variants"), 1, 1, 5),
    pieceNote: pieceIgnored ? rawPieces : "",
    boardNote: boardIgnored ? rawBoard : ""
  }
}

export function gameHref({ moves, fen = "", pieces = "", board = "", result = "", depth }) {
  const params = new URLSearchParams()
  if (moves) params.set("m", moves)
  if (fen) params.set("fen", fen)
  if (pieces) params.set("pieces", pieces)
  if (board) params.set("board", boardCode(board))
  if (result) params.set("r", result)
  if (depth) params.set("depth", String(depth))
  return `?${params.toString()}`
}

export function analysisHref({ fen, pieces = "", board = "", depth, variants }) {
  const params = new URLSearchParams()
  params.set("fen", fen)
  if (pieces) params.set("pieces", pieces)
  if (board) params.set("board", boardCode(board))
  if (depth) params.set("depth", String(depth))
  if (variants) params.set("variants", String(variants))
  return `?${params.toString()}`
}
