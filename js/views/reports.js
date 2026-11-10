/* ==========================================================================
   views/reports.js — Rapports financiers (mensuel, annuel, cash flow, épargne)
   ========================================================================== */
'use strict';

registerTabGroup('reports', (tab) => {
  viewState.reports.tab = tab;
  renderCurrentView();
});

const REPORT_TABS = [
  { value: 'monthly', label: 'Mensuel', icon: 'fa-calendar' },
  { value: 'annual', label: 'Annuel', icon: 'fa-calendar-days' },
  { value: 'cashflow', label: 'Cash flow', icon: 'fa-money-bill-transfer' },
  { value: 'savings', label: 'Épargne', icon: 'fa-piggy-bank' },
];

/** Années disponibles : celles des transactions + l'année en cours. */
function getAvailableYears() {
  const years = new Set([Number(todayStr().slice(0, 4))]);
  appData.transactions.forEach((transaction) => years.add(Number(transaction.date.slice(0, 4))));
  if (viewState.reports.year) years.add(viewState.reports.year);
  return [...years].sort((a, b) => b - a);
}

/** Solde (global ou d'un compte) à une date donnée. */
function reportBalanceAt(date, accountId) {
  return accountId ? calculateAccountBalance(accountId, date) : calculateBalance(date);
}

function renderReports(section) {
  const state = viewState.reports;
  const today = todayStr();
  if (!state.year) state.year = Number(today.slice(0, 4));
  if (!state.month) state.month = Number(today.slice(5, 7));
  if (state.categoryId && !getCategory(state.categoryId)) state.categoryId = '';
  if (state.accountId && !getAccount(state.accountId)) state.accountId = '';
  const filters = { categoryId: state.categoryId, accountId: state.accountId };
  const panels = { monthly: monthlyReport, annual: annualReport, cashflow: cashFlowReport, savings: savingsReport };
  const panel = (panels[state.tab] || monthlyReport)(state, filters);
  const option = (value, label, selected) => html`<option value="${value}" ${String(value) === String(selected) ? raw('selected') : ''}>${label}</option>`;

  setHTML(section, html`
    ${pageHeader({
      title: 'Rapports',
      subtitle: 'Analyse détaillée de vos revenus, dépenses, cash flow et épargne.',
      actions: html`<button type="button" class="btn btn-secondary" data-action="print-report">${icon('fa-print')}<span>Imprimer</span></button>`,
    })}
    ${tabsHtml('reports', REPORT_TABS, state.tab, 'Type de rapport')}
    <section class="card filters-card" aria-label="Filtres du rapport">
      <div class="filters-grid filters-grid-compact">
        <div class="field">
          <label class="field-label" for="report-year">Année</label>
          <select id="report-year" class="input" data-change-action="report-filter" data-filter="year">
            ${getAvailableYears().map((year) => option(year, year, state.year))}
          </select>
        </div>
        ${state.tab === 'monthly' ? html`<div class="field">
          <label class="field-label" for="report-month">Mois</label>
          <select id="report-month" class="input" data-change-action="report-filter" data-filter="month">
            ${Array.from({ length: 12 }, (_, i) => option(i + 1, capitalize(formatMonthKey(`${state.year}-${pad2(i + 1)}`).replace(/\s\d{4}$/, '')), state.month))}
          </select>
        </div>` : ''}
        <div class="field">
          <label class="field-label" for="report-category">Catégorie</label>
          <select id="report-category" class="input" data-change-action="report-filter" data-filter="categoryId">
            ${option('', 'Toutes les catégories', state.categoryId)}
            <optgroup label="Dépenses">${getCategoriesByType('expense').map((category) => option(category.id, category.name, state.categoryId))}</optgroup>
            <optgroup label="Revenus">${getCategoriesByType('income').map((category) => option(category.id, category.name, state.categoryId))}</optgroup>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="report-account">Compte</label>
          <select id="report-account" class="input" data-change-action="report-filter" data-filter="accountId">
            ${option('', 'Tous les comptes', state.accountId)}
            ${appData.accounts.map((account) => option(account.id, account.name, state.accountId))}
          </select>
        </div>
        ${state.categoryId || state.accountId ? html`<div class="field field-reset"><button type="button" class="btn btn-ghost" data-action="report-reset">${icon('fa-filter-circle-xmark')}<span>Réinitialiser</span></button></div>` : ''}
      </div>
    </section>
    <div id="panel-reports" role="tabpanel" aria-labelledby="tab-reports-${state.tab}" class="report-panel">
      ${panel.content}
    </div>`);
  panel.afterRender();
}

/** Mention des filtres actifs. */
function reportFilterNote(filters) {
  const parts = [];
  if (filters.categoryId) parts.push(`catégorie « ${getCategoryName(filters.categoryId)} »`);
  if (filters.accountId) parts.push(`compte « ${getAccountName(filters.accountId)} »`);
  return parts.length ? html`<p class="filter-note">${icon('fa-filter')} Filtré sur ${parts.join(' et ')}.</p>` : '';
}

/* --------------------------------------------------------------------------
   Rapport mensuel
   -------------------------------------------------------------------------- */

function monthlyReport(state, filters) {
  const key = `${state.year}-${pad2(state.month)}`;
  const range = monthKeyToRange(key);
  const previous = monthKeyToRange(addMonthsToKey(key, -1));
  const income = calculateIncome(range, filters);
  const expenses = calculateExpenses(range, filters);
  const savings = roundMoney(income - expenses);
  const rate = calculateSavingsRate(income, expenses);
  const prevIncome = calculateIncome(previous, filters);
  const prevExpenses = calculateExpenses(previous, filters);
  const prevSavings = roundMoney(prevIncome - prevExpenses);
  const prevRate = calculateSavingsRate(prevIncome, prevExpenses);
  const endDate = minDate(range.end, maxDate(todayStr(), range.start));
  const endBalance = reportBalanceAt(range.end, filters.accountId);
  const topExpenses = groupByCategory('expense', range, filters);
  const sources = groupByCategory('income', range, filters);
  const daily = buildTimeSeries(range, 'day', filters);
  const today = todayStr();
  let incomeRunning = 0;
  let expenseRunning = 0;
  // Les cumuls s'arrêtent à aujourd'hui pour le mois en cours.
  const cumulativeIncome = daily.income.map((value, i) => {
    incomeRunning += value;
    return daily.buckets[i].start > today ? null : roundMoney(incomeRunning);
  });
  const cumulativeExpenses = daily.expenses.map((value, i) => {
    expenseRunning += value;
    return daily.buckets[i].start > today ? null : roundMoney(expenseRunning);
  });
  const label = capitalize(formatMonthKey(key));

  const content = html`
    <h2 class="report-title">Rapport mensuel — ${label}</h2>
    ${reportFilterNote(filters)}
    <section class="kpi-grid" aria-label="Indicateurs du mois">
      ${kpiCard({ label: 'Revenus', value: formatCurrency(income), iconName: 'fa-arrow-trend-up', tone: 'income', footer: deltaHtml(percentChange(income, prevIncome), { positiveIsGood: true, label: 'vs mois précédent' }) })}
      ${kpiCard({ label: 'Dépenses', value: formatCurrency(expenses), iconName: 'fa-arrow-trend-down', tone: 'expense', footer: deltaHtml(percentChange(expenses, prevExpenses), { positiveIsGood: false, label: 'vs mois précédent' }) })}
      ${kpiCard({ label: 'Épargne', value: formatCurrency(savings), iconName: 'fa-piggy-bank', tone: 'savings', valueClass: savings < 0 ? 'is-negative' : '', footer: deltaHtml(percentChange(savings, prevSavings), { positiveIsGood: true, label: 'vs mois précédent' }) })}
      ${kpiCard({ label: "Taux d'épargne", value: formatPercent(rate), iconName: 'fa-percent', tone: 'savings', valueClass: rate < 0 ? 'is-negative' : '', footer: deltaHtml(income > 0 && prevIncome > 0 ? rate - prevRate : null, { positiveIsGood: true, unit: 'points', label: 'vs mois précédent' }) })}
      ${kpiCard({ label: filters.accountId ? 'Solde du compte en fin de mois' : 'Solde en fin de mois', value: formatCurrency(endBalance, filters.accountId ? getAccountCurrency(filters.accountId) : null), iconName: 'fa-scale-balanced', tone: 'primary', valueClass: endBalance < 0 ? 'is-negative' : '', footer: html`<span class="kpi-sub">Au ${formatDate(range.end)}${endDate < range.end ? ' (opérations saisies à ce jour)' : ''}</span>` })}
    </section>
    <section class="grid grid-2">
      <article class="card">
        <header class="card-header"><div><h3 class="card-title">Évolution au fil du mois</h3><p class="card-subtitle">Montants cumulés jour après jour</p></div></header>
        <div class="chart-box" id="report-month-cumulative"></div>
      </article>
      <article class="card">
        <header class="card-header"><div><h3 class="card-title">Dépenses par catégorie</h3><p class="card-subtitle">${label}</p></div></header>
        <div class="chart-box" id="report-month-categories"></div>
      </article>
    </section>
    <section class="grid grid-2">
      <article class="card">
        <header class="card-header"><h3 class="card-title">Catégories principales</h3></header>
        ${categoryBreakdownList(topExpenses.slice(0, 8), { maxColored: 8, emptyText: 'Aucune dépense ce mois-ci.' })}
      </article>
      <article class="card">
        <header class="card-header"><h3 class="card-title">Revenus par source</h3></header>
        ${categoryBreakdownList(sources, { maxColored: 8, emptyText: 'Aucun revenu ce mois-ci.' })}
      </article>
    </section>`;

  const afterRender = () => {
    renderChart('report-month-cumulative', 'report-month-cumulative', lineChartConfig(daily.labels, [
      { label: 'Revenus cumulés', data: cumulativeIncome, color: 'income' },
      { label: 'Dépenses cumulées', data: cumulativeExpenses, color: 'expense' },
    ]), { isEmpty: !income && !expenses, emptyMessage: 'Aucune opération ce mois-ci.', ariaLabel: `Revenus et dépenses cumulés : ${label}` });
    const shown = topExpenses.slice(0, 8);
    renderChart('report-month-categories', 'report-month-categories', barChartConfig(
      shown.map((item) => item.name),
      [{ label: 'Dépenses', data: shown.map((item) => item.amount), colors: shown.map((item) => item.color) }],
      { legend: false, horizontal: true },
    ), { isEmpty: !shown.length, emptyMessage: 'Aucune dépense ce mois-ci.', ariaLabel: `Dépenses par catégorie : ${label}` });
  };
  return { content, afterRender };
}

/* --------------------------------------------------------------------------
   Rapport annuel
   -------------------------------------------------------------------------- */

function annualReport(state, filters) {
  const year = state.year;
  const stats = getMonthlyStats(year, filters);
  const previousStats = getMonthlyStats(year - 1, filters);
  const totals = summarizeStats(stats);
  const previousTotals = summarizeStats(previousStats);
  const currentKey = monthKey(todayStr());
  const balances = stats.map((month) => (month.key > currentKey ? null : reportBalanceAt(month.range.end, filters.accountId)));
  const labels = stats.map((month) => capitalize(formatMonthKey(month.key, 'month')));
  const hasData = totals.income > 0 || totals.expenses > 0;

  const content = html`
    <h2 class="report-title">Rapport annuel — ${year}</h2>
    ${reportFilterNote(filters)}
    <section class="kpi-grid" aria-label="Indicateurs de l'année">
      ${kpiCard({ label: 'Revenus', value: formatCurrency(totals.income), iconName: 'fa-arrow-trend-up', tone: 'income', footer: deltaHtml(percentChange(totals.income, previousTotals.income), { positiveIsGood: true, label: `vs ${year - 1}` }) })}
      ${kpiCard({ label: 'Dépenses', value: formatCurrency(totals.expenses), iconName: 'fa-arrow-trend-down', tone: 'expense', footer: deltaHtml(percentChange(totals.expenses, previousTotals.expenses), { positiveIsGood: false, label: `vs ${year - 1}` }) })}
      ${kpiCard({ label: 'Épargne', value: formatCurrency(totals.savings), iconName: 'fa-piggy-bank', tone: 'savings', valueClass: totals.savings < 0 ? 'is-negative' : '', footer: deltaHtml(percentChange(totals.savings, previousTotals.savings), { positiveIsGood: true, label: `vs ${year - 1}` }) })}
      ${kpiCard({ label: "Taux d'épargne", value: formatPercent(totals.rate), iconName: 'fa-percent', tone: 'savings', valueClass: totals.rate < 0 ? 'is-negative' : '' })}
    </section>
    <section class="grid grid-2">
      <article class="card">
        <header class="card-header"><div><h3 class="card-title">Revenus, dépenses et épargne par mois</h3><p class="card-subtitle">${year}</p></div></header>
        <div class="chart-box" id="report-annual-flow"></div>
      </article>
      <article class="card">
        <header class="card-header"><div><h3 class="card-title">Évolution du patrimoine</h3><p class="card-subtitle">${filters.accountId ? `Solde de « ${getAccountName(filters.accountId)} »` : 'Solde total'} en fin de mois</p></div></header>
        <div class="chart-box" id="report-annual-wealth"></div>
      </article>
    </section>
    <article class="card card-flush">
      <header class="card-header card-header-padded"><h3 class="card-title">Détail mois par mois</h3></header>
      <div class="table-wrap">
        <table class="table table-numeric">
          <caption class="sr-only">Revenus, dépenses, épargne et solde par mois en ${year}</caption>
          <thead><tr><th scope="col">Mois</th><th scope="col" class="text-right">Revenus</th><th scope="col" class="text-right">Dépenses</th><th scope="col" class="text-right">Épargne</th><th scope="col" class="text-right">Taux</th><th scope="col" class="text-right">Solde fin de mois</th></tr></thead>
          <tbody>
            ${stats.map((month, index) => html`<tr>
              <th scope="row">${capitalize(formatMonthKey(month.key))}</th>
              <td class="text-right">${formatCurrency(month.income)}</td>
              <td class="text-right">${formatCurrency(month.expenses)}</td>
              <td class="text-right">${signedAmountHtml(month.savings)}</td>
              <td class="text-right">${month.income > 0 ? formatPercent(month.rate) : '—'}</td>
              <td class="text-right">${balances[index] === null ? '—' : formatCurrency(balances[index])}</td>
            </tr>`)}
          </tbody>
          <tfoot><tr>
            <th scope="row">Total ${year}</th>
            <td class="text-right">${formatCurrency(totals.income)}</td>
            <td class="text-right">${formatCurrency(totals.expenses)}</td>
            <td class="text-right">${signedAmountHtml(totals.savings)}</td>
            <td class="text-right">${totals.income > 0 ? formatPercent(totals.rate) : '—'}</td>
            <td class="text-right">—</td>
          </tr></tfoot>
        </table>
      </div>
    </article>`;

  const afterRender = () => {
    const past = (month, value) => (month.key > currentKey ? null : value);
    renderChart('report-annual-flow', 'report-annual-flow', flowChartConfig({
      labels,
      income: stats.map((month) => past(month, month.income)),
      expenses: stats.map((month) => past(month, month.expenses)),
      savings: stats.map((month) => past(month, month.savings)),
    }), { isEmpty: !hasData, emptyMessage: `Aucune opération en ${year}.`, ariaLabel: `Revenus, dépenses et épargne par mois en ${year}` });
    renderChart('report-annual-wealth', 'report-annual-wealth', lineChartConfig(labels, [
      { label: 'Patrimoine', data: balances, color: 'savings', fill: true },
    ], { legend: false }), { isEmpty: balances.every((value) => value === null), emptyMessage: `Aucune donnée de solde pour ${year}.`, ariaLabel: `Évolution du patrimoine en ${year}` });
  };
  return { content, afterRender };
}

function summarizeStats(stats) {
  const income = roundMoney(sumBy(stats, (month) => month.income));
  const expenses = roundMoney(sumBy(stats, (month) => month.expenses));
  return { income, expenses, savings: roundMoney(income - expenses), rate: calculateSavingsRate(income, expenses) };
}

/* --------------------------------------------------------------------------
   Cash flow
   -------------------------------------------------------------------------- */

function cashFlowReport(state, filters) {
  const year = state.year;
  const stats = getMonthlyStats(year, filters);
  const totals = summarizeStats(stats);
  const currentKey = monthKey(todayStr());
  let running = 0;
  const cumulative = stats.map((month) => roundMoney((running += month.savings)));
  const chartValues = stats.map((month) => (month.key > currentKey ? null : month.savings));
  const chartCumulative = cumulative.map((value, i) => (stats[i].key > currentKey ? null : value));
  const best = stats.reduce((top, month) => (month.savings > top.savings ? month : top), stats[0]);
  const worst = stats.reduce((low, month) => (month.savings < low.savings ? month : low), stats[0]);
  const labels = stats.map((month) => capitalize(formatMonthKey(month.key, 'month')));
  const hasData = totals.income > 0 || totals.expenses > 0;

  const content = html`
    <h2 class="report-title">Cash flow — ${year}</h2>
    ${reportFilterNote(filters)}
    <p class="formula-note">${icon('fa-circle-info')} Cash flow net = revenus − dépenses. Les transferts entre vos comptes sont exclus.</p>
    <section class="kpi-grid" aria-label="Indicateurs de cash flow">
      ${kpiCard({ label: 'Entrées', value: formatCurrency(totals.income), iconName: 'fa-arrow-right-to-bracket', tone: 'income' })}
      ${kpiCard({ label: 'Sorties', value: formatCurrency(totals.expenses), iconName: 'fa-arrow-right-from-bracket', tone: 'expense' })}
      ${kpiCard({ label: 'Cash flow net', value: formatCurrency(totals.savings), iconName: 'fa-scale-balanced', tone: 'primary', valueClass: totals.savings < 0 ? 'is-negative' : '' })}
      ${kpiCard({ label: 'Meilleur mois', value: hasData ? capitalize(formatMonthKey(best.key, 'month')) : '—', iconName: 'fa-trophy', tone: 'warning', valueClass: 'kpi-value-text', footer: hasData ? html`<span class="kpi-sub">${formatCurrency(best.savings)} · plus faible : ${formatMonthKey(worst.key, 'month')} (${formatCurrency(worst.savings)})</span>` : '' })}
    </section>
    <article class="card">
      <header class="card-header"><div><h3 class="card-title">Évolution mois par mois</h3><p class="card-subtitle">Barres : cash flow net du mois · Courbe : cumul sur l'année</p></div></header>
      <div class="chart-box chart-box-lg" id="report-cashflow"></div>
    </article>
    <article class="card card-flush">
      <div class="table-wrap">
        <table class="table table-numeric">
          <caption class="sr-only">Cash flow mensuel en ${year}</caption>
          <thead><tr><th scope="col">Mois</th><th scope="col" class="text-right">Entrées</th><th scope="col" class="text-right">Sorties</th><th scope="col" class="text-right">Cash flow net</th><th scope="col" class="text-right">Cumul</th></tr></thead>
          <tbody>
            ${stats.map((month, index) => html`<tr>
              <th scope="row">${capitalize(formatMonthKey(month.key))}</th>
              <td class="text-right">${formatCurrency(month.income)}</td>
              <td class="text-right">${formatCurrency(month.expenses)}</td>
              <td class="text-right">${signedAmountHtml(month.savings)}</td>
              <td class="text-right">${signedAmountHtml(cumulative[index])}</td>
            </tr>`)}
          </tbody>
          <tfoot><tr><th scope="row">Total</th><td class="text-right">${formatCurrency(totals.income)}</td><td class="text-right">${formatCurrency(totals.expenses)}</td><td class="text-right">${signedAmountHtml(totals.savings)}</td><td class="text-right">—</td></tr></tfoot>
        </table>
      </div>
    </article>`;

  const afterRender = () => {
    renderChart('report-cashflow', 'report-cashflow', cashFlowChartConfig(labels, chartValues, chartCumulative), {
      isEmpty: !hasData, emptyMessage: `Aucune opération en ${year}.`, ariaLabel: `Cash flow mensuel en ${year}`,
    });
  };
  return { content, afterRender };
}

/* --------------------------------------------------------------------------
   Épargne
   -------------------------------------------------------------------------- */

function savingsReport(state, filters) {
  const year = state.year;
  const stats = getMonthlyStats(year, filters);
  const totals = summarizeStats(stats);
  const thisMonth = getPresetRange('this-month');
  const monthIncome = calculateIncome(thisMonth, filters);
  const monthExpenses = calculateExpenses(thisMonth, filters);
  const monthSavings = roundMoney(monthIncome - monthExpenses);
  const totalSavings = calculateSavings(null, filters);
  const base = calculateSavings({ start: '1900-01-01', end: `${year - 1}-12-31` }, filters);
  let running = base;
  const currentKey = monthKey(todayStr());
  const cumulative = stats.map((month) => (month.key > currentKey ? null : roundMoney((running += month.savings))));
  const savingsAccounts = appData.accounts.filter((account) => account.type === 'savings' || account.type === 'investment');
  const balances = calculateAccountBalances();
  const inSavingsAccounts = roundMoney(sumBy(savingsAccounts, (account) => balances.get(account.id) ?? 0));
  const inGoals = roundMoney(sumBy(appData.goals, getGoalCurrentAmount));
  const labels = stats.map((month) => capitalize(formatMonthKey(month.key, 'month')));
  const hasData = totals.income > 0 || totals.expenses > 0;

  const content = html`
    <h2 class="report-title">Épargne — ${year}</h2>
    ${reportFilterNote(filters)}
    <p class="formula-note">${icon('fa-circle-info')} Taux d'épargne = épargne ÷ revenus × 100 (0 % en l'absence de revenus).</p>
    <section class="kpi-grid" aria-label="Indicateurs d'épargne">
      ${kpiCard({ label: 'Épargne totale', value: formatCurrency(totalSavings), iconName: 'fa-vault', tone: 'savings', valueClass: totalSavings < 0 ? 'is-negative' : '', footer: html`<span class="kpi-sub">Revenus − dépenses depuis le début</span>` })}
      ${kpiCard({ label: 'Épargne du mois', value: formatCurrency(monthSavings), iconName: 'fa-piggy-bank', tone: 'income', valueClass: monthSavings < 0 ? 'is-negative' : '', footer: html`<span class="kpi-sub">${capitalize(formatMonthKey(monthKey(todayStr())))}</span>` })}
      ${kpiCard({ label: "Taux d'épargne du mois", value: formatPercent(calculateSavingsRate(monthIncome, monthExpenses)), iconName: 'fa-percent', tone: 'primary' })}
      ${kpiCard({ label: `Taux d'épargne ${year}`, value: formatPercent(totals.rate), iconName: 'fa-chart-line', tone: 'warning', footer: html`<span class="kpi-sub">${formatCurrency(totals.savings)} épargnés sur l'année</span>` })}
    </section>
    <div class="info-box info-box-neutral">
      ${icon('fa-building-columns')}
      <p>Sur vos comptes épargne et investissement : <strong>${formatCurrency(inSavingsAccounts)}</strong> · Mis de côté dans vos objectifs : <strong>${formatCurrency(inGoals)}</strong></p>
    </div>
    <article class="card">
      <header class="card-header"><div><h3 class="card-title">Évolution de l'épargne</h3><p class="card-subtitle">Barres : épargne du mois · Courbe : épargne cumulée depuis le début</p></div></header>
      <div class="chart-box chart-box-lg" id="report-savings"></div>
    </article>
    <article class="card card-flush">
      <div class="table-wrap">
        <table class="table table-numeric">
          <caption class="sr-only">Épargne mensuelle en ${year}</caption>
          <thead><tr><th scope="col">Mois</th><th scope="col" class="text-right">Revenus</th><th scope="col" class="text-right">Dépenses</th><th scope="col" class="text-right">Épargne</th><th scope="col" class="text-right">Taux</th><th scope="col" class="text-right">Épargne cumulée</th></tr></thead>
          <tbody>
            ${stats.map((month, index) => html`<tr>
              <th scope="row">${capitalize(formatMonthKey(month.key))}</th>
              <td class="text-right">${formatCurrency(month.income)}</td>
              <td class="text-right">${formatCurrency(month.expenses)}</td>
              <td class="text-right">${signedAmountHtml(month.savings)}</td>
              <td class="text-right">${month.income > 0 ? formatPercent(month.rate) : '—'}</td>
              <td class="text-right">${cumulative[index] === null ? '—' : formatCurrency(cumulative[index])}</td>
            </tr>`)}
          </tbody>
        </table>
      </div>
    </article>`;

  const afterRender = () => {
    renderChart('report-savings', 'report-savings', cashFlowChartConfig(labels, stats.map((month) => (month.key > currentKey ? null : month.savings)), cumulative, {
      barLabel: 'Épargne du mois', lineLabel: 'Épargne cumulée',
    }), { isEmpty: !hasData, emptyMessage: `Aucune opération en ${year}.`, ariaLabel: `Évolution de l'épargne en ${year}` });
  };
  return { content, afterRender };
}

registerActions({
  'report-filter': (element) => {
    const state = viewState.reports;
    const key = element.dataset.filter;
    state[key] = key === 'year' || key === 'month' ? Number(element.value) : element.value;
    renderCurrentView();
  },
  'report-reset': () => {
    viewState.reports.categoryId = '';
    viewState.reports.accountId = '';
    renderCurrentView();
  },
  'print-report': () => window.print(),
});
