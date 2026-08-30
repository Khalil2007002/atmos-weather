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
  atmosphereCopy.textContent = condition.isNight
    ? 'Ambiance nocturne'
    : 'Lumière du jour';

  content.setAttribute('aria-busy', 'false');

  content.innerHTML = `
    <div class="weather-summary weather-summary--enter">
      <div class="weather-icon weather-icon--${condition.kind}" aria-hidden="true">
        ${condition.icon}
      </div>

      <div class="weather-reading">
        <p class="date-label">
          ${titleCase(formatLocalDate(weather.location.timezone))}
        </p>

        <div class="temperature">
          ${formatTemperature(weather.temperature)}
        </div>

        <p class="condition">
          ${condition.label}
        </p>

        <p class="feels-like">
          Ressenti
          <strong>${formatTemperature(weather.apparentTemperature)}</strong>
        </p>
      </div>
    </div>

    <div class="temperature-range" aria-label="Températures du jour">
      <span>
        <small>Min.</small>
        <strong>${formatTemperature(weather.minTemperature)}</strong>
      </span>

      <i aria-hidden="true"></i>

      <span>
        <small>Max.</small>
        <strong>${formatTemperature(weather.maxTemperature)}</strong>
      </span>
    </div>
  `;

  renderHourlyForecast(weather);

  updated.textContent =
    `Mis à jour à ${formatUpdateTime(weather.location.timezone)} · ${weather.location.timezone.replaceAll('_', ' ')}`;
}


/* =========================================================
   PRÉVISIONS 24 HEURES
   ========================================================= */

function renderHourlyForecast(weather) {
  const container = document.querySelector('#hourly-forecast');
  const chart = document.querySelector('#hourly-chart');

  if (!container) return;

  const hourly = weather.hourly;

  if (
    !hourly ||
    !Array.isArray(hourly.time) ||
    !hourly.time.length
  ) {
    container.innerHTML = `
      <p class="forecast-placeholder">
        Prévisions horaires indisponibles.
      </p>
    `;

    if (chart) {
      chart.innerHTML = '';
    }

    return;
  }

  const startIndex = findCurrentHourIndex(
    hourly.time,
    weather.observedAt,
  );

  const times = hourly.time.slice(
    startIndex,
    startIndex + 24,
  );

  const temperatures = hourly.temperature.slice(
    startIndex,
    startIndex + 24,
  );

  const codes = hourly.weatherCode.slice(
    startIndex,
    startIndex + 24,
  );

  const rain = hourly.precipitationProbability.slice(
    startIndex,
    startIndex + 24,
  );

  container.innerHTML = times
    .map((time, index) => {
      const hourlyCondition = describeWeather(
        codes[index],
        isHourDay(time),
      );

      return `
        <article class="hourly-item">
          <span class="hourly-item__time">
            ${formatHour(time)}
          </span>

          <span class="hourly-item__icon" aria-hidden="true">
            ${hourlyCondition.icon}
          </span>

          <strong class="hourly-item__temperature">
            ${formatTemperature(temperatures[index])}
          </strong>

          <span class="hourly-item__rain">
            💧 ${formatNumber(rain[index])}%
          </span>
        </article>
      `;
    })
    .join('');

  renderHourlyChart(times, temperatures);
}


/* =========================================================
   COURBE DE TEMPÉRATURE
   ========================================================= */

function renderHourlyChart(times, temperatures) {
  const container = document.querySelector('#hourly-chart');

  if (!container || !temperatures.length) return;

  const values = temperatures
    .map(Number)
    .filter(Number.isFinite);

  if (!values.length) return;

  const width = 1000;
  const height = 190;
  const paddingX = 25;
  const paddingY = 25;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);

  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;

  const points = values.map((temperature, index) => {
    const x =
      paddingX +
      (index / Math.max(values.length - 1, 1)) *
        usableWidth;

    const y =
      paddingY +
      (1 - (temperature - min) / range) *
        usableHeight;

    return { x, y, temperature };
  });

  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    )
    .join(' ');

  const area = [
    `M ${points[0].x} ${height - paddingY}`,
    ...points.map(
      point => `L ${point.x} ${point.y}`,
    ),
    `L ${points[points.length - 1].x} ${height - paddingY}`,
    'Z',
  ].join(' ');

  const dots = points
    .map(
      point => `
        <circle
          class="hourly-chart__dot"
          cx="${point.x}"
          cy="${point.y}"
          r="4"
        />
      `,
    )
    .join('');

  container.innerHTML = `
    <svg
      class="hourly-chart__svg"
      viewBox="0 0 ${width} ${height}"
      preserveAspectRatio="none"
      role="img"
      aria-label="Évolution de la température sur les prochaines 24 heures"
    >
      <path
        class="hourly-chart__area"
        d="${area}"
      />

      <path
        class="hourly-chart__line"
        d="${line}"
      />

      ${dots}
    </svg>
  `;
}


/* =========================================================
   UTILITAIRES
   ========================================================= */

function findCurrentHourIndex(times, observedAt) {
  if (!observedAt) return 0;

  const exactIndex = times.indexOf(observedAt);

  if (exactIndex >= 0) {
    return exactIndex;
  }

  const observedTimestamp = Date.parse(observedAt);

  if (!Number.isFinite(observedTimestamp)) {
    return 0;
  }

  let closestIndex = 0;
  let smallestDifference = Infinity;

  times.forEach((time, index) => {
    const timestamp = Date.parse(time);

    if (!Number.isFinite(timestamp)) return;

    const difference = Math.abs(
      timestamp - observedTimestamp,
    );

    if (difference < smallestDifference) {
      smallestDifference = difference;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function formatHour(value) {
  const match = String(value).match(
    /T(\d{2}):/,
  );

  return match ? `${match[1]}h` : '—';
}

function isHourDay(value) {
  const match = String(value).match(
    /T(\d{2}):/,
  );

  if (!match) return true;

  const hour = Number(match[1]);

  return hour >= 7 && hour < 20;
}

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(1);
}


/* =========================================================
   ERREUR
   ========================================================= */

export function renderWeatherError({ onRetry }) {
  const content = document.querySelector('#weather-content');
  const updated = document.querySelector('#last-updated');

  content.setAttribute('aria-busy', 'false');

  content.innerHTML = `
    <div class="weather-error">
      <span class="weather-error__icon" aria-hidden="true">
        ⚠️
      </span>

      <div>
        <p>
          Impossible de récupérer les données météo.
        </p>

        <button
          class="retry-button"
          type="button"
        >
          Réessayer
        </button>
      </div>
    </div>
  `;

  updated.textContent =
    'La dernière tentative a échoué.';

  content
    .querySelector('.retry-button')
    .addEventListener(
      'click',
      onRetry,
    );
}


/* =========================================================
   LOADING
   ========================================================= */

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

  updated.textContent =
    'Actualisation des observations…';
}