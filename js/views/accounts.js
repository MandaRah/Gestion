/* ==========================================================================
   views/accounts.js — Page Comptes
   ========================================================================== */
'use strict';

function renderAccounts(section) {
  const balances = calculateAccountBalances();
  const total = calculateBalance();
  const threshold = getSetting('lowBalanceThreshold');
  const lowCount = appData.accounts.filter((account) => (balances.get(account.id) ?? 0) < threshold).length;
  const operationCounts = new Map();
  appData.transactions.forEach((transaction) => {
    [transaction.accountId, transaction.toAccountId].forEach((id) => {
      if (id) operationCounts.set(id, (operationCounts.get(id) || 0) + 1);
    });
  });

  setHTML(section, html`
    ${pageHeader({
      title: 'Comptes',
      subtitle: 'Soldes calculés automatiquement à partir du solde initial et des transactions.',
      actions: html`${appData.accounts.length > 1 ? html`<button type="button" class="btn btn-secondary" data-action="new-transfer">${icon('fa-right-left')}<span>Nouveau transfert</span></button>` : ''}
        <button type="button" class="btn btn-primary" data-action="new-account">${icon('fa-plus')}<span>Nouveau compte</span></button>`,
    })}
    ${!appData.accounts.length ? html`<div class="card">${emptyState({
      iconName: 'fa-building-columns',
      title: 'Aucun compte pour le moment.',
      text: 'Ajoutez votre compte courant, votre épargne, vos espèces ou vos cartes.',
      actionLabel: 'Créer un compte',
      action: 'new-account',
    })}</div>` : html`
      <section class="kpi-grid kpi-grid-3" aria-label="Synthèse des comptes">
        ${kpiCard({ label: 'Total de tous les comptes', value: formatCurrency(total), iconName: 'fa-scale-balanced', tone: 'primary', valueClass: total < 0 ? 'is-negative' : '' })}
        ${kpiCard({ label: 'Nombre de comptes', value: formatNumber(appData.accounts.length), iconName: 'fa-building-columns', tone: 'neutral' })}
        ${kpiCard({ label: 'Comptes sous le seuil', value: formatNumber(lowCount), iconName: 'fa-triangle-exclamation', tone: lowCount ? 'expense' : 'income', footer: html`<span class="kpi-sub">Seuil : ${formatCurrency(threshold)}</span>` })}
      </section>
      ${hasMixedCurrencies() ? html`<div class="info-box info-box-warning">${icon('fa-circle-info')}<p>Certains comptes utilisent une devise différente de la devise principale : les totaux additionnent les montants sans conversion.</p></div>` : ''}
      <section class="grid grid-cards">
        ${appData.accounts.map((account) => {
          const balance = balances.get(account.id) ?? 0;
          const currency = getAccountCurrency(account.id);
          const type = ACCOUNT_TYPES[account.type];
          const low = balance < threshold;
          return html`<article class="card account-card" style="--account-color:${account.color}">
            <header class="account-head">
              <span class="account-icon" aria-hidden="true">${icon(type.icon)}</span>
              <div class="account-head-text">
                <h2 class="account-name">${account.name}</h2>
                <p class="small text-muted">${type.label}${account.currency ? ` · ${account.currency}` : ''}</p>
              </div>
              <div class="row-actions">
                <button type="button" class="icon-btn" data-action="edit-account" data-id="${account.id}" title="Modifier" aria-label="Modifier le compte ${account.name}">${icon('fa-pen')}</button>
                <button type="button" class="icon-btn icon-btn-danger" data-action="delete-account" data-id="${account.id}" title="Supprimer" aria-label="Supprimer le compte ${account.name}">${icon('fa-trash')}</button>
              </div>
            </header>
            <p class="account-balance ${balance < 0 ? 'is-negative' : ''}">${formatCurrency(balance, currency)}</p>
            <p class="small text-muted">Solde initial : ${formatCurrency(account.initialBalance, currency)} · ${pluralize(operationCounts.get(account.id) || 0, 'opération', 'opérations')}</p>
            ${account.description ? html`<p class="account-desc">${account.description}</p>` : ''}
            ${low ? html`<p>${badge(balance < 0 ? 'Solde négatif' : 'Solde faible', balance < 0 ? 'danger' : 'warning', 'fa-triangle-exclamation')}</p>` : ''}
            <footer class="account-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-action="show-account-transactions" data-id="${account.id}">${icon('fa-list')}<span>Transactions</span></button>
              ${appData.accounts.length > 1 ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="new-transfer" data-account-id="${account.id}">${icon('fa-right-left')}<span>Transférer</span></button>` : ''}
              <button type="button" class="btn btn-ghost btn-sm" data-action="new-transaction" data-account-id="${account.id}" aria-label="Ajouter une opération sur ${account.name}">${icon('fa-plus')}<span>Ajouter</span></button>
            </footer>
          </article>`;
        })}
      </section>`}`);
}
