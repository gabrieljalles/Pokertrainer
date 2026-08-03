/* Renderiza gráfico de histórico diário com Chart.js */
(function () {
  "use strict";

  window.DailyStatsGraph = {
    render: function (dailyStats, filterBlind, filterPosition, Ranges, esc) {
      var html = '<div class="screen">';
      html += '<div class="hero">' +
        '<p class="eyebrow">Análise</p>' +
        '<h1>Progresso Diário</h1>' +
        '</div>';

      // Filtros
      html += '<div class="daily-filters">' +
        '<div><label>Blind:</label><select id="filter-blind" data-action="filter-blind">' +
        '<option value="">Todos</option>';

      var blinds = new Set();
      for (var i = 0; i < dailyStats.length; i++) {
        blinds.add(dailyStats[i].blind);
      }
      blinds.forEach(function (b) {
        html += '<option value="' + esc(b) + '" ' + (filterBlind === b ? 'selected' : '') + '>' + esc(b) + '</option>';
      });

      html += '</select></div>' +
        '<div><label>Posição:</label><select id="filter-position" data-action="filter-position">' +
        '<option value="">Todas</option>';

      var positions = new Set();
      for (var i = 0; i < dailyStats.length; i++) {
        positions.add(dailyStats[i].position);
      }
      positions.forEach(function (p) {
        html += '<option value="' + esc(p) + '" ' + (filterPosition === p ? 'selected' : '') + '>' + esc(Ranges.posLabel(p)) + '</option>';
      });

      html += '</select></div></div>';

      // Canvas pra Chart.js
      html += '<div class="chart-container"><canvas id="daily-chart"></canvas></div>';

      html += '<div class="home-footer"><button class="btn-secondary" data-action="go-stats">← Voltar</button></div>';
      html += '</div>';

      return html;
    },

    afterRender: function (dailyStats, filterBlind, filterPosition) {
      setTimeout(function () {
        var canvas = document.getElementById('daily-chart');
        if (!canvas) return;

        // Filtra dados
        var filtered = dailyStats.filter(function (d) {
          var blindMatch = !filterBlind || d.blind === filterBlind;
          var posMatch = !filterPosition || d.position === filterPosition;
          return blindMatch && posMatch;
        });

        if (filtered.length === 0) {
          canvas.parentElement.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Sem dados para o filtro selecionado</p>';
          return;
        }

        // Agrupa por data pra cada série
        var seriesMap = {};
        for (var i = 0; i < filtered.length; i++) {
          var d = filtered[i];
          var key = (!filterBlind && !filterPosition) ? (d.blind + ' • ' + d.position) : (filterBlind ? d.position : d.blind);
          if (!seriesMap[key]) {
            seriesMap[key] = [];
          }
          seriesMap[key].push(d);
        }

        var labels = [];
        var dates = new Set();
        filtered.forEach(function (d) { dates.add(d.date); });
        labels = Array.from(dates).sort();

        var datasets = [];
        var colors = ['#3498DB', '#E74C3C', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E'];
        var colorIdx = 0;

        Object.keys(seriesMap).forEach(function (key) {
          var series = seriesMap[key];
          var data = [];
          for (var i = 0; i < labels.length; i++) {
            var s = series.find(function (x) { return x.date === labels[i]; });
            data.push(s ? s.accuracy : null);
          }

          datasets.push({
            label: key,
            data: data,
            borderColor: colors[colorIdx % colors.length],
            backgroundColor: 'rgba(' + hexToRgb(colors[colorIdx % colors.length]).join(',') + ', 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            pointRadius: 5,
            pointHoverRadius: 7,
          });
          colorIdx++;
        });

        new Chart(canvas, {
          type: 'line',
          data: {
            labels: labels,
            datasets: datasets
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { position: 'top' },
              tooltip: {
                callbacks: {
                  afterLabel: function (context) {
                    var date = context.label;
                    var key = context.dataset.label;
                    var series = seriesMap[key];
                    var d = series.find(function (x) { return x.date === date; });
                    return d ? d.correct + '/' + d.attempts + ' tentativas' : '';
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                title: { display: true, text: 'Acertos (%)' }
              }
            }
          }
        });
      }, 0);
    }
  };

  function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [0, 0, 0];
  }
})();
