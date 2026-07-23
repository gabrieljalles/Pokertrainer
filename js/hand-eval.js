/* RT.handEval — avaliador de mãos de poker (melhor combinação de 5 entre 7
   cartas: 2 na mão + 5 comunitárias). Reutilizável por qualquer minigame que
   precise comparar mãos de showdown. Depende apenas do formato de carta
   { rank, suit } usado em RT.cards. */
window.RT = window.RT || {};

RT.handEval = (function () {
  "use strict";

  var VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  var CATEGORY_NAMES = [
    'Carta alta', 'Par', 'Dois pares', 'Trinca', 'Sequência',
    'Flush', 'Full house', 'Quadra', 'Straight flush'
  ];

  /* Combinações C(7,5): todos os subconjuntos de 5 índices entre 0..6. */
  var COMBOS_7_5 = (function () {
    var out = [];
    for (var a = 0; a < 7; a++)
      for (var b = a + 1; b < 7; b++)
        for (var c = b + 1; c < 7; c++)
          for (var d = c + 1; d < 7; d++)
            for (var e = d + 1; e < 7; e++)
              out.push([a, b, c, d, e]);
    return out;
  })();

  function evaluate5(cards) {
    var values = cards.map(function (c) { return VALUES[c.rank]; }).sort(function (a, b) { return b - a; });
    var suits = cards.map(function (c) { return c.suit; });
    var isFlush = suits.every(function (s) { return s === suits[0]; });

    var counts = {};
    values.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
    var groups = Object.keys(counts).map(function (k) { return { v: Number(k), c: counts[k] }; });
    groups.sort(function (a, b) { return b.c !== a.c ? b.c - a.c : b.v - a.v; });

    var uniqVals = values.filter(function (v, i) { return values.indexOf(v) === i; });
    var straightHigh = null;
    if (uniqVals.length === 5) {
      if (uniqVals[0] - uniqVals[4] === 4) straightHigh = uniqVals[0];
      else if (uniqVals.join(',') === '14,5,4,3,2') straightHigh = 5; /* A-2-3-4-5 */
    }
    var isStraight = straightHigh !== null;

    var category, kickers;
    if (isStraight && isFlush) { category = 8; kickers = [straightHigh]; }
    else if (groups[0].c === 4) { category = 7; kickers = [groups[0].v, groups[1].v]; }
    else if (groups[0].c === 3 && groups[1] && groups[1].c === 2) { category = 6; kickers = [groups[0].v, groups[1].v]; }
    else if (isFlush) { category = 5; kickers = values.slice(); }
    else if (isStraight) { category = 4; kickers = [straightHigh]; }
    else if (groups[0].c === 3) { category = 3; kickers = [groups[0].v].concat(groups.slice(1).map(function (g) { return g.v; })); }
    else if (groups[0].c === 2 && groups[1] && groups[1].c === 2) { category = 2; kickers = [groups[0].v, groups[1].v, groups[2].v]; }
    else if (groups[0].c === 2) { category = 1; kickers = [groups[0].v].concat(groups.slice(1).map(function (g) { return g.v; })); }
    else { category = 0; kickers = values.slice(); }

    var score = [category].concat(kickers);
    while (score.length < 6) score.push(0);
    return score;
  }

  function compareScore(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  function evaluateBest7(cards7) {
    var best = null;
    for (var i = 0; i < COMBOS_7_5.length; i++) {
      var combo = COMBOS_7_5[i].map(function (idx) { return cards7[idx]; });
      var score = evaluate5(combo);
      if (!best || compareScore(score, best) > 0) best = score;
    }
    return best;
  }

  function evaluateBest7WithCards(cards7) {
    var best = null;
    var bestCombo = null;
    for (var i = 0; i < COMBOS_7_5.length; i++) {
      var combo = COMBOS_7_5[i].map(function (idx) { return cards7[idx]; });
      var score = evaluate5(combo);
      if (!best || compareScore(score, best) > 0) {
        best = score;
        bestCombo = COMBOS_7_5[i];
      }
    }
    return { score: best, cardIndices: bestCombo };
  }

  function categoryName(score) { return CATEGORY_NAMES[score[0]]; }

  return {
    evaluate5: evaluate5,
    evaluateBest7: evaluateBest7,
    evaluateBest7WithCards: evaluateBest7WithCards,
    compareScore: compareScore,
    categoryName: categoryName
  };
})();
