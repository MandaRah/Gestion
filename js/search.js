/* ==========================================================================
   search.js — Recherche globale instantanée
   --------------------------------------------------------------------------
   Recherche dans les transactions, catégories, comptes, objectifs et
   échéances. Navigation clavier : ↑ ↓ pour parcourir, Entrée pour ouvrir,
   Échap pour fermer. Raccourcis : « / » ou Ctrl + K.
   ========================================================================== */
'use strict';

const SEARCH_LIMIT_PER_GROUP = 5;

/** Vrai si tous les mots de la requête figurent dans le texte. */
function matchesTokens(text, tokens) {
  const haystack = normalizeText(text);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Recherche dans toutes les données.
 * @returns {Array<{group, items: Array<{kind, id, title, subtitle, iconName, color}>, total}>}
 */
function performGlobalSearch(query) {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  const transactions = appData.transactions
    .filter((transaction) => tokens.every((token) => getTransactionSearchText(transaction).includes(token)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const categories = appData.categories.filter((category) => matchesTokens(`${category.name} ${category.type === 'income' ? 'revenu' : 'depense'}`, tokens));
  const accounts = appData.accounts.filter((account) => matchesTokens(`${account.name} ${account.description} ${ACCOUNT_TYPES[account.type].label}`, tokens));
  const goals = appData.goals.filter((goal) => matchesTokens(`${goal.name} ${goal.description}`, tokens));
  const bills = appData.bills.filter((bill) => matchesTokens(`${bill.name} ${bill.notes} ${getCategoryName(bill.categoryId)}`, tokens));

  const groups = [
    {
      group: 'Transactions',
      total: transactions.length,
      items: transactions.slice(0, SEARCH_LIMIT_PER_GROUP).map((transaction) => {
        const category = getCategory(transaction.categoryId);
        return {
          kind: 'transaction', id: transaction.id, title: transaction.description,
          subtitle: `${formatDate(transaction.date)} · ${getCategoryName(transaction.categoryId, transaction.type)} · ${transaction.type === 'expense' ? '−' : transaction.type === 'income' ? '+' : ''}${formatCurrency(transaction.amount, getAccountCurrency(transaction.accountId))}`,
          iconName: transaction.type === 'transfer' ? 'fa-right-left' : category ? category.icon : 'fa-circle-question',
          color: transaction.type === 'transfer' || !category ? NEUTRAL_COLOR : category.color,
        };
      }),
    },
    {
      group: 'Catégories',
      total: categories.length,
      items: categories.slice(0, SEARCH_LIMIT_PER_GROUP).map((category) => ({
        kind: 'category', id: category.id, title: category.name,
        subtitle: category.type === 'income' ? 'Catégorie de revenus' : 'Catégorie de dépenses',
        iconName: category.icon, color: category.color,
      })),
    },
    {
      group: 'Comptes',
      total: accounts.length,
      items: accounts.slice(0, SEARCH_LIMIT_PER_GROUP).map((account) => ({
        kind: 'account', id: account.id, title: account.name,
        subtitle: `${ACCOUNT_TYPES[account.type].label} · ${formatCurrency(calculateAccountBalance(account.id), getAccountCurrency(account.id))}`,
        iconName: ACCOUNT_TYPES[account.type].icon, color: account.color,
      })),
    },
    {
      group: 'Objectifs',
      total: goals.length,
      items: goals.slice(0, SEARCH_LIMIT_PER_GROUP).map((goal) => {
        const progress = calculateGoalProgress(goal);
        return {
          kind: 'goal', id: goal.id, title: goal.name,
          subtitle: `${formatPercent(progress.percent, { decimals: 0 })} · ${formatCurrency(progress.current)} / ${formatCurrency(progress.target)}`,
          iconName: goal.icon, color: goal.color,
        };
      }),
    },
    {
      group: 'Échéances',
      total: bills.length,
      items: bills.slice(0, SEARCH_LIMIT_PER_GROUP).map((bill) => ({
        kind: 'bill', id: bill.id, title: bill.name,
        subtitle: `${BILL_STATUSES[getBillStatus(bill)].label} · ${formatDate(bill.dueDate)} · ${formatCurrency(bill.amount)}`,
        iconName: 'fa-file-invoice-dollar', color: NEUTRAL_COLOR,
      })),
    },
  ];
  return groups.filter((group) => group.items.length);
}

function renderSearchResults(query) {
  const container = document.getElementById('search-results');
  const input = document.getElementById('global-search-input');
  if (!container || !input) return;
  if (!query.trim()) {
    closeSearchResults();
    return;
  }
  const groups = performGlobalSearch(query);
  let index = 0;
  setHTML(container, groups.length ? html`
    ${groups.map((group) => html`<div class="search-group" role="group" aria-label="${group.group}">
      <p class="search-group-title">${group.group}<span class="text-muted"> · ${group.total}</span></p>
      ${group.items.map((item) => {
        index += 1;
        return html`<button type="button" class="search-item" role="option" id="search-option-${index}" aria-selected="false" data-action="open-search-result" data-kind="${item.kind}" data-id="${item.id}">
          <span class="cat-icon" style="--cat-color:${sanitizeColor(item.color)}">${icon(item.iconName)}</span>
          <span class="search-item-text"><span class="search-item-title">${item.title}</span><span class="search-item-sub">${item.subtitle}</span></span>
        </button>`;
      })}
      ${group.group === 'Transactions' && group.total > group.items.length ? html`<button type="button" class="search-item search-more" role="option" id="search-option-more" aria-selected="false" data-action="show-all-search-results">Voir les ${group.total} transactions correspondantes ${icon('fa-arrow-right')}</button>` : ''}
    </div>`)}` : html`<p class="search-empty">Aucun résultat pour « ${query.trim()} ».</p>`);
  container.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function closeSearchResults() {
  const container = document.getElementById('search-results');
  const input = document.getElementById('global-search-input');
  if (container) {
    container.hidden = true;
    container.innerHTML = '';
  }
  if (input) {
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
}

/** Déplace la sélection active dans la liste de résultats. */
function moveSearchSelection(direction) {
  const container = document.getElementById('search-results');
  const input = document.getElementById('global-search-input');
  const options = [...container.querySelectorAll('[role="option"]')];
  if (!options.length) return;
  const currentIndex = options.findIndex((option) => option.getAttribute('aria-selected') === 'true');
  let nextIndex = currentIndex + direction;
  if (nextIndex < 0) nextIndex = options.length - 1;
  if (nextIndex >= options.length) nextIndex = 0;
  options.forEach((option, i) => {
    option.setAttribute('aria-selected', String(i === nextIndex));
    option.classList.toggle('is-active', i === nextIndex);
  });
  input.setAttribute('aria-activedescendant', options[nextIndex].id);
  options[nextIndex].scrollIntoView({ block: 'nearest' });
}

/** Ouvre l'élément trouvé. */
function openSearchResult(kind, id) {
  const input = document.getElementById('global-search-input');
  closeSearchResults();
  if (input) input.blur();
  switch (kind) {
    case 'transaction':
      openTransactionDetails(id);
      break;
    case 'category': {
      const category = getCategory(id);
      if (category) viewState.categories.tab = category.type;
      navigate('categories');
      openCategoryForm({ category });
      break;
    }
    case 'account':
      navigate('accounts');
      openAccountForm({ account: getAccount(id) });
      break;
    case 'goal':
      navigate('goals');
      openGoalHistory(id);
      break;
    case 'bill':
      navigate('bills');
      openBillDetails(id);
      break;
    default:
      break;
  }
}

function bindGlobalSearch() {
  const input = document.getElementById('global-search-input');
  if (!input) return;
  const update = debounce(() => renderSearchResults(input.value), 120);
  input.addEventListener('input', update);
  input.addEventListener('focus', () => {
    if (input.value.trim()) renderSearchResults(input.value);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSearchSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSearchSelection(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const active = document.querySelector('#search-results [aria-selected="true"]') || document.querySelector('#search-results [role="option"]');
      if (active) active.click();
    } else if (event.key === 'Escape') {
      input.value = '';
      closeSearchResults();
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.global-search')) closeSearchResults();
  });
}

registerActions({
  'open-search-result': (element) => openSearchResult(element.dataset.kind, element.dataset.id),
  'show-all-search-results': () => {
    const input = document.getElementById('global-search-input');
    const query = input ? input.value.trim() : '';
    closeSearchResults();
    showTransactionsWithFilters({ search: query });
  },
});
