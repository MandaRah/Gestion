/* ==========================================================================
   recurring.js — Transactions récurrentes et occurrences d'échéances
   --------------------------------------------------------------------------
   Une règle récurrente conserve :
   • startDate : première occurrence (et jour d'ancrage mensuel),
   • nextDate  : prochaine occurrence non encore générée (null si terminée),
   • lastDate  : dernière occurrence générée.
   generateRecurringTransactions() crée les occurrences arrivées à échéance
   sans jamais créer de doublon (pointeur nextDate + contrôle règle/date).
   ========================================================================== */
'use strict';

/** Jour d'ancrage d'une date (évite la dérive 31 → 28 → 28…). */
function getAnchorDay(dateStr) {
  return Number(dateStr.slice(8, 10));
}

/** Calcule l'occurrence suivante selon une fréquence. */
function addFrequency(dateStr, frequency, anchorDay = null) {
  switch (frequency) {
    case 'daily':
      return addDays(dateStr, 1);
    case 'weekly':
      return addDays(dateStr, 7);
    case 'monthly':
      return addMonths(dateStr, 1, anchorDay);
    case 'quarterly':
      return addMonths(dateStr, 3, anchorDay);
    case 'yearly':
      return addMonths(dateStr, 12, anchorDay);
    default:
      return null;
  }
}

/**
 * Première occurrence d'une règle strictement postérieure à `afterDate`
 * (ou la date de début si `afterDate` est vide). Null si la règle est terminée.
 */
function computeNextDate(rule, afterDate = null) {
  const anchor = getAnchorDay(rule.startDate);
  let date = rule.startDate;
  let guard = 0;
  while (afterDate && date <= afterDate && guard < 100000) {
    date = addFrequency(date, rule.frequency, anchor);
    guard += 1;
  }
  if (rule.endDate && date > rule.endDate) return null;
  return date;
}

/** Occurrences futures (non générées) d'une règle entre deux dates incluses. */
function getRuleOccurrences(rule, from, to, limit = 1000) {
  if (!rule.active || !rule.nextDate) return [];
  const anchor = getAnchorDay(rule.startDate);
  const dates = [];
  let date = rule.nextDate;
  let guard = 0;
  while (date && date <= to && guard < 20000) {
    if (rule.endDate && date > rule.endDate) break;
    if (date >= from) {
      dates.push(date);
      if (dates.length >= limit) break;
    }
    date = addFrequency(date, rule.frequency, anchor);
    guard += 1;
  }
  return dates;
}

/** Une règle est exploitable si ses comptes existent (et diffèrent pour un transfert). */
function isRuleValid(rule) {
  if (!getAccount(rule.accountId)) return false;
  if (rule.type === 'transfer') return Boolean(getAccount(rule.toAccountId)) && rule.toAccountId !== rule.accountId;
  return true;
}

/** Statut affiché d'une règle récurrente. */
function getRuleStatus(rule) {
  if (!isRuleValid(rule)) return { key: 'invalid', label: 'Compte introuvable', badge: 'danger' };
  if (!rule.nextDate) return { key: 'ended', label: 'Terminée', badge: 'neutral' };
  if (!rule.active) return { key: 'paused', label: 'Suspendue', badge: 'warning' };
  return { key: 'active', label: 'Active', badge: 'success' };
}

/** Équivalent mensuel moyen d'une règle (pour les synthèses). */
function getMonthlyEquivalent(rule) {
  return roundMoney(rule.amount * (FREQUENCY_PER_MONTH[rule.frequency] || 0));
}

/** Crée la transaction correspondant à une occurrence d'une règle. */
function createTransactionFromRule(rule, date) {
  const now = new Date().toISOString();
  return normalizeTransaction({
    id: uid('tx'),
    type: rule.type,
    amount: rule.amount,
    date,
    description: rule.description,
    categoryId: rule.categoryId,
    accountId: rule.accountId,
    toAccountId: rule.toAccountId,
    paymentMethod: rule.paymentMethod,
    notes: rule.notes,
    tags: [...rule.tags],
    status: 'completed',
    recurringId: rule.id,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Génère les transactions récurrentes arrivées à échéance (date ≤ aujourd'hui).
 * Aucune occurrence n'est créée deux fois : le pointeur nextDate avance après
 * chaque génération et un index règle|date empêche tout doublon.
 * @returns {number} nombre de transactions créées
 */
function generateRecurringTransactions({ save = true } = {}) {
  const today = todayStr();
  const existing = new Set(appData.transactions.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.date}`));
  let created = 0;
  let changed = false;

  appData.recurringTransactions.forEach((rule) => {
    if (!rule.active || !rule.nextDate || !isRuleValid(rule)) return;
    const anchor = getAnchorDay(rule.startDate);
    let next = rule.nextDate;
    let guard = 0;
    while (next && next <= today && guard < 5000) {
      if (rule.endDate && next > rule.endDate) {
        next = null;
        break;
      }
      const key = `${rule.id}|${next}`;
      if (!existing.has(key)) {
        appData.transactions.push(createTransactionFromRule(rule, next));
        existing.add(key);
        created += 1;
      }
      rule.lastDate = next;
      next = addFrequency(next, rule.frequency, anchor);
      guard += 1;
    }
    if (next && rule.endDate && next > rule.endDate) next = null;
    if (next !== rule.nextDate) {
      rule.nextDate = next;
      changed = true;
    }
  });

  if (save && (created > 0 || changed)) saveData();
  return created;
}

/**
 * Occurrences non payées d'une échéance entre deux dates.
 * Une échéance en retard est projetée à la date `overdueOn` si elle est fournie.
 * @returns {Array<{date: string, dueDate: string, overdue: boolean}>}
 */
function getBillOccurrences(bill, from, to, { overdueOn = null, limit = 500 } = {}) {
  if (bill.status === 'paid') return [];
  const occurrences = [];
  let date = bill.dueDate;
  let guard = 0;
  while (date && date <= to && guard < 5000 && occurrences.length < limit) {
    if (date < from) {
      // Occurrences passées non payées : toutes restent dues.
      if (overdueOn) occurrences.push({ date: overdueOn, dueDate: date, overdue: date < todayStr() });
    } else {
      occurrences.push({ date, dueDate: date, overdue: false });
    }
    if (bill.recurrence === 'none') break;
    date = addFrequency(date, bill.recurrence, bill.anchorDay);
    guard += 1;
  }
  return occurrences;
}
