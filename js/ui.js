/* RT.ui — pequenos helpers de renderização compartilhados entre minigames.
   Depende de RT.cards (js/cards.js) já ter sido carregado antes deste arquivo. */
window.RT = window.RT || {};

RT.ui = (function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function pct(part, total) { return total > 0 ? Math.round((part / total) * 100) : 0; }

  function renderCard(card) {
    var isRed = card.suit === '♥' || card.suit === '♦';
    var rd = RT.cards.rankDisplay(card.rank);
    return '<div class="card ' + (isRed ? 'red' : '') + '">' +
      '<span class="rank rank-tl">' + rd + '</span>' +
      '<span class="suit-big">' + card.suit + '</span>' +
      '<span class="rank rank-br">' + rd + '</span>' +
      '</div>';
  }

  function topbar(title, backAction) {
    return '<div class="topbar">' +
      '<button class="back-btn" data-action="' + backAction + '">←</button>' +
      '<h2>' + esc(title) + '</h2>' +
      '</div>';
  }

  return { esc: esc, pct: pct, renderCard: renderCard, topbar: topbar };
})();
