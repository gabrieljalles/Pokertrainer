/* Minigame "Showdown": app SPA (config/game/stats).
   Depende de RT.storage, RT.cards, RT.handEval e RT.ui já carregados antes
   deste arquivo. */
(function () {
  "use strict";

  var HISTORY_STORAGE_KEY_WINNER = 'rt_showdown_history_winner_v1';
  var HISTORY_STORAGE_KEY_HAND = 'rt_showdown_history_hand_v1';
  var MAX_PLAYERS_STORAGE_KEY = 'rt_showdown_maxplayers_v1';
  var GAME_MODE_STORAGE_KEY = 'rt_showdown_gamemode_v1';
  var REVEAL_DELAY_MS = 3000;

  var Storage = RT.storage;
  var Cards = RT.cards;
  var Eval = RT.handEval;
  var UI = RT.ui;
  var esc = UI.esc;
  var pct = UI.pct;

  var revealTimer = null;
  var tickTimer = null;
  var roundId = 0;

  function loadHistory(mode) {
    var key = mode === 'hand' ? HISTORY_STORAGE_KEY_HAND : HISTORY_STORAGE_KEY_WINNER;
    var raw = Storage.get(key);
    if (!raw) return [];
    try { var arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
  }

  function loadMaxPlayers() {
    var raw = Storage.get(MAX_PLAYERS_STORAGE_KEY);
    var n = parseInt(raw, 10);
    return (n >= 2 && n <= 9) ? n : 5;
  }

  function loadGameMode() {
    var raw = Storage.get(GAME_MODE_STORAGE_KEY);
    return (raw === 'hand') ? 'hand' : 'winner';
  }

  var gameMode = loadGameMode();
  var state = {
    screen: 'config',
    maxPlayers: loadMaxPlayers(),
    gameMode: gameMode,
    session: { total: 0, correct: 0 },
    round: null,
    history: loadHistory(gameMode)
  };

  function recordAttempt(record) {
    state.history.push(record);
    var key = state.gameMode === 'hand' ? HISTORY_STORAGE_KEY_HAND : HISTORY_STORAGE_KEY_WINNER;
    Storage.set(key, JSON.stringify(state.history));
  }

  function randBetween(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  /* ================= Lógica de mão ================= */
  function dealNewHand() {
    clearTimers();
    roundId++;
    var thisRound = roundId;

    var numPlayers = randBetween(Math.min(2, state.maxPlayers), state.maxPlayers);
    var deck = Cards.newShuffledDeck();
    var hands = [];
    for (var p = 0; p < numPlayers; p++) hands.push([deck.pop(), deck.pop()]);
    var board = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];

    var scores = hands.map(function (h) { return Eval.evaluateBest7(h.concat(board)); });
    var best = scores[0];
    for (var i = 1; i < scores.length; i++) if (Eval.compareScore(scores[i], best) > 0) best = scores[i];
    var winners = [];
    for (var j = 0; j < scores.length; j++) if (Eval.compareScore(scores[j], best) === 0) winners.push(j);

    state.round = {
      id: thisRound,
      numPlayers: numPlayers,
      hands: hands,
      board: board,
      scores: scores,
      winners: winners,
      phase: 'flop',
      revealAt: null,
      picked: null,
      selectedCards: [],
      elapsedMs: null
    };
    render();

    revealTimer = setTimeout(function () {
      if (!state.round || state.round.id !== thisRound) return;
      state.round.phase = 'showdown';
      state.round.revealAt = Date.now();
      render();
      startTick();
    }, REVEAL_DELAY_MS);
  }

  function clearTimers() {
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    stopTick();
  }

  function startTick() {
    stopTick();
    tickTimer = setInterval(function () {
      var el = document.getElementById('sd-live-timer');
      if (!el || !state.round || !state.round.revealAt) return;
      el.textContent = ((Date.now() - state.round.revealAt) / 1000).toFixed(1) + 's';
    }, 100);
  }

  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function toggleCardSelection(cardKey) {
    var round = state.round;
    if (!round || round.phase !== 'showdown') return;

    var idx = round.selectedCards.indexOf(cardKey);
    if (idx !== -1) {
      round.selectedCards.splice(idx, 1);
    } else if (round.selectedCards.length < 5) {
      round.selectedCards.push(cardKey);
      if (round.selectedCards.length === 5) {
        finishHandSelection();
      }
    }
    render();
  }

  function finishHandSelection() {
    var round = state.round;
    if (!round || round.selectedCards.length !== 5) return;
    stopTick();
    round.elapsedMs = Date.now() - round.revealAt;
    round.phase = 'result';

    var selectedCards = round.selectedCards.map(function (key) {
      if (key.startsWith('board-')) {
        var cardIndex = parseInt(key.split('-')[1], 10);
        return round.board[cardIndex];
      } else if (key.startsWith('player-')) {
        var parts = key.split('-');
        var playerId = parseInt(parts[1], 10);
        var privateIndex = parseInt(parts[2], 10);
        return round.hands[playerId][privateIndex];
      }
    });

    var selectedScore = Eval.evaluate5(selectedCards);
    var bestWinnerScore = round.scores[round.winners[0]];
    var correct = Eval.compareScore(selectedScore, bestWinnerScore) === 0;

    round.picked = correct;
    state.session.total++;
    if (correct) state.session.correct++;
    recordAttempt({
      ts: Date.now(),
      numPlayers: round.numPlayers,
      correct: correct,
      mode: 'hand',
      elapsedMs: round.elapsedMs
    });
    render();
  }

  function handlePick(index) {
    var round = state.round;
    if (!round || round.phase !== 'showdown') return;
    if (state.gameMode === 'hand') return;
    stopTick();
    round.picked = index;
    round.elapsedMs = Date.now() - round.revealAt;
    round.phase = 'result';
    var correct = round.winners.indexOf(index) !== -1;
    state.session.total++;
    if (correct) state.session.correct++;
    recordAttempt({
      ts: Date.now(),
      numPlayers: round.numPlayers,
      correct: correct,
      tie: round.winners.length > 1,
      mode: 'winner',
      elapsedMs: round.elapsedMs
    });
    render();
  }

  function computeStats(history) {
    var overall = { total: 0, correct: 0, timeSum: 0 };
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      overall.total++;
      if (h.correct) overall.correct++;
      overall.timeSum += h.elapsedMs || 0;
    }
    var avgSeconds = overall.total ? (overall.timeSum / overall.total / 1000) : 0;
    return { overall: overall, avgSeconds: avgSeconds };
  }

  /* ================= Render ================= */
  function renderConfig() {
    var html = '<div class="screen">';
    html += UI.topbar('Showdown', 'go-back');
    html += '<div class="hero">' +
      '<p class="eyebrow">Treino Pós-Flop</p>' +
      '<h1>Showdown</h1>' +
      '<p class="sub">Treino de avaliação de mãos de poker</p>' +
      '</div>';
    html += '<p class="section-label">Tipo de jogo</p>';
    html += '<div class="game-mode-selector">' +
      '<button class="mode-btn ' + (state.gameMode === 'winner' ? 'active' : '') + '" data-action="set-game-mode" data-mode="winner">' +
        '<div class="mode-title">👁️ Quem venceu?</div>' +
        '<div class="mode-desc">Veja o board completo e escolha quem ganhou a mão.</div>' +
      '</button>' +
      '<button class="mode-btn ' + (state.gameMode === 'hand' ? 'active' : '') + '" data-action="set-game-mode" data-mode="hand">' +
        '<div class="mode-title">🎯 Melhor mão</div>' +
        '<div class="mode-desc">Selecione as 5 melhores cartas entre suas 7 cartas.</div>' +
      '</button>' +
      '</div>';
    html += '<p class="section-label">Quantos jogadores (máximo)?</p>';
    html += '<div class="stepper">' +
      '<button class="stepper-btn" data-action="dec-players" ' + (state.maxPlayers <= 2 ? 'disabled' : '') + '>−</button>' +
      '<span class="stepper-value">' + state.maxPlayers + '</span>' +
      '<button class="stepper-btn" data-action="inc-players" ' + (state.maxPlayers >= 9 ? 'disabled' : '') + '>+</button>' +
      '</div>';
    html += '<p class="stepper-hint">Cada mão sorteia aleatoriamente entre 2 e ' + state.maxPlayers + ' jogadores na mesa.</p>';
    html += '<div class="spacer"></div>';
    html += '<button class="btn-primary" data-action="start-session">Iniciar showdown</button>';
    html += '<div class="home-footer"><button class="btn-secondary" data-action="go-stats">📊 Histórico</button></div>';
    html += '</div>';
    return html;
  }

  function renderCommunityRow(round) {
    var cards = round.board;
    var html = '<div class="board-row">';
    var visibleCount = round.phase === 'flop' ? 3 : 5;
    for (var i = 0; i < 5; i++) {
      if (i < visibleCount) html += UI.renderCard(cards[i]);
      else html += '<div class="card back"></div>';
    }
    html += '</div>';
    return html;
  }

  function renderPlayers(round) {
    var html = '<div class="players-grid">';
    for (var i = 0; i < round.numPlayers; i++) {
      var revealed = round.phase !== 'flop';
      var classes = 'player-slot';
      var isWinner = round.winners.indexOf(i) !== -1;
      if (round.phase === 'result') {
        if (isWinner) classes += ' winner';
        else if (round.picked === i) classes += ' picked-wrong';
      }
      html += '<button class="' + classes + '" data-action="pick-winner" data-index="' + i + '" ' + (revealed ? '' : 'disabled') + '>';
      html += '<span class="p-label">Jogador ' + (i + 1) + '</span>';
      html += '<span class="p-cards">';
      if (revealed) html += UI.renderCard(round.hands[i][0]) + UI.renderCard(round.hands[i][1]);
      else html += '<div class="card back"></div><div class="card back"></div>';
      html += '</span>';
      if (round.phase === 'result') {
        html += '<span class="p-hand-name">' + esc(Eval.categoryName(round.scores[i])) + '</span>';
      }
      html += '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderHandSelection(round) {
    var html = '<div class="hand-selection-area">';
    var selected = round.selectedCards.length;
    html += '<p class="selection-counter">Selecionadas: ' + selected + '/5</p>';

    html += '<div class="board-selection">';
    html += '<span class="board-section-title">Board (Comunitárias)</span>';
    html += '<div class="cards-grid-row">';
    for (var b = 0; b < round.board.length; b++) {
      var boardKey = 'board-' + b;
      var isBoardSelected = round.selectedCards.indexOf(boardKey) !== -1;
      html += '<button class="card-btn ' + (isBoardSelected ? 'selected' : '') + '" data-action="toggle-card" data-card-key="' + boardKey + '" ' +
              (round.phase !== 'showdown' ? 'disabled' : '') + '>';
      html += UI.renderCard(round.board[b]);
      html += '</button>';
    }
    html += '</div>';
    html += '</div>';

    html += '<div class="players-selection-grid">';
    for (var p = 0; p < round.numPlayers; p++) {
      var isWinner = round.winners.indexOf(p) !== -1;
      var showWinner = round.phase === 'result' && isWinner;
      var playerClass = showWinner ? 'player-hand winner-hand' : 'player-hand';

      html += '<div class="' + playerClass + '">';
      html += '<span class="player-name">Jogador ' + (p + 1) + (showWinner ? ' (VENCEDOR)' : '') + '</span>';
      html += '<div class="cards-grid-row">';

      for (var i = 0; i < 2; i++) {
        var playerKey = 'player-' + p + '-' + i;
        var isPlayerSelected = round.selectedCards.indexOf(playerKey) !== -1;
        html += '<button class="card-btn private ' + (isPlayerSelected ? 'selected' : '') + '" data-action="toggle-card" data-card-key="' + playerKey + '" ' +
                (round.phase !== 'showdown' ? 'disabled' : '') + '>';
        html += UI.renderCard(round.hands[p][i]);
        html += '</button>';
      }

      html += '</div>';
      html += '</div>';
    }
    html += '</div>';

    html += '</div>';
    return html;
  }

  function renderGame() {
    var round = state.round;
    var html = '<div class="screen">';
    html += '<div class="sd-game-status">' +
      '<span class="tag">' + (state.gameMode === 'hand' ? 'Melhor mão' : 'Quem venceu?') + '</span>' +
      '<span class="tag">' + round.numPlayers + ' jogadores</span>' +
      '<span class="score-badge">' + state.session.correct + '/' + state.session.total + (state.session.total ? ' · ' + pct(state.session.correct, state.session.total) + '%' : '') + '</span>';
    if (round.phase === 'showdown') html += '<span class="sd-timer" id="sd-live-timer">0.0s</span>';
    html += '</div>';

    html += '<div class="board-section"><p class="board-label">' + (round.phase === 'flop' ? 'Flop' : 'Board') + '</p>';
    html += renderCommunityRow(round);
    html += '</div>';

    if (round.phase === 'flop') {
      html += '<p class="waiting-note">Revelando o restante do board e as mãos em instantes…</p>';
    } else if (state.gameMode === 'hand') {
      html += '<p class="section-label">' + (round.phase === 'showdown' ? 'Qual é a melhor mão? Selecione 5 cartas' : 'Resultado') + '</p>';
      html += renderHandSelection(round);
    } else {
      html += '<p class="section-label">' + (round.phase === 'showdown' ? 'Quem venceu?' : 'Resultado') + '</p>';
      html += renderPlayers(round);
    }

    if (round.phase === 'result') {
      if (state.gameMode === 'hand') {
        var correct = round.picked;
        var winnerNames = round.winners.map(function (w) { return 'Jogador ' + (w + 1); }).join(' e ');
        html += '<div class="sd-feedback-panel ' + (correct ? 'correct' : 'wrong') + '">' +
          '<div class="fb-title">' + (correct ? '✅ Correto!' : '❌ Errado') + '</div>' +
          '<div class="fb-detail">' + (round.winners.length > 1 ? 'Melhor(es) mão: ' : 'Melhor mão: ') + '<b>' + esc(winnerNames) + '</b> · <b>' + esc(Eval.categoryName(round.scores[round.winners[0]])) + '</b></div>' +
          '<div class="fb-time">Tempo de resposta: ' + (round.elapsedMs / 1000).toFixed(1) + 's</div>' +
          '</div>';
      } else {
        var correct = round.winners.indexOf(round.picked) !== -1;
        var winnerNames = round.winners.map(function (w) { return 'Jogador ' + (w + 1); }).join(' e ');
        html += '<div class="sd-feedback-panel ' + (correct ? 'correct' : 'wrong') + '">' +
          '<div class="fb-title">' + (correct ? '✅ Correto!' : '❌ Errado') + '</div>' +
          '<div class="fb-detail">' + (round.winners.length > 1 ? 'Mão dividida: ' : 'Vencedor: ') + '<b>' + esc(winnerNames) + '</b> · <b>' + esc(Eval.categoryName(round.scores[round.winners[0]])) + '</b></div>' +
          '<div class="fb-time">Tempo de resposta: ' + (round.elapsedMs / 1000).toFixed(1) + 's</div>' +
          '</div>';
      }
      html += '<button class="btn-primary" data-action="next-hand">Próxima mão →</button>';
    }

    html += '<div class="end-session-link"><button data-action="end-session">Encerrar sessão</button></div>';
    html += '</div>';
    return html;
  }

  function renderStats() {
    var html = '<div class="screen">';
    html += UI.topbar('Histórico · Showdown', 'go-home');
    var modeName = state.gameMode === 'hand' ? 'Melhor mão' : 'Quem venceu?';
    html += '<div class="stat-mode-label">Modo: <strong>' + modeName + '</strong></div>';
    if (state.history.length === 0) {
      html += '<div class="empty-state"><div class="big-icon">🃏</div>Nenhum resultado neste modo ainda.</div></div>';
      return html;
    }
    var stats = computeStats(state.history);
    html += '<div class="stat-hero">' +
      '<div class="big-num">' + pct(stats.overall.correct, stats.overall.total) + '%</div>' +
      '<div class="big-label">' + stats.overall.correct + ' de ' + stats.overall.total + ' acertos · Tempo médio ' + stats.avgSeconds.toFixed(1) + 's</div>' +
      '</div>';
    html += '<button class="danger-link" data-action="clear-history">Limpar histórico</button>';
    html += '</div>';
    return html;
  }

  function render() {
    var app = document.getElementById('app');
    var html;
    switch (state.screen) {
      case 'game': html = renderGame(); break;
      case 'stats': html = renderStats(); break;
      default: html = renderConfig();
    }
    app.innerHTML = html;
  }

  /* ================= Eventos ================= */
  document.getElementById('app').addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.hasAttribute('disabled')) return;
    var action = el.getAttribute('data-action');

    if (action === 'go-home') { clearTimers(); state.screen = 'config'; render(); }
    else if (action === 'go-back') { clearTimers(); window.location.href = 'index.html'; }
    else if (action === 'go-stats') { state.screen = 'stats'; render(); }
    else if (action === 'inc-players') {
      state.maxPlayers = Math.min(9, state.maxPlayers + 1);
      Storage.set(MAX_PLAYERS_STORAGE_KEY, String(state.maxPlayers));
      render();
    }
    else if (action === 'dec-players') {
      state.maxPlayers = Math.max(2, state.maxPlayers - 1);
      Storage.set(MAX_PLAYERS_STORAGE_KEY, String(state.maxPlayers));
      render();
    }
    else if (action === 'set-game-mode') {
      var mode = el.getAttribute('data-mode');
      state.gameMode = mode;
      state.history = loadHistory(mode);
      Storage.set(GAME_MODE_STORAGE_KEY, mode);
      render();
    }
    else if (action === 'start-session') {
      state.session = { total: 0, correct: 0 };
      state.screen = 'game';
      dealNewHand();
    }
    else if (action === 'pick-winner') {
      handlePick(parseInt(el.getAttribute('data-index'), 10));
    }
    else if (action === 'toggle-card') {
      var cardKey = el.getAttribute('data-card-key');
      toggleCardSelection(cardKey);
    }
    else if (action === 'next-hand') {
      dealNewHand();
    }
    else if (action === 'end-session') { clearTimers(); state.screen = 'config'; render(); }
    else if (action === 'clear-history') {
      var modeName = state.gameMode === 'hand' ? 'Melhor mão' : 'Quem venceu?';
      if (confirm('Tem certeza que deseja apagar o histórico de "' + modeName + '"?')) {
        state.history = [];
        var key = state.gameMode === 'hand' ? HISTORY_STORAGE_KEY_HAND : HISTORY_STORAGE_KEY_WINNER;
        Storage.remove(key);
        render();
      }
    }
  });

  render();
})();
