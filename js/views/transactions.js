/* ==========================================================================
   views/transactions.js — Liste des transactions et transactions récurrentes
   ========================================================================== */
'use strict';

registerPeriodOwner('transactions', () => viewState.transactions.filters.period, () => {
  viewState.transactions.page = 1;
  renderCurrentView();
});

registerTabGroup('transactions', (tab) => {
  viewState.transactions.tab = tab;
  renderCurrentView();
});

const PAGE_SIZES = [10, 25, 50, 100];

/** Fonctions de tri des colonnes. */
const TRANSACTION_SORTERS = {
  date: (a, b) => a.date.localeCompare(b.date),
  amount: (a, b) => a.amount - b.amount,
  category: (a, b) => getCategoryName(a.categoryId, a.type).localeCompare(getCategoryName(b.categoryId, b.type), 'fr'),
  type: (a, b) => TRANSACTION_TYPES[a.type].label.localeCompare(TRANSACTION_TYPES[b.type].label, 'fr'),
};

function renderTransactions(section) {
  const state = viewState.transactions;
  const tabs = [
    { value: 'all', label: 'Toutes les transactions', icon: 'fa-list', count: appData.transactions.length },
    { value: 'recurring', label: 'Récurrentes', icon: 'fa-repeat', count: appData.recurringTransactions.length },
  ];
  const actions = state.tab === 'all'
    ? html`<button type="button" class="btn btn-secondary" data-action="tx-export-filtered">${icon('fa-file-csv')}<span>Exporter CSV</span></button>
      <button type="button" class="btn btn-primary" data-action="new-transaction">${icon('fa-plus')}<span>Nouvelle transaction</span></button>`
    : html`<button type="button" class="btn btn-secondary" data-action="generate-recurring">${icon('fa-rotate')}<span>Générer les transactions dues</span></button>
      <button type="button" class="btn btn-primary" data-action="new-recurring">${icon('fa-plus')}<span>Nouvelle récurrence</span></button>`;

  setHTML(section, html`
    ${pageHeader({ title: 'Transactions', subtitle: 'Consultez, filtrez et gérez toutes vos opérations.', actions })}
    ${tabsHtml('transactions', tabs, state.tab, 'Listes de transactions')}
    <div id="panel-transactions" role="tabpanel" aria-labelledby="tab-transactions-${state.tab}">
      ${state.tab === 'all' ? transactionFiltersHtml() : recurringPanelHtml()}
    </div>`);

  if (state.tab === 'all') renderTransactionTable();
}

/* --------------------------------------------------------------------------
   Filtres
   -------------------------------------------------------------------------- */

function transactionFiltersHtml() {
  const filters = viewState.transactions.filters;
  const option = (value, label, selected) => html`<option value="${value}" ${value === selected ? raw('selected') : ''}>${label}</option>`;
  return html`<section class="card filters-card" aria-label="Filtres des transactions">
      <div class="filters-grid">
        <div class="field field-search">
          <label class="field-label" for="tx-search">Recherche instantanée</label>
          <div class="input-icon">
            ${icon('fa-magnifying-glass')}
            <input type="search" id="tx-search" class="input" value="${filters.search}" placeholder="Description, tag, montant…" autocomplete="off" data-input-action="tx-filter" data-filter="search">
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="tx-type">Type</label>
          <select id="tx-type" class="input" data-change-action="tx-filter" data-filter="type">
            ${option('', 'Tous les types', filters.type)}
            ${Object.entries(TRANSACTION_TYPES).map(([value, type]) => option(value, type.plural, filters.type))}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="tx-category">Catégorie</label>
          <select id="tx-category" class="input" data-change-action="tx-filter" data-filter="categoryId">
            ${option('', 'Toutes les catégories', filters.categoryId)}
            <optgroup label="Dépenses">${getCategoriesByType('expense').map((category) => option(category.id, category.name, filters.categoryId))}</optgroup>
            <optgroup label="Revenus">${getCategoriesByType('income').map((category) => option(category.id, category.name, filters.categoryId))}</optgroup>
            ${option(UNCATEGORIZED_ID, 'Non catégorisé', filters.categoryId)}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="tx-account">Compte</label>
          <select id="tx-account" class="input" data-change-action="tx-filter" data-filter="accountId">
            ${option('', 'Tous les comptes', filters.accountId)}
            ${appData.accounts.map((account) => option(account.id, account.name, filters.accountId))}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="tx-status">Statut</label>
          <select id="tx-status" class="input" data-change-action="tx-filter" data-filter="status">
            ${option('', 'Tous les statuts', filters.status)}
            ${Object.entries(TRANSACTION_STATUSES).map(([value, status]) => option(value, status.label, filters.status))}
          </select>
        </div>
        <div class="field field-period">
          <span class="field-label">Période</span>
          ${periodPickerHtml('transactions', filters.period, { allowAll: true, label: 'Période des transactions' })}
        </div>
        <div class="field">
          <label class="field-label" for="tx-min">Montant minimum</label>
          <input type="text" inputmode="decimal" id="tx-min" class="input" value="${filters.minAmount}" placeholder="0" autocomplete="off" data-input-action="tx-filter" data-filter="minAmount">
        </div>
        <div class="field">
          <label class="field-label" for="tx-max">Montant maximum</label>
          <input type="text" inputmode="decimal" id="tx-max" class="input" value="${filters.maxAmount}" placeholder="∞" autocomplete="off" data-input-action="tx-filter" data-filter="maxAmount">
        </div>
        <div class="field field-reset">
          <button type="button" class="btn btn-ghost" data-action="tx-reset-filters" ${hasActiveTransactionFilters() ? '' : raw('disabled')}>${icon('fa-filter-circle-xmark')}<span>Réinitialiser</span></button>
        </div>
      </div>
    </section>
    <div id="tx-summary" class="summary-strip" aria-live="polite"></div>
    <div id="tx-table-container"></div>`;
}

function hasActiveTransactionFilters() {
  const filters = viewState.transactions.filters;
  return Boolean(filters.search || filters.type || filters.categoryId || filters.accountId || filters.status || filters.minAmount || filters.maxAmount || filters.period.preset !== 'all');
}

function getFilteredTransactions() {
  const filters = viewState.transactions.filters;
  return filterTransactions({ ...filters, range: getPresetRange(filters.period.preset, filters.period) });
}

/** Affiche la page Transactions avec des filtres prédéfinis. */
function showTransactionsWithFilters(filters = {}) {
  const state = viewState.transactions;
  state.filters = { ...createDefaultTransactionFilters(), ...filters };
  state.tab = 'all';
  state.page = 1;
  if (viewState.currentView === 'transactions') renderCurrentView();
  else navigate('transactions');
}

/* --------------------------------------------------------------------------
   Tableau
   -------------------------------------------------------------------------- */

function sortHeader(key, label, extraClass = '') {
  const { sort } = viewState.transactions;
  const active = sort.key === key;
  const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  const iconName = active ? (sort.direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort';
  return html`<th scope="col" class="${extraClass}" aria-sort="${ariaSort}">
    <button type="button" class="th-sort ${active ? 'is-active' : ''}" data-action="tx-sort" data-key="${key}">${label}${icon(iconName)}</button>
  </th>`;
}

function transactionRow(transaction) {
  const status = TRANSACTION_STATUSES[transaction.status];
  const label = transaction.description;
  return html`<tr class="${transaction.status === 'pending' ? 'is-pending' : ''}">
    <td data-label="Date" class="nowrap">${formatDate(transaction.date)}</td>
    <td data-label="Description">
      <div class="cell-main">
        <button type="button" class="cell-link" data-action="view-transaction" data-id="${transaction.id}">${label}</button>
        ${transaction.recurringId ? html`<span class="mini-icon" title="Transaction récurrente">${icon('fa-repeat')}<span class="sr-only">(récurrente)</span></span>` : ''}
        ${transaction.billId ? html`<span class="mini-icon" title="Paiement d'échéance">${icon('fa-file-invoice-dollar')}<span class="sr-only">(échéance)</span></span>` : ''}
      </div>
      ${transaction.tags.length ? html`<div class="cell-tags">${transaction.tags.map((tag) => html`<span class="tag">#${tag}</span>`)}</div>` : ''}
    </td>
    <td data-label="Catégorie">${categoryChip(transaction.categoryId, transaction.type)}</td>
    <td data-label="Compte">${transaction.type === 'transfer'
      ? html`<span>${getAccountName(transaction.accountId)} ${icon('fa-arrow-right', 'text-muted')} ${getAccountName(transaction.toAccountId)}</span>`
      : getAccountName(transaction.accountId)}</td>
    <td data-label="Type">${typeBadge(transaction.type)}</td>
    <td data-label="Montant" class="text-right nowrap">${amountHtml(transaction.amount, transaction.type, getAccountCurrency(transaction.accountId))}</td>
    <td data-label="Statut">${badge(status.label, status.badge)}</td>
    <td data-label="Actions" class="text-right">
      <div class="row-actions">
        <button type="button" class="icon-btn" data-action="view-transaction" data-id="${transaction.id}" title="Voir" aria-label="Voir « ${label} »">${icon('fa-eye')}</button>
        <button type="button" class="icon-btn" data-action="edit-transaction" data-id="${transaction.id}" title="Modifier" aria-label="Modifier « ${label} »">${icon('fa-pen')}</button>
        <button type="button" class="icon-btn" data-action="duplicate-transaction" data-id="${transaction.id}" title="Dupliquer" aria-label="Dupliquer « ${label} »">${icon('fa-copy')}</button>
        <button type="button" class="icon-btn icon-btn-danger" data-action="delete-transaction" data-id="${transaction.id}" title="Supprimer" aria-label="Supprimer « ${label} »">${icon('fa-trash')}</button>
      </div>
    </td>
  </tr>`;
}

/** Rendu du tableau seul (appelé à chaque changement de filtre, sans perdre le focus). */
function renderTransactionTable() {
  const container = document.getElementById('tx-table-container');
  const summary = document.getElementById('tx-summary');
  if (!container || !summary) return;
  const state = viewState.transactions;
  const list = getFilteredTransactions();
  const sorter = TRANSACTION_SORTERS[state.sort.key] || TRANSACTION_SORTERS.date;
  const direction = state.sort.direction === 'asc' ? 1 : -1;
  list.sort((a, b) => direction * sorter(a, b) || b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  // Synthèse des résultats filtrés (transactions comptabilisées uniquement).
  const counted = list.filter(isCounted);
  const income = roundMoney(sumBy(counted.filter((t) => t.type === 'income'), (t) => t.amount));
  const expenses = roundMoney(sumBy(counted.filter((t) => t.type === 'expense'), (t) => t.amount));
  const pendingCount = list.length - counted.length;
  setHTML(summary, list.length ? html`
    <span><strong>${pluralize(list.length, 'transaction', 'transactions')}</strong></span>
    <span>Revenus ${amountHtml(income, 'income')}</span>
    <span>Dépenses ${amountHtml(expenses, 'expense')}</span>
    <span>Solde net ${signedAmountHtml(roundMoney(income - expenses))}</span>
    ${pendingCount ? html`<span class="text-muted">dont ${pluralize(pendingCount, 'en attente non comptabilisée', 'en attente non comptabilisées')}</span>` : ''}` : '');

  const resetButton = document.querySelector('[data-action="tx-reset-filters"]');
  if (resetButton) resetButton.disabled = !hasActiveTransactionFilters();

  if (!appData.transactions.length) {
    setHTML(container, html`<div class="card">${emptyState({ iconName: 'fa-receipt', title: 'Aucune transaction pour le moment.', text: 'Ajoutez votre premier revenu ou votre première dépense.', actionLabel: 'Ajouter une transaction', action: 'new-transaction' })}</div>`);
    return;
  }
  if (!list.length) {
    setHTML(container, html`<div class="card">${emptyState({ iconName: 'fa-filter', title: 'Aucune transaction ne correspond à vos filtres.', text: 'Modifiez la recherche ou réinitialisez les filtres.', actionLabel: 'Réinitialiser les filtres', action: 'tx-reset-filters', actionIcon: 'fa-filter-circle-xmark' })}</div>`);
    return;
  }

  const pageCount = Math.max(1, Math.ceil(list.length / state.pageSize));
  state.page = clamp(state.page, 1, pageCount);
  const start = (state.page - 1) * state.pageSize;
  const pageItems = list.slice(start, start + state.pageSize);

  setHTML(container, html`<div class="card card-flush">
    <div class="table-wrap">
      <table class="table table-responsive">
        <caption class="sr-only">Transactions filtrées, triées par ${state.sort.key}</caption>
        <thead>
          <tr>
            ${sortHeader('date', 'Date')}
            <th scope="col">Description</th>
            ${sortHeader('category', 'Catégorie')}
            <th scope="col">Compte</th>
            ${sortHeader('type', 'Type')}
            ${sortHeader('amount', 'Montant', 'text-right')}
            <th scope="col">Statut</th>
            <th scope="col" class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>${pageItems.map(transactionRow)}</tbody>
      </table>
    </div>
    <div class="pagination">
      <p class="pagination-info">Affichage ${formatNumber(start + 1)}–${formatNumber(start + pageItems.length)} sur ${formatNumber(list.length)}</p>
      <div class="pagination-controls">
        <label class="sr-only" for="tx-page-size">Transactions par page</label>
        <select id="tx-page-size" class="input input-sm" data-change-action="tx-page-size">
          ${PAGE_SIZES.map((size) => html`<option value="${size}" ${size === state.pageSize ? raw('selected') : ''}>${size} par page</option>`)}
        </select>
        <button type="button" class="icon-btn icon-btn-bordered" data-action="tx-page" data-page="${state.page - 1}" ${state.page <= 1 ? raw('disabled') : ''} aria-label="Page précédente">${icon('fa-chevron-left')}</button>
        <span class="pagination-page">Page ${state.page} / ${pageCount}</span>
        <button type="button" class="icon-btn icon-btn-bordered" data-action="tx-page" data-page="${state.page + 1}" ${state.page >= pageCount ? raw('disabled') : ''} aria-label="Page suivante">${icon('fa-chevron-right')}</button>
      </div>
    </div>
  </div>`);
}

const renderTransactionTableDebounced = debounce(renderTransactionTable, 150);

/* --------------------------------------------------------------------------
   Onglet « Récurrentes »
   -------------------------------------------------------------------------- */

function recurringPanelHtml() {
  const rules = [...appData.recurringTransactions].sort((a, b) => (a.nextDate || '9999').localeCompare(b.nextDate || '9999'));
  if (!rules.length) {
    return html`<div class="card">${emptyState({
      iconName: 'fa-repeat',
      title: 'Aucune transaction récurrente.',
      text: 'Automatisez salaires, loyers et abonnements : chaque occurrence est créée automatiquement à sa date.',
      actionLabel: 'Créer une récurrence',
      action: 'new-recurring',
    })}</div>`;
  }
  const running = rules.filter((rule) => getRuleStatus(rule).key === 'active');
  const monthlyIncome = roundMoney(sumBy(running.filter((r) => r.type === 'income'), getMonthlyEquivalent));
  const monthlyExpense = roundMoney(sumBy(running.filter((r) => r.type === 'expense'), getMonthlyEquivalent));
  const today = todayStr();

  return html`
    <div class="info-box">
      ${icon('fa-circle-info')}
      <p>Les occurrences arrivées à échéance sont générées automatiquement à l'ouverture de l'application, sans jamais créer de doublon. Vous pouvez aussi lancer la génération manuellement.</p>
    </div>
    <section class="kpi-grid kpi-grid-3" aria-label="Impact mensuel des récurrences">
      ${kpiCard({ label: 'Revenus récurrents / mois', value: formatCurrency(monthlyIncome), iconName: 'fa-arrow-trend-up', tone: 'income' })}
      ${kpiCard({ label: 'Dépenses récurrentes / mois', value: formatCurrency(monthlyExpense), iconName: 'fa-arrow-trend-down', tone: 'expense' })}
      ${kpiCard({ label: 'Solde récurrent / mois', value: formatCurrency(monthlyIncome - monthlyExpense), iconName: 'fa-scale-balanced', tone: 'primary', valueClass: monthlyIncome - monthlyExpense < 0 ? 'is-negative' : '' })}
    </section>
    <div class="card card-flush">
      <div class="table-wrap">
        <table class="table table-responsive">
          <caption class="sr-only">Transactions récurrentes</caption>
          <thead>
            <tr>
              <th scope="col">Nom</th>
              <th scope="col">Type</th>
              <th scope="col" class="text-right">Montant</th>
              <th scope="col">Fréquence</th>
              <th scope="col">Prochaine date</th>
              <th scope="col">Compte</th>
              <th scope="col">Statut</th>
              <th scope="col" class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rules.map((rule) => {
              const status = getRuleStatus(rule);
              const following = status.key === 'active' ? getRuleOccurrences(rule, today, addMonths(today, 36), 3).slice(1) : [];
              return html`<tr>
                <td data-label="Nom">
                  <div class="cell-main"><span class="cell-title">${rule.description}</span></div>
                  <div class="cell-sub">${rule.type === 'transfer' ? 'Transfert interne' : getCategoryName(rule.categoryId)}</div>
                </td>
                <td data-label="Type">${typeBadge(rule.type)}</td>
                <td data-label="Montant" class="text-right nowrap">${amountHtml(rule.amount, rule.type, getAccountCurrency(rule.accountId))}</td>
                <td data-label="Fréquence">${FREQUENCIES[rule.frequency]}</td>
                <td data-label="Prochaine date">
                  ${rule.nextDate && rule.active ? html`<span class="nowrap">${formatDate(rule.nextDate)}</span>
                    <div class="cell-sub">${relativeDayLabel(rule.nextDate)}${following.length ? ` · puis ${following.map((date) => formatDate(date, 'dayMonth')).join(', ')}` : ''}</div>` : html`<span class="text-muted">—</span>`}
                </td>
                <td data-label="Compte">${rule.type === 'transfer' ? html`<span class="nowrap">${getAccountName(rule.accountId)} ${icon('fa-arrow-right', 'text-muted')} ${getAccountName(rule.toAccountId)}</span>` : getAccountName(rule.accountId)}</td>
                <td data-label="Statut">${badge(status.label, status.badge)}</td>
                <td data-label="Actions" class="text-right">
                  <div class="row-actions">
                    <button type="button" class="icon-btn" data-action="edit-recurring" data-id="${rule.id}" title="Modifier" aria-label="Modifier « ${rule.description} »">${icon('fa-pen')}</button>
                    ${rule.nextDate ? html`<button type="button" class="icon-btn" data-action="toggle-recurring" data-id="${rule.id}" title="${rule.active ? 'Suspendre' : 'Réactiver'}" aria-label="${rule.active ? 'Suspendre' : 'Réactiver'} « ${rule.description} »">${icon(rule.active ? 'fa-pause' : 'fa-play')}</button>` : ''}
                    <button type="button" class="icon-btn icon-btn-danger" data-action="delete-recurring" data-id="${rule.id}" title="Supprimer" aria-label="Supprimer « ${rule.description} »">${icon('fa-trash')}</button>
                  </div>
                </td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* --------------------------------------------------------------------------
   Actions
   -------------------------------------------------------------------------- */

registerActions({
  'tx-filter': (element, event) => {
    const key = element.dataset.filter;
    viewState.transactions.filters[key] = element.value;
    viewState.transactions.page = 1;
    if (event && event.type === 'input') renderTransactionTableDebounced();
    else renderTransactionTable();
  },
  'tx-sort': (element) => {
    const { sort } = viewState.transactions;
    const key = element.dataset.key;
    if (sort.key === key) sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
    else {
      sort.key = key;
      sort.direction = key === 'date' || key === 'amount' ? 'desc' : 'asc';
    }
    renderTransactionTable();
    const header = document.querySelector(`[data-action="tx-sort"][data-key="${key}"]`);
    if (header) header.focus();
  },
  'tx-page': (element) => {
    viewState.transactions.page = Number(element.dataset.page) || 1;
    renderTransactionTable();
    const container = document.getElementById('tx-table-container');
    if (container) container.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  },
  'tx-page-size': (element) => {
    viewState.transactions.pageSize = PAGE_SIZES.includes(Number(element.value)) ? Number(element.value) : 25;
    viewState.transactions.page = 1;
    renderTransactionTable();
  },
  'tx-reset-filters': () => {
    viewState.transactions.filters = createDefaultTransactionFilters();
    viewState.transactions.page = 1;
    renderCurrentView();
    showToast('Filtres réinitialisés.', 'info');
  },
  'tx-export-filtered': () => {
    exportCSV(getFilteredTransactions(), hasActiveTransactionFilters() ? '-filtrees' : '');
  },
  'show-account-transactions': (element) => showTransactionsWithFilters({ accountId: element.dataset.id }),
  'show-category-transactions': (element) => showTransactionsWithFilters({ categoryId: element.dataset.id }),
  'show-type-transactions': (element) => showTransactionsWithFilters({ type: element.dataset.type }),
});
