/* ==========================================================================
   utils.js — Fonctions utilitaires
   --------------------------------------------------------------------------
   Sécurité HTML, identifiants, nombres, dates/périodes, formatage des
   montants (formatCurrency) et petites aides diverses.
   ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
   1. Sécurité : échappement et gabarits HTML
   -------------------------------------------------------------------------- */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Échappe une valeur pour l'insérer sans risque dans du HTML. */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, (char) => HTML_ESCAPES[char]);
}

/** Fragment HTML considéré comme sûr (déjà échappé). */
class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

/**
 * Gabarit HTML sécurisé : toutes les valeurs interpolées sont échappées,
 * sauf les fragments déjà produits par html`` (SafeHtml).
 * Exemple : html`<p>${saisieUtilisateur}</p>`
 */
function html(strings, ...values) {
  let output = strings[0];
  for (let i = 0; i < values.length; i += 1) {
    output += renderHtmlValue(values[i]) + strings[i + 1];
  }
  return new SafeHtml(output);
}

function renderHtmlValue(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderHtmlValue).join('');
  if (typeof value === 'number' && !Number.isFinite(value)) return '';
  return escapeHtml(value);
}

/** Marque une chaîne statique (écrite dans le code, jamais une saisie) comme sûre. */
function raw(staticString) {
  return new SafeHtml(String(staticString));
}

/** Injecte un fragment sûr dans un élément. Une chaîne simple est échappée. */
function setHTML(element, content) {
  if (!element) return;
  element.innerHTML = content instanceof SafeHtml ? content.value : escapeHtml(content);
}

/** Construit des attributs HTML échappés à partir d'un objet. */
function attrsToHtml(attributes = {}) {
  const parts = Object.entries(attributes)
    .filter(([, value]) => value !== null && value !== undefined && value !== false)
    .map(([name, value]) => (value === true ? escapeHtml(name) : `${escapeHtml(name)}="${escapeHtml(value)}"`));
  return new SafeHtml(parts.join(' '));
}

/** Valide une couleur hexadécimale (#rrggbb) avant de l'utiliser dans un style. */
function sanitizeColor(value, fallback = NEUTRAL_COLOR) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

/** Valide un nom d'icône Font Awesome avant de l'utiliser dans une classe. */
function sanitizeIcon(value, fallback = 'fa-tag') {
  return typeof value === 'string' && /^fa-[a-z0-9-]{1,40}$/.test(value) ? value : fallback;
}

/* --------------------------------------------------------------------------
   2. Identifiants, nombres et textes
   -------------------------------------------------------------------------- */

/** Génère un identifiant unique lisible (ex. « tx_lq8k3m2a9fz1 »). */
function uid(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

/** Arrondi monétaire à 2 décimales. */
function roundMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100 + 0;
}

/** Retourne un nombre fini ou la valeur de secours. */
function safeNumber(value, fallback = 0) {
  const number = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Convertit une saisie utilisateur en nombre.
 * Accepte « 1 234,56 », « 1,234.56 », « 1234.56 », « 1’234.56 »…
 * Retourne NaN si la saisie est invalide.
 */
function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value === null || value === undefined) return NaN;
  let text = String(value).trim().replace(/[\s  '’]/g, '');
  if (!text) return NaN;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Le dernier séparateur rencontré est le séparateur décimal.
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (lastComma > -1) {
    text = text.replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return NaN;
  return parseFloat(text);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Somme d'un tableau, avec une fonction d'extraction optionnelle. */
function sumBy(items, getter = (item) => item) {
  return items.reduce((total, item) => total + safeNumber(getter(item)), 0);
}

/** Texte normalisé pour la recherche (minuscules, sans accents). */
function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Nettoie une chaîne saisie (type, espaces, longueur maximale). */
function cleanString(value, maxLength = 200) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** Accord singulier / pluriel en français (0 et 1 au singulier). */
function pluralize(count, singular, plural) {
  return `${count} ${Math.abs(count) > 1 ? plural : singular}`;
}

function capitalize(text) {
  const value = String(text ?? '');
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Copie profonde de données sérialisables. */
function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Retarde l'exécution d'une fonction (recherche instantanée, filtres…). */
function debounce(callback, wait = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), wait);
  };
}

/** Indique si l'utilisateur préfère réduire les animations. */
function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** Déclenche le téléchargement d'un fichier généré dans le navigateur. */
function downloadFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}

/* --------------------------------------------------------------------------
   3. Dates (format « AAAA-MM-JJ », toujours comparées année + mois + jour)
   -------------------------------------------------------------------------- */

const DATE_LOCALE = 'fr-FR';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** Vérifie qu'une chaîne est une date réelle au format AAAA-MM-JJ. */
function isValidDateStr(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2200 || month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** Convertit « AAAA-MM-JJ » en Date locale (minuit). */
function parseDate(value) {
  if (!isValidDateStr(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Convertit une Date en « AAAA-MM-JJ » (heure locale). */
function toDateStr(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayStr() {
  return toDateStr(new Date());
}

function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  return toDateStr(date);
}

/**
 * Ajoute des mois à une date. Le jour est limité à la fin du mois cible
 * (31 janvier + 1 mois = 28/29 février). `anchorDay` permet de conserver le
 * jour d'origine sur plusieurs itérations (31 janv. → 28 févr. → 31 mars).
 */
function addMonths(dateStr, months, anchorDay = null) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const total = year * 12 + (month - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = total - newYear * 12 + 1;
  const newDay = Math.min(anchorDay || day, daysInMonth(newYear, newMonth));
  return `${newYear}-${pad2(newMonth)}-${pad2(newDay)}`;
}

function startOfMonth(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

function endOfMonth(dateStr) {
  const [year, month] = dateStr.split('-').map(Number);
  return `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
}

function startOfYear(dateStr) {
  return `${dateStr.slice(0, 4)}-01-01`;
}

function endOfYear(dateStr) {
  return `${dateStr.slice(0, 4)}-12-31`;
}

/** Début de semaine selon le premier jour configuré (0 = dimanche, 1 = lundi). */
function startOfWeek(dateStr, firstDay = getSetting('firstDayOfWeek')) {
  const date = parseDate(dateStr);
  const diff = (date.getDay() - firstDay + 7) % 7;
  date.setDate(date.getDate() - diff);
  return toDateStr(date);
}

function endOfWeek(dateStr, firstDay = getSetting('firstDayOfWeek')) {
  return addDays(startOfWeek(dateStr, firstDay), 6);
}

/** Clé de mois « AAAA-MM » (l'année est toujours incluse). */
function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function monthKeyToRange(key) {
  return { start: `${key}-01`, end: endOfMonth(`${key}-01`) };
}

function addMonthsToKey(key, months) {
  return addMonths(`${key}-01`, months).slice(0, 7);
}

/** Nombre de jours entre deux dates (b − a). */
function daysBetween(dateA, dateB) {
  const a = parseDate(dateA);
  const b = parseDate(dateB);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

function minDate(a, b) {
  return a <= b ? a : b;
}

function maxDate(a, b) {
  return a >= b ? a : b;
}

function isInRange(dateStr, range) {
  return !range || (dateStr >= range.start && dateStr <= range.end);
}

/** Liste des clés de mois couvertes par une plage. */
function listMonthKeys(start, end) {
  const keys = [];
  let key = monthKey(start);
  const last = monthKey(end);
  let guard = 0;
  while (key <= last && guard < 2400) {
    keys.push(key);
    key = addMonthsToKey(key, 1);
    guard += 1;
  }
  return keys;
}

/** Plage du mois précédent par rapport à une date de référence. */
function previousMonthRange(reference = todayStr()) {
  const start = addMonths(startOfMonth(reference), -1);
  return { start, end: endOfMonth(start) };
}

/** Plage de l'année en cours. */
function currentYearRange(reference = todayStr()) {
  return { start: startOfYear(reference), end: endOfYear(reference) };
}

/** Plage personnalisée validée (null si invalide). */
function customRange(start, end) {
  if (!isValidDateStr(start) || !isValidDateStr(end) || start > end) return null;
  return { start, end };
}

/**
 * Convertit une période prédéfinie en plage { start, end }.
 * Retourne null pour « Toutes les dates ».
 */
function getPresetRange(preset, custom = {}) {
  const today = todayStr();
  const monthStart = startOfMonth(today);
  switch (preset) {
    case 'this-month':
      return { start: monthStart, end: endOfMonth(today) };
    case 'last-month':
      return previousMonthRange(today);
    case 'last-3-months':
      return { start: addMonths(monthStart, -2), end: endOfMonth(today) };
    case 'last-6-months':
      return { start: addMonths(monthStart, -5), end: endOfMonth(today) };
    case 'last-12-months':
      return { start: addMonths(monthStart, -11), end: endOfMonth(today) };
    case 'this-year':
      return currentYearRange(today);
    case 'custom':
      return customRange(custom.start, custom.end) || { start: monthStart, end: today };
    default:
      return null;
  }
}

/** Période de comparaison : même durée, juste avant la période étudiée. */
function getPreviousRange(range, preset) {
  if (!range) return null;
  const monthsBack = { 'this-month': 1, 'last-month': 1, 'last-3-months': 3, 'last-6-months': 6, 'last-12-months': 12, 'this-year': 12 }[preset];
  if (monthsBack) {
    const start = addMonths(range.start, -monthsBack);
    return { start, end: addDays(range.start, -1) };
  }
  const length = daysBetween(range.start, range.end) + 1;
  return { start: addDays(range.start, -length), end: addDays(range.start, -1) };
}

function getComparisonLabel(preset) {
  if (preset === 'this-month' || preset === 'last-month') return 'vs mois précédent';
  if (preset === 'this-year') return 'vs année précédente';
  return 'vs période précédente';
}

/** Libellé lisible d'une plage (« novembre 2026 », « 2026 », « 3 nov. – 9 nov. 2026 »). */
function describeRange(range) {
  if (!range) return 'Toutes les dates';
  if (range.start === startOfMonth(range.start) && range.end === endOfMonth(range.start)) {
    return capitalize(formatMonthKey(monthKey(range.start)));
  }
  if (range.start === startOfYear(range.start) && range.end === endOfYear(range.start)) {
    return range.start.slice(0, 4);
  }
  if (range.start === startOfMonth(range.start) && range.end === endOfMonth(range.end)) {
    return `${capitalize(formatMonthKey(monthKey(range.start), 'short'))} – ${formatMonthKey(monthKey(range.end), 'short')}`;
  }
  return `${formatDate(range.start)} – ${formatDate(range.end)}`;
}

/* --------------------------------------------------------------------------
   4. Formatage des dates
   -------------------------------------------------------------------------- */

const DATE_STYLES = {
  short: { day: '2-digit', month: '2-digit', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  dayMonth: { day: 'numeric', month: 'short' },
  weekday: { weekday: 'short' },
};

const dateFormatterCache = new Map();

function getDateFormatter(style) {
  if (!dateFormatterCache.has(style)) {
    dateFormatterCache.set(style, new Intl.DateTimeFormat(DATE_LOCALE, DATE_STYLES[style] || DATE_STYLES.medium));
  }
  return dateFormatterCache.get(style);
}

/** Formate une date « AAAA-MM-JJ » ; retourne « — » si la date est invalide. */
function formatDate(dateStr, style = 'medium') {
  const date = parseDate(dateStr);
  if (!date) return '—';
  return getDateFormatter(style).format(date);
}

/** Formate une clé de mois : « novembre 2026 » (long) ou « nov. 2026 » (short). */
function formatMonthKey(key, style = 'long') {
  const date = parseDate(`${key}-01`);
  if (!date) return '—';
  const options = style === 'short' ? { month: 'short', year: 'numeric' } : style === 'month' ? { month: 'short' } : { month: 'long', year: 'numeric' };
  const cacheKey = `month-${style}`;
  if (!dateFormatterCache.has(cacheKey)) dateFormatterCache.set(cacheKey, new Intl.DateTimeFormat(DATE_LOCALE, options));
  return dateFormatterCache.get(cacheKey).format(date);
}

/** Libellé relatif : « Aujourd'hui », « Dans 3 jours », « Il y a 2 jours ». */
function relativeDayLabel(dateStr) {
  const diff = daysBetween(todayStr(), dateStr);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  if (diff > 1) return `Dans ${diff} jours`;
  return `Il y a ${-diff} jours`;
}

/** Formate une date ISO complète (horodatage) en « 10 nov. 2026 à 14:05 ». */
function formatDateTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(DATE_LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

/* --------------------------------------------------------------------------
   5. Formatage des montants et des nombres
   -------------------------------------------------------------------------- */

const numberFormatterCache = new Map();

/**
 * Remplace l'espace fine insécable (U+202F) produite par Intl par une espace
 * insécable classique : avec la police Inter, l'espace fine devient presque
 * invisible après un « 1 » (« 21775 » au lieu de « 21 775 »).
 */
function widenNumberSpaces(text) {
  return text.replace(/ /g, ' ');
}

function getNumberFormatter(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  if (!numberFormatterCache.has(key)) {
    let formatter = null;
    try {
      formatter = new Intl.NumberFormat(locale, options);
    } catch (error) {
      formatter = null;
    }
    numberFormatterCache.set(key, formatter);
  }
  return numberFormatterCache.get(key);
}

/**
 * Fonction centrale de formatage des montants.
 * Utilise la devise configurée (ou celle passée en paramètre), le format de
 * nombres et l'affichage des décimales définis dans les paramètres.
 * Ne retourne jamais « NaN », « undefined » ni « null ».
 *
 * @param {number} amount
 * @param {string} [currencyCode] devise spécifique (sinon devise principale)
 * @param {{compact?: boolean, signDisplay?: string}} [options]
 */
function formatCurrency(amount, currencyCode = null, options = {}) {
  const settings = getSettings();
  const code = CURRENCIES[currencyCode] ? currencyCode : settings.currency;
  const number = Number(amount);
  let value = Number.isFinite(number) ? number : 0;
  const decimals = settings.showDecimals ? 2 : 0;

  const intlOptions = { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' };
  if (options.compact) {
    intlOptions.notation = 'compact';
    intlOptions.maximumFractionDigits = 1;
  } else {
    intlOptions.minimumFractionDigits = decimals;
    intlOptions.maximumFractionDigits = decimals;
    value = decimals === 0 ? Math.round(value) + 0 : roundMoney(value);
  }
  if (options.signDisplay) intlOptions.signDisplay = options.signDisplay;

  let formatter = getNumberFormatter(settings.numberFormat, intlOptions);
  if (!formatter) {
    // Anciens navigateurs : « narrowSymbol » ou « compact » non supportés.
    const fallbackOptions = { style: 'currency', currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals };
    formatter = getNumberFormatter(settings.numberFormat, fallbackOptions);
  }
  if (formatter) return widenNumberSpaces(formatter.format(value));

  // Secours ultime sans Intl.
  const sign = value < 0 ? '-' : options.signDisplay === 'exceptZero' && value > 0 ? '+' : '';
  return `${sign}${Math.abs(value).toFixed(decimals)} ${CURRENCIES[code].fallbackSymbol}`;
}

/** Formate un nombre simple selon le format configuré. */
function formatNumber(value, decimals = 0) {
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  const formatter = getNumberFormatter(getSetting('numberFormat'), { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return formatter ? widenNumberSpaces(formatter.format(number)) : number.toFixed(decimals);
}

/**
 * Formate un pourcentage (12.5 → « 12,5 % »).
 * @param {number|null} value
 * @param {{decimals?: number, signed?: boolean}} [options]
 */
function formatPercent(value, { decimals = 1, signed = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const formatter = getNumberFormatter(getSetting('numberFormat'), {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    signDisplay: signed ? 'exceptZero' : 'auto',
  });
  return formatter ? widenNumberSpaces(formatter.format(number / 100)) : `${number.toFixed(decimals)} %`;
}

/** Exemple de formatage pour une locale donnée (utilisé dans les paramètres). */
function formatNumberExample(locale) {
  const formatter = getNumberFormatter(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return formatter ? widenNumberSpaces(formatter.format(1234567.89)) : '1234567.89';
}

/** Séparateur décimal de la locale configurée (export CSV). */
function getDecimalSeparator() {
  const formatter = getNumberFormatter(getSetting('numberFormat'), { minimumFractionDigits: 1 });
  if (!formatter || !formatter.formatToParts) return ',';
  const part = formatter.formatToParts(1.5).find((p) => p.type === 'decimal');
  return part ? part.value : ',';
}
