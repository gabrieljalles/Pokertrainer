/* Minigame "Open Raise": app SPA (home/config/game/stats/import).
   Depende de RT.storage, RT.cards, RT.ranges, RT.ui e window.RT_DEFAULT_RANGES
   já carregados antes deste arquivo. */
(function () {
  "use strict";

  var HISTORY_STORAGE_KEY = 'rt_history_v1';
  var Storage = RT.storage;
  var Cards = RT.cards;
  var Ranges = RT.ranges;
  var UI = RT.ui;
  var Table = RT.pokerTable;

  function loadHistory() {
    var raw = Storage.get(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    try { var arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
  }

  function unionPositions(blinds) {
    var seen = {}, out = [];
    for (var i = 0; i < blinds.length; i++) {
      var keys = Object.keys(blinds[i].posicoes);
      for (var j = 0; j < keys.length; j++) {
        if (!seen[keys[j]]) { seen[keys[j]] = true; out.push(keys[j]); }
      }
    }
    return out;
  }

  function selectedBlinds() {
    return state.selectedBlindIds.map(function (id) { return Ranges.findBlind(state.rangesData, id); }).filter(Boolean);
  }

  /* ================= Estado ================= */
  var state = {
    screen: 'config',
    rangesData: Ranges.loadRangesData(window.RT_DEFAULT_RANGES),
    selectedTipo: null,
    selectedBlindIds: [],
    selectedPositions: [],
    session: { total: 0, correct: 0 },
    currentRound: null,
    lastResult: null,
    history: loadHistory(),
    importMessage: null
  };

  function recordAttempt(record) {
    state.history.push(record);
    Storage.set(HISTORY_STORAGE_KEY, JSON.stringify(state.history));
  }

  function dealNewHand() {
    var blinds = selectedBlinds();
    var candidates = [];
    for (var i = 0; i < blinds.length; i++) {
      for (var j = 0; j < state.selectedPositions.length; j++) {
        var pos = state.selectedPositions[j];
        if (blinds[i].posicoes[pos]) candidates.push({ blindId: blinds[i].id, blindNome: blinds[i].nome, position: pos });
      }
    }
    var choice = candidates[Math.floor(Math.random() * candidates.length)];
    var pair = Cards.dealTwoCards();
    var handClass = Cards.getHandClass(pair[0], pair[1]);
    var correctAnswer = Ranges.isInRange(state.rangesData, choice.blindId, choice.position, handClass) ? 'abre' : 'nao_abre';
    state.currentRound = {
      blindId: choice.blindId, blindNome: choice.blindNome, position: choice.position,
      c1: pair[0], c2: pair[1], handClass: handClass, correctAnswer: correctAnswer
    };
    state.lastResult = null;
  }

  function handleAnswer(userAnswer) {
    var round = state.currentRound;
    if (!round) return;
    var correct = userAnswer === round.correctAnswer;
    state.session.total++;
    if (correct) state.session.correct++;
    recordAttempt({
      ts: Date.now(),
      blindId: round.blindId,
      blindNome: round.blindNome,
      position: round.position,
      handClass: round.handClass,
      userAnswer: userAnswer,
      correctAnswer: round.correctAnswer,
      correct: correct
    });
    state.lastResult = { correct: correct, correctAnswer: round.correctAnswer, handClass: round.handClass, position: round.position };
    render();
  }

  function computeStats(history) {
    var overall = { total: 0, correct: 0 };
    var byPosition = {}, byBlind = {}, byBlindPosition = {};
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      overall.total++; if (h.correct) overall.correct++;
      byPosition[h.position] = byPosition[h.position] || { total: 0, correct: 0 };
      byPosition[h.position].total++; if (h.correct) byPosition[h.position].correct++;
      byBlind[h.blindNome] = byBlind[h.blindNome] || { total: 0, correct: 0 };
      byBlind[h.blindNome].total++; if (h.correct) byBlind[h.blindNome].correct++;
      var key = h.blindNome + ' · ' + h.position;
      byBlindPosition[key] = byBlindPosition[key] || { total: 0, correct: 0 };
      byBlindPosition[key].total++; if (h.correct) byBlindPosition[key].correct++;
    }
    return { overall: overall, byPosition: byPosition, byBlind: byBlind, byBlindPosition: byBlindPosition };
  }

  /* ================= Render helpers ================= */
  var esc = UI.esc;
  var pct = UI.pct;

  /* ---------- Home ---------- */
  function renderHome() {
    var usingCustom = Ranges.isUsingCustomRanges();
    return '<div class="screen">' +
      '<div class="hero">' +
        '<p class="eyebrow">Treino Pré-Flop</p>' +
        '<h1>Range Trainer</h1>' +
        '<p class="sub">Escolha um minigame para começar</p>' +
      '</div>' +
      '<div class="minigame-list">' +
        '<button class="minigame-card" data-action="go-config">' +
          '<div class="chip">OR</div>' +
          '<div class="minigame-info"><h3>Open Raise</h3><p>Duas cartas na mão: você abre ou não abre nessa posição?</p></div>' +
          '<span class="arrow">→</span>' +
        '</button>' +
        '<a class="minigame-card" href="treino_showdown.html">' +
          '<div class="chip">SD</div>' +
          '<div class="minigame-info"><h3>Showdown</h3><p>Flop, depois o board completo e as mãos: quem venceu?</p></div>' +
          '<span class="arrow">→</span>' +
        '</a>' +
        '<div class="minigame-card disabled">' +
          '<div class="chip">3B</div>' +
          '<div class="minigame-info"><h3>3-Bet</h3><p>Em breve</p></div>' +
        '</div>' +
      '</div>' +
      '<div class="home-footer">' +
        '<button class="btn-secondary" data-action="go-stats">📊 Histórico</button>' +
        '<button class="btn-secondary" data-action="go-import">⚙️ Ranges</button>' +
      '</div>' +
      '<div class="range-status">Range ativo: <strong>' + (usingCustom ? 'Personalizado (importado)' : 'Padrão (embutido)') + '</strong></div>' +
    '</div>';
  }

  /* ---------- Config ---------- */
  function renderConfig() {
    var html = '<div class="screen">';

    var tipos = Ranges.listTipos(state.rangesData);
    html += '<p class="section-label">Você estuda Cash ou Torneio?</p><div class="option-list">';
    for (var t = 0; t < tipos.length; t++) {
      var tipo = tipos[t];
      var tsel = state.selectedTipo === tipo;
      html += '<label class="option-row' + (tsel ? ' selected' : '') + '">' +
        '<input type="radio" name="tipo" value="' + esc(tipo) + '" data-action="select-tipo" ' + (tsel ? 'checked' : '') + '>' +
        '<span class="radio-dot"></span>' +
        '<span class="option-text"><div class="t1">' + esc(Ranges.tipoLabel(tipo)) + '</div></span>' +
        '</label>';
    }
    html += '</div>';

    if (state.selectedTipo) {
      var blinds = Ranges.blindsByTipo(state.rangesData, state.selectedTipo);
      html += '<p class="section-label">Níveis de blind <span style="text-transform:none;letter-spacing:0">(marque mais de um para misturar)</span></p><div class="option-list">';
      for (var i = 0; i < blinds.length; i++) {
        var b = blinds[i];
        var sel = state.selectedBlindIds.indexOf(b.id) !== -1;
        html += '<label class="option-row' + (sel ? ' selected' : '') + '">' +
          '<input type="checkbox" value="' + esc(b.id) + '" data-action="toggle-blind" ' + (sel ? 'checked' : '') + '>' +
          '<span class="check-box"></span>' +
          '<span class="option-text"><div class="t1">' + esc(b.nome) + '</div>' +
          (b.descricao ? '<div class="t2">' + esc(b.descricao) + '</div>' : '') + '</span>' +
          '</label>';
      }
      html += '</div>';
    }

    if (state.selectedBlindIds.length > 0) {
      var positions = unionPositions(selectedBlinds());
      html += '<p class="section-label">Posições a treinar</p>';
      html += '<div class="select-toggle-row"><button class="link-btn" data-action="toggle-all-positions">' +
        (state.selectedPositions.length === positions.length ? 'Limpar seleção' : 'Selecionar todas') + '</button></div>';
      html += '<div class="position-grid">';
      for (var j = 0; j < positions.length; j++) {
        var p = positions[j];
        var psel = state.selectedPositions.indexOf(p) !== -1;
        html += '<label class="position-pill' + (psel ? ' selected' : '') + '">' +
          '<input type="checkbox" value="' + esc(p) + '" data-action="toggle-position" ' + (psel ? 'checked' : '') + '>' +
          '<span class="check-box"></span><span>' + esc(Ranges.posLabel(p)) + '</span>' +
          '</label>';
      }
      html += '</div>';
    }

    html += '<div class="spacer"></div>';
    var canStart = state.selectedBlindIds.length > 0 && state.selectedPositions.length > 0;
    html += '<button class="btn-primary" data-action="start-session" ' + (canStart ? '' : 'disabled') + '>Iniciar treino</button>';
    html += '<div class="home-footer">' +
      '<button class="btn-secondary" data-action="go-stats">📊 Histórico</button>' +
      '<button class="btn-secondary" data-action="go-import">⚙️ Ranges</button>' +
      '<button class="btn-secondary" data-action="go-home">← Menu</button>' +
      '</div>';
    html += '</div>';
    return html;
  }

  /* ---------- Game ---------- */
  function renderGame() {
    var round = state.currentRound;
    var html = '<div class="screen">';
    html += '<div class="game-status">' +
      '<span class="tag">' + esc(round.blindNome) + '</span>' +
      '<span class="score-badge">' + state.session.correct + '/' + state.session.total + (state.session.total ? ' · ' + pct(state.session.correct, state.session.total) + '%' : '') + '</span>' +
      '</div>';

    html += '<div class="game-center">';
    html += '<div class="ask-block">' +
      Table.render(round.position) +
      '<h2>Abre de ' + esc(Ranges.posLabel(round.position)) + '?</h2>' +
      '</div>';
    html += '<div class="cards-row">' + UI.renderCard(round.c1) + UI.renderCard(round.c2) + '</div>';

    if (!state.lastResult) {
      html += '<div class="answer-row">' +
        '<button class="answer-btn abre" data-action="answer" data-answer="abre">✅ Abre</button>' +
        '<button class="answer-btn nao" data-action="answer" data-answer="nao_abre">🚫 Não abre</button>' +
        '</div>';
    } else {
      var r = state.lastResult;
      var respostaTxt = r.correctAnswer === 'abre' ? 'Abre' : 'Não abre';
      html += '<div class="feedback-panel ' + (r.correct ? 'correct' : 'wrong') + '">' +
        '<div class="fb-title">' + (r.correct ? '✅ Correto!' : '❌ Errado') + '</div>' +
        '<div class="fb-detail">Mão: <b>' + esc(r.handClass) + '</b> · Resposta certa: <b>' + respostaTxt + '</b></div>' +
        '</div>';
      html += '<button class="btn-primary" style="margin-top:0" data-action="next-hand">Próxima mão →</button>';
    }
    html += '</div>';

    html += '<div class="end-session-link"><button data-action="end-session">Encerrar sessão</button></div>';
    html += '</div>';
    return html;
  }

  /* ---------- Stats ---------- */
  function renderStats() {
    var html = '<div class="screen">';
    html += '<div class="hero">' +
      '<p class="eyebrow">Histórico de Treino</p>' +
      '<h1>Open Raise</h1>' +
      '</div>';

    if (state.history.length === 0) {
      html += '<div class="empty-state"><div class="big-icon">🃏</div>Você ainda não jogou nenhuma mão.<br>Comece um treino para ver suas estatísticas aqui.</div>';
      html += '</div>';
      return html;
    }

    var stats = computeStats(state.history);
    html += '<div class="stat-hero">' +
      '<div class="big-num">' + pct(stats.overall.correct, stats.overall.total) + '%</div>' +
      '<div class="big-label">' + stats.overall.correct + ' de ' + stats.overall.total + ' mãos corretas · Taxa geral</div>' +
      '</div>';

    html += '<p class="section-label">Por posição</p><div class="stat-table">';
    var posKeys = Object.keys(stats.byPosition).sort();
    for (var i = 0; i < posKeys.length; i++) {
      var k = posKeys[i], v = stats.byPosition[k], p = pct(v.correct, v.total);
      html += '<div class="stat-row"><span class="label">' + esc(k) + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + p + '%"></div></div>' +
        '<span class="pct">' + p + '% (' + v.total + ')</span></div>';
    }
    html += '</div>';

    html += '<p class="section-label">Por nível de blind</p><div class="stat-table">';
    var blindKeys = Object.keys(stats.byBlind).sort();
    for (var j = 0; j < blindKeys.length; j++) {
      var bk = blindKeys[j], bv = stats.byBlind[bk], bp = pct(bv.correct, bv.total);
      html += '<div class="stat-row"><span class="label">' + esc(bk) + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + bp + '%"></div></div>' +
        '<span class="pct">' + bp + '% (' + bv.total + ')</span></div>';
    }
    html += '</div>';

    html += '<details class="detail-block"><summary>Detalhamento completo (blind + posição)</summary><div class="stat-table" style="margin-top:8px">';
    var comboKeys = Object.keys(stats.byBlindPosition).sort();
    for (var m = 0; m < comboKeys.length; m++) {
      var ck = comboKeys[m], cv = stats.byBlindPosition[ck], cp = pct(cv.correct, cv.total);
      html += '<div class="stat-row"><span class="label" style="width:auto;flex:1">' + esc(ck) + '</span>' +
        '<span class="pct">' + cp + '% (' + cv.total + ')</span></div>';
    }
    html += '</div></details>';

    html += '<button class="danger-link" data-action="clear-history">Limpar histórico</button>';
    html += '<div class="home-footer"><button class="btn-secondary" data-action="go-home">← Voltar ao Menu</button></div>';
    html += '</div>';
    return html;
  }

  /* ---------- Import ---------- */
  function renderImport() {
    var usingCustom = Ranges.isUsingCustomRanges();
    var html = '<div class="screen">';
    html += '<div class="hero">' +
      '<p class="eyebrow">Configuração</p>' +
      '<h1>Ranges</h1>' +
      '</div>';
    html += '<div class="info-box">Edite o arquivo <code>ranges_aberturas.json</code> com seus próprios ranges e importe abaixo. ' +
      'Formato esperado: <code>{"blinds":[{"id":"...","nome":"...","posicoes":{"UTG":["AA","AKs",...]}}]}</code>.</div>';

    html += '<p class="section-label">Range ativo</p>';
    html += '<div class="option-row selected" style="margin-bottom:16px"><span class="option-text"><div class="t1">' +
      (usingCustom ? 'Personalizado (importado)' : 'Padrão (embutido no app)') + '</div></span></div>';

    html += '<label class="file-input-btn">📂 Importar ranges_aberturas.json' +
      '<input type="file" accept="application/json,.json" id="file-input" style="display:none">' +
      '</label>';

    if (usingCustom) {
      html += '<button class="danger-link" data-action="reset-default-ranges">Restaurar range padrão</button>';
    }

    if (state.importMessage) {
      html += '<div class="toast ' + state.importMessage.type + '">' + esc(state.importMessage.text) + '</div>';
    }
    html += '<div class="home-footer"><button class="btn-secondary" data-action="go-config">← Voltar</button></div>';
    html += '</div>';
    return html;
  }

  /* ================= Render principal ================= */
  function render() {
    var app = document.getElementById('app');
    var html;
    switch (state.screen) {
      case 'config': html = renderConfig(); break;
      case 'game': html = renderGame(); break;
      case 'stats': html = renderStats(); break;
      case 'import': html = renderImport(); break;
      default: html = renderHome();
    }
    app.innerHTML = html;
  }

  /* ================= Eventos ================= */
  document.getElementById('app').addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');

    if (action === 'go-config') { state.screen = 'config'; render(); }
    else if (action === 'go-home') { window.location.href = 'index.html'; }
    else if (action === 'go-stats') { state.screen = 'stats'; render(); }
    else if (action === 'go-import') { state.screen = 'import'; state.importMessage = null; render(); }
    else if (action === 'toggle-all-positions') {
      var positions = unionPositions(selectedBlinds());
      state.selectedPositions = state.selectedPositions.length === positions.length ? [] : positions.slice();
      render();
    }
    else if (action === 'start-session') {
      if (el.hasAttribute('disabled')) return;
      state.session = { total: 0, correct: 0 };
      dealNewHand();
      state.screen = 'game';
      render();
    }
    else if (action === 'answer') {
      handleAnswer(el.getAttribute('data-answer'));
    }
    else if (action === 'next-hand') {
      dealNewHand();
      render();
    }
    else if (action === 'end-session') { state.screen = 'config'; render(); }
    else if (action === 'clear-history') {
      if (confirm('Tem certeza que deseja apagar todo o histórico?')) {
        state.history = [];
        Storage.remove(HISTORY_STORAGE_KEY);
        render();
      }
    }
    else if (action === 'reset-default-ranges') {
      Ranges.resetToDefault();
      state.rangesData = window.RT_DEFAULT_RANGES;
      state.selectedTipo = null;
      state.selectedBlindIds = [];
      state.selectedPositions = [];
      state.importMessage = { type: 'success', text: 'Range padrão restaurado.' };
      render();
    }
  });

  document.getElementById('app').addEventListener('change', function (e) {
    var el = e.target;
    var action = el.getAttribute('data-action');

    if (action === 'select-tipo') {
      state.selectedTipo = el.value;
      state.selectedBlindIds = [];
      state.selectedPositions = [];
      render();
    }
    else if (action === 'toggle-blind') {
      var id = el.value;
      var idx = state.selectedBlindIds.indexOf(id);
      if (idx === -1) state.selectedBlindIds.push(id); else state.selectedBlindIds.splice(idx, 1);
      state.selectedPositions = unionPositions(selectedBlinds());
      render();
    }
    else if (action === 'toggle-position') {
      var pos = el.value;
      var idx = state.selectedPositions.indexOf(pos);
      if (idx === -1) state.selectedPositions.push(pos); else state.selectedPositions.splice(idx, 1);
      render();
    }
    else if (el.id === 'file-input') {
      var file = el.files && el.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var parsed = JSON.parse(ev.target.result);
          if (!parsed || !Array.isArray(parsed.blinds) || !parsed.blinds.length) throw new Error('Estrutura inválida: esperado {"blinds":[...]}.');
          for (var i = 0; i < parsed.blinds.length; i++) {
            var b = parsed.blinds[i];
            if (!b.id || !b.nome || !b.posicoes || typeof b.posicoes !== 'object') throw new Error('Cada blind precisa de id, nome e posicoes.');
          }
          Ranges.saveCustomRanges(parsed);
          state.rangesData = parsed;
          state.selectedTipo = null;
          state.selectedBlindIds = [];
          state.selectedPositions = [];
          state.importMessage = { type: 'success', text: 'Range importado! ' + parsed.blinds.length + ' nível(is) de blind carregado(s).' };
        } catch (err) {
          state.importMessage = { type: 'error', text: 'Erro ao importar: ' + err.message };
        }
        render();
      };
      reader.onerror = function () {
        state.importMessage = { type: 'error', text: 'Não foi possível ler o arquivo.' };
        render();
      };
      reader.readAsText(file, 'UTF-8');
    }
  });

  render();
})();
