import {
  formatLocalDate,
  formatLocalTime,
  formatTemperature,
  formatUpdateTime,
  titleCase,
} from '../utils/formatters.js';
import { describeWeather } from '../utils/weather-code.js';

export function renderCurrentWeather(weather) {
  const condition = describeWeather(weather.weatherCode, weather.isDay);
  const city = document.querySelector('#weather-title');
  const localTime = document.querySelector('#local-time');
  const content = document.querySelector('#weather-content');
  const updated = document.querySelector('#last-updated');
  const skyIllustration = document.querySelector('#sky-illustration');
  const atmosphereCopy = document.querySelector('#atmosphere-copy');

  city.innerHTML = `${weather.location.name} <span>· ${weather.location.country}</span>`;
  localTime.textContent = formatLocalTime(weather.location.timezone);
  localTime.setAttribute('aria-label', `Heure locale : ${localTime.textContent}`);
  document.body.dataset.weather = condition.kind;
  document.body.dataset.phase = condition.isNight ? 'night' : 'day';
  skyIllustration.dataset.kind = condition.kind;
  skyIllustration.dataset.phase = condition.isNight ? 'night' : 'day';
  atmosphereCopy.textContent = condition.isNight ? 'Ambiance nocturne' : 'Lumière du jour';

  content.setAttribute('aria-busy', 'false');
  content.innerHTML = `
    <div class="weather-summary weather-summary--enter">
      <div class="weather-icon weather-icon--${condition.kind}" aria-hidden="true">${condition.icon}</div>
      <div class="weather-reading">
        <p class="date-label">${titleCase(formatLocalDate(weather.location.timezone))}</p>
        <div class="temperature">${formatTemperature(weather.temperature)}</div>
        <p class="condition">${condition.label}</p>
        <p class="feels-like">Ressenti <strong>${formatTemperature(weather.apparentTemperature)}</strong></p>
      </div>
    </div>
    <div class="temperature-range" aria-label="Températures du jour">
      <span><small>Min.</small><strong>${formatTemperature(weather.minTemperature)}</strong></span>
      <i aria-hidden="true"></i>
      <span><small>Max.</small><strong>${formatTemperature(weather.maxTemperature)}</strong></span>
    </div>
  `;
  updated.textContent = `Mis à jour à ${formatUpdateTime(weather.location.timezone)} · ${weather.location.timezone.replaceAll('_', ' ')}`;
}

export function renderWeatherError({ onRetry }) {
  const content = document.querySelector('#weather-content');
  const updated = document.querySelector('#last-updated');

  content.setAttribute('aria-busy', 'false');
  content.innerHTML = `
    <div class="weather-error">
      <span class="weather-error__icon" aria-hidden="true">⌁</span>
      <div>
        <p>Impossible de récupérer les données météo.</p>
        <button class="retry-button" type="button">Réessayer</button>
      </div>
    </div>
  `;
  updated.textContent = 'La dernière tentative a échoué.';
  content.querySelector('.retry-button').addEventListener('click', onRetry);
}

export function renderWeatherLoading() {
  const content = document.querySelector('#weather-content');
  const updated = document.querySelector('#last-updated');

  content.setAttribute('aria-busy', 'true');
  content.innerHTML = `
    <div class="weather-loading">
      <div class="skeleton skeleton--icon"></div>
      <div class="skeleton-stack">
        <div class="skeleton skeleton--temperature"></div>
        <div class="skeleton skeleton--condition"></div>
        <div class="skeleton skeleton--details"></div>
      </div>
    </div>
  `;
  updated.textContent = 'Actualisation des observations…';
}
