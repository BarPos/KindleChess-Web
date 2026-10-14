import { Chess } from "chess.js"
import entries from "../data/openings.json"

const book = new Map(entries.map(([epd, eco, name]) => [epd, { eco, name }]))
const RECORD_KEY = "kindlechess-opening-record"

export function epdOf(fen) {
  return String(fen || "").split(" ").slice(0, 4).join(" ")
}

export function lookupOpening(fen) {
  return book.get(epdOf(fen)) || null
}

export function openingReport(positions) {
  let opening = null
  let bookPlies = 0
  for (let index = 1; index < positions.length; index += 1) {
    const hit = lookupOpening(positions[index])
    if (!hit) break
    opening = hit
    bookPlies = index
  }
  return { opening, bookPlies }
}

export function bookContinuations(fen) {
  const chess = new Chess(fen)
  const found = []
  for (const move of chess.moves({ verbose: true })) {
    const trial = new Chess(fen)
    let played
    try {
      played = trial.move({ from: move.from, to: move.to, promotion: move.promotion })
    } catch (ignore) {
      played = null
    }
    if (!played) continue
    const hit = lookupOpening(trial.fen())
    if (!hit) continue
    found.push({
      uci: move.from + move.to + (move.promotion || ""),
      san: played.san,
      name: hit.name
    })
  }
  return found
}

export function courseFor(name) {
  const family = String(name || "This opening").split(":")[0]
  return {
    title: family,
    text: "Practice the book move where the game left " + family + ". The board will ask for that move."
  }
}

function readRecord() {
  try {
    return JSON.parse(localStorage.getItem(RECORD_KEY) || "{}")
  } catch (ignore) {
    return {}
  }
}

export function rememberGame(openingName, moves, result) {
  if (!openingName || !moves || !result || typeof localStorage === "undefined") return readRecord()[openingName] || { white: 0, draw: 0, black: 0 }
  const all = readRecord()
  const seenKey = "kindlechess-reviewed-games"
  let seen = {}
  try {
    seen = JSON.parse(localStorage.getItem(seenKey) || "{}")
  } catch (ignore) {
    seen = {}
  }
  if (!seen[moves]) {
    seen[moves] = result
    const row = all[openingName] || { white: 0, draw: 0, black: 0 }
    if (result === "1-0") row.white += 1
    else if (result === "0-1") row.black += 1
    else if (result === "1/2-1/2") row.draw += 1
    all[openingName] = row
    localStorage.setItem(RECORD_KEY, JSON.stringify(all))
    localStorage.setItem(seenKey, JSON.stringify(seen))
  }
  return all[openingName] || { white: 0, draw: 0, black: 0 }
}

export function recordFor(openingName) {
  if (!openingName) return { white: 0, draw: 0, black: 0 }
  return readRecord()[openingName] || { white: 0, draw: 0, black: 0 }
}
