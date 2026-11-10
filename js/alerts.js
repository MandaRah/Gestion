/* ==========================================================================
   alerts.js — Système d'alertes interne
   --------------------------------------------------------------------------
   Les alertes sont calculées à partir des données (budgets, échéances,
   soldes, objectifs, dépenses inhabituelles). Chaque alerte possède une clé
   stable : une alerte lue reste lue tant que la situation ne change pas.
   ========================================================================== */
'use strict';

const ALERT_SEVERITY_ORDER = { danger: 0, warning: 1, info: 2 };

/** Calcule la liste des alertes actives. */
function computeAlerts() {
  if (!appData) return [];
  const settings = getSettings();
  const today = todayStr();
  const currentMonth = monthKey(today);
  const alerts = [];

  // Budgets du mois en cours.
  appData.budgets.forEach((budget) => {
    if (budget.scope === 'category' && !getCategory(budget.categoryId)) return;
    const usage = calculateBudgetUsage(budget, currentMonth);
    const name = getBudgetLabel(budget);
    if (usage.status === 'exceeded') {
      alerts.push({
        key: `budget:${budget.id}:${currentMonth}:exceeded`, severity: 'danger', iconName: 'fa-circle-xmark', view: 'budgets',
        title: 'Budget dépassé',
        message: `${name} : ${formatCurrency(usage.spent)} dépensés pour ${formatCurrency(usage.budgeted)} prévus (${formatPercent(usage.percent, { decimals: 0 })}).`,
      });
    } else if (usage.status === 'danger' || usage.status === 'warning') {
      alerts.push({
        key: `budget:${budget.id}:${currentMonth}:${usage.status}`, severity: usage.status === 'danger' ? 'danger' : 'warning', iconName: 'fa-triangle-exclamation', view: 'budgets',
        title: 'Budget bientôt dépassé',
        message: `${name} : ${formatPercent(usage.percent, { decimals: 0 })} utilisés, il reste ${formatCurrency(usage.remaining)}.`,
      });
    }
  });

  // Échéances en retard ou proches.
  appData.bills.forEach((bill) => {
    if (bill.status === 'paid') return;
    const days = daysBetween(today, bill.dueDate);
    if (days < 0) {
      alerts.push({
        key: `bill:${bill.id}:${bill.dueDate}:overdue`, severity: 'danger', iconName: 'fa-file-circle-exclamation', view: 'bills',
        title: 'Échéance en retard',
        message: `${bill.name} (${formatCurrency(bill.amount)}) était due le ${formatDate(bill.dueDate)}.`,
      });
    } else if (days <= settings.billReminderDays) {
      alerts.push({
        key: `bill:${bill.id}:${bill.dueDate}:soon`, severity: 'warning', iconName: 'fa-clock', view: 'bills',
        title: 'Échéance proche',
        message: `${bill.name} (${formatCurrency(bill.amount)}) : ${relativeDayLabel(bill.dueDate).toLowerCase()}, le ${formatDate(bill.dueDate)}.`,
      });
    }
  });

  // Soldes faibles.
  const balances = calculateAccountBalances();
  appData.accounts.forEach((account) => {
    const balance = balances.get(account.id) ?? 0;
    if (balance < settings.lowBalanceThreshold) {
      alerts.push({
        key: `balance:${account.id}`, severity: balance < 0 ? 'danger' : 'warning', iconName: 'fa-wallet', view: 'accounts',
        title: balance < 0 ? 'Solde négatif' : 'Solde faible',
        message: `${account.name} : ${formatCurrency(balance, getAccountCurrency(account.id))} (seuil : ${formatCurrency(settings.lowBalanceThreshold)}).`,
      });
    }
  });

  // Objectifs bientôt atteints.
  appData.goals.forEach((goal) => {
    const progress = calculateGoalProgress(goal);
    if (progress.percent >= 90 && progress.percent < 100) {
      alerts.push({
        key: `goal:${goal.id}:near`, severity: 'info', iconName: 'fa-flag-checkered', view: 'goals',
        title: 'Objectif bientôt atteint',
        message: `${goal.name} : ${formatPercent(progress.percent, { decimals: 0 })} atteints, plus que ${formatCurrency(progress.remaining)}.`,
      });
    }
  });

  // Dépenses inhabituellement importantes (14 derniers jours).
  findUnusualExpenses(14).forEach(({ transaction, average }) => {
    alerts.push({
      key: `unusual:${transaction.id}`, severity: 'warning', iconName: 'fa-magnifying-glass-dollar', view: 'transactions', transactionId: transaction.id,
      title: 'Dépense inhabituelle',
      message: `${transaction.description} : ${formatCurrency(transaction.amount)} le ${formatDate(transaction.date)} (moyenne de la catégorie : ${formatCurrency(average)}).`,
    });
  });

  return alerts.sort((a, b) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity]);
}

function isAlertRead(key) {
  return appData.meta.readAlerts.includes(key);
}

/** Marque des alertes comme lues et purge les clés devenues inactives. */
function markAlertsRead(keys) {
  const activeKeys = new Set(computeAlerts().map((alert) => alert.key));
  const read = new Set(appData.meta.readAlerts.filter((key) => activeKeys.has(key)));
  keys.forEach((key) => read.add(key));
  appData.meta.readAlerts = [...read];
  saveData();
}

/** Met à jour le compteur de la cloche et le panneau s'il est ouvert. */
function updateAlertsBadge() {
  const alerts = computeAlerts();
  const unread = alerts.filter((alert) => !isAlertRead(alert.key)).length;
  const badgeElement = document.getElementById('alerts-count');
  const toggle = document.getElementById('alerts-toggle');
  if (badgeElement) {
    badgeElement.textContent = unread > 9 ? '9+' : String(unread);
    badgeElement.hidden = unread === 0;
  }
  if (toggle) {
    toggle.setAttribute('aria-label', unread ? `Alertes : ${pluralize(unread, 'non lue', 'non lues')}` : 'Alertes : aucune alerte non lue');
  }
  const panel = document.getElementById('alerts-panel');
  if (panel && !panel.hidden) renderAlertsPanel(alerts);
}

function renderAlertsPanel(alerts = computeAlerts()) {
  const panel = document.getElementById('alerts-panel');
  if (!panel) return;
  const unread = alerts.filter((alert) => !isAlertRead(alert.key)).length;
  setHTML(panel, html`
    <div class="alerts-header">
      <h2 class="alerts-title">Alertes ${unread ? html`<span class="badge badge-danger">${unread}</span>` : ''}</h2>
      ${unread ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="mark-all-alerts-read">Tout marquer comme lu</button>` : ''}
    </div>
    ${alerts.length ? html`<ul class="alerts-list">
      ${alerts.map((alert) => html`<li>
        <button type="button" class="alert-item alert-${alert.severity} ${isAlertRead(alert.key) ? 'is-read' : ''}" data-action="open-alert" data-key="${alert.key}">
          <span class="alert-icon" aria-hidden="true">${icon(alert.iconName)}</span>
          <span class="alert-body">
            <span class="alert-item-title">${alert.title}${isAlertRead(alert.key) ? '' : html`<span class="sr-only"> (non lue)</span><span class="unread-dot" aria-hidden="true"></span>`}</span>
            <span class="alert-item-message">${alert.message}</span>
          </span>
        </button>
      </li>`)}
    </ul>` : html`<div class="alerts-empty">${icon('fa-circle-check')}<p>Aucune alerte : tout est en ordre.</p></div>`}`);
}

function toggleAlertsPanel(forceOpen = null) {
  const panel = document.getElementById('alerts-panel');
  const toggle = document.getElementById('alerts-toggle');
  if (!panel || !toggle) return;
  const open = forceOpen === null ? panel.hidden : forceOpen;
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) {
    renderAlertsPanel();
    const first = panel.querySelector('button');
    if (first) first.focus();
  }
}

registerActions({
  'toggle-alerts': () => toggleAlertsPanel(),
  'mark-all-alerts-read': () => {
    markAlertsRead(computeAlerts().map((alert) => alert.key));
    updateAlertsBadge();
    renderAlertsPanel();
    showToast('Toutes les alertes ont été marquées comme lues.', 'info');
  },
  'open-alert': (element) => {
    const alert = computeAlerts().find((item) => item.key === element.dataset.key);
    if (!alert) return;
    markAlertsRead([alert.key]);
    toggleAlertsPanel(false);
    updateAlertsBadge();
    if (alert.transactionId) {
      openTransactionDetails(alert.transactionId);
    } else {
      navigate(alert.view);
    }
  },
});
