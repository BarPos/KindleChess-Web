<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue"
import DocsView from "./components/DocsView.vue"
import ReviewView from "./components/ReviewView.vue"
import { loadPacked } from "./lib/game"
import { readPosition } from "./lib/position"
import { parseQuery } from "./lib/skins"

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
const query = ref(parseQuery(window.location.search))
const position = computed(() => (query.value.fen ? readPosition(query.value.fen) : null))
const game = computed(() => {
  if (!query.value.moves) return null
  return loadPacked(query.value.moves, position.value ? position.value.fen() : START)
})

function sync() {
  query.value = parseQuery(window.location.search)
}

onMounted(() => window.addEventListener("popstate", sync))
onUnmounted(() => window.removeEventListener("popstate", sync))
</script>

<template>
  <DocsView v-if="!query.moves && !query.fen" :pieces="query.pieces" :board="query.board" />
  <main v-else-if="query.moves && !game" class="column sheet-wrap">
    <article class="sheet">
      <h1>This game cannot be read</h1>
      <p>The move list has to be the game's moves in order, written as square to square.</p>
      <p class="address">{{ query.moves }}</p>
      <p class="help-row"><a class="text-button" href="./">How to provide a game</a></p>
    </article>
  </main>
  <main v-else-if="query.fen && !query.moves && !position" class="column sheet-wrap">
    <article class="sheet">
      <h1>This position cannot be read</h1>
      <p>The fen argument has to be a complete Forsyth–Edwards Notation position.</p>
      <p class="address">{{ query.fen }}</p>
      <p class="help-row"><a class="text-button" href="./">How to provide a game</a></p>
    </article>
  </main>
  <ReviewView
    v-else
    :game="game"
    :fen="position ? position.fen() : ''"
    :pieces="query.pieces"
    :board="query.board"
    :depth="query.depth"
    :result="query.result || game?.result || ''"
  />
</template>
