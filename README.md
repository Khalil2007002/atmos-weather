# Atmos Weather — Plateforme Météo, Surf & Outdoor

Interface météo élégante, moderne et sans publicité, créée sans dépendances lourdes ni services payants. Données météo et océaniques en direct via [Open-Meteo](https://open-meteo.com/) et [Open-Meteo Marine API](https://marine-api.open-meteo.com/).

---

## 🚀 Fonctionnalités Livrées (Phases 1 à 7)

### 🟢 Phase 1 — Fondation & Design System
- Architecture ES Modules vanille ultra-légère et modulaire.
- Design **Glassmorphism**, micro-interactions et typographie soignée.
- Thème **Clair / Sombre** dynamique et persistant (`localStorage`), détection automatique de la préférence système.
- Ambiance dynamique du ciel (illustrations, dégradés, étoiles, pluie, nuages animés).

### 🔵 Phase 2 — Données Atmosphériques Complètes
- Température actuelle, ressenti, min/max et conditions en temps réel.
- **Grille atmosphérique professionnelle** : Vitesse & direction du vent, Humidité relative, Pression atmosphérique (hPa), Indice UV max, Visibilité (km), Heures de lever et coucher du soleil.

### 🟣 Phase 3 — Prévisions 24h & 16 Jours
- Défilement horaire interactif sur 24 heures avec codes thermiques couleur et probabilité de pluie.
- Prévisions quotidiennes sur 16 jours avec amplitudes thermiques.

### 🟠 Phase 4 — Localisation Mondiale & Favoris
- Moteur de recherche mondial avec autocomplétion instantanée.
- Géolocalisation directe en un clic (API HTML5).
- Gestion des villes favorites persistantes avec accès direct par puces.

### 🏄 Phase 7 — Surf & Activités Outdoor
- **Module Surf & Océan en direct** :
  - Hauteur des vagues et de la houle (mètres).
  - Période de houle en secondes avec qualification (courte, consistante, world-class).
  - Direction de la houle et du vent avec **boussole visuelle dynamique**.
  - **Score de surf intelligent (0-100)** avec statuts contextualisés (*Conditions Idéales, Bonne Session, Clapot, etc.*).
  - Recommandation technique Atmos Surf en langage naturel.
  - Prévisions de surf heure par heure sur 12h/24h.
  - Sélecteur de spots côtiers réputés (Maroc : *Rabat Oudayas, Skhirat, Mehdia, Dar Bouazza, Taghazout, Imsouane, Safi, Essaouira, Dakhla, Mirleft* ; International : *Hossegor, Biarritz, Nazaré, Ericeira, Peniche*).
  - Détection automatique de la côte avec calcul du spot le plus proche pour les villes intérieures.
- **Module Activités Outdoor 🎯** :
  - Répond à la question : *"Qu'est-ce que je peux faire aujourd'hui avec cette météo ?"*
  - Baromètre et score de confort (0-100%) pour : **Course à pied 🏃**, **Cyclisme 🚴**, **Randonnée 🥾**, **Plage & Baignade 🏖️**, **Camping ⛺**.
  - Conseils météorologiques contextualisés par discipline.

### 🔐 Finalisation Phase 7 — Compte, Premium & confidentialité
- Sessions de compte sécurisées par cookie HttpOnly ; les mots de passe sont hashés avec scrypt.
- Surf & Océan est entièrement Premium côté interface **et** serveur : aucune donnée marine détaillée n’est demandée au fournisseur ni renvoyée à un compte Free.
- Récupération de mot de passe avec code aléatoire à 6 chiffres, hash du code, expiration de 10 minutes, usage unique, délai de renvoi et protections anti-brute-force.
- Stripe Checkout et webhook Stripe sont intégrés côté serveur pour les abonnements mensuels et annuels ; aucun paiement n’est simulé.
- Pages `/privacy`, `/terms`, `/cookies` et centre Privacy & Account (consultation, modification du nom, export et suppression sécurisée du compte).

---

## 💻 Lancer Localement

```powershell
npm install
npm run dev
```
Ouvrir `http://127.0.0.1:4173`.

Sans `DATABASE_URL`, le serveur conserve uniquement les comptes de développement dans `data/users.json` (ce fichier est ignoré par Git). Pour une base durable, configurez les mêmes variables qu’en production.

## ☁️ Déploiement Vercel / production

L’application utilise des Vercel Functions dans `api/`; un hébergement purement statique ne permet pas l’authentification, la récupération de compte ou les abonnements. Vercel exécute automatiquement le catch-all `/api/[...path].js`.

Ajoutez ces variables dans Vercel avant de mettre les fonctions de compte en production :

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | PostgreSQL persistant (Neon ou base compatible) |
| `AUTH_SECRET` | Secret aléatoire d’au moins 32 caractères |
| `EMAIL_PROVIDER_API_KEY` | Clé Resend pour les emails transactionnels |
| `EMAIL_FROM` | Adresse expéditrice vérifiée chez Resend |
| `EMAIL_FROM_NAME` | Nom affiché de l’expéditeur |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe, uniquement côté serveur |
| `STRIPE_WEBHOOK_SECRET` | Secret du webhook Stripe configuré sur `/api/premium/webhook` |
| `STRIPE_MONTHLY_PRICE_ID` | Price ID Stripe de l’abonnement mensuel |
| `STRIPE_YEARLY_PRICE_ID` | Price ID Stripe de l’abonnement annuel |

Copiez [`.env.example`](.env.example) pour la liste prête à renseigner. Le fournisseur email est réellement appelé uniquement lorsque ses trois variables sont configurées. Stripe Checkout est réellement créé uniquement lorsque toutes ses variables sont configurées.

Créez dans Stripe un endpoint de webhook à `https://<votre-domaine>/api/premium/webhook` et activez au minimum `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` et `invoice.paid`.

## 📦 Build et contrôles

```powershell
npm run check
npm run build
```

`dist/` contient les ressources statiques. Sur Vercel, les fonctions API sont déployées en complément par le dossier `api/`.
