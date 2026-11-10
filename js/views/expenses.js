/* ==========================================================================
   views/expenses.js — Page Dépenses
   ========================================================================== */
'use strict';

registerPeriodOwner('expenses', () => viewState.expenses.period, () => renderCurrentView());

function renderExpenses(section) {
  const period = viewState.expenses.period;
  const range = getPresetRange(period.preset, period);
  const previous = getPreviousRange(range, period.preset);
  const comparison = getComparisonLabel(period.preset);

  const periodExpenses = calculateExpenses(range);
  const previousExpenses = calculateExpenses(previous);
  const change = percentChange(periodExpenses, previousExpenses);
  const average = calculateMonthlyAverage('expense', 12);
  const largest = getLargestExpense(range);
  const categories = groupByCategory('expense', range);
  const topCategory = categories[0] || null;
  const months = getStatsForMonthKeys(lastTwelveMonthKeys());
  const topExpenses = filterTransactions({ type: 'expense', range, includePending: false })
    .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
    .slice(0, 10);

  setHTML(section, html`
    ${pageHeader({
      title: 'Dépenses',
      subtitle: `Analysez où part votre argent : ${describeRange(range).toLowerCase()}.`,
      actions: html`${periodPickerHtml('expenses', period)}
        <button type="button" class="btn btn-secondary" data-action="new-category" data-type="expense">${icon('fa-folder-plus')}<span>Nouvelle catégorie</span></button>
        <button type="button" class="btn btn-primary" data-action="new-transaction" data-type="expense">${icon('fa-plus')}<span>Nouvelle dépense</span></button>`,
    })}

    <section class="kpi-grid" aria-label="Indicateurs des dépenses">
      ${kpiCard({ label: 'Dépenses de la période', value: formatCurrency(periodExpenses), iconName: 'fa-arrow-trend-down', tone: 'expense', footer: deltaHtml(change, { positiveIsGood: false, label: comparison }) })}
      ${kpiCard({ label: 'Dépenses moyennes', value: formatCurrency(average), iconName: 'fa-calculator', tone: 'primary', footer: html`<span class="kpi-sub">Par mois, sur les 12 derniers mois</span>` })}
      ${kpiCard({
        label: 'Plus grosse dépense',
        value: largest ? formatCurrency(largest.amount, getAccountCurrency(largest.accountId)) : '—',
        iconName: 'fa-arrow-up-wide-short',
        tone: 'warning',
        footer: largest
          ? html`<button type="button" class="link-btn" data-action="view-transaction" data-id="${largest.id}">${largest.description} · ${formatDate(largest.date)}</button>`
          : html`<span class="kpi-sub">Aucune dépense sur la période</span>`,
      })}
      ${kpiCard({
        label: 'Catégorie principale',
        value: topCategory ? topCategory.name : '—',
        iconName: topCategory ? topCategory.icon : 'fa-folder-open',
        tone: 'neutral',
        valueClass: 'kpi-value-text',
        footer: html`<span class="kpi-sub">${topCategory ? `${formatCurrency(topCategory.amount)} · ${formatPercent(topCategory.percent)} des dépenses` : 'Aucune dépense sur la période'}</span>`,
      })}
      ${kpiCard({
        label: 'Évolution',
        value: change === null ? '—' : formatPercent(change, { signed: true }),
        iconName: 'fa-chart-line',
        tone: 'savings',
        footer: html`<span class="kpi-sub">${formatCurrency(previousExpenses)} → ${formatCurrency(periodExpenses)} (${comparison})</span>`,
      })}
    </section>

    <section class="grid grid-2">
      <article class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Dépenses par catégorie</h2>
            <p class="card-subtitle">${describeRange(range)}</p>
          </div>
        </header>
        <div class="chart-box" id="expenses-category-chart" style="height:${Math.max(240, Math.min(categories.length, 12) * 34 + 40)}px"></div>
        ${chartDataTable('Dépenses par catégorie', ['Catégorie', 'Montant', 'Part'], categories.map((item) => [item.name, formatCurrency(item.amount), formatPercent(item.percent)]))}
      </article>
      <article class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Évolution des dépenses</h2>
            <p class="card-subtitle">12 derniers mois</p>
          </div>
        </header>
        <div class="chart-box" id="expenses-trend-chart"></div>
        ${chartDataTable('Dépenses par mois', ['Mois', 'Dépenses'], months.map((month) => [capitalize(formatMonthKey(month.key)), formatCurrency(month.expenses)]))}
      </article>
    </section>

    <article class="card card-flush">
      <header class="card-header card-header-padded">
        <h2 class="card-title">Principales dépenses de la période</h2>
        <button type="button" class="btn btn-ghost btn-sm" data-action="show-type-transactions" data-type="expense">Toutes les dépenses ${icon('fa-arrow-right')}</button>
      </header>
      ${topExpenses.length ? html`<div class="table-wrap">
        <table class="table table-responsive">
          <caption class="sr-only">Les dix plus grosses dépenses de la période</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Catégorie</th><th scope="col">Compte</th><th scope="col" class="text-right">Montant</th><th scope="col" class="text-right">Part</th></tr></thead>
          <tbody>
            ${topExpenses.map((transaction, index) => html`<tr>
              <td data-label="Rang">${index + 1}</td>
              <td data-label="Date" class="nowrap">${formatDate(transaction.date)}</td>
              <td data-label="Description"><button type="button" class="cell-link" data-action="view-transaction" data-id="${transaction.id}">${transaction.description}</button></td>
              <td data-label="Catégorie">${categoryChip(transaction.categoryId, 'expense')}</td>
              <td data-label="Compte">${getAccountName(transaction.accountId)}</td>
              <td data-label="Montant" class="text-right nowrap">${amountHtml(transaction.amount, 'expense', getAccountCurrency(transaction.accountId))}</td>
              <td data-label="Part" class="text-right">${formatPercent(periodExpenses > 0 ? (transaction.amount / periodExpenses) * 100 : 0)}</td>
            </tr>`)}
          </tbody>
        </table>
      </div>` : html`<div class="card-body">${emptyState({ iconName: 'fa-receipt', title: 'Aucune dépense sur cette période.', actionLabel: 'Ajouter une dépense', action: 'new-transaction', actionAttrs: { 'data-type': 'expense' }, compact: true })}</div>`}
    </article>`);

  const shown = categories.slice(0, 12);
  renderChart('expenses-category', 'expenses-category-chart', barChartConfig(
    shown.map((item) => item.name),
    [{ label: 'Dépenses', data: shown.map((item) => item.amount), colors: shown.map((item) => item.color) }],
    { legend: false, horizontal: true },
  ), { isEmpty: !categories.length, emptyMessage: 'Aucune dépense sur cette période.', ariaLabel: 'Dépenses par catégorie' });

  renderChart('expenses-trend', 'expenses-trend-chart', lineChartConfig(
    months.map((month) => capitalize(formatMonthKey(month.key, 'month'))),
    [{ label: 'Dépenses', data: months.map((month) => month.expenses), color: 'expense', fill: true }],
    { legend: false },
  ), { isEmpty: !months.some((month) => month.expenses > 0), emptyMessage: 'Aucune dépense sur les 12 derniers mois.', ariaLabel: 'Dépenses des 12 derniers mois' });
}
