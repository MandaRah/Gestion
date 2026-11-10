# Gestion financière

Application web de gestion financière personnelle : comptes, transactions, budgets, objectifs, échéances, rapports et prévisions.
Développée en HTML5, CSS3 et JavaScript vanilla, sans framework ni serveur : les données sont enregistrées dans le navigateur (`localStorage`).

## Lancer l'application

1. Téléchargez ou clonez le dépôt.
2. Ouvrez `index.html` dans un navigateur récent (Chrome, Edge, Firefox ou Safari).

Aucune installation n'est nécessaire. Une connexion Internet permet de charger Chart.js (graphiques), Font Awesome (icônes) et la police Inter depuis des CDN ; hors connexion, l'application fonctionne et les graphiques sont remplacés par un message.

Au premier lancement, l'application propose de charger des données de démonstration (six mois d'historique).

## Fonctionnalités

- Tableau de bord : solde, revenus, dépenses, épargne, taux d'épargne, budget restant et nombre de transactions, comparés à la période précédente, avec graphiques.
- Transactions : ajout, consultation, modification, duplication, suppression, filtres, recherche instantanée, tri, pagination et export CSV.
- Transactions récurrentes générées automatiquement à leur date, sans doublon.
- Comptes avec transferts (sans effet sur les revenus et les dépenses) et catégories personnalisables.
- Budgets globaux ou par catégorie, avec seuils d'alerte configurables.
- Objectifs d'épargne avec historique des contributions.
- Échéances et factures, avec création de la transaction au paiement.
- Rapports mensuel et annuel, cash flow et épargne ; prévisions de 30 jours à 12 mois ; calendrier financier.
- Alertes, recherche globale, mode clair ou sombre, cinq devises (MGA, CHF, EUR, USD, GBP).
- Export et import JSON, réinitialisation des données.

## Structure

```
index.html          Structure de l'application
style.css           Styles (thèmes clair et sombre, responsive)
script.js           Initialisation, navigation, thème
js/
  config.js         Constantes (devises, catégories, icônes…)
  utils.js          Dates, formatage des montants (formatCurrency), sécurité HTML
  storage.js        Modèle de données, loadData() et saveData()
  calculations.js   Calculs financiers centralisés
  recurring.js      Transactions récurrentes
  demo.js           Données de démonstration
  ui.js             Modales, notifications, composants
  charts.js         Graphiques (Chart.js)
  alerts.js         Alertes
  search.js         Recherche globale
  importexport.js   Export, import et réinitialisation
  forms.js          Formulaires et actions
  views/            Une vue par page
```
