/* ==========================================================================
   views/settings.js — Paramètres et gestion des données
   ========================================================================== */
'use strict';

function renderSettings(section) {
  const settings = getSettings();
  const formId = 'settings-form';
  const size = getStorageSize();
  const counts = [
    pluralize(appData.transactions.length, 'transaction', 'transactions'),
    pluralize(appData.accounts.length, 'compte', 'comptes'),
    pluralize(appData.categories.length, 'catégorie', 'catégories'),
    pluralize(appData.budgets.length, 'budget', 'budgets'),
    pluralize(appData.goals.length, 'objectif', 'objectifs'),
    pluralize(appData.bills.length, 'échéance', 'échéances'),
    pluralize(appData.recurringTransactions.length, 'récurrence', 'récurrences'),
  ];

  setHTML(section, html`
    ${pageHeader({ title: 'Paramètres', subtitle: 'Personnalisez l’application. Les réglages sont enregistrés dans ce navigateur.' })}
    <div class="settings-layout">
      <form id="${formId}" class="card settings-card" novalidate>
        <section class="settings-section">
          <h2 class="section-title">${icon('fa-user')} Profil</h2>
          ${formField({ formId, name: 'userName', label: 'Nom utilisateur', value: settings.userName, placeholder: 'Votre prénom', attrs: { maxlength: 60, autocomplete: 'given-name' } })}
        </section>

        <section class="settings-section">
          <h2 class="section-title">${icon('fa-coins')} Devise et format</h2>
          <div class="form-grid">
            ${formField({
              formId, name: 'currency', label: 'Devise principale', type: 'select', value: settings.currency,
              options: Object.values(CURRENCIES).map((currency) => ({ value: currency.code, label: `${currency.code} — ${currency.name}` })),
              hint: 'Changer de devise modifie l’affichage : les montants ne sont pas convertis.',
            })}
            ${formField({
              formId, name: 'numberFormat', label: 'Format des nombres', type: 'select', value: settings.numberFormat,
              options: NUMBER_FORMATS.map((format) => ({ value: format.value, label: `${format.label} — ${formatNumberExample(format.value)}` })),
            })}
            ${formField({
              formId, name: 'firstDayOfWeek', label: 'Premier jour de la semaine', type: 'select', value: String(settings.firstDayOfWeek),
              options: [{ value: '1', label: 'Lundi' }, { value: '0', label: 'Dimanche' }],
            })}
            <div class="field">
              <span class="field-label">Décimales</span>
              <label class="switch">
                <input type="checkbox" name="showDecimals" ${settings.showDecimals ? raw('checked') : ''}>
                <span class="switch-track" aria-hidden="true"></span>
                <span>Afficher les centimes</span>
              </label>
            </div>
          </div>
          <p class="preview-line" aria-live="polite">Aperçu : <strong data-format-preview></strong></p>
        </section>

        <section class="settings-section">
          <h2 class="section-title">${icon('fa-bell')} Alertes</h2>
          <div class="form-grid">
            ${formField({ formId, name: 'budgetWarningThreshold', label: 'Seuil « attention » des budgets (%)', type: 'number', value: settings.budgetWarningThreshold, attrs: { min: 1, max: 99, step: 1, inputmode: 'numeric' } })}
            ${formField({ formId, name: 'budgetDangerThreshold', label: 'Seuil « danger » des budgets (%)', type: 'number', value: settings.budgetDangerThreshold, attrs: { min: 2, max: 99, step: 1, inputmode: 'numeric' }, hint: 'Un budget est « dépassé » à partir de 100 %.' })}
            ${formField({ formId, name: 'lowBalanceThreshold', label: 'Seuil de solde faible', type: 'amount', value: amountInputValue(settings.lowBalanceThreshold), hint: 'Alerte quand un compte passe sous ce montant.' })}
            ${formField({ formId, name: 'billReminderDays', label: 'Rappel des échéances (jours avant)', type: 'number', value: settings.billReminderDays, attrs: { min: 0, max: 60, step: 1, inputmode: 'numeric' } })}
          </div>
        </section>

        <div class="settings-actions">
          <button type="submit" class="btn btn-primary">${icon('fa-floppy-disk')}<span>Enregistrer les paramètres</span></button>
        </div>
      </form>

      <div class="settings-side">
        <section class="card settings-card">
          <h2 class="section-title">${icon('fa-circle-half-stroke')} Thème</h2>
          <p class="small text-muted mb-2">Appliqué immédiatement et mémorisé.</p>
          ${segmentedButtons('set-theme', [{ value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }], settings.theme, 'Thème de l’application')}
        </section>

        <section class="card settings-card">
          <h2 class="section-title">${icon('fa-database')} Données</h2>
          <p class="small text-muted">${counts.join(' · ')}.</p>
          <p class="small text-muted mb-2">Stockage local : ${formatNumber(size / 1024, 1)} Ko · dernière sauvegarde : ${formatDateTime(appData.meta.updatedAt)}.</p>
          <div class="data-actions">
            <button type="button" class="btn btn-secondary" data-action="export-json">${icon('fa-file-code')}<span>Exporter en JSON</span></button>
            <button type="button" class="btn btn-secondary" data-action="export-csv">${icon('fa-file-csv')}<span>Exporter les transactions (CSV)</span></button>
            <button type="button" class="btn btn-secondary" data-action="import-data">${icon('fa-file-import')}<span>Importer un fichier JSON</span></button>
            <button type="button" class="btn btn-secondary" data-action="load-demo">${icon('fa-flask')}<span>Charger les données de démonstration</span></button>
            <button type="button" class="btn btn-danger-ghost" data-action="reset-data">${icon('fa-trash-can')}<span>Réinitialiser les données</span></button>
          </div>
        </section>

        <section class="card settings-card">
          <h2 class="section-title">${icon('fa-circle-info')} À propos</h2>
          <p class="small text-muted">${APP_NAME} · format de données ${DATA_VERSION}. Application 100 % locale : vos données restent dans ce navigateur (localStorage). Pensez à exporter régulièrement une sauvegarde JSON.</p>
        </section>
      </div>
    </div>`);

  const form = section.querySelector(`#${formId}`);
  bindFormErrorClearing(form);
  const preview = form.querySelector('[data-format-preview]');
  const updatePreview = () => {
    const values = getFormValues(form);
    const decimals = values.showDecimals ? 2 : 0;
    const formatter = getNumberFormatter(values.numberFormat, { style: 'currency', currency: values.currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      || getNumberFormatter(values.numberFormat, { style: 'currency', currency: values.currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    preview.textContent = formatter ? widenNumberSpaces(`${formatter.format(1234567.89)} · ${formatter.format(-42.5)}`) : '—';
  };
  form.addEventListener('input', updatePreview);
  form.addEventListener('change', updatePreview);
  updatePreview();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = getFormValues(form);
    const errors = {};
    const userName = cleanString(values.userName, 60);
    if (!CURRENCIES[values.currency]) errors.currency = 'Choisissez une devise.';
    if (!NUMBER_FORMATS.some((format) => format.value === values.numberFormat)) errors.numberFormat = 'Choisissez un format.';
    if (!['0', '1'].includes(values.firstDayOfWeek)) errors.firstDayOfWeek = 'Choisissez un jour.';
    const warning = Number(values.budgetWarningThreshold);
    const danger = Number(values.budgetDangerThreshold);
    if (!Number.isInteger(warning) || warning < 1 || warning > 99) errors.budgetWarningThreshold = 'Saisissez un pourcentage entier entre 1 et 99.';
    if (!Number.isInteger(danger) || danger < 2 || danger > 99) errors.budgetDangerThreshold = 'Saisissez un pourcentage entier entre 2 et 99.';
    else if (!errors.budgetWarningThreshold && danger <= warning) errors.budgetDangerThreshold = 'Le seuil « danger » doit être supérieur au seuil « attention ».';
    const lowBalance = validateAmountInput(values.lowBalanceThreshold, { allowNegative: true, label: 'Le seuil' });
    if (lowBalance.error) errors.lowBalanceThreshold = lowBalance.error;
    const reminder = Number(values.billReminderDays);
    if (!Number.isInteger(reminder) || reminder < 0 || reminder > 60) errors.billReminderDays = 'Saisissez un nombre de jours entre 0 et 60.';
    if (showFormErrors(form, errors)) return;

    const previousCurrency = appData.settings.currency;
    appData.settings = normalizeSettings({
      ...appData.settings,
      userName,
      currency: values.currency,
      numberFormat: values.numberFormat,
      firstDayOfWeek: Number(values.firstDayOfWeek),
      showDecimals: Boolean(values.showDecimals),
      budgetWarningThreshold: warning,
      budgetDangerThreshold: danger,
      lowBalanceThreshold: lowBalance.value,
      billReminderDays: reminder,
    });
    persist(previousCurrency !== appData.settings.currency
      ? `Paramètres enregistrés : les montants s'affichent désormais en ${appData.settings.currency}.`
      : 'Paramètres enregistrés.');
  });
}

registerActions({
  'set-theme': (element) => {
    setTheme(element.dataset.value === 'dark' ? 'dark' : 'light');
  },
});
