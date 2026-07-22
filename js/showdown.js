/* Minigame "Showdown": app SPA (config/game/stats).
   Depende de RT.storage, RT.cards, RT.handEval e RT.ui já carregados antes
   deste arquivo. */
(function () {
  "use strict";

  var HISTORY_STORAGE_KEY = 'rt_showdown_history_v1';
  var MAX_PLAYERS_STORAGE_KEY = 'rt_showdown_maxplayers_v1';
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

  function loadHistory() {
    var raw = Storage.get(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    try { var arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
  }

  function loadMaxPlayers() {
    var raw = Storage.get(MAX_PLAYERS_STORAGE_KEY);
    var n = parseInt(raw, 10);
    return (n >= 2 && n <= 9) ? n : 5;
  }

  var state = {
    screen: 'config',
    maxPlayers: loadMaxPlayers(),
    session: { total: 0, correct: 0 },
    round: null,
    history: loadHistory()
  };

  function recordAttempt(record) {
    state.history.push(record);
    Storage.set(HISTORY_STORAGE_KEY, JSON.stringify(state.history));
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

  function handlePick(index) {
    var round = state.round;
    if (!round || round.phase !== 'showdown') return;
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
    html += '<div class="hero">' +
      '<p class="eyebrow">Treino Pós-Flop</p>' +
      '<h1>Showdown</h1>' +
      '<p class="sub">Veja o flop, depois o board e as mãos completas: quem venceu?</p>' +
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

  function renderGame() {
    var round = state.round;
    var html = '<div class="screen">';
    html += '<div class="sd-game-status">' +
      '<span class="tag">' + round.numPlayers + ' jogadores</span>' +
      '<span class="score-badge">' + state.session.correct + '/' + state.session.total + (state.session.total ? ' · ' + pct(state.session.correct, state.session.total) + '%' : '') + '</span>';
    if (round.phase === 'showdown') html += '<span class="sd-timer" id="sd-live-timer">0.0s</span>';
    html += '</div>';

    html += '<div class="board-section"><p class="board-label">' + (round.phase === 'flop' ? 'Flop' : 'Board') + '</p>';
    html += renderCommunityRow(round);
    html += '</div>';

    if (round.phase === 'flop') {
      html += '<p class="waiting-note">Revelando o restante do board e as mãos em instantes…</p>';
    } else {
      html += '<p class="section-label">' + (round.phase === 'showdown' ? 'Quem venceu?' : 'Resultado') + '</p>';
    }

    html += renderPlayers(round);

    if (round.phase === 'result') {
      var correct = round.winners.indexOf(round.picked) !== -1;
      var winnerNames = round.winners.map(function (w) { return 'Jogador ' + (w + 1); }).join(' e ');
      html += '<div class="sd-feedback-panel ' + (correct ? 'correct' : 'wrong') + '">' +
        '<div class="fb-title">' + (correct ? '✅ Correto!' : '❌ Errado') + '</div>' +
        '<div class="fb-detail">' + (round.winners.length > 1 ? 'Mão dividida: ' : 'Vencedor: ') + '<b>' + esc(winnerNames) + '</b> · <b>' + esc(Eval.categoryName(round.scores[round.winners[0]])) + '</b></div>' +
        '<div class="fb-time">Tempo de resposta: ' + (round.elapsedMs / 1000).toFixed(1) + 's</div>' +
        '</div>';
      html += '<button class="btn-primary" data-action="next-hand">Próxima mão →</button>';
    }

    html += '<div class="end-session-link"><button data-action="end-session">Encerrar sessão</button></div>';
    html += '</div>';
    return html;
  }

  function renderStats() {
    var html = '<div class="screen">';
    html += UI.topbar('Histórico · Showdown', 'go-home');
    if (state.history.length === 0) {
      html += '<div class="empty-state"><div class="big-icon">🃏</div>Você ainda não jogou nenhum showdown.</div></div>';
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
    else if (action === 'start-session') {
      state.session = { total: 0, correct: 0 };
      state.screen = 'game';
      dealNewHand();
    }
    else if (action === 'pick-winner') {
      handlePick(parseInt(el.getAttribute('data-index'), 10));
    }
    else if (action === 'next-hand') {
      dealNewHand();
    }
    else if (action === 'end-session') { clearTimers(); state.screen = 'config'; render(); }
    else if (action === 'clear-history') {
      if (confirm('Tem certeza que deseja apagar todo o histórico do Showdown?')) {
        state.history = [];
        Storage.remove(HISTORY_STORAGE_KEY);
        render();
      }
    }
  });

  render();
})();
