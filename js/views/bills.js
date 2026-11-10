/* ==========================================================================
   views/bills.js — Échéances et factures
   ========================================================================== */
'use strict';

const BILL_FILTERS = [
  { value: 'all', label: 'Toutes' },
  { value: 'upcoming', label: 'À venir' },
  { value: 'overdue', label: 'En retard' },
  { value: 'paid', label: 'Payées' },
];

function renderBills(section) {
  const state = viewState.bills;
  const today = todayStr();
  const currentMonth = getPresetRange('this-month');
  const bills = appData.bills.map((bill) => ({ bill, status: getBillStatus(bill) }));
  const unpaid = bills.filter((item) => item.status !== 'paid');
  const overdue = bills.filter((item) => item.status === 'overdue');
  const totalToPay = roundMoney(sumBy(unpaid, (item) => item.bill.amount));
  const dueSoon = roundMoney(sumBy(unpaid.filter((item) => item.bill.dueDate <= addDays(today, 30)), (item) => item.bill.amount));
  const paidThisMonth = roundMoney(sumBy(appData.bills.flatMap((bill) => bill.history).filter((payment) => isInRange(payment.paidDate, currentMonth)), (payment) => payment.amount));
  const counts = { all: bills.length, upcoming: 0, overdue: 0, paid: 0 };
  bills.forEach((item) => {
    counts[item.status] += 1;
  });
  const filtered = bills
    .filter((item) => state.filter === 'all' || item.status === state.filter)
    .sort((a, b) => (a.status === 'paid') - (b.status === 'paid') || a.bill.dueDate.localeCompare(b.bill.dueDate));
  const next = unpaid.sort((a, b) => a.bill.dueDate.localeCompare(b.bill.dueDate)).slice(0, 5);

  setHTML(section, html`
    ${pageHeader({
      title: 'Échéances',
      subtitle: 'Loyer, abonnements, assurances, crédits, factures : ne manquez plus aucun paiement.',
      actions: html`<button type="button" class="btn btn-primary" data-action="new-bill">${icon('fa-plus')}<span>Nouvelle échéance</span></button>`,
    })}
    ${!bills.length ? html`<div class="card">${emptyState({
      iconName: 'fa-file-invoice-dollar',
      title: 'Aucune échéance pour le moment.',
      text: 'Ajoutez vos paiements réguliers (loyer, électricité, internet, téléphone, assurances…) pour être alerté avant chaque échéance.',
      actionLabel: 'Ajouter une échéance',
      action: 'new-bill',
    })}</div>` : html`
      <section class="kpi-grid" aria-label="Synthèse des échéances">
        ${kpiCard({ label: 'Montant total à payer', value: formatCurrency(totalToPay), iconName: 'fa-file-invoice-dollar', tone: 'primary', footer: html`<span class="kpi-sub">${pluralize(unpaid.length, 'échéance non payée', 'échéances non payées')}</span>` })}
        ${kpiCard({ label: 'En retard', value: formatNumber(overdue.length), iconName: 'fa-circle-exclamation', tone: overdue.length ? 'expense' : 'income', footer: html`<span class="kpi-sub">${formatCurrency(sumBy(overdue, (item) => item.bill.amount))}</span>` })}
        ${kpiCard({ label: 'À payer sous 30 jours', value: formatCurrency(dueSoon), iconName: 'fa-clock', tone: 'warning' })}
        ${kpiCard({ label: 'Payé ce mois-ci', value: formatCurrency(paidThisMonth), iconName: 'fa-circle-check', tone: 'income' })}
      </section>

      ${next.length ? html`<article class="card">
        <header class="card-header"><h2 class="card-title">Prochaines échéances</h2></header>
        <ol class="timeline">
          ${next.map(({ bill, status }) => html`<li class="timeline-item ${status === 'overdue' ? 'is-overdue' : ''}">
            <span class="date-chip ${status === 'overdue' ? 'is-overdue' : ''}"><span>${formatDate(bill.dueDate, 'dayMonth')}</span></span>
            <div class="timeline-text">
              <p class="list-row-title">${bill.name}</p>
              <p class="list-row-sub">${status === 'overdue' ? `En retard · ${relativeDayLabel(bill.dueDate).toLowerCase()}` : relativeDayLabel(bill.dueDate)} · ${BILL_RECURRENCES[bill.recurrence]}</p>
            </div>
            <span class="amount amount-neutral">${formatCurrency(bill.amount)}</span>
            <button type="button" class="btn btn-secondary btn-sm" data-action="pay-bill" data-id="${bill.id}">${icon('fa-check')}<span>Marquer comme payé</span></button>
          </li>`)}
        </ol>
      </article>` : ''}

      <div class="toolbar">
        ${segmentedButtons('bills-filter', BILL_FILTERS.map((item) => ({ value: item.value, label: `${item.label} (${counts[item.value]})` })), state.filter, 'Filtrer les échéances')}
      </div>

      ${filtered.length ? html`<div class="card card-flush">
        <div class="table-wrap">
          <table class="table table-responsive">
            <caption class="sr-only">Liste des échéances</caption>
            <thead><tr>
              <th scope="col">Nom</th><th scope="col">Catégorie</th><th scope="col">Compte</th><th scope="col">Échéance</th>
              <th scope="col">Récurrence</th><th scope="col" class="text-right">Montant</th><th scope="col">Statut</th><th scope="col" class="text-right">Actions</th>
            </tr></thead>
            <tbody>
              ${filtered.map(({ bill, status }) => {
                const meta = BILL_STATUSES[status];
                return html`<tr class="${status === 'overdue' ? 'is-overdue' : ''}">
                  <td data-label="Nom">
                    <button type="button" class="cell-link" data-action="view-bill" data-id="${bill.id}">${bill.name}</button>
                    ${bill.notes ? html`<div class="cell-sub">${bill.notes}</div>` : ''}
                  </td>
                  <td data-label="Catégorie">${categoryChip(bill.categoryId)}</td>
                  <td data-label="Compte">${bill.accountId ? getAccountName(bill.accountId) : html`<span class="text-muted">—</span>`}</td>
                  <td data-label="Échéance"><span class="nowrap">${formatDate(bill.dueDate)}</span>${status === 'paid' ? '' : html`<div class="cell-sub">${relativeDayLabel(bill.dueDate)}</div>`}</td>
                  <td data-label="Récurrence">${BILL_RECURRENCES[bill.recurrence]}</td>
                  <td data-label="Montant" class="text-right nowrap"><strong>${formatCurrency(bill.amount)}</strong></td>
                  <td data-label="Statut">${badge(meta.label, meta.badge, meta.icon)}</td>
                  <td data-label="Actions" class="text-right">
                    <div class="row-actions">
                      ${status === 'paid'
                        ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="unpay-bill" data-id="${bill.id}">${icon('fa-rotate-left')}<span>Remettre à payer</span></button>`
                        : html`<button type="button" class="btn btn-secondary btn-sm" data-action="pay-bill" data-id="${bill.id}">${icon('fa-check')}<span>Marquer comme payé</span></button>`}
                      <button type="button" class="icon-btn" data-action="view-bill" data-id="${bill.id}" title="Détails" aria-label="Détails de ${bill.name}">${icon('fa-eye')}</button>
                      <button type="button" class="icon-btn" data-action="edit-bill" data-id="${bill.id}" title="Modifier" aria-label="Modifier ${bill.name}">${icon('fa-pen')}</button>
                      <button type="button" class="icon-btn icon-btn-danger" data-action="delete-bill" data-id="${bill.id}" title="Supprimer" aria-label="Supprimer ${bill.name}">${icon('fa-trash')}</button>
                    </div>
                  </td>
                </tr>`;
              })}
            </tbody>
          </table>
        </div>
      </div>` : html`<div class="card">${emptyState({ iconName: 'fa-filter', title: 'Aucune échéance dans cette catégorie.', compact: true })}</div>`}`}`);
}

registerActions({
  'bills-filter': (element) => {
    viewState.bills.filter = BILL_FILTERS.some((item) => item.value === element.dataset.value) ? element.dataset.value : 'all';
    renderCurrentView();
  },
});
