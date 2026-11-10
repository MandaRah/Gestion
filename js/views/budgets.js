/* ==========================================================================
   views/budgets.js — Page Budgets
   ========================================================================== */
'use strict';

function renderBudgets(section) {
  const state = viewState.budgets;
  const currentKey = monthKey(todayStr());
  if (!state.month) state.month = currentKey;
  const key = state.month;
  const settings = getSettings();
  const summary = calculateBudgetSummary(key);

  const budgets = appData.budgets
    .map((budget) => ({ budget, usage: calculateBudgetUsage(budget, key) }))
    .sort((a, b) => (a.budget.scope === 'global' ? -1 : 0) - (b.budget.scope === 'global' ? -1 : 0) || b.usage.percent - a.usage.percent);

  // Catégories dépensées ce mois-ci sans budget associé.
  const budgetedIds = new Set(appData.budgets.filter((b) => b.scope === 'category').map((b) => b.categoryId));
  const unbudgeted = groupByCategory('expense', monthKeyToRange(key)).filter((item) => item.id !== UNCATEGORIZED_ID && !budgetedIds.has(item.id));

  const monthNav = html`<div class="month-nav" role="group" aria-label="Choix du mois">
      <button type="button" class="icon-btn icon-btn-bordered" data-action="budget-month" data-step="-1" aria-label="Mois précédent">${icon('fa-chevron-left')}</button>
      <span class="month-nav-label" aria-live="polite">${capitalize(formatMonthKey(key))}</span>
      <button type="button" class="icon-btn icon-btn-bordered" data-action="budget-month" data-step="1" aria-label="Mois suivant">${icon('fa-chevron-right')}</button>
      ${key !== currentKey ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="budget-month" data-step="0">Mois en cours</button>` : ''}
    </div>`;

  setHTML(section, html`
    ${pageHeader({
      title: 'Budgets',
      subtitle: 'Fixez des plafonds mensuels et suivez leur utilisation en temps réel.',
      actions: html`${monthNav}<button type="button" class="btn btn-primary" data-action="new-budget">${icon('fa-plus')}<span>Nouveau budget</span></button>`,
    })}

    ${!appData.budgets.length ? html`<div class="card">${emptyState({
      iconName: 'fa-chart-pie',
      title: 'Aucun budget défini.',
      text: 'Créez un budget global ou par catégorie (ex. : Courses 500, Transport 300, Restaurant 200).',
      actionLabel: 'Créer un budget',
      action: 'new-budget',
    })}</div>` : html`
      ${summary ? html`<section class="card budget-summary">
        <div class="budget-summary-figures">
          <div><p class="kpi-label">Budget du mois</p><p class="budget-summary-value">${formatCurrency(summary.budgeted)}</p></div>
          <div><p class="kpi-label">Dépensé</p><p class="budget-summary-value">${formatCurrency(summary.spent)}</p></div>
          <div><p class="kpi-label">${summary.remaining >= 0 ? 'Restant' : 'Dépassement'}</p><p class="budget-summary-value ${summary.remaining < 0 ? 'is-negative' : ''}">${formatCurrency(Math.abs(summary.remaining))}</p></div>
          <div><p class="kpi-label">Utilisé</p><p class="budget-summary-value">${formatPercent(summary.percent, { decimals: 0 })}</p></div>
        </div>
        ${progressBar(summary.percent, summary.status, 'Utilisation du budget du mois')}
        <div class="budget-summary-foot">
          ${budgetStatusBadge(summary.status)}
          <span class="small text-muted">${summary.mode === 'global' ? 'Calculé sur le budget global (toutes les dépenses du mois).' : 'Calculé sur la somme des budgets par catégorie.'}</span>
        </div>
      </section>` : ''}

      <div class="legend-row" aria-label="Seuils d'alerte">
        <span class="legend-item"><span class="legend-swatch progress-normal"></span>Normal (&lt; ${settings.budgetWarningThreshold} %)</span>
        <span class="legend-item"><span class="legend-swatch progress-warning"></span>Attention (≥ ${settings.budgetWarningThreshold} %)</span>
        <span class="legend-item"><span class="legend-swatch progress-danger"></span>Danger (≥ ${settings.budgetDangerThreshold} %)</span>
        <span class="legend-item"><span class="legend-swatch progress-exceeded"></span>Dépassé (≥ 100 %)</span>
        <button type="button" class="link-btn" data-action="navigate" data-view="settings">Modifier les seuils</button>
      </div>

      <section class="grid grid-cards">
        ${budgets.map(({ budget, usage }) => budgetCard(budget, usage))}
      </section>

      ${unbudgeted.length ? html`<article class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title">Dépenses sans budget</h2>
            <p class="card-subtitle">Catégories dépensées en ${formatMonthKey(key)} sans budget dédié</p>
          </div>
        </header>
        <ul class="list">
          ${unbudgeted.map((item) => html`<li class="list-row list-row-static">
            <span class="cat-icon" style="--cat-color:${item.color}">${icon(item.icon)}</span>
            <span class="list-row-main"><span class="list-row-title">${item.name}</span><span class="list-row-sub">${pluralize(item.count, 'dépense', 'dépenses')}</span></span>
            <span class="amount amount-neutral">${formatCurrency(item.amount)}</span>
            <button type="button" class="btn btn-ghost btn-sm" data-action="new-budget" data-category-id="${item.id}">${icon('fa-plus')}<span>Créer un budget</span></button>
          </li>`)}
        </ul>
      </article>` : ''}`}`);
}

function budgetCard(budget, usage) {
  const category = getCategory(budget.categoryId);
  const label = getBudgetLabel(budget);
  return html`<article class="card budget-card">
    <header class="budget-card-head">
      ${budget.scope === 'global'
        ? html`<span class="cat-chip"><span class="cat-icon" style="--cat-color:#256abf">${icon('fa-globe')}</span><span><strong>Budget global</strong></span></span>`
        : category ? categoryChip(category.id) : html`<span class="cat-chip is-muted">${label}</span>`}
      <div class="row-actions">
        <button type="button" class="icon-btn" data-action="edit-budget" data-id="${budget.id}" title="Modifier" aria-label="Modifier le budget ${label}">${icon('fa-pen')}</button>
        <button type="button" class="icon-btn icon-btn-danger" data-action="delete-budget" data-id="${budget.id}" title="Supprimer" aria-label="Supprimer le budget ${label}">${icon('fa-trash')}</button>
      </div>
    </header>
    <p class="budget-amounts"><strong>${formatCurrency(usage.spent)}</strong> <span class="text-muted">dépensés sur ${formatCurrency(usage.budgeted)}</span></p>
    ${progressBar(usage.percent, usage.status, `Budget ${label}`)}
    <div class="budget-card-foot">
      ${budgetStatusBadge(usage.status)}
      <span class="small ${usage.remaining < 0 ? 'amount-negative' : 'text-muted'}">${usage.remaining >= 0 ? `Reste ${formatCurrency(usage.remaining)}` : `Dépassé de ${formatCurrency(-usage.remaining)}`}</span>
      <span class="budget-percent">${formatPercent(usage.percent, { decimals: 0 })}</span>
    </div>
  </article>`;
}

registerActions({
  'budget-month': (element) => {
    const step = Number(element.dataset.step);
    const state = viewState.budgets;
    state.month = step === 0 ? monthKey(todayStr()) : addMonthsToKey(state.month || monthKey(todayStr()), step);
    renderCurrentView();
  },
});
