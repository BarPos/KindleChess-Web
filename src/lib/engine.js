// Stockfish 19 WebAssembly. This module is only started from the browser.
let engine = null
let boot = null
let chain = Promise.resolve()

function fail(message) {
  const error = new Error(message)
  boot = null
  throw error
}

function isPhone() {
  return (
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))
  )
}

async function start() {
  if (typeof window === "undefined") fail("Stockfish runs in the browser on this phone.")
  if (!window.crossOriginIsolated) {
    fail("Stockfish needs this page to be opened on its own. The site has to send cross-origin isolation headers.")
  }
  const engineUrl = new URL("/engine/sf_19_smallnet.js", window.location.href).href
  const loadModule = new Function("url", "return import(url)")
  const createEngine = (await loadModule(engineUrl)).default
  const errors = []
  const created = await createEngine({
    mainScriptUrlOrBlob: engineUrl,
    locateFile: (file) => new URL(file, engineUrl).href,
    onError: (line) => {
      errors.push(String(line))
    }
  })
  const network = created.getRecommendedNnue(0)
  const response = await fetch("/engine/" + network)
  if (!response.ok) fail("The Stockfish network did not load.")
  created.setNnueBuffer(new Uint8Array(await response.arrayBuffer()))
  await command(created, "uci", (line) => line === "uciok", errors)
  // Extra pthread workers often hang on iOS/Android WebKit. One thread is enough on a phone.
  const phone = isPhone()
  const threads = phone ? 1 : Math.max(1, Math.min(2, navigator.hardwareConcurrency || 1))
  const hash = phone ? 16 : 64
  created.uci("setoption name Threads value " + threads)
  created.uci("setoption name Hash value " + hash)
  created.uci("setoption name MultiPV value 2")
  await command(created, "isready", (line) => line === "readyok", errors)
  engine = created
  return created
}

function command(target, text, done, errors = []) {
  return new Promise((resolve, reject) => {
    const previous = target.listen
    const timer = window.setTimeout(() => {
      target.listen = previous
      const detail = errors.length ? " " + errors[errors.length - 1] : ""
      reject(new Error("Stockfish did not answer." + detail))
    }, 45000)
    target.listen = (line) => {
      if (!done(line)) return
      window.clearTimeout(timer)
      target.listen = previous
      resolve(line)
    }
    target.onError = (line) => {
      errors.push(String(line))
    }
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
