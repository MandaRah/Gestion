/* ==========================================================================
   storage.js — Modèle de données et persistance (localStorage)
   --------------------------------------------------------------------------
   Seules loadData() et saveData() accèdent au localStorage.
   Structure :
   financeAppData = {
     version, meta, settings,
     accounts[], categories[], transactions[], budgets[],
     goals[], bills[], recurringTransactions[]
   }
   ========================================================================== */
'use strict';

/** État global de l'application : source unique de vérité. */
let appData = null;

/** Faux si le navigateur bloque le localStorage (mode privé strict, etc.). */
let storageAvailable = true;

const COLLECTION_KEYS = ['accounts', 'categories', 'transactions', 'budgets', 'goals', 'bills', 'recurringTransactions'];

/* --------------------------------------------------------------------------
   Accès aux paramètres
   -------------------------------------------------------------------------- */

function getSettings() {
  return (appData && appData.settings) || DEFAULT_SETTINGS;
}

function getSetting(key) {
  const settings = getSettings();
  return settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
}

/** Thème préféré du système (utilisé au tout premier lancement). */
function detectPreferredTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* --------------------------------------------------------------------------
   Création d'une structure vide
   -------------------------------------------------------------------------- */

function createDefaultCategories() {
  return DEFAULT_CATEGORIES.map((category) => ({ ...category }));
}

function createEmptyData(settings = {}) {
  const now = new Date().toISOString();
  return {
    version: DATA_VERSION,
    meta: { createdAt: now, updatedAt: now, demoPromptAnswered: false, readAlerts: [] },
    settings: normalizeSettings({ ...DEFAULT_SETTINGS, ...settings }),
    accounts: [],
    categories: createDefaultCategories(),
    transactions: [],
    budgets: [],
    goals: [],
    bills: [],
    recurringTransactions: [],
  };
}

/* --------------------------------------------------------------------------
   Chargement et sauvegarde
   -------------------------------------------------------------------------- */

/**
 * Charge les données depuis le localStorage.
 * @returns {{data: object, firstLaunch: boolean, error: string|null}}
 */
function loadData() {
  let rawData = null;
  try {
    rawData = window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    storageAvailable = false;
    return {
      data: createEmptyData({ theme: detectPreferredTheme() }),
      firstLaunch: true,
      error: 'Le stockage local est indisponible : vos données ne pourront pas être sauvegardées.',
    };
  }

  if (!rawData) {
    return { data: createEmptyData({ theme: detectPreferredTheme() }), firstLaunch: true, error: null };
  }

  try {
    const parsed = JSON.parse(rawData);
    const check = validateDataStructure(parsed);
    if (!check.valid) throw new Error(check.errors.join(' '));
    return { data: normalizeData(parsed), firstLaunch: false, error: null };
  } catch (error) {
    // Données illisibles : on conserve une copie de secours avant de repartir de zéro.
    try {
      window.localStorage.setItem(`${STORAGE_KEY}_backup_${Date.now()}`, rawData);
    } catch (backupError) {
      /* Espace insuffisant : la copie de secours est ignorée. */
    }
    const data = createEmptyData();
    data.meta.demoPromptAnswered = true;
    return {
      data,
      firstLaunch: false,
      error: 'Les données enregistrées étaient illisibles. Une copie de secours a été conservée et une nouvelle base a été créée.',
    };
  }
}

/** Sauvegarde l'état global dans le localStorage. */
function saveData() {
  if (!appData) return false;
  appData.meta.updatedAt = new Date().toISOString();
  if (!storageAvailable) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    return true;
  } catch (error) {
    showToast("Impossible d'enregistrer les données : l'espace de stockage est plein ou indisponible.", 'error');
    return false;
  }
}

/** Taille approximative des données enregistrées (en octets). */
function getStorageSize() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY) || '';
    return new Blob([value]).size;
  } catch (error) {
    return 0;
  }
}

/* --------------------------------------------------------------------------
   Validation de la structure (chargement et import)
   -------------------------------------------------------------------------- */

function validateDataStructure(data) {
  if (!isPlainObject(data)) {
    return { valid: false, errors: ['Le fichier ne contient pas un objet de données valide.'] };
  }
  const errors = [];
  if (data.settings !== undefined && !isPlainObject(data.settings)) {
    errors.push('La section « settings » doit être un objet.');
  }
  COLLECTION_KEYS.forEach((key) => {
    if (!Array.isArray(data[key])) errors.push(`La collection « ${key} » est manquante ou invalide.`);
  });
  return { valid: errors.length === 0, errors };
}

const isPositiveNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * Validation détaillée d'un fichier importé.
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
function validateImportedData(data) {
  const base = validateDataStructure(data);
  if (!base.valid) return { valid: false, errors: base.errors, warnings: [] };

  const errors = [];
  const warnings = [];
  const addError = (message) => {
    if (errors.length < 12) errors.push(message);
  };

  // Identifiants présents et uniques dans chaque collection.
  const labels = {
    accounts: 'Compte', categories: 'Catégorie', transactions: 'Transaction', budgets: 'Budget',
    goals: 'Objectif', bills: 'Échéance', recurringTransactions: 'Transaction récurrente',
  };
  COLLECTION_KEYS.forEach((key) => {
    const seen = new Set();
    data[key].forEach((item, index) => {
      const label = `${labels[key]} n°${index + 1}`;
      if (!isPlainObject(item)) {
        addError(`${label} : élément invalide.`);
        return;
      }
      if (!isNonEmptyString(item.id)) addError(`${label} : identifiant manquant.`);
      else if (seen.has(item.id)) addError(`${label} : identifiant en double (${item.id}).`);
      else seen.add(item.id);
    });
  });

  data.accounts.forEach((account, index) => {
    if (!isPlainObject(account)) return;
    if (!isNonEmptyString(account.name)) addError(`Compte n°${index + 1} : nom manquant.`);
    if (!isFiniteNumber(account.initialBalance)) addError(`Compte n°${index + 1} : solde initial invalide.`);
  });

  data.categories.forEach((category, index) => {
    if (!isPlainObject(category)) return;
    if (!isNonEmptyString(category.name)) addError(`Catégorie n°${index + 1} : nom manquant.`);
    if (!['income', 'expense'].includes(category.type)) addError(`Catégorie n°${index + 1} : type invalide.`);
  });

  data.transactions.forEach((transaction, index) => {
    if (!isPlainObject(transaction)) return;
    const label = `Transaction n°${index + 1}`;
    if (!TRANSACTION_TYPES[transaction.type]) addError(`${label} : type invalide.`);
    if (!isPositiveNumber(transaction.amount)) addError(`${label} : montant invalide.`);
    if (!isValidDateStr(transaction.date)) addError(`${label} : date invalide.`);
  });

  data.budgets.forEach((budget, index) => {
    if (!isPlainObject(budget)) return;
    if (!['global', 'category'].includes(budget.scope)) addError(`Budget n°${index + 1} : portée invalide.`);
    if (!isPositiveNumber(budget.amount)) addError(`Budget n°${index + 1} : montant invalide.`);
  });

  data.goals.forEach((goal, index) => {
    if (!isPlainObject(goal)) return;
    if (!isNonEmptyString(goal.name)) addError(`Objectif n°${index + 1} : nom manquant.`);
    if (!isPositiveNumber(goal.targetAmount)) addError(`Objectif n°${index + 1} : montant cible invalide.`);
    if (goal.contributions !== undefined && !Array.isArray(goal.contributions)) addError(`Objectif n°${index + 1} : historique invalide.`);
  });

  data.bills.forEach((bill, index) => {
    if (!isPlainObject(bill)) return;
    if (!isNonEmptyString(bill.name)) addError(`Échéance n°${index + 1} : nom manquant.`);
    if (!isPositiveNumber(bill.amount)) addError(`Échéance n°${index + 1} : montant invalide.`);
    if (!isValidDateStr(bill.dueDate)) addError(`Échéance n°${index + 1} : date d'échéance invalide.`);
  });

  data.recurringTransactions.forEach((rule, index) => {
    if (!isPlainObject(rule)) return;
    const label = `Transaction récurrente n°${index + 1}`;
    if (!TRANSACTION_TYPES[rule.type]) addError(`${label} : type invalide.`);
    if (!isPositiveNumber(rule.amount)) addError(`${label} : montant invalide.`);
    if (!FREQUENCIES[rule.frequency]) addError(`${label} : fréquence invalide.`);
    if (!isValidDateStr(rule.startDate)) addError(`${label} : date de début invalide.`);
  });

  // Références orphelines : signalées mais tolérées (affichées « supprimé »).
  if (errors.length === 0) {
    const accountIds = new Set(data.accounts.map((a) => a.id));
    const categoryIds = new Set(data.categories.map((c) => c.id));
    const orphanAccounts = data.transactions.filter((t) => t.accountId && !accountIds.has(t.accountId)).length;
    const orphanCategories = data.transactions.filter((t) => t.categoryId && !categoryIds.has(t.categoryId)).length;
    if (orphanAccounts) warnings.push(`${pluralize(orphanAccounts, 'transaction fait', 'transactions font')} référence à un compte inexistant.`);
    if (orphanCategories) warnings.push(`${pluralize(orphanCategories, 'transaction fait', 'transactions font')} référence à une catégorie inexistante.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/* --------------------------------------------------------------------------
   Normalisation : garantit des champs complets et typés
   -------------------------------------------------------------------------- */

function normalizeSettings(input = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  const source = isPlainObject(input) ? input : {};

  if (typeof source.userName === 'string') settings.userName = source.userName.trim().slice(0, 60);
  if (CURRENCIES[source.currency]) settings.currency = source.currency;
  if (NUMBER_FORMATS.some((format) => format.value === source.numberFormat)) settings.numberFormat = source.numberFormat;
  if ([0, 1].includes(Number(source.firstDayOfWeek))) settings.firstDayOfWeek = Number(source.firstDayOfWeek);
  if (source.theme === 'dark' || source.theme === 'light') settings.theme = source.theme;
  if (typeof source.showDecimals === 'boolean') settings.showDecimals = source.showDecimals;

  const warning = safeNumber(source.budgetWarningThreshold, DEFAULT_SETTINGS.budgetWarningThreshold);
  const danger = safeNumber(source.budgetDangerThreshold, DEFAULT_SETTINGS.budgetDangerThreshold);
  if (warning >= 1 && danger <= 99 && warning < danger) {
    settings.budgetWarningThreshold = Math.round(warning);
    settings.budgetDangerThreshold = Math.round(danger);
  }

  const lowBalance = safeNumber(source.lowBalanceThreshold, NaN);
  if (Number.isFinite(lowBalance)) settings.lowBalanceThreshold = roundMoney(lowBalance);

  const reminder = safeNumber(source.billReminderDays, NaN);
  if (Number.isInteger(reminder) && reminder >= 0 && reminder <= 60) settings.billReminderDays = reminder;

  return settings;
}

function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  const unique = [];
  list.forEach((tag) => {
    const value = cleanString(String(tag), 30).replace(/^#/, '');
    if (value && !unique.some((existing) => existing.toLowerCase() === value.toLowerCase())) unique.push(value);
  });
  return unique.slice(0, 10);
}

function normalizeAccount(account) {
  const now = new Date().toISOString();
  return {
    id: String(account.id),
    name: cleanString(account.name, 60) || 'Compte',
    type: ACCOUNT_TYPES[account.type] ? account.type : 'other',
    initialBalance: roundMoney(safeNumber(account.initialBalance)),
    currency: CURRENCIES[account.currency] ? account.currency : '',
    description: cleanString(account.description, 300),
    color: sanitizeColor(account.color, '#2a78d6'),
    createdAt: account.createdAt || now,
  };
}

function normalizeCategory(category) {
  return {
    id: String(category.id),
    name: cleanString(category.name, 40) || 'Catégorie',
    icon: sanitizeIcon(category.icon, 'fa-tag'),
    color: sanitizeColor(category.color),
    type: category.type === 'income' ? 'income' : 'expense',
  };
}

function normalizeTransaction(transaction) {
  const now = new Date().toISOString();
  const type = TRANSACTION_TYPES[transaction.type] ? transaction.type : 'expense';
  return {
    id: String(transaction.id),
    type,
    amount: roundMoney(Math.abs(safeNumber(transaction.amount))),
    date: isValidDateStr(transaction.date) ? transaction.date : todayStr(),
    description: cleanString(transaction.description, 120) || TRANSACTION_TYPES[type].label,
    categoryId: type === 'transfer' ? null : transaction.categoryId || null,
    accountId: transaction.accountId || null,
    toAccountId: type === 'transfer' ? transaction.toAccountId || null : null,
    paymentMethod: PAYMENT_METHODS[transaction.paymentMethod] ? transaction.paymentMethod : 'other',
    notes: cleanString(transaction.notes, 1000),
    tags: normalizeTags(transaction.tags),
    status: transaction.status === 'pending' ? 'pending' : 'completed',
    recurringId: transaction.recurringId || null,
    billId: transaction.billId || null,
    createdAt: transaction.createdAt || now,
    updatedAt: transaction.updatedAt || transaction.createdAt || now,
  };
}

function normalizeBudget(budget) {
  const scope = budget.scope === 'global' ? 'global' : 'category';
  return {
    id: String(budget.id),
    scope,
    categoryId: scope === 'category' ? budget.categoryId || null : null,
    amount: roundMoney(Math.abs(safeNumber(budget.amount))),
    createdAt: budget.createdAt || new Date().toISOString(),
  };
}

function normalizeGoal(goal) {
  const contributions = Array.isArray(goal.contributions) ? goal.contributions : [];
  return {
    id: String(goal.id),
    name: cleanString(goal.name, 60) || 'Objectif',
    targetAmount: roundMoney(Math.abs(safeNumber(goal.targetAmount))),
    initialAmount: roundMoney(safeNumber(goal.initialAmount)),
    targetDate: isValidDateStr(goal.targetDate) ? goal.targetDate : '',
    accountId: goal.accountId || null,
    description: cleanString(goal.description, 300),
    icon: sanitizeIcon(goal.icon, 'fa-bullseye'),
    color: sanitizeColor(goal.color, '#2a78d6'),
    contributions: contributions
      .filter((c) => isPlainObject(c) && Number.isFinite(Number(c.amount)) && isValidDateStr(c.date))
      .map((c) => ({
        id: c.id ? String(c.id) : uid('ctb'),
        amount: roundMoney(Number(c.amount)),
        date: c.date,
        note: cleanString(c.note, 200),
        transactionId: c.transactionId || null,
      })),
    createdAt: goal.createdAt || new Date().toISOString(),
  };
}

function normalizeBill(bill) {
  const history = Array.isArray(bill.history) ? bill.history : [];
  const recurrence = BILL_RECURRENCES[bill.recurrence] ? bill.recurrence : 'none';
  const dueDate = isValidDateStr(bill.dueDate) ? bill.dueDate : todayStr();
  return {
    id: String(bill.id),
    name: cleanString(bill.name, 60) || 'Échéance',
    amount: roundMoney(Math.abs(safeNumber(bill.amount))),
    dueDate,
    anchorDay: Number.isInteger(bill.anchorDay) && bill.anchorDay >= 1 && bill.anchorDay <= 31 ? bill.anchorDay : Number(dueDate.slice(8, 10)),
    categoryId: bill.categoryId || null,
    accountId: bill.accountId || null,
    recurrence,
    status: bill.status === 'paid' && recurrence === 'none' ? 'paid' : 'pending',
    notes: cleanString(bill.notes, 500),
    history: history
      .filter((h) => isPlainObject(h) && isValidDateStr(h.paidDate))
      .map((h) => ({
        id: h.id ? String(h.id) : uid('pay'),
        dueDate: isValidDateStr(h.dueDate) ? h.dueDate : h.paidDate,
        paidDate: h.paidDate,
        amount: roundMoney(Math.abs(safeNumber(h.amount))),
        transactionId: h.transactionId || null,
      })),
    createdAt: bill.createdAt || new Date().toISOString(),
  };
}

function normalizeRecurring(rule) {
  const type = TRANSACTION_TYPES[rule.type] ? rule.type : 'expense';
  const startDate = isValidDateStr(rule.startDate) ? rule.startDate : todayStr();
  return {
    id: String(rule.id),
    description: cleanString(rule.description, 120) || 'Transaction récurrente',
    type,
    amount: roundMoney(Math.abs(safeNumber(rule.amount))),
    categoryId: type === 'transfer' ? null : rule.categoryId || null,
    accountId: rule.accountId || null,
    toAccountId: type === 'transfer' ? rule.toAccountId || null : null,
    paymentMethod: PAYMENT_METHODS[rule.paymentMethod] ? rule.paymentMethod : 'other',
    frequency: FREQUENCIES[rule.frequency] ? rule.frequency : 'monthly',
    startDate,
    endDate: isValidDateStr(rule.endDate) ? rule.endDate : '',
    nextDate: rule.nextDate === null ? null : isValidDateStr(rule.nextDate) ? rule.nextDate : startDate,
    lastDate: isValidDateStr(rule.lastDate) ? rule.lastDate : null,
    active: rule.active !== false,
    notes: cleanString(rule.notes, 1000),
    tags: normalizeTags(rule.tags),
    createdAt: rule.createdAt || new Date().toISOString(),
  };
}

/** Normalise un objet complet (chargement ou import). */
function normalizeData(input) {
  const meta = isPlainObject(input.meta) ? input.meta : {};
  const keepValid = (list) => list.filter((item) => isPlainObject(item) && item.id);
  return {
    version: DATA_VERSION,
    meta: {
      createdAt: meta.createdAt || new Date().toISOString(),
      updatedAt: meta.updatedAt || new Date().toISOString(),
      demoPromptAnswered: true,
      readAlerts: Array.isArray(meta.readAlerts) ? meta.readAlerts.filter((key) => typeof key === 'string').slice(-500) : [],
    },
    settings: normalizeSettings(input.settings),
    accounts: keepValid(input.accounts).map(normalizeAccount),
    categories: keepValid(input.categories).map(normalizeCategory),
    transactions: keepValid(input.transactions).map(normalizeTransaction),
    budgets: keepValid(input.budgets).map(normalizeBudget),
    goals: keepValid(input.goals).map(normalizeGoal),
    bills: keepValid(input.bills).map(normalizeBill),
    recurringTransactions: keepValid(input.recurringTransactions).map(normalizeRecurring),
  };
}
