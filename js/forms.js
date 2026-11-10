/* ==========================================================================
   forms.js — Formulaires et actions CRUD (modales)
   --------------------------------------------------------------------------
   Transactions, comptes, catégories, budgets, objectifs (et contributions),
   échéances et transactions récurrentes. Chaque formulaire valide ses
   données, affiche les erreurs sous les champs et n'enregistre jamais de
   données invalides.
   ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
   Aides communes
   -------------------------------------------------------------------------- */

/** Retrouve la référence d'une modale à partir d'un élément qu'elle contient. */
function findModalOf(element) {
  const backdrop = element.closest('.modal-backdrop');
  return modalStack.find((modal) => modal.backdrop === backdrop) || null;
}

/** Vérifie qu'au moins un compte existe, sinon propose d'en créer un. */
function requireAccounts() {
  if (appData.accounts.length) return true;
  showModal({
    title: 'Aucun compte',
    size: 'sm',
    content: html`<div class="modal-body">${emptyState({
      iconName: 'fa-building-columns',
      title: "Créez d'abord un compte",
      text: 'Chaque opération est rattachée à un compte (courant, épargne, espèces…).',
      actionLabel: 'Créer un compte',
      action: 'new-account',
      actionAttrs: { 'data-modal-close': true },
      compact: true,
    })}</div>`,
  });
  return false;
}

/** Sélecteur de type (Revenu / Dépense / Transfert) sous forme de boutons radio. */
function typeSegmentedHtml(formId, selected, { allowTransfer = true } = {}) {
  const types = Object.entries(TRANSACTION_TYPES).filter(([value]) => allowTransfer || value !== 'transfer');
  return html`<fieldset class="field">
    <legend class="field-label">Type<span class="required" aria-hidden="true"> *</span></legend>
    <div class="segmented">
      ${types.map(([value, type]) => html`<label class="segmented-option segmented-${value}">
        <input type="radio" name="type" value="${value}" ${value === selected ? raw('checked') : ''}>
        <span>${icon(type.icon)}${type.label}</span>
      </label>`)}
    </div>
    ${fieldError(formId, 'type')}
  </fieldset>`;
}

/** Liste déroulante de catégories avec bouton de création rapide. */
function categorySelectHtml(formId, type, selected) {
  const id = `${formId}-categoryId`;
  return html`<div class="field" data-show-for="income expense">
    <label class="field-label" for="${id}">Catégorie<span class="required" aria-hidden="true"> *</span></label>
    <div class="input-with-button">
      <select class="input" id="${id}" name="categoryId" aria-describedby="${id}-error" aria-required="true">
        ${categoryOptions(type === 'income' ? 'income' : 'expense').map((option) => html`<option value="${option.value}" ${option.value === selected ? raw('selected') : ''}>${option.label}</option>`)}
      </select>
      <button type="button" class="icon-btn icon-btn-bordered" data-inline-new-category title="Nouvelle catégorie" aria-label="Créer une nouvelle catégorie">${icon('fa-plus')}</button>
    </div>
    <p class="field-error" id="${id}-error" data-error-for="categoryId"></p>
  </div>`;
}

/** Affiche/masque les champs selon le type choisi et met à jour les catégories. */
function applyTypeToForm(form) {
  const checked = form.querySelector('input[name="type"]:checked');
  const type = checked ? checked.value : 'expense';
  form.querySelectorAll('[data-show-for]').forEach((element) => {
    const visible = element.dataset.showFor.split(' ').includes(type);
    element.hidden = !visible;
    element.querySelectorAll('input, select, textarea, button').forEach((control) => {
      control.disabled = !visible;
    });
  });
  const accountLabel = form.querySelector('[data-account-label]');
  if (accountLabel) accountLabel.textContent = type === 'transfer' ? 'Compte source' : 'Compte';
  const select = form.querySelector('select[name="categoryId"]');
  if (select && type !== 'transfer') {
    const wanted = type === 'income' ? 'income' : 'expense';
    if (select.dataset.categoryType !== wanted) {
      const current = select.value;
      setHTML(select, html`${categoryOptions(wanted).map((option) => html`<option value="${option.value}">${option.label}</option>`)}`);
      select.value = getCategory(current) && getCategory(current).type === wanted ? current : '';
      select.dataset.categoryType = wanted;
    }
  }
  return type;
}

/** Branche le changement de type et le bouton « nouvelle catégorie ». */
function bindTypeSwitching(form) {
  const select = form.querySelector('select[name="categoryId"]');
  if (select) {
    const checked = form.querySelector('input[name="type"]:checked');
    select.dataset.categoryType = checked && checked.value === 'income' ? 'income' : 'expense';
  }
  form.querySelectorAll('input[name="type"]').forEach((radio) => {
    radio.addEventListener('change', () => applyTypeToForm(form));
  });
  const newCategoryButton = form.querySelector('[data-inline-new-category]');
  if (newCategoryButton) {
    newCategoryButton.addEventListener('click', () => {
      const checked = form.querySelector('input[name="type"]:checked');
      const type = checked && checked.value === 'income' ? 'income' : 'expense';
      openCategoryForm({
        defaults: { type },
        onSaved: (category) => {
          const categorySelect = form.querySelector('select[name="categoryId"]');
          setHTML(categorySelect, html`${categoryOptions(type).map((option) => html`<option value="${option.value}">${option.label}</option>`)}`);
          categorySelect.dataset.categoryType = type;
          categorySelect.value = category.id;
          clearFieldError(form, 'categoryId');
        },
      });
    });
  }
  applyTypeToForm(form);
}

/** Sélecteur de couleur (pastilles + couleur personnalisée). */
function colorPickerHtml(formId, name, selected) {
  const value = sanitizeColor(selected, COLOR_CHOICES[0]);
  const isCustom = !COLOR_CHOICES.includes(value);
  return html`<fieldset class="field">
    <legend class="field-label">Couleur</legend>
    <div class="color-picker">
      ${COLOR_CHOICES.map((color, index) => html`<label class="color-swatch" style="--swatch:${color}" title="${COLOR_LABELS[index]}">
        <input type="radio" name="${name}" value="${color}" ${color === value ? raw('checked') : ''} aria-label="${COLOR_LABELS[index]}">
        <span aria-hidden="true"></span>
      </label>`)}
      <label class="color-custom" title="Couleur personnalisée">
        <input type="radio" name="${name}" value="custom" ${isCustom ? raw('checked') : ''} aria-label="Couleur personnalisée">
        <input type="color" name="${name}Custom" value="${isCustom ? value : '#2a78d6'}" aria-label="Choisir la couleur personnalisée">
      </label>
    </div>
    ${fieldError(formId, name)}
  </fieldset>`;
}

function readColor(values, name, fallback = COLOR_CHOICES[0]) {
  return values[name] === 'custom' ? sanitizeColor(values[`${name}Custom`], fallback) : sanitizeColor(values[name], fallback);
}

/** Sélectionne automatiquement « personnalisée » quand on choisit une couleur libre. */
function bindColorPicker(form, name) {
  const custom = form.querySelector(`input[name="${name}Custom"]`);
  if (!custom) return;
  custom.addEventListener('input', () => {
    const radio = form.querySelector(`input[name="${name}"][value="custom"]`);
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

/** Sélecteur d'icône (grille de boutons radio). */
function iconPickerHtml(formId, name, selected) {
  const value = sanitizeIcon(selected, ICON_CHOICES[0]);
  return html`<fieldset class="field">
    <legend class="field-label">Icône</legend>
    <div class="icon-picker">
      ${ICON_CHOICES.map((iconName) => html`<label class="icon-option" title="${iconName.replace('fa-', '').replace(/-/g, ' ')}">
        <input type="radio" name="${name}" value="${iconName}" ${iconName === value ? raw('checked') : ''} aria-label="Icône ${iconName.replace('fa-', '').replace(/-/g, ' ')}">
        <span aria-hidden="true">${icon(iconName)}</span>
      </label>`)}
    </div>
    ${fieldError(formId, name)}
  </fieldset>`;
}

/** Supprime des transactions et nettoie les liens (objectifs, échéances). */
function removeTransactions(ids) {
  if (!ids.size) return;
  appData.transactions = appData.transactions.filter((transaction) => !ids.has(transaction.id));
  appData.goals.forEach((goal) => goal.contributions.forEach((contribution) => {
    if (ids.has(contribution.transactionId)) contribution.transactionId = null;
  }));
  appData.bills.forEach((bill) => bill.history.forEach((payment) => {
    if (ids.has(payment.transactionId)) payment.transactionId = null;
  }));
}

/* ==========================================================================
   TRANSACTIONS
   ========================================================================== */

/**
 * Formulaire de transaction.
 * @param {{mode?: 'create'|'edit'|'duplicate', transaction?: object, defaults?: object}} options
 */
function openTransactionForm({ mode = 'create', transaction = null, defaults = {} } = {}) {
  if (!requireAccounts()) return;
  const isEdit = mode === 'edit' && transaction;
  const source = transaction || {};
  const formId = 'transaction-form';
  const type = source.type || defaults.type || 'expense';
  const linkedRule = isEdit && source.recurringId ? appData.recurringTransactions.find((rule) => rule.id === source.recurringId) : null;
  const values = {
    amount: source.amount !== undefined ? amountInputValue(source.amount) : '',
    date: mode === 'duplicate' ? todayStr() : source.date || defaults.date || todayStr(),
    description: source.description || defaults.description || '',
    categoryId: source.categoryId || defaults.categoryId || '',
    accountId: source.accountId || defaults.accountId || appData.accounts[0].id,
    toAccountId: source.toAccountId || defaults.toAccountId || '',
    paymentMethod: source.paymentMethod || 'card',
    status: source.status || 'completed',
    tags: (source.tags || []).join(', '),
    notes: source.notes || '',
  };
  const title = isEdit ? 'Modifier la transaction' : mode === 'duplicate' ? 'Dupliquer la transaction' : 'Nouvelle transaction';

  const recurrenceBlock = linkedRule
    ? html`<div class="info-box">
        ${icon('fa-repeat')}
        <div>
          <p>Occurrence de la récurrence « <strong>${linkedRule.description}</strong> » (${FREQUENCIES[linkedRule.frequency].toLowerCase()}).</p>
          <p class="small text-muted">Modifier cette transaction ne change pas les prochaines occurrences.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-action="edit-recurring" data-id="${linkedRule.id}" data-modal-close>Gérer la récurrence</button>
      </div>`
    : html`<div class="recurring-box">
        <label class="checkbox"><input type="checkbox" name="isRecurring" data-toggle-target="#${formId}-frequency-field"><span>Transaction récurrente</span></label>
        <div id="${formId}-frequency-field" class="mt-2" hidden>
          ${formField({ formId, name: 'frequency', label: 'Fréquence', type: 'select', value: 'monthly', options: mapToOptions(FREQUENCIES), hint: 'Les prochaines occurrences seront créées automatiquement à leur date.' })}
        </div>
      </div>`;

  const body = html`
    ${typeSegmentedHtml(formId, type)}
    <div class="form-grid">
      ${formField({ formId, name: 'amount', label: 'Montant', type: 'amount', value: values.amount, required: true, attrs: { autofocus: true } })}
      ${formField({ formId, name: 'date', label: 'Date', type: 'date', value: values.date, required: true })}
    </div>
    ${formField({ formId, name: 'description', label: 'Description', value: values.description, required: true, placeholder: 'Ex. : Courses au marché', attrs: { maxlength: 120 } })}
    <div class="form-grid">
      ${categorySelectHtml(formId, type, values.categoryId)}
      <div class="field">
        <label class="field-label" for="${formId}-accountId"><span data-account-label>Compte</span><span class="required" aria-hidden="true"> *</span></label>
        <select class="input" id="${formId}-accountId" name="accountId" aria-describedby="${formId}-accountId-error" aria-required="true">
          ${accountOptions().map((option) => html`<option value="${option.value}" ${option.value === values.accountId ? raw('selected') : ''}>${option.label}</option>`)}
        </select>
        <p class="field-error" id="${formId}-accountId-error" data-error-for="accountId"></p>
      </div>
      <div data-show-for="transfer">
        ${formField({ formId, name: 'toAccountId', label: 'Compte destination', type: 'select', value: values.toAccountId, required: true, options: accountOptions({ placeholder: 'Choisir le compte de destination' }) })}
      </div>
      ${formField({ formId, name: 'paymentMethod', label: 'Mode de paiement', type: 'select', value: values.paymentMethod, options: mapToOptions(PAYMENT_METHODS) })}
      ${formField({ formId, name: 'status', label: 'Statut', type: 'select', value: values.status, options: [{ value: 'completed', label: 'Effectuée' }, { value: 'pending', label: 'En attente (non comptabilisée)' }] })}
    </div>
    ${formField({ formId, name: 'tags', label: 'Tags', value: values.tags, placeholder: 'Ex. : vacances, famille', hint: 'Séparez les tags par des virgules.' })}
    ${formField({ formId, name: 'notes', label: 'Notes', type: 'textarea', value: values.notes, rows: 2, attrs: { maxlength: 1000 } })}
    ${recurrenceBlock}`;

  const modal = showModal({
    title,
    size: 'lg',
    content: modalForm(formId, body, modalFooterButtons(isEdit ? 'Enregistrer les modifications' : 'Ajouter la transaction')),
    initialFocus: `#${formId}-amount`,
  });
  const form = modal.element.querySelector('form');
  bindFormErrorClearing(form);
  bindTypeSwitching(form);
  bindToggleTargets(form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formValues = getFormValues(form);
    const errors = {};
    if (!TRANSACTION_TYPES[formValues.type]) errors.type = 'Choisissez un type de transaction.';
    const amount = validateAmountInput(formValues.amount);
    if (amount.error) errors.amount = amount.error;
    if (!isValidDateStr(formValues.date)) errors.date = 'Saisissez une date valide.';
    const description = cleanString(formValues.description, 120);
    if (!description) errors.description = 'La description est obligatoire.';
    if (formValues.type !== 'transfer') {
      const category = getCategory(formValues.categoryId);
      if (!category) errors.categoryId = 'Choisissez une catégorie.';
      else if (category.type !== formValues.type) errors.categoryId = 'Cette catégorie ne correspond pas au type choisi.';
    }
    if (!getAccount(formValues.accountId)) errors.accountId = 'Choisissez un compte valide.';
    if (formValues.type === 'transfer') {
      if (!getAccount(formValues.toAccountId)) errors.toAccountId = 'Choisissez le compte de destination.';
      else if (formValues.toAccountId === formValues.accountId) errors.toAccountId = 'Le compte de destination doit être différent du compte source.';
    }
    if (formValues.isRecurring && !FREQUENCIES[formValues.frequency]) errors.frequency = 'Choisissez une fréquence.';
    if (showFormErrors(form, errors)) return;

    const now = new Date().toISOString();
    const fields = {
      type: formValues.type,
      amount: amount.value,
      date: formValues.date,
      description,
      categoryId: formValues.type === 'transfer' ? null : formValues.categoryId,
      accountId: formValues.accountId,
      toAccountId: formValues.type === 'transfer' ? formValues.toAccountId : null,
      paymentMethod: PAYMENT_METHODS[formValues.paymentMethod] ? formValues.paymentMethod : 'other',
      status: formValues.status === 'pending' ? 'pending' : 'completed',
      tags: normalizeTags(formValues.tags),
      notes: cleanString(formValues.notes, 1000),
    };

    let saved;
    let message;
    if (isEdit) {
      saved = appData.transactions.find((item) => item.id === transaction.id);
      if (!saved) {
        closeModal(modal, { silent: true });
        showToast("Erreur : cette transaction n'existe plus.", 'error');
        return;
      }
      Object.assign(saved, normalizeTransaction({ ...saved, ...fields, updatedAt: now }));
      message = 'Transaction modifiée.';
    } else {
      saved = normalizeTransaction({ id: uid('tx'), ...fields, createdAt: now, updatedAt: now });
      appData.transactions.push(saved);
      message = 'Transaction ajoutée.';
    }

    if (formValues.isRecurring && !saved.recurringId) {
      createRuleFromTransaction(saved, formValues.frequency);
      const generated = generateRecurringTransactions({ save: false });
      message += ` Récurrence ${FREQUENCIES[formValues.frequency].toLowerCase()} créée`;
      message += generated ? ` (${pluralize(generated, 'occurrence passée générée', 'occurrences passées générées')}).` : '.';
    }
    closeModal(modal, { silent: true });
    persist(message);
  });
}

/** Affiche/masque un bloc lié à une case à cocher (data-toggle-target). */
function bindToggleTargets(form) {
  form.querySelectorAll('[data-toggle-target]').forEach((checkbox) => {
    const target = form.querySelector(checkbox.dataset.toggleTarget);
    if (!target) return;
    const sync = () => {
      target.hidden = !checkbox.checked;
      target.querySelectorAll('input, select, textarea').forEach((control) => {
        control.disabled = !checkbox.checked;
      });
    };
    checkbox.addEventListener('change', sync);
    sync();
  });
}

/** Crée une règle récurrente à partir d'une transaction existante. */
function createRuleFromTransaction(transaction, frequency) {
  const rule = normalizeRecurring({
    id: uid('rec'),
    description: transaction.description,
    type: transaction.type,
    amount: transaction.amount,
    categoryId: transaction.categoryId,
    accountId: transaction.accountId,
    toAccountId: transaction.toAccountId,
    paymentMethod: transaction.paymentMethod,
    frequency,
    startDate: transaction.date,
    endDate: '',
    lastDate: transaction.date,
    active: true,
    notes: transaction.notes,
    tags: transaction.tags,
  });
  rule.nextDate = computeNextDate(rule, transaction.date);
  appData.recurringTransactions.push(rule);
  transaction.recurringId = rule.id;
  return rule;
}

/** Fenêtre de consultation d'une transaction. */
function openTransactionDetails(id) {
  const transaction = appData.transactions.find((item) => item.id === id);
  if (!transaction) {
    showToast("Cette transaction n'existe plus.", 'error');
    return;
  }
  const rule = transaction.recurringId ? appData.recurringTransactions.find((item) => item.id === transaction.recurringId) : null;
  const bill = transaction.billId ? appData.bills.find((item) => item.id === transaction.billId) : null;
  const currency = getAccountCurrency(transaction.accountId);
  const status = TRANSACTION_STATUSES[transaction.status];
  showModal({
    title: 'Détail de la transaction',
    size: 'md',
    content: html`<div class="modal-body">
        <div class="detail-hero">
          ${categoryChip(transaction.categoryId, transaction.type)}
          <p class="detail-amount">${amountHtml(transaction.amount, transaction.type, currency)}</p>
          <p class="detail-title">${transaction.description}</p>
        </div>
        <dl class="detail-list">
          <div><dt>Type</dt><dd>${TRANSACTION_TYPES[transaction.type].label}</dd></div>
          <div><dt>Date</dt><dd>${capitalize(formatDate(transaction.date, 'long'))}</dd></div>
          <div><dt>${transaction.type === 'transfer' ? 'Compte source' : 'Compte'}</dt><dd>${getAccountName(transaction.accountId)}</dd></div>
          ${transaction.type === 'transfer' ? html`<div><dt>Compte destination</dt><dd>${getAccountName(transaction.toAccountId)}</dd></div>` : ''}
          <div><dt>Mode de paiement</dt><dd>${PAYMENT_METHODS[transaction.paymentMethod]}</dd></div>
          <div><dt>Statut</dt><dd>${badge(status.label, status.badge)}</dd></div>
          <div><dt>Récurrence</dt><dd>${rule ? `${FREQUENCIES[rule.frequency]} — « ${rule.description} »` : 'Non récurrente'}</dd></div>
          ${bill ? html`<div><dt>Échéance liée</dt><dd>${bill.name}</dd></div>` : ''}
          <div class="detail-full"><dt>Tags</dt><dd>${transaction.tags.length ? transaction.tags.map((tag) => html`<span class="tag">#${tag}</span> `) : html`<span class="text-muted">Aucun tag</span>`}</dd></div>
          <div class="detail-full"><dt>Notes</dt><dd class="pre-wrap">${transaction.notes || html`<span class="text-muted">Aucune note</span>`}</dd></div>
          <div><dt>Créée le</dt><dd>${formatDateTime(transaction.createdAt)}</dd></div>
          <div><dt>Modifiée le</dt><dd>${formatDateTime(transaction.updatedAt)}</dd></div>
        </dl>
      </div>
      <div class="modal-footer modal-footer-split">
        <button type="button" class="btn btn-danger-ghost" data-action="delete-transaction" data-id="${transaction.id}" data-modal-close>${icon('fa-trash')}<span>Supprimer</span></button>
        <div class="modal-footer-group">
          ${transaction.status === 'pending' ? html`<button type="button" class="btn btn-secondary" data-action="validate-transaction" data-id="${transaction.id}" data-modal-close>${icon('fa-check')}<span>Marquer effectuée</span></button>` : ''}
          <button type="button" class="btn btn-secondary" data-action="duplicate-transaction" data-id="${transaction.id}" data-modal-close>${icon('fa-copy')}<span>Dupliquer</span></button>
          <button type="button" class="btn btn-primary" data-action="edit-transaction" data-id="${transaction.id}" data-modal-close>${icon('fa-pen')}<span>Modifier</span></button>
        </div>
      </div>`,
  });
}

/** Suppression d'une transaction (avec confirmation). */
async function deleteTransaction(id) {
  const transaction = appData.transactions.find((item) => item.id === id);
  if (!transaction) return;
  const { confirmed } = await confirmDialog({
    title: 'Supprimer la transaction',
    message: html`Supprimer définitivement « <strong>${transaction.description}</strong> » (${formatCurrency(transaction.amount, getAccountCurrency(transaction.accountId))}, ${formatDate(transaction.date)}) ?`,
    details: transaction.recurringId ? "Cette occurrence ne sera pas recréée ; la récurrence continue pour les dates suivantes." : 'Cette action est irréversible.',
    confirmLabel: 'Supprimer',
  });
  if (!confirmed) return;
  removeTransactions(new Set([id]));
  persist('Transaction supprimée.');
}

function validatePendingTransaction(id) {
  const transaction = appData.transactions.find((item) => item.id === id);
  if (!transaction) return;
  transaction.status = 'completed';
  transaction.updatedAt = new Date().toISOString();
  persist('Transaction marquée comme effectuée : elle est maintenant comptabilisée.');
}

/* ==========================================================================
   COMPTES
   ========================================================================== */

function openAccountForm({ account = null } = {}) {
  const isEdit = Boolean(account);
  const formId = 'account-form';
  const values = account || { name: '', type: 'checking', initialBalance: 0, currency: '', description: '', color: COLOR_CHOICES[appData.accounts.length % 8] };
  const currencyOptions = [{ value: '', label: `Devise principale (${getSetting('currency')})` }]
    .concat(Object.values(CURRENCIES).map((currency) => ({ value: currency.code, label: `${currency.code} — ${currency.name}` })));

  const body = html`
    ${formField({ formId, name: 'name', label: 'Nom du compte', value: values.name, required: true, placeholder: 'Ex. : Compte courant', attrs: { maxlength: 60 } })}
    <div class="form-grid">
      ${formField({ formId, name: 'type', label: 'Type de compte', type: 'select', value: values.type, options: mapToOptions(ACCOUNT_TYPES) })}
      ${formField({ formId, name: 'initialBalance', label: 'Solde initial', type: 'amount', value: amountInputValue(values.initialBalance), required: true, hint: 'Peut être négatif (découvert, carte de crédit).' })}
      ${formField({ formId, name: 'currency', label: 'Devise', type: 'select', value: values.currency, options: currencyOptions, hint: 'Sans conversion automatique entre devises.' })}
    </div>
    ${formField({ formId, name: 'description', label: 'Description', type: 'textarea', value: values.description, rows: 2, attrs: { maxlength: 300 } })}
    ${colorPickerHtml(formId, 'color', values.color)}
    ${isEdit ? html`<p class="info-line">${icon('fa-circle-info')} Solde actuel : <strong>${formatCurrency(calculateAccountBalance(account.id), getAccountCurrency(account.id))}</strong></p>` : ''}`;

  const modal = showModal({
    title: isEdit ? 'Modifier le compte' : 'Nouveau compte',
    content: modalForm(formId, body, modalFooterButtons(isEdit ? 'Enregistrer' : 'Créer le compte')),
    initialFocus: `#${formId}-name`,
  });
  const form = modal.element.querySelector('form');
  bindFormErrorClearing(form);
  bindColorPicker(form, 'color');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formValues = getFormValues(form);
    const errors = {};
    const name = cleanString(formValues.name, 60);
    if (!name) errors.name = 'Le nom du compte est obligatoire.';
    else if (appData.accounts.some((item) => item.id !== (account && account.id) && normalizeText(item.name) === normalizeText(name))) {
      errors.name = 'Un compte porte déjà ce nom.';
    }
    if (!ACCOUNT_TYPES[formValues.type]) errors.type = 'Choisissez un type de compte.';
    const balance = validateAmountInput(formValues.initialBalance, { allowNegative: true, label: 'Le solde initial' });
    if (balance.error) errors.initialBalance = balance.error;
    if (formValues.currency && !CURRENCIES[formValues.currency]) errors.currency = 'Devise invalide.';
    if (showFormErrors(form, errors)) return;

    const fields = {
      name,
      type: formValues.type,
      initialBalance: balance.value,
      currency: formValues.currency,
      description: cleanString(formValues.description, 300),
      color: readColor(formValues, 'color'),
    };
    if (isEdit) {
      const saved = getAccount(account.id);
      if (saved) Object.assign(saved, normalizeAccount({ ...saved, ...fields }));
    } else {
      appData.accounts.push(normalizeAccount({ id: uid('acc'), ...fields, createdAt: new Date().toISOString() }));
    }
    closeModal(modal, { silent: true });
    persist(isEdit ? 'Compte modifié.' : `Compte « ${name} » créé.`);
  });
}

/** Suppression d'un compte : propose de transférer ou de supprimer ses transactions. */
function openDeleteAccountDialog(accountId) {
  const account = getAccount(accountId);
  if (!account) return;
  const linked = appData.transactions.filter((t) => t.accountId === accountId || t.toAccountId === accountId);
  const linkedRules = appData.recurringTransactions.filter((r) => r.accountId === accountId || r.toAccountId === accountId);

  if (!linked.length && !linkedRules.length) {
    confirmDialog({
      title: 'Supprimer le compte',
      message: html`Supprimer le compte « <strong>${account.name}</strong> » ?`,
      details: 'Ce compte ne contient aucune transaction. Les échéances et objectifs associés seront conservés, sans compte.',
      confirmLabel: 'Supprimer',
    }).then(({ confirmed }) => {
      if (!confirmed) return;
      applyAccountDeletion(accountId, { mode: 'delete' });
      persist('Compte supprimé.');
    });
    return;
  }

  const formId = 'delete-account-form';
  const others = appData.accounts.filter((item) => item.id !== accountId);
  const body = html`
    <div class="confirm-message confirm-danger">
      <span class="confirm-icon" aria-hidden="true">${icon('fa-triangle-exclamation')}</span>
      <p>Le compte « <strong>${account.name}</strong> » est utilisé par ${pluralize(linked.length, 'transaction', 'transactions')}${linkedRules.length ? ` et ${pluralize(linkedRules.length, 'transaction récurrente', 'transactions récurrentes')}` : ''}. Que souhaitez-vous en faire ?</p>
    </div>
    <fieldset class="field mt-2">
      <legend class="sr-only">Traitement des transactions</legend>
      <label class="radio-card">
        <input type="radio" name="mode" value="reassign" ${others.length ? raw('checked') : raw('disabled')}>
        <span><strong>Transférer vers un autre compte</strong><span class="small text-muted">Les transactions, récurrences, échéances et objectifs sont rattachés au compte choisi.</span></span>
      </label>
      <div class="radio-card-extra">
        ${formField({ formId, name: 'targetId', label: 'Compte de remplacement', type: 'select', value: others.length ? others[0].id : '', options: others.length ? others.map((item) => ({ value: item.id, label: item.name })) : [{ value: '', label: 'Aucun autre compte' }] })}
      </div>
      <label class="radio-card">
        <input type="radio" name="mode" value="delete" ${others.length ? '' : raw('checked')}>
        <span><strong>Supprimer aussi ces transactions</strong><span class="small text-muted">${pluralize(linked.length, 'transaction sera supprimée', 'transactions seront supprimées')} ainsi que les récurrences du compte.</span></span>
      </label>
      ${fieldError(formId, 'mode')}
    </fieldset>
    <p class="small text-muted">Les transferts qui deviendraient internes à un même compte seront supprimés.</p>`;

  const modal = showModal({
    title: 'Supprimer le compte',
    content: modalForm(formId, body, modalFooterButtons('Supprimer le compte', { danger: true })),
  });
  const form = modal.element.querySelector('form');
  bindFormErrorClearing(form);
  const syncTarget = () => {
    const mode = getFormValues(form).mode;
    form.querySelector('[name="targetId"]').disabled = mode !== 'reassign' || !others.length;
  };
  form.querySelectorAll('input[name="mode"]').forEach((radio) => radio.addEventListener('change', syncTarget));
  syncTarget();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formValues = getFormValues(form);
    const errors = {};
    if (!['reassign', 'delete'].includes(formValues.mode)) errors.mode = 'Choisissez une option.';
    if (formValues.mode === 'reassign' && !getAccount(formValues.targetId)) errors.targetId = 'Choisissez un compte de remplacement.';
    if (showFormErrors(form, errors)) return;
    applyAccountDeletion(accountId, { mode: formValues.mode, targetId: formValues.targetId });
    closeModal(modal, { silent: true });
    persist(formValues.mode === 'reassign' ? `Compte supprimé : opérations transférées vers « ${getAccountName(formValues.targetId)} ».` : 'Compte et transactions associées supprimés.');
  });
}

function applyAccountDeletion(accountId, { mode, targetId = null }) {
  if (mode === 'reassign' && getAccount(targetId)) {
    appData.transactions.forEach((transaction) => {
      if (transaction.accountId === accountId) transaction.accountId = targetId;
      if (transaction.toAccountId === accountId) transaction.toAccountId = targetId;
    });
    const selfTransfers = new Set(appData.transactions.filter((t) => t.type === 'transfer' && t.accountId === t.toAccountId).map((t) => t.id));
    removeTransactions(selfTransfers);
    appData.recurringTransactions.forEach((rule) => {
      if (rule.accountId === accountId) rule.accountId = targetId;
      if (rule.toAccountId === accountId) rule.toAccountId = targetId;
    });
    appData.recurringTransactions = appData.recurringTransactions.filter((rule) => !(rule.type === 'transfer' && rule.accountId === rule.toAccountId));
    appData.bills.forEach((bill) => {
      if (bill.accountId === accountId) bill.accountId = targetId;
    });
    appData.goals.forEach((goal) => {
      if (goal.accountId === accountId) goal.accountId = targetId;
    });
  } else {
    removeTransactions(new Set(appData.transactions.filter((t) => t.accountId === accountId || t.toAccountId === accountId).map((t) => t.id)));
    appData.recurringTransactions = appData.recurringTransactions.filter((rule) => rule.accountId !== accountId && rule.toAccountId !== accountId);
    appData.bills.forEach((bill) => {
      if (bill.accountId === accountId) bill.accountId = null;
    });
    appData.goals.forEach((goal) => {
      if (goal.accountId === accountId) goal.accountId = null;
    });
  }
  appData.accounts = appData.accounts.filter((account) => account.id !== accountId);
  if (viewState.transactions.filters.accountId === accountId) viewState.transactions.filters.accountId = '';
  if (viewState.reports.accountId === accountId) viewState.reports.accountId = '';
}

/* ==========================================================================
   CATÉGORIES
   ========================================================================== */

/**
 * Formulaire de catégorie.
 * @param {{category?: object, defaults?: {type?: string}, onSaved?: Function}} options
 */
function openCategoryForm({ category = null, defaults = {}, onSaved = null } = {}) {
  const isEdit = Boolean(category);
  const formId = 'category-form';
  const values = category || { name: '', type: defaults.type || 'expense', icon: 'fa-tag', color: COLOR_CHOICES[appData.categories.length % COLOR_CHOICES.length] };
  const usage = isEdit ? appData.transactions.filter((t) => t.categoryId === category.id).length + appData.recurringTransactions.filter((r) => r.categoryId === category.id).length + appData.bills.filter((b) => b.categoryId === category.id).length + appData.budgets.filter((b) => b.categoryId === category.id).length : 0;
  const typeLocked = isEdit && usage > 0;

  const body = html`
    <div class="category-preview" aria-hidden="true">
      <span class="cat-icon cat-icon-lg" data-preview-icon style="--cat-color:${sanitizeColor(values.color)}">${icon(values.icon)}</span>
      <span class="category-preview-name" data-preview-name>${values.name || 'Nouvelle catégorie'}</span>
    </div>
    <div class="form-grid">
      ${formField({ formId, name: 'name', label: 'Nom', value: values.name, required: true, placeholder: 'Ex. : Animaux', attrs: { maxlength: 40 } })}
      ${formField({
        formId, name: 'type', label: 'Type', type: 'select', value: values.type,
        options: [{ value: 'expense', label: 'Dépense' }, { value: 'income', label: 'Revenu (source)' }],
        attrs: { disabled: typeLocked },
        hint: typeLocked ? 'Type non modifiable : la catégorie est déjà utilisée.' : '',
      })}
    </div>
    ${iconPickerHtml(formId, 'icon', values.icon)}
    ${colorPickerHtml(formId, 'color', values.color)}`;

  const modal = showModal({
    title: isEdit ? 'Modifier la catégorie' : defaults.type === 'income' ? 'Nouvelle source de revenus' : 'Nouvelle catégorie',
    size: 'lg',
    content: modalForm(formId, body, modalFooterButtons(isEdit ? 'Enregistrer' : 'Créer la catégorie')),
    initialFocus: `#${formId}-name`,
  });
  const form = modal.element.querySelector('form');
  bindFormErrorClearing(form);
  bindColorPicker(form, 'color');

  // Aperçu en direct.
  const updatePreview = () => {
    const formValues = getFormValues(form);
    form.querySelector('[data-preview-name]').textContent = cleanString(formValues.name, 40) || 'Nouvelle catégorie';
    const previewIcon = form.querySelector('[data-preview-icon]');
    previewIcon.style.setProperty('--cat-color', readColor(formValues, 'color'));
    setHTML(previewIcon, icon(sanitizeIcon(formValues.icon, values.icon)));
  };
  form.addEventListener('input', updatePreview);
  form.addEventListener('change', updatePreview);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formValues = getFormValues(form);
    const type = typeLocked ? category.type : formValues.type;
    const errors = {};
    const name = cleanString(formValues.name, 40);
    if (!name) errors.name = 'Le nom de la catégorie est obligatoire.';
    else if (appData.categories.some((item) => item.id !== (category && category.id) && item.type === type && normalizeText(item.name) === normalizeText(name))) {
      errors.name = `Une catégorie de ${type === 'income' ? 'revenus' : 'dépenses'} porte déjà ce nom.`;
    }
    if (!['income', 'expense'].includes(type)) errors.type = 'Choisissez un type.';
    if (showFormErrors(form, errors)) return;

    const fields = { name, type, icon: sanitizeIcon(formValues.icon, values.icon || 'fa-tag'), color: readColor(formValues, 'color') };
    let saved;
    if (isEdit) {
      saved = getCategory(category.id);
      if (saved) Object.assign(saved, normalizeCategory({ ...saved, ...fields }));
    } else {
      saved = normalizeCategory({ id: uid('cat'), ...fields });
      appData.categories.push(saved);
    }
    closeModal(modal, { silent: true });
    persist(isEdit ? 'Catégorie modifiée.' : `Catégorie « ${name} » créée.`);
    if (typeof onSaved === 'function' && saved) onSaved(saved);
  });
}

/** Suppression d'une catégorie : demande comment traiter les transactions existantes. */
function openDeleteCategoryDialog(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return;
  const linked = appData.transactions.filter((t) => t.categoryId === categoryId);
  const rules = appData.recurringTransactions.filter((r) => r.categoryId === categoryId);
  const bills = appData.bills.filter((b) => b.categoryId === categoryId);
  const budgets = appData.budgets.filter((b) => b.categoryId === categoryId);

  if (!linked.length && !rules.length && !bills.length && !budgets.length) {
    confirmDialog({
      title: 'Supprimer la catégorie',
      message: html`Supprimer la catégorie « <strong>${category.name}</strong> » ?`,
      details: "Elle n'est utilisée par aucune transaction.",
      confirmLabel: 'Supprimer',
    }).then(({ confirmed }) => {
      if (!confirmed) return;
      applyCategoryDeletion(categoryId, { mode: 'uncategorize' });
      persist('Catégorie supprimée.');
    });
    return;
  }

  const formId = 'delete-category-form';
  const others = getCategoriesByType(category.type).filter((item) => item.id !== categoryId);
  const fallback = others.find((item) => normalizeText(item.name) === 'autres') || others[0];
  const usageParts = [
    linked.length ? pluralize(linked.length, 'transaction', 'transactions') : '',
    rules.length ? pluralize(rules.length, 'récurrence', 'récurrences') : '',
    bills.length ? pluralize(bills.length, 'échéance', 'échéances') : '',
  ].filter(Boolean);

  const body = html`
    <div class="confirm-message confirm-danger">
      <span class="confirm-icon" aria-hidden="true">${icon('fa-triangle-exclamation')}</span>
      <p>La catégorie « <strong>${category.name}</strong> » est utilisée par ${usageParts.join(', ') || 'un budget'}. Comment traiter les transactions existantes ?</p>
    </div>
    <fieldset class="field mt-2">
      <legend class="sr-only">Traitement des transactions</legend>
      <label class="radio-card">
        <input type="radio" name="mode" value="reassign" ${others.length ? raw('checked') : raw('disabled')}>
        <span><strong>Réaffecter à une autre catégorie</strong><span class="small text-muted">Transactions, récurrences et échéances passent dans la catégorie choisie.</span></span>
      </label>
      <div class="radio-card-extra">
        ${formField({ formId, name: 'targetId', label: 'Nouvelle catégorie', type: 'select', value: fallback ? fallback.id : '', options: others.length ? others.map((item) => ({ value: item.id, label: item.name })) : [{ value: '', label: 'Aucune autre catégorie' }] })}
      </div>
      <label class="radio-card">
        <input type="radio" name="mode" value="uncategorize" ${others.length ? '' : raw('checked')}>
        <span><strong>Laisser sans catégorie</strong><span class="small text-muted">Les transactions seront affichées « Non catégorisé ».</span></span>
      </label>
      <label class="radio-card">
        <input type="radio" name="mode" value="delete">
        <span><strong>Supprimer les transactions concernées</strong><span class="small text-muted">${pluralize(linked.length, 'transaction sera supprimée', 'transactions seront supprimées')} définitivement.</span></span>
      </label>
      ${fieldError(formId, 'mode')}
    </fieldset>
    ${budgets.length ? html`<p class="small text-muted">${icon('fa-circle-info')} Le budget associé à cette catégorie sera supprimé.</p>` : ''}`;

  const modal = showModal({
    title: 'Supprimer la catégorie',
    content: modalForm(formId, body, modalFooterButtons('Supprimer la catégorie', { danger: true })),
  });
  const form = modal.element.querySelector('form');
  bindFormErrorClearing(form);
  const syncTarget = () => {
    form.querySelector('[name="targetId"]').disabled = getFormValues(form).mode !== 'reassign' || !others.length;
  };
  form.querySelectorAll('input[name="mode"]').forEach((radio) => radio.addEventListener('change', syncTarget));
  syncTarget();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formValues = getFormValues(form);
    const errors = {};
    if (!['reassign', 'uncategorize', 'delete'].includes(formValues.mode)) errors.mode = 'Choisissez une option.';
    if (formValues.mode === 'reassign' && !getCategory(formValues.targetId)) errors.targetId = 'Choisissez une catégorie.';
    if (showFormErrors(form, errors)) return;
    applyCategoryDeletion(categoryId, { mode: formValues.mode, targetId: formValues.targetId });
    closeModal(modal, { silent: true });
    const messages = {
      reassign: `Catégorie supprimée : opérations réaffectées à « ${getCategoryName(formValues.targetId)} ».`,
      uncategorize: 'Catégorie supprimée : opérations laissées sans catégorie.',
      delete: 'Catégorie et transactions associées supprimées.',
    };
    persist(messages[formValues.mode]);
  });
}

function applyCategoryDeletion(categoryId, { mode, targetId = null }) {
  const replacement = mode === 'reassign' && getCategory(targetId) ? targetId : null;
  if (mode === 'delete') {
    removeTransactions(new Set(appData.transactions.filter((t) => t.categoryId === categoryId).map((t) => t.id)));
  } else {
    appData.transactions.forEach((transaction) => {
      if (transaction.categoryId === categoryId) transaction.categoryId = replacement;
    });
  }
  appData.recurringTransactions.forEach((rule) => {
    if (rule.categoryId === categoryId) rule.categoryId = replacement;
  });
  appData.bills.forEach((bill) => {
    if (bill.categoryId === categoryId) bill.categoryId = replacement;
  });
  appData.budgets = appData.budgets.filter((budget) => budget.categoryId !== categoryId);
  appData.categories = appData.categories.filter((category) => category.id !== categoryId);
  if (viewState.transactions.filters.categoryId === categoryId) viewState.transactions.filters.categoryId = '';
  if (viewState.reports.categoryId === categoryId) viewState.reports.categoryId = '';
}

/* ==========================================================================
   BUDGETS
   ========================================================================== */

function openBudgetForm({ budget = null, defaults = {} } = {}) {
  const isEdit = Boolean(budget);
  const formId = 'budget-form';
  const hasGlobal = appData.budgets.some((item) => item.scope === 'global' && (!budget || item.id !== budget.id));
  const usedIds = new Set(appData.budgets.filter((item) => item.scope === 'category' && (!budget || item.id !== budget.id)).map((item) => item.categoryId));
  const available = getCategoriesByType('expense').filter((category) => !usedIds.has(category.id));
  const scope = budget ? budget.scope : defaults.categoryId ? 'category' : hasGlobal ? 'category' : 'global';
  const selectedCategory = budget ? budget.categoryId : defaults.categoryId || (available[0] ? available[0].id : '');

  const body = html`
    <fieldset class="field">
      <legend class="field-label">Type de budget<span class="required" aria-hidden="true"> *</span></legend>
      <div class="segmented">
        <label class="segmented-option">
          <input type="radio" name="scope" value="global" ${scope === 'global' ? raw('checked') : ''} ${hasGlobal ? raw('disabled') : ''}>
          <span>${icon('fa-globe')}Global</span>
        </label>
        <label class="segmented-option">
          <input type="radio" name="scope" value="category" ${scope === 'category' ? raw('checked') : ''}>
          <span>${icon('fa-folder-open')}Par catégorie</span>
        </label>
      </div>
      ${hasGlobal ? html`<p class="field-hint">Un budget global existe déjà.</p>` : html`<p class="field-hint">Le budget global couvre toutes les dépenses du mois.</p>`}
      ${fieldError(formId, 'scope')}
    </fieldset>
    <div data-show-for="category">
      ${formField({
        formId, name: 'categoryId', label: 'Catégorie de dépenses', type: 'select', value: selectedCategory, required: true,
        options: [{ value: '', label: available.length ? 'Choisir une catégorie' : 'Toutes les catégories ont déjà un budget' }].concat(available.map((category) => ({ value: category.id, label: category.name }))),
      })}
    </div>
    ${formField({ formId, name: 'amount', label: 'Montant mensuel', type: 'amount', value: budget ? amountInputValue(budget.amount) : '', required: true, hint: 'Les dépenses de chaque mois sont comparées à ce montant.' })}`;

  const modal = showModal({
    title: isEdit ? 'Modifier le budget' : 'Nouveau budget',
    size: 'sm',
    content: modalForm(formId, body, modalFooterButtons(isEdit ? 'Enregistrer' : 'Créer le budget')),
    initialFocus: `#${formId}-amount`,
  });
  const form = modal.element.querySelector('form');
  bindFormErrorClearing(form);
  const syncScope = () => {
    const current = getFormValues(form).scope;
    form.querySelectorAll('[data-show-for]').forEach((element) => {
      const visible = element.dataset.showFor === current;
      element.hidden = !visible;
      element.querySelectorAll('select').forEach((select) => {
        select.disabled = !visible;
      });
    });
  };
  form.querySelectorAll('input[name="scope"]').forEach((radio) => radio.addEventListener('change', syncScope));
  syncScope();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formValues = getFormValues(form);
    const errors = {};
    if (!['global', 'category'].includes(formValues.scope)) errors.scope = 'Choisissez un type de budget.';
    if (formValues.scope === 'global' && hasGlobal) errors.scope = 'Un budget global existe déjà.';
    if (formValues.scope === 'category') {
      const category = getCategory(formValues.categoryId);
      if (!category || category.type !== 'expense') errors.categoryId = 'Choisissez une catégorie de dépenses.';
      else if (usedIds.has(category.id)) errors.categoryId = 'Cette catégorie a déjà un budget.';
    }
    const amount = validateAmountInput(formValues.amount);
    if (amount.error) errors.amount = amount.error;
    if (showFormErrors(form, errors)) return;

    const fields = { scope: formValues.scope, categoryId: formValues.scope === 'category' ? formValues.categoryId : null, amount: amount.value };
    if (isEdit) {
      const saved = appData.budgets.find((item) => item.id === budget.id);
      if (saved) Object.assign(saved, normalizeBudget({ ...saved, ...fields }));
    } else {
      appData.budgets.push(normalizeBudget({ id: uid('bud'), ...fields, createdAt: new Date().toISOString() }));
    }
    closeModal(modal, { silent: true });
    persist(isEdit ? 'Budget modifié.' : 'Budget créé.');
  });
}

async function deleteBudget(id) {
  const budget = appData.budgets.find((item) => item.id === id);
  if (!budget) return;
  const { confirmed } = await confirmDialog({
    title: 'Supprimer le budget',
    message: html`Supprimer le budget « <strong>${getBudgetLabel(budget)}</strong> » (${formatCurrency(budget.amount)} par mois) ?`,
    details: 'Les transactions ne sont pas modifiées.',
    confirmLabel: 'Supprimer',
  });
  if (!confirmed) return;
  appData.budgets = appData.budgets.filter((item) => item.id !== id);
  persist('Budget supprimé.');
}

/* ==========================================================================
   OBJECTIFS
   ========================================================================== */

function openGoalForm({ goal = null } = {}) {
  const isEdit = Boolean(goal);
  const formId = 'goal-form';
  const values = goal || { name: '', targetAmount: '', initialAmount: 0, targetDate: '', accountId: '', description: '', icon: 'fa-bullseye', color: COLOR_CHOICES[appData.goals.length % 8] };
  const contributionsTotal = goal ? roundMoney(sumBy(goal.contributions, (c) => c.amount)) : 0;

  const body = html`
    ${formField({ formId, name: 'name', label: "Nom de l'objectif", value: values.name, required: true, placeholder: "Ex. : Fonds d'urgence", attrs: { maxlength: 60 } })}
    <div class="form-grid">
      ${formField({ formId, name: 'targetAmount', label: 'Montant cible', type: 'amount', value: values.targetAmount === '' ? '' : amountInputValue(values.targetAmount), required: true })}
      ${formField({
        formId, name: 'initialAmount', label: isEdit ? 'Montant initial' : 'Montant actuel', type: 'amount', value: amountInputValue(values.initialAmount),
        hint: isEdit ? `Hors contributions (${formatCurrency(contributionsTotal)} versés). Total actuel : ${formatCurrency(getGoalCurrentAmount(goal))}.` : 'Somme déjà mise de côté pour cet objectif.',
      })}
      ${formField({ formId, name: 'targetDate', label: 'Date cible', type: 'date', value: values.targetDate, hint: 'Facultative.' })}
      ${formField({ formId, name: 'accountId', label: 'Compte associé', type: 'select', value: values.accountId || '', options: accountOptions({ emptyLabel: 'Aucun compte' }) })}
    </div>
    ${formField({ formId, name: 'description', label: 'Description', type: 'textarea', value: values.description, rows: 2, attrs: { maxlength: 300 } })}
    ${iconPickerHtml(formId, 'icon', values.icon)}
    ${colorPickerHtml(formId, 'color', values.color)}`;

  const modal = showModal({
    title: isEdit ? "Modifier l'objectif" : 'Nouvel objectif',
    size: 'lg',
    content: modalForm(formId, body, modalFooterButtons(isEdit ? 'Enregistrer' : "Créer l'objectif")),
    initialFocus: `#${formId}-name`,
  });
  const form = modal.element.querySelector('form');
  bindFormErrorClearing(form);
  bindColorPicker(form, 'color');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formValues = getFormValues(form);
    const errors = {};
    const name = cleanString(formValues.name, 60);
    if (!name) errors.name = "Le nom de l'objectif est obligatoire.";
    const target = validateAmountInput(formValues.targetAmount, { label: 'Le montant cible' });
    if (target.error) errors.targetAmount = target.error;
    const initial = String(formValues.initialAmount).trim() === '' ? { value: 0 } : validateAmountInput(formValues.initialAmount, { allowZero: true, label: 'Le montant' });
    if (initial.error) errors.initialAmount = initial.error;
    if (formValues.targetDate) {
      if (!isValidDateStr(formValues.targetDate)) errors.targetDate = 'Saisissez une date valide.';
      else if (!isEdit && formValues.targetDate < todayStr()) errors.targetDate = "La date cible doit être aujourd'hui ou plus tard.";
    }
    if (formValues.accountId && !getAccount(formValues.accountId)) errors.accountId = 'Compte invalide.';
    if (showFormErrors(form, errors)) return;

    const fields = {
      name,
      targetAmount: target.value,
      initialAmount: initial.value,
      targetDate: formValues.targetDate || '',
      accountId: formValues.accountId || null,
      description: cleanString(formValues.description, 300),
      icon: sanitizeIcon(formValues.icon, values.icon || 'fa-bullseye'),
      color: readColor(formValues, 'color'),
    };
    if (isEdit) {
      const saved = appData.goals.find((item) => item.id === goal.id);
      if (saved) Object.assign(saved, normalizeGoal({ ...saved, ...fields }));
    } else {
      appData.goals.push(normalizeGoal({ id: uid('goal'), ...fields, contributions: [], createdAt: new Date().toISOString() }));
    }
    closeModal(modal, { silent: true });
    persist(isEdit ? 'Objectif modifié.' : `Objectif « ${name} » créé.`);
  });
}

/** Ajout d'un montant à un objectif (contribution), avec transfert optionnel. */
function openContributionForm(goalId) {
  const goal = appData.goals.find((item) => item.id === goalId);
  if (!goal) return;
  const formId = 'contribution-form';
  const progress = calculateGoalProgress(goal);
  const goalAccount = getAccount(goal.accountId);
  const sources = goalAccount ? appData.accounts.filter((account) => account.id !== goalAccount.id) : [];

  const body = html`
    <div class="goal-mini">
      <span class="cat-icon" style="--cat-color:${goal.color}">${icon(goal.icon)}</span>
      <div class="goal-mini-text">
        <p><strong>${goal.name}</strong></p>
        <p class="small text-muted">${formatCurrency(progress.current)} sur ${formatCurrency(progress.target)} · reste ${formatCurrency(progress.remaining)}</p>
      </div>
    </div>
    ${progressBar(progress.percent, progress.status === 'reached' ? 'reached' : 'normal', `Progression de ${goal.name}`)}
    <div class="form-grid mt-2">
      ${formField({ formId, name: 'amount', label: 'Montant à ajouter', type: 'amount', value: progress.monthlyNeeded ? amountInputValue(progress.monthlyNeeded) : '', required: true, hint: progress.monthlyNeeded ? 'Prérempli avec le montant mensuel conseillé.' : '' })}
      ${formField({ formId, name: 'date', label: 'Date', type: 'date', value: todayStr(), required: true })}
    </div>
    ${formField({ formId, name: 'note', label: 'Note', value: '', placeholder: 'Ex. : Versement de novembre', attrs: { maxlength: 200 } })}
    ${goalAccount && sources.length ? html`<div class="recurring-box">
      <label class="checkbox"><input type="checkbox" name="createTransfer" data-toggle-target="#${formId}-source-field"><span>Enregistrer un transfert vers « ${goalAccount.name} »</span></label>
      <div id="${formId}-source-field" class="mt-2" hidden>
        ${formField({ formId, name: 'sourceAccountId', label: 'Depuis le compte', type: 'select', value: sources[0].id, options: sources.map((account) => ({ value: account.id, label: account.name })) })}
      </div>
    </div>` : ''}`;

  const modal = showModal({
    title: 'Ajouter un montant',
    size: 'sm',
    content: modalForm(formId, body, modalFooterButtons('Ajouter')),
    initialFocus: `#${formId}-amount`,
  });
  const form = modal.element.querySelector('form');
  bindFormErrorClearing(form);
  bindToggleTargets(form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formValues = getFormValues(form);
    const errors = {};
    const amount = validateAmountInput(formValues.amount);
    if (amount.error) errors.amount = amount.error;
    if (!isValidDateStr(formValues.date)) errors.date = 'Saisissez une date valide.';
    if (formValues.createTransfer && !getAccount(formValues.sourceAccountId)) errors.sourceAccountId = 'Choisissez le compte source.';
    if (showFormErrors(form, errors)) return;

    let transactionId = null;
    if (formValues.createTransfer && goalAccount) {
      const now = new Date().toISOString();
      const transfer = normalizeTransaction({
        id: uid('tx'), type: 'transfer', amount: amount.value, date: formValues.date, description: `Épargne — ${goal.name}`,
        accountId: formValues.sourceAccountId, toAccountId: goalAccount.id, paymentMethod: 'transfer', createdAt: now, updatedAt: now,
      });
      appData.transactions.push(transfer);
      transactionId = transfer.id;
    }
    goal.contributions.push({ id: uid('ctb'), amount: amount.value, date: formValues.date, note: cleanString(formValues.note, 200), transactionId });
    const reached = calculateGoalProgress(goal).status === 'reached';
    closeModal(modal, { silent: true });
    persist(reached ? `Objectif « ${goal.name} » atteint, félicitations !` : `Montant ajouté à « ${goal.name} ».`);
  });
}

/** Historique des contributions d'un objectif. */
function openGoalHistory(goalId) {
  const goal = appData.goals.find((item) => item.id === goalId);
  if (!goal) return;
  const progress = calculateGoalProgress(goal);
  const contributions = [...goal.contributions].sort((a, b) => b.date.localeCompare(a.date));
  showModal({
    title: `Historique — ${goal.name}`,
    size: 'md',
    content: html`<div class="modal-body">
        <div class="goal-mini">
          <span class="cat-icon" style="--cat-color:${goal.color}">${icon(goal.icon)}</span>
          <div class="goal-mini-text">
            <p><strong>${formatCurrency(progress.current)}</strong> sur ${formatCurrency(progress.target)} (${formatPercent(progress.percent, { decimals: 0 })})</p>
            <p class="small text-muted">${describeTimeLeft(progress.daysLeft)}${goal.targetDate ? ` · date cible : ${formatDate(goal.targetDate)}` : ''}</p>
          </div>
        </div>
        ${progressBar(progress.percent, progress.status === 'reached' ? 'reached' : 'normal', `Progression de ${goal.name}`)}
        <ul class="history-list mt-2">
          ${contributions.map((contribution) => html`<li class="history-item">
            <div>
              <p class="history-title">${formatCurrency(contribution.amount)}${contribution.transactionId ? html` <span class="badge badge-info">${icon('fa-right-left')}Transfert</span>` : ''}</p>
              <p class="small text-muted">${formatDate(contribution.date)}${contribution.note ? ` · ${contribution.note}` : ''}</p>
            </div>
            <button type="button" class="icon-btn" data-action="delete-contribution" data-goal="${goal.id}" data-id="${contribution.id}" aria-label="Supprimer la contribution du ${formatDate(contribution.date)}" title="Supprimer">${icon('fa-trash')}</button>
          </li>`)}
          <li class="history-item history-initial">
            <div>
              <p class="history-title">${formatCurrency(goal.initialAmount)}</p>
              <p class="small text-muted">Montant initial · ${formatDate(goal.createdAt.slice(0, 10))}</p>
            </div>
          </li>
        </ul>
        ${contributions.length ? '' : html`<p class="small text-muted mt-2">Aucune contribution pour le moment.</p>`}
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" data-modal-close>Fermer</button>
        <button type="button" class="btn btn-primary" data-action="contribute-goal" data-id="${goal.id}" data-modal-close>${icon('fa-plus')}<span>Ajouter un montant</span></button>
      </div>`,
  });
}

async function deleteContribution(goalId, contributionId, element) {
  const goal = appData.goals.find((item) => item.id === goalId);
  const contribution = goal && goal.contributions.find((item) => item.id === contributionId);
  if (!contribution) return;
  const linked = contribution.transactionId ? appData.transactions.find((t) => t.id === contribution.transactionId) : null;
  const { confirmed, checked } = await confirmDialog({
    title: 'Supprimer la contribution',
    message: html`Supprimer la contribution de <strong>${formatCurrency(contribution.amount)}</strong> du ${formatDate(contribution.date)} ?`,
    checkboxLabel: linked ? 'Supprimer aussi le transfert associé' : '',
    checkboxChecked: true,
    confirmLabel: 'Supprimer',
  });
  if (!confirmed) return;
  goal.contributions = goal.contributions.filter((item) => item.id !== contributionId);
  if (linked && checked) removeTransactions(new Set([linked.id]));
  const historyModal = element ? findModalOf(element) : null;
  if (historyModal) closeModal(historyModal, { silent: true });
  persist('Contribution supprimée.');
  openGoalHistory(goalId);
}

async function deleteGoal(id) {
  const goal = appData.goals.find((item) => item.id === id);
  if (!goal) return;
  const { confirmed } = await confirmDialog({
    title: "Supprimer l'objectif",
    message: html`Supprimer l'objectif « <strong>${goal.name}</strong> » et son historique ?`,
    details: 'Les transferts déjà enregistrés sont conservés dans les transactions.',
    confirmLabel: 'Supprimer',
  });
  if (!confirmed) return;
  appData.goals = appData.goals.filter((item) => item.id !== id);
  persist('Objectif supprimé.');
}

/* ==========================================================================
   ÉCHÉANCES
   ========================================================================== */

function openBillForm({ bill = null } = {}) {
  const isEdit = Boolean(bill);
  const formId = 'bill-form';
  const values = bill || { name: '', amount: '', dueDate: todayStr(), categoryId: '', accountId: appData.accounts[0] ? appData.accounts[0].id : '', recurrence: 'monthly', notes: '' };

  const body = html`
    ${formField({ formId, name: 'name', label: 'Nom', value: values.name, required: true, placeholder: 'Ex. : Loyer, Internet, Assurance…', attrs: { maxlength: 60 } })}
    <div class="form-grid">
      ${formField({ formId, name: 'amount', label: 'Montant', type: 'amount', value: values.amount === '' ? '' : amountInputValue(values.amount), required: true })}
      ${formField({ formId, name: 'dueDate', label: "Date d'échéance", type: 'date', value: values.dueDate, required: true })}
      ${formField({ formId, name: 'recurrence', label: 'Récurrence', type: 'select', value: values.recurrence, options: mapToOptions(BILL_RECURRENCES) })}
      ${formField({ formId, name: 'categoryId', label: 'Catégorie', type: 'select', value: values.categoryId || '', options: categoryOptions('expense', { placeholder: 'Aucune catégorie' }) })}
      ${formField({ formId, name: 'accountId', label: 'Compte de paiement', type: 'select', value: values.accountId || '', options: accountOptions({ emptyLabel: 'Aucun compte' }) })}
    </div>
    ${formField({ formId, name: 'notes', label: 'Notes', type: 'textarea', value: values.notes, rows: 2, attrs: { maxlength: 500 } })}`;

  const modal = showModal({
    title: isEdit ? "Modifier l'échéance" : 'Nouvelle échéance',
    content: modalForm(formId, body, modalFooterButtons(isEdit ? 'Enregistrer' : "Créer l'échéance")),
    initialFocus: `#${formId}-name`,
  });
  const form = modal.element.querySelector('form');
  bindFormErrorClearing(form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formValues = getFormValues(form);
    const errors = {};
    const name = cleanString(formValues.name, 60);
    if (!name) errors.name = 'Le nom est obligatoire.';
    const amount = validateAmountInput(formValues.amount);
    if (amount.error) errors.amount = amount.error;
    if (!isValidDateStr(formValues.dueDate)) errors.dueDate = "Saisissez une date d'échéance valide.";
    if (!BILL_RECURRENCES[formValues.recurrence]) errors.recurrence = 'Récurrence invalide.';
    if (formValues.categoryId && !getCategory(formValues.categoryId)) errors.categoryId = 'Catégorie invalide.';
    if (formValues.accountId && !getAccount(formValues.accountId)) errors.accountId = 'Compte invalide.';
    if (showFormErrors(form, errors)) return;

    const fields = {
      name,
      amount: amount.value,
      dueDate: formValues.dueDate,
      anchorDay: Number(formValues.dueDate.slice(8, 10)),
      recurrence: formValues.recurrence,
      categoryId: formValues.categoryId || null,
      accountId: formValues.accountId || null,
      notes: cleanString(formValues.notes, 500),
    };
    if (isEdit) {
      const saved = appData.bills.find((item) => item.id === bill.id);
      if (saved) Object.assign(saved, normalizeBill({ ...saved, ...fields }));
    } else {
      appData.bills.push(normalizeBill({ id: uid('bill'), ...fields, status: 'pending', history: [], createdAt: new Date().toISOString() }));
    }
    closeModal(modal, { silent: true });
    persist(isEdit ? 'Échéance modifiée.' : `Échéance « ${name} » créée.`);
  });
}

/** Marquer une échéance comme payée, avec création optionnelle de la transaction. */
function openPayBillForm(billId) {
  const bill = appData.bills.find((item) => item.id === billId);
  if (!bill) return;
  const formId = 'pay-bill-form';
  const hasAccounts = appData.accounts.length > 0;
  const nextDue = bill.recurrence !== 'none' ? addFrequency(bill.dueDate, bill.recurrence, bill.anchorDay) : null;

  const body = html`
    <div class="info-box info-box-neutral">
      ${icon('fa-file-invoice-dollar')}
      <div>
        <p><strong>${bill.name}</strong> · échéance du ${formatDate(bill.dueDate)}</p>
        <p class="small text-muted">${BILL_RECURRENCES[bill.recurrence]}${nextDue ? ` · prochaine échéance programmée au ${formatDate(nextDue)}` : ''}</p>
      </div>
    </div>
    <div class="form-grid mt-2">
      ${formField({ formId, name: 'amount', label: 'Montant payé', type: 'amount', value: amountInputValue(bill.amount), required: true })}
      ${formField({ formId, name: 'paidDate', label: 'Date de paiement', type: 'date', value: todayStr(), required: true })}
    </div>
    <div class="recurring-box">
      <label class="checkbox"><input type="checkbox" name="createTransaction" ${hasAccounts ? raw('checked') : raw('disabled')} data-toggle-target="#${formId}-account-field"><span>Créer automatiquement la transaction de dépense correspondante</span></label>
      ${hasAccounts ? '' : html`<p class="field-hint">Créez un compte pour pouvoir enregistrer la transaction.</p>`}
      <div id="${formId}-account-field" class="mt-2">
        ${formField({ formId, name: 'accountId', label: 'Compte débité', type: 'select', value: getAccount(bill.accountId) ? bill.accountId : hasAccounts ? appData.accounts[0].id : '', options: accountOptions() })}
      </div>
    </div>`;

  const modal = showModal({
    title: 'Marquer comme payé',
    size: 'sm',
    content: modalForm(formId, body, modalFooterButtons('Confirmer le paiement')),
    initialFocus: `#${formId}-amount`,
  });
  const form = modal.element.querySelector('form');
  bindFormErrorClearing(form);
  bindToggleTargets(form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formValues = getFormValues(form);
    const errors = {};
    const amount = validateAmountInput(formValues.amount);
    if (amount.error) errors.amount = amount.error;
    if (!isValidDateStr(formValues.paidDate)) errors.paidDate = 'Saisissez une date valide.';
    if (formValues.createTransaction && !getAccount(formValues.accountId)) errors.accountId = 'Choisissez le compte débité.';
    if (showFormErrors(form, errors)) return;

    let transactionId = null;
    if (formValues.createTransaction) {
      const now = new Date().toISOString();
      const category = getCategory(bill.categoryId);
      const transaction = normalizeTransaction({
        id: uid('tx'), type: 'expense', amount: amount.value, date: formValues.paidDate, description: bill.name,
        categoryId: category && category.type === 'expense' ? category.id : null, accountId: formValues.accountId,
        paymentMethod: 'direct_debit', billId: bill.id, notes: `Paiement de l'échéance du ${formatDate(bill.dueDate)}.`,
        createdAt: now, updatedAt: now,
      });
      appData.transactions.push(transaction);
      transactionId = transaction.id;
    }
    bill.history.push({ id: uid('pay'), dueDate: bill.dueDate, paidDate: formValues.paidDate, amount: amount.value, transactionId });
    if (bill.recurrence === 'none') {
      bill.status = 'paid';
    } else {
      bill.dueDate = nextDue;
      bill.status = 'pending';
    }
    closeModal(modal, { silent: true });
    persist(`Échéance « ${bill.name} » marquée comme payée${transactionId ? ' et transaction créée' : ''}.`);
  });
}

/** Remet à payer une échéance ponctuelle déjà payée. */
async function unpayBill(billId) {
  const bill = appData.bills.find((item) => item.id === billId);
  if (!bill || bill.status !== 'paid') return;
  const lastPayment = bill.history[bill.history.length - 1];
  const linked = lastPayment && lastPayment.transactionId ? appData.transactions.find((t) => t.id === lastPayment.transactionId) : null;
  const { confirmed, checked } = await confirmDialog({
    title: 'Annuler le paiement',
    message: html`Remettre « <strong>${bill.name}</strong> » à payer ?`,
    checkboxLabel: linked ? `Supprimer aussi la transaction associée (${formatCurrency(linked.amount)} le ${formatDate(linked.date)})` : '',
    checkboxChecked: true,
    confirmLabel: 'Remettre à payer',
    variant: 'primary',
  });
  if (!confirmed) return;
  if (linked && checked) removeTransactions(new Set([linked.id]));
  bill.history.pop();
  bill.status = 'pending';
  persist('Échéance remise à payer.');
}

/** Détail d'une échéance avec l'historique des paiements. */
function openBillDetails(billId) {
  const bill = appData.bills.find((item) => item.id === billId);
  if (!bill) return;
  const status = BILL_STATUSES[getBillStatus(bill)];
  const history = [...bill.history].sort((a, b) => b.paidDate.localeCompare(a.paidDate));
  showModal({
    title: bill.name,
    size: 'md',
    content: html`<div class="modal-body">
        <dl class="detail-list">
          <div><dt>Montant</dt><dd><strong>${formatCurrency(bill.amount)}</strong></dd></div>
          <div><dt>Statut</dt><dd>${badge(status.label, status.badge, status.icon)}</dd></div>
          <div><dt>${bill.status === 'paid' ? 'Échéance' : 'Prochaine échéance'}</dt><dd>${formatDate(bill.dueDate)}${bill.status === 'paid' ? '' : ` (${relativeDayLabel(bill.dueDate).toLowerCase()})`}</dd></div>
          <div><dt>Récurrence</dt><dd>${BILL_RECURRENCES[bill.recurrence]}</dd></div>
          <div><dt>Catégorie</dt><dd>${categoryChip(bill.categoryId)}</dd></div>
          <div><dt>Compte</dt><dd>${bill.accountId ? getAccountName(bill.accountId) : 'Aucun compte'}</dd></div>
          <div class="detail-full"><dt>Notes</dt><dd class="pre-wrap">${bill.notes || html`<span class="text-muted">Aucune note</span>`}</dd></div>
        </dl>
        <h3 class="section-title mt-3">Historique des paiements</h3>
        ${history.length ? html`<ul class="history-list">
          ${history.map((payment) => html`<li class="history-item">
            <div>
              <p class="history-title">${formatCurrency(payment.amount)}</p>
              <p class="small text-muted">Payé le ${formatDate(payment.paidDate)} · échéance du ${formatDate(payment.dueDate)}${payment.transactionId ? ' · transaction créée' : ''}</p>
            </div>
            ${payment.transactionId && appData.transactions.some((t) => t.id === payment.transactionId) ? html`<button type="button" class="icon-btn" data-action="view-transaction" data-id="${payment.transactionId}" data-modal-close aria-label="Voir la transaction du ${formatDate(payment.paidDate)}" title="Voir la transaction">${icon('fa-eye')}</button>` : ''}
          </li>`)}
        </ul>` : html`<p class="small text-muted">Aucun paiement enregistré.</p>`}
      </div>
      <div class="modal-footer modal-footer-split">
        <button type="button" class="btn btn-danger-ghost" data-action="delete-bill" data-id="${bill.id}" data-modal-close>${icon('fa-trash')}<span>Supprimer</span></button>
        <div class="modal-footer-group">
          <button type="button" class="btn btn-secondary" data-action="edit-bill" data-id="${bill.id}" data-modal-close>${icon('fa-pen')}<span>Modifier</span></button>
          ${bill.status === 'paid'
            ? html`<button type="button" class="btn btn-secondary" data-action="unpay-bill" data-id="${bill.id}" data-modal-close>${icon('fa-rotate-left')}<span>Remettre à payer</span></button>`
            : html`<button type="button" class="btn btn-primary" data-action="pay-bill" data-id="${bill.id}" data-modal-close>${icon('fa-check')}<span>Marquer comme payé</span></button>`}
        </div>
      </div>`,
  });
}

async function deleteBill(id) {
  const bill = appData.bills.find((item) => item.id === id);
  if (!bill) return;
  const { confirmed } = await confirmDialog({
    title: "Supprimer l'échéance",
    message: html`Supprimer l'échéance « <strong>${bill.name}</strong> » ?`,
    details: 'Les transactions déjà créées pour cette échéance sont conservées.',
    confirmLabel: 'Supprimer',
  });
  if (!confirmed) return;
  appData.bills = appData.bills.filter((item) => item.id !== id);
  appData.transactions.forEach((transaction) => {
    if (transaction.billId === id) transaction.billId = null;
  });
  persist('Échéance supprimée.');
}

/* ==========================================================================
   TRANSACTIONS RÉCURRENTES
   ========================================================================== */

function openRecurringForm({ rule = null } = {}) {
  if (!requireAccounts()) return;
  const isEdit = Boolean(rule);
  const formId = 'recurring-form';
  const values = rule || {
    description: '', type: 'expense', amount: '', categoryId: '', accountId: appData.accounts[0].id, toAccountId: '',
    paymentMethod: 'direct_debit', frequency: 'monthly', startDate: todayStr(), endDate: '', active: true, notes: '', tags: [],
  };

  const body = html`
    ${typeSegmentedHtml(formId, values.type)}
    ${formField({ formId, name: 'description', label: 'Nom', value: values.description, required: true, placeholder: 'Ex. : Salaire, Loyer, Netflix…', attrs: { maxlength: 120 } })}
    <div class="form-grid">
      ${formField({ formId, name: 'amount', label: 'Montant', type: 'amount', value: values.amount === '' ? '' : amountInputValue(values.amount), required: true })}
      ${formField({ formId, name: 'frequency', label: 'Fréquence', type: 'select', value: values.frequency, required: true, options: mapToOptions(FREQUENCIES) })}
      ${formField({ formId, name: 'startDate', label: 'Première occurrence', type: 'date', value: values.startDate, required: true })}
      ${formField({ formId, name: 'endDate', label: 'Date de fin', type: 'date', value: values.endDate, hint: 'Facultative.' })}
      ${categorySelectHtml(formId, values.type, values.categoryId)}
      <div class="field">
        <label class="field-label" for="${formId}-accountId"><span data-account-label>Compte</span><span class="required" aria-hidden="true"> *</span></label>
        <select class="input" id="${formId}-accountId" name="accountId" aria-describedby="${formId}-accountId-error" aria-required="true">
          ${accountOptions().map((option) => html`<option value="${option.value}" ${option.value === values.accountId ? raw('selected') : ''}>${option.label}</option>`)}
        </select>
        <p class="field-error" id="${formId}-accountId-error" data-error-for="accountId"></p>
      </div>
      <div data-show-for="transfer">
        ${formField({ formId, name: 'toAccountId', label: 'Compte destination', type: 'select', value: values.toAccountId || '', required: true, options: accountOptions({ placeholder: 'Choisir le compte de destination' }) })}
      </div>
      ${formField({ formId, name: 'paymentMethod', label: 'Mode de paiement', type: 'select', value: values.paymentMethod, options: mapToOptions(PAYMENT_METHODS) })}
    </div>
    ${formField({ formId, name: 'tags', label: 'Tags', value: values.tags.join(', '), hint: 'Séparés par des virgules.' })}
    ${formField({ formId, name: 'notes', label: 'Notes', type: 'textarea', value: values.notes, rows: 2, attrs: { maxlength: 1000 } })}
    <label class="checkbox"><input type="checkbox" name="active" ${values.active ? raw('checked') : ''}><span>Récurrence active</span></label>
    <div class="info-box info-box-neutral mt-2" aria-live="polite">
      ${icon('fa-calendar-days')}
      <div><p class="small" data-occurrence-preview></p></div>
    </div>`;

  const modal = showModal({
    title: isEdit ? 'Modifier la transaction récurrente' : 'Nouvelle transaction récurrente',
    size: 'lg',
    content: modalForm(formId, body, modalFooterButtons(isEdit ? 'Enregistrer' : 'Créer la récurrence')),
    initialFocus: `#${formId}-description`,
  });
  const form = modal.element.querySelector('form');
  bindFormErrorClearing(form);
  bindTypeSwitching(form);

  // Aperçu des prochaines occurrences.
  const preview = form.querySelector('[data-occurrence-preview]');
  const updatePreview = () => {
    const formValues = getFormValues(form);
    if (!isValidDateStr(formValues.startDate) || !FREQUENCIES[formValues.frequency]) {
      preview.textContent = 'Renseignez la première occurrence et la fréquence pour voir les prochaines dates.';
      return;
    }
    const draft = { startDate: formValues.startDate, frequency: formValues.frequency, endDate: isValidDateStr(formValues.endDate) ? formValues.endDate : '' };
    const today = todayStr();
    const lastDate = isEdit && rule.lastDate && rule.startDate === draft.startDate ? rule.lastDate : null;
    const next = computeNextDate(draft, lastDate || addDays(today, -1));
    if (!next) {
      preview.textContent = 'Aucune occurrence à venir (date de fin dépassée).';
      return;
    }
    const upcoming = getRuleOccurrences({ ...draft, active: true, nextDate: next }, next, addMonths(next, 60), 4);
    let text = `Prochaines occurrences : ${upcoming.map((date) => formatDate(date)).join(', ')}.`;
    if (!isEdit && formValues.startDate < today) text += ` Les occurrences passées depuis le ${formatDate(formValues.startDate)} seront générées automatiquement.`;
    preview.textContent = text;
  };
  form.addEventListener('input', updatePreview);
  form.addEventListener('change', updatePreview);
  updatePreview();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formValues = getFormValues(form);
    const errors = {};
    if (!TRANSACTION_TYPES[formValues.type]) errors.type = 'Choisissez un type.';
    const description = cleanString(formValues.description, 120);
    if (!description) errors.description = 'Le nom est obligatoire.';
    const amount = validateAmountInput(formValues.amount);
    if (amount.error) errors.amount = amount.error;
    if (!FREQUENCIES[formValues.frequency]) errors.frequency = 'Choisissez une fréquence.';
    if (!isValidDateStr(formValues.startDate)) errors.startDate = 'Saisissez une date valide.';
    if (formValues.endDate) {
      if (!isValidDateStr(formValues.endDate)) errors.endDate = 'Saisissez une date valide.';
      else if (isValidDateStr(formValues.startDate) && formValues.endDate < formValues.startDate) errors.endDate = 'La date de fin doit suivre la première occurrence.';
    }
    if (formValues.type !== 'transfer') {
      const category = getCategory(formValues.categoryId);
      if (!category) errors.categoryId = 'Choisissez une catégorie.';
      else if (category.type !== formValues.type) errors.categoryId = 'Cette catégorie ne correspond pas au type choisi.';
    }
    if (!getAccount(formValues.accountId)) errors.accountId = 'Choisissez un compte valide.';
    if (formValues.type === 'transfer') {
      if (!getAccount(formValues.toAccountId)) errors.toAccountId = 'Choisissez le compte de destination.';
      else if (formValues.toAccountId === formValues.accountId) errors.toAccountId = 'Le compte de destination doit être différent du compte source.';
    }
    if (showFormErrors(form, errors)) return;

    const fields = {
      description,
      type: formValues.type,
      amount: amount.value,
      categoryId: formValues.type === 'transfer' ? null : formValues.categoryId,
      accountId: formValues.accountId,
      toAccountId: formValues.type === 'transfer' ? formValues.toAccountId : null,
      paymentMethod: formValues.paymentMethod,
      frequency: formValues.frequency,
      startDate: formValues.startDate,
      endDate: formValues.endDate || '',
      active: Boolean(formValues.active),
      notes: cleanString(formValues.notes, 1000),
      tags: normalizeTags(formValues.tags),
    };

    let saved;
    if (isEdit) {
      saved = appData.recurringTransactions.find((item) => item.id === rule.id);
      if (!saved) return;
      const wasActive = saved.active;
      const scheduleChanged = saved.startDate !== fields.startDate || saved.frequency !== fields.frequency;
      Object.assign(saved, normalizeRecurring({ ...saved, ...fields, nextDate: saved.nextDate }));
      if (scheduleChanged && saved.lastDate && saved.lastDate < fields.startDate) saved.lastDate = null;
      saved.nextDate = computeNextDate(saved, saved.lastDate);
      // Une reprise après suspension ne rattrape pas les occurrences de la pause.
      if (!wasActive && saved.active && saved.nextDate && saved.nextDate < todayStr()) {
        saved.nextDate = computeNextDate(saved, maxDate(saved.lastDate || '', addDays(todayStr(), -1)));
      }
    } else {
      saved = normalizeRecurring({ id: uid('rec'), ...fields, lastDate: null, createdAt: new Date().toISOString() });
      saved.nextDate = computeNextDate(saved, null);
      appData.recurringTransactions.push(saved);
    }
    const generated = generateRecurringTransactions({ save: false });
    closeModal(modal, { silent: true });
    let message = isEdit ? 'Transaction récurrente modifiée.' : 'Transaction récurrente créée.';
    if (generated) message += ` ${pluralize(generated, 'occurrence générée', 'occurrences générées')}.`;
    persist(message);
  });
}

/** Suspend ou réactive une récurrence. */
function toggleRecurring(id) {
  const rule = appData.recurringTransactions.find((item) => item.id === id);
  if (!rule) return;
  rule.active = !rule.active;
  let generated = 0;
  if (rule.active) {
    // Reprise : les occurrences manquées pendant la pause ne sont pas rattrapées.
    if (rule.nextDate && rule.nextDate < todayStr()) {
      rule.nextDate = computeNextDate(rule, maxDate(rule.lastDate || '', addDays(todayStr(), -1)));
    }
    generated = generateRecurringTransactions({ save: false });
  }
  persist(rule.active ? `Récurrence « ${rule.description} » réactivée${generated ? ` (${pluralize(generated, 'occurrence générée', 'occurrences générées')})` : ''}.` : `Récurrence « ${rule.description} » suspendue.`, 'info');
}

async function deleteRecurring(id) {
  const rule = appData.recurringTransactions.find((item) => item.id === id);
  if (!rule) return;
  const generatedIds = appData.transactions.filter((t) => t.recurringId === id).map((t) => t.id);
  const { confirmed, checked } = await confirmDialog({
    title: 'Supprimer la récurrence',
    message: html`Supprimer la transaction récurrente « <strong>${rule.description}</strong> » ? Aucune nouvelle occurrence ne sera créée.`,
    checkboxLabel: generatedIds.length ? `Supprimer aussi ${pluralize(generatedIds.length, 'la transaction déjà générée', 'les transactions déjà générées')} (${generatedIds.length})` : '',
    checkboxChecked: false,
    confirmLabel: 'Supprimer',
  });
  if (!confirmed) return;
  if (checked) removeTransactions(new Set(generatedIds));
  appData.transactions.forEach((transaction) => {
    if (transaction.recurringId === id) transaction.recurringId = null;
  });
  appData.recurringTransactions = appData.recurringTransactions.filter((item) => item.id !== id);
  persist('Transaction récurrente supprimée.');
}

/* ==========================================================================
   Actions déclenchées depuis l'interface (data-action)
   ========================================================================== */

registerActions({
  'new-transaction': (element) => openTransactionForm({
    defaults: {
      type: element.dataset.type || undefined,
      accountId: element.dataset.accountId || undefined,
      categoryId: element.dataset.categoryId || undefined,
      date: element.dataset.date || undefined,
    },
  }),
  'new-transfer': (element) => openTransactionForm({ defaults: { type: 'transfer', accountId: element.dataset.accountId || undefined } }),
  'view-transaction': (element) => openTransactionDetails(element.dataset.id),
  'edit-transaction': (element) => {
    const transaction = appData.transactions.find((item) => item.id === element.dataset.id);
    if (transaction) openTransactionForm({ mode: 'edit', transaction });
  },
  'duplicate-transaction': (element) => {
    const transaction = appData.transactions.find((item) => item.id === element.dataset.id);
    if (transaction) openTransactionForm({ mode: 'duplicate', transaction });
  },
  'delete-transaction': (element) => deleteTransaction(element.dataset.id),
  'validate-transaction': (element) => validatePendingTransaction(element.dataset.id),

  'new-account': () => openAccountForm(),
  'edit-account': (element) => {
    const account = getAccount(element.dataset.id);
    if (account) openAccountForm({ account });
  },
  'delete-account': (element) => openDeleteAccountDialog(element.dataset.id),

  'new-category': (element) => openCategoryForm({ defaults: { type: element.dataset.type || viewState.categories.tab } }),
  'edit-category': (element) => {
    const category = getCategory(element.dataset.id);
    if (category) openCategoryForm({ category });
  },
  'delete-category': (element) => openDeleteCategoryDialog(element.dataset.id),

  'new-budget': (element) => openBudgetForm({ defaults: { categoryId: element.dataset.categoryId || undefined } }),
  'edit-budget': (element) => {
    const budget = appData.budgets.find((item) => item.id === element.dataset.id);
    if (budget) openBudgetForm({ budget });
  },
  'delete-budget': (element) => deleteBudget(element.dataset.id),

  'new-goal': () => openGoalForm(),
  'edit-goal': (element) => {
    const goal = appData.goals.find((item) => item.id === element.dataset.id);
    if (goal) openGoalForm({ goal });
  },
  'delete-goal': (element) => deleteGoal(element.dataset.id),
  'contribute-goal': (element) => openContributionForm(element.dataset.id),
  'goal-history': (element) => openGoalHistory(element.dataset.id),
  'delete-contribution': (element) => deleteContribution(element.dataset.goal, element.dataset.id, element),

  'new-bill': () => openBillForm(),
  'edit-bill': (element) => {
    const bill = appData.bills.find((item) => item.id === element.dataset.id);
    if (bill) openBillForm({ bill });
  },
  'delete-bill': (element) => deleteBill(element.dataset.id),
  'pay-bill': (element) => openPayBillForm(element.dataset.id),
  'unpay-bill': (element) => unpayBill(element.dataset.id),
  'view-bill': (element) => openBillDetails(element.dataset.id),

  'new-recurring': () => openRecurringForm(),
  'edit-recurring': (element) => {
    const rule = appData.recurringTransactions.find((item) => item.id === element.dataset.id);
    if (rule) openRecurringForm({ rule });
  },
  'toggle-recurring': (element) => toggleRecurring(element.dataset.id),
  'delete-recurring': (element) => deleteRecurring(element.dataset.id),
  'generate-recurring': () => {
    const generated = generateRecurringTransactions({ save: false });
    if (generated) persist(`${pluralize(generated, 'transaction récurrente générée', 'transactions récurrentes générées')}.`);
    else showToast("Aucune transaction récurrente n'est arrivée à échéance : tout est à jour.", 'info');
  },
});
