// Browser-only client for https://chess-api.com/ (no authentication).
export function startAnalysis(request, onUpdate) {
  let stopped = false
  let socket = null
  let usedPost = false
  let gotMove = false
  const taskId = Math.random().toString(36).slice(2, 12)
  const lines = new Map()

  function emit(patch) {
    if (stopped) return
    const list = Array.from(lines.values())
      .sort((a, b) => (b.depth - a.depth) || (a.rank - b.rank))
      .slice(0, request.variants)
    onUpdate({
      lines: list.map((line) => ({
        ...line,
        continuationArr: Array.isArray(line.continuationArr) ? line.continuationArr.slice() : []
      })),
      status: patch.status || "",
      done: Boolean(patch.done),
      error: patch.error || ""
    })
  }

  function ingest(data) {
    if (stopped || !data || typeof data !== "object") return
    if (data.type === "log") return
    if (data.type === "info") {
      emit({ status: data.text || "Analyzing…" })
      return
    }
    if (data.type === "error") {
      const text = data.text || "Cannot analyze this position"
      emit({ status: text, done: true, error: text })
      finish()
      return
    }
    if (data.type !== "move" && data.type !== "bestmove") return
    gotMove = true
    const previous = lines.get(data.move)
    const rank = previous && previous.depth === data.depth
      ? previous.rank
      : Array.from(lines.values()).filter((line) => line.depth === data.depth).length
    lines.set(data.move, { ...data, rank })
    const done = data.type === "bestmove"
    emit({ status: `Depth ${data.depth}`, done })
    if (done) finish()
  }

  function finish() {
    stopped = true
    clearTimeout(watchdog)
    if (socket && socket.readyState === WebSocket.OPEN) socket.close()
  }

  async function post() {
    if (stopped || usedPost || gotMove) return
    usedPost = true
    if (socket && socket.readyState < 2) socket.close()
    emit({ status: "Analyzing…" })
    try {
      const response = await fetch("https://chess-api.com/v1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: request.fen,
          depth: request.depth,
          variants: request.variants,
          taskId
        })
      })
      const data = await response.json()
      if (Array.isArray(data)) data.forEach(ingest)
      else ingest(data)
      if (!stopped && !gotMove) {
        emit({ status: "No analysis returned", done: true, error: "No analysis returned" })
        finish()
      }
    } catch (ignore) {
      if (!stopped) {
        emit({
          status: "The analysis service could not be reached",
          done: true,
          error: "The analysis service could not be reached"
        })
        finish()
      }
    }
  }

  const watchdog = setTimeout(post, 5000)

  try {
    socket = new WebSocket("wss://chess-api.com/v1")
    socket.addEventListener("open", () => {
      if (stopped) return
      socket.send(JSON.stringify({
        fen: request.fen,
        depth: request.depth,
        variants: request.variants,
        taskId
      }))
    })
    socket.addEventListener("message", (event) => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch (ignore) {
        return
      }
      if (data && (data.type === "move" || data.type === "bestmove" || data.type === "error")) {
        clearTimeout(watchdog)
      }
      ingest(data)
    })
    socket.addEventListener("error", () => {
      if (!gotMove) post()
    })
    socket.addEventListener("close", () => {
      if (!stopped && !gotMove) post()
    })
  } catch (ignore) {
    post()
  }

  return () => {
    stopped = true
    clearTimeout(watchdog)
    if (socket && socket.readyState < 2) socket.close()
  }
}
