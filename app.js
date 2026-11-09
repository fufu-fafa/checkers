(() => {
  const { newGame, legalMoves, applyMove, isPlayable, index, rowOf, colOf, OPPONENT } = Checkers;

  const STORAGE_KEY = "checkers-game";
  const NAME = { red: "Red", black: "Black" };
  const PIECES_PER_PLAYER = 12;
  const CONFIRM_MS = 3000;

  const el = (id) => document.getElementById(id);
  const squaresEl = el("squares");
  const piecesEl = el("pieces");
  const signEl = el("sign");
  const statusEl = el("status");
  const noteEl = el("note");
  const undoBtn = el("undo");
  const newGameBtn = el("new-game");

  let state = newGame();
  let history = []; // the board at the start of each earlier turn
  let selected = null;
  let confirmTimer = null;
  const squareButtons = new Map(); // board index -> button
  const pieceEls = new Map(); // piece id -> element

  // Piece artwork -------------------------------------------------------

  const CROWN_PATH = "M-23 16 L-28 -15 L-12 -3 L0 -22 L12 -3 L28 -15 L23 16 Z";

  function discBody(mark) {
    return `<circle class="disc-edge" r="50"/>
      <circle class="disc-flute" r="44"/>
      <circle class="disc-face" r="38"/>
      <circle class="disc-ring" r="30"/>
      <circle r="50" fill="url(#disc-sheen)"/>
      ${mark}`;
  }

  function discSvg(color, king) {
    const crown = `<path class="disc-mark" d="${CROWN_PATH}"/>`;
    const art = king
      ? `<g class="disc-under" transform="translate(0 7)">${discBody(crown)}</g>
         <g transform="translate(0 -5)">${discBody(crown)}</g>`
      : discBody("");
    return `<svg class="disc disc-${color}" viewBox="-55 -55 110 110" aria-hidden="true">${art}</svg>`;
  }

  // Setup ---------------------------------------------------------------

  // Turns fractal noise into dark streaks laid over the wood color.
  function grainFilter(id, frequency, seed, contrast, offset) {
    return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="3" seed="${seed}"/>
      <feColorMatrix values="0 0 0 0 0.14  0 0 0 0 0.07  0 0 0 0 0.02  ${contrast} 0 0 0 ${offset}"/>
      <feComposite in2="SourceGraphic" operator="in"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode/></feMerge>
    </filter>`;
  }

  function paintBoard() {
    let light = "";
    let dark = "";
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const square = `<rect x="${col * 100}" y="${row * 100}" width="100" height="100"/>`;
        if (isPlayable(row, col)) dark += square;
        else light += square;
      }
    }
    // Light and dark squares run their grain at right angles, like inlaid wood.
    el("paint").innerHTML = `
      <defs>
        ${grainFilter("grain-light", "0.1 0.006", 4, 0.8, -0.36)}
        ${grainFilter("grain-dark", "0.006 0.12", 11, 1.5, -0.56)}
        <radialGradient id="disc-sheen" cx="38%" cy="30%" r="78%">
          <stop offset="0" stop-color="#fff" stop-opacity="0.3"/>
          <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
          <stop offset="1" stop-color="#000" stop-opacity="0.25"/>
        </radialGradient>
      </defs>
      <g fill="#d8a765" filter="url(#grain-light)">${light}</g>
      <g fill="#7a4a27" filter="url(#grain-dark)">${dark}</g>`;
  }

  function buildSquares() {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (!isPlayable(row, col)) {
          squaresEl.appendChild(document.createElement("div"));
          continue;
        }
        const i = index(row, col);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "square";
        button.addEventListener("click", (event) => onSquare(i, event));
        squaresEl.appendChild(button);
        squareButtons.set(i, button);
      }
    }
  }

  // Input ---------------------------------------------------------------

  function onSquare(i, event) {
    const moves = legalMoves(state);
    const move = selected !== null && moves.find((m) => m.from === selected && m.to === i);

    if (move) {
      play(move);
    } else if (state.chain === null && moves.some((m) => m.from === i)) {
      selected = selected === i ? null : i;
      render();
    }

    // A keyboard press has no pointer position (detail is 0). Keep focus on
    // the board if the button just pressed is no longer available.
    if (event.detail === 0 && squareButtons.get(i).disabled) {
      const next = [...squareButtons.values()].find((b) => !b.disabled);
      if (next) next.focus();
    }
  }

  function play(move) {
    // Undo works per turn, so only the first hop of a turn is recorded.
    if (state.chain === null) history.push(state);
    state = applyMove(state, move);
    selected = state.chain;
    save();
    render();
  }

  undoBtn.addEventListener("click", () => {
    if (!history.length) return;
    state = history.pop();
    selected = null;
    save();
    render();
  });

  newGameBtn.addEventListener("click", () => {
    const inProgress = history.length > 0 && !state.result;
    if (inProgress && confirmTimer === null) {
      newGameBtn.textContent = "Start over?";
      confirmTimer = setTimeout(resetNewGameButton, CONFIRM_MS);
      return;
    }
    resetNewGameButton();
    state = newGame();
    history = [];
    selected = null;
    save();
    render();
  });

  function resetNewGameButton() {
    clearTimeout(confirmTimer);
    confirmTimer = null;
    newGameBtn.textContent = "New game";
  }

  // Rendering -----------------------------------------------------------

  function render() {
    const moves = legalMoves(state);
    renderPieces();
    renderSquares(moves);
    renderSign(moves);
    renderTrays();
    undoBtn.disabled = history.length === 0;
    newGameBtn.classList.toggle("primary", Boolean(state.result));
  }

  function renderPieces() {
    const seen = new Set();

    state.board.forEach((piece, i) => {
      if (!piece) return;
      seen.add(piece.id);

      let node = pieceEls.get(piece.id);
      if (!node) {
        node = document.createElement("div");
        node.className = "piece";
        piecesEl.appendChild(node);
        pieceEls.set(piece.id, node);
      }
      const art = `${piece.color}-${piece.king}`;
      if (node.dataset.art !== art) {
        node.dataset.art = art;
        node.innerHTML = discSvg(piece.color, piece.king);
      }
      node.style.setProperty("--row", rowOf(i));
      node.style.setProperty("--col", colOf(i));
      node.classList.toggle("is-selected", i === selected);
      node.classList.toggle("hop", Boolean(state.result && state.result.winner === piece.color));
    });

    for (const [id, node] of pieceEls) {
      if (seen.has(id)) continue;
      pieceEls.delete(id);
      node.classList.add("gone");
      setTimeout(() => node.remove(), 200);
    }
  }

  function describeSquare(i, role) {
    const piece = state.board[i];
    const where = `row ${rowOf(i) + 1}, column ${colOf(i) + 1}`;
    if (!piece) return `Empty square, ${where}${role === "target" ? ", move here" : ""}`;
    const kind = piece.king ? "king" : "piece";
    const suffix = role === "selected" ? ", selected" : role === "movable" ? ", can move" : "";
    return `${NAME[piece.color]} ${kind}, ${where}${suffix}`;
  }

  function renderSquares(moves) {
    const movable = new Set(moves.map((m) => m.from));
    const targets = new Set(moves.filter((m) => m.from === selected).map((m) => m.to));
    const forced = moves.length > 0 && moves[0].over !== null;

    for (const [i, button] of squareButtons) {
      const isSelected = i === selected;
      const isTarget = targets.has(i);
      const isMovable = movable.has(i);

      button.classList.toggle("selected", isSelected);
      button.classList.toggle("target", isTarget);
      button.classList.toggle("movable", isMovable);
      button.classList.toggle("forced", isMovable && forced);
      button.disabled = !isMovable && !isTarget;

      const role = isSelected ? "selected" : isTarget ? "target" : isMovable ? "movable" : "";
      button.setAttribute("aria-label", describeSquare(i, role));
    }
  }

  function renderSign(moves) {
    let main;
    let note;
    let color = state.turn;

    if (state.result) {
      const { winner, reason } = state.result;
      if (winner) {
        const loser = NAME[OPPONENT[winner]];
        main = `${NAME[winner]} wins`;
        note = reason === "captured" ? `${loser} has no pieces left.` : `${loser} has no legal move.`;
        color = winner;
      } else {
        main = "It's a draw";
        note = "40 turns each passed with no jump and no regular piece moved.";
        color = "draw";
      }
    } else {
      main = `${NAME[state.turn]}'s turn`;
      if (state.chain !== null) note = "Keep jumping with the same piece.";
      else if (moves[0].over !== null) note = "You have to jump. Pick a ringed piece.";
      else if (selected !== null) note = "Now tap a white dot.";
      else note = "Tap a piece to move it.";
    }

    signEl.dataset.color = color;
    if (statusEl.textContent !== main) statusEl.textContent = main;
    noteEl.textContent = note;
  }

  function renderTrays() {
    for (const color of ["red", "black"]) {
      const taken = OPPONENT[color];
      const remaining = state.board.filter((p) => p && p.color === taken).length;
      const count = PIECES_PER_PLAYER - remaining;
      el(`${color}-label`).textContent = `${NAME[color]} took ${count}`;
      el(`${color}-tray`).innerHTML = discSvg(taken, false).repeat(count);
    }
  }

  // Saved game ----------------------------------------------------------

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, history }));
    } catch {
      // Storage can be blocked. The game still works, it just won't survive a reload.
    }
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.state.board.length === 64 && Array.isArray(saved.history)) {
        state = saved.state;
        history = saved.history;
        selected = state.chain;
      }
    } catch {
      // Missing or unreadable save: start with a fresh game.
    }
  }

  paintBoard();
  buildSquares();
  load();
  render();
})();
