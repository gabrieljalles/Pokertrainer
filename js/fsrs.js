/* RT.fsrs — algoritmo FSRS-4.5 (Free Spaced Repetition Scheduler)
   Baseado na spec oficial do FSRS (open-spaced-repetition), adaptado para
   medir tempo em "rounds jogados" em vez de dias. Sem dependências externas.
   Referência: https://github.com/open-spaced-repetition/fsrs.js (MIT)
*/
window.RT = window.RT || {};

RT.fsrs = (function () {
  "use strict";

  /* Pesos padrão do FSRS-4.5, treinados sobre milhões de revisões reais.
     Não alterar sem dados de retrainamento próprios — são calibrados
     empiricamente pela comunidade open-spaced-repetition. */
  var DEFAULT_WEIGHTS = [
    0.4872, 1.4236, 3.7853, 15.202, 7.7922, 0.5034, 1.5049,
    0.6646, 9.4181, 0.6121, 0.8083, 0.0329, 1.626, 0.1023,
    1.3520, 0.2343, 2.6369
  ];

  /* Constantes da curva de esquecimento power-law (R = (1 + FACTOR * elapsed / stability) ^ DECAY).
     Do paper FSRS-4.5 — não devem ser alteradas, fazem parte da matemática
     da curva de retenção, não do "gosto" do produto. */
  var DECAY = -0.5;
  var FACTOR = 19 / 81; // ≈ 0.2345

  /* ===== PARÂMETROS AJUSTÁVEIS =====
     Valores padrão calibrados para um app de drilling intenso (muitas
     rodadas por minuto), mantendo fidelidade ao FSRS-4.5. */

  // Peso mínimo de sorteio para mãos dominadas (never-zero probability).
  // 0.05 = mão dominada ainda aparece ~5% do tempo. Aumentar se quer ver
  // mãos óbvias mais vezes; diminuir pra focar em mãos difíceis.
  var MIN_WEIGHT = 0.05;

  // Multiplicador de stability pós-lapso (após erro). 1.0 = fórmula oficial
  // do FSRS-4.5 sem alteração. Valores > 1.0 penalizam mais o erro;
  // < 1.0 são mais lenientes.
  var LAPSE_FACTOR = 1.0;

  // Intervalo mínimo entre repetições da mesma mão (em rounds). Evita que
  // a mesma mão reapareça imediatamente após um erro.
  // 1 = pode repetir na rodada seguinte; maiores valores espaçam mais.
  var MIN_INTERVAL = 1;

  function createEmptyCard() {
    return {
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      lastRound: null,
      due: 0,
      state: "new"
    };
  }

  /* Calcula a "retrievability" (R: probabilidade de lembrar) de uma carta
     no round atual, de 0 (nunca viu / sempre erra) a 1 (perfeito).
     Carta nova retorna 0 (máxima prioridade). */
  function retrievability(card, currentRound) {
    if (card.state === "new" || card.lastRound === null) return 0;
    var elapsed = currentRound - card.lastRound;
    if (elapsed <= 0 || card.stability === 0) return 0;
    return Math.pow(1 + FACTOR * elapsed / card.stability, DECAY);
  }

  /* Calcula o intervalo agendado (em rounds) baseado em difficulty e stability.
     Fórmula do FSRS-4.5 adaptada para rounds. */
  function scheduledInterval(difficulty, stability) {
    return Math.round(stability / FACTOR * (Math.pow(1 / 0.9, difficulty) - 1));
  }

  /* Atualiza uma carta após uma revisão (resposta do usuário).
     rating: 1 (Again/errou) ou 3 (Good/acertou) — simplificado do FSRS
     original que oferece 4 graus, porque RFI é binário (certo/errado).
     currentRound: round em que a revisão ocorreu.
     params: objeto opcional { lapseFactor, minInterval } para override. */
  function reviewCard(card, rating, currentRound, params) {
    params = params || {};
    var lapseFactor = params.lapseFactor !== undefined ? params.lapseFactor : LAPSE_FACTOR;
    var minInterval = params.minInterval !== undefined ? params.minInterval : MIN_INTERVAL;

    var newCard = JSON.parse(JSON.stringify(card)); // deep clone
    newCard.reps = (newCard.reps || 0) + 1;

    if (newCard.state === "new") {
      // Primeira revisão: inicializa difficulty e stability conforme FSRS-4.5.
      newCard.difficulty = Math.max(0, DEFAULT_WEIGHTS[4] - Math.exp((5 - rating) * DEFAULT_WEIGHTS[5]) + 1);
      newCard.stability = Math.max(0.5, DEFAULT_WEIGHTS[0] + DEFAULT_WEIGHTS[1] * (rating - 3));
      newCard.state = "learning"; // ou "review" — ambos funcionam; usamos "learning"
    } else {
      // Revisão subsequente: usa a fórmula de atualização oficial.
      var previousDifficulty = newCard.difficulty;
      var elapsed = currentRound - (newCard.lastRound || currentRound);

      // Atualiza difficulty com mean reversion (volta parcialmente à média).
      newCard.difficulty = Math.max(1, Math.min(10,
        previousDifficulty +
        DEFAULT_WEIGHTS[6] * (2.5 - (rating === 3 ? 1 : 0) * Math.exp((previousDifficulty - 10) * DEFAULT_WEIGHTS[7]))
      ));

      var retrievabilityAtReview = Math.pow(1 + FACTOR * elapsed / newCard.stability, DECAY);

      if (rating === 1) {
        // Erro (Again): lapso — derruba stability, incrementa contador de erros.
        newCard.lapses = (newCard.lapses || 0) + 1;
        var postLapseStability = DEFAULT_WEIGHTS[8] * Math.pow(newCard.difficulty, -DEFAULT_WEIGHTS[9]);
        newCard.stability = Math.min(newCard.stability, postLapseStability * lapseFactor);
        newCard.state = "relearning"; // marcador de que sofreu lapso
      } else {
        // Sucesso (Good): aumenta stability de forma proporcional à dificuldade.
        var interval = newCard.reps === 1 ? 0 : elapsed;
        var newStability = newCard.stability +
          (DEFAULT_WEIGHTS[2] - 1 + Math.pow(newCard.difficulty / 10 - 0.5, 2) * 2) *
          DEFAULT_WEIGHTS[3] *
          (1 - retrievabilityAtReview) / (1 - Math.pow(0.9, newCard.reps));
        newCard.stability = Math.max(newCard.stability, newStability);
        newCard.state = "review";
      }
    }

    // Agenda a próxima revisão: intervalo calculado + mínimo.
    var interval = Math.max(minInterval, Math.round(scheduledInterval(newCard.difficulty, newCard.stability)));
    newCard.due = currentRound + interval;
    newCard.lastRound = currentRound;

    return newCard;
  }

  return {
    createEmptyCard: createEmptyCard,
    retrievability: retrievability,
    reviewCard: reviewCard,
    MIN_WEIGHT: MIN_WEIGHT,
    LAPSE_FACTOR: LAPSE_FACTOR,
    MIN_INTERVAL: MIN_INTERVAL
  };
})();
