# KindleChess Web

Browser game review for [KindleChess](https://github.com/BarPos/KindleChess). Open a game URL on a phone, step through the moves, and grade them with Stockfish 19 running entirely in the browser.

**Live app:** [https://kc.01e.cc/](https://kc.01e.cc/)

**Repositories**

- [KindleChess](https://github.com/BarPos/KindleChess) — Kindle chess client
- [KindleChess-Web](https://github.com/BarPos/KindleChess-Web) — this web review app

## Usage

Put the game in the address query string:

```
https://kc.01e.cc/?m=e2e4e7e5g1f3b8c6f1b5a7a6b5a4&r=1-0
```

`m` is the packed move list (from-square + to-square for each move, no spaces). Optional parameters:

| Param | Meaning |
| --- | --- |
| `r` | Result: `1-0`, `0-1`, or `1/2-1/2` |
| `fen` | Starting position when the game did not begin from the standard opening |
| `pieces` | Piece skin (e.g. `wood`) |
| `board` | Board skin (e.g. `walnut`) |
| `depth` | Stockfish search depth, 1–18 (default 12) |

A FEN alone (no `m`) opens a single-position analysis page.

The guide on [https://kc.01e.cc/](https://kc.01e.cc/) can turn pasted moves or a PGN into a shareable address for a QR code.

## Develop

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

## Credits

Boards and pieces from KindleChess. Piece and board art by Giorgio Megrelli. Analysis by Stockfish 19 in the browser ([lichess-org/stockfish-web](https://github.com/lichess-org/stockfish-web)).
