import { APP_CONFIG } from './config.js';
import { reverseGeocode, searchLocations } from './services/geocoding-api.js';
import { getCurrentWeather } from './services/weather-api.js';
import { getMarineForecast } from './services/marine-api.js';
import {
  renderCurrentWeather,
  renderWeatherError,
  renderWeatherLoading,
} from './ui/render-current-weather.js';
import { renderSurfCard } from './ui/surf-ui.js';
import { renderOutdoorCard } from './ui/outdoor-ui.js';
import {
  renderFavoriteToggle,
  renderFavorites,
  renderSearchSuggestions,
  showLocationStatus,
} from './ui/location-ui.js';
import {
  addFavorite,
  isFavorite,
  loadFavorites,
  removeFavorite,
} from './utils/location-storage.js';
import { applyTheme, getPreferredTheme, persistTheme } from './utils/theme.js';
import { authService } from './services/auth-service.js';
import { showAuthModal } from './ui/auth-modal.js';
import { showProfileModal } from './ui/profile-modal.js';
import { showPremiumModal } from './ui/premium-modal.js';
import { showPrivacyModal } from './ui/privacy-modal.js';
import { isFeatureAvailable } from './utils/premium-features.js';

let activeWeatherRequest;
let activeMarineRequest;
let activeSearchRequest;
let searchDebounce;
let latestSearchResults = [];
let currentLocation = APP_CONFIG.defaultLocation;
let currentWeatherData = null;
let currentMarineData = null;
let favorites = [];

function syncThemeControl(theme) {
  const button = document.querySelector('#theme-toggle');
  const isDark = theme === 'dark';
  button.setAttribute('aria-pressed', String(isDark));
  button.setAttribute('aria-label', isDark ? 'Passer au mode clair' : 'Passer au mode sombre');
}

function setupTheme() {
  const button = document.querySelector('#theme-toggle');
  const initialTheme = getPreferredTheme();
  applyTheme(initialTheme);
  syncThemeControl(initialTheme);

  button.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    syncThemeControl(nextTheme);
  });
}

async function loadWeather(location = currentLocation) {
  activeWeatherRequest?.abort();
  activeWeatherRequest = new AbortController();
  renderWeatherLoading();
  document.querySelector('#refresh-button').classList.add('is-loading');

  try {
    const weather = await getCurrentWeather(location, { signal: activeWeatherRequest.signal });
    currentLocation = location;
    currentWeatherData = weather;
    renderCurrentWeather(weather);
    renderOutdoorCard(weather);
    loadSurfForecast(location, weather);
    syncFavoriteUi();
    showLocationStatus('');
  } catch (error) {
    if (error.name !== 'AbortError') {
      renderWeatherError({ onRetry: () => loadWeather(currentLocation) });
      showLocationStatus('Impossible de récupérer la météo de cette ville.', 'error');
    }
  } finally {
    document.querySelector('#refresh-button').classList.remove('is-loading');
  }
}

async function loadSurfForecast(location, weather = currentWeatherData) {
  activeMarineRequest?.abort();
  activeMarineRequest = new AbortController();

  try {
    const marineData = await getMarineForecast(location, { signal: activeMarineRequest.signal });
    currentMarineData = marineData;
    renderSurfCard(marineData, weather, { onSelectSpot: handleSelectSurfSpot });

    const surfPill = document.querySelector('#surf-tab-pill');
    if (surfPill) {
      if (!authService.isPremium() || marineData.isPremiumRequired) {
        surfPill.textContent = 'Premium';
        surfPill.style.display = 'inline-block';
      } else if (marineData.current?.waveHeight) {
        surfPill.textContent = `${marineData.current.waveHeight.toFixed(1)}m`;
        surfPill.style.display = 'inline-block';
      } else if (marineData.nearestSpot) {
        surfPill.textContent = 'Côte';
        surfPill.style.display = 'inline-block';
      } else {
        surfPill.style.display = 'none';
      }
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      renderSurfCard(null, weather);
    }
  }
}

async function handleSelectSurfSpot(spot) {
  if (!spot) return;
  showLocationStatus(`Chargement des prévisions de surf pour ${spot.name}…`);
  await loadSurfForecast(spot, currentWeatherData);
  showLocationStatus(`Spot actif : ${spot.name}`, 'success');
}

function setupLocationControls() {
  const form = document.querySelector('#location-search-form');
  const input = document.querySelector('#location-search');
  const geolocateButton = document.querySelector('#geolocate-button');

  input.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const query = input.value.trim();

    if (query.length < 2) {
      activeSearchRequest?.abort();
      latestSearchResults = [];
      renderSearchSuggestions({ state: 'hidden', onSelect: selectLocation });
      return;
    }

    searchDebounce = setTimeout(() => runLocationSearch(query), APP_CONFIG.searchDebounceMs);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      input.value = '';
      renderSearchSuggestions({ state: 'hidden', onSelect: selectLocation });
      input.blur();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (query.length < 2) {
      showLocationStatus('Saisissez au moins deux lettres pour rechercher une ville.', 'error');
      input.focus();
      return;
    }

    const results = await runLocationSearch(query);
    if (results?.[0]) await selectLocation(results[0]);
  });

  document.querySelector('#search-area').addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!document.querySelector('#search-area').contains(document.activeElement)) {
        renderSearchSuggestions({ state: 'hidden', onSelect: selectLocation });
      }
    }, 140);
  });

  geolocateButton.addEventListener('click', useBrowserLocation);
}

async function runLocationSearch(query) {
  activeSearchRequest?.abort();
  activeSearchRequest = new AbortController();
  renderSearchSuggestions({ state: 'loading', onSelect: selectLocation });

  try {
    const results = await searchLocations(query, { signal: activeSearchRequest.signal });
    latestSearchResults = results;
    renderSearchSuggestions({
      locations: results,
      state: results.length ? 'results' : 'empty',
      onSelect: selectLocation,
    });
    return results;
  } catch (error) {
    if (error.name !== 'AbortError') {
      latestSearchResults = [];
      renderSearchSuggestions({ state: 'error', onSelect: selectLocation });
    }
    return [];
  }
}

async function selectLocation(location) {
  const input = document.querySelector('#location-search');
  input.value = '';
  latestSearchResults = [];
  renderSearchSuggestions({ state: 'hidden', onSelect: selectLocation });
  await loadWeather(location);
}

function useBrowserLocation() {
  const button = document.querySelector('#geolocate-button');

  if (!navigator.geolocation) {
    showLocationStatus('La géolocalisation n’est pas disponible dans ce navigateur. Recherchez une ville manuellement.', 'error');
    return;
  }

  button.classList.add('is-loading');
  button.disabled = true;
  showLocationStatus('Localisation de votre ville en cours…');

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      try {
        const location = await reverseGeocode(coords.latitude, coords.longitude);
        await selectLocation(location);
        showLocationStatus(`${location.name}, ${location.country} est maintenant affichée.`, 'success');
      } catch {
        showLocationStatus('Impossible d’identifier votre ville. Vous pouvez la rechercher manuellement.', 'error');
      } finally {
        button.classList.remove('is-loading');
        button.disabled = false;
      }
    },
    (error) => {
      showLocationStatus(geolocationErrorMessage(error), 'error');
      button.classList.remove('is-loading');
      button.disabled = false;
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
  );
}

function geolocationErrorMessage(error) {
  if (error.code === 1) {
    return 'Position non autorisée. Recherchez une ville pour continuer.';
  }
  if (error.code === 3) {
    return 'La géolocalisation a pris trop de temps. Réessayez ou recherchez une ville.';
  }
  return 'Votre position est indisponible. Recherchez une ville pour continuer.';
}

function setupFavorites() {
  favorites = loadFavorites();
  document.querySelector('#favorite-toggle').addEventListener('click', () => {
    if (isFavorite(currentLocation, favorites)) {
      favorites = removeFavorite(currentLocation, favorites);
      showLocationStatus(`${currentLocation.name} a été retirée de vos favoris.`);
    } else {
      favorites = addFavorite(currentLocation, favorites);
      showLocationStatus(`${currentLocation.name} a été ajoutée à vos favoris.`, 'success');
    }
    syncFavoriteUi();
  });
  syncFavoriteUi();
}

function syncFavoriteUi() {
  renderFavoriteToggle(isFavorite(currentLocation, favorites));
  renderFavorites(favorites, currentLocation, {
    onSelect: selectLocation,
    onRemove: (location) => {
      favorites = removeFavorite(location, favorites);
      syncFavoriteUi();
      showLocationStatus(`${location.name} a été supprimée de vos favoris.`);
    },
  });
}

function setupDashboardTabs() {
  const tabs = [
    { buttonId: '#tab-hourly', panelId: '#hourly-section' },
    { buttonId: '#tab-surf', panelId: '#surf-section' },
    { buttonId: '#tab-outdoor', panelId: '#outdoor-section' },
  ];

  tabs.forEach(({ buttonId, panelId }) => {
    const btn = document.querySelector(buttonId);
    if (!btn) return;

    btn.addEventListener('click', () => {
      tabs.forEach(({ buttonId: otherBtnId, panelId: otherPanelId }) => {
        const otherBtn = document.querySelector(otherBtnId);
        const otherPanel = document.querySelector(otherPanelId);
        const isTarget = otherBtnId === buttonId;

        otherBtn?.classList.toggle('is-active', isTarget);
        otherBtn?.setAttribute('aria-selected', String(isTarget));
        if (otherPanel) {
          if (isTarget) {
            otherPanel.removeAttribute('hidden');
            otherPanel.classList.add('is-active');
          } else {
            otherPanel.setAttribute('hidden', '');
            otherPanel.classList.remove('is-active');
          }
        }
      });
    });
  });
}

function setupAuth() {
  const authBtn = document.querySelector('#auth-button');
  const premiumBtn = document.querySelector('#premium-button');

  function updateAuthUI() {
    if (authService.isAuthenticated()) {
      const user = authService.getUser();
      const isPrem = authService.isPremium();
      authBtn.textContent = '';
      authBtn.innerHTML = isPrem
        ? `<span style="color:gold;">✦</span> ${escapeHtml(user.name || 'Profil')}`
        : `👤 ${escapeHtml(user.name || 'Profil')}`;
      authBtn.onclick = () => showProfileModal();

      if (isPrem) {
        premiumBtn.innerHTML = '<span style="color:gold;">✦</span> Membre Premium';
        premiumBtn.title = 'Vous bénéficiez de tous les accès Premium';
      } else {
        premiumBtn.innerHTML = '<span style="color:gold;">✦</span> Premium';
        premiumBtn.title = 'Passer à Atmos Premium';
      }
    } else {
      authBtn.innerHTML = '👤 Connexion';
      authBtn.onclick = () => showAuthModal('login');
      premiumBtn.innerHTML = '<span style="color:gold;">✦</span> Premium';
      premiumBtn.title = 'Découvrir Atmos Premium';
    }

    if (currentWeatherData) {
      renderCurrentWeather(currentWeatherData);
      renderOutdoorCard(currentWeatherData);
    }
    if (currentWeatherData) loadSurfForecast(currentLocation, currentWeatherData);
  }

  premiumBtn.addEventListener('click', () => showPremiumModal());
  document.querySelector('#footer-privacy-account')?.addEventListener('click', (event) => {
    event.preventDefault();
    if (authService.isAuthenticated()) showPrivacyModal();
    else showAuthModal('login');
  });
  window.addEventListener('atmos:auth-changed', updateAuthUI);
  authService.init().then(updateAuthUI);
}

function bootstrap() {
  setupTheme();
  setupDashboardTabs();
  setupAuth();
  renderSurfCard(null, null);
  renderOutdoorCard(null);
  setupLocationControls();
  setupFavorites();
  document.querySelector('#refresh-button').addEventListener('click', () => loadWeather(currentLocation));
  loadWeather();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

bootstrap();
