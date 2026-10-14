<script setup>
import { computed, ref, watch } from "vue"
import { loadPgnGame, packMoves, readInput } from "../lib/game"
import { BOARD_SETS, PIECE_SETS, analysisHref, boardCode, boardImage, gameHref, pieceImage, skinLabel } from "../lib/skins"

const props = defineProps({
  pieces: { type: String, default: "" },
  board: { type: String, default: "" }
})

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
const pageRoot = "https://kc.01e.cc/"

const sampleMoves = "e2e4e7e5g1f3b8c6f1b5a7a6b5a4"

const examples = computed(() => [
  {
    title: "A short game, move by move",
    href: gameHref({ moves: sampleMoves, result: "1-0" })
  },
  {
    title: "The same game, wood pieces, walnut board",
    href: gameHref({ moves: sampleMoves, pieces: "wood", board: "walnut", result: "1-0" })
  },
  {
    title: "One position only",
    href: analysisHref({ fen: START })
  },
  {
    title: "One position after 1. e4",
    href: analysisHref({ fen: AFTER_E4 })
  }
])

const sampleAddress = computed(() => pageRoot + examples.value[1].href)

const pieceRows = computed(() => [
  { id: "", label: "Default", code: "default" },
  ...PIECE_SETS.map((id) => ({ id, label: skinLabel(id), code: id })).sort((a, b) => a.label.localeCompare(b.label))
])

const boardRows = computed(() => [
  { id: "", label: "Default", code: "default" },
  ...BOARD_SETS.map((id) => ({ id, label: skinLabel(id), code: boardCode(id) })).sort((a, b) => a.label.localeCompare(b.label))
])

const preview = ["wk", "wq", "wn", "bk"]
const fenInput = ref("")
const pgnInput = ref("")
const copied = ref(false)
const pgnCopied = ref(false)

watch(fenInput, () => {
  copied.value = false
})

watch(pgnInput, () => {
  pgnCopied.value = false
})

const converted = computed(() => {
  const text = fenInput.value.trim()
  if (!text) return { href: "", url: "", error: "" }
  const found = readInput(text)
  if (found.error) return { href: "", url: "", error: found.error }
  const href = found.kind === "game"
    ? gameHref({ moves: packMoves(found.game.moves), pieces: props.pieces, board: props.board, result: found.game.result })
    : analysisHref({ fen: found.fen, pieces: props.pieces, board: props.board })
  return { href, url: pageRoot + href, error: "" }
})

const pgnGame = computed(() => loadPgnGame(pgnInput.value))

const pgnAddress = computed(() => {
  const text = pgnInput.value.trim()
  if (!text) return { href: "", url: "", error: "" }
  if (!pgnGame.value) return { href: "", url: "", error: "That is not a PGN game." }
  const start = pgnGame.value.startFen === START ? "" : pgnGame.value.startFen
  const href = gameHref({
    moves: packMoves(pgnGame.value.moves),
    fen: start,
    pieces: props.pieces,
    board: props.board,
    result: pgnGame.value.result
  })
  return { href, url: pageRoot + href, error: "" }
})

async function copyText(url, flag) {
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    flag.value = true
    window.setTimeout(() => {
      flag.value = false
    }, 1500)
  } catch (ignore) {
    flag.value = false
  }
}

function copyUrl() {
  copyText(converted.value.url, copied)
}

function copyPgnUrl() {
  copyText(pgnAddress.value.url, pgnCopied)
}
</script>

<template>
  <main class="column sheet-wrap">
    <article class="sheet">
      <h1>Chess</h1>
      <p>
        This page reviews a whole game, one move at a time. Stockfish 19 runs in the browser on the phone.
        Nothing is calculated on a server.
      </p>
      <p>
        No game was provided, so this page is the guide. Put the moves in the address.
        A QR code can contain that address, and opening it on a phone shows the review.
      </p>
      <p class="repo-links">
        <a href="https://github.com/BarPos/KindleChess">KindleChess</a>
        ·
        <a href="https://github.com/BarPos/KindleChess-Web">KindleChess-Web</a>
      </p>

      <h2>Make an address</h2>
      <p>
        Paste the moves of a game, or one FEN position. This turns the text into an address you can put in a QR code.
      </p>
      <label class="field-label" for="fen-input">Game or position</label>
      <textarea
        id="fen-input"
        v-model="fenInput"
        class="fen-input"
        rows="3"
        spellcheck="false"
        placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5"
      ></textarea>
      <p v-if="converted.error" class="convert-note">{{ converted.error }}</p>
      <template v-else-if="converted.url">
        <a class="address" :href="converted.href">{{ converted.url }}</a>
        <p class="convert-actions">
          <a class="text-button" :href="converted.href">Open</a>
          <button type="button" @click="copyUrl">{{ copied ? "Copied" : "Copy" }}</button>
        </p>
      </template>

      <h2>From a PGN</h2>
      <p>
        Paste a game in PGN. Headers, the result, and a starting <code>FEN</code> are kept.
        The address uses the same compact move list as a QR code.
      </p>
      <label class="field-label" for="pgn-input">PGN</label>
      <textarea
        id="pgn-input"
        v-model="pgnInput"
        class="fen-input"
        rows="8"
        spellcheck="false"
        placeholder="[Event &quot;Example&quot;]&#10;[Result &quot;1-0&quot;]&#10;&#10;1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 1-0"
      ></textarea>
      <p v-if="pgnAddress.error" class="convert-note">{{ pgnAddress.error }}</p>
      <template v-else-if="pgnAddress.url">
        <a class="address" :href="pgnAddress.href">{{ pgnAddress.url }}</a>
        <p class="convert-actions">
          <a class="text-button" :href="pgnAddress.href">Open</a>
          <button type="button" @click="copyPgnUrl">{{ pgnCopied ? "Copied" : "Copy" }}</button>
        </p>
      </template>

      <h2>Game</h2>
      <p>
        The argument <code>m</code> is the whole game. Write every move as the from-square and the to-square, with no spaces between moves.
        A pawn promotion adds one letter at the end of that move: <code>q</code>, <code>r</code>, <code>b</code>, or <code>n</code>.
        For example, <code>e7e8q</code> is a pawn from e7 to e8 that becomes a queen.
      </p>
      <p class="address">https://kc.01e.cc/?m={{ sampleMoves }}&amp;r=1-0</p>
      <p>
        <code>r</code> is the result, when the game has one: <code>1-0</code>, <code>0-1</code>, or <code>1/2-1/2</code>.
        It is stored on this phone with the opening, so later games in the same opening show a tally.
      </p>
      <p>
        <code>fen</code> is optional. Leave it out when the game starts from the normal opening position.
        If the game started from another position, <code>fen</code> is that starting position and <code>m</code> is the moves played from there.
        Spaces in a FEN are written as <code>+</code> or <code>%20</code>.
      </p>
      <p>
        On the phone you can step through the moves. Each move is marked Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, or Blunder.
        The page also shows an accuracy score, a fictional estimated rating, an evaluation bar, arrows for the recommended moves, a graph of the advantage, and the opening name.
      </p>
      <p class="address">{{ sampleAddress }}</p>
      <ul class="examples">
        <li v-for="example in examples" :key="example.href">
          <a :href="example.href">{{ example.title }}</a>
        </li>
      </ul>

      <h2>One position</h2>
      <p>
        A FEN by itself, with no <code>m</code>, opens that single position. It is not a game, so there are no move grades.
        The board still shows the evaluation and the recommended arrows.
        A FEN has six fields separated by spaces: piece placement, side to move, castling, en passant square, halfmove clock, and fullmove number.
      </p>
      <p class="address">{{ pageRoot + analysisHref({ fen: START }) }}</p>

      <h2>Skins</h2>
      <p>
        The board and pieces are the KindleChess skins. Add them to the same address.
        Leave a skin out, or pass <code>default</code>, for the Wikipedia pieces and the plain tan and brown board.
        An unknown name is ignored and the default is used.
      </p>
      <p>
        <code>pieces</code> chooses the piece set. <code>board</code> chooses the board.
        <code>board=walnut</code> and <code>board=walnut.png</code> are the same.
      </p>
      <p class="address">https://kc.01e.cc/?m={{ sampleMoves }}&amp;pieces=wood&amp;board=walnut</p>

      <h3>Pieces</h3>
      <ul class="catalog">
        <li v-for="row in pieceRows" :key="'p-' + row.code" :class="{ 'is-selected': row.id === pieces }">
          <span class="skin-preview">
            <img v-for="code in preview" :key="code" :src="pieceImage(row.id, code)" alt="" />
          </span>
          <span class="skin-name">{{ row.label }}</span>
          <code class="skin-id">{{ row.code }}</code>
        </li>
      </ul>

      <h3>Boards</h3>
      <ul class="catalog">
        <li v-for="row in boardRows" :key="'b-' + row.code" :class="{ 'is-selected': row.id === board }">
          <span class="skin-preview">
            <img v-if="row.id" class="board-thumb" :src="boardImage(row.id)" alt="" />
            <span v-else class="board-thumb default-board" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          </span>
          <span class="skin-name">{{ row.label }}</span>
          <code class="skin-id">{{ row.code }}</code>
        </li>
      </ul>

      <h2>Search</h2>
      <p>
        <code>depth</code> is how far Stockfish searches, from 1 to 18. The default is 12.
        A higher depth takes longer on the phone and grades the moves more carefully.
      </p>
      <p class="address">https://kc.01e.cc/?m={{ sampleMoves }}&amp;depth=12</p>

      <h2>QR code</h2>
      <p>
        Build the full address starting with <code>https://kc.01e.cc/</code>, then encode that address in the QR code.
        The game belongs in <code>m</code>. Skins, the result, and depth can sit in the same address.
        Scanning the code on a phone opens the review.
      </p>

      <p class="credits">
        Boards and pieces from KindleChess. Piece and board art by Giorgio Megrelli (chess.com boards and pieces).
        Analysis by Stockfish 19 in the browser, from lichess-org/stockfish-web.
      </p>
    </article>
  </main>
</template>
