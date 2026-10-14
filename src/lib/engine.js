// Stockfish 19 WebAssembly. This module is only started from the browser.
let engine = null
let boot = null
let chain = Promise.resolve()
let workers = []
let listening = false

function fail(message) {
  const error = new Error(message)
  boot = null
  throw error
}

// iPhone Safari kills the tab when SharedArrayBuffer + hash grow too far.
// The WASM heap already starts at 64MB; keep Threads/Hash tiny on phones.
function engineLimits() {
  const ua = navigator.userAgent || ""
  const ios = /iPhone|iPad|iPod/i.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  const android = /Android/i.test(ua)
  const lowMemory = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4
  const phone = ios || android || lowMemory || Math.min(window.screen.width, window.screen.height) <= 500
  if (ios) return { threads: 1, hash: 8 }
  if (phone) return { threads: 1, hash: 16 }
  return {
    threads: Math.max(1, Math.min(2, navigator.hardwareConcurrency || 2)),
    hash: 32
  }
}

// Stockfish pthread workers are not exposed. Capture every Worker it creates so we
// can terminate them; iOS otherwise keeps SharedArrayBuffer alive across visits.
function installWorkerCapture() {
  if (window.Worker.__kindleCapture) return
  const Original = window.Worker
  class CapturedWorker extends Original {
    constructor(...args) {
      super(...args)
      workers.push(this)
    }
  }
  CapturedWorker.__kindleCapture = Original
  window.Worker = CapturedWorker
}

function uninstallWorkerCapture() {
  const Original = window.Worker.__kindleCapture
  if (Original) window.Worker = Original
}

async function start() {
  if (typeof window === "undefined") fail("Stockfish runs in the browser on this phone.")
  if (!window.crossOriginIsolated) {
    fail("Stockfish needs this page to be opened on its own. The site has to send cross-origin isolation headers.")
  }
  watchPageLifetime()
  installWorkerCapture()
  try {
    const engineUrl = new URL("/engine/sf_19_smallnet.js", window.location.href).href
    const loadModule = new Function("url", "return import(url)")
    const createEngine = (await loadModule(engineUrl)).default
    const created = await createEngine()
    const network = created.getRecommendedNnue(0)
    const response = await fetch("/engine/" + network)
    if (!response.ok) fail("The Stockfish network did not load.")
    created.setNnueBuffer(new Uint8Array(await response.arrayBuffer()))
    await command(created, "uci", (line) => line === "uciok")
    const { threads, hash } = engineLimits()
    created.uci("setoption name Threads value " + threads)
    created.uci("setoption name Hash value " + hash)
    created.uci("setoption name MultiPV value 2")
    await command(created, "isready", (line) => line === "readyok")
    engine = created
    return created
  } catch (error) {
    uninstallWorkerCapture()
    for (const worker of workers) {
      try {
        worker.terminate()
      } catch (ignore) {
        // Already dead.
      }
    }
    workers = []
    throw error
  }
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

function watchPageLifetime() {
  if (listening || typeof window === "undefined") return
  listening = true
  // Drop WASM when leaving so reopening the page does not stack heaps on iPhone.
  window.addEventListener("pagehide", () => {
    disposeEngine()
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
  if (!engine) return
  try {
    engine.uci("stop")
  } catch (ignore) {
    // Engine may already be tearing down.
  }
}

// Fully release Stockfish so another visit does not inherit a live WASM heap.
export function disposeEngine() {
  const target = engine
  const liveWorkers = workers
  engine = null
  boot = null
  workers = []
  chain = Promise.resolve()
  uninstallWorkerCapture()
  if (target) {
    try {
      target.listen = () => {}
      target.onError = () => {}
      target.uci("stop")
      target.uci("quit")
    } catch (ignore) {
      // Best-effort shutdown before workers are killed.
    }
  }
  for (const worker of liveWorkers) {
    try {
      worker.terminate()
    } catch (ignore) {
      // Already dead.
    }
  }
}
