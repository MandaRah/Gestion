/* ==========================================================================
   views/categories.js — Gestionnaire de catégories
   ========================================================================== */
'use strict';

registerTabGroup('categories', (tab) => {
  viewState.categories.tab = tab === 'income' ? 'income' : 'expense';
  renderCurrentView();
});

function renderCategories(section) {
  const tab = viewState.categories.tab;
  const categories = getCategoriesByType(tab);
  const monthRange = getPresetRange('this-month');
  const stats = new Map();
  appData.transactions.forEach((transaction) => {
    if (!transaction.categoryId) return;
    const entry = stats.get(transaction.categoryId) || { count: 0, month: 0 };
    entry.count += 1;
    if (isCounted(transaction) && isInRange(transaction.date, monthRange)) entry.month += transaction.amount;
    stats.set(transaction.categoryId, entry);
  });
  const tabs = [
    { value: 'expense', label: 'Dépenses', icon: 'fa-arrow-trend-down', count: getCategoriesByType('expense').length },
    { value: 'income', label: 'Revenus', icon: 'fa-arrow-trend-up', count: getCategoriesByType('income').length },
  ];

  setHTML(section, html`
    ${pageHeader({
      title: 'Catégories',
      subtitle: 'Organisez vos revenus et vos dépenses : nom, icône et couleur.',
      actions: html`<button type="button" class="btn btn-primary" data-action="new-category" data-type="${tab}">${icon('fa-plus')}<span>Nouvelle catégorie</span></button>`,
    })}
    ${tabsHtml('categories', tabs, tab, 'Type de catégories')}
    <div id="panel-categories" role="tabpanel" aria-labelledby="tab-categories-${tab}">
      ${categories.length ? html`<section class="grid grid-categories">
        ${categories.map((category) => {
          const entry = stats.get(category.id) || { count: 0, month: 0 };
          return html`<article class="card category-card">
            <div class="category-card-head">
              <span class="cat-icon cat-icon-lg" style="--cat-color:${category.color}">${icon(category.icon)}</span>
              <div class="category-card-text">
                <h2 class="category-name">${category.name}</h2>
                <p class="small text-muted">${pluralize(entry.count, 'transaction', 'transactions')} · ce mois : ${formatCurrency(roundMoney(entry.month))}</p>
              </div>
            </div>
            <div class="row-actions">
              <button type="button" class="icon-btn" data-action="show-category-transactions" data-id="${category.id}" title="Voir les transactions" aria-label="Voir les transactions de ${category.name}">${icon('fa-list')}</button>
              <button type="button" class="icon-btn" data-action="edit-category" data-id="${category.id}" title="Modifier" aria-label="Modifier la catégorie ${category.name}">${icon('fa-pen')}</button>
              <button type="button" class="icon-btn icon-btn-danger" data-action="delete-category" data-id="${category.id}" title="Supprimer" aria-label="Supprimer la catégorie ${category.name}">${icon('fa-trash')}</button>
            </div>
          </article>`;
        })}
      </section>` : html`<div class="card">${emptyState({
        iconName: 'fa-folder-open',
        title: tab === 'income' ? 'Aucune catégorie de revenus.' : 'Aucune catégorie de dépenses.',
        actionLabel: 'Créer une catégorie',
        action: 'new-category',
        actionAttrs: { 'data-type': tab },
      })}</div>`}
    </div>`);
}
