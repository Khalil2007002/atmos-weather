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

---

## 💻 Lancer Localement

```powershell
node server.mjs
```
Ouvrir `http://127.0.0.1:4173`.

## 📦 Produire la Version Statique (Production)

```powershell
node build.mjs
```
Le dossier `dist/` contient la version autonome prête pour tout hébergement statique (Vercel, Cloudflare Pages, Netlify, GitHub Pages).
