/* RT.ranges — carregamento/consulta de ranges de posição (blinds, posições, mãos).
   Depende de RT.storage (js/storage.js) já ter sido carregado antes deste arquivo. */
window.RT = window.RT || {};

RT.ranges = (function () {
  "use strict";
  var STORAGE_KEY = 'rt_custom_ranges_v1';

  var POSITION_LABELS = {
    UTG: 'UTG · Primeira posição', UTG1: 'UTG+1', LJ: 'LJ · Lojack',
    MP: 'MP · Meio', HJ: 'HJ · Hijack', CO: 'CO · Cutoff',
    BTN: 'BTN · Button', SB: 'SB · Small Blind', BB: 'BB · Big Blind'
  };
  function posLabel(code) { return POSITION_LABELS[code] || code; }

  var TIPO_LABELS = { cash: 'Cash', torneio: 'Torneio' };
  function tipoLabel(code) { return TIPO_LABELS[code] || code; }
  function blindTipo(blind) { return blind.tipo || 'cash'; }

  function listTipos(rangesData) {
    var seen = {}, out = [];
    for (var i = 0; i < rangesData.blinds.length; i++) {
      var t = blindTipo(rangesData.blinds[i]);
      if (!seen[t]) { seen[t] = true; out.push(t); }
    }
    return out;
  }

  function blindsByTipo(rangesData, tipo) {
    return rangesData.blinds.filter(function (b) { return blindTipo(b) === tipo; });
  }

  function loadRangesData(defaultRanges) {
    var custom = RT.storage.get(STORAGE_KEY);
    if (custom) {
      try {
        var parsed = JSON.parse(custom);
        if (parsed && Array.isArray(parsed.blinds) && parsed.blinds.length) return parsed;
      } catch (e) {}
    }
    return defaultRanges;
  }

  function isUsingCustomRanges() {
    return !!RT.storage.get(STORAGE_KEY);
  }

  function saveCustomRanges(parsed) {
    RT.storage.set(STORAGE_KEY, JSON.stringify(parsed));
  }

  function resetToDefault() {
    RT.storage.remove(STORAGE_KEY);
  }

  function findBlind(rangesData, blindId) {
    for (var i = 0; i < rangesData.blinds.length; i++) {
      if (rangesData.blinds[i].id === blindId) return rangesData.blinds[i];
    }
    return null;
  }

  function isInRange(rangesData, blindId, position, handClass) {
    var blind = findBlind(rangesData, blindId);
    if (!blind || !blind.posicoes[position]) return false;
    return blind.posicoes[position].indexOf(handClass) !== -1;
  }

  /* ---------- Validação: mãos duplicadas entre ranges ---------- */
  var RANGE_FIELDS = ['fold_range', 'call_range', 'raise_range', 'allin_range', 'range'];
  var GAME_MODE_LABELS = {
    open_range: 'Open Raise', vs_openraise_range: 'vs Open Raise',
    vs_3bet_range: 'vs 3-Bet', vs_openshove_range: 'vs Open Shove'
  };
  function gameModeLabel(key) { return GAME_MODE_LABELS[key] || key; }

  /* Dentro de um mesmo blind + posição + modo de jogo, cada mão só deveria
     aparecer em UM dos ranges de ação (fold/call/raise/allin/...). Se
     aparecer em mais de um, a resposta correta fica ambígua — o usuário
     precisa ser avisado pra corrigir o JSON importado. */
  function findDuplicateHands(rangesData) {
    var duplicates = [];
    var blinds = (rangesData && rangesData.blinds) || [];
    for (var b = 0; b < blinds.length; b++) {
      var blind = blinds[b];
      var posicoes = blind.posicoes || {};
      var posKeys = Object.keys(posicoes);
      for (var p = 0; p < posKeys.length; p++) {
        var posKey = posKeys[p];
        var posEntry = posicoes[posKey];
        if (!posEntry || typeof posEntry !== 'object') continue;
        var gameModeKeys = Object.keys(posEntry);
        for (var g = 0; g < gameModeKeys.length; g++) {
          var gameModeKey = gameModeKeys[g];
          var posData = posEntry[gameModeKey];
          if (!posData || typeof posData !== 'object') continue;

          var handFields = {};
          for (var f = 0; f < RANGE_FIELDS.length; f++) {
            var field = RANGE_FIELDS[f];
            var arr = posData[field];
            if (!Array.isArray(arr)) continue;
            for (var h = 0; h < arr.length; h++) {
              var hand = arr[h];
              handFields[hand] = handFields[hand] || [];
              if (handFields[hand].indexOf(field) === -1) handFields[hand].push(field);
            }
          }

          var hands = Object.keys(handFields);
          for (var i = 0; i < hands.length; i++) {
            if (handFields[hands[i]].length > 1) {
              duplicates.push({
                blindId: blind.id,
                blindNome: blind.nome,
                position: posKey,
                gameMode: gameModeKey,
                handClass: hands[i],
                fields: handFields[hands[i]]
              });
            }
          }
        }
      }
    }
    return duplicates;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    posLabel: posLabel,
    tipoLabel: tipoLabel,
    blindTipo: blindTipo,
    listTipos: listTipos,
    blindsByTipo: blindsByTipo,
    loadRangesData: loadRangesData,
    isUsingCustomRanges: isUsingCustomRanges,
    saveCustomRanges: saveCustomRanges,
    resetToDefault: resetToDefault,
    findBlind: findBlind,
    isInRange: isInRange,
    gameModeLabel: gameModeLabel,
    findDuplicateHands: findDuplicateHands
  };
})();
