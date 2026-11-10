/* ==========================================================================
   script.js — Point d'entrée de l'application
   --------------------------------------------------------------------------
   Initialisation, navigation entre les vues (sans rechargement), thème,
   délégation des événements, raccourcis clavier et premier lancement.
   Les autres modules se trouvent dans le dossier js/.
   ========================================================================== */
'use strict';

/** Vues de l'application et leur fonction de rendu. */
const VIEWS = {
  dashboard: renderDashboard,
  income: renderIncome,
  expenses: renderExpenses,
  transactions: renderTransactions,
  budgets: renderBudgets,
  goals: renderGoals,
  accounts: renderAccounts,
  categories: renderCategories,
  reports: renderReports,
  forecast: renderForecast,
  bills: renderBills,
  settings: renderSettings,
};

/* --------------------------------------------------------------------------
   Rendu et rafraîchissement
   -------------------------------------------------------------------------- */

/**
 * Rend la vue courante. Le focus (champ actif et position du curseur) est
 * restauré après le rendu pour ne pas gêner la saisie.
 */
function renderCurrentView() {
  const view = viewState.currentView;
  const section = document.getElementById(`view-${view}`);
  if (!section) return;
  const active = document.activeElement;
  const activeId = active && section.contains(active) ? active.id : '';
  const selection = activeId && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;

  destroyAllCharts();
  try {
    VIEWS[view](section);
  } catch (error) {
    console.error(error);
    setHTML(section, html`<div class="card">${emptyState({
      iconName: 'fa-triangle-exclamation',
      title: "Une erreur est survenue lors de l'affichage de cette page.",
      text: 'Vos données ne sont pas perdues. Essayez de recharger la page ou exportez une sauvegarde.',
    })}</div>`);
    showToast("Erreur d'affichage : consultez la console pour plus de détails.", 'error');
  }

  if (activeId) {
    const element = document.getElementById(activeId);
    if (element && !modalStack.length) {
      element.focus();
      if (selection && typeof element.setSelectionRange === 'function') {
        try {
          element.setSelectionRange(selection[0], selection[1]);
        } catch (error) {
          /* Certains types de champs ne gèrent pas la sélection. */
        }
      }
    }
  }
}

/** Met à jour toute l'interface après une modification des données. */
function refreshUI() {
  renderCurrentView();
  updateAlertsBadge();
  updateNavBadges();
  updateUserChip();
}

/** Sauvegarde, rafraîchit l'interface et affiche une notification. */
function persist(message = '', type = 'success') {
  saveData();
  refreshUI();
  if (message) showToast(message, type);
}

/** Réinitialise les filtres d'interface (après import / réinitialisation). */
function resetViewFilters() {
  viewState.transactions.filters = createDefaultTransactionFilters();
  viewState.transactions.page = 1;
  viewState.reports.categoryId = '';
  viewState.reports.accountId = '';
  viewState.budgets.month = null;
  viewState.forecast.calendarMonth = null;
  viewState.forecast.selectedDate = null;
}

/** Pastilles numériques de la barre latérale (échéances à traiter). */
function updateNavBadges() {
  const badgeElement = document.getElementById('nav-badge-bills');
  if (!badgeElement) return;
  const limit = addDays(todayStr(), getSetting('billReminderDays'));
  const count = appData.bills.filter((bill) => bill.status !== 'paid' && bill.dueDate <= limit).length;
  badgeElement.textContent = String(count);
  badgeElement.hidden = count === 0;
  badgeElement.setAttribute('aria-label', `${pluralize(count, 'échéance', 'échéances')} à traiter`);
}

function updateUserChip() {
  const name = getSetting('userName');
  const nameElement = document.getElementById('user-name');
  const avatar = document.getElementById('user-avatar');
  if (nameElement) nameElement.textContent = name || 'Mon profil';
  if (avatar) avatar.textContent = (name || 'U').trim().charAt(0).toUpperCase() || 'U';
}

/* --------------------------------------------------------------------------
   Navigation (hash) — aucune page n'est rechargée
   -------------------------------------------------------------------------- */

function getViewFromHash() {
  const view = window.location.hash.replace('#', '');
  return VIEWS[view] ? view : 'dashboard';
}

function navigate(view) {
  const target = VIEWS[view] ? view : 'dashboard';
  if (window.location.hash.replace('#', '') !== target) {
    window.location.hash = target; // déclenche « hashchange » → showView()
  } else {
    showView(target);
  }
}

function showView(view, { initial = false } = {}) {
  viewState.currentView = view;
  document.querySelectorAll('.view').forEach((section) => {
    const isActive = section.dataset.viewSection === view;
    section.hidden = !isActive;
    if (!isActive) section.innerHTML = '';
  });
  document.querySelectorAll('.nav-link').forEach((link) => {
    const isActive = link.dataset.view === view;
    link.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = `${VIEW_META[view].title} · ${APP_NAME}`;
  toggleSidebar(false);
  toggleAlertsPanel(false);
  renderCurrentView();
  if (!initial) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    const title = document.querySelector(`#view-${view} .page-title`);
    if (title && !modalStack.length) title.focus({ preventScroll: true });
  }
}

/* --------------------------------------------------------------------------
   Thème clair / sombre
   -------------------------------------------------------------------------- */

function applyTheme(theme) {
  const value = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', value);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.setAttribute('aria-label', value === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre');
    toggle.setAttribute('title', value === 'dark' ? 'Mode clair' : 'Mode sombre');
    setHTML(toggle, icon(value === 'dark' ? 'fa-sun' : 'fa-moon'));
  }
}

/** Change le thème, l'enregistre et redessine les graphiques. */
function setTheme(theme) {
  appData.settings.theme = theme === 'dark' ? 'dark' : 'light';
  applyTheme(appData.settings.theme);
  saveData();
  renderCurrentView();
  showToast(appData.settings.theme === 'dark' ? 'Mode sombre activé.' : 'Mode clair activé.', 'info');
}

/* --------------------------------------------------------------------------
   Barre latérale (menu mobile)
   -------------------------------------------------------------------------- */

function toggleSidebar(forceOpen = null) {
  const open = forceOpen === null ? !document.body.classList.contains('sidebar-open') : forceOpen;
  document.body.classList.toggle('sidebar-open', open);
  const toggle = document.getElementById('menu-toggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  }
  if (open) {
    const active = document.querySelector('.nav-link.is-active') || document.querySelector('.nav-link');
    if (active) active.focus();
  }
}

/* --------------------------------------------------------------------------
   Premier lancement : bienvenue et données de démonstration
   -------------------------------------------------------------------------- */

function showWelcomeModal() {
  const formId = 'welcome-form';
  const settings = getSettings();
  const body = html`
    <div class="welcome-hero">
      <span class="welcome-logo" aria-hidden="true">${icon('fa-wallet')}</span>
      <p>Bienvenue dans votre application de gestion financière. Tout fonctionne localement : vos données restent dans ce navigateur.</p>
    </div>
    <div class="form-grid">
      ${formField({ formId, name: 'userName', label: 'Votre prénom (facultatif)', value: settings.userName, attrs: { maxlength: 60, autocomplete: 'given-name' } })}
      ${formField({ formId, name: 'currency', label: 'Devise principale', type: 'select', value: settings.currency, options: Object.values(CURRENCIES).map((currency) => ({ value: currency.code, label: `${currency.code} — ${currency.name}` })) })}
    </div>
    <div class="info-box info-box-neutral">
      ${icon('fa-flask')}
      <div>
        <p><strong>Souhaitez-vous charger des données de démonstration ?</strong></p>
        <p class="small text-muted">Six mois d'historique fictif pour découvrir toutes les fonctionnalités. Vous pourrez les supprimer à tout moment (Réinitialiser les données) ; elles ne seront plus jamais proposées automatiquement.</p>
      </div>
    </div>`;
  const footer = html`
    <button type="button" class="btn btn-ghost" data-welcome="no">Non, commencer avec une application vide</button>
    <button type="button" class="btn btn-primary" data-welcome="yes">${icon('fa-flask')}<span>Oui, charger la démo</span></button>`;

  const modal = showModal({
    title: 'Bienvenue 👋',
    content: modalForm(formId, body, footer),
    dismissible: false,
    initialFocus: `#${formId}-userName`,
  });
  const form = modal.element.querySelector('form');
  form.addEventListener('submit', (event) => event.preventDefault());
  modal.element.querySelectorAll('[data-welcome]').forEach((button) => {
    button.addEventListener('click', () => {
      const values = getFormValues(form);
      const currency = CURRENCIES[values.currency] ? values.currency : 'EUR';
      const userName = cleanString(values.userName, 60);
      const withDemo = button.dataset.welcome === 'yes';
      if (withDemo) {
        loadDemoData({ currency, userName, theme: appData.settings.theme });
      } else {
        appData.settings = normalizeSettings({ ...appData.settings, currency, userName });
        appData.meta.demoPromptAnswered = true;
        saveData();
      }
      closeModal(modal, { silent: true });
      refreshUI();
      showToast(withDemo ? 'Données de démonstration chargées. Bonne découverte !' : 'Bienvenue ! Commencez par créer votre premier compte.');
    });
  });
}

/* --------------------------------------------------------------------------
   Délégation des événements
   -------------------------------------------------------------------------- */

function bindGlobalEvents() {
  // Clics : boutons et éléments portant data-action.
  document.addEventListener('click', (event) => {
    const element = event.target.closest('[data-action]');
    if (!element || element.disabled) return;
    if (element.tagName === 'A') event.preventDefault();
    runAction(element.dataset.action, element, event);
  });

  // Saisie instantanée (recherche, montants) et changements (listes, cases).
  document.addEventListener('input', (event) => {
    const element = event.target.closest('[data-input-action]');
    if (element) runAction(element.dataset.inputAction, element, event);
  });
  document.addEventListener('change', (event) => {
    const element = event.target.closest('[data-change-action]');
    if (element) runAction(element.dataset.changeAction, element, event);
  });

  document.addEventListener('keydown', handleGlobalKeydown);

  // Navigation par l'historique du navigateur.
  window.addEventListener('hashchange', () => showView(getViewFromHash()));

  // Fermeture du panneau d'alertes au clic extérieur.
  document.addEventListener('click', (event) => {
    const panel = document.getElementById('alerts-panel');
    if (panel && !panel.hidden && !event.target.closest('.notifications')) toggleAlertsPanel(false);
  });

  // Synchronisation entre plusieurs onglets ouverts.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    const { data, error } = loadData();
    if (error) return;
    appData = data;
    applyTheme(appData.settings.theme);
    refreshUI();
    showToast('Données mises à jour depuis un autre onglet.', 'info');
  });
}

/** Raccourcis clavier globaux. */
function handleGlobalKeydown(event) {
  if (handleModalKeydown(event)) return;

  const target = event.target;
  const typing = target.closest('input, textarea, select, [contenteditable="true"]');

  // Onglets : flèches gauche / droite.
  if (target.getAttribute && target.getAttribute('role') === 'tab' && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
    const tabs = [...target.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(target);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.focus();
    next.click();
    event.preventDefault();
    return;
  }

  if (event.key === 'Escape') {
    toggleAlertsPanel(false);
    if (document.body.classList.contains('sidebar-open')) toggleSidebar(false);
    return;
  }

  // « / » ou Ctrl + K : recherche globale.
  if ((event.key === '/' && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
    event.preventDefault();
    const input = document.getElementById('global-search-input');
    if (input) input.focus();
  }
}

registerActions({
  navigate: (element) => navigate(element.dataset.view),
  'toggle-sidebar': () => toggleSidebar(),
  'close-sidebar': () => toggleSidebar(false),
  'toggle-theme': () => setTheme(appData.settings.theme === 'dark' ? 'light' : 'dark'),
  'switch-tab': (element) => {
    const onSelect = tabGroups[element.dataset.group];
    if (onSelect) onSelect(element.dataset.tab);
    const tab = document.getElementById(`tab-${element.dataset.group}-${element.dataset.tab}`);
    if (tab) tab.focus();
  },
  'period-preset': (element) => {
    const owner = periodOwners[element.dataset.period];
    if (!owner) return;
    const period = owner.getState();
    period.preset = element.value;
    if (period.preset === 'custom' && !customRange(period.start, period.end)) {
      period.start = startOfMonth(todayStr());
      period.end = todayStr();
    }
    owner.onChange();
  },
  'period-custom': (element) => {
    const owner = periodOwners[element.dataset.period];
    if (!owner) return;
    const period = owner.getState();
    const next = { ...period, [element.dataset.bound]: element.value };
    if (!customRange(next.start, next.end)) {
      showToast('Période invalide : la date de début doit précéder la date de fin.', 'warning');
      element.value = period[element.dataset.bound];
      return;
    }
    Object.assign(period, next);
    owner.onChange();
  },
});

/* --------------------------------------------------------------------------
   Initialisation
   -------------------------------------------------------------------------- */

function init() {
  const { data, firstLaunch, error } = loadData();
  appData = data;
  applyTheme(appData.settings.theme);
  bindGlobalEvents();
  bindGlobalSearch();
  bindImportInput();

  // Génération des occurrences récurrentes arrivées à échéance (sans doublon).
  let generated = 0;
  if (!firstLaunch) generated = generateRecurringTransactions();

  showView(getViewFromHash(), { initial: true });
  updateAlertsBadge();
  updateNavBadges();
  updateUserChip();

  // Chart.js est chargé en asynchrone : les graphiques sont redessinés dès qu'il est prêt.
  const chartScript = document.getElementById('chartjs-script');
  if (chartScript && !isChartLibraryAvailable()) {
    chartScript.addEventListener('load', () => renderCurrentView());
  }

  if (error) showToast(error, 'error', { duration: 8000 });
  if (generated) showToast(`${pluralize(generated, 'transaction récurrente générée', 'transactions récurrentes générées')} automatiquement.`, 'info');
  if (firstLaunch) showWelcomeModal();
}

document.addEventListener('DOMContentLoaded', init);
