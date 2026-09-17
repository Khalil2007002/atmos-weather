export const PREMIUM_FEATURES = {
  extendedForecast: { name: 'Prévisions étendues 16 jours', free: false, description: 'Accédez aux prévisions jours 8 à 16' },
  allSurfSpots: { name: 'Tous les spots de surf', free: false, description: 'Sélectionnez parmi 15 spots de surf' },
  fullOutdoor: { name: 'Activités outdoor complètes', free: false, description: 'Cyclisme, Natation, Camping' },
  uvAlerts: { name: 'Alertes UV', free: false, description: "Notifications d'indice UV élevé" },
  currentWeather: { name: 'Météo actuelle', free: true },
  hourlyForecast: { name: 'Prévisions 24h', free: true },
  weekForecast: { name: 'Prévisions 7 jours', free: true },
  nearestSurf: { name: 'Spot de surf le plus proche', free: true },
  basicOutdoor: { name: 'Running & Randonnée', free: true },
  favorites: { name: 'Villes favorites', free: true },
  themes: { name: 'Thèmes', free: true },
};

export function isFeatureAvailable(featureName, userTier = 'Free') {
  const feature = PREMIUM_FEATURES[featureName];
  if (!feature) return false;
  if (feature.free) return true;
  return userTier === 'premium';
}

export function getPremiumFeaturesList() {
  return Object.values(PREMIUM_FEATURES).filter(f => !f.free);
}
