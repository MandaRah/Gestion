/* ==========================================================================
   config.js — Constantes et configuration globale
   --------------------------------------------------------------------------
   Toutes les listes de référence (devises, types, fréquences, catégories par
   défaut, icônes, couleurs…) sont centralisées ici.
   ========================================================================== */
'use strict';

const APP_NAME = 'Gestion financière';
const STORAGE_KEY = 'financeAppData';
const DATA_VERSION = '1.0';

/** Identifiant virtuel utilisé pour les transactions sans catégorie valide. */
const UNCATEGORIZED_ID = '__uncategorized__';

/** Couleur neutre (catégorie supprimée, « Autres », etc.). */
const NEUTRAL_COLOR = '#898781';

/**
 * Devises disponibles.
 * Le formatage passe toujours par formatCurrency() (Intl.NumberFormat).
 * `fallbackSymbol` n'est utilisé qu'en secours si Intl n'est pas disponible.
 * `demoScale` adapte les montants des données de démonstration à la devise.
 */
const CURRENCIES = {
  MGA: { code: 'MGA', name: 'Ariary malgache', fallbackSymbol: 'Ar', demoScale: 5000 },
  CHF: { code: 'CHF', name: 'Franc suisse', fallbackSymbol: 'CHF', demoScale: 1 },
  EUR: { code: 'EUR', name: 'Euro', fallbackSymbol: '€', demoScale: 1 },
  USD: { code: 'USD', name: 'Dollar américain', fallbackSymbol: '$', demoScale: 1 },
  GBP: { code: 'GBP', name: 'Livre sterling', fallbackSymbol: '£', demoScale: 1 },
};

/** Formats de nombres proposés (locale Intl). */
const NUMBER_FORMATS = [
  { value: 'fr-FR', label: 'Français' },
  { value: 'en-US', label: 'Anglais (États-Unis)' },
  { value: 'de-DE', label: 'Allemand' },
  { value: 'de-CH', label: 'Suisse' },
];

/** Paramètres par défaut. */
const DEFAULT_SETTINGS = {
  userName: '',
  currency: 'EUR',
  numberFormat: 'fr-FR',
  firstDayOfWeek: 1, // 0 = dimanche, 1 = lundi
  theme: 'light',
  showDecimals: true,
  budgetWarningThreshold: 75,
  budgetDangerThreshold: 90,
  lowBalanceThreshold: 100,
  billReminderDays: 5,
};

/** Types de transactions. */
const TRANSACTION_TYPES = {
  income: { label: 'Revenu', plural: 'Revenus', icon: 'fa-arrow-down-long' },
  expense: { label: 'Dépense', plural: 'Dépenses', icon: 'fa-arrow-up-long' },
  transfer: { label: 'Transfert', plural: 'Transferts', icon: 'fa-right-left' },
};

/** Statuts de transaction : les transactions « en attente » ne sont pas comptabilisées. */
const TRANSACTION_STATUSES = {
  completed: { label: 'Effectuée', badge: 'success' },
  pending: { label: 'En attente', badge: 'warning' },
};

/** Types de comptes. */
const ACCOUNT_TYPES = {
  checking: { label: 'Compte courant', icon: 'fa-building-columns' },
  savings: { label: 'Compte épargne', icon: 'fa-piggy-bank' },
  cash: { label: 'Cash', icon: 'fa-money-bill-wave' },
  card: { label: 'Carte', icon: 'fa-credit-card' },
  business: { label: 'Compte professionnel', icon: 'fa-briefcase' },
  investment: { label: 'Investissement', icon: 'fa-chart-line' },
  other: { label: 'Autre', icon: 'fa-wallet' },
};

/** Modes de paiement. */
const PAYMENT_METHODS = {
  card: 'Carte bancaire',
  cash: 'Espèces',
  transfer: 'Virement',
  direct_debit: 'Prélèvement',
  mobile: 'Mobile money',
  check: 'Chèque',
  other: 'Autre',
};

/** Fréquences des transactions récurrentes. */
const FREQUENCIES = {
  daily: 'Quotidienne',
  weekly: 'Hebdomadaire',
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  yearly: 'Annuelle',
};

/** Nombre d'occurrences moyennes par mois, pour estimer un impact mensuel. */
const FREQUENCY_PER_MONTH = {
  daily: 365.25 / 12,
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

/** Récurrences possibles pour une échéance. */
const BILL_RECURRENCES = {
  none: 'Ponctuelle',
  weekly: 'Hebdomadaire',
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  yearly: 'Annuelle',
};

/** Statuts affichés pour une échéance (calculés). */
const BILL_STATUSES = {
  upcoming: { label: 'À venir', badge: 'info', icon: 'fa-clock' },
  overdue: { label: 'En retard', badge: 'danger', icon: 'fa-circle-exclamation' },
  paid: { label: 'Payé', badge: 'success', icon: 'fa-circle-check' },
};

/** Statuts de budget (seuils configurables dans les paramètres). */
const BUDGET_STATUSES = {
  normal: { label: 'Normal', icon: 'fa-circle-check' },
  warning: { label: 'Attention', icon: 'fa-triangle-exclamation' },
  danger: { label: 'Danger', icon: 'fa-fire' },
  exceeded: { label: 'Dépassé', icon: 'fa-circle-xmark' },
};

/** Périodes prédéfinies pour les filtres. */
const PERIOD_PRESETS = [
  { value: 'all', label: 'Toutes les dates' },
  { value: 'this-month', label: 'Ce mois' },
  { value: 'last-month', label: 'Mois précédent' },
  { value: 'last-3-months', label: '3 derniers mois' },
  { value: 'last-6-months', label: '6 derniers mois' },
  { value: 'this-year', label: 'Cette année' },
  { value: 'custom', label: 'Personnalisé' },
];

/** Catégories créées par défaut (identifiants stables pour les données de démo). */
const DEFAULT_CATEGORIES = [
  { id: 'cat_housing', name: 'Logement', icon: 'fa-house', color: '#2a78d6', type: 'expense' },
  { id: 'cat_groceries', name: 'Courses', icon: 'fa-cart-shopping', color: '#1baf7a', type: 'expense' },
  { id: 'cat_transport', name: 'Transport', icon: 'fa-car', color: '#eda100', type: 'expense' },
  { id: 'cat_health', name: 'Santé', icon: 'fa-heart-pulse', color: '#e34948', type: 'expense' },
  { id: 'cat_leisure', name: 'Loisirs', icon: 'fa-gamepad', color: '#6250d6', type: 'expense' },
  { id: 'cat_subscriptions', name: 'Abonnements', icon: 'fa-repeat', color: '#0e9fb5', type: 'expense' },
  { id: 'cat_restaurant', name: 'Restaurant', icon: 'fa-utensils', color: '#eb6834', type: 'expense' },
  { id: 'cat_shopping', name: 'Shopping', icon: 'fa-bag-shopping', color: '#e87ba4', type: 'expense' },
  { id: 'cat_education', name: 'Éducation', icon: 'fa-graduation-cap', color: '#008300', type: 'expense' },
  { id: 'cat_travel', name: 'Voyages', icon: 'fa-plane', color: '#5598e7', type: 'expense' },
  { id: 'cat_insurance', name: 'Assurances', icon: 'fa-shield-halved', color: '#7a6f5d', type: 'expense' },
  { id: 'cat_utilities', name: 'Factures', icon: 'fa-bolt', color: '#c98500', type: 'expense' },
  { id: 'cat_other_expense', name: 'Autres', icon: 'fa-ellipsis', color: '#898781', type: 'expense' },
  { id: 'cat_salary', name: 'Salaire', icon: 'fa-briefcase', color: '#1baf7a', type: 'income' },
  { id: 'cat_freelance', name: 'Freelance', icon: 'fa-laptop-code', color: '#2a78d6', type: 'income' },
  { id: 'cat_business', name: 'Entreprise', icon: 'fa-store', color: '#6250d6', type: 'income' },
  { id: 'cat_investments', name: 'Investissements', icon: 'fa-chart-line', color: '#eda100', type: 'income' },
  { id: 'cat_bonus', name: 'Prime', icon: 'fa-gift', color: '#e87ba4', type: 'income' },
  { id: 'cat_refund', name: 'Remboursement', icon: 'fa-rotate-left', color: '#0e9fb5', type: 'income' },
  { id: 'cat_other_income', name: 'Autres', icon: 'fa-ellipsis', color: '#898781', type: 'income' },
];

/** Icônes proposées pour les catégories et les objectifs (Font Awesome 6, style solid). */
const ICON_CHOICES = [
  'fa-house', 'fa-house-chimney', 'fa-cart-shopping', 'fa-basket-shopping', 'fa-car', 'fa-bus',
  'fa-gas-pump', 'fa-train', 'fa-bicycle', 'fa-plane', 'fa-umbrella-beach', 'fa-heart-pulse',
  'fa-pills', 'fa-tooth', 'fa-gamepad', 'fa-film', 'fa-music', 'fa-ticket',
  'fa-repeat', 'fa-tv', 'fa-wifi', 'fa-mobile-screen', 'fa-bolt', 'fa-droplet',
  'fa-fire', 'fa-utensils', 'fa-mug-hot', 'fa-wine-glass', 'fa-bag-shopping', 'fa-shirt',
  'fa-gift', 'fa-graduation-cap', 'fa-book', 'fa-baby', 'fa-child', 'fa-paw',
  'fa-dumbbell', 'fa-shield-halved', 'fa-screwdriver-wrench', 'fa-scissors', 'fa-briefcase', 'fa-laptop-code',
  'fa-laptop', 'fa-store', 'fa-chart-line', 'fa-coins', 'fa-piggy-bank', 'fa-sack-dollar',
  'fa-money-bill-wave', 'fa-hand-holding-dollar', 'fa-rotate-left', 'fa-building-columns', 'fa-landmark', 'fa-receipt',
  'fa-file-invoice-dollar', 'fa-percent', 'fa-users', 'fa-hand-holding-heart', 'fa-seedling', 'fa-key',
  'fa-ring', 'fa-camera', 'fa-palette', 'fa-trophy', 'fa-star', 'fa-ellipsis',
];

/** Couleurs proposées (palette catégorielle validée + teintes complémentaires). */
const COLOR_CHOICES = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948',
  '#0e9fb5', '#5598e7', '#c98500', '#7a6f5d', '#b5487a', '#3f8f5f', '#9a5bd6', '#898781',
];

/** Noms accessibles des couleurs proposées (même ordre que COLOR_CHOICES). */
const COLOR_LABELS = [
  'Bleu', 'Orange', 'Turquoise', 'Jaune', 'Rose', 'Vert', 'Violet', 'Rouge',
  'Cyan', 'Bleu clair', 'Ocre', 'Taupe', 'Framboise', 'Vert sapin', 'Lilas', 'Gris',
];

/** Métadonnées des vues (titre, icône, sous-titre). */
const VIEW_META = {
  dashboard: { title: 'Tableau de bord', icon: 'fa-house' },
  income: { title: 'Revenus', icon: 'fa-arrow-trend-up' },
  expenses: { title: 'Dépenses', icon: 'fa-arrow-trend-down' },
  transactions: { title: 'Transactions', icon: 'fa-right-left' },
  budgets: { title: 'Budgets', icon: 'fa-chart-pie' },
  goals: { title: 'Objectifs', icon: 'fa-bullseye' },
  accounts: { title: 'Comptes', icon: 'fa-building-columns' },
  categories: { title: 'Catégories', icon: 'fa-folder-open' },
  reports: { title: 'Rapports', icon: 'fa-chart-line' },
  forecast: { title: 'Prévisions', icon: 'fa-calendar-days' },
  bills: { title: 'Échéances', icon: 'fa-file-invoice-dollar' },
  settings: { title: 'Paramètres', icon: 'fa-gear' },
};
