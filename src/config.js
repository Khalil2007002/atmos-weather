/**
 * Réglages applicatifs regroupés pour rendre le fournisseur météo facilement remplaçable.
 * Les fournisseurs restent isolés des composants d'interface.
 */
export const APP_CONFIG = {
  defaultLocation: {
    name: 'Rabat',
    country: 'Maroc',
    latitude: 34.0209,
    longitude: -6.8416,
  },
  locale: 'fr-FR',
  searchDebounceMs: 280,
  maxFavorites: 8,
};
