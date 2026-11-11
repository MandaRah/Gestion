/* ==========================================================================
   ui.js — Composants d'interface réutilisables
   --------------------------------------------------------------------------
   État d'interface, registre d'actions, modales, confirmations, toasts,
   aides de formulaires et petits composants HTML (cartes KPI, badges,
   barres de progression, états vides, onglets, sélecteur de période).
   ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
   État d'interface (non persistant)
   -------------------------------------------------------------------------- */

const viewState = {
  currentView: 'dashboard',
  dashboard: { period: { preset: 'this-month', start: '', end: '' }, granularity: 'auto' },
  income: { period: { preset: 'this-month', start: '', end: '' } },
  expenses: { period: { preset: 'this-month', start: '', end: '' } },
  transactions: {
    tab: 'all',
    filters: createDefaultTransactionFilters(),
    sort: { key: 'date', direction: 'desc' },
    page: 1,
    pageSize: 25,
    filtersOpen: false,
  },
  budgets: { month: null },
  categories: { tab: 'expense' },
  reports: { tab: 'monthly', year: null, month: null, categoryId: '', accountId: '' },
  forecast: { tab: 'projection', horizon: '3m', include: { recurring: true, bills: true, budgets: true, pending: true }, calendarMonth: null, selectedDate: null },
  bills: { filter: 'all' },
};

function createDefaultTransactionFilters() {
  return { search: '', type: '', categoryId: '', accountId: '', status: '', minAmount: '', maxAmount: '', period: { preset: 'all', start: '', end: '' } };
}

/* --------------------------------------------------------------------------
   Registre d'actions (délégation d'événements via data-action)
   -------------------------------------------------------------------------- */

const actionHandlers = {};
const periodOwners = {};
const tabGroups = {};

/** Enregistre des actions déclenchées par data-action / data-change-action / data-input-action. */
function registerActions(map) {
  Object.assign(actionHandlers, map);
}

function runAction(name, element, event) {
  const handler = actionHandlers[name];
  if (typeof handler === 'function') handler(element, event);
}

/** Déclare un sélecteur de période : getter de l'état + rendu à relancer. */
function registerPeriodOwner(key, getState, onChange) {
  periodOwners[key] = { getState, onChange };
}

/** Déclare un groupe d'onglets : callback appelé avec la valeur choisie. */
function registerTabGroup(group, onSelect) {
  tabGroups[group] = onSelect;
}

/* --------------------------------------------------------------------------
   Modales
   -------------------------------------------------------------------------- */

const modalStack = [];
let modalCounter = 0;

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container) {
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => element.offsetParent !== null);
}

/**
 * Affiche une modale.
 * @param {object} options
 * @param {string|SafeHtml} options.title
 * @param {SafeHtml} options.content contenu (corps + pied)
 * @param {'sm'|'md'|'lg'} [options.size]
 * @param {boolean} [options.dismissible] fermeture via Échap / clic extérieur / bouton ×
 * @param {Function} [options.onClose]
 * @param {string} [options.initialFocus] sélecteur de l'élément à focaliser
 * @returns {{id, element, backdrop}} référence de la modale
 */
function showModal({ title, content, size = 'md', dismissible = true, onClose = null, initialFocus = null } = {}) {
  modalCounter += 1;
  const id = `modal-${modalCounter}`;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  setHTML(backdrop, html`
    <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-labelledby="${id}-title" tabindex="-1">
      <div class="modal-header">
        <h2 class="modal-title" id="${id}-title">${title}</h2>
        ${dismissible ? html`<button type="button" class="icon-btn" data-modal-close aria-label="Fermer la fenêtre"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ''}
      </div>
      <div class="modal-content">${content}</div>
    </div>`);

  const modal = {
    id,
    backdrop,
    element: backdrop.querySelector('.modal'),
    dismissible,
    onClose,
    previousFocus: document.activeElement,
    closed: false,
  };
  modalStack.push(modal);
  document.getElementById('modal-root').appendChild(backdrop);
  document.body.classList.add('modal-open');

  let pointerStartedOnBackdrop = false;
  backdrop.addEventListener('mousedown', (event) => {
    pointerStartedOnBackdrop = event.target === backdrop;
  });
  backdrop.addEventListener('click', (event) => {
    if (dismissible && event.target === backdrop && pointerStartedOnBackdrop) closeModal(modal);
  });
  backdrop.querySelectorAll('[data-modal-close]').forEach((button) => {
    button.addEventListener('click', () => closeModal(modal));
  });

  requestAnimationFrame(() => backdrop.classList.add('is-open'));
  const target = (initialFocus && modal.element.querySelector(initialFocus))
    || modal.element.querySelector('[autofocus]')
    || getFocusableElements(modal.element).find((element) => !element.matches('[data-modal-close]'))
    || modal.element;
  setTimeout(() => target.focus(), 40);
  return modal;
}

/**
 * Ferme une modale (par défaut la plus récente).
 * @param {object} [modal]
 * @param {{silent?: boolean}} [options] silent : n'appelle pas onClose
 */
function closeModal(modal = modalStack[modalStack.length - 1], { silent = false } = {}) {
  if (!modal || modal.closed) return;
  modal.closed = true;
  const index = modalStack.indexOf(modal);
  if (index > -1) modalStack.splice(index, 1);
  modal.backdrop.classList.remove('is-open');
  modal.backdrop.classList.add('is-closing');
  setTimeout(() => modal.backdrop.remove(), prefersReducedMotion() ? 0 : 180);
  if (!modalStack.length) document.body.classList.remove('modal-open');
  if (!silent && typeof modal.onClose === 'function') modal.onClose();
  if (modal.previousFocus && document.body.contains(modal.previousFocus) && typeof modal.previousFocus.focus === 'function') {
    modal.previousFocus.focus();
  }
}

/** Gestion clavier des modales : Échap pour fermer, Tab piégé dans la modale. */
function handleModalKeydown(event) {
  const modal = modalStack[modalStack.length - 1];
  if (!modal) return false;
  if (event.key === 'Escape') {
    if (modal.dismissible) closeModal(modal);
    event.preventDefault();
    return true;
  }
  if (event.key === 'Tab') {
    const focusable = getFocusableElements(modal.element);
    if (!focusable.length) {
      event.preventDefault();
      return true;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!modal.element.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return true;
  }
  return false;
}

/** Corps + pied de modale standard à l'intérieur d'un formulaire. */
function modalForm(formId, body, footer, attributes = {}) {
  return html`<form id="${formId}" class="modal-form" novalidate ${attrsToHtml(attributes)}>
    <div class="modal-body">${body}</div>
    <div class="modal-footer">${footer}</div>
  </form>`;
}

/** Boutons de pied de formulaire standard (Annuler + Valider). */
function modalFooterButtons(submitLabel = 'Enregistrer', { danger = false, extra = '' } = {}) {
  return html`${extra}
    <button type="button" class="btn btn-ghost" data-modal-close>Annuler</button>
    <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${submitLabel}</button>`;
}

/**
 * Boîte de confirmation personnalisée (remplace window.confirm).
 * @returns {Promise<{confirmed: boolean, checked: boolean}>}
 */
function confirmDialog({
  title = 'Confirmation', message = '', details = '', confirmLabel = 'Confirmer', cancelLabel = 'Annuler',
  variant = 'danger', checkboxLabel = '', checkboxChecked = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let modal = null;
    const finish = (confirmed) => {
      if (settled) return;
      settled = true;
      const checkbox = modal.element.querySelector('input[name="confirm-check"]');
      resolve({ confirmed, checked: Boolean(checkbox && checkbox.checked) });
    };
    modal = showModal({
      title,
      size: 'sm',
      initialFocus: '[data-confirm="cancel"]',
      onClose: () => finish(false),
      content: html`
        <div class="modal-body">
          <div class="confirm-message confirm-${variant}">
            <span class="confirm-icon" aria-hidden="true"><i class="fa-solid ${variant === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-question'}"></i></span>
            <div>
              <p>${message}</p>
              ${details ? html`<p class="text-muted small mt-1">${details}</p>` : ''}
            </div>
          </div>
          ${checkboxLabel ? html`<label class="checkbox mt-2"><input type="checkbox" name="confirm-check" ${checkboxChecked ? raw('checked') : ''}><span>${checkboxLabel}</span></label>` : ''}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" data-confirm="cancel">${cancelLabel}</button>
          <button type="button" class="btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}" data-confirm="ok">${confirmLabel}</button>
        </div>`,
    });
    modal.element.querySelector('[data-confirm="ok"]').addEventListener('click', () => {
      finish(true);
      closeModal(modal, { silent: true });
    });
    modal.element.querySelector('[data-confirm="cancel"]').addEventListener('click', () => {
      finish(false);
      closeModal(modal, { silent: true });
    });
  });
}

/* --------------------------------------------------------------------------
   Notifications toast
   -------------------------------------------------------------------------- */

const TOAST_ICONS = {
  success: 'fa-circle-check',
  error: 'fa-circle-exclamation',
  warning: 'fa-triangle-exclamation',
  info: 'fa-circle-info',
};

/**
 * Affiche une notification discrète qui disparaît automatiquement.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type]
 */
function showToast(message, type = 'success', { duration = 3800 } = {}) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  if (type === 'error') toast.setAttribute('role', 'alert');
  setHTML(toast, html`
    <i class="fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.info} toast-icon" aria-hidden="true"></i>
    <p class="toast-message">${message}</p>
    <button type="button" class="toast-close" aria-label="Fermer la notification"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`);
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));

  const remove = () => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 250);
  };
  const timer = setTimeout(remove, type === 'error' ? duration + 2500 : duration);
  toast.querySelector('.toast-close').addEventListener('click', () => {
    clearTimeout(timer);
    remove();
  });
  while (container.children.length > 4) container.firstElementChild.remove();
}

/* --------------------------------------------------------------------------
   Formulaires : champs, lecture et affichage des erreurs
   -------------------------------------------------------------------------- */

/**
 * Génère un champ de formulaire accessible (label, aide, zone d'erreur).
 * type : text | date | textarea | select | amount | number | email | color
 */
function formField({
  formId, name, label, type = 'text', value = '', required = false, placeholder = '', hint = '',
  options = [], attrs = {}, className = '', rows = 3,
}) {
  const id = `${formId}-${name}`;
  const describedBy = [hint ? `${id}-hint` : '', `${id}-error`].filter(Boolean).join(' ');
  const common = { id, name, 'aria-describedby': describedBy, 'aria-required': required ? 'true' : null, ...attrs };
  let control;
  if (type === 'select') {
    control = html`<select class="input" ${attrsToHtml(common)}>
      ${options.map((option) => html`<option value="${option.value}" ${String(option.value) === String(value) ? raw('selected') : ''} ${option.disabled ? raw('disabled') : ''}>${option.label}</option>`)}
    </select>`;
  } else if (type === 'textarea') {
    control = html`<textarea class="input" rows="${rows}" placeholder="${placeholder}" ${attrsToHtml(common)}>${value}</textarea>`;
  } else if (type === 'amount') {
    control = html`<input class="input" type="text" inputmode="decimal" autocomplete="off" value="${value}" placeholder="${placeholder || '0,00'}" ${attrsToHtml(common)}>`;
  } else {
    control = html`<input class="input" type="${type}" value="${value}" placeholder="${placeholder}" ${attrsToHtml(common)}>`;
  }
  return html`<div class="field ${className}">
    <label class="field-label" for="${id}">${label}${required ? html`<span class="required" aria-hidden="true"> *</span>` : ''}</label>
    ${control}
    ${hint ? html`<p class="field-hint" id="${id}-hint">${hint}</p>` : ''}
    <p class="field-error" id="${id}-error" data-error-for="${name}"></p>
  </div>`;
}

/** Zone d'erreur pour un groupe de champs (radios, sélecteurs personnalisés). */
function fieldError(formId, name) {
  return html`<p class="field-error" id="${formId}-${name}-error" data-error-for="${name}"></p>`;
}

/** Valeur montant formatée pour un champ de saisie (séparateur décimal local). */
function amountInputValue(amount) {
  if (amount === '' || amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '';
  return String(roundMoney(amount)).replace('.', getDecimalSeparator());
}

/** Lit les valeurs d'un formulaire (les cases à cocher deviennent des booléens). */
function getFormValues(form) {
  const values = {};
  [...form.elements].forEach((element) => {
    if (!element.name || element.disabled) return;
    if (element.type === 'checkbox') values[element.name] = element.checked;
    else if (element.type === 'radio') {
      if (element.checked) values[element.name] = element.value;
      else if (!(element.name in values)) values[element.name] = '';
    } else values[element.name] = element.value;
  });
  return values;
}

function clearFieldError(form, name) {
  if (!name) return;
  const errorElement = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
  if (errorElement) errorElement.textContent = '';
  form.querySelectorAll(`[name="${CSS.escape(name)}"]`).forEach((input) => {
    input.removeAttribute('aria-invalid');
    const field = input.closest('.field');
    if (field) field.classList.remove('has-error');
  });
}

function clearFormErrors(form) {
  form.querySelectorAll('[data-error-for]').forEach((element) => {
    element.textContent = '';
  });
  form.querySelectorAll('[aria-invalid]').forEach((element) => element.removeAttribute('aria-invalid'));
  form.querySelectorAll('.has-error').forEach((element) => element.classList.remove('has-error'));
}

/**
 * Affiche les erreurs sous les champs concernés et focalise le premier.
 * @param {HTMLFormElement} form
 * @param {Object<string, string>} errors nom du champ → message
 * @returns {boolean} vrai s'il y a des erreurs
 */
function showFormErrors(form, errors) {
  clearFormErrors(form);
  const names = Object.keys(errors);
  names.forEach((name) => {
    const errorElement = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
    if (errorElement) errorElement.textContent = errors[name];
    form.querySelectorAll(`[name="${CSS.escape(name)}"]`).forEach((input) => {
      input.setAttribute('aria-invalid', 'true');
      const field = input.closest('.field');
      if (field) field.classList.add('has-error');
    });
  });
  if (names.length) {
    const first = form.querySelector(`[name="${CSS.escape(names[0])}"]`);
    if (first && typeof first.focus === 'function') first.focus();
  }
  return names.length > 0;
}

/** Efface l'erreur d'un champ dès que l'utilisateur le modifie. */
function bindFormErrorClearing(form) {
  const handler = (event) => clearFieldError(form, event.target.name);
  form.addEventListener('input', handler);
  form.addEventListener('change', handler);
}

/** Valide un montant saisi ; retourne { value } ou { error }. */
function validateAmountInput(rawValue, { allowZero = false, allowNegative = false, label = 'Le montant' } = {}) {
  const value = parseAmount(rawValue);
  if (String(rawValue ?? '').trim() === '') return { error: `${label} est obligatoire.` };
  if (!Number.isFinite(value)) return { error: `${label} doit être un nombre valide.` };
  if (!allowNegative && value < 0) return { error: `${label} ne peut pas être négatif.` };
  if (!allowZero && !allowNegative && value <= 0) return { error: `${label} doit être supérieur à 0.` };
  if (Math.abs(value) >= 1e12) return { error: `${label} est trop élevé.` };
  return { value: roundMoney(value) };
}

/* --------------------------------------------------------------------------
   Options de listes déroulantes
   -------------------------------------------------------------------------- */

function accountOptions({ placeholder = 'Choisir un compte', includeEmpty = true, emptyLabel = null } = {}) {
  const options = includeEmpty ? [{ value: '', label: emptyLabel || placeholder }] : [];
  return options.concat(appData.accounts.map((account) => ({ value: account.id, label: account.name })));
}

function categoryOptions(type, { placeholder = 'Choisir une catégorie', includeEmpty = true } = {}) {
  const options = includeEmpty ? [{ value: '', label: placeholder }] : [];
  return options.concat(getCategoriesByType(type).map((category) => ({ value: category.id, label: category.name })));
}

function mapToOptions(map) {
  return Object.entries(map).map(([value, label]) => ({ value, label: typeof label === 'string' ? label : label.label }));
}

/* --------------------------------------------------------------------------
   Petits composants HTML
   -------------------------------------------------------------------------- */

function icon(name, extraClass = '') {
  return html`<i class="fa-solid ${sanitizeIcon(name)} ${extraClass}" aria-hidden="true"></i>`;
}

function badge(text, variant = 'neutral', iconName = '') {
  return html`<span class="badge badge-${variant}">${iconName ? icon(iconName) : ''}${text}</span>`;
}

/** Pastille de catégorie (icône colorée + nom). */
function categoryChip(categoryId, type = null) {
  if (type === 'transfer') {
    return html`<span class="cat-chip"><span class="cat-icon" style="--cat-color:${NEUTRAL_COLOR}">${icon('fa-right-left')}</span><span>Transfert</span></span>`;
  }
  const category = getCategory(categoryId);
  if (!category) {
    return html`<span class="cat-chip is-muted"><span class="cat-icon" style="--cat-color:${NEUTRAL_COLOR}">${icon('fa-circle-question')}</span><span>Non catégorisé</span></span>`;
  }
  return html`<span class="cat-chip"><span class="cat-icon" style="--cat-color:${sanitizeColor(category.color)}">${icon(category.icon)}</span><span>${category.name}</span></span>`;
}

/** Montant signé et coloré selon le type (+ revenu, − dépense). */
function amountHtml(amount, type, currency = null) {
  const formatted = formatCurrency(Math.abs(amount), currency);
  if (type === 'income') return html`<span class="amount amount-positive">+${formatted}</span>`;
  if (type === 'expense') return html`<span class="amount amount-negative">−${formatted}</span>`;
  return html`<span class="amount amount-neutral">${formatted}</span>`;
}

/** Montant signé générique (positif en vert, négatif en rouge). */
function signedAmountHtml(amount, currency = null) {
  if (amount > 0) return html`<span class="amount amount-positive">${formatCurrency(amount, currency, { signDisplay: 'exceptZero' })}</span>`;
  if (amount < 0) return html`<span class="amount amount-negative">−${formatCurrency(-amount, currency)}</span>`;
  return html`<span class="amount amount-neutral">${formatCurrency(0, currency)}</span>`;
}

/**
 * Indicateur de variation (+12,5 % / −4,2 %) coloré selon le sens souhaitable.
 * @param {number|null} change variation en %
 * @param {boolean} positiveIsGood une hausse est-elle une bonne nouvelle ?
 */
function deltaHtml(change, { positiveIsGood = true, label = '', unit = 'percent' } = {}) {
  if (change === null || change === undefined || !Number.isFinite(change)) {
    return html`<span class="delta delta-neutral" title="Aucune donnée sur la période de comparaison">— ${label ? html`<span class="delta-label">${label}</span>` : ''}</span>`;
  }
  const rounded = Math.round(change * 10) / 10;
  const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  let good = 'neutral';
  if (direction !== 'flat' && positiveIsGood !== null) good = (direction === 'up') === positiveIsGood ? 'good' : 'bad';
  const arrow = direction === 'up' ? 'fa-arrow-up' : direction === 'down' ? 'fa-arrow-down' : 'fa-minus';
  const text = unit === 'points'
    ? `${rounded > 0 ? '+' : ''}${formatNumber(rounded, Math.abs(rounded) < 10 ? 1 : 0)} pt${Math.abs(rounded) >= 2 ? 's' : ''}`
    : formatPercent(rounded, { signed: true });
  return html`<span class="delta delta-${good}">${icon(arrow)}<span>${text}</span>${label ? html`<span class="delta-label">${label}</span>` : ''}</span>`;
}

/**
 * Carte indicateur (KPI).
 * @param {object} options { label, value, iconName, tone, footer, title }
 */
function kpiCard({ label, value, iconName = 'fa-circle', tone = 'primary', footer = '', valueClass = '', className = '' }) {
  return html`<article class="kpi ${className}">
    <div class="kpi-head">
      <span class="kpi-label">${label}</span>
      <span class="kpi-icon kpi-icon-${tone}" aria-hidden="true">${icon(iconName)}</span>
    </div>
    <p class="kpi-value ${valueClass}">${value}</p>
    ${footer ? html`<div class="kpi-foot">${footer}</div>` : ''}
  </article>`;
}

/** Barre de progression accessible, colorée selon le statut. */
function progressBar(percent, status = 'normal', label = 'Progression') {
  const safePercent = Number.isFinite(percent) ? percent : 0;
  const width = clamp(safePercent, 0, 100);
  return html`<div class="progress progress-${status}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(width)}" aria-valuetext="${formatPercent(safePercent, { decimals: 0 })}">
    <div class="progress-fill" style="width:${width.toFixed(1)}%"></div>
  </div>`;
}

/** État vide avec bouton d'action. */
function emptyState({ iconName = 'fa-inbox', title, text = '', actionLabel = '', action = '', actionAttrs = {}, actionIcon = 'fa-plus', compact = false }) {
  return html`<div class="empty-state ${compact ? 'empty-state-compact' : ''}">
    <div class="empty-icon" aria-hidden="true">${icon(iconName)}</div>
    <p class="empty-title">${title}</p>
    ${text ? html`<p class="empty-text">${text}</p>` : ''}
    ${actionLabel ? html`<button type="button" class="btn btn-primary" data-action="${action}" ${attrsToHtml(actionAttrs)}>${icon(actionIcon)}<span>${actionLabel}</span></button>` : ''}
  </div>`;
}

/** Badge du type de transaction (revenu, dépense, transfert). */
function typeBadge(type) {
  const meta = TRANSACTION_TYPES[type] || TRANSACTION_TYPES.expense;
  return html`<span class="badge badge-${type}">${icon(meta.icon)}${meta.label}</span>`;
}

/** Badge de statut de budget (icône + libellé, jamais la couleur seule). */
function budgetStatusBadge(status) {
  const variants = { normal: 'success', warning: 'warning', danger: 'serious', exceeded: 'danger' };
  const meta = BUDGET_STATUSES[status] || BUDGET_STATUSES.normal;
  return badge(meta.label, variants[status] || 'neutral', meta.icon);
}

/** En-tête de page standard. */
function pageHeader({ title, subtitle = '', actions = '' }) {
  return html`<header class="page-header">
    <div class="page-heading">
      <h1 class="page-title" tabindex="-1">${title}</h1>
      ${subtitle ? html`<p class="page-subtitle">${subtitle}</p>` : ''}
    </div>
    ${actions ? html`<div class="page-actions">${actions}</div>` : ''}
  </header>`;
}

/** Onglets accessibles (role="tablist"). */
function tabsHtml(group, tabs, active, ariaLabel) {
  return html`<div class="tabs" role="tablist" aria-label="${ariaLabel}">
    ${tabs.map((tab) => html`<button type="button" role="tab" class="tab ${tab.value === active ? 'is-active' : ''}"
        id="tab-${group}-${tab.value}" aria-selected="${tab.value === active ? 'true' : 'false'}" aria-controls="panel-${group}"
        tabindex="${tab.value === active ? '0' : '-1'}" data-action="switch-tab" data-group="${group}" data-tab="${tab.value}">
        ${tab.icon ? icon(tab.icon) : ''}<span>${tab.label}</span>${tab.count !== undefined ? html`<span class="tab-count">${tab.count}</span>` : ''}
      </button>`)}
  </div>`;
}

/** Groupe de boutons à bascule (aria-pressed). */
function segmentedButtons(action, options, active, ariaLabel, extraAttrs = {}) {
  return html`<div class="segmented-buttons" role="group" aria-label="${ariaLabel}">
    ${options.map((option) => html`<button type="button" class="seg-btn ${option.value === active ? 'is-active' : ''}" aria-pressed="${option.value === active ? 'true' : 'false'}" data-action="${action}" data-value="${option.value}" ${attrsToHtml(extraAttrs)}>${option.label}</button>`)}
  </div>`;
}

/**
 * Sélecteur de période (préréglages + plage personnalisée).
 * @param {string} key identifiant du propriétaire (registerPeriodOwner)
 */
function periodPickerHtml(key, period, { allowAll = false, label = 'Période' } = {}) {
  const presets = PERIOD_PRESETS.filter((preset) => allowAll || preset.value !== 'all');
  return html`<div class="period-picker">
    <label class="field-label-inline" for="period-${key}-preset">${icon('fa-calendar')}<span class="sr-only">${label}</span></label>
    <select id="period-${key}-preset" class="input input-sm" data-change-action="period-preset" data-period="${key}" aria-label="${label}">
      ${presets.map((preset) => html`<option value="${preset.value}" ${preset.value === period.preset ? raw('selected') : ''}>${preset.label}</option>`)}
    </select>
    ${period.preset === 'custom' ? html`<div class="period-custom">
      <label class="sr-only" for="period-${key}-start">Date de début</label>
      <input type="date" id="period-${key}-start" class="input input-sm" value="${period.start}" data-change-action="period-custom" data-period="${key}" data-bound="start">
      <span aria-hidden="true" class="text-muted">→</span>
      <label class="sr-only" for="period-${key}-end">Date de fin</label>
      <input type="date" id="period-${key}-end" class="input input-sm" value="${period.end}" data-change-action="period-custom" data-period="${key}" data-bound="end">
    </div>` : ''}
  </div>`;
}

/** Tableau de données accessible associé à un graphique. */
function chartDataTable(caption, headers, rows) {
  if (!rows.length) return '';
  return html`<details class="chart-table">
    <summary>Afficher les données sous forme de tableau</summary>
    <div class="table-wrap">
      <table class="table table-compact">
        <caption class="sr-only">${caption}</caption>
        <thead><tr>${headers.map((header, index) => html`<th scope="col" class="${index ? 'text-right' : ''}">${header}</th>`)}</tr></thead>
        <tbody>${rows.map((row) => html`<tr>${row.map((cell, index) => (index === 0 ? html`<th scope="row">${cell}</th>` : html`<td class="text-right">${cell}</td>`))}</tr>`)}</tbody>
      </table>
    </div>
  </details>`;
}

/** Liste de catégories avec barres (légende des graphiques de répartition). */
function categoryBreakdownList(items, { maxColored = 5, emptyText = 'Aucune donnée.' } = {}) {
  if (!items.length) return html`<p class="text-muted small">${emptyText}</p>`;
  const max = items[0].amount || 1;
  // Au-delà de `maxColored`, les catégories sont regroupées dans la part « Autres » du graphique.
  return html`<ul class="breakdown-list">
    ${items.map((item, index) => {
      const color = index < maxColored ? item.color : 'var(--series-other)';
      return html`<li class="breakdown-item">
        <span class="legend-dot" style="--dot-color:${color}" aria-hidden="true"></span>
        <span class="breakdown-name">${item.name}</span>
        <span class="breakdown-amount">${formatCurrency(item.amount)}</span>
        <span class="breakdown-percent">${formatPercent(item.percent)}</span>
        <span class="breakdown-bar" aria-hidden="true"><span style="width:${((item.amount / max) * 100).toFixed(1)}%;--bar-color:${color}"></span></span>
      </li>`;
    })}
  </ul>`;
}
