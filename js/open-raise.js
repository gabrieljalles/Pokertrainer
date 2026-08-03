/* Minigame "RFI": app SPA (home/config/game/stats/import).
   Depende de RT.storage, RT.cards, RT.ranges, RT.ui e window.RT_DEFAULT_RANGES
   já carregados antes deste arquivo. */
(function () {
  "use strict";

  var SPEED_WRONG_PAUSE_MS = 3000;
  var speedWrongTimer = null;

  function clearSpeedWrongTimer() {
    if (speedWrongTimer) {
      clearTimeout(speedWrongTimer);
      speedWrongTimer = null;
    }
  }

  var HISTORY_STORAGE_KEY = "rt_history_v1";
  var BEST_STREAK_KEY = "rt_best_streak_v1";
  var FSRS_MAP_KEY = "rt_openraise_fsrs_v1";
  var ROUND_COUNTER_KEY = "rt_openraise_roundcount_v1";
  var OLD_RETRY_QUEUE_KEY = "rt_openraise_retry_v1"; // removido, mas limpamos se existir

  var Storage = RT.storage;
  var Cards = RT.cards;
  var Ranges = RT.ranges;
  var UI = RT.ui;
  var Table = RT.pokerTable;
  var FSRS = RT.fsrs;

  function loadHistory() {
    var raw = Storage.get(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    try {
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function loadBestStreak() {
    var n = parseInt(Storage.get(BEST_STREAK_KEY), 10);
    return isNaN(n) ? 0 : n;
  }

  function loadFsrsMap() {
    var raw = Storage.get(FSRS_MAP_KEY);
    if (!raw) return {};
    try {
      var obj = JSON.parse(raw);
      return typeof obj === 'object' ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function saveFsrsMap(map) {
    Storage.set(FSRS_MAP_KEY, JSON.stringify(map));
  }

  function loadRoundCounter() {
    var n = parseInt(Storage.get(ROUND_COUNTER_KEY), 10);
    return isNaN(n) ? 0 : n;
  }

  function saveRoundCounter(n) {
    Storage.set(ROUND_COUNTER_KEY, String(n));
  }

  /* Remove storage antigo de fila de repetição (3 estágios). Chamado uma vez
     na inicialização pra fazer limpeza. */
  function cleanupOldRetryQueue() {
    if (Storage.hasOwnProperty(OLD_RETRY_QUEUE_KEY)) {
      Storage.remove(OLD_RETRY_QUEUE_KEY);
    }
  }

  function randBetween(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  /* Extrai os limites de bb efetivos do nome do nível de blind (ex.: "35 a
     26bb" -> {min:26, max:35}, "8bb-" -> {min:8, max:8}) pra sortear um
     valor aleatório dentro da faixa a cada mão. */
  function parseBlindBBRange(nome) {
    var rangeMatch = nome.match(/(\d+)\s*a\s*(\d+)\s*bb/i);
    if (rangeMatch) {
      var a = parseInt(rangeMatch[1], 10),
        b = parseInt(rangeMatch[2], 10);
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
    var singleMatch = nome.match(/(\d+)\s*bb/i);
    if (singleMatch) {
      var n = parseInt(singleMatch[1], 10);
      return { min: n, max: n };
    }
    return null;
  }

  function randomEffectiveBB(nome) {
    var range = parseBlindBBRange(nome);
    if (!range) return "";
    return String(randBetween(range.min, range.max)) + "bb";
  }

  /* Gera todas as 169 classes de mão (13x13), reusando a mesma ordem de
     ranks usada em renderRangeGrid. */
  function allHandClasses() {
    var RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    var classes = [];
    for (var i = 0; i < RANKS.length; i++) {
      for (var j = 0; j < RANKS.length; j++) {
        var r1 = RANKS[i];
        var r2 = RANKS[j];
        var combo = r1 === r2 ? r1 + r2 : (i < j ? r1 + r2 + 's' : r1 + r2 + 'o');
        classes.push(combo);
      }
    }
    return classes;
  }

  /* Calcula o peso de sorteio (0-1) para uma combinação (blindId, position, handClass)
     baseado na retrievability FSRS. Mãos com retrievability baixa (não dominadas)
     têm peso alto; mãos dominadas têm peso mínimo (MIN_WEIGHT).
     A fórmula é: weight = clamp(1 - R, MIN_WEIGHT, 1), onde R é retrievability. */
  function getHandWeight(fsrsMap, blindId, position, handClass, currentRound) {
    var key = blindId + '|' + position + '|' + handClass;
    var card = fsrsMap[key] || FSRS.createEmptyCard();
    var retrievability = FSRS.retrievability(card, currentRound);
    var weight = 1 - retrievability;
    return Math.max(FSRS.MIN_WEIGHT, Math.min(1, weight));
  }

  /* Sorteio ponderado: dado um array de [value, weight, ...] pairs,
     escolhe um valor conforme os pesos (roleta cumulativa). */
  function weightedPick(candidates, currentRound, fsrsMap) {
    // Calcula pesos e acumula
    var totalWeight = 0;
    var weights = [];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var w = getHandWeight(fsrsMap, c.blindId, c.position, c.handClass, currentRound);
      weights.push(w);
      totalWeight += w;
    }

    if (totalWeight === 0) {
      // Fallback seguro (não deveria acontecer)
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    var roll = Math.random() * totalWeight;
    var cumulative = 0;
    for (var i = 0; i < candidates.length; i++) {
      cumulative += weights[i];
      if (roll <= cumulative) {
        return candidates[i];
      }
    }

    return candidates[candidates.length - 1];
  }

  function unionPositions(blinds) {
    var seen = {},
      out = [];
    for (var i = 0; i < blinds.length; i++) {
      var keys = Object.keys(blinds[i].posicoes);
      for (var j = 0; j < keys.length; j++) {
        if (!seen[keys[j]]) {
          seen[keys[j]] = true;
          out.push(keys[j]);
        }
      }
    }
    return out;
  }

  function selectedBlinds() {
    return state.selectedBlindIds
      .map(function (id) {
        return Ranges.findBlind(state.rangesData, id);
      })
      .filter(Boolean);
  }

  /* ================= Estado ================= */
  var state = {
    screen: "config",
    rangesData: Ranges.loadRangesData(window.RT_DEFAULT_RANGES),
    selectedTipo: null,
    selectedBlindIds: [],
    selectedPositions: [],
    speedMode: false,
    expandedBlindId: null,
    session: { total: 0, correct: 0, touchedKeys: {} },
    streak: 0,
    bestStreak: loadBestStreak(),
    currentRound: null,
    lastResult: null,
    previousRound: null,
    showPrevHand: false,
    showRangeGrid: false,
    lastSessionSummary: null,
    fsrsMap: loadFsrsMap(),
    roundsPlayed: loadRoundCounter(),
    history: loadHistory(),
    dailyStats: [],
    dailyStatsFilterBlind: null,
    dailyStatsFilterPosition: null,
    importMessage: null,
  };

  // Cleanup de armazenamento antigo
  cleanupOldRetryQueue();

  // Computa stats diários a partir do histórico
  function computeDailyStats(history) {
    var dailyMap = {};
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      var date = new Date(h.ts).toISOString().split('T')[0]; // YYYY-MM-DD
      var key = date + '|' + h.blindNome + '|' + h.position;

      if (!dailyMap[key]) {
        dailyMap[key] = { date: date, blind: h.blindNome, position: h.position, attempts: 0, correct: 0 };
      }
      dailyMap[key].attempts++;
      if (h.correct) dailyMap[key].correct++;
    }

    // Converte pra array e calcula accuracy
    var stats = [];
    var keys = Object.keys(dailyMap);
    for (var j = 0; j < keys.length; j++) {
      var s = dailyMap[keys[j]];
      s.accuracy = s.attempts > 0 ? Math.round((s.correct / s.attempts) * 100) : 0;
      stats.push(s);
    }

    // Ordena por data
    stats.sort(function (a, b) {
      return new Date(a.date) - new Date(b.date);
    });

    return stats;
  }

  // Inicializa dailyStats
  state.dailyStats = computeDailyStats(state.history);

  function recordAttempt(record) {
    state.history.push(record);
    Storage.set(HISTORY_STORAGE_KEY, JSON.stringify(state.history));
  }

  function getCorrectAction(rangesData, blindId, position, handClass) {
    var blind = Ranges.findBlind(rangesData, blindId);
    if (!blind || !blind.posicoes[position]) {
      return "fold";
    }

    var posData = blind.posicoes[position].open_range;
    if (!posData) {
      return "fold";
    }

    if (posData.fold_range && posData.fold_range.indexOf(handClass) !== -1) {
      return "fold";
    }
    if (posData.allin_range && posData.allin_range.indexOf(handClass) !== -1) {
      return "allin";
    }
    if (posData.raise_range && posData.raise_range.indexOf(handClass) !== -1) {
      return "raise";
    }
    if (posData.call_range && posData.call_range.indexOf(handClass) !== -1) {
      return "call";
    }
    if (posData.range && posData.range.indexOf(handClass) !== -1) {
      return "raise";
    }
    return "fold";
  }

  var GRID_ORDER = Cards.RANKS.slice().reverse(); // A,K,Q,...,2

  function classifyHandForGrid(posData, handClass) {
    if (!posData) return null;
    if (posData.fold_range && posData.fold_range.indexOf(handClass) !== -1)
      return "fold";
    if (posData.allin_range && posData.allin_range.indexOf(handClass) !== -1)
      return "allin";
    if (posData.raise_range && posData.raise_range.indexOf(handClass) !== -1)
      return "raise";
    if (posData.call_range && posData.call_range.indexOf(handClass) !== -1)
      return "call";
    if (posData.range && posData.range.indexOf(handClass) !== -1) return "raise";
    return null;
  }

  function renderRangeGrid(rangesData, round) {
    var blind = Ranges.findBlind(rangesData, round.blindId);
    var posData =
      blind && blind.posicoes[round.position]
        ? blind.posicoes[round.position].open_range
        : null;

    var html = '<div class="range-grid-wrap">';
    html +=
      '<div class="range-grid-legend">' +
      '<span><i class="legend-swatch cell-fold"></i>Fold</span>' +
      '<span><i class="legend-swatch cell-raise"></i>Raise</span>' +
      '<span><i class="legend-swatch cell-call"></i>Call</span>' +
      '<span><i class="legend-swatch cell-allin"></i>All-in</span>' +
      '<span><i class="legend-swatch cell-empty"></i>Não encontrado</span>' +
      "</div>";
    html += '<div class="range-grid">';
    for (var r = 0; r < GRID_ORDER.length; r++) {
      for (var c = 0; c < GRID_ORDER.length; c++) {
        var handClass;
        if (r === c) {
          handClass = GRID_ORDER[r] + GRID_ORDER[r];
        } else if (r < c) {
          handClass = GRID_ORDER[r] + GRID_ORDER[c] + "s";
        } else {
          handClass = GRID_ORDER[c] + GRID_ORDER[r] + "o";
        }
        var category = classifyHandForGrid(posData, handClass);
        var isCurrent = handClass === round.handClass;
        html +=
          '<div class="range-cell ' +
          (category ? "cell-" + category : "cell-empty") +
          (isCurrent ? " current-hand" : "") +
          '">' +
          esc(handClass) +
          "</div>";
      }
    }
    html += "</div></div>";
    return html;
  }

  function dealNewHand() {
    state.roundsPlayed++;
    saveRoundCounter(state.roundsPlayed);

    // Monta lista de candidatos: todas as combinações (blindId, position, handClass)
    // que realmente existem nos ranges (raise/call/fold/allin).
    var blinds = selectedBlinds();
    var handClasses = allHandClasses();
    var candidates = [];
    for (var i = 0; i < blinds.length; i++) {
      for (var j = 0; j < state.selectedPositions.length; j++) {
        var pos = state.selectedPositions[j];
        if (blinds[i].posicoes[pos]) {
          var blindData = blinds[i];
          var posData = blindData.posicoes[pos].open_range;
          if (posData) {
            // Coleta todas as mãos que estão em algum range (raise/call/fold/allin)
            var validHands = new Set();
            if (posData.raise_range) {
              posData.raise_range.forEach(function(h) { validHands.add(h); });
            }
            if (posData.call_range) {
              posData.call_range.forEach(function(h) { validHands.add(h); });
            }
            if (posData.fold_range) {
              posData.fold_range.forEach(function(h) { validHands.add(h); });
            }
            if (posData.allin_range) {
              posData.allin_range.forEach(function(h) { validHands.add(h); });
            }
            // Só inclui mãos que realmente existem
            validHands.forEach(function(hc) {
              candidates.push({
                blindId: blindData.id,
                blindNome: blindData.nome,
                position: pos,
                handClass: hc,
              });
            });
          }
        }
      }
    }

    if (candidates.length === 0) {
      // Fallback seguro (não deveria acontecer)
      var blinds = selectedBlinds();
      var choice = blinds[Math.floor(Math.random() * blinds.length)];
      var pair = Cards.dealTwoCards();
      state.currentRound = {
        blindId: choice.id,
        blindNome: choice.nome,
        position: state.selectedPositions[0],
        c1: pair[0],
        c2: pair[1],
        handClass: Cards.getHandClass(pair[0], pair[1]),
        correctAnswer: "fold",
        effectiveBB: randomEffectiveBB(choice.nome),
      };
      state.lastResult = null;
      state.showRangeGrid = false;
      return;
    }

    // Sorteio ponderado por FSRS (mãos difíceis aparecem mais)
    var choice = weightedPick(candidates, state.roundsPlayed, state.fsrsMap);

    // Sorteia duas cartas concretas da classe escolhida
    var pair = Cards.dealCardsForClass(choice.handClass);
    if (!pair) {
      // Fallback se dealCardsForClass falhar
      pair = Cards.dealTwoCards();
    }

    var correctAnswer = getCorrectAction(
      state.rangesData,
      choice.blindId,
      choice.position,
      choice.handClass,
    );

    state.currentRound = {
      blindId: choice.blindId,
      blindNome: choice.blindNome,
      position: choice.position,
      c1: pair[0],
      c2: pair[1],
      handClass: choice.handClass,
      correctAnswer: correctAnswer,
      effectiveBB: randomEffectiveBB(choice.blindNome),
    };
    state.lastResult = null;
    state.showRangeGrid = false;
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
      correct: correct,
    });

    // Atualiza FSRS com a resposta
    var key = round.blindId + '|' + round.position + '|' + round.handClass;
    var card = state.fsrsMap[key] || FSRS.createEmptyCard();
    var rating = correct ? 3 : 1; // 3 = Good (acertou), 1 = Again (errou)
    var updatedCard = FSRS.reviewCard(card, rating, state.roundsPlayed);
    state.fsrsMap[key] = updatedCard;
    saveFsrsMap(state.fsrsMap);

    if (state.speedMode) {
      state.streak = correct ? state.streak + 1 : 0;
      if (state.streak > state.bestStreak) {
        state.bestStreak = state.streak;
        Storage.set(BEST_STREAK_KEY, String(state.bestStreak));
      }
      state.previousRound = {
        blindNome: round.blindNome,
        position: round.position,
        c1: round.c1,
        c2: round.c2,
        handClass: round.handClass,
        correctAnswer: round.correctAnswer,
        userAnswer: userAnswer,
        correct: correct,
      };
      state.showPrevHand = false;

      if (correct) {
        dealNewHand();
        render();
        return;
      }

      state.lastResult = {
        correct: false,
        correctAnswer: round.correctAnswer,
        handClass: round.handClass,
        position: round.position,
      };
      render();
      clearSpeedWrongTimer();
      speedWrongTimer = setTimeout(function () {
        speedWrongTimer = null;
        dealNewHand();
        render();
      }, SPEED_WRONG_PAUSE_MS);
      return;
    }

    state.lastResult = {
      correct: correct,
      correctAnswer: round.correctAnswer,
      handClass: round.handClass,
      position: round.position,
    };
    render();
  }

  function computeStats(history) {
    var overall = { total: 0, correct: 0 };
    var byPosition = {},
      byBlind = {},
      byBlindPosition = {};
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      overall.total++;
      if (h.correct) overall.correct++;
      byPosition[h.position] = byPosition[h.position] || {
        total: 0,
        correct: 0,
      };
      byPosition[h.position].total++;
      if (h.correct) byPosition[h.position].correct++;
      byBlind[h.blindNome] = byBlind[h.blindNome] || { total: 0, correct: 0 };
      byBlind[h.blindNome].total++;
      if (h.correct) byBlind[h.blindNome].correct++;
      var key = h.blindNome + " · " + h.position;
      byBlindPosition[key] = byBlindPosition[key] || { total: 0, correct: 0 };
      byBlindPosition[key].total++;
      if (h.correct) byBlindPosition[key].correct++;
    }
    return {
      overall: overall,
      byPosition: byPosition,
      byBlind: byBlind,
      byBlindPosition: byBlindPosition,
    };
  }

  function formatDuplicatesWarning(duplicates) {
    var MAX_SHOWN = 5;
    var lines = duplicates.slice(0, MAX_SHOWN).map(function (d) {
      return (
        d.blindNome +
        " · " +
        Ranges.posLabel(d.position) +
        " · " +
        Ranges.gameModeLabel(d.gameMode) +
        ": " +
        d.handClass +
        " está em " +
        d.fields.join(" e ")
      );
    });
    var msg =
      "⚠️ " +
      duplicates.length +
      " mão(s) aparecem em mais de um range ao mesmo tempo (isso deixa a resposta certa ambígua): " +
      lines.join("; ");
    if (duplicates.length > MAX_SHOWN)
      msg += "; e mais " + (duplicates.length - MAX_SHOWN) + " conflito(s).";
    return msg;
  }

  /* ================= Render helpers ================= */
  var esc = UI.esc;
  var pct = UI.pct;

  /* ---------- Home ---------- */
  function renderHome() {
    var usingCustom = Ranges.isUsingCustomRanges();
    return (
      '<div class="screen">' +
      '<div class="hero">' +
      '<p class="eyebrow">Treino Pré-Flop</p>' +
      "<h1>Range Trainer</h1>" +
      '<p class="sub">Escolha um minigame para começar</p>' +
      "</div>" +
      '<div class="minigame-list">' +
      '<button class="minigame-card" data-action="go-config">' +
      '<div class="chip">OR</div>' +
      '<div class="minigame-info"><h3>RFI</h3><p>Duas cartas na mão: qual é a ação correta? All-in, Raise, Call ou Fold?</p></div>' +
      '<span class="arrow">→</span>' +
      "</button>" +
      '<a class="minigame-card" href="treino_showdown.html">' +
      '<div class="chip">SD</div>' +
      '<div class="minigame-info"><h3>Showdown</h3><p>Flop, depois o board completo e as mãos: quem venceu?</p></div>' +
      '<span class="arrow">→</span>' +
      "</a>" +
      '<div class="minigame-card disabled">' +
      '<div class="chip">3B</div>' +
      '<div class="minigame-info"><h3>3-Bet</h3><p>Em breve</p></div>' +
      "</div>" +
      "</div>" +
      '<div class="home-footer">' +
      '<button class="btn-secondary" data-action="go-stats">📊 Histórico</button>' +
      '<button class="btn-secondary" data-action="go-import">⚙️ Ranges</button>' +
      "</div>" +
      '<div class="range-status">Range ativo: <strong>' +
      (usingCustom ? "Personalizado (importado)" : "Padrão (embutido)") +
      "</strong></div>" +
      "</div>"
    );
  }

  /* ---------- Config ---------- */
  function renderConfig() {
    var html = '<div class="screen">';

    var tipos = Ranges.listTipos(state.rangesData);
    html +=
      '<p class="section-label">Você estuda Cash ou Torneio?</p><div class="option-list">';
    for (var t = 0; t < tipos.length; t++) {
      var tipo = tipos[t];
      var tsel = state.selectedTipo === tipo;
      html +=
        '<label class="option-row' +
        (tsel ? " selected" : "") +
        '">' +
        '<input type="radio" name="tipo" value="' +
        esc(tipo) +
        '" data-action="select-tipo" ' +
        (tsel ? "checked" : "") +
        ">" +
        '<span class="radio-dot"></span>' +
        '<span class="option-text"><div class="t1">' +
        esc(Ranges.tipoLabel(tipo)) +
        "</div></span>" +
        "</label>";
    }
    html += "</div>";

    if (state.selectedTipo) {
      var blinds = Ranges.blindsByTipo(state.rangesData, state.selectedTipo);
      html +=
        '<p class="section-label">Níveis de blind <span style="text-transform:none;letter-spacing:0">(marque mais de um para misturar)</span></p>';
      html +=
        '<div class="select-toggle-row"><button class="link-btn" data-action="toggle-all-blinds">' +
        (blinds.length > 0 &&
        blinds.every(function (b) {
          return state.selectedBlindIds.indexOf(b.id) !== -1;
        })
          ? "Limpar seleção"
          : "Selecionar todos (8 a 100bb)") +
        "</button></div>";
      html += '<div class="option-list">';
      for (var i = 0; i < blinds.length; i++) {
        var b = blinds[i];
        var sel = state.selectedBlindIds.indexOf(b.id) !== -1;
        var expanded = state.expandedBlindId === b.id;
        html +=
          '<div class="blind-option-wrapper">' +
          '<label class="option-row' +
          (sel ? " selected" : "") +
          '">' +
          '<input type="checkbox" value="' +
          esc(b.id) +
          '" data-action="toggle-blind" ' +
          (sel ? "checked" : "") +
          ">" +
          '<span class="check-box"></span>' +
          '<span class="option-text"><div class="t1">' +
          esc(b.nome) +
          "</div>" +
          (b.descricao
            ? '<div class="t2">' + esc(b.descricao) + "</div>"
            : "") +
          "</span>" +
          '<button class="info-btn" data-action="toggle-blind-info" data-blind-id="' +
          esc(b.id) +
          '" type="button">i</button>' +
          "</label>";

        if (expanded && (b.why || b.todo || b.nottodo)) {
          html +=
            '<div class="blind-info-panel">' +
            (b.why
              ? '<div class="info-section"><strong>Por quê?</strong><p>' +
                esc(b.why) +
                "</p></div>"
              : "") +
            (b.todo
              ? '<div class="info-section"><strong>O que fazer:</strong><ul>' +
                b.todo
                  .map(function (t) {
                    return "<li>" + esc(t) + "</li>";
                  })
                  .join("") +
                "</ul></div>"
              : "") +
            (b.nottodo
              ? '<div class="info-section"><strong>O que não fazer:</strong><ul>' +
                b.nottodo
                  .map(function (t) {
                    return "<li>" + esc(t) + "</li>";
                  })
                  .join("") +
                "</ul></div>"
              : "") +
            "</div>";
        }

        html += "</div>";
      }
      html += "</div>";
    }

    if (state.selectedBlindIds.length > 0) {
      var positions = unionPositions(selectedBlinds());
      html += '<p class="section-label">Posições a treinar</p>';
      html +=
        '<div class="select-toggle-row"><button class="link-btn" data-action="toggle-all-positions">' +
        (state.selectedPositions.length === positions.length
          ? "Limpar seleção"
          : "Selecionar todas") +
        "</button></div>";
      html += '<div class="position-grid">';
      for (var j = 0; j < positions.length; j++) {
        var p = positions[j];
        var psel = state.selectedPositions.indexOf(p) !== -1;
        html +=
          '<label class="position-pill' +
          (psel ? " selected" : "") +
          '">' +
          '<input type="checkbox" value="' +
          esc(p) +
          '" data-action="toggle-position" ' +
          (psel ? "checked" : "") +
          ">" +
          '<span class="check-box"></span><span>' +
          esc(Ranges.posLabel(p)) +
          "</span>" +
          "</label>";
      }
      html += "</div>";

      html += '<p class="section-label">Modo rápido</p>';
      html +=
        '<label class="option-row speed-toggle-row' +
        (state.speedMode ? " selected" : "") +
        '">' +
        '<input type="checkbox" data-action="toggle-speed-mode" ' +
        (state.speedMode ? "checked" : "") +
        ">" +
        '<span class="check-box"></span>' +
        '<span class="option-text"><div class="t1">⚡ Sem pausa entre mãos</div>' +
        '<div class="t2">Avança direto pra próxima mão ao responder. Mostra só acertos, erros e sequência (streak).</div></span>' +
        "</label>";
      if (state.bestStreak > 0) {
        html +=
          '<div class="range-status">🏆 Melhor sequência: <strong>' +
          state.bestStreak +
          "</strong></div>";
      }
    }

    html += '<div class="spacer"></div>';
    var canStart =
      state.selectedBlindIds.length > 0 && state.selectedPositions.length > 0;
    html +=
      '<button class="btn-primary" data-action="start-session" ' +
      (canStart ? "" : "disabled") +
      ">Iniciar treino</button>";

    if (state.importMessage) {
      html +=
        '<div class="toast ' +
        state.importMessage.type +
        '">' +
        esc(state.importMessage.text) +
        "</div>";
      state.importMessage = null;
    }

    html +=
      '<div class="home-footer">' +
      '<button class="btn-secondary" data-action="go-stats">📊 Histórico</button>' +
      '<button class="btn-secondary" data-action="go-import">⚙️ Ranges</button>' +
      '<button class="btn-secondary" data-action="export-fsrs" title="Exportar FSRS">⬆️</button>' +
      '<button class="btn-secondary" data-action="import-fsrs" title="Importar FSRS">⬇️</button>' +
      '<button class="btn-secondary" data-action="go-home">← Menu</button>' +
      "</div>";
    html += '<input type="file" id="fsrs-file-input" accept=".json,application/json" style="display:none">';
    html += "</div>";
    return html;
  }

  /* ---------- Game ---------- */
  function renderGame() {
    var round = state.currentRound;
    var html = '<div class="screen">';
    var errors = state.session.total - state.session.correct;
    html +=
      '<div class="game-status">' +
      '<span class="tag">' +
      esc(round.blindNome) +
      "</span>" +
      '<span class="score-badge">' +
      (state.session.total
        ? '  <span class="percentage">' +
          pct(state.session.correct, state.session.total) +
          "%</span>"
        : "") +
      (state.session.total
        ? ' · <span class="correct-count">✓ ' +
          state.session.correct +
          '</span> <span class="error-count">✗ ' +
          errors +
          "</span>"
        : "") +
      (state.speedMode
        ? ' · <span class="streak-badge">🔥 ' +
          state.streak +
          '</span> <span class="best-streak-badge">🏆 ' +
          state.bestStreak +
          "</span>"
        : "") +
      "</span>" +
      (state.speedMode
        ? '<button class="back-hand-btn" data-action="show-prev-hand" ' +
          (state.previousRound ? "" : "disabled") +
          ">↩ Última mão</button>"
        : "") +
      "</div>";

    var blindsInfo = round.effectiveBB || "";

    html += '<div class="game-center">';
    html +=
      '<div class="ask-block">' +
      Table.render(round.position, blindsInfo) +
      "<h2>" +
      esc(Ranges.posLabel(round.position)) +
      "</h2>" +
      "</div>";

    if (blindsInfo) {
      html += '<div class="blinds-effective">' + blindsInfo + " efetivos</div>";
    }

    html +=
      '<div class="cards-row">' +
      UI.renderCard(round.c1) +
      UI.renderCard(round.c2) +
      "</div>";

    html +=
      '<button class="range-grid-toggle-btn" data-action="toggle-range-grid">' +
      (state.showRangeGrid ? "🙈 Esconder tabela de range" : "📊 Ver tabela de range") +
      "</button>";

    var autoShowGrid = !!(state.lastResult && !state.lastResult.correct);
    if (state.showRangeGrid && !autoShowGrid) {
      html += renderRangeGrid(state.rangesData, round);
    }

    if (!state.lastResult) {
      html +=
        '<div class="answer-row action-buttons">' +
        '<button class="answer-btn fold" data-action="answer" data-answer="fold">Fold</button>' +
        '<button class="answer-btn call" data-action="answer" data-answer="call">Call</button>' +
        '<button class="answer-btn raise" data-action="answer" data-answer="raise">Raise</button>' +
        '<button class="answer-btn allin" data-action="answer" data-answer="allin">All-in</button>' +
        "</div>";
    } else {
      var r = state.lastResult;
      var actionLabel =
        { allin: "All-in", raise: "Raise", call: "Call", fold: "Fold" }[
          r.correctAnswer
        ] || r.correctAnswer;
      html +=
        '<div class="feedback-panel ' +
        (r.correct ? "correct" : "wrong") +
        '">' +
        '<div class="fb-title">' +
        (r.correct ? "✅ Correto!" : "❌ Errado") +
        "</div>" +
        '<div class="fb-detail">Mão: <b>' +
        esc(r.handClass) +
        "</b> · Ação correta: <b>" +
        actionLabel +
        "</b></div>" +
        "</div>";
      if (!r.correct) {
        html += renderRangeGrid(state.rangesData, round);
      }
      html +=
        '<button class="btn-primary" style="margin-top:0" data-action="next-hand">Próxima mão →</button>';
    }
    html += "</div>";

    html +=
      '<div class="end-session-link"><button data-action="end-session">Encerrar sessão</button></div>';

    if (state.speedMode && state.showPrevHand && state.previousRound) {
      html += renderPrevHandModal(state.previousRound);
    }

    html += "</div>";
    return html;
  }

  function renderPrevHandModal(prev) {
    var actionLabel =
      { allin: "All-in", raise: "Raise", call: "Call", fold: "Fold" }[
        prev.correctAnswer
      ] || prev.correctAnswer;
    var userLabel =
      { allin: "All-in", raise: "Raise", call: "Call", fold: "Fold" }[
        prev.userAnswer
      ] || prev.userAnswer;
    return (
      '<div class="modal-overlay">' +
      '<div class="modal-card">' +
      '<div class="modal-title">Última mão</div>' +
      '<div class="tag" style="margin-bottom:10px;display:inline-block">' +
      esc(prev.blindNome) +
      " · " +
      esc(Ranges.posLabel(prev.position)) +
      "</div>" +
      '<div class="cards-row">' +
      UI.renderCard(prev.c1) +
      UI.renderCard(prev.c2) +
      "</div>" +
      '<div class="fb-detail" style="margin-top:12px">Mão: <b>' +
      esc(prev.handClass) +
      "</b> · Ação correta: <b>" +
      actionLabel +
      "</b></div>" +
      '<div class="fb-detail">Sua resposta: <b>' +
      userLabel +
      "</b> " +
      (prev.correct ? "✅" : "❌") +
      "</div>" +
      '<button class="btn-primary" style="margin-top:14px" data-action="close-prev-hand">Fechar</button>' +
      "</div>" +
      "</div>"
    );
  }

  /* ---------- Stats ---------- */
  function renderStats() {
    var html = '<div class="screen">';
    html +=
      '<div class="hero">' +
      '<p class="eyebrow">Histórico de Treino</p>' +
      "<h1>RFI</h1>" +
      "</div>";

    if (state.history.length === 0) {
      html +=
        '<div class="empty-state"><div class="big-icon">🃏</div>Você ainda não jogou nenhuma mão.<br>Comece um treino para ver suas estatísticas aqui.</div>';
      html += "</div>";
      return html;
    }

    var stats = computeStats(state.history);
    html +=
      '<div class="stat-hero">' +
      '<div class="big-num">' +
      pct(stats.overall.correct, stats.overall.total) +
      "%</div>" +
      '<div class="big-label">' +
      stats.overall.correct +
      " de " +
      stats.overall.total +
      " mãos corretas · Taxa geral</div>" +
      "</div>";

    html += '<p class="section-label">Por posição</p><div class="stat-table">';
    var posKeys = Object.keys(stats.byPosition).sort();
    for (var i = 0; i < posKeys.length; i++) {
      var k = posKeys[i],
        v = stats.byPosition[k],
        p = pct(v.correct, v.total);
      html +=
        '<div class="stat-row"><span class="label">' +
        esc(k) +
        "</span>" +
        '<div class="bar-track"><div class="bar-fill" style="width:' +
        p +
        '%"></div></div>' +
        '<span class="pct">' +
        p +
        "% (" +
        v.total +
        ")</span></div>";
    }
    html += "</div>";

    html +=
      '<p class="section-label">Por nível de blind</p><div class="stat-table">';
    var blindKeys = Object.keys(stats.byBlind).sort();
    for (var j = 0; j < blindKeys.length; j++) {
      var bk = blindKeys[j],
        bv = stats.byBlind[bk],
        bp = pct(bv.correct, bv.total);
      html +=
        '<div class="stat-row"><span class="label">' +
        esc(bk) +
        "</span>" +
        '<div class="bar-track"><div class="bar-fill" style="width:' +
        bp +
        '%"></div></div>' +
        '<span class="pct">' +
        bp +
        "% (" +
        bv.total +
        ")</span></div>";
    }
    html += "</div>";

    html +=
      '<details class="detail-block"><summary>Detalhamento completo (blind + posição)</summary><div class="stat-table" style="margin-top:8px">';
    var comboKeys = Object.keys(stats.byBlindPosition).sort();
    for (var m = 0; m < comboKeys.length; m++) {
      var ck = comboKeys[m],
        cv = stats.byBlindPosition[ck],
        cp = pct(cv.correct, cv.total);
      html +=
        '<div class="stat-row"><span class="label" style="width:auto;flex:1">' +
        esc(ck) +
        "</span>" +
        '<span class="pct">' +
        cp +
        "% (" +
        cv.total +
        ")</span></div>";
    }
    html += "</div></details>";

    html +=
      '<button class="btn-primary" data-action="go-daily-stats">📈 Progresso Diário</button>';
    html +=
      '<button class="danger-link" data-action="clear-history">Limpar histórico</button>';
    html +=
      '<div class="home-footer"><button class="btn-secondary" data-action="go-home">← Voltar ao Menu</button></div>';
    html += "</div>";
    return html;
  }

  /* ---------- Import ---------- */
  function renderImport() {
    var usingCustom = Ranges.isUsingCustomRanges();
    var html = '<div class="screen">';
    html +=
      '<div class="hero">' +
      '<p class="eyebrow">Configuração</p>' +
      "<h1>Ranges</h1>" +
      "</div>";
    html +=
      '<div class="info-box">Edite o arquivo <code>ranges_aberturas.json</code> com seus próprios ranges e importe abaixo. ' +
      'Formato esperado: <code>{"blinds":[{"id":"...","nome":"...","posicoes":{"UTG":["AA","AKs",...]}}]}</code>.</div>';

    html += '<p class="section-label">Range ativo</p>';
    html +=
      '<div class="option-row selected" style="margin-bottom:16px"><span class="option-text"><div class="t1">' +
      (usingCustom ? "Personalizado (importado)" : "Padrão (embutido no app)") +
      "</div></span></div>";

    html +=
      '<label class="file-input-btn">📂 Importar ranges_aberturas.json' +
      '<input type="file" accept="application/json,.json" id="file-input" style="display:none">' +
      "</label>";

    if (usingCustom) {
      html +=
        '<button class="danger-link" data-action="reset-default-ranges">Restaurar range padrão</button>';
    }

    if (state.importMessage) {
      html +=
        '<div class="toast ' +
        state.importMessage.type +
        '">' +
        esc(state.importMessage.text) +
        "</div>";
    }
    html +=
      '<div class="home-footer"><button class="btn-secondary" data-action="go-config">← Voltar</button></div>';
    html += "</div>";
    return html;
  }

  /* ================= Render principal ================= */
  function render() {
    var app = document.getElementById("app");
    var html;
    switch (state.screen) {
      case "config":
        html = renderConfig();
        break;
      case "game":
        html = renderGame();
        break;
      case "stats":
        html = renderStats();
        break;
      case "import":
        html = renderImport();
        break;
      case "daily-stats":
        html = DailyStatsGraph.render(state.dailyStats, state.dailyStatsFilterBlind, state.dailyStatsFilterPosition, Ranges, esc);
        break;
      default:
        html = renderHome();
    }
    app.innerHTML = html;
    if (state.screen === "daily-stats" && DailyStatsGraph) {
      DailyStatsGraph.afterRender(state.dailyStats, state.dailyStatsFilterBlind, state.dailyStatsFilterPosition);
    }
  }

  /* ================= Eventos ================= */
  document.getElementById("app").addEventListener("click", function (e) {
    var infoBtn = e.target.closest(".info-btn");
    if (infoBtn) {
      e.stopPropagation();
      e.preventDefault();
      var blindId = infoBtn.getAttribute("data-blind-id");
      state.expandedBlindId =
        state.expandedBlindId === blindId ? null : blindId;
      render();
      return;
    }

    var el = e.target.closest("[data-action]");
    if (!el) {
      return;
    }
    var action = el.getAttribute("data-action");

    if (action === "go-config") {
      state.screen = "config";
      render();
    } else if (action === "go-home") {
      window.location.href = "index.html";
    } else if (action === "go-stats") {
      state.screen = "stats";
      render();
    } else if (action === "go-import") {
      state.screen = "import";
      state.importMessage = null;
      render();
    } else if (action === "go-daily-stats") {
      state.screen = "daily-stats";
      render();
    } else if (action === "toggle-all-blinds") {
      var allBlinds = Ranges.blindsByTipo(state.rangesData, state.selectedTipo);
      var allSelected =
        allBlinds.length > 0 &&
        allBlinds.every(function (b) {
          return state.selectedBlindIds.indexOf(b.id) !== -1;
        });
      state.selectedBlindIds = allSelected
        ? []
        : allBlinds.map(function (b) {
            return b.id;
          });
      state.selectedPositions = unionPositions(selectedBlinds());
      render();
    } else if (action === "toggle-all-positions") {
      var positions = unionPositions(selectedBlinds());
      state.selectedPositions =
        state.selectedPositions.length === positions.length
          ? []
          : positions.slice();
      render();
    } else if (action === "start-session") {
      if (el.hasAttribute("disabled")) return;
      clearSpeedWrongTimer();
      state.session = { total: 0, correct: 0 };
      state.streak = 0;
      state.previousRound = null;
      state.showPrevHand = false;
      dealNewHand();
      state.screen = "game";
      render();
    } else if (action === "answer") {
      handleAnswer(el.getAttribute("data-answer"));
    } else if (action === "next-hand") {
      clearSpeedWrongTimer();
      dealNewHand();
      render();
    } else if (action === "toggle-range-grid") {
      state.showRangeGrid = !state.showRangeGrid;
      render();
    } else if (action === "show-prev-hand") {
      if (el.hasAttribute("disabled")) return;
      state.showPrevHand = true;
      render();
    } else if (action === "close-prev-hand") {
      state.showPrevHand = false;
      render();
    } else if (action === "end-session") {
      clearSpeedWrongTimer();
      // Atualiza stats diários após sessão
      state.dailyStats = computeDailyStats(state.history);
      state.screen = "config";
      render();
    } else if (action === "clear-history") {
      if (confirm("Tem certeza que deseja apagar todo o histórico?")) {
        state.history = [];
        Storage.remove(HISTORY_STORAGE_KEY);
        render();
      }
    } else if (action === "reset-default-ranges") {
      Ranges.resetToDefault();
      state.rangesData = window.RT_DEFAULT_RANGES;
      state.selectedTipo = null;
      state.selectedBlindIds = [];
      state.selectedPositions = [];
      state.importMessage = {
        type: "success",
        text: "Range padrão restaurado.",
      };
      render();
    } else if (action === "export-fsrs") {
      // Exporta FSRS + metadata + stats diários
      var fsrsData = {
        version: 1,
        exported: new Date().toISOString(),
        roundsPlayed: state.roundsPlayed,
        bestStreak: state.bestStreak,
        fsrsMap: state.fsrsMap,
        dailyStats: state.dailyStats,
      };
      var dataStr = JSON.stringify(fsrsData, null, 2);
      var dataBlob = new Blob([dataStr], { type: "application/json" });
      var url = URL.createObjectURL(dataBlob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "fsrs_backup_" + new Date().toISOString().split('T')[0] + ".json";
      link.click();
      URL.revokeObjectURL(url);
    } else if (action === "import-fsrs") {
      // Clica no input file hidden pra importar
      var fileInput = document.getElementById("fsrs-file-input");
      if (fileInput) fileInput.click();
    }
  });

  // Handler para input file de FSRS
  document.addEventListener("change", function (e) {
    if (e.target.id === "fsrs-file-input") {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var parsed = JSON.parse(ev.target.result);

          // Tenta extrair dados do arquivo de backup
          var fsrsData = parsed.fsrsMap || parsed;
          var importedRoundsPlayed = parsed.roundsPlayed || 0;
          var importedBestStreak = parsed.bestStreak || 0;
          var importedDailyStats = parsed.dailyStats || [];

          // Valida que é um objeto válido
          if (typeof fsrsData !== 'object' || fsrsData === null) {
            alert('Erro: JSON inválido. Esperado um objeto com dados FSRS.');
            return;
          }

          // Carrega para o state e localStorage
          state.fsrsMap = fsrsData;
          state.roundsPlayed = importedRoundsPlayed;
          state.bestStreak = importedBestStreak;
          state.dailyStats = importedDailyStats;
          saveFsrsMap(fsrsData);
          saveRoundCounter(importedRoundsPlayed);
          Storage.set(BEST_STREAK_KEY, String(importedBestStreak));

          state.importMessage = {
            type: "success",
            text: "FSRS importado! " + Object.keys(fsrsData).length + " cartas, round " + importedRoundsPlayed + ", streak " + importedBestStreak + ", " + importedDailyStats.length + " dias de histórico",
          };
          render();

          // Reset do input
          e.target.value = '';
        } catch (err) {
          alert('Erro ao ler arquivo: ' + err.message);
          e.target.value = '';
        }
      };
      reader.readAsText(file);
    }
  });

  document.getElementById("app").addEventListener("change", function (e) {
    var el = e.target;
    var action = el.getAttribute("data-action");

    if (action === "select-tipo") {
      state.selectedTipo = el.value;
      state.selectedBlindIds = [];
      state.selectedPositions = [];
      render();
    } else if (action === "toggle-blind") {
      var id = el.value;
      var idx = state.selectedBlindIds.indexOf(id);
      if (idx === -1) state.selectedBlindIds.push(id);
      else state.selectedBlindIds.splice(idx, 1);
      state.selectedPositions = unionPositions(selectedBlinds());
      render();
    } else if (action === "toggle-position") {
      var pos = el.value;
      var idx = state.selectedPositions.indexOf(pos);
      if (idx === -1) state.selectedPositions.push(pos);
      else state.selectedPositions.splice(idx, 1);
      render();
    } else if (action === "filter-blind") {
      state.dailyStatsFilterBlind = el.value || null;
      render();
      if (DailyStatsGraph) DailyStatsGraph.afterRender(state.dailyStats, state.dailyStatsFilterBlind, state.dailyStatsFilterPosition);
    } else if (action === "filter-position") {
      state.dailyStatsFilterPosition = el.value || null;
      render();
      if (DailyStatsGraph) DailyStatsGraph.afterRender(state.dailyStats, state.dailyStatsFilterBlind, state.dailyStatsFilterPosition);
    } else if (action === "toggle-speed-mode") {
      state.speedMode = el.checked;
      render();
    } else if (el.id === "file-input") {
      var file = el.files && el.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var parsed = JSON.parse(ev.target.result);
          if (!parsed || !Array.isArray(parsed.blinds) || !parsed.blinds.length)
            throw new Error('Estrutura inválida: esperado {"blinds":[...]}.');
          for (var i = 0; i < parsed.blinds.length; i++) {
            var b = parsed.blinds[i];
            if (
              !b.id ||
              !b.nome ||
              !b.posicoes ||
              typeof b.posicoes !== "object"
            )
              throw new Error("Cada blind precisa de id, nome e posicoes.");
          }
          Ranges.saveCustomRanges(parsed);
          state.rangesData = parsed;
          state.selectedTipo = null;
          state.selectedBlindIds = [];
          state.selectedPositions = [];

          var okText =
            "Range importado! " +
            parsed.blinds.length +
            " nível(is) de blind carregado(s).";
          var duplicates = Ranges.findDuplicateHands(parsed);
          if (duplicates.length > 0) {
            state.importMessage = {
              type: "warning",
              text: okText + " " + formatDuplicatesWarning(duplicates),
            };
          } else {
            state.importMessage = { type: "success", text: okText };
          }
        } catch (err) {
          state.importMessage = {
            type: "error",
            text: "Erro ao importar: " + err.message,
          };
        }
        render();
      };
      reader.onerror = function () {
        state.importMessage = {
          type: "error",
          text: "Não foi possível ler o arquivo.",
        };
        render();
      };
      reader.readAsText(file, "UTF-8");
    }
  });

  render();
})();
