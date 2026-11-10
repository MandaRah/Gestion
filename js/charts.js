/* ==========================================================================
   charts.js — Graphiques (Chart.js)
   --------------------------------------------------------------------------
   Les graphiques lisent leurs couleurs dans les variables CSS du thème actif
   et utilisent toujours les données réelles. Si Chart.js n'est pas chargé
   (hors connexion), un message remplace le graphique.
   ========================================================================== */
'use strict';

const chartRegistry = new Map();

function isChartLibraryAvailable() {
  return typeof window.Chart === 'function';
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Couleurs des graphiques pour le thème courant. */
function getChartPalette() {
  return {
    income: cssVar('--series-income'),
    expense: cssVar('--series-expense'),
    savings: cssVar('--series-savings'),
    neutral: cssVar('--series-neutral'),
    other: cssVar('--series-other'),
    text: cssVar('--chart-text'),
    muted: cssVar('--chart-muted'),
    grid: cssVar('--chart-grid'),
    axis: cssVar('--chart-axis'),
    surface: cssVar('--surface'),
    tooltipBg: cssVar('--tooltip-bg'),
    tooltipText: cssVar('--tooltip-text'),
    critical: cssVar('--status-critical'),
  };
}

/** Transforme une couleur hexadécimale en rgba (zones remplies légères). */
function withAlpha(hex, alpha) {
  const value = sanitizeColor(hex, '#898781').slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function destroyChart(key) {
  const chart = chartRegistry.get(key);
  if (chart) {
    chart.destroy();
    chartRegistry.delete(key);
  }
}

function destroyAllCharts() {
  chartRegistry.forEach((chart) => chart.destroy());
  chartRegistry.clear();
}

function chartPlaceholder(iconName, message) {
  return html`<div class="chart-placeholder">${icon(iconName)}<p>${message}</p></div>`;
}

/** Configuration commune (police, couleurs, infobulles, axes discrets). */
function applyChartDefaults() {
  if (!isChartLibraryAvailable() || applyChartDefaults.done) return;
  Chart.defaults.font.family = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
  Chart.defaults.font.size = 12;
  applyChartDefaults.done = true;
}

function baseOptions(palette, { legend = true, currencyAxis = true, stacked = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: prefersReducedMotion() ? false : { duration: 450 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: legend,
        position: 'top',
        align: 'start',
        labels: {
          color: palette.text, usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16,
          sort: (a, b) => a.datasetIndex - b.datasetIndex,
        },
      },
      tooltip: {
        backgroundColor: palette.tooltipBg,
        titleColor: palette.tooltipText,
        bodyColor: palette.tooltipText,
        borderColor: palette.grid,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        usePointStyle: true,
        boxPadding: 4,
        itemSort: (a, b) => a.datasetIndex - b.datasetIndex,
        filter: (item) => item.raw !== null,
        callbacks: {
          label: (context) => `${context.dataset.label} : ${formatCurrency(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        stacked,
        grid: { display: false },
        border: { color: palette.axis },
        ticks: { color: palette.muted, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 },
      },
      y: {
        stacked,
        grid: { color: palette.grid, drawTicks: false },
        border: { display: false },
        ticks: {
          color: palette.muted,
          padding: 8,
          maxTicksLimit: 6,
          callback: (value) => (currencyAxis ? formatCurrency(value, null, { compact: true }) : value),
        },
      },
    },
  };
}

/**
 * Crée (ou recrée) un graphique dans un conteneur.
 * @param {string} key identifiant unique du graphique
 * @param {string} containerId id de l'élément conteneur
 * @param {Function} buildConfig fonction (palette) → configuration Chart.js
 * @param {{isEmpty?: boolean, emptyMessage?: string, ariaLabel?: string}} [options]
 */
function renderChart(key, containerId, buildConfig, { isEmpty = false, emptyMessage = 'Aucune donnée pour cette période.', ariaLabel = 'Graphique' } = {}) {
  destroyChart(key);
  const container = document.getElementById(containerId);
  if (!container) return null;
  if (isEmpty) {
    setHTML(container, chartPlaceholder('fa-chart-simple', emptyMessage));
    return null;
  }
  if (!isChartLibraryAvailable()) {
    setHTML(container, chartPlaceholder('fa-plug-circle-xmark', "Graphique indisponible : la bibliothèque Chart.js n'a pas pu être chargée (connexion Internet requise)."));
    return null;
  }
  applyChartDefaults();
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', ariaLabel);
  container.appendChild(canvas);
  try {
    const chart = new Chart(canvas, buildConfig(getChartPalette()));
    chartRegistry.set(key, chart);
    return chart;
  } catch (error) {
    console.error(error);
    setHTML(container, chartPlaceholder('fa-triangle-exclamation', "Le graphique n'a pas pu être affiché."));
    return null;
  }
}

/* --------------------------------------------------------------------------
   Configurations prêtes à l'emploi
   -------------------------------------------------------------------------- */

/** Barres revenus / dépenses + courbe d'épargne, sur un seul axe. */
function flowChartConfig(series, { showSavings = true } = {}) {
  return (palette) => {
    const dense = series.labels.length > 14;
    const datasets = [
      { type: 'bar', label: 'Revenus', data: series.income, backgroundColor: palette.income, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24, barPercentage: 0.8, categoryPercentage: 0.75, order: 2 },
      { type: 'bar', label: 'Dépenses', data: series.expenses, backgroundColor: palette.expense, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24, barPercentage: 0.8, categoryPercentage: 0.75, order: 3 },
    ];
    if (showSavings) {
      datasets.push({
        type: 'line', label: 'Épargne', data: series.savings, borderColor: palette.savings, backgroundColor: palette.savings,
        borderWidth: 2, tension: 0.3, cubicInterpolationMode: 'monotone', pointRadius: dense ? 0 : 4, pointHoverRadius: 5, pointBorderColor: palette.surface,
        pointBorderWidth: 2, borderCapStyle: 'round', borderJoinStyle: 'round', order: 1,
      });
    }
    return { type: 'bar', data: { labels: series.labels, datasets }, options: baseOptions(palette) };
  };
}

/** Anneau de répartition (5 segments maximum + « Autres »). */
function doughnutChartConfig(items, { maxSegments = 5 } = {}) {
  return (palette) => {
    const head = items.slice(0, maxSegments);
    const tail = items.slice(maxSegments);
    const labels = head.map((item) => item.name);
    const values = head.map((item) => item.amount);
    const colors = head.map((item) => item.color);
    if (tail.length) {
      labels.push(`Autres catégories (${tail.length})`);
      values.push(roundMoney(sumBy(tail, (item) => item.amount)));
      colors.push(palette.other);
    }
    const total = sumBy(values, (value) => value);
    return {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: palette.surface, borderWidth: 2, hoverOffset: 6 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: prefersReducedMotion() ? false : { duration: 450 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: palette.tooltipBg, titleColor: palette.tooltipText, bodyColor: palette.tooltipText,
            borderColor: palette.grid, borderWidth: 1, padding: 10, cornerRadius: 8,
            callbacks: {
              label: (context) => `${context.label} : ${formatCurrency(context.parsed)} (${formatPercent(total > 0 ? (context.parsed / total) * 100 : 0)})`,
            },
          },
        },
      },
    };
  };
}

/** Courbe(s) simple(s). datasets : [{ label, data, color, fill }] */
function lineChartConfig(labels, datasets, { legend = true, thresholds = [] } = {}) {
  return (palette) => {
    const dense = labels.length > 14;
    const chartDatasets = datasets.map((dataset) => {
      const color = palette[dataset.color] || dataset.color;
      return {
        type: 'line', label: dataset.label, data: dataset.data, borderColor: color, backgroundColor: dataset.fill ? withAlpha(color, 0.1) : color,
        fill: dataset.fill ? 'origin' : false, borderWidth: 2, tension: 0.3, cubicInterpolationMode: 'monotone', pointRadius: dense ? 0 : 4, pointHoverRadius: 5,
        pointBackgroundColor: color, pointBorderColor: palette.surface, pointBorderWidth: 2, borderCapStyle: 'round', borderJoinStyle: 'round',
      };
    });
    thresholds.forEach((threshold) => {
      chartDatasets.push({
        type: 'line', label: threshold.label, data: labels.map(() => threshold.value), borderColor: palette.critical,
        borderWidth: 1, borderDash: [4, 4], pointRadius: 0, pointHoverRadius: 0, fill: false,
      });
    });
    return { type: 'line', data: { labels, datasets: chartDatasets }, options: baseOptions(palette, { legend }) };
  };
}

/** Barres simples. datasets : [{ label, data, color | colors }] */
function barChartConfig(labels, datasets, { legend = true, horizontal = false } = {}) {
  return (palette) => {
    const options = baseOptions(palette, { legend });
    if (horizontal) {
      options.indexAxis = 'y';
      options.interaction = { mode: 'nearest', axis: 'y', intersect: false };
      const xTicks = options.scales.y.ticks;
      options.scales = {
        x: { grid: { color: palette.grid, drawTicks: false }, border: { display: false }, ticks: { ...xTicks } },
        y: { grid: { display: false }, border: { color: palette.axis }, ticks: { color: palette.text } },
      };
      options.plugins.tooltip.callbacks.label = (context) => `${context.dataset.label} : ${formatCurrency(context.parsed.x)}`;
    }
    return {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map((dataset) => ({
          label: dataset.label,
          data: dataset.data,
          backgroundColor: dataset.colors || palette[dataset.color] || dataset.color,
          borderRadius: 4,
          borderSkipped: 'start',
          maxBarThickness: 24,
          barPercentage: 0.8,
          categoryPercentage: 0.75,
        })),
      },
      options,
    };
  };
}

/**
 * Barres d'un solde net mensuel (positif / négatif de couleurs distinctes)
 * et courbe du cumul, sur un seul axe.
 */
function cashFlowChartConfig(labels, values, cumulative, { barLabel = 'Cash flow net', lineLabel = 'Cumul' } = {}) {
  return (palette) => {
    const options = baseOptions(palette);
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar', label: barLabel, data: values, order: 2,
            backgroundColor: values.map((value) => (value >= 0 ? palette.income : palette.expense)),
            borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24,
          },
          {
            type: 'line', label: lineLabel, data: cumulative, order: 1, borderColor: palette.savings, backgroundColor: palette.savings,
            borderWidth: 2, tension: 0.3, cubicInterpolationMode: 'monotone', pointRadius: 4, pointHoverRadius: 5, pointBorderColor: palette.surface, pointBorderWidth: 2, spanGaps: false,
          },
        ],
      },
      options,
    };
  };
}
