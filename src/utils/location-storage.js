import { APP_CONFIG } from '../config.js';

const FAVORITES_KEY = 'atmos-favorites-v1';

export function loadFavorites() {
  try {
    const rawValue = localStorage.getItem(FAVORITES_KEY);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeLocation).filter(Boolean).slice(0, APP_CONFIG.maxFavorites) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites) {
  const validFavorites = favorites.map(normalizeLocation).filter(Boolean).slice(0, APP_CONFIG.maxFavorites);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(validFavorites));
  return validFavorites;
}

export function isFavorite(location, favorites) {
  return favorites.some((favorite) => sameLocation(favorite, location));
}

export function addFavorite(location, favorites) {
  if (isFavorite(location, favorites)) return favorites;
  return saveFavorites([normalizeLocation(location), ...favorites].filter(Boolean));
}

export function removeFavorite(location, favorites) {
  return saveFavorites(favorites.filter((favorite) => !sameLocation(favorite, location)));
}

export function sameLocation(first, second) {
  if (!first || !second) return false;
  return Math.abs(Number(first.latitude) - Number(second.latitude)) < 0.0001
    && Math.abs(Number(first.longitude) - Number(second.longitude)) < 0.0001;
}

function normalizeLocation(location) {
  if (!location?.name || !location?.country) return null;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    id: location.id ? String(location.id) : undefined,
    name: String(location.name),
    country: String(location.country),
    countryCode: location.countryCode ? String(location.countryCode) : undefined,
    admin1: location.admin1 ? String(location.admin1) : undefined,
    latitude,
    longitude,
    timezone: location.timezone ? String(location.timezone) : undefined,
  };
}
