/* RT.pokerTable — desenha uma mesa de poker de 9 lugares e destaca o assento
   correspondente à posição em jogo. Reutilizável por qualquer minigame.
   Não depende de outros módulos RT. */
window.RT = window.RT || {};

RT.pokerTable = (function () {
  "use strict";

  /* Layout fixo de 9 lugares (sentido horário, BTN embaixo ao centro). */
  var SEATS = ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO'];

  /* Ranges 6-max não usam todos os 9 assentos: MP (posição do meio) ocupa
     visualmente o assento do Hijack. */
  var SEAT_ALIAS = { MP: 'HJ' };

  function seatCoords(index, total, rotationOffset) {
    rotationOffset = rotationOffset || 0;
    var angle = (Math.PI * 2 / total) * index - Math.PI / 2;
    var x = 50 + 44 * Math.cos(angle);
    var y = 50 + 40 * Math.sin(angle);
    return { x: x, y: y };
  }

  function render(activePosition, blindsInfo) {
    var activeSeat = SEAT_ALIAS[activePosition] || activePosition;
    var html = '<div class="poker-table"><div class="poker-felt"></div>';
    for (var i = 0; i < SEATS.length; i++) {
      var seatCode = SEATS[i];
      var isActive = seatCode === activeSeat;
      var coords = seatCoords(i, SEATS.length);
      var label = isActive ? activePosition : seatCode;
      html += '<div class="poker-seat' + (isActive ? ' active' : ' inactive') +
        '" style="left:' + coords.x.toFixed(2) + '%;top:' + coords.y.toFixed(2) + '%">' +
        '<span>' + label + '</span></div>';
    }

    var sbCoords = seatCoords(SEATS.indexOf('SB'), SEATS.length);
    var bbCoords = seatCoords(SEATS.indexOf('BB'), SEATS.length);

    var sbX = 50 + (sbCoords.x - 50) * 0.4;
    var sbY = 50 + (sbCoords.y - 50) * 0.4;
    var bbX = 50 + (bbCoords.x - 50) * 0.4;
    var bbY = 50 + (bbCoords.y - 50) * 0.4;

    html += '<div class="blind-chip sb-chip" style="left:' + sbX.toFixed(2) + '%;top:' + sbY.toFixed(2) + '%">' +
      '<span class="chip-value">0.5</span></div>';
    html += '<div class="blind-chip bb-chip" style="left:' + bbX.toFixed(2) + '%;top:' + bbY.toFixed(2) + '%">' +
      '<span class="chip-value">1</span></div>';

    html += '</div>';
    return html;
  }

  return { render: render };
})();
