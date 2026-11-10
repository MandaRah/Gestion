/* ==========================================================================
   views/dashboard.js — Tableau de bord
   ========================================================================== */
'use strict';

registerPeriodOwner('dashboard', () => viewState.dashboard.period, () => {
  viewState.dashboard.granularity = 'auto';
  renderCurrentView();
});

const GRANULARITY_OPTIONS = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

function renderDashboard(section) {
  const state = viewState.dashboard;
  const settings = getSettings();
  const today = todayStr();
  const range = getPresetRange(state.period.preset, state.period);
  const previous = getPreviousRange(range, state.period.preset);
  const comparison = getComparisonLabel(state.period.preset);

  // Indicateurs calculés à partir des données.
  const income = calculateIncome(range);
  const expenses = calculateExpenses(range);
  const savings = roundMoney(income - expenses);
  const rate = calculateSavingsRate(income, expenses);
  const prevIncome = calculateIncome(previous);
  const prevExpenses = calculateExpenses(previous);
  const prevSavings = roundMoney(prevIncome - prevExpenses);
  const prevRate = calculateSavingsRate(prevIncome, prevExpenses);
  const count = countTransactions(range);
  const prevCount = countTransactions(previous);
  const asOf = range.end < today ? range.end : null;
  const balance = calculateBalance(asOf);
  const budget = calculateBudgetForRange(range);
  const granularity = state.granularity === 'auto' ? autoGranularity(range) : state.granularity;
  const series = buildTimeSeries(range, granularity);
  // Les intervalles futurs sont laissés vides : la courbe s'arrête à aujourd'hui.
  const isFuture = (i) => series.buckets[i].start > today;
  const chartSeries = {
    labels: series.labels,
    income: series.income.map((value, i) => (isFuture(i) ? null : value)),
    expenses: series.expenses.map((value, i) => (isFuture(i) ? null : value)),
    savings: series.savings.map((value, i) => (isFuture(i) ? null : value)),
  };
  const expenseGroups = groupByCategory('expense', range);
  const rateChange = income > 0 && prevIncome > 0 ? rate - prevRate : null;

  const greeting = settings.userName ? `Bonjour ${settings.userName}` : 'Bonjour';

  setHTML(section, html`
    ${pageHeader({
      title: 'Tableau de bord',
      subtitle: `${greeting} — voici l'essentiel de vos finances : ${describeRange(range).toLowerCase()}.`,
      actions: periodPickerHtml('dashboard', state.period),
    })}

    ${appData.accounts.length ? '' : html`<section class="card onboarding-card">
      <div class="onboarding-icon" aria-hidden="true">${icon('fa-rocket')}</div>
      <div class="onboarding-text">
        <h2 class="card-title">Bienvenue ! Commençons par vos comptes</h2>
        <p class="text-muted">Créez votre premier compte avec son solde initial, puis ajoutez vos revenus et dépenses : tous les indicateurs se mettront à jour automatiquement.</p>
      </div>
      <div class="onboarding-actions">
        <button type="button" class="btn btn-primary" data-action="new-account">${icon('fa-plus')}<span>Créer un compte</span></button>
      </div>
    </section>`}

    <section class="kpi-grid kpi-grid-dashboard" aria-label="Indicateurs clés">
      ${kpiCard({
        label: asOf ? `Solde au ${formatDate(asOf)}` : 'Solde total',
        value: formatCurrency(balance),
        iconName: 'fa-scale-balanced',
        tone: 'primary',
        className: 'kpi-hero',
        valueClass: balance < 0 ? 'is-negative' : '',
        footer: html`<span class="kpi-sub">${pluralize(appData.accounts.length, 'compte', 'comptes')} · variation ${signedAmountHtml(savings)}</span>`,
      })}
      ${kpiCard({ label: 'Revenus', value: formatCurrency(income), iconName: 'fa-arrow-trend-up', tone: 'income', footer: deltaHtml(percentChange(income, prevIncome), { positiveIsGood: true, label: comparison }) })}
      ${kpiCard({ label: 'Dépenses', value: formatCurrency(expenses), iconName: 'fa-arrow-trend-down', tone: 'expense', footer: deltaHtml(percentChange(expenses, prevExpenses), { positiveIsGood: false, label: comparison }) })}
      ${kpiCard({ label: 'Épargne', value: formatCurrency(savings), iconName: 'fa-piggy-bank', tone: 'savings', valueClass: savings < 0 ? 'is-negative' : '', footer: deltaHtml(percentChange(savings, prevSavings), { positiveIsGood: true, label: comparison }) })}
      ${kpiCard({ label: "Taux d'épargne", value: formatPercent(rate), iconName: 'fa-percent', tone: 'savings', valueClass: rate < 0 ? 'is-negative' : '', footer: deltaHtml(rateChange, { positiveIsGood: true, label: comparison, unit: 'points' }) })}
      ${kpiCard({
        label: 'Budget restant',
        value: budget ? formatCurrency(budget.remaining) : '—',
        iconName: 'fa-chart-pie',
        tone: 'warning',
        valueClass: budget && budget.remaining < 0 ? 'is-negative' : '',
        footer: budget
          ? html`${progressBar(budget.percent, budget.status, 'Budget utilisé sur la période')}<span class="kpi-sub">${formatPercent(budget.percent, { decimals: 0 })} utilisés sur ${formatCurrency(budget.budgeted)}</span>`
          : html`<button type="button" class="link-btn" data-action="new-budget">${icon('fa-plus')} Définir un budget</button>`,
      })}
      ${kpiCard({ label: 'Transactions', value: formatNumber(count), iconName: 'fa-receipt', tone: 'neutral', footer: deltaHtml(percentChange(count, prevCount), { positiveIsGood: null, label: comparison }) })}
    </section>

    <section class="grid grid-dashboard">
      <article class="card span-2 card-stretch">
        <header class="card-header">
          <div>
            <h2 class="card-title">Revenus, dépenses et épargne</h2>
            <p class="card-subtitle">${describeRange(range)} · regroupement par ${GRANULARITY_OPTIONS.find((option) => option.value === granularity).label.toLowerCase()}</p>
          </div>
          ${segmentedButtons('dashboard-granularity', GRANULARITY_OPTIONS, granularity, 'Regrouper le graphique par')}
        </header>
        <div class="chart-box chart-fill" id="dashboard-flow-chart"></div>
        ${chartDataTable('Revenus, dépenses et épargne par période', ['Période', 'Revenus', 'Dépenses', 'Épargne'],
          series.labels.map((label, i) => [label, formatCurrency(series.income[i]), formatCurrency(series.expenses[i]), formatCurrency(series.savings[i])])
            .filter((row, i) => series.income[i] || series.expenses[i]))}
      </article>
      <article class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Répartition des dépenses</h2>
            <p class="card-subtitle">${formatCurrency(expenses)} sur la période</p>
          </div>
        </header>
        <div class="chart-box chart-box-donut" id="dashboard-donut-chart"></div>
        ${categoryBreakdownList(expenseGroups, { emptyText: 'Aucune dépense sur cette période.' })}
      </article>
    </section>

    <section class="grid grid-2">
      <article class="card">
        <header class="card-header">
          <h2 class="card-title">Dernières transactions</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-action="navigate" data-view="transactions">Tout voir ${icon('fa-arrow-right')}</button>
        </header>
        ${recentTransactionsHtml()}
      </article>
      <article class="card">
        <header class="card-header">
          <h2 class="card-title">À venir (30 jours)</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-action="navigate" data-view="forecast">Prévisions ${icon('fa-arrow-right')}</button>
        </header>
        ${upcomingItemsHtml()}
      </article>
    </section>

    <section class="grid grid-2">
      <article class="card">
        <header class="card-header">
          <h2 class="card-title">Budgets du mois</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-action="navigate" data-view="budgets">Gérer ${icon('fa-arrow-right')}</button>
        </header>
        ${dashboardBudgetsHtml()}
      </article>
      <article class="card">
        <header class="card-header">
          <h2 class="card-title">Objectifs</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-action="navigate" data-view="goals">Gérer ${icon('fa-arrow-right')}</button>
        </header>
        ${dashboardGoalsHtml()}
      </article>
    </section>`);

  const hasFlow = series.income.some((value) => value > 0) || series.expenses.some((value) => value > 0);
  renderChart('dashboard-flow', 'dashboard-flow-chart', flowChartConfig(chartSeries), {
    isEmpty: !hasFlow,
    emptyMessage: 'Aucun revenu ni dépense sur cette période.',
    ariaLabel: `Graphique des revenus, dépenses et épargne : ${describeRange(range)}`,
  });
  renderChart('dashboard-donut', 'dashboard-donut-chart', doughnutChartConfig(expenseGroups), {
    isEmpty: !expenseGroups.length,
    emptyMessage: 'Aucune dépense sur cette période.',
    ariaLabel: 'Répartition des dépenses par catégorie',
  });
}

/** Ligne de liste cliquable pour une transaction. */
function transactionListItem(transaction) {
  const category = getCategory(transaction.categoryId);
  const iconName = transaction.type === 'transfer' ? 'fa-right-left' : category ? category.icon : 'fa-circle-question';
  const color = transaction.type === 'transfer' || !category ? NEUTRAL_COLOR : category.color;
  return html`<li>
    <button type="button" class="list-row" data-action="view-transaction" data-id="${transaction.id}">
      <span class="cat-icon" style="--cat-color:${sanitizeColor(color)}">${icon(iconName)}</span>
      <span class="list-row-main">
        <span class="list-row-title">${transaction.description}</span>
        <span class="list-row-sub">${formatDate(transaction.date)} · ${transaction.type === 'transfer' ? `${getAccountName(transaction.accountId)} → ${getAccountName(transaction.toAccountId)}` : getCategoryName(transaction.categoryId)}${transaction.status === 'pending' ? ' · en attente' : ''}</span>
      </span>
      ${amountHtml(transaction.amount, transaction.type, getAccountCurrency(transaction.accountId))}
    </button>
  </li>`;
}

function recentTransactionsHtml() {
  const recent = [...appData.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  if (!recent.length) {
    return emptyState({ iconName: 'fa-receipt', title: 'Aucune transaction pour le moment.', actionLabel: 'Ajouter une transaction', action: 'new-transaction', compact: true });
  }
  return html`<ul class="list">${recent.map(transactionListItem)}</ul>`;
}

/** Ligne de liste pour une opération prévue (échéance, récurrence, en attente). */
function plannedItemRow(item) {
  const source = PLANNED_SOURCES[item.source];
  const category = getCategory(item.categoryId);
  return html`<li>
    <button type="button" class="list-row" data-action="${source.action}" data-id="${item.refId}">
      <span class="date-chip ${item.overdue ? 'is-overdue' : ''}"><span>${formatDate(item.date, 'dayMonth')}</span></span>
      <span class="list-row-main">
        <span class="list-row-title">${item.label}</span>
        <span class="list-row-sub">${icon(source.icon)} ${source.label}${category ? ` · ${category.name}` : ''}${item.overdue ? ' · en retard' : ` · ${relativeDayLabel(item.date).toLowerCase()}`}</span>
      </span>
      ${amountHtml(item.amount, item.type)}
    </button>
  </li>`;
}

function upcomingItemsHtml() {
  const today = todayStr();
  const items = getPlannedItems(today, addDays(today, 30), { includeOverdue: true }).slice(0, 6);
  if (!items.length) {
    return emptyState({ iconName: 'fa-calendar-check', title: 'Rien de prévu dans les 30 prochains jours.', text: 'Ajoutez vos échéances (loyer, abonnements, factures) pour les suivre ici.', actionLabel: 'Ajouter une échéance', action: 'new-bill', compact: true });
  }
  return html`<ul class="list">${items.map(plannedItemRow)}</ul>`;
}

function dashboardBudgetsHtml() {
  if (!appData.budgets.length) {
    return emptyState({ iconName: 'fa-chart-pie', title: 'Aucun budget défini.', text: 'Fixez un budget global ou par catégorie pour suivre vos dépenses.', actionLabel: 'Créer un budget', action: 'new-budget', compact: true });
  }
  const usages = appData.budgets
    .filter((budget) => budget.scope === 'global' || getCategory(budget.categoryId))
    .map((budget) => ({ budget, usage: calculateBudgetUsage(budget) }))
    .sort((a, b) => b.usage.percent - a.usage.percent)
    .slice(0, 4);
  return html`<ul class="mini-progress-list">
    ${usages.map(({ budget, usage }) => html`<li>
      <div class="mini-progress-head">
        <span class="mini-progress-name">${getBudgetLabel(budget)}</span>
        <span class="mini-progress-value">${formatCurrency(usage.spent)} / ${formatCurrency(usage.budgeted)}</span>
      </div>
      ${progressBar(usage.percent, usage.status, `Budget ${getBudgetLabel(budget)}`)}
      <div class="mini-progress-foot">${budgetStatusBadge(usage.status)}<span class="small text-muted">${formatPercent(usage.percent, { decimals: 0 })}</span></div>
    </li>`)}
  </ul>`;
}

function dashboardGoalsHtml() {
  if (!appData.goals.length) {
    return emptyState({ iconName: 'fa-bullseye', title: 'Aucun objectif pour le moment.', text: "Fonds d'urgence, voyage, voiture… fixez un cap et suivez votre progression.", actionLabel: 'Créer un objectif', action: 'new-goal', compact: true });
  }
  const goals = appData.goals
    .map((goal) => ({ goal, progress: calculateGoalProgress(goal) }))
    .sort((a, b) => (a.progress.status === 'reached') - (b.progress.status === 'reached') || b.progress.percent - a.progress.percent)
    .slice(0, 4);
  return html`<ul class="mini-progress-list">
    ${goals.map(({ goal, progress }) => html`<li>
      <div class="mini-progress-head">
        <span class="mini-progress-name"><span class="cat-icon cat-icon-sm" style="--cat-color:${goal.color}">${icon(goal.icon)}</span>${goal.name}</span>
        <span class="mini-progress-value">${formatCurrency(progress.current)} / ${formatCurrency(progress.target)}</span>
      </div>
      ${progressBar(progress.percent, progress.status === 'reached' ? 'reached' : 'normal', `Objectif ${goal.name}`)}
      <div class="mini-progress-foot"><span class="small text-muted">${describeTimeLeft(progress.daysLeft)}</span><span class="small text-muted">${formatPercent(progress.percent, { decimals: 0 })}</span></div>
    </li>`)}
  </ul>`;
}

registerActions({
  'dashboard-granularity': (element) => {
    viewState.dashboard.granularity = element.dataset.value;
    renderCurrentView();
  },
});
