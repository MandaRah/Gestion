/* ==========================================================================
   calculations.js — Calculs financiers centralisés
   --------------------------------------------------------------------------
   Règles :
   • Revenus  = somme des transactions « income » comptabilisées.
   • Dépenses = somme des transactions « expense » comptabilisées.
   • Les transferts ne sont JAMAIS comptés comme revenus ou dépenses : ils
     diminuent un compte et augmentent l'autre.
   • Solde    = soldes initiaux + revenus − dépenses ± transferts (par compte).
   • Les transactions « en attente » ne sont pas comptabilisées.
   ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
   Accès aux entités
   -------------------------------------------------------------------------- */

function getCategory(id) {
  return id ? appData.categories.find((category) => category.id === id) || null : null;
}

function getAccount(id) {
  return id ? appData.accounts.find((account) => account.id === id) || null : null;
}

function getCategoriesByType(type) {
  return appData.categories
    .filter((category) => category.type === type)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function getAccountName(id) {
  const account = getAccount(id);
  if (account) return account.name;
  return id ? 'Compte supprimé' : 'Aucun compte';
}

function getCategoryName(id, type = null) {
  if (type === 'transfer') return 'Transfert';
  const category = getCategory(id);
  return category ? category.name : 'Non catégorisé';
}

/** Devise d'un compte : sa devise propre ou, à défaut, la devise principale. */
function getAccountCurrency(id) {
  const account = getAccount(id);
  return account && account.currency ? account.currency : getSetting('currency');
}

/** Vrai si au moins un compte utilise une devise différente de la devise principale. */
function hasMixedCurrencies() {
  const main = getSetting('currency');
  return appData.accounts.some((account) => account.currency && account.currency !== main);
}

/** Une transaction « en attente » n'est pas comptabilisée. */
function isCounted(transaction) {
  return transaction.status !== 'pending';
}

/* --------------------------------------------------------------------------
   Filtrage des transactions
   -------------------------------------------------------------------------- */

/** Texte de recherche d'une transaction (description, notes, tags, catégorie, compte, montant). */
function getTransactionSearchText(transaction) {
  return normalizeText([
    transaction.description,
    transaction.notes,
    transaction.tags.join(' '),
    getCategoryName(transaction.categoryId, transaction.type),
    getAccountName(transaction.accountId),
    transaction.toAccountId ? getAccountName(transaction.toAccountId) : '',
    TRANSACTION_TYPES[transaction.type].label,
    String(transaction.amount),
    String(transaction.amount).replace('.', ','),
    formatDate(transaction.date, 'short'),
  ].join(' '));
}

/**
 * Filtre générique des transactions.
 * @param {object} criteria { type, categoryId, accountId, range, minAmount, maxAmount, search, status, includePending }
 */
function filterTransactions(criteria = {}) {
  const {
    type = '', categoryId = '', accountId = '', range = null, minAmount = '', maxAmount = '',
    search = '', status = '', includePending = true,
  } = criteria;
  const tokens = normalizeText(search).split(/\s+/).filter(Boolean);
  const min = parseAmount(minAmount);
  const max = parseAmount(maxAmount);

  return appData.transactions.filter((transaction) => {
    if (!includePending && !isCounted(transaction)) return false;
    if (status && transaction.status !== status) return false;
    if (type && transaction.type !== type) return false;
    if (categoryId) {
      if (categoryId === UNCATEGORIZED_ID) {
        if (transaction.type === 'transfer' || getCategory(transaction.categoryId)) return false;
      } else if (transaction.categoryId !== categoryId) {
        return false;
      }
    }
    if (accountId && transaction.accountId !== accountId && transaction.toAccountId !== accountId) return false;
    if (range && (transaction.date < range.start || transaction.date > range.end)) return false;
    if (Number.isFinite(min) && transaction.amount < min) return false;
    if (Number.isFinite(max) && transaction.amount > max) return false;
    if (tokens.length) {
      const haystack = getTransactionSearchText(transaction);
      if (!tokens.every((token) => haystack.includes(token))) return false;
    }
    return true;
  });
}

/** Nombre de transactions (tous types et statuts) sur une plage. */
function countTransactions(range = null) {
  return appData.transactions.filter((transaction) => isInRange(transaction.date, range)).length;
}

/* --------------------------------------------------------------------------
   Revenus, dépenses, épargne
   -------------------------------------------------------------------------- */

/** Somme des transactions comptabilisées d'un type donné. */
function sumTransactions(type, { range = null, categoryId = '', accountId = '' } = {}) {
  let total = 0;
  for (const transaction of appData.transactions) {
    if (transaction.type !== type || !isCounted(transaction)) continue;
    if (range && (transaction.date < range.start || transaction.date > range.end)) continue;
    if (categoryId && transaction.categoryId !== categoryId) continue;
    if (accountId && transaction.accountId !== accountId) continue;
    total += transaction.amount;
  }
  return roundMoney(total);
}

/** Total des revenus (type « income ») sur une plage, avec filtres optionnels. */
function calculateIncome(range = null, filters = {}) {
  return sumTransactions('income', { range, ...filters });
}

/** Total des dépenses (type « expense ») sur une plage, avec filtres optionnels. */
function calculateExpenses(range = null, filters = {}) {
  return sumTransactions('expense', { range, ...filters });
}

/** Épargne = revenus − dépenses. */
function calculateSavings(range = null, filters = {}) {
  return roundMoney(calculateIncome(range, filters) - calculateExpenses(range, filters));
}

/** Taux d'épargne = épargne / revenus × 100 (0 si aucun revenu). */
function calculateSavingsRate(income, expenses) {
  return income > 0 ? ((income - expenses) / income) * 100 : 0;
}

/** Variation en % entre deux valeurs (null si la valeur précédente est nulle). */
function percentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/* --------------------------------------------------------------------------
   Soldes des comptes
   -------------------------------------------------------------------------- */

/**
 * Soldes de tous les comptes (Map id → solde).
 * @param {string|null} asOfDate ne compte que les transactions jusqu'à cette date incluse.
 */
function calculateAccountBalances(asOfDate = null) {
  const balances = new Map(appData.accounts.map((account) => [account.id, account.initialBalance]));
  for (const transaction of appData.transactions) {
    if (!isCounted(transaction)) continue;
    if (asOfDate && transaction.date > asOfDate) continue;
    const { type, amount, accountId, toAccountId } = transaction;
    if (type === 'income' && balances.has(accountId)) {
      balances.set(accountId, balances.get(accountId) + amount);
    } else if (type === 'expense' && balances.has(accountId)) {
      balances.set(accountId, balances.get(accountId) - amount);
    } else if (type === 'transfer') {
      if (balances.has(accountId)) balances.set(accountId, balances.get(accountId) - amount);
      if (balances.has(toAccountId)) balances.set(toAccountId, balances.get(toAccountId) + amount);
    }
  }
  balances.forEach((value, key) => balances.set(key, roundMoney(value)));
  return balances;
}

function calculateAccountBalance(accountId, asOfDate = null) {
  return calculateAccountBalances(asOfDate).get(accountId) ?? 0;
}

/**
 * Solde total : somme des soldes de tous les comptes
 * (= soldes initiaux + revenus − dépenses ; les transferts internes s'annulent).
 */
function calculateBalance(asOfDate = null) {
  let total = 0;
  calculateAccountBalances(asOfDate).forEach((value) => {
    total += value;
  });
  return roundMoney(total);
}

/* --------------------------------------------------------------------------
   Regroupements (graphiques)
   -------------------------------------------------------------------------- */

/**
 * Répartition par catégorie d'un type (income / expense) sur une plage.
 * @returns {Array<{id, name, color, icon, amount, count, percent}>} trié par montant décroissant
 */
function groupByCategory(type, range = null, filters = {}) {
  const totals = new Map();
  let grandTotal = 0;
  for (const transaction of appData.transactions) {
    if (transaction.type !== type || !isCounted(transaction) || !isInRange(transaction.date, range)) continue;
    if (filters.accountId && transaction.accountId !== filters.accountId) continue;
    if (filters.categoryId && transaction.categoryId !== filters.categoryId) continue;
    const key = getCategory(transaction.categoryId) ? transaction.categoryId : UNCATEGORIZED_ID;
    const entry = totals.get(key) || { amount: 0, count: 0 };
    entry.amount += transaction.amount;
    entry.count += 1;
    totals.set(key, entry);
    grandTotal += transaction.amount;
  }
  return [...totals.entries()]
    .map(([id, entry]) => {
      const category = getCategory(id);
      return {
        id,
        name: category ? category.name : 'Non catégorisé',
        color: category ? sanitizeColor(category.color) : NEUTRAL_COLOR,
        icon: category ? sanitizeIcon(category.icon) : 'fa-circle-question',
        amount: roundMoney(entry.amount),
        count: entry.count,
        percent: grandTotal > 0 ? (entry.amount / grandTotal) * 100 : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/** Granularité automatique selon la longueur de la plage. */
function autoGranularity(range) {
  const days = daysBetween(range.start, range.end) + 1;
  if (days <= 31) return 'day';
  if (days <= 95) return 'week';
  return 'month';
}

/**
 * Série temporelle revenus / dépenses / épargne par jour, semaine ou mois.
 * @returns {{labels: string[], buckets: object[], income: number[], expenses: number[], savings: number[]}}
 */
function buildTimeSeries(range, granularity = 'month', filters = {}) {
  const buckets = [];
  let guard = 0;
  if (granularity === 'day') {
    for (let day = range.start; day <= range.end && guard < 1100; day = addDays(day, 1), guard += 1) {
      buckets.push({ key: day, start: day, end: day, label: formatDate(day, 'dayMonth') });
    }
  } else if (granularity === 'week') {
    for (let start = startOfWeek(range.start); start <= range.end && guard < 600; start = addDays(start, 7), guard += 1) {
      buckets.push({ key: start, start, end: addDays(start, 6), label: `Sem. ${formatDate(maxDate(start, range.start), 'dayMonth')}` });
    }
  } else {
    listMonthKeys(range.start, range.end).forEach((key) => {
      const monthRange = monthKeyToRange(key);
      buckets.push({ key, start: monthRange.start, end: monthRange.end, label: capitalize(formatMonthKey(key, 'short')) });
    });
  }

  const index = new Map(buckets.map((bucket, i) => [bucket.key, i]));
  const income = new Array(buckets.length).fill(0);
  const expenses = new Array(buckets.length).fill(0);

  for (const transaction of appData.transactions) {
    if (transaction.type === 'transfer' || !isCounted(transaction) || !isInRange(transaction.date, range)) continue;
    if (filters.accountId && transaction.accountId !== filters.accountId) continue;
    if (filters.categoryId && transaction.categoryId !== filters.categoryId) continue;
    let key = transaction.date;
    if (granularity === 'week') key = startOfWeek(transaction.date);
    else if (granularity === 'month') key = monthKey(transaction.date);
    const i = index.get(key);
    if (i === undefined) continue;
    if (transaction.type === 'income') income[i] += transaction.amount;
    else expenses[i] += transaction.amount;
  }

  return {
    labels: buckets.map((bucket) => bucket.label),
    buckets,
    income: income.map(roundMoney),
    expenses: expenses.map(roundMoney),
    savings: income.map((value, i) => roundMoney(value - expenses[i])),
  };
}

/** Statistiques mensuelles d'une année (rapports, cash flow, épargne). */
function getMonthlyStats(year, filters = {}) {
  return Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${pad2(i + 1)}`;
    const range = monthKeyToRange(key);
    const income = calculateIncome(range, filters);
    const expenses = calculateExpenses(range, filters);
    return {
      key,
      range,
      income,
      expenses,
      savings: roundMoney(income - expenses),
      rate: calculateSavingsRate(income, expenses),
    };
  });
}

/** Statistiques sur une liste de clés de mois. */
function getStatsForMonthKeys(keys, filters = {}) {
  return keys.map((key) => {
    const range = monthKeyToRange(key);
    const income = calculateIncome(range, filters);
    const expenses = calculateExpenses(range, filters);
    return { key, range, income, expenses, savings: roundMoney(income - expenses), rate: calculateSavingsRate(income, expenses) };
  });
}

/**
 * Moyenne mensuelle d'un type sur les `monthsBack` derniers mois,
 * en ne comptant que les mois depuis la première transaction de ce type.
 */
function calculateMonthlyAverage(type, monthsBack = 12) {
  const today = todayStr();
  let firstDate = null;
  appData.transactions.forEach((transaction) => {
    if (transaction.type === type && isCounted(transaction) && transaction.date <= today && (!firstDate || transaction.date < firstDate)) {
      firstDate = transaction.date;
    }
  });
  if (!firstDate) return 0;
  const startKey = maxDate(addMonthsToKey(monthKey(today), -(monthsBack - 1)), monthKey(firstDate));
  const months = listMonthKeys(`${startKey}-01`, today).length;
  const total = sumTransactions(type, { range: { start: `${startKey}-01`, end: endOfMonth(today) } });
  return months > 0 ? roundMoney(total / months) : 0;
}

/** Plus grosse dépense comptabilisée d'une plage. */
function getLargestExpense(range = null) {
  let largest = null;
  for (const transaction of appData.transactions) {
    if (transaction.type !== 'expense' || !isCounted(transaction) || !isInRange(transaction.date, range)) continue;
    if (!largest || transaction.amount > largest.amount) largest = transaction;
  }
  return largest;
}

/* --------------------------------------------------------------------------
   Budgets
   -------------------------------------------------------------------------- */

function getBudgetLabel(budget) {
  if (budget.scope === 'global') return 'Budget global';
  return getCategory(budget.categoryId) ? getCategory(budget.categoryId).name : 'Catégorie supprimée';
}

/** Statut d'utilisation d'un budget selon les seuils configurés. */
function getBudgetStatus(percent) {
  const settings = getSettings();
  if (percent >= 100) return 'exceeded';
  if (percent >= settings.budgetDangerThreshold) return 'danger';
  if (percent >= settings.budgetWarningThreshold) return 'warning';
  return 'normal';
}

/**
 * Utilisation d'un budget mensuel pour un mois donné.
 * @returns {{budgeted, spent, remaining, percent, status}}
 */
function calculateBudgetUsage(budget, key = monthKey(todayStr())) {
  const range = monthKeyToRange(key);
  const spent = budget.scope === 'global'
    ? calculateExpenses(range)
    : calculateExpenses(range, { categoryId: budget.categoryId });
  const percent = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
  return {
    budgeted: budget.amount,
    spent,
    remaining: roundMoney(budget.amount - spent),
    percent,
    status: getBudgetStatus(percent),
  };
}

/** Budgets pris en compte dans les synthèses : le budget global s'il existe, sinon les budgets par catégorie. */
function getSummaryBudgets() {
  const global = appData.budgets.find((budget) => budget.scope === 'global');
  if (global) return { global, categoryBudgets: [] };
  return { global: null, categoryBudgets: appData.budgets.filter((budget) => budget.scope === 'category' && getCategory(budget.categoryId)) };
}

/** Synthèse budgétaire d'un mois (null si aucun budget). */
function calculateBudgetSummary(key = monthKey(todayStr())) {
  const { global, categoryBudgets } = getSummaryBudgets();
  if (global) return { mode: 'global', ...calculateBudgetUsage(global, key) };
  if (!categoryBudgets.length) return null;
  const usages = categoryBudgets.map((budget) => calculateBudgetUsage(budget, key));
  const budgeted = roundMoney(sumBy(usages, (usage) => usage.budgeted));
  const spent = roundMoney(sumBy(usages, (usage) => usage.spent));
  const percent = budgeted > 0 ? (spent / budgeted) * 100 : 0;
  return { mode: 'categories', budgeted, spent, remaining: roundMoney(budgeted - spent), percent, status: getBudgetStatus(percent) };
}

/**
 * Budget restant sur une plage quelconque : les budgets mensuels sont
 * proratisés selon les jours couverts dans chaque mois.
 */
function calculateBudgetForRange(range) {
  const { global, categoryBudgets } = getSummaryBudgets();
  if (!range || (!global && !categoryBudgets.length)) return null;
  const monthlyAmount = global ? global.amount : sumBy(categoryBudgets, (budget) => budget.amount);
  let budgeted = 0;
  listMonthKeys(range.start, range.end).forEach((key) => {
    const month = monthKeyToRange(key);
    const overlapDays = daysBetween(maxDate(month.start, range.start), minDate(month.end, range.end)) + 1;
    const monthDays = daysBetween(month.start, month.end) + 1;
    budgeted += (monthlyAmount * overlapDays) / monthDays;
  });
  const spent = global
    ? calculateExpenses(range)
    : sumBy(categoryBudgets, (budget) => calculateExpenses(range, { categoryId: budget.categoryId }));
  budgeted = roundMoney(budgeted);
  const percent = budgeted > 0 ? (spent / budgeted) * 100 : 0;
  return { budgeted, spent: roundMoney(spent), remaining: roundMoney(budgeted - spent), percent, status: getBudgetStatus(percent) };
}

/* --------------------------------------------------------------------------
   Objectifs
   -------------------------------------------------------------------------- */

function getGoalCurrentAmount(goal) {
  return roundMoney(goal.initialAmount + sumBy(goal.contributions, (contribution) => contribution.amount));
}

/**
 * Progression d'un objectif.
 * @returns {{current, target, percent, remaining, daysLeft, monthlyNeeded, status}}
 */
function calculateGoalProgress(goal) {
  const current = getGoalCurrentAmount(goal);
  const target = goal.targetAmount;
  const percent = target > 0 ? (current / target) * 100 : 0;
  const remaining = Math.max(0, roundMoney(target - current));
  let daysLeft = null;
  let monthlyNeeded = null;
  if (goal.targetDate) {
    daysLeft = daysBetween(todayStr(), goal.targetDate);
    monthlyNeeded = remaining > 0 && daysLeft > 0 ? roundMoney(remaining / Math.max(1, daysLeft / 30.4375)) : null;
  }
  let status = 'active';
  if (current >= target) status = 'reached';
  else if (daysLeft !== null && daysLeft < 0) status = 'overdue';
  return { current, target, percent, remaining, daysLeft, monthlyNeeded, status };
}

/** Description du temps restant avant la date cible. */
function describeTimeLeft(daysLeft) {
  if (daysLeft === null) return 'Sans date cible';
  if (daysLeft < 0) return `Date dépassée de ${pluralize(-daysLeft, 'jour', 'jours')}`;
  if (daysLeft === 0) return "Date cible aujourd'hui";
  if (daysLeft < 45) return `${pluralize(daysLeft, 'jour restant', 'jours restants')}`;
  const months = Math.round(daysLeft / 30.4375);
  if (months < 12) return `Environ ${months} mois restants`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `Environ ${pluralize(years, 'an', 'ans')}${rest ? ` et ${rest} mois` : ''} restants`;
}

/** Durée courte pour les espaces réduits (« 12 jours », « ≈ 8 mois », « ≈ 2 ans 6 mois »). */
function formatShortDuration(daysLeft) {
  if (daysLeft === null) return 'Sans date';
  if (daysLeft < 0) return 'Dépassée';
  if (daysLeft === 0) return "Aujourd'hui";
  if (daysLeft < 45) return pluralize(daysLeft, 'jour', 'jours');
  const months = Math.round(daysLeft / 30.4375);
  if (months < 12) return `≈ ${months} mois`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `≈ ${pluralize(years, 'an', 'ans')}${rest ? ` ${rest} mois` : ''}`;
}

/* --------------------------------------------------------------------------
   Échéances
   -------------------------------------------------------------------------- */

/** Statut affiché d'une échéance : payée, en retard ou à venir. */
function getBillStatus(bill) {
  if (bill.status === 'paid') return 'paid';
  return bill.dueDate < todayStr() ? 'overdue' : 'upcoming';
}

/* --------------------------------------------------------------------------
   Épargne et détection d'anomalies
   -------------------------------------------------------------------------- */

/** Épargne cumulée depuis le début (revenus − dépenses). */
function calculateTotalSavings() {
  return calculateSavings(null);
}

/**
 * Dépenses inhabituellement élevées des `days` derniers jours :
 * montant ≥ 2,5 × la moyenne de la même catégorie sur les 6 mois précédents
 * (au moins 3 dépenses de référence). Les opérations planifiées sont ignorées.
 */
function findUnusualExpenses(days = 14) {
  const today = todayStr();
  const since = addDays(today, -days);
  const expenses = appData.transactions.filter((t) => t.type === 'expense' && isCounted(t));
  const recent = expenses.filter((t) => t.date >= since && t.date <= today && !t.recurringId && !t.billId);
  const result = [];
  recent.forEach((transaction) => {
    const windowStart = addDays(transaction.date, -183);
    const history = expenses.filter((h) => h.id !== transaction.id && h.categoryId === transaction.categoryId && h.date < transaction.date && h.date >= windowStart);
    if (history.length < 3) return;
    const average = sumBy(history, (h) => h.amount) / history.length;
    if (average > 0 && transaction.amount >= average * 2.5) result.push({ transaction, average: roundMoney(average) });
  });
  return result;
}

/* --------------------------------------------------------------------------
   Prévisions
   -------------------------------------------------------------------------- */

const FORECAST_HORIZONS = {
  '30d': { label: '30 jours', getEnd: (today) => addDays(today, 30) },
  '3m': { label: '3 mois', getEnd: (today) => addMonths(today, 3) },
  '6m': { label: '6 mois', getEnd: (today) => addMonths(today, 6) },
  '12m': { label: '12 mois', getEnd: (today) => addMonths(today, 12) },
};

/**
 * Projection du solde global jusqu'à `endDate`, à partir :
 * du solde actuel, des transactions futures déjà saisies, des transactions
 * en attente, des transactions récurrentes, des échéances non payées et des
 * budgets (dépenses variables estimées, réparties jour par jour).
 * Les transferts internes n'ont pas d'effet sur le solde global.
 */
function buildForecast({ endDate, include }) {
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const startBalance = calculateBalance(today);
  const events = [];

  // 1. Transactions déjà saisies (dates futures) et transactions en attente.
  appData.transactions.forEach((transaction) => {
    if (transaction.type === 'transfer') return;
    const signed = transaction.type === 'income' ? transaction.amount : -transaction.amount;
    if (isCounted(transaction)) {
      if (transaction.date > today && transaction.date <= endDate) {
        events.push({ date: transaction.date, label: transaction.description, amount: signed, source: 'scheduled', categoryId: transaction.categoryId, refId: transaction.id });
      }
    } else if (include.pending) {
      const date = transaction.date > today ? transaction.date : tomorrow;
      if (date <= endDate) events.push({ date, label: transaction.description, amount: signed, source: 'pending', categoryId: transaction.categoryId, refId: transaction.id });
    }
  });

  // 2. Transactions récurrentes.
  if (include.recurring) {
    appData.recurringTransactions.forEach((rule) => {
      if (rule.type === 'transfer' || !isRuleValid(rule)) return;
      getRuleOccurrences(rule, tomorrow, endDate).forEach((date) => {
        events.push({ date, label: rule.description, amount: rule.type === 'income' ? rule.amount : -rule.amount, source: 'recurring', categoryId: rule.categoryId, refId: rule.id });
      });
    });
  }

  // 3. Échéances non payées (les retards sont projetés dès demain).
  if (include.bills) {
    appData.bills.forEach((bill) => {
      getBillOccurrences(bill, tomorrow, endDate, { overdueOn: tomorrow }).forEach((occurrence) => {
        events.push({ date: occurrence.date, label: bill.name, amount: -bill.amount, source: 'bill', categoryId: bill.categoryId, refId: bill.id, overdue: occurrence.overdue });
      });
    });
  }

  // 4. Budgets : enveloppe restante répartie sur les jours de chaque mois.
  const dailyBudget = new Map();
  let budgetTotal = 0;
  const { global, categoryBudgets } = getSummaryBudgets();
  if (include.budgets && (global || categoryBudgets.length) && tomorrow <= endDate) {
    const budgetedIds = new Set(categoryBudgets.map((budget) => budget.categoryId));
    const isBudgetedExpense = (event) => event.amount < 0 && (global ? true : budgetedIds.has(event.categoryId));
    const monthlyAmount = global ? global.amount : sumBy(categoryBudgets, (budget) => budget.amount);
    listMonthKeys(tomorrow, endDate).forEach((key) => {
      const month = monthKeyToRange(key);
      const from = maxDate(month.start, tomorrow);
      const to = minDate(month.end, endDate);
      let alreadySpent = 0;
      if (key === monthKey(today)) {
        const spentRange = { start: month.start, end: today };
        alreadySpent = global
          ? calculateExpenses(spentRange)
          : sumBy(categoryBudgets, (budget) => calculateExpenses(spentRange, { categoryId: budget.categoryId }));
      }
      const planned = -sumBy(events.filter((event) => event.date >= month.start && event.date <= month.end && isBudgetedExpense(event)), (event) => event.amount);
      const remaining = Math.max(0, monthlyAmount - alreadySpent - planned);
      const daysLeftInMonth = daysBetween(from, month.end) + 1;
      const daysCovered = daysBetween(from, to) + 1;
      const amountInWindow = (remaining * daysCovered) / daysLeftInMonth;
      const perDay = amountInWindow / daysCovered;
      for (let day = from; day <= to; day = addDays(day, 1)) {
        dailyBudget.set(day, (dailyBudget.get(day) || 0) + perDay);
      }
      budgetTotal += amountInWindow;
    });
  }

  // Série quotidienne du solde projeté.
  events.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
  const totalsByDate = new Map();
  events.forEach((event) => totalsByDate.set(event.date, (totalsByDate.get(event.date) || 0) + event.amount));

  const points = [];
  let balance = startBalance;
  let minPoint = { date: today, balance: startBalance };
  for (let day = today; day <= endDate; day = addDays(day, 1)) {
    if (day > today) balance += (totalsByDate.get(day) || 0) - (dailyBudget.get(day) || 0);
    const rounded = roundMoney(balance);
    points.push({ date: day, balance: rounded });
    if (rounded < minPoint.balance) minPoint = { date: day, balance: rounded };
  }

  return {
    startBalance,
    events,
    points,
    budgetTotal: roundMoney(budgetTotal),
    incomeTotal: roundMoney(sumBy(events.filter((e) => e.amount > 0), (e) => e.amount)),
    expenseTotal: roundMoney(-sumBy(events.filter((e) => e.amount < 0), (e) => e.amount)),
    endBalance: points.length ? points[points.length - 1].balance : startBalance,
    minPoint,
  };
}

/* --------------------------------------------------------------------------
   Opérations prévues (tableau de bord, calendrier)
   -------------------------------------------------------------------------- */

/** Libellés des origines d'une opération prévue ou passée. */
const PLANNED_SOURCES = {
  transaction: { label: 'Transaction', action: 'view-transaction', icon: 'fa-receipt' },
  scheduled: { label: 'Planifiée', action: 'view-transaction', icon: 'fa-calendar-check' },
  pending: { label: 'En attente', action: 'view-transaction', icon: 'fa-hourglass-half' },
  recurring: { label: 'Récurrence', action: 'edit-recurring', icon: 'fa-repeat' },
  bill: { label: 'Échéance', action: 'view-bill', icon: 'fa-file-invoice-dollar' },
  'bill-paid': { label: 'Échéance payée', action: 'view-bill', icon: 'fa-circle-check' },
};

/**
 * Opérations prévues entre deux dates : transactions futures ou en attente,
 * occurrences récurrentes non encore générées et échéances non payées.
 * Avec includeOverdue, les échéances et transactions en attente antérieures
 * à `from` sont ajoutées (marquées en retard).
 */
function getPlannedItems(from, to, { includeOverdue = false } = {}) {
  const today = todayStr();
  const items = [];
  appData.transactions.forEach((transaction) => {
    const pending = !isCounted(transaction);
    if (!pending && transaction.date <= today) return;
    const overdueOk = includeOverdue && pending && transaction.date < from;
    if (!overdueOk && (transaction.date < from || transaction.date > to)) return;
    items.push({
      date: transaction.date, label: transaction.description, amount: transaction.amount, type: transaction.type,
      source: pending ? 'pending' : 'scheduled', refId: transaction.id, categoryId: transaction.categoryId, overdue: overdueOk,
    });
  });
  appData.recurringTransactions.forEach((rule) => {
    if (!isRuleValid(rule)) return;
    getRuleOccurrences(rule, from, to).forEach((date) => items.push({
      date, label: rule.description, amount: rule.amount, type: rule.type, source: 'recurring', refId: rule.id, categoryId: rule.categoryId, overdue: false,
    }));
  });
  appData.bills.forEach((bill) => {
    if (bill.status === 'paid') return;
    if (includeOverdue && bill.dueDate < from) {
      items.push({ date: bill.dueDate, label: bill.name, amount: bill.amount, type: 'expense', source: 'bill', refId: bill.id, categoryId: bill.categoryId, overdue: true });
    }
    getBillOccurrences(bill, from, to).forEach((occurrence) => items.push({
      date: occurrence.date, label: bill.name, amount: bill.amount, type: 'expense', source: 'bill', refId: bill.id, categoryId: bill.categoryId, overdue: occurrence.date < today,
    }));
  });
  return items.sort((a, b) => a.date.localeCompare(b.date));
}
