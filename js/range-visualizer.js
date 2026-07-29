/* Range Visualizer: mostra os ranges de uma posição com estatísticas detalhadas */
(function () {
  "use strict";

  var Storage = RT.storage;
  var Ranges = RT.ranges;
  var UI = RT.ui;

  var state = {
    screen: 'home',
    rangesData: Ranges.loadRangesData(window.RT_DEFAULT_RANGES),
    selectedTipo: null,
    selectedBlindId: null,
    selectedPosition: null,
    selectedGameMode: 'open_range',
    compareMode: {
      blind1Id: null,
      position1: null,
      blind2Id: null,
      position2: null
    }
  };

  function getPositionsForBlind(blindId) {
    var blind = Ranges.findBlind(state.rangesData, blindId);
    if (!blind || !blind.posicoes) return [];
    return Object.keys(blind.posicoes);
  }

  function getRangeActions(blind, position, gameMode) {
    var rangeKey;
    if (gameMode === 'open_range') rangeKey = 'open_range';
    else if (gameMode === 'vs_openraise') rangeKey = 'vs_openraise_range';
    else if (gameMode === 'vs_3bet') rangeKey = 'vs_3bet_range';
    else if (gameMode === 'vs_openshove') rangeKey = 'vs_openshove_range';

    var posData = blind.posicoes[position][rangeKey];
    return {
      allin: (posData && posData.allin_range) ? posData.allin_range : [],
      raise: (posData && posData.raise_range) ? posData.raise_range : [],
      call: (posData && posData.call_range) ? posData.call_range : [],
      range: (posData && posData.range) ? posData.range : []
    };
  }

  function calculateStats(blind, position, gameMode) {
    var actions = getRangeActions(blind, position, gameMode);
    var allHands = 169;
    var stats = {
      allin: actions.allin.length,
      raise: actions.raise.length,
      call: actions.call.length,
      fold: 0
    };

    stats.fold = allHands - stats.allin - stats.raise - stats.call;

    return {
      allin: stats.allin,
      allInPct: ((stats.allin / allHands) * 100).toFixed(1),
      raise: stats.raise,
      raisePct: ((stats.raise / allHands) * 100).toFixed(1),
      call: stats.call,
      callPct: ((stats.call / allHands) * 100).toFixed(1),
      fold: stats.fold,
      foldPct: ((stats.fold / allHands) * 100).toFixed(1)
    };
  }

  function renderHome() {
    var html = '<div class="screen">';
    html += '<div class="hero">' +
      '<p class="eyebrow">Visualizador de Ranges</p>' +
      '<h1>Range Visualizer</h1>' +
      '</div>';

    html += '<div class="home-options">' +
      '<button class="option-btn large" data-action="go-single">' +
        '<div class="btn-icon">🔍</div>' +
        '<div class="btn-title">Ver Range Único</div>' +
        '<div class="btn-desc">Analise um range com estatísticas detalhadas</div>' +
      '</button>' +
      '<button class="option-btn large" data-action="go-compare">' +
        '<div class="btn-icon">⚖️</div>' +
        '<div class="btn-title">Comparar Ranges</div>' +
        '<div class="btn-desc">Compare dois ranges lado a lado</div>' +
      '</button>' +
      '</div>';

    html += '<div class="home-footer"><button class="btn-secondary" data-action="go-home-main">← Menu Principal</button></div>';
    html += '</div>';
    return html;
  }

  function renderSingleConfig() {
    var html = '<div class="screen">';
    html += '<div class="hero">' +
      '<p class="eyebrow">Visualizador de Ranges</p>' +
      '<h1>Ver Range Único</h1>' +
      '</div>';

    var tipos = Ranges.listTipos(state.rangesData);
    html += '<p class="section-label">Tipo de Jogo</p><div class="option-list">';
    for (var t = 0; t < tipos.length; t++) {
      var tipo = tipos[t];
      var tsel = state.selectedTipo === tipo;
      html += '<label class="option-row' + (tsel ? ' selected' : '') + '">' +
        '<input type="radio" name="tipo" value="' + UI.esc(tipo) + '" data-action="select-tipo" ' + (tsel ? 'checked' : '') + '>' +
        '<span class="radio-dot"></span>' +
        '<span class="option-text"><div class="t1">' + UI.esc(Ranges.tipoLabel(tipo)) + '</div></span>' +
        '</label>';
    }
    html += '</div>';

    if (state.selectedTipo) {
      var blinds = Ranges.blindsByTipo(state.rangesData, state.selectedTipo);
      html += '<p class="section-label">Nível de Blind</p><div class="blinds-selector">';
      for (var i = 0; i < blinds.length; i++) {
        var b = blinds[i];
        var sel = state.selectedBlindId === b.id;
        html += '<label class="option-row' + (sel ? ' selected' : '') + '">' +
          '<input type="radio" name="blind" value="' + UI.esc(b.id) + '" data-action="select-blind" ' + (sel ? 'checked' : '') + '>' +
          '<span class="radio-dot"></span>' +
          '<span class="option-text"><div class="t1">' + UI.esc(b.nome) + '</div></span>' +
          '</label>';
      }
      html += '</div>';
    }

    if (state.selectedBlindId) {
      var blind = Ranges.findBlind(state.rangesData, state.selectedBlindId);
      var positions = getPositionsForBlind(state.selectedBlindId);
      html += '<p class="section-label">Posição</p><div class="option-list">';
      for (var j = 0; j < positions.length; j++) {
        var p = positions[j];
        var psel = state.selectedPosition === p;
        html += '<label class="option-row' + (psel ? ' selected' : '') + '">' +
          '<input type="radio" name="position" value="' + UI.esc(p) + '" data-action="select-position" ' + (psel ? 'checked' : '') + '>' +
          '<span class="radio-dot"></span>' +
          '<span class="option-text"><div class="t1">' + UI.esc(Ranges.posLabel(p)) + '</div></span>' +
          '</label>';
      }
      html += '</div>';
    }

    html += '<div class="spacer"></div>';
    var canView = state.selectedBlindId && state.selectedPosition;
    html += '<button class="btn-primary" data-action="view-range" ' + (canView ? '' : 'disabled') + '>Ver Range</button>';
    html += '<div class="home-footer">' +
      '<button class="btn-secondary" data-action="go-home">← Voltar</button>' +
      '</div>';
    html += '</div>';
    return html;
  }

  function renderCompareConfig() {
    var html = '<div class="screen">';
    html += '<div class="hero">' +
      '<p class="eyebrow">Comparar Ranges</p>' +
      '<h1>Selecione os Ranges</h1>' +
      '</div>';

    var tipos = Ranges.listTipos(state.rangesData);
    html += '<p class="section-label">Tipo de Jogo</p><div class="option-list">';
    for (var t = 0; t < tipos.length; t++) {
      var tipo = tipos[t];
      var tsel = state.selectedTipo === tipo;
      html += '<label class="option-row' + (tsel ? ' selected' : '') + '">' +
        '<input type="radio" name="tipo" value="' + UI.esc(tipo) + '" data-action="select-tipo" ' + (tsel ? 'checked' : '') + '>' +
        '<span class="radio-dot"></span>' +
        '<span class="option-text"><div class="t1">' + UI.esc(Ranges.tipoLabel(tipo)) + '</div></span>' +
        '</label>';
    }
    html += '</div>';

    if (state.selectedTipo) {
      var blinds = Ranges.blindsByTipo(state.rangesData, state.selectedTipo);

      html += '<div class="compare-selection">';
      html += '<div class="compare-column">';
      html += '<h3>Range 1</h3>';
      html += '<p class="section-label">Blind</p><div class="blinds-selector">';
      for (var i = 0; i < blinds.length; i++) {
        var b = blinds[i];
        var sel = state.compareMode.blind1Id === b.id;
        html += '<label class="option-row' + (sel ? ' selected' : '') + '">' +
          '<input type="radio" name="blind1" value="' + UI.esc(b.id) + '" data-action="select-compare-blind1" ' + (sel ? 'checked' : '') + '>' +
          '<span class="radio-dot"></span>' +
          '<span class="option-text"><div class="t1">' + UI.esc(b.nome) + '</div></span>' +
          '</label>';
      }
      html += '</div>';

      if (state.compareMode.blind1Id) {
        var positions = getPositionsForBlind(state.compareMode.blind1Id);
        html += '<p class="section-label">Posição</p><div class="option-list">';
        for (var j = 0; j < positions.length; j++) {
          var p = positions[j];
          var psel = state.compareMode.position1 === p;
          html += '<label class="option-row' + (psel ? ' selected' : '') + '">' +
            '<input type="radio" name="position1" value="' + UI.esc(p) + '" data-action="select-compare-position1" ' + (psel ? 'checked' : '') + '>' +
            '<span class="radio-dot"></span>' +
            '<span class="option-text"><div class="t1">' + UI.esc(Ranges.posLabel(p)) + '</div></span>' +
            '</label>';
        }
        html += '</div>';
      }
      html += '</div>';

      html += '<div class="compare-column">';
      html += '<h3>Range 2</h3>';
      html += '<p class="section-label">Blind</p><div class="blinds-selector">';
      for (var i = 0; i < blinds.length; i++) {
        var b = blinds[i];
        var sel = state.compareMode.blind2Id === b.id;
        html += '<label class="option-row' + (sel ? ' selected' : '') + '">' +
          '<input type="radio" name="blind2" value="' + UI.esc(b.id) + '" data-action="select-compare-blind2" ' + (sel ? 'checked' : '') + '>' +
          '<span class="radio-dot"></span>' +
          '<span class="option-text"><div class="t1">' + UI.esc(b.nome) + '</div></span>' +
          '</label>';
      }
      html += '</div>';

      if (state.compareMode.blind2Id) {
        var positions = getPositionsForBlind(state.compareMode.blind2Id);
        html += '<p class="section-label">Posição</p><div class="option-list">';
        for (var j = 0; j < positions.length; j++) {
          var p = positions[j];
          var psel = state.compareMode.position2 === p;
          html += '<label class="option-row' + (psel ? ' selected' : '') + '">' +
            '<input type="radio" name="position2" value="' + UI.esc(p) + '" data-action="select-compare-position2" ' + (psel ? 'checked' : '') + '>' +
            '<span class="radio-dot"></span>' +
            '<span class="option-text"><div class="t1">' + UI.esc(Ranges.posLabel(p)) + '</div></span>' +
            '</label>';
        }
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
    }

    html += '<div class="spacer"></div>';
    var canCompare = state.compareMode.blind1Id && state.compareMode.position1 && state.compareMode.blind2Id && state.compareMode.position2;
    html += '<button class="btn-primary" data-action="do-compare" ' + (canCompare ? '' : 'disabled') + '>Comparar</button>';
    html += '<div class="home-footer">' +
      '<button class="btn-secondary" data-action="go-home">← Voltar</button>' +
      '</div>';
    html += '</div>';
    return html;
  }

  function renderRange() {
    var blind = Ranges.findBlind(state.rangesData, state.selectedBlindId);
    var stats = calculateStats(blind, state.selectedPosition, state.selectedGameMode);

    var html = '<div class="screen">';
    html += '<div class="range-header">' +
      '<h2>' + UI.esc(blind.nome) + ' - ' + UI.esc(Ranges.posLabel(state.selectedPosition)) + '</h2>' +
      '<button class="btn-secondary" data-action="go-back">← Voltar</button>' +
      '</div>';

    html += '<div class="stats-panel">' +
      '<div class="stat-item allin">' +
        '<div class="stat-label">All-in</div>' +
        '<div class="stat-number">' + stats.allin + '</div>' +
        '<div class="stat-percent">' + stats.allInPct + '%</div>' +
      '</div>' +
      '<div class="stat-item raise">' +
        '<div class="stat-label">Raise</div>' +
        '<div class="stat-number">' + stats.raise + '</div>' +
        '<div class="stat-percent">' + stats.raisePct + '%</div>' +
      '</div>' +
      '<div class="stat-item call">' +
        '<div class="stat-label">Call</div>' +
        '<div class="stat-number">' + stats.call + '</div>' +
        '<div class="stat-percent">' + stats.callPct + '%</div>' +
      '</div>' +
      '<div class="stat-item fold">' +
        '<div class="stat-label">Fold</div>' +
        '<div class="stat-number">' + stats.fold + '</div>' +
        '<div class="stat-percent">' + stats.foldPct + '%</div>' +
      '</div>' +
      '</div>';

    html += '<p class="section-label">Modo de Jogo</p>';
    var modes = ['open_range', 'vs_openraise', 'vs_3bet', 'vs_openshove'];
    var modeLabels = {
      'open_range': 'Open Range',
      'vs_openraise': 'vs Open Raise',
      'vs_3bet': 'vs 3-Bet',
      'vs_openshove': 'vs Open Shove'
    };
    html += '<div class="mode-selector">';
    for (var m = 0; m < modes.length; m++) {
      var mode = modes[m];
      var msel = state.selectedGameMode === mode;
      html += '<button class="mode-btn ' + (msel ? 'active' : '') + '" data-action="change-mode" data-mode="' + mode + '">' +
        modeLabels[mode] + '</button>';
    }
    html += '</div>';

    html += '<p class="section-label">Range de Mãos</p>';
    html += '<div class="range-grid">';
    html += renderRangeGrid(blind, state.selectedPosition, state.selectedGameMode);
    html += '</div>';

    html += '</div>';
    return html;
  }

  function renderCompare() {
    var blind1 = Ranges.findBlind(state.rangesData, state.compareMode.blind1Id);
    var blind2 = Ranges.findBlind(state.rangesData, state.compareMode.blind2Id);
    var actions1 = getRangeActions(blind1, state.compareMode.position1, state.selectedGameMode);
    var actions2 = getRangeActions(blind2, state.compareMode.position2, state.selectedGameMode);

    var html = '<div class="screen compare-screen">';
    html += '<div class="range-header">' +
      '<h2>Comparar Ranges</h2>' +
      '<button class="btn-secondary" data-action="go-home">← Voltar</button>' +
      '</div>';

    html += '<p class="section-label">Modo de Jogo</p>';
    var modes = ['open_range', 'vs_openraise', 'vs_3bet', 'vs_openshove'];
    var modeLabels = {
      'open_range': 'Open Range',
      'vs_openraise': 'vs Open Raise',
      'vs_3bet': 'vs 3-Bet',
      'vs_openshove': 'vs Open Shove'
    };
    html += '<div class="mode-selector">';
    for (var m = 0; m < modes.length; m++) {
      var mode = modes[m];
      var msel = state.selectedGameMode === mode;
      html += '<button class="mode-btn ' + (msel ? 'active' : '') + '" data-action="change-mode" data-mode="' + mode + '">' +
        modeLabels[mode] + '</button>';
    }
    html += '</div>';

    html += '<div class="compare-grids">';
    html += '<div class="compare-grid-wrapper">' +
      '<h3>' + UI.esc(blind1.nome) + ' - ' + UI.esc(Ranges.posLabel(state.compareMode.position1)) + '</h3>' +
      '<div class="range-grid">' +
      renderRangeGrid(blind1, state.compareMode.position1, state.selectedGameMode) +
      '</div>' +
      '</div>';

    html += '<div class="compare-grid-wrapper">' +
      '<h3>' + UI.esc(blind2.nome) + ' - ' + UI.esc(Ranges.posLabel(state.compareMode.position2)) + '</h3>' +
      '<div class="range-grid">' +
      renderRangeGrid(blind2, state.compareMode.position2, state.selectedGameMode) +
      '</div>' +
      '</div>';
    html += '</div>';

    html += '<p class="section-label">Diferenças Entre Ranges</p>';
    html += renderCompareDifferences(actions1, actions2, blind1, state.compareMode.position1, blind2, state.compareMode.position2);

    html += '</div>';
    return html;
  }

  function renderRangeGrid(blind, position, gameMode) {
    var RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    var actions = getRangeActions(blind, position, gameMode);
    var allCombos = actions.allin;
    var raiseCombos = actions.raise;
    var callCombos = actions.call;
    var hasData = allCombos.length > 0 || raiseCombos.length > 0 || callCombos.length > 0;

    var html = '<div class="grid-container">';
    for (var i = 0; i < RANKS.length; i++) {
      for (var j = 0; j < RANKS.length; j++) {
        var r1 = RANKS[i];
        var r2 = RANKS[j];
        var combo = r1 === r2 ? r1 + r2 : (i < j ? r1 + r2 + 's' : r1 + r2 + 'o');

        var action = 'empty';
        if (!hasData) {
          action = 'empty';
        } else if (allCombos.indexOf(combo) !== -1) {
          action = 'allin';
        } else if (raiseCombos.indexOf(combo) !== -1) {
          action = 'raise';
        } else if (callCombos.indexOf(combo) !== -1) {
          action = 'call';
        } else {
          action = 'fold';
        }

        html += '<div class="range-cell ' + action + '">' + combo + '</div>';
      }
    }
    html += '</div>';
    return html;
  }

  function renderCompareDifferences(actions1, actions2, blind1, pos1, blind2, pos2) {
    var allHands1 = actions1.allin.concat(actions1.raise).concat(actions1.call);
    var allHands2 = actions2.allin.concat(actions2.raise).concat(actions2.call);

    var onlyIn1 = allHands1.filter(function(h) { return allHands2.indexOf(h) === -1; });
    var onlyIn2 = allHands2.filter(function(h) { return allHands1.indexOf(h) === -1; });

    var html = '<div class="differences-grids">';

    html += '<div class="diff-grid-wrapper">' +
      '<div class="diff-grid-header">' +
      '<div class="diff-grid-title">' + UI.esc(blind1.nome) + ' - ' + UI.esc(Ranges.posLabel(pos1)) + '</div>' +
      '<div class="diff-grid-subtitle">Apenas neste range</div>' +
      '</div>' +
      '<div class="difference-grid">' +
      renderDifferenceGrid(onlyIn1, onlyIn2, true) +
      '</div>' +
      '</div>';

    html += '<div class="diff-grid-wrapper">' +
      '<div class="diff-grid-header">' +
      '<div class="diff-grid-title">' + UI.esc(blind2.nome) + ' - ' + UI.esc(Ranges.posLabel(pos2)) + '</div>' +
      '<div class="diff-grid-subtitle">Apenas neste range</div>' +
      '</div>' +
      '<div class="difference-grid">' +
      renderDifferenceGrid(onlyIn1, onlyIn2, false) +
      '</div>' +
      '</div>';

    html += '</div>';

    return html;
  }

  function renderDifferenceGrid(onlyIn1, onlyIn2, isRange1) {
    var RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    var targetList = isRange1 ? onlyIn1 : onlyIn2;
    var otherList = isRange1 ? onlyIn2 : onlyIn1;

    var html = '<div class="grid-container">';
    for (var i = 0; i < RANKS.length; i++) {
      for (var j = 0; j < RANKS.length; j++) {
        var r1 = RANKS[i];
        var r2 = RANKS[j];
        var combo = r1 === r2 ? r1 + r2 : (i < j ? r1 + r2 + 's' : r1 + r2 + 'o');

        var cssClass = 'range-cell';
        if (targetList.indexOf(combo) !== -1) {
          cssClass += ' diff-only';
        } else if (otherList.indexOf(combo) !== -1) {
          cssClass += ' diff-other';
        } else {
          cssClass += ' diff-empty';
        }

        html += '<div class="' + cssClass + '">' + combo + '</div>';
      }
    }
    html += '</div>';
    return html;
  }

  function render() {
    var app = document.getElementById('app');
    var html;
    switch (state.screen) {
      case 'home': html = renderHome(); break;
      case 'single': html = renderSingleConfig(); break;
      case 'range': html = renderRange(); break;
      case 'compare-config': html = renderCompareConfig(); break;
      case 'compare': html = renderCompare(); break;
      default: html = renderHome();
    }
    app.innerHTML = html;
  }

  document.getElementById('app').addEventListener('change', function (e) {
    var el = e.target;
    var action = el.getAttribute('data-action');

    if (action === 'select-tipo') {
      state.selectedTipo = el.value;
      state.selectedBlindId = null;
      state.selectedPosition = null;
      render();
    }
    else if (action === 'select-blind') {
      state.selectedBlindId = el.value;
      state.selectedPosition = null;
      render();
    }
    else if (action === 'select-position') {
      state.selectedPosition = el.value;
      render();
    }
    else if (action === 'select-compare-blind1') {
      state.compareMode.blind1Id = el.value;
      state.compareMode.position1 = null;
      render();
    }
    else if (action === 'select-compare-position1') {
      state.compareMode.position1 = el.value;
      render();
    }
    else if (action === 'select-compare-blind2') {
      state.compareMode.blind2Id = el.value;
      state.compareMode.position2 = null;
      render();
    }
    else if (action === 'select-compare-position2') {
      state.compareMode.position2 = el.value;
      render();
    }
  });

  document.getElementById('app').addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');

    if (action === 'go-home-main' || action === 'go-home') {
      state.screen = 'home';
      state.selectedTipo = null;
      state.selectedBlindId = null;
      state.selectedPosition = null;
      state.compareMode = { blind1Id: null, position1: null, blind2Id: null, position2: null };
      render();
    }
    else if (action === 'go-single') {
      state.screen = 'single';
      state.selectedTipo = null;
      state.selectedBlindId = null;
      state.selectedPosition = null;
      render();
    }
    else if (action === 'go-compare') {
      state.screen = 'compare-config';
      state.selectedTipo = null;
      render();
    }
    else if (action === 'go-back') {
      state.screen = 'home';
      state.selectedTipo = null;
      state.selectedBlindId = null;
      state.selectedPosition = null;
      render();
    }
    else if (action === 'view-range') {
      state.screen = 'range';
      render();
    }
    else if (action === 'do-compare') {
      state.screen = 'compare';
      render();
    }
    else if (action === 'change-mode') {
      state.selectedGameMode = el.getAttribute('data-mode');
      render();
    }
  });

  render();
})();
