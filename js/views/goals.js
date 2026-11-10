/* ==========================================================================
   views/goals.js — Page Objectifs financiers
   ========================================================================== */
'use strict';

const GOAL_STATUS_BADGES = {
  active: { label: 'En cours', variant: 'info', icon: 'fa-hourglass-half' },
  reached: { label: 'Atteint', variant: 'success', icon: 'fa-trophy' },
  overdue: { label: 'Date dépassée', variant: 'warning', icon: 'fa-clock' },
};

function renderGoals(section) {
  const goals = appData.goals.map((goal) => ({ goal, progress: calculateGoalProgress(goal) }));
  goals.sort((a, b) => (a.progress.status === 'reached') - (b.progress.status === 'reached')
    || (a.goal.targetDate || '9999').localeCompare(b.goal.targetDate || '9999'));

  const totalCurrent = roundMoney(sumBy(goals, (item) => item.progress.current));
  const totalTarget = roundMoney(sumBy(goals, (item) => item.progress.target));
  const reached = goals.filter((item) => item.progress.status === 'reached').length;
  const overallPercent = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

  setHTML(section, html`
    ${pageHeader({
      title: 'Objectifs',
      subtitle: 'Fixez des objectifs d’épargne et suivez votre progression.',
      actions: html`<button type="button" class="btn btn-primary" data-action="new-goal">${icon('fa-plus')}<span>Nouvel objectif</span></button>`,
    })}
    ${!goals.length ? html`<div class="card">${emptyState({
      iconName: 'fa-bullseye',
      title: 'Aucun objectif pour le moment.',
      text: "Fonds d'urgence, voyage, voiture, maison, ordinateur, investissement… créez votre premier objectif.",
      actionLabel: 'Créer un objectif',
      action: 'new-goal',
    })}</div>` : html`
      <section class="kpi-grid" aria-label="Synthèse des objectifs">
        ${kpiCard({ label: 'Total épargné', value: formatCurrency(totalCurrent), iconName: 'fa-piggy-bank', tone: 'savings' })}
        ${kpiCard({ label: 'Total des objectifs', value: formatCurrency(totalTarget), iconName: 'fa-flag-checkered', tone: 'primary' })}
        ${kpiCard({ label: 'Progression globale', value: formatPercent(overallPercent, { decimals: 0 }), iconName: 'fa-chart-simple', tone: 'income', footer: progressBar(overallPercent, overallPercent >= 100 ? 'reached' : 'normal', 'Progression globale des objectifs') })}
        ${kpiCard({ label: 'Objectifs atteints', value: `${reached} / ${goals.length}`, iconName: 'fa-trophy', tone: 'warning' })}
      </section>
      <section class="grid grid-cards">
        ${goals.map(({ goal, progress }) => goalCard(goal, progress))}
      </section>`}`);
}

function goalCard(goal, progress) {
  const status = GOAL_STATUS_BADGES[progress.status];
  const account = getAccount(goal.accountId);
  return html`<article class="card goal-card">
    <header class="goal-head">
      <span class="cat-icon cat-icon-lg" style="--cat-color:${goal.color}">${icon(goal.icon)}</span>
      <div class="goal-head-text">
        <h2 class="goal-name">${goal.name}</h2>
        <p class="goal-meta">${badge(status.label, status.variant, status.icon)}<span class="small text-muted">${account ? account.name : 'Aucun compte associé'}</span></p>
      </div>
      <span class="row-actions">
        <button type="button" class="icon-btn" data-action="edit-goal" data-id="${goal.id}" title="Modifier" aria-label="Modifier l'objectif ${goal.name}">${icon('fa-pen')}</button>
        <button type="button" class="icon-btn icon-btn-danger" data-action="delete-goal" data-id="${goal.id}" title="Supprimer" aria-label="Supprimer l'objectif ${goal.name}">${icon('fa-trash')}</button>
      </span>
    </header>
    ${goal.description ? html`<p class="goal-desc">${goal.description}</p>` : ''}
    <div class="goal-amounts">
      <span><strong>${formatCurrency(progress.current)}</strong> <span class="text-muted">/ ${formatCurrency(progress.target)}</span></span>
      <span class="goal-percent">${formatPercent(progress.percent, { decimals: 0 })}</span>
    </div>
    ${progressBar(progress.percent, progress.status === 'reached' ? 'reached' : 'normal', `Progression de ${goal.name}`)}
    <dl class="goal-stats">
      <div><dt>Restant</dt><dd>${formatCurrency(progress.remaining)}</dd></div>
      <div><dt>Temps restant</dt><dd>${formatShortDuration(progress.daysLeft)}</dd></div>
      <div><dt>Par mois</dt><dd>${progress.monthlyNeeded ? formatCurrency(progress.monthlyNeeded) : '—'}</dd></div>
    </dl>
    <footer class="goal-actions">
      <button type="button" class="btn btn-primary btn-sm" data-action="contribute-goal" data-id="${goal.id}">${icon('fa-plus')}<span>Ajouter un montant</span></button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="goal-history" data-id="${goal.id}">${icon('fa-clock-rotate-left')}<span>Historique (${goal.contributions.length})</span></button>
    </footer>
  </article>`;
}
