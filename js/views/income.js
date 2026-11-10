/* ==========================================================================
   views/income.js — Page Revenus
   ========================================================================== */
'use strict';

registerPeriodOwner('income', () => viewState.income.period, () => renderCurrentView());

/** Clés des 12 derniers mois (mois en cours inclus). */
function lastTwelveMonthKeys() {
  const today = todayStr();
  return listMonthKeys(addMonths(startOfMonth(today), -11), today);
}

function renderIncome(section) {
  const period = viewState.income.period;
  const range = getPresetRange(period.preset, period);
  const previous = getPreviousRange(range, period.preset);
  const comparison = getComparisonLabel(period.preset);

  const total = calculateIncome(null);
  const periodIncome = calculateIncome(range);
  const previousIncome = calculateIncome(previous);
  const change = percentChange(periodIncome, previousIncome);
  const average = calculateMonthlyAverage('income', 12);
  const sources = groupByCategory('income', range);
  const incomeCategories = getCategoriesByType('income');
  const months = getStatsForMonthKeys(lastTwelveMonthKeys());
  const recent = filterTransactions({ type: 'income', range })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);
  const sourceTotals = new Map(sources.map((source) => [source.id, source]));

  setHTML(section, html`
    ${pageHeader({
      title: 'Revenus',
      subtitle: `Suivez vos rentrées d'argent et leurs sources : ${describeRange(range).toLowerCase()}.`,
      actions: html`${periodPickerHtml('income', period)}
        <button type="button" class="btn btn-secondary" data-action="new-category" data-type="income">${icon('fa-folder-plus')}<span>Nouvelle source</span></button>
        <button type="button" class="btn btn-primary" data-action="new-transaction" data-type="income">${icon('fa-plus')}<span>Nouveau revenu</span></button>`,
    })}

    <section class="kpi-grid" aria-label="Indicateurs des revenus">
      ${kpiCard({ label: 'Total des revenus', value: formatCurrency(total), iconName: 'fa-sack-dollar', tone: 'income', footer: html`<span class="kpi-sub">Depuis le début</span>` })}
      ${kpiCard({ label: 'Revenus de la période', value: formatCurrency(periodIncome), iconName: 'fa-arrow-trend-up', tone: 'income', footer: deltaHtml(change, { positiveIsGood: true, label: comparison }) })}
      ${kpiCard({ label: 'Revenu moyen mensuel', value: formatCurrency(average), iconName: 'fa-calculator', tone: 'primary', footer: html`<span class="kpi-sub">Sur les 12 derniers mois</span>` })}
      ${kpiCard({
        label: 'Évolution',
        value: change === null ? '—' : formatPercent(change, { signed: true }),
        iconName: 'fa-chart-line',
        tone: 'savings',
        footer: html`<span class="kpi-sub">${formatCurrency(previousIncome)} → ${formatCurrency(periodIncome)} (${comparison})</span>`,
      })}
      ${kpiCard({ label: 'Sources actives', value: formatNumber(sources.length), iconName: 'fa-layer-group', tone: 'neutral', footer: html`<span class="kpi-sub">sur ${pluralize(incomeCategories.length, 'source', 'sources')}</span>` })}
    </section>

    <section class="grid grid-dashboard">
      <article class="card span-2">
        <header class="card-header">
          <div>
            <h2 class="card-title">Évolution des revenus</h2>
            <p class="card-subtitle">12 derniers mois</p>
          </div>
        </header>
        <div class="chart-box" id="income-trend-chart"></div>
        ${chartDataTable('Revenus par mois', ['Mois', 'Revenus'], months.map((month) => [capitalize(formatMonthKey(month.key)), formatCurrency(month.income)]))}
      </article>
      <article class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Répartition par source</h2>
            <p class="card-subtitle">${describeRange(range)}</p>
          </div>
        </header>
        <div class="chart-box chart-box-donut" id="income-sources-chart"></div>
        ${categoryBreakdownList(sources, { emptyText: 'Aucun revenu sur cette période.' })}
      </article>
    </section>

    <section class="grid grid-2">
      <article class="card">
        <header class="card-header">
          <h2 class="card-title">Sources de revenus</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-action="new-category" data-type="income">${icon('fa-plus')}<span>Ajouter</span></button>
        </header>
        ${incomeCategories.length ? html`<ul class="list">
          ${incomeCategories.map((category) => {
            const source = sourceTotals.get(category.id);
            return html`<li class="list-row list-row-static">
              <span class="cat-icon" style="--cat-color:${category.color}">${icon(category.icon)}</span>
              <span class="list-row-main">
                <span class="list-row-title">${category.name}</span>
                <span class="list-row-sub">${source ? `${pluralize(source.count, 'revenu', 'revenus')} · ${formatPercent(source.percent)} de la période` : 'Aucun revenu sur la période'}</span>
              </span>
              <span class="amount amount-neutral">${formatCurrency(source ? source.amount : 0)}</span>
              <span class="row-actions">
                <button type="button" class="icon-btn" data-action="show-category-transactions" data-id="${category.id}" title="Voir les revenus" aria-label="Voir les revenus « ${category.name} »">${icon('fa-list')}</button>
                <button type="button" class="icon-btn" data-action="edit-category" data-id="${category.id}" title="Modifier" aria-label="Modifier la source « ${category.name} »">${icon('fa-pen')}</button>
              </span>
            </li>`;
          })}
        </ul>` : emptyState({ iconName: 'fa-layer-group', title: 'Aucune source de revenus.', actionLabel: 'Créer une source', action: 'new-category', actionAttrs: { 'data-type': 'income' }, compact: true })}
      </article>
      <article class="card">
        <header class="card-header">
          <h2 class="card-title">Derniers revenus</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-action="show-type-transactions" data-type="income">Tout voir ${icon('fa-arrow-right')}</button>
        </header>
        ${recent.length ? html`<ul class="list">${recent.map(transactionListItem)}</ul>` : emptyState({ iconName: 'fa-sack-dollar', title: 'Aucun revenu sur cette période.', actionLabel: 'Ajouter un revenu', action: 'new-transaction', actionAttrs: { 'data-type': 'income' }, compact: true })}
      </article>
    </section>`);

  renderChart('income-trend', 'income-trend-chart', barChartConfig(
    months.map((month) => capitalize(formatMonthKey(month.key, 'month'))),
    [{ label: 'Revenus', data: months.map((month) => month.income), color: 'income' }],
    { legend: false },
  ), { isEmpty: !months.some((month) => month.income > 0), emptyMessage: 'Aucun revenu sur les 12 derniers mois.', ariaLabel: 'Revenus des 12 derniers mois' });

  renderChart('income-sources', 'income-sources-chart', doughnutChartConfig(sources), {
    isEmpty: !sources.length,
    emptyMessage: 'Aucun revenu sur cette période.',
    ariaLabel: 'Répartition des revenus par source',
  });
}
