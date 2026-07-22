/* RT.cards — baralho, sorteio de mãos e classificação (ex: "AKs", "72o").
   Reutilizável por qualquer minigame que precise de cartas de poker. */
window.RT = window.RT || {};

RT.cards = (function () {
  "use strict";
  var RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  var SUITS = ['♠','♥','♦','♣'];

  function rankDisplay(r) { return r === 'T' ? '10' : r; }

  function buildDeck() {
    var deck = [];
    for (var i = 0; i < RANKS.length; i++) {
      for (var j = 0; j < SUITS.length; j++) deck.push({ rank: RANKS[i], suit: SUITS[j] });
    }
    return deck;
  }

  function dealTwoCards() {
    var deck = buildDeck();
    var i1 = Math.floor(Math.random() * deck.length);
    var i2 = Math.floor(Math.random() * deck.length);
    while (i2 === i1) i2 = Math.floor(Math.random() * deck.length);
    return [deck[i1], deck[i2]];
  }

  /* Baralho embaralhado (Fisher-Yates); usar .pop()/.splice() para distribuir
     cartas únicas (ex: várias mãos + board comunitário). */
  function newShuffledDeck() {
    var deck = buildDeck();
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
    }
    return deck;
  }

  function getHandClass(c1, c2) {
    if (c1.rank === c2.rank) return c1.rank + c2.rank;
    var idx1 = RANKS.indexOf(c1.rank), idx2 = RANKS.indexOf(c2.rank);
    var hi, lo;
    if (idx1 > idx2) { hi = c1; lo = c2; } else { hi = c2; lo = c1; }
    var suited = c1.suit === c2.suit;
    return hi.rank + lo.rank + (suited ? 's' : 'o');
  }

  return {
    RANKS: RANKS,
    SUITS: SUITS,
    rankDisplay: rankDisplay,
    buildDeck: buildDeck,
    dealTwoCards: dealTwoCards,
    newShuffledDeck: newShuffledDeck,
    getHandClass: getHandClass
  };
})();
