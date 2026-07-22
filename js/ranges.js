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
    isInRange: isInRange
  };
})();
