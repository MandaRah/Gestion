/* ==========================================================================
   demo.js — Données de démonstration
   --------------------------------------------------------------------------
   Proposées uniquement au tout premier lancement (ou à la demande explicite
   depuis les paramètres). Les dates sont calculées par rapport à aujourd'hui
   et les montants sont adaptés à la devise choisie.
   ========================================================================== */
'use strict';

/** Générateur pseudo-aléatoire déterministe (mêmes données pour une même graine). */
function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Construit un jeu de données complet (6 mois d'historique).
 * Les occurrences récurrentes passées sont créées ensuite par
 * generateRecurringTransactions() (voir loadDemoData).
 */
function generateDemoData({ currency = 'EUR', userName = '', theme = 'light' } = {}) {
  const scale = (CURRENCIES[currency] || CURRENCIES.EUR).demoScale;
  const money = (value) => (scale === 1 ? roundMoney(value) : Math.round((value * scale) / 100) * 100);
  const random = createSeededRandom(20261110);
  const between = (min, max) => min + random() * (max - min);
  const pick = (list) => list[Math.floor(random() * list.length)];

  const now = new Date().toISOString();
  const today = todayStr();
  const todayDay = Number(today.slice(8, 10));
  const currentMonthStart = startOfMonth(today);

  /** Jour `day` du mois décalé de `offset` mois. */
  const dateIn = (offset, day) => {
    const base = addMonths(currentMonthStart, offset);
    const [year, month] = base.split('-').map(Number);
    return `${base.slice(0, 7)}-${pad2(Math.min(day, daysInMonth(year, month)))}`;
  };
  /** Comme dateIn, mais jamais après aujourd'hui pour le mois en cours. */
  const pastDateIn = (offset, day) => (offset === 0 ? dateIn(0, Math.min(day, todayDay)) : dateIn(offset, day));

  const data = createEmptyData({ currency, userName, theme, lowBalanceThreshold: money(100) });
  data.meta.demoPromptAnswered = true;

  /* ---------------- Comptes ---------------- */
  data.accounts = [
    { id: 'acc_main', name: 'Compte courant', type: 'checking', initialBalance: money(1850), description: 'Compte principal pour les dépenses du quotidien.', color: '#2a78d6' },
    { id: 'acc_savings', name: "Livret d'épargne", type: 'savings', initialBalance: money(4200), description: 'Épargne de précaution et projets.', color: '#1baf7a' },
    { id: 'acc_cash', name: 'Espèces', type: 'cash', initialBalance: money(90), description: 'Argent liquide.', color: '#eda100' },
    { id: 'acc_pro', name: 'Compte professionnel', type: 'business', initialBalance: money(950), description: 'Encaissements des missions freelance.', color: '#6250d6' },
  ].map((account) => normalizeAccount({ ...account, currency: '', createdAt: now }));

  /* ---------------- Transactions ponctuelles ---------------- */
  const transactions = [];
  const addTransaction = (fields) => {
    const transaction = normalizeTransaction({ id: uid('tx'), status: 'completed', paymentMethod: 'card', createdAt: now, updatedAt: now, ...fields });
    transactions.push(transaction);
    return transaction;
  };
  const expense = (offset, day, amount, description, categoryId, extra = {}) => addTransaction({
    type: 'expense', amount: money(amount), date: pastDateIn(offset, day), description, categoryId, accountId: 'acc_main', ...extra,
  });
  const income = (offset, day, amount, description, categoryId, extra = {}) => addTransaction({
    type: 'income', amount: money(amount), date: pastDateIn(offset, day), description, categoryId, accountId: 'acc_main', paymentMethod: 'transfer', ...extra,
  });

  const marketCash = [38, 42, 35, 44, 40];
  for (let offset = -5; offset <= -1; offset += 1) {
    [3, 9, 15, 21, 27].forEach((day, index) => {
      expense(offset, day, between(42, 128), pick(['Supermarché', 'Courses de la semaine', 'Épicerie', 'Primeur', 'Boulangerie']), 'cat_groceries', { tags: index === 0 ? ['famille'] : [] });
    });
    expense(offset, 13, marketCash[offset + 5], 'Marché', 'cat_groceries', { accountId: 'acc_cash', paymentMethod: 'cash' });
    [7, 16, 24].forEach((day) => {
      expense(offset, day, between(16, 52), pick(['Déjeuner au restaurant', 'Pizzeria', 'Dîner entre amis', 'Café et pâtisserie']), 'cat_restaurant');
    });
    [5, 19].forEach((day) => expense(offset, day, between(48, 74), 'Carburant', 'cat_transport'));
    expense(offset, 11, between(18, 26), 'Transports en commun', 'cat_transport', { paymentMethod: 'mobile' });
    expense(offset, 20, between(14, 48), pick(['Cinéma', 'Concert', 'Livres', 'Sortie au musée']), 'cat_leisure');
    expense(offset, 22, between(35, 115), pick(['Vêtements', 'Chaussures', 'Décoration', 'Accessoires']), 'cat_shopping');
    if (offset % 2 !== 0) expense(offset, 17, between(18, 38), 'Pharmacie', 'cat_health');
  }

  // Opérations ponctuelles des mois passés.
  expense(-3, 6, 89, 'Formation en ligne', 'cat_education', { tags: ['développement'] });
  expense(-2, 23, 540, 'Week-end à la mer', 'cat_travel', { tags: ['vacances'] });
  income(-5, 14, 680, 'Mission freelance — site vitrine', 'cat_freelance', { accountId: 'acc_pro' });
  income(-3, 9, 1150, 'Mission freelance — application', 'cat_freelance', { accountId: 'acc_pro' });
  income(-2, 21, 450, 'Mission freelance — maintenance', 'cat_freelance', { accountId: 'acc_pro' });
  income(-1, 12, 920, 'Mission freelance — audit', 'cat_freelance', { accountId: 'acc_pro' });
  income(-4, 15, 85, 'Dividendes', 'cat_investments', { accountId: 'acc_savings' });
  income(-1, 15, 92, 'Dividendes', 'cat_investments', { accountId: 'acc_savings' });
  income(-1, 20, 600, 'Prime de performance', 'cat_bonus');
  income(-2, 10, 48, 'Remboursement mutuelle', 'cat_refund');
  [-4, -2].forEach((offset) => addTransaction({
    type: 'transfer', amount: money(100), date: dateIn(offset, 10), description: 'Retrait au distributeur', accountId: 'acc_main', toAccountId: 'acc_cash', paymentMethod: 'cash',
  }));

  // Mois en cours : montants fixes pour illustrer les statuts de budget et les alertes.
  expense(0, 2, 82.4, 'Supermarché', 'cat_groceries', { tags: ['famille'] });
  expense(0, 6, 64.9, 'Courses de la semaine', 'cat_groceries');
  expense(0, 4, 41, 'Marché', 'cat_groceries', { accountId: 'acc_cash', paymentMethod: 'cash' });
  expense(0, 4, 58, 'Dîner entre amis', 'cat_restaurant');
  expense(0, 8, 54.5, 'Restaurant japonais', 'cat_restaurant');
  expense(0, 5, 68, 'Carburant', 'cat_transport');
  expense(0, 7, 52, 'Concert', 'cat_leisure', { tags: ['sortie'] });
  expense(0, 9, 189, "Manteau d'hiver", 'cat_shopping');
  expense(0, 9, 380, 'Soins dentaires', 'cat_health', { notes: 'Une partie sera remboursée par la mutuelle.' });
  income(0, 8, 650, 'Mission freelance — refonte', 'cat_freelance', { accountId: 'acc_pro' });
  addTransaction({
    type: 'expense', amount: money(320), date: addDays(today, 6), description: 'Réparation voiture (devis)', categoryId: 'cat_transport',
    accountId: 'acc_main', status: 'pending', notes: 'Montant estimé sur devis du garage.',
  });

  /* ---------------- Échéances (avec historique de paiements) ---------------- */
  const buildBill = (definition) => {
    const amount = money(definition.amount);
    const history = [];
    let due = definition.firstDue;
    const past = [];
    let guard = 0;
    while (definition.recurrence !== 'none' && due < today && guard < 100) {
      past.push(due);
      due = addFrequency(due, definition.recurrence, definition.anchorDay);
      guard += 1;
    }
    let currentDue = due;
    let toPay = past;
    if (definition.leaveLatestUnpaid && past.length) {
      currentDue = past[past.length - 1];
      toPay = past.slice(0, -1);
    }
    toPay.forEach((occurrence) => {
      const transaction = addTransaction({
        type: 'expense', amount, date: occurrence, description: definition.name, categoryId: definition.categoryId,
        accountId: 'acc_main', paymentMethod: 'direct_debit', billId: definition.id,
      });
      history.push({ id: uid('pay'), dueDate: occurrence, paidDate: occurrence, amount, transactionId: transaction.id });
    });
    return normalizeBill({
      id: definition.id, name: definition.name, amount, dueDate: currentDue, anchorDay: definition.anchorDay,
      categoryId: definition.categoryId, accountId: 'acc_main', recurrence: definition.recurrence, status: 'pending',
      notes: definition.notes || '', history, createdAt: now,
    });
  };

  data.bills = [
    { id: 'bill_power', name: 'Électricité', amount: 68, firstDue: dateIn(-5, 15), anchorDay: 15, recurrence: 'monthly', categoryId: 'cat_utilities' },
    { id: 'bill_internet', name: 'Internet (box)', amount: 39.99, firstDue: dateIn(-5, 8), anchorDay: 8, recurrence: 'monthly', categoryId: 'cat_utilities', leaveLatestUnpaid: true },
    { id: 'bill_phone', name: 'Forfait téléphone', amount: 19.99, firstDue: dateIn(-5, 22), anchorDay: 22, recurrence: 'monthly', categoryId: 'cat_utilities' },
    { id: 'bill_car_loan', name: 'Crédit auto', amount: 245, firstDue: dateIn(-5, 5), anchorDay: 5, recurrence: 'monthly', categoryId: 'cat_other_expense', notes: 'Dernière mensualité en décembre 2028.' },
    { id: 'bill_water', name: 'Eau', amount: 95, firstDue: dateIn(-4, 20), anchorDay: 20, recurrence: 'quarterly', categoryId: 'cat_utilities' },
    { id: 'bill_car_insurance', name: 'Assurance auto', amount: 540, firstDue: addDays(today, 45), anchorDay: Number(addDays(today, 45).slice(8, 10)), recurrence: 'yearly', categoryId: 'cat_insurance' },
    { id: 'bill_tax', name: 'Taxe foncière', amount: 780, firstDue: addDays(today, 20), anchorDay: Number(addDays(today, 20).slice(8, 10)), recurrence: 'none', categoryId: 'cat_other_expense' },
  ].map(buildBill);

  data.transactions = transactions;

  /* ---------------- Transactions récurrentes ---------------- */
  data.recurringTransactions = [
    { id: 'rec_salary', description: 'Salaire', type: 'income', amount: money(2850), categoryId: 'cat_salary', accountId: 'acc_main', paymentMethod: 'transfer', frequency: 'monthly', startDate: dateIn(-5, 1) },
    { id: 'rec_rent', description: 'Loyer', type: 'expense', amount: money(980), categoryId: 'cat_housing', accountId: 'acc_main', paymentMethod: 'transfer', frequency: 'monthly', startDate: dateIn(-5, 3) },
    { id: 'rec_savings', description: 'Virement épargne automatique', type: 'transfer', amount: money(300), accountId: 'acc_main', toAccountId: 'acc_savings', paymentMethod: 'transfer', frequency: 'monthly', startDate: dateIn(-5, 2) },
    { id: 'rec_netflix', description: 'Netflix', type: 'expense', amount: money(13.49), categoryId: 'cat_subscriptions', accountId: 'acc_main', paymentMethod: 'card', frequency: 'monthly', startDate: dateIn(-5, 12) },
    { id: 'rec_spotify', description: 'Spotify', type: 'expense', amount: money(10.99), categoryId: 'cat_subscriptions', accountId: 'acc_main', paymentMethod: 'card', frequency: 'monthly', startDate: dateIn(-5, 18) },
    { id: 'rec_gym', description: 'Salle de sport', type: 'expense', amount: money(34.9), categoryId: 'cat_leisure', accountId: 'acc_main', paymentMethod: 'direct_debit', frequency: 'monthly', startDate: dateIn(-5, 6) },
    { id: 'rec_home_insurance', description: 'Assurance habitation', type: 'expense', amount: money(420), categoryId: 'cat_insurance', accountId: 'acc_main', paymentMethod: 'direct_debit', frequency: 'yearly', startDate: dateIn(3, 15) },
  ].map((rule) => normalizeRecurring({ ...rule, nextDate: rule.startDate, active: true, tags: [], createdAt: now }));

  /* ---------------- Budgets mensuels ---------------- */
  data.budgets = [
    { id: 'bud_global', scope: 'global', amount: money(2600) },
    { id: 'bud_groceries', scope: 'category', categoryId: 'cat_groceries', amount: money(450) },
    { id: 'bud_restaurant', scope: 'category', categoryId: 'cat_restaurant', amount: money(120) },
    { id: 'bud_transport', scope: 'category', categoryId: 'cat_transport', amount: money(220) },
    { id: 'bud_leisure', scope: 'category', categoryId: 'cat_leisure', amount: money(110) },
    { id: 'bud_shopping', scope: 'category', categoryId: 'cat_shopping', amount: money(150) },
  ].map((budget) => normalizeBudget({ ...budget, createdAt: now }));

  /* ---------------- Objectifs ---------------- */
  const contribution = (offset, day, amount, note = 'Versement') => ({ id: uid('ctb'), amount: money(amount), date: pastDateIn(offset, day), note });
  data.goals = [
    {
      id: 'goal_emergency', name: "Fonds d'urgence", targetAmount: money(6000), initialAmount: money(2400), targetDate: addMonths(today, 10),
      accountId: 'acc_savings', description: 'Trois à six mois de dépenses mis de côté.', icon: 'fa-shield-halved', color: '#2a78d6',
      contributions: [-5, -4, -3, -2, -1].map((offset) => contribution(offset, 28, 200, 'Versement mensuel')),
    },
    {
      id: 'goal_trip', name: 'Voyage au Japon', targetAmount: money(3500), initialAmount: money(600), targetDate: addMonths(today, 8),
      accountId: 'acc_savings', description: 'Deux semaines entre Tokyo et Kyoto.', icon: 'fa-plane', color: '#eb6834',
      contributions: [contribution(-4, 28, 300), contribution(-2, 28, 400), contribution(-1, 28, 350), contribution(0, 2, 250)],
    },
    {
      id: 'goal_laptop', name: 'Nouvel ordinateur', targetAmount: money(1600), initialAmount: money(900), targetDate: addMonths(today, 2),
      accountId: 'acc_main', description: 'Remplacer le portable actuel.', icon: 'fa-laptop', color: '#6250d6',
      contributions: [contribution(-3, 25, 250), contribution(-1, 25, 200), contribution(0, 3, 130)],
    },
    {
      id: 'goal_car', name: 'Nouvelle voiture', targetAmount: money(15000), initialAmount: money(1500), targetDate: addMonths(today, 30),
      accountId: null, description: 'Apport pour un véhicule hybride.', icon: 'fa-car', color: '#1baf7a', contributions: [],
    },
  ].map((goal) => normalizeGoal({ ...goal, createdAt: now }));

  return data;
}

/**
 * Remplace les données actuelles par les données de démonstration,
 * génère les occurrences récurrentes passées puis sauvegarde.
 */
function loadDemoData(options) {
  appData = generateDemoData(options);
  generateRecurringTransactions({ save: false });
  saveData();
}
