# Atmos Weather — Phase 1

Interface météo responsive créée sans dépendance ni service payant. Les données en direct sont récupérées via [Open-Meteo](https://open-meteo.com/), une API sans clé pour les usages non commerciaux et open source.

## Fonctionnalités livrées

- météo actuelle de Rabat (température, ressenti, condition, min/max, date et heure locale) ;
- thème clair/sombre persistant (`localStorage`) avec détection du thème système à la première visite ;
- fond et illustration qui s'adaptent au code météo et au jour / à la nuit ;
- états de chargement et erreur avec bouton de réessai ;
- couche dédiée `src/services/weather-api.js` indépendante de l'interface.

## Lancer localement

Cette première phase est un projet ES modules : aucune installation n'est nécessaire. Le serveur local inclus relaie les requêtes météo, ce qui évite qu'une configuration Chrome ou réseau ne bloque l'obtention des données.

```powershell
& 'C:\Users\PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\server.mjs
```

Puis ouvrir `http://127.0.0.1:4173`.

## Vérifier / produire la version statique

```powershell
& 'C:\Users\PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\build.mjs
```

Le dossier `dist/` est la version prête à héberger sur n'importe quel hébergement statique gratuit.
