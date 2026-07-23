/* Minigame "Board Classification": app SPA (config/game/stats).
   Treina reconhecimento visual rápido de texturas de boards pós-flop.
   Depende de RT.storage, RT.cards e RT.ui já carregados antes deste arquivo. */
(function () {
  "use strict";

  var HISTORY_STORAGE_KEY_FAST = 'rt_boards_history_fast_v1';
  var HISTORY_STORAGE_KEY_SLOW = 'rt_boards_history_slow_v1';
  var MODE_STORAGE_KEY = 'rt_boards_mode_v1';
  var FAST_MODE_REVEAL_DELAY_MS = 2000;

  var Storage = RT.storage;
  var Cards = RT.cards;
  var UI = RT.ui;
  var esc = UI.esc;
  var pct = UI.pct;

  var revealTimer = null;
  var tickTimer = null;
  var roundId = 0;

  /* ================= Board Classification Logic ================= */
  var BoardEval = (function () {
    var VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

    function classifyConnectivity(cards) {
      var values = cards.map(function (c) { return VALUES[c.rank]; }).sort(function (a, b) { return b - a; });
      var gaps = [];
      for (var i = 0; i < values.length - 1; i++) {
        gaps.push(values[i] - values[i + 1]);
      }
      var minGap = Math.min.apply(null, gaps);

      if (minGap <= 1) {
        var allSmall = gaps.every(function (g) { return g <= 1; });
        if (allSmall) return 'high';
        return 'medium';
      }
      if (minGap === 2) return 'medium';
      return 'low';
    }

    function classifyRanking(cards) {
      var values = cards.map(function (c) { return VALUES[c.rank]; }).sort(function (a, b) { return b - a; });
      var avgValue = values.reduce(function (a, b) { return a + b; }) / values.length;
      if (avgValue >= 11) return 'high';
      if (avgValue >= 7) return 'medium';
      return 'low';
    }

    function classifySuits(cards) {
      var suitCounts = {};
      cards.forEach(function (c) { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
      var counts = Object.keys(suitCounts).map(function (k) { return suitCounts[k]; }).sort(function (a, b) { return b - a; });

      if (counts[0] === 3) return 'monotone';
      if (counts[0] === 2) return 'duotone';
      return 'rainbow';
    }

    function classifyFlushConcern(cards) {
      var suitCounts = {};
      cards.forEach(function (c) { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
      var maxCount = Math.max.apply(null, Object.keys(suitCounts).map(function (k) { return suitCounts[k]; }));

      if (maxCount === 3) return 'high';
      if (maxCount === 2) return 'moderate';
      return 'low';
    }

    function classifyType(connectivity, ranking) {
      if (connectivity === 'low') return 'dry';
      if (connectivity === 'medium') return 'middling';
      return 'wet';
    }

    function evaluateBoard(cards) {
      return {
        connectivity: classifyConnectivity(cards),
        ranking: classifyRanking(cards),
        suits: classifySuits(cards),
        type: classifyType(classifyConnectivity(cards), classifyRanking(cards)),
        flushConcern: classifyFlushConcern(cards)
      };
    }

    return { evaluateBoard: evaluateBoard };
  })();

  function loadHistory(mode) {
    var key = mode === 'slow' ? HISTORY_STORAGE_KEY_SLOW : HISTORY_STORAGE_KEY_FAST;
    var raw = Storage.get(key);
    if (!raw) return [];
    try { var arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
  }

  function loadGameMode() {
    var raw = Storage.get(MODE_STORAGE_KEY);
    return (raw === 'slow') ? 'slow' : 'fast';
  }

  var gameMode = loadGameMode();
  var state = {
    screen: 'config',
    gameMode: gameMode,
    session: { total: 0, correct: 0 },
    round: null,
    history: loadHistory(gameMode)
  };

  function recordAttempt(record) {
    state.history.push(record);
    var key = state.gameMode === 'slow' ? HISTORY_STORAGE_KEY_SLOW : HISTORY_STORAGE_KEY_FAST;
    Storage.set(key, JSON.stringify(state.history));
  }

  function clearTimers() {
    if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    stopTick();
  }

  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function startTick() {
    stopTick();
    tickTimer = setInterval(function () {
      var el = document.getElementById('bd-live-timer');
      if (!el || !state.round || !state.round.startedAt) return;
      el.textContent = ((Date.now() - state.round.startedAt) / 1000).toFixed(1) + 's';
    }, 100);
  }

  function dealNewBoard() {
    clearTimers();
    roundId++;
    var thisRound = roundId;

    var deck = Cards.newShuffledDeck();
    var board = [deck.pop(), deck.pop(), deck.pop()];
    var evaluation = BoardEval.evaluateBoard(board);

    state.round = {
      id: thisRound,
      board: board,
      evaluation: evaluation,
      userClassification: null,
      startedAt: Date.now(),
      elapsedMs: null,
      phase: 'classifying'
    };
    render();
    startTick();
  }

  function submitClassification(connectivity, ranking, suits) {
    if (!state.round || state.round.phase !== 'classifying') return;
    stopTick();
    state.round.elapsedMs = Date.now() - state.round.startedAt;
    state.round.phase = 'result';

    var correct = (connectivity === state.round.evaluation.connectivity &&
                   ranking === state.round.evaluation.ranking &&
                   suits === state.round.evaluation.suits);

    state.round.userClassification = { connectivity: connectivity, ranking: ranking, suits: suits };
    state.session.total++;
    if (correct) state.session.correct++;

    recordAttempt({
      ts: Date.now(),
      correct: correct,
      mode: state.gameMode,
      elapsedMs: state.round.elapsedMs,
      board: state.round.board.map(function (c) { return c.rank + c.suit; }).join('-')
    });

    if (state.gameMode === 'fast') {
      var currentRoundId = state.round.id;
      revealTimer = setTimeout(function () {
        if (!state.round || state.round.id !== currentRoundId) return;
        dealNewBoard();
      }, FAST_MODE_REVEAL_DELAY_MS);
    }

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

  function renderConfig() {
    var html = '<div class="screen">';
    html += '<div class="hero">' +
      '<p class="eyebrow">Reconhecimento de Texturas</p>' +
      '<h1>Classificação de Boards</h1>' +
      '<p class="sub">Treina identificação visual rápida de boards pós-flop</p>' +
      '</div>';
    html += '<p class="section-label">Tipo de treino</p>';
    html += '<div class="game-mode-selector">' +
      '<button class="mode-btn ' + (state.gameMode === 'fast' ? 'active' : '') + '" data-action="set-game-mode" data-mode="fast">' +
        '<div class="mode-title">⚡ Treino Relâmpago</div>' +
        '<div class="mode-desc">Classifique rapidamente boards aleatórios. 3-5 segundos por board.</div>' +
      '</button>' +
      '<button class="mode-btn ' + (state.gameMode === 'slow' ? 'active' : '') + '" data-action="set-game-mode" data-mode="slow">' +
        '<div class="mode-title">📚 Estudo Detalhado</div>' +
        '<div class="mode-desc">Aprenda classificando com análise completa. 1-2 minutos por board.</div>' +
      '</button>' +
      '</div>';
    html += '<div class="spacer"></div>';
    html += '<button class="btn-primary" data-action="start-session">Iniciar treino</button>';
    html += '<div class="home-footer">' +
      '<button class="btn-secondary" data-action="go-stats">📊 Histórico</button>' +
      '<button class="btn-secondary" data-action="go-home">← Menu</button>' +
      '</div>';
    html += '</div>';
    return html;
  }

  function renderClassifyButtons() {
    var round = state.round;
    var html = '<div class="classify-section">';

    html += '<div class="classify-axis">' +
      '<label>Conectividade</label>' +
      '<div class="btn-group">' +
        '<button class="axis-btn ' + (round.userClassification && round.userClassification.connectivity === 'low' ? 'selected' : '') + '" data-action="select-connectivity" data-value="low" ' + (round.phase !== 'classifying' ? 'disabled' : '') + '>Baixa</button>' +
        '<button class="axis-btn ' + (round.userClassification && round.userClassification.connectivity === 'medium' ? 'selected' : '') + '" data-action="select-connectivity" data-value="medium" ' + (round.phase !== 'classifying' ? 'disabled' : '') + '>Média</button>' +
        '<button class="axis-btn ' + (round.userClassification && round.userClassification.connectivity === 'high' ? 'selected' : '') + '" data-action="select-connectivity" data-value="high" ' + (round.phase !== 'classifying' ? 'disabled' : '') + '>Alta</button>' +
      '</div>' +
    '</div>';

    html += '<div class="classify-axis">' +
      '<label>Altura</label>' +
      '<div class="btn-group">' +
        '<button class="axis-btn ' + (round.userClassification && round.userClassification.ranking === 'low' ? 'selected' : '') + '" data-action="select-ranking" data-value="low" ' + (round.phase !== 'classifying' ? 'disabled' : '') + '>Baixa</button>' +
        '<button class="axis-btn ' + (round.userClassification && round.userClassification.ranking === 'medium' ? 'selected' : '') + '" data-action="select-ranking" data-value="medium" ' + (round.phase !== 'classifying' ? 'disabled' : '') + '>Média</button>' +
        '<button class="axis-btn ' + (round.userClassification && round.userClassification.ranking === 'high' ? 'selected' : '') + '" data-action="select-ranking" data-value="high" ' + (round.phase !== 'classifying' ? 'disabled' : '') + '>Alta</button>' +
      '</div>' +
    '</div>';

    html += '<div class="classify-axis">' +
      '<label>Naipes</label>' +
      '<div class="btn-group">' +
        '<button class="axis-btn ' + (round.userClassification && round.userClassification.suits === 'rainbow' ? 'selected' : '') + '" data-action="select-suits" data-value="rainbow" ' + (round.phase !== 'classifying' ? 'disabled' : '') + '>Rainbow</button>' +
        '<button class="axis-btn ' + (round.userClassification && round.userClassification.suits === 'duotone' ? 'selected' : '') + '" data-action="select-suits" data-value="duotone" ' + (round.phase !== 'classifying' ? 'disabled' : '') + '>Duo-tone</button>' +
        '<button class="axis-btn ' + (round.userClassification && round.userClassification.suits === 'monotone' ? 'selected' : '') + '" data-action="select-suits" data-value="monotone" ' + (round.phase !== 'classifying' ? 'disabled' : '') + '>Monotone</button>' +
      '</div>' +
    '</div>';

    if (round.phase === 'classifying' && round.userClassification) {
      html += '<button class="btn-primary" data-action="submit-classification">Confirmar classificação</button>';
    }

    html += '</div>';
    return html;
  }

  function getTypeEmoji(type) {
    return type === 'dry' ? '🏜️' : type === 'wet' ? '💧' : '⚖️';
  }

  function renderDetailedAnalysis(round) {
    var evaluation = round.evaluation;
    var typeEmoji = getTypeEmoji(evaluation.type);
    var typeName = evaluation.type === 'dry' ? 'SECO' : evaluation.type === 'wet' ? 'MOLHADO' : 'MEIO TERMO';
    var flushLabel = evaluation.flushConcern === 'high' ? 'Alto' : evaluation.flushConcern === 'moderate' ? 'Moderado' : 'Mínimo';

    var html = '<div class="analysis-panel">';
    html += '<div class="analysis-section">';
    html += '<h3>Tipo de Board</h3>';
    html += '<p class="type-display">' + typeEmoji + ' <strong>' + typeName + '</strong></p>';
    html += '</div>';

    html += '<div class="analysis-section">';
    html += '<h3>Por quê?</h3>';
    if (evaluation.type === 'dry') {
      html += '<p>Conectividade baixa = poucas possibilidades de sequência. Difícil flopar draws fortes.</p>';
    } else if (evaluation.type === 'wet') {
      html += '<p>Conectividade alta = muitas sequências e flush draws possíveis. Textura dinâmica.</p>';
    } else {
      html += '<p>Conectividade média = equilíbrio entre conectividade e resistência. Boards versáteis.</p>';
    }
    html += '</div>';

    html += '<div class="analysis-section">';
    html += '<h3>Como Jogar</h3>';
    html += '<div class="strategy-box">';
    html += '<strong>📍 EM POSIÇÃO (BTN/CO):</strong>';
    if (evaluation.type === 'dry') {
      html += '<p>C-bet frequente (70%+). Quando flopam pares você tem vantagem de posição. Stack profundo: continue agressivo. Stack raso: considere check em conexões perigosas.</p>';
    } else if (evaluation.type === 'wet') {
      html += '<p>C-bet seletivo (40-50%). Muitos draws viáveis, cuidado com reações fortes. Stack profundo: use tamanhos menores e explore posição no turn. Stack raso: seja agressivo se c-bet.</p>';
    } else {
      html += '<p>C-bet moderado (60%). Adapte baseado em V ou BB. Stack profundo: mantenha flexibilidade. Stack raso: decisões mais binárias.</p>';
    }
    html += '</div>';

    html += '<div class="strategy-box">';
    html += '<strong>📍 FORA DE POSIÇÃO (SB/BB):</strong>';
    if (evaluation.type === 'dry') {
      html += '<p>Defenda amplo mas jogue conservador no flop. BB tem vantagem no showdown. Prefira check/call com pares médios.</p>';
    } else if (evaluation.type === 'wet') {
      html += '<p>Defenda tight. Quando tiver parte do board, atue agressivo com draws fortes. CC fraco é custoso com tantas outs inimigas.</p>';
    } else {
      html += '<p>Defenda seletivo. Com par conceituado, jogue agressivo. Com air, prefira check/fold ou bluff-raise situacional.</p>';
    }
    html += '</div>';

    html += '<div class="concern-box">';
    html += '<strong>⚠️ Flush Concern:</strong> ' + flushLabel + '';
    html += '</div>';
    html += '</div>';

    return html;
  }

  function renderGame() {
    var round = state.round;
    var html = '<div class="screen">';
    html += '<div class="bd-game-status">' +
      '<span class="tag">' + (state.gameMode === 'fast' ? 'Treino Relâmpago' : 'Estudo Detalhado') + '</span>' +
      '<span class="score-badge">' + state.session.correct + '/' + state.session.total + (state.session.total ? ' · ' + pct(state.session.correct, state.session.total) + '%' : '') + '</span>';
    if (round.phase === 'classifying') html += '<span class="bd-timer" id="bd-live-timer">0.0s</span>';
    html += '</div>';

    html += '<div class="board-display-section">';
    html += '<div class="board-cards">';
    for (var i = 0; i < round.board.length; i++) {
      html += UI.renderCard(round.board[i]);
    }
    html += '</div>';
    html += '</div>';

    html += '<p class="section-label">' + (round.phase === 'classifying' ? 'Classifique o board' : 'Resultado') + '</p>';

    if (round.phase === 'classifying') {
      html += renderClassifyButtons();
    } else {
      var correct = (round.userClassification.connectivity === round.evaluation.connectivity &&
                     round.userClassification.ranking === round.evaluation.ranking &&
                     round.userClassification.suits === round.evaluation.suits);

      html += '<div class="bd-feedback-panel ' + (correct ? 'correct' : 'wrong') + '">' +
        '<div class="fb-title">' + (correct ? '✅ Correto!' : '❌ Errado') + '</div>';

      if (!correct) {
        html += '<div class="fb-detail">Sua resposta: ' +
          round.userClassification.connectivity.charAt(0).toUpperCase() + round.userClassification.connectivity.slice(1) + ' · ' +
          round.userClassification.ranking.charAt(0).toUpperCase() + round.userClassification.ranking.slice(1) + ' · ' +
          round.userClassification.suits.charAt(0).toUpperCase() + round.userClassification.suits.slice(1) +
          '</div>' +
          '<div class="fb-detail">Resposta correta: ' +
          round.evaluation.connectivity.charAt(0).toUpperCase() + round.evaluation.connectivity.slice(1) + ' · ' +
          round.evaluation.ranking.charAt(0).toUpperCase() + round.evaluation.ranking.slice(1) + ' · ' +
          round.evaluation.suits.charAt(0).toUpperCase() + round.evaluation.suits.slice(1) +
          '</div>';
      }

      html += '<div class="fb-time">Tempo: ' + (round.elapsedMs / 1000).toFixed(1) + 's</div>' +
        '</div>';

      if (state.gameMode === 'slow') {
        html += renderDetailedAnalysis(round);
      }

      if (state.gameMode === 'fast') {
        html += '<p class="auto-next-note">Próximo board em instantes…</p>';
      } else {
        html += '<button class="btn-primary" data-action="next-board">Próximo board →</button>';
      }
    }

    html += '<div class="end-session-link"><button data-action="end-session">Encerrar treino</button></div>';
    html += '</div>';
    return html;
  }

  function renderStats() {
    var html = '<div class="screen">';
    html += '<div class="hero">' +
      '<p class="eyebrow">Histórico de Treino</p>' +
      '<h1>Board Classification</h1>' +
      '</div>';
    var modeName = state.gameMode === 'fast' ? 'Treino Relâmpago' : 'Estudo Detalhado';
    html += '<div class="stat-mode-label">Modo: <strong>' + modeName + '</strong></div>';
    if (state.history.length === 0) {
      html += '<div class="empty-state"><div class="big-icon">📊</div>Nenhum resultado neste modo ainda.</div>';
      html += '</div>';
      return html;
    }
    var stats = computeStats(state.history);
    html += '<div class="stat-hero">' +
      '<div class="big-num">' + pct(stats.overall.correct, stats.overall.total) + '%</div>' +
      '<div class="big-label">' + stats.overall.correct + ' de ' + stats.overall.total + ' acertos · Tempo médio ' + stats.avgSeconds.toFixed(1) + 's</div>' +
      '</div>';
    html += '<button class="danger-link" data-action="clear-history">Limpar histórico</button>';
    html += '<div class="home-footer"><button class="btn-secondary" data-action="go-home">← Voltar ao Menu</button></div>';
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

  /* ================= Events ================= */
  document.getElementById('app').addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.hasAttribute('disabled')) return;
    var action = el.getAttribute('data-action');

    if (action === 'go-home') { clearTimers(); window.location.href = 'index.html'; }
    else if (action === 'go-back') { clearTimers(); window.location.href = 'index.html'; }
    else if (action === 'go-stats') { state.screen = 'stats'; render(); }
    else if (action === 'set-game-mode') {
      var mode = el.getAttribute('data-mode');
      state.gameMode = mode;
      state.history = loadHistory(mode);
      Storage.set(MODE_STORAGE_KEY, mode);
      render();
    }
    else if (action === 'start-session') {
      state.session = { total: 0, correct: 0 };
      state.screen = 'game';
      dealNewBoard();
    }
    else if (action === 'select-connectivity') {
      if (!state.round) return;
      if (!state.round.userClassification) state.round.userClassification = {};
      state.round.userClassification.connectivity = el.getAttribute('data-value');
      render();
    }
    else if (action === 'select-ranking') {
      if (!state.round) return;
      if (!state.round.userClassification) state.round.userClassification = {};
      state.round.userClassification.ranking = el.getAttribute('data-value');
      render();
    }
    else if (action === 'select-suits') {
      if (!state.round) return;
      if (!state.round.userClassification) state.round.userClassification = {};
      state.round.userClassification.suits = el.getAttribute('data-value');
      render();
    }
    else if (action === 'submit-classification') {
      if (!state.round || !state.round.userClassification) return;
      submitClassification(state.round.userClassification.connectivity, state.round.userClassification.ranking, state.round.userClassification.suits);
    }
    else if (action === 'next-board') {
      dealNewBoard();
    }
    else if (action === 'end-session') { clearTimers(); state.screen = 'config'; render(); }
    else if (action === 'clear-history') {
      var modeName = state.gameMode === 'fast' ? 'Treino Relâmpago' : 'Estudo Detalhado';
      if (confirm('Tem certeza que deseja apagar o histórico de "' + modeName + '"?')) {
        state.history = [];
        var key = state.gameMode === 'fast' ? HISTORY_STORAGE_KEY_FAST : HISTORY_STORAGE_KEY_SLOW;
        Storage.remove(key);
        render();
      }
    }
  });

  render();
})();
