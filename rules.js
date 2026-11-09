// American checkers rules. Pure functions with no DOM access.
// The board is a 64-item array read left to right, top to bottom.
const Checkers = (() => {
  const OPPONENT = { red: "black", black: "red" };
  const KING_ROW = { red: 0, black: 7 };
  const FORWARD = { red: -1, black: 1 };
  // A draw after 40 turns each with no jump and no regular piece moved.
  const DRAW_AFTER_QUIET_MOVES = 80;

  const index = (row, col) => row * 8 + col;
  const rowOf = (i) => Math.floor(i / 8);
  const colOf = (i) => i % 8;
  const onBoard = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;
  const isPlayable = (row, col) => (row + col) % 2 === 1;

  function newGame() {
    const board = Array(64).fill(null);
    let id = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (!isPlayable(row, col)) continue;
        if (row < 3) board[index(row, col)] = { id: id++, color: "black", king: false };
        if (row > 4) board[index(row, col)] = { id: id++, color: "red", king: false };
      }
    }
    return { board, turn: "red", chain: null, quiet: 0, result: null };
  }

  function directions(piece) {
    const forward = FORWARD[piece.color];
    const dirs = [[forward, -1], [forward, 1]];
    if (piece.king) dirs.push([-forward, -1], [-forward, 1]);
    return dirs;
  }

  function jumpsFrom(board, from) {
    const piece = board[from];
    const row = rowOf(from);
    const col = colOf(from);
    const jumps = [];
    for (const [dr, dc] of directions(piece)) {
      if (!onBoard(row + dr * 2, col + dc * 2)) continue;
      const over = index(row + dr, col + dc);
      const to = index(row + dr * 2, col + dc * 2);
      if (board[to] === null && board[over] && board[over].color !== piece.color) {
        jumps.push({ from, to, over });
      }
    }
    return jumps;
  }

  function stepsFrom(board, from) {
    const row = rowOf(from);
    const col = colOf(from);
    const steps = [];
    for (const [dr, dc] of directions(board[from])) {
      if (!onBoard(row + dr, col + dc)) continue;
      const to = index(row + dr, col + dc);
      if (board[to] === null) steps.push({ from, to, over: null });
    }
    return steps;
  }

  // Jumps are mandatory: plain moves only count when no jump exists.
  function legalMoves(state) {
    if (state.result) return [];
    if (state.chain !== null) return jumpsFrom(state.board, state.chain);

    const jumps = [];
    const steps = [];
    state.board.forEach((piece, i) => {
      if (!piece || piece.color !== state.turn) return;
      jumps.push(...jumpsFrom(state.board, i));
      steps.push(...stepsFrom(state.board, i));
    });
    return jumps.length ? jumps : steps;
  }

  function applyMove(state, move) {
    const board = state.board.slice();
    let piece = board[move.from];
    const isJump = move.over !== null;
    const wasKing = piece.king;

    board[move.from] = null;
    if (isJump) board[move.over] = null;

    const promoted = !wasKing && rowOf(move.to) === KING_ROW[piece.color];
    if (promoted) piece = { ...piece, king: true };
    board[move.to] = piece;

    const quiet = isJump || !wasKing ? 0 : state.quiet + 1;

    // A piece that has just been crowned ends the turn, even if it could jump again.
    if (isJump && !promoted && jumpsFrom(board, move.to).length) {
      return { ...state, board, chain: move.to, quiet };
    }

    const next = { board, turn: OPPONENT[state.turn], chain: null, quiet, result: null };
    if (legalMoves(next).length === 0) {
      const loserHasPieces = board.some((p) => p && p.color === next.turn);
      next.result = { winner: state.turn, reason: loserHasPieces ? "blocked" : "captured" };
    } else if (quiet >= DRAW_AFTER_QUIET_MOVES) {
      next.result = { winner: null, reason: "quiet" };
    }
    return next;
  }

  return { newGame, legalMoves, applyMove, isPlayable, index, rowOf, colOf, OPPONENT };
})();

if (typeof module !== "undefined") module.exports = Checkers;
