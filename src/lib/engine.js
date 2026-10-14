// Stockfish 19 WebAssembly. This module is only started from the browser.
let engine = null
let boot = null
let chain = Promise.resolve()

function fail(message) {
  const error = new Error(message)
  boot = null
  throw error
}

async function start() {
  if (typeof window === "undefined") fail("Stockfish runs in the browser on this phone.")
  if (!window.crossOriginIsolated) {
    fail("Stockfish needs this page to be opened on its own. The site has to send cross-origin isolation headers.")
  }
  const engineUrl = new URL("/engine/sf_19_smallnet.js", window.location.href).href
  const loadModule = new Function("url", "return import(url)")
  const createEngine = (await loadModule(engineUrl)).default
  const created = await createEngine()
  const network = created.getRecommendedNnue(0)
  const response = await fetch("/engine/" + network)
  if (!response.ok) fail("The Stockfish network did not load.")
  created.setNnueBuffer(new Uint8Array(await response.arrayBuffer()))
  await command(created, "uci", (line) => line === "uciok")
  const threads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2))
  created.uci("setoption name Threads value " + threads)
  created.uci("setoption name Hash value 64")
  created.uci("setoption name MultiPV value 2")
  await command(created, "isready", (line) => line === "readyok")
  engine = created
  return created
}

function command(target, text, done) {
  return new Promise((resolve, reject) => {
    const previous = target.listen
    const timer = window.setTimeout(() => {
      target.listen = previous
      reject(new Error("Stockfish did not answer."))
    }, 20000)
    target.listen = (line) => {
      if (!done(line)) return
      window.clearTimeout(timer)
      target.listen = previous
      resolve(line)
    }
    target.onError = () => {}
    target.uci(text)
  })
}

export function loadEngine() {
  if (!boot) boot = start().catch((error) => {
    boot = null
    throw error
  })
  return boot
}

export function analyzeFen(fen, depth) {
  const run = chain.then(async () => {
    const target = await loadEngine()
    return new Promise((resolve, reject) => {
      const lines = new Map()
      const timer = window.setTimeout(() => {
        reject(new Error("Stockfish took too long on this position."))
      }, 60000)
      target.listen = (line) => {
        if (line.startsWith("info ") && line.includes(" pv ")) {
          const multipv = Number((line.match(/ multipv (\d+)/) || [])[1] || 1)
          const mate = line.match(/ score mate (-?\d+)/)
          const cp = line.match(/ score cp (-?\d+)/)
          const pv = (line.match(/ pv (.+)$/) || [])[1] || ""
          const uci = pv.split(" ")[0]
          if (!uci || uci === "(none)") return
          lines.set(multipv, {
            multipv,
            uci,
            cp: cp ? Number(cp[1]) : null,
            mate: mate ? Number(mate[1]) : null
          })
        }
        if (!line.startsWith("bestmove")) return
        window.clearTimeout(timer)
        const best = line.split(/\s+/)[1]
        const ranked = [...lines.values()].sort((a, b) => a.multipv - b.multipv)
        resolve({ best: best === "(none)" ? "" : best, lines: ranked })
      }
      target.onError = () => {}
      target.uci("position fen " + fen)
      target.uci("go depth " + depth)
    })
  })
  chain = run.then(() => {}, () => {})
  return run
}

export function stopEngine() {
  if (engine) engine.uci("stop")
}
