/* ==========================================================================
   views/forecast.js — Prévisions (solde prévisionnel) et calendrier financier
   ========================================================================== */
'use strict';

registerTabGroup('forecast', (tab) => {
  viewState.forecast.tab = tab === 'calendar' ? 'calendar' : 'projection';
  renderCurrentView();
});

const FORECAST_INCLUDE_OPTIONS = [
  { key: 'recurring', label: 'Transactions récurrentes' },
  { key: 'bills', label: 'Échéances non payées' },
  { key: 'budgets', label: 'Budgets (dépenses variables)' },
  { key: 'pending', label: 'Transactions en attente' },
];

function renderForecast(section) {
  const state = viewState.forecast;
  const tabs = [
    { value: 'projection', label: 'Solde prévisionnel', icon: 'fa-chart-line' },
    { value: 'calendar', label: 'Calendrier financier', icon: 'fa-calendar-days' },
  ];
  const panel = state.tab === 'calendar' ? calendarPanel() : projectionPanel();
  setHTML(section, html`
    ${pageHeader({ title: 'Prévisions', subtitle: 'Anticipez votre solde et visualisez les opérations à venir.' })}
    ${tabsHtml('forecast', tabs, state.tab, 'Vue des prévisions')}
    <div id="panel-forecast" role="tabpanel" aria-labelledby="tab-forecast-${state.tab}">${panel.content}</div>`);
  panel.afterRender();
}

/* --------------------------------------------------------------------------
   Solde prévisionnel
   -------------------------------------------------------------------------- */

function projectionPanel() {
  const state = viewState.forecast;
  const today = todayStr();
  const settings = getSettings();
  const forecast = buildForecast({ endDate: FORECAST_HORIZONS['12m'].getEnd(today), include: state.include });
  const pointAt = (date) => {
    const point = forecast.points.find((item) => item.date === date);
    return point ? point.balance : forecast.endBalance;
  };
  const horizon = FORECAST_HORIZONS[state.horizon] ? state.horizon : '3m';
  const horizonEnd = FORECAST_HORIZONS[horizon].getEnd(today);
  const points = forecast.points.filter((point) => point.date <= horizonEnd);
  const events = forecast.events.filter((event) => event.date <= horizonEnd);
  const minPoint = points.reduce((low, point) => (point.balance < low.balance ? point : low), points[0]);
  const budgetsOnHorizon = forecast.budgetTotal > 0 && state.include.budgets ? estimateBudgetPart(forecast, horizonEnd) : 0;
  const hasBudgets = appData.budgets.length > 0;
  const shownEvents = events.slice(0, 60);

  const content = html`
    <div class="info-box info-box-warning">
      ${icon('fa-triangle-exclamation')}
      <div>
        <p><strong>Estimation indicative.</strong> Ce solde prévisionnel est calculé à partir du solde actuel, des transactions récurrentes, des échéances, des transactions en attente et des budgets. Les montants réels peuvent varier.</p>
      </div>
    </div>

    <section class="card filters-card" aria-label="Paramètres de la prévision">
      <div class="forecast-controls">
        <fieldset class="forecast-include">
          <legend class="field-label">Éléments pris en compte</legend>
          ${FORECAST_INCLUDE_OPTIONS.map((option) => html`<label class="checkbox">
            <input type="checkbox" data-change-action="forecast-include" data-key="${option.key}" ${state.include[option.key] ? raw('checked') : ''} ${option.key === 'budgets' && !hasBudgets ? raw('disabled') : ''}>
            <span>${option.label}${option.key === 'budgets' && !hasBudgets ? ' (aucun budget)' : ''}</span>
          </label>`)}
        </fieldset>
        <div>
          <span class="field-label" id="forecast-horizon-label">Horizon du graphique</span>
          ${segmentedButtons('forecast-horizon', Object.entries(FORECAST_HORIZONS).map(([value, item]) => ({ value, label: item.label })), horizon, 'Horizon de prévision')}
        </div>
      </div>
    </section>

    <section class="kpi-grid kpi-grid-5" aria-label="Soldes estimés">
      ${kpiCard({ label: "Solde aujourd'hui", value: formatCurrency(forecast.startBalance), iconName: 'fa-scale-balanced', tone: 'primary', valueClass: forecast.startBalance < 0 ? 'is-negative' : '' })}
      ${Object.entries(FORECAST_HORIZONS).map(([key, item]) => {
        const value = pointAt(item.getEnd(today));
        return kpiCard({
          label: `Estimation à ${item.label}`,
          value: formatCurrency(value),
          iconName: 'fa-wand-magic-sparkles',
          tone: key === horizon ? 'savings' : 'neutral',
          valueClass: value < 0 ? 'is-negative' : '',
          footer: html`<span class="kpi-sub">${formatDate(item.getEnd(today))} · ${signedAmountHtml(roundMoney(value - forecast.startBalance))}</span>`,
        });
      })}
    </section>

    ${minPoint && minPoint.balance < settings.lowBalanceThreshold ? html`<div class="info-box info-box-danger">
      ${icon('fa-circle-exclamation')}
      <p>Attention : le solde estimé descend à <strong>${formatCurrency(minPoint.balance)}</strong> le ${formatDate(minPoint.date)}, sous votre seuil de solde faible (${formatCurrency(settings.lowBalanceThreshold)}).</p>
    </div>` : ''}

    <article class="card">
      <header class="card-header">
        <div>
          <h2 class="card-title">Solde prévisionnel — ${FORECAST_HORIZONS[horizon].label}</h2>
          <p class="card-subtitle">Du ${formatDate(today)} au ${formatDate(horizonEnd)} · estimation</p>
        </div>
      </header>
      <div class="chart-box chart-box-lg" id="forecast-chart"></div>
    </article>

    <article class="card card-flush">
      <header class="card-header card-header-padded">
        <div>
          <h2 class="card-title">Opérations prévues</h2>
          <p class="card-subtitle">${pluralize(events.length, 'opération', 'opérations')} jusqu'au ${formatDate(horizonEnd)}${budgetsOnHorizon ? ` · dépenses variables estimées (budgets) : ${formatCurrency(budgetsOnHorizon)}` : ''}</p>
        </div>
      </header>
      ${events.length ? html`<div class="table-wrap">
        <table class="table table-responsive">
          <caption class="sr-only">Opérations prévues sur l'horizon choisi</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">Libellé</th><th scope="col">Origine</th><th scope="col" class="text-right">Montant</th><th scope="col" class="text-right">Solde estimé (fin de journée)</th></tr></thead>
          <tbody>
            ${shownEvents.map((event) => {
              const source = PLANNED_SOURCES[event.source];
              return html`<tr>
                <td data-label="Date" class="nowrap">${formatDate(event.date)}</td>
                <td data-label="Libellé"><button type="button" class="cell-link" data-action="${source.action}" data-id="${event.refId}">${event.label}</button>${event.overdue ? html` ${badge('En retard', 'danger')}` : ''}</td>
                <td data-label="Origine">${badge(source.label, 'neutral', source.icon)}</td>
                <td data-label="Montant" class="text-right nowrap">${signedAmountHtml(event.amount)}</td>
                <td data-label="Solde estimé" class="text-right nowrap">${formatCurrency(pointAt(event.date))}</td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
      ${events.length > shownEvents.length ? html`<p class="table-note">… et ${pluralize(events.length - shownEvents.length, 'autre opération', 'autres opérations')} sur la période.</p>` : ''}` : html`<div class="card-body">${emptyState({
        iconName: 'fa-calendar-xmark',
        title: 'Aucune opération prévue sur cet horizon.',
        text: 'Ajoutez des transactions récurrentes ou des échéances pour affiner la prévision.',
        actionLabel: 'Nouvelle récurrence',
        action: 'new-recurring',
        compact: true,
      })}</div>`}
    </article>`;

  const afterRender = () => {
    const step = points.length > 120 ? 7 : 1;
    const sampled = points.filter((point, index) => index % step === 0 || index === points.length - 1);
    renderChart('forecast', 'forecast-chart', lineChartConfig(
      sampled.map((point) => formatDate(point.date, 'dayMonth')),
      [{ label: 'Solde estimé', data: sampled.map((point) => point.balance), color: 'savings', fill: true }],
      { legend: true, thresholds: [{ label: 'Seuil de solde faible', value: settings.lowBalanceThreshold }] },
    ), { isEmpty: !appData.accounts.length, emptyMessage: 'Créez un compte pour obtenir une prévision.', ariaLabel: `Solde prévisionnel sur ${FORECAST_HORIZONS[horizon].label}` });
  };
  return { content, afterRender };
}

/** Part des dépenses variables (budgets) comprise jusqu'à une date. */
function estimateBudgetPart(forecast, endDate) {
  // Différence entre l'évolution du solde et la somme des événements = part des budgets.
  const end = forecast.points.find((point) => point.date === endDate) || forecast.points[forecast.points.length - 1];
  const eventsTotal = sumBy(forecast.events.filter((event) => event.date <= end.date), (event) => event.amount);
  return Math.max(0, roundMoney(forecast.startBalance + eventsTotal - end.balance));
}

/* --------------------------------------------------------------------------
   Calendrier financier
   -------------------------------------------------------------------------- */

/** Opérations d'un mois : transactions saisies, récurrences à venir, échéances. */
function getCalendarItems(key) {
  const range = monthKeyToRange(key);
  const today = todayStr();
  const items = [];
  appData.transactions.forEach((transaction) => {
    if (!isInRange(transaction.date, range)) return;
    items.push({
      date: transaction.date, label: transaction.description, amount: transaction.amount, type: transaction.type,
      source: transaction.status === 'pending' ? 'pending' : transaction.date > today ? 'scheduled' : 'transaction', refId: transaction.id,
    });
  });
  appData.recurringTransactions.forEach((rule) => {
    if (!isRuleValid(rule)) return;
    getRuleOccurrences(rule, range.start, range.end).forEach((date) => items.push({
      date, label: rule.description, amount: rule.amount, type: rule.type, source: 'recurring', refId: rule.id,
    }));
  });
  appData.bills.forEach((bill) => {
    getBillOccurrences(bill, range.start, range.end).forEach((occurrence) => items.push({
      date: occurrence.date, label: bill.name, amount: bill.amount, type: 'expense', source: 'bill', refId: bill.id, overdue: occurrence.date < today,
    }));
    bill.history.forEach((payment) => {
      if (!payment.transactionId && isInRange(payment.paidDate, range)) {
        items.push({ date: payment.paidDate, label: `${bill.name} (payée)`, amount: payment.amount, type: 'expense', source: 'bill-paid', refId: bill.id });
      }
    });
  });
  return items;
}

const CALENDAR_ITEM_CLASS = { income: 'cal-income', expense: 'cal-expense', transfer: 'cal-transfer' };

function calendarPanel() {
  const state = viewState.forecast;
  const today = todayStr();
  if (!state.calendarMonth) state.calendarMonth = monthKey(today);
  if (!state.selectedDate || monthKey(state.selectedDate) !== state.calendarMonth) {
    state.selectedDate = monthKey(today) === state.calendarMonth ? today : `${state.calendarMonth}-01`;
  }
  const key = state.calendarMonth;
  const first = `${key}-01`;
  const gridStart = startOfWeek(first);
  const gridEnd = endOfWeek(endOfMonth(first));
  const items = getCalendarItems(key);
  const byDate = new Map();
  items.forEach((item) => {
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item);
  });

  const weekdays = [];
  for (let day = gridStart, i = 0; i < 7; day = addDays(day, 1), i += 1) weekdays.push(capitalize(formatDate(day, 'weekday').replace('.', '')));

  const cells = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    const dayItems = byDate.get(day) || [];
    const outside = monthKey(day) !== key;
    const net = sumBy(dayItems.filter((item) => item.type !== 'transfer' && item.source !== 'pending'), (item) => (item.type === 'income' ? item.amount : -item.amount));
    cells.push(html`<button type="button" class="calendar-day ${outside ? 'is-outside' : ''} ${day === today ? 'is-today' : ''} ${day === state.selectedDate ? 'is-selected' : ''}"
        data-action="calendar-select-day" data-date="${day}" aria-pressed="${day === state.selectedDate ? 'true' : 'false'}" ${day === today ? raw('aria-current="date"') : ''}
        aria-label="${capitalize(formatDate(day, 'long'))} : ${dayItems.length ? pluralize(dayItems.length, 'opération', 'opérations') : 'aucune opération'}">
      <span class="calendar-day-number">${Number(day.slice(8, 10))}</span>
      <span class="calendar-items" aria-hidden="true">
        ${dayItems.slice(0, 3).map((item) => html`<span class="cal-item ${CALENDAR_ITEM_CLASS[item.type]} ${item.source === 'bill' ? 'cal-bill' : ''} ${item.source === 'recurring' || item.source === 'scheduled' || item.source === 'pending' ? 'cal-planned' : ''}">${item.label}</span>`)}
        ${dayItems.length > 3 ? html`<span class="cal-more">+${dayItems.length - 3}</span>` : ''}
      </span>
      ${dayItems.length && net ? html`<span class="calendar-net ${net > 0 ? 'amount-positive' : 'amount-negative'}" aria-hidden="true">${formatCurrency(net, null, { compact: true, signDisplay: 'exceptZero' })}</span>` : ''}
    </button>`);
  }

  const selectedItems = (byDate.get(state.selectedDate) || []).sort((a, b) => a.type.localeCompare(b.type));
  const monthIncome = sumBy(items.filter((item) => item.type === 'income' && item.source !== 'pending'), (item) => item.amount);
  const monthExpense = sumBy(items.filter((item) => item.type === 'expense' && item.source !== 'pending'), (item) => item.amount);

  const content = html`
    <section class="calendar-layout">
      <article class="card calendar-card">
        <header class="calendar-header">
          <div class="month-nav" role="group" aria-label="Choix du mois">
            <button type="button" class="icon-btn icon-btn-bordered" data-action="calendar-nav" data-step="-1" aria-label="Mois précédent">${icon('fa-chevron-left')}</button>
            <h2 class="month-nav-label" aria-live="polite">${capitalize(formatMonthKey(key))}</h2>
            <button type="button" class="icon-btn icon-btn-bordered" data-action="calendar-nav" data-step="1" aria-label="Mois suivant">${icon('fa-chevron-right')}</button>
            ${key !== monthKey(today) ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="calendar-nav" data-step="0">Aujourd'hui</button>` : ''}
          </div>
          <div class="calendar-totals">
            <span>Revenus ${amountHtml(roundMoney(monthIncome), 'income')}</span>
            <span>Dépenses ${amountHtml(roundMoney(monthExpense), 'expense')}</span>
          </div>
        </header>
        <div class="calendar-legend" aria-label="Légende">
          <span><span class="legend-pill cal-income"></span>Revenu</span>
          <span><span class="legend-pill cal-expense"></span>Dépense</span>
          <span><span class="legend-pill cal-transfer"></span>Transfert</span>
          <span><span class="legend-pill cal-bill"></span>Échéance</span>
          <span><span class="legend-pill cal-planned"></span>Prévu (bordure pointillée)</span>
        </div>
        <div class="calendar-weekdays" aria-hidden="true">${weekdays.map((name) => html`<span>${name}</span>`)}</div>
        <div class="calendar-grid">${cells}</div>
      </article>
      <aside class="card calendar-details" aria-live="polite">
        <h2 class="card-title">${capitalize(formatDate(state.selectedDate, 'long'))}</h2>
        ${selectedItems.length ? html`<ul class="list">
          ${selectedItems.map((item) => {
            const source = PLANNED_SOURCES[item.source];
            return html`<li>
              <button type="button" class="list-row" data-action="${source.action}" data-id="${item.refId}">
                <span class="cat-icon" style="--cat-color:${item.type === 'income' ? 'var(--series-income)' : item.type === 'expense' ? 'var(--series-expense)' : NEUTRAL_COLOR}">${icon(source.icon)}</span>
                <span class="list-row-main">
                  <span class="list-row-title">${item.label}</span>
                  <span class="list-row-sub">${source.label}${item.overdue ? ' · en retard' : ''}</span>
                </span>
                ${amountHtml(item.amount, item.type)}
              </button>
            </li>`;
          })}
        </ul>` : html`<p class="text-muted small">Aucune opération ce jour-là.</p>`}
        <button type="button" class="btn btn-secondary btn-block mt-2" data-action="new-transaction" data-date="${state.selectedDate}">${icon('fa-plus')}<span>Ajouter une transaction à cette date</span></button>
      </aside>
    </section>`;

  return { content, afterRender: () => {} };
}

registerActions({
  'forecast-horizon': (element) => {
    viewState.forecast.horizon = FORECAST_HORIZONS[element.dataset.value] ? element.dataset.value : '3m';
    renderCurrentView();
  },
  'forecast-include': (element) => {
    viewState.forecast.include[element.dataset.key] = element.checked;
    renderCurrentView();
  },
  'calendar-nav': (element) => {
    const state = viewState.forecast;
    const step = Number(element.dataset.step);
    state.calendarMonth = step === 0 ? monthKey(todayStr()) : addMonthsToKey(state.calendarMonth || monthKey(todayStr()), step);
    state.selectedDate = null;
    renderCurrentView();
  },
  'calendar-select-day': (element) => {
    const date = element.dataset.date;
    const state = viewState.forecast;
    state.selectedDate = date;
    state.calendarMonth = monthKey(date);
    renderCurrentView();
    const selected = document.querySelector(`.calendar-day[data-date="${date}"]`);
    if (selected) selected.focus();
  },
});
