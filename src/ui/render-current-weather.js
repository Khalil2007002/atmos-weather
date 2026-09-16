import {
  formatLocalDate,
  formatLocalTime,
  formatTemperature,
  formatUpdateTime,
  titleCase,
} from '../utils/formatters.js';

import { describeWeather } from '../utils/weather-code.js';
import { degreesToCardinal } from '../utils/outdoor-analyzer.js';

export function renderCurrentWeather(weather) {
  const condition = describeWeather(
    weather.weatherCode,
    weather.isDay,
  );

  const city =
    document.querySelector('#weather-title');

  const localTime =
    document.querySelector('#local-time');

  const content =
    document.querySelector('#weather-content');

  const updated =
    document.querySelector('#last-updated');

  const skyIllustration =
    document.querySelector('#sky-illustration');

  const atmosphereCopy =
    document.querySelector('#atmosphere-copy');

  city.innerHTML = `
    ${escapeHtml(weather.location.name)}
    <span>· ${escapeHtml(weather.location.country)}</span>
  `;

  localTime.textContent =
    formatLocalTime(
      weather.location.timezone,
    );

  localTime.setAttribute(
    'aria-label',
    `Heure locale : ${localTime.textContent}`,
  );

  document.body.dataset.weather =
    condition.kind;

  document.body.dataset.phase =
    condition.isNight
      ? 'night'
      : 'day';

  skyIllustration.dataset.kind =
    condition.kind;

  skyIllustration.dataset.phase =
    condition.isNight
      ? 'night'
      : 'day';

  atmosphereCopy.textContent =
    condition.isNight
      ? 'Ambiance nocturne'
      : 'Lumière du jour';

  content.setAttribute(
    'aria-busy',
    'false',
  );

  content.innerHTML = `
    <div class="weather-summary weather-summary--enter">

      <div
        class="weather-icon weather-icon--${condition.kind}"
        aria-hidden="true"
      >
        ${condition.icon}
      </div>

      <div class="weather-reading">

        <p class="date-label">
          ${titleCase(
            formatLocalDate(
              weather.location.timezone,
            ),
          )}
        </p>

        <div class="temperature">
          ${formatTemperature(
            weather.temperature,
          )}
        </div>

        <p class="condition">
          ${escapeHtml(
            condition.label,
          )}
        </p>

        <p class="feels-like">
          Ressenti
          <strong>
            ${formatTemperature(
              weather.apparentTemperature,
            )}
          </strong>
        </p>

      </div>

    </div>

    <div
      class="temperature-range"
      aria-label="Températures du jour"
    >

      <span>
        <small>Min.</small>

        <strong>
          ${formatTemperature(
            weather.minTemperature,
          )}
        </strong>
      </span>

      <i aria-hidden="true"></i>

      <span>
        <small>Max.</small>

        <strong>
          ${formatTemperature(
            weather.maxTemperature,
          )}
        </strong>
      </span>

    </div>

    <div class="weather-metrics-grid" aria-label="Paramètres atmosphériques">
      <div class="metric-card">
        <span class="metric-card__icon" aria-hidden="true">💨</span>
        <div class="metric-card__info">
          <small>Vent</small>
          <strong>${weather.windSpeed != null ? Math.round(weather.windSpeed) + ' km/h' : '—'}</strong>
          <span>${weather.windDirection != null ? degreesToCardinal(weather.windDirection) : ''}</span>
        </div>
      </div>

      <div class="metric-card">
        <span class="metric-card__icon" aria-hidden="true">💧</span>
        <div class="metric-card__info">
          <small>Humidité</small>
          <strong>${weather.humidity != null ? Math.round(weather.humidity) + '%' : '—'}</strong>
          <span>${weather.humidity != null ? (weather.humidity > 60 ? 'Humide' : 'Agréable') : ''}</span>
        </div>
      </div>

      <div class="metric-card">
        <span class="metric-card__icon" aria-hidden="true">🧭</span>
        <div class="metric-card__info">
          <small>Pression</small>
          <strong>${weather.surfacePressure != null ? Math.round(weather.surfacePressure) + ' hPa' : '—'}</strong>
          <span>${weather.surfacePressure != null ? (weather.surfacePressure >= 1013 ? 'Anticyclone' : 'Dépression') : ''}</span>
        </div>
      </div>

      <div class="metric-card">
        <span class="metric-card__icon" aria-hidden="true">☀️</span>
        <div class="metric-card__info">
          <small>Indice UV</small>
          <strong>${weather.uvIndex != null ? Math.round(weather.uvIndex) : '—'}</strong>
          <span>${getUvLevel(weather.uvIndex)}</span>
        </div>
      </div>

      <div class="metric-card">
        <span class="metric-card__icon" aria-hidden="true">👁️</span>
        <div class="metric-card__info">
          <small>Visibilité</small>
          <strong>${weather.visibility != null ? Math.round(weather.visibility) + ' km' : '—'}</strong>
          <span>${weather.visibility != null ? (weather.visibility > 9 ? 'Excellente' : 'Modérée') : ''}</span>
        </div>
      </div>

      <div class="metric-card">
        <span class="metric-card__icon" aria-hidden="true">🌅</span>
        <div class="metric-card__info">
          <small>Soleil</small>
          <strong>${formatTimeOnly(weather.sunrise)}</strong>
          <span>Coucher ${formatTimeOnly(weather.sunset)}</span>
        </div>
      </div>
    </div>
  `;

  renderHourlyForecast(weather);
  renderDailyForecast(weather);

  const chart =
    document.querySelector(
      '#hourly-chart',
    );

  if (chart) {
    chart.innerHTML = '';
    chart.style.display = 'none';
  }

  updated.textContent =
    `Mis à jour à ${
      formatUpdateTime(
        weather.location.timezone,
      )
    } · ${
      weather.location.timezone
        .replaceAll(
          '_',
          ' ',
        )
    }`;
}


/* =========================================================
   PRÉVISIONS 24 HEURES
   CARTES COLORÉES SELON LA TEMPÉRATURE
   ========================================================= */

function renderHourlyForecast(weather) {
  const container =
    document.querySelector(
      '#hourly-forecast',
    );

  if (!container) return;

  if (
    !weather.hourly ||
    !Array.isArray(
      weather.hourly.time,
    ) ||
    !weather.hourly.time.length
  ) {
    container.innerHTML = `
      <p class="forecast-placeholder">
        Prévisions horaires indisponibles.
      </p>
    `;

    return;
  }

  const startIndex =
    findCurrentHourIndex(
      weather.hourly.time,
      weather.observedAt,
    );

  const times =
    weather.hourly.time.slice(
      startIndex,
      startIndex + 24,
    );

  const temperatures =
    weather.hourly.temperature.slice(
      startIndex,
      startIndex + 24,
    );

  const weatherCodes =
    weather.hourly.weatherCode.slice(
      startIndex,
      startIndex + 24,
    );

  const precipitationProbability =
    weather.hourly.precipitationProbability.slice(
      startIndex,
      startIndex + 24,
    );

  if (!times.length) {
    container.innerHTML = `
      <p class="forecast-placeholder">
        Prévisions horaires indisponibles.
      </p>
    `;

    return;
  }

  const numericTemperatures =
    temperatures
      .map(
        value => Number(value),
      )
      .filter(
        Number.isFinite,
      );

  const minTemperature =
    Math.min(
      ...numericTemperatures,
    );

  const maxTemperature =
    Math.max(
      ...numericTemperatures,
    );

  container.innerHTML =
    times
      .map(
        (time, index) => {

          const temperature =
            Number(
              temperatures[index],
            );

          const code =
            weatherCodes[index];

          const probability =
            precipitationProbability[index];

          const condition =
            describeWeather(
              code,
              isHourDay(time),
            );

          const temperatureClass =
            getTemperatureClass(
              temperature,
              minTemperature,
              maxTemperature,
            );

          return `
            <article
              class="hourly-item ${temperatureClass}"
              data-temperature="${temperature}"
            >

              <span
                class="hourly-item__time"
              >
                ${formatHour(time)}
              </span>

              <span
                class="hourly-item__icon"
                aria-hidden="true"
              >
                ${condition.icon}
              </span>

              <strong
                class="hourly-item__temperature"
              >
                ${formatTemperature(
                  temperature,
                )}
              </strong>

              <span
                class="hourly-item__rain"
              >
                ${formatNumber(
                  probability,
                )}%
              </span>

            </article>
          `;
        },
      )
      .join('');
}


/* =========================================================
   CLASSE THERMIQUE
   ========================================================= */

function getTemperatureClass(
  temperature,
  minTemperature,
  maxTemperature,
) {
  const range =
    Math.max(
      maxTemperature -
        minTemperature,
      1,
    );

  const ratio =
    (
      temperature -
      minTemperature
    ) / range;

  if (ratio <= 0.20) {
    return 'temperature-cold';
  }

  if (ratio <= 0.40) {
    return 'temperature-cool';
  }

  if (ratio <= 0.60) {
    return 'temperature-neutral';
  }

  if (ratio <= 0.80) {
    return 'temperature-warm';
  }

  return 'temperature-hot';
}


/* =========================================================
   PRÉVISIONS 16 JOURS
   ========================================================= */

function renderDailyForecast(weather) {
  const container =
    document.querySelector(
      '#daily-forecast',
    );

  if (!container) return;

  if (
    !weather.daily ||
    !Array.isArray(
      weather.daily.time,
    ) ||
    !weather.daily.time.length
  ) {
    container.innerHTML = `
      <p class="forecast-placeholder">
        Prévisions sur 16 jours indisponibles.
      </p>
    `;

    return;
  }

  const totalDays =
    Math.min(
      16,
      weather.daily.time.length,
    );

  container.innerHTML =
    Array.from(
      {
        length: totalDays,
      },
      (_, index) => {

        const date =
          weather.daily.time[index];

        const maxTemperature =
          weather.daily
            .temperatureMax[index];

        const minTemperature =
          weather.daily
            .temperatureMin[index];

        const weatherCode =
          weather.daily
            .weatherCode[index];

        const rainProbability =
          weather.daily
            .precipitationProbability?.[
              index
            ] ?? 0;

        const dayCondition =
          describeWeather(
            weatherCode,
            true,
          );

        const isToday =
          index === 0;

        return `
          <article
            class="daily-item${
              isToday
                ? ' is-today'
                : ''
            }"
          >

            <div
              class="daily-item__day"
            >

              <strong>
                ${
                  isToday
                    ? "Aujourd'hui"
                    : formatDailyDay(
                        date,
                      )
                }
              </strong>

              <small>
                ${formatDailyDate(date)}
              </small>

            </div>

            <span
              class="daily-item__icon"
              aria-hidden="true"
            >
              ${dayCondition.icon}
            </span>

            <span
              class="daily-item__min"
            >
              ${formatTemperature(
                minTemperature,
              )}
            </span>

            <span
              class="daily-item__max"
            >
              ${formatTemperature(
                maxTemperature,
              )}
            </span>

            <span
              class="daily-item__rain"
            >
              ${formatNumber(
                rainProbability,
              )}%
            </span>

          </article>
        `;
      },
    ).join('');
}


/* =========================================================
   UTILITAIRES
   ========================================================= */

function findCurrentHourIndex(
  times,
  observedAt,
) {
  if (!observedAt) {
    return 0;
  }

  const exactIndex =
    times.indexOf(
      observedAt,
    );

  if (exactIndex >= 0) {
    return exactIndex;
  }

  const observedTimestamp =
    Date.parse(
      observedAt,
    );

  if (
    !Number.isFinite(
      observedTimestamp,
    )
  ) {
    return 0;
  }

  let closestIndex = 0;
  let smallestDifference =
    Infinity;

  times.forEach(
    (time, index) => {

      const timestamp =
        Date.parse(time);

      if (
        !Number.isFinite(
          timestamp,
        )
      ) {
        return;
      }

      const difference =
        Math.abs(
          timestamp -
          observedTimestamp,
        );

      if (
        difference <
        smallestDifference
      ) {
        smallestDifference =
          difference;

        closestIndex =
          index;
      }
    },
  );

  return closestIndex;
}

function formatHour(
  dateTime,
) {
  const match =
    String(
      dateTime,
    ).match(
      /T(\d{2}):(\d{2})/,
    );

  if (!match) {
    return '—';
  }

  return `${match[1]}h`;
}

function formatDailyDay(
  value,
) {
  const match =
    String(
      value,
    ).match(
      /(\d{4})-(\d{2})-(\d{2})/,
    );

  if (!match) {
    return '—';
  }

  const date =
    new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      weekday: 'long',
    },
  ).format(date);
}

function formatDailyDate(
  value,
) {
  const match =
    String(
      value,
    ).match(
      /(\d{4})-(\d{2})-(\d{2})/,
    );

  if (!match) {
    return '—';
  }

  return `${match[3]}/${match[2]}`;
}

function isHourDay(
  dateTime,
) {
  const match =
    String(
      dateTime,
    ).match(
      /T(\d{2}):/,
    );

  if (!match) {
    return true;
  }

  const hour =
    Number(match[1]);

  return hour >= 7 && hour < 20;
}

function formatNumber(
  value,
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return '—';
  }

  return Number.isInteger(
    number,
  )
    ? String(number)
    : number.toFixed(1);
}

function escapeHtml(
  value,
) {
  return String(
    value ?? '',
  )
    .replaceAll(
      '&',
      '&amp;',
    )
    .replaceAll(
      '<',
      '&lt;',
    )
    .replaceAll(
      '>',
      '&gt;',
    )
    .replaceAll(
      '"',
      '&quot;',
    )
    .replaceAll(
      "'",
      '&#039;',
    );
}


/* =========================================================
   ERREUR
   ========================================================= */

export function renderWeatherError({
  onRetry,
}) {
  const content =
    document.querySelector(
      '#weather-content',
    );

  const updated =
    document.querySelector(
      '#last-updated',
    );

  content.setAttribute(
    'aria-busy',
    'false',
  );

  content.innerHTML = `
    <div class="weather-error">

      <span
        class="weather-error__icon"
        aria-hidden="true"
      >
        ⚠️
      </span>

      <div>

        <p>
          Impossible de récupérer
          les données météo.
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
    .querySelector(
      '.retry-button',
    )
    .addEventListener(
      'click',
      onRetry,
    );
}


/* =========================================================
   LOADING
   ========================================================= */

export function renderWeatherLoading() {
  const content =
    document.querySelector(
      '#weather-content',
    );

  const updated =
    document.querySelector(
      '#last-updated',
    );

  content.setAttribute(
    'aria-busy',
    'true',
  );

  content.innerHTML = `
    <div class="weather-loading">

      <div
        class="skeleton skeleton--icon"
      ></div>

      <div
        class="skeleton-stack"
      >

        <div
          class="skeleton skeleton--temperature"
        ></div>

        <div
          class="skeleton skeleton--condition"
        ></div>

        <div
          class="skeleton skeleton--details"
        ></div>

      </div>

    </div>
  `;

  updated.textContent =
    'Actualisation des observations…';
}

function formatTimeOnly(isoString) {
  if (!isoString) return '—';
  const match = String(isoString).match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}h${match[2]}` : '—';
}

function getUvLevel(uv) {
  if (uv == null) return '—';
  const num = Number(uv);
  if (num <= 2) return 'Faible';
  if (num <= 5) return 'Modéré';
  if (num <= 7) return 'Élevé';
  if (num <= 10) return 'Très fort';
  return 'Extrême';
}