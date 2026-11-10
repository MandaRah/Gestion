/* ==========================================================================
   importexport.js — Export JSON / CSV, import JSON, réinitialisation
   ========================================================================== */
'use strict';

/** Exporte toutes les données au format JSON (fichier téléchargé). */
function exportJSON() {
  const payload = { ...deepClone(appData), app: APP_NAME, exportedAt: new Date().toISOString() };
  downloadFile(`gestion-financiere-${todayStr()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  showToast('Données exportées au format JSON.');
}

/**
 * Échappe une cellule CSV. Les textes commençant par = + - @ sont
 * neutralisés pour éviter l'exécution de formules dans un tableur.
 */
function csvCell(value, separator, { isNumber = false } = {}) {
  let text = String(value ?? '');
  if (!isNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  const mustQuote = text.includes(separator) || /["\n\r]/.test(text);
  return mustQuote ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Exporte des transactions au format CSV (compatible Excel : BOM UTF-8,
 * séparateur « ; » si la virgule est le séparateur décimal).
 */
function exportCSV(transactions = appData.transactions, filenameSuffix = '') {
  if (!transactions.length) {
    showToast('Aucune transaction à exporter.', 'warning');
    return;
  }
  const decimal = getDecimalSeparator();
  const separator = decimal === ',' ? ';' : ',';
  const number = (value) => roundMoney(value).toFixed(2).replace('.', decimal);
  const headers = ['Date', 'Type', 'Description', 'Catégorie', 'Compte', 'Compte destination', 'Mode de paiement', 'Montant', 'Montant signé', 'Devise', 'Statut', 'Tags', 'Notes'];
  const rows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((transaction) => {
      const signed = transaction.type === 'income' ? number(transaction.amount) : transaction.type === 'expense' ? number(-transaction.amount) : '';
      return [
        csvCell(transaction.date, separator),
        csvCell(TRANSACTION_TYPES[transaction.type].label, separator),
        csvCell(transaction.description, separator),
        csvCell(transaction.type === 'transfer' ? '' : getCategoryName(transaction.categoryId), separator),
        csvCell(getAccountName(transaction.accountId), separator),
        csvCell(transaction.type === 'transfer' ? getAccountName(transaction.toAccountId) : '', separator),
        csvCell(PAYMENT_METHODS[transaction.paymentMethod], separator),
        csvCell(number(transaction.amount), separator, { isNumber: true }),
        csvCell(signed, separator, { isNumber: true }),
        csvCell(getAccountCurrency(transaction.accountId), separator),
        csvCell(TRANSACTION_STATUSES[transaction.status].label, separator),
        csvCell(transaction.tags.join(', '), separator),
        csvCell(transaction.notes, separator),
      ].join(separator);
    });
  const content = `﻿${[headers.map((header) => csvCell(header, separator)).join(separator), ...rows].join('\r\n')}`;
  downloadFile(`transactions${filenameSuffix}-${todayStr()}.csv`, content, 'text/csv;charset=utf-8');
  showToast(`${pluralize(transactions.length, 'transaction exportée', 'transactions exportées')} au format CSV.`);
}

/** Fenêtre de choix du format d'export. */
function openExportModal() {
  showModal({
    title: 'Exporter les données',
    size: 'sm',
    content: html`<div class="modal-body">
      <p class="text-muted mb-2">Choisissez le format d'export :</p>
      <div class="export-options">
        <button type="button" class="export-option" data-action="export-json" data-modal-close>
          <span class="export-icon" aria-hidden="true">${icon('fa-file-code')}</span>
          <span><strong>Sauvegarde complète (JSON)</strong><span class="export-desc">Toutes les données et paramètres, réimportables dans l'application.</span></span>
        </button>
        <button type="button" class="export-option" data-action="export-csv" data-modal-close>
          <span class="export-icon" aria-hidden="true">${icon('fa-file-csv')}</span>
          <span><strong>Transactions (CSV)</strong><span class="export-desc">Pour Excel, LibreOffice Calc ou Google Sheets.</span></span>
        </button>
      </div>
    </div>`,
  });
}

/** Ouvre le sélecteur de fichier pour l'import. */
function triggerImport() {
  const input = document.getElementById('import-file-input');
  if (!input) return;
  input.value = '';
  input.click();
}

function showImportErrors(errors) {
  showModal({
    title: 'Import impossible',
    size: 'sm',
    content: html`<div class="modal-body">
        <div class="confirm-message confirm-danger">
          <span class="confirm-icon" aria-hidden="true">${icon('fa-file-circle-xmark')}</span>
          <div>
            <p>Le fichier sélectionné n'est pas une sauvegarde valide de l'application. Vos données actuelles n'ont pas été modifiées.</p>
            <ul class="error-list">${errors.map((error) => html`<li>${error}</li>`)}</ul>
          </div>
        </div>
      </div>
      <div class="modal-footer"><button type="button" class="btn btn-primary" data-modal-close>Compris</button></div>`,
  });
  showToast("Erreur : le fichier d'import est invalide.", 'error');
}

/**
 * Importe un fichier JSON : lecture, vérification de la structure,
 * confirmation, puis remplacement des données actuelles.
 */
function importJSON(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    showToast('Le fichier est trop volumineux (20 Mo maximum).', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => showToast('Impossible de lire le fichier sélectionné.', 'error');
  reader.onload = async () => {
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result).replace(/^﻿/, ''));
    } catch (error) {
      showImportErrors(["Le contenu du fichier n'est pas du JSON valide."]);
      return;
    }
    const result = validateImportedData(parsed);
    if (!result.valid) {
      showImportErrors(result.errors);
      return;
    }
    const exportedAt = parsed.exportedAt ? formatDateTime(parsed.exportedAt) : '';
    const { confirmed } = await confirmDialog({
      title: 'Importer les données',
      message: html`Le fichier contient ${pluralize(parsed.transactions.length, 'transaction', 'transactions')}, ${pluralize(parsed.accounts.length, 'compte', 'comptes')}, ${pluralize(parsed.budgets.length, 'budget', 'budgets')}, ${pluralize(parsed.goals.length, 'objectif', 'objectifs')} et ${pluralize(parsed.bills.length, 'échéance', 'échéances')}. <strong>Les données actuelles seront remplacées.</strong>`,
      details: [exportedAt && exportedAt !== '—' ? `Sauvegarde du ${exportedAt}.` : '', ...result.warnings].filter(Boolean).join(' '),
      confirmLabel: 'Remplacer mes données',
      variant: 'danger',
    });
    if (!confirmed) {
      showToast('Import annulé : aucune donnée modifiée.', 'info');
      return;
    }
    appData = normalizeData(parsed);
    generateRecurringTransactions({ save: false });
    saveData();
    resetViewFilters();
    applyTheme(appData.settings.theme);
    refreshUI();
    showToast(`Import réussi : ${pluralize(appData.transactions.length, 'transaction restaurée', 'transactions restaurées')}.`);
  };
  reader.readAsText(file);
}

/** Supprime toutes les données (avec confirmation). */
async function resetData() {
  const { confirmed, checked } = await confirmDialog({
    title: 'Réinitialiser les données',
    message: 'Toutes vos transactions, comptes, budgets, objectifs, échéances, récurrences et catégories personnalisées seront définitivement supprimés.',
    details: "Conseil : exportez d'abord vos données au format JSON pour pouvoir les restaurer.",
    confirmLabel: 'Tout supprimer',
    checkboxLabel: 'Conserver mes paramètres (nom, devise, thème, seuils…)',
    checkboxChecked: true,
  });
  if (!confirmed) return;
  appData = createEmptyData(checked ? appData.settings : { theme: detectPreferredTheme() });
  appData.meta.demoPromptAnswered = true; // La démo n'est jamais reproposée automatiquement.
  saveData();
  resetViewFilters();
  applyTheme(appData.settings.theme);
  refreshUI();
  showToast('Toutes les données ont été réinitialisées.');
}

/** Remplace les données par la démo, sur demande explicite (paramètres). */
async function confirmLoadDemo() {
  const { confirmed } = await confirmDialog({
    title: 'Charger les données de démonstration',
    message: 'Les données actuelles seront remplacées par un jeu de données de démonstration.',
    details: 'Vos paramètres sont conservés. Exportez vos données avant si vous souhaitez les garder.',
    confirmLabel: 'Charger la démo',
    variant: 'primary',
  });
  if (!confirmed) return;
  const settings = { ...appData.settings };
  loadDemoData({ currency: settings.currency, userName: settings.userName, theme: settings.theme });
  appData.settings = normalizeSettings(settings);
  saveData();
  resetViewFilters();
  refreshUI();
  showToast('Données de démonstration chargées.');
}

function bindImportInput() {
  const input = document.getElementById('import-file-input');
  if (!input) return;
  input.addEventListener('change', () => {
    const [file] = input.files;
    importJSON(file);
  });
}

registerActions({
  'export-data': () => openExportModal(),
  'export-json': () => exportJSON(),
  'export-csv': () => exportCSV(),
  'import-data': () => triggerImport(),
  'reset-data': () => resetData(),
  'load-demo': () => confirmLoadDemo(),
});
