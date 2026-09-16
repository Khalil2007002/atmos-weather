import { degreesToCardinal, evaluateSurfConditions } from '../utils/outdoor-analyzer.js';
import { POPULAR_SURF_SPOTS } from '../services/marine-api.js';

export function renderSurfCard(marineData, weatherData, { onSelectSpot } = {}) {
  const container = document.querySelector('#surf-section');
  if (!container) return;

  if (!marineData) {
    container.innerHTML = `
      <div class="surf-placeholder glass-card">
        <p>Chargement des conditions de surf…</p>
      </div>
    `;
    return;
  }

  const { isCoastal, nearestSpot, current, hourly = [] } = marineData;
  const spotName = isCoastal ? (marineData.location?.name || 'Spot Côtier') : (nearestSpot?.name || 'Spot Côtier');
  const distanceNotice = !isCoastal && nearestSpot?.distanceKm
    ? `<span class="surf-distance-badge">Spot le plus proche · à ${nearestSpot.distanceKm} km</span>`
    : '';

  const windSpeed = weatherData?.windSpeed ?? 15;
  const windDirection = weatherData?.windDirection ?? 0;

  const surfEvaluation = evaluateSurfConditions({
    waveHeight: current?.waveHeight,
    wavePeriod: current?.wavePeriod,
    swellHeight: current?.swellHeight,
    swellPeriod: current?.swellPeriod,
    windSpeed,
    windDirection,
    waveDirection: current?.waveDirection,
  });

  const waveHeightFormatted = current?.waveHeight ? `${current.waveHeight.toFixed(1)} m` : '—';
  const swellPeriodFormatted = current?.swellPeriod ? `${Math.round(current.swellPeriod)} s` : '—';
  const swellDirDeg = current?.swellDirection ?? 0;
  const swellDirCardinal = degreesToCardinal(swellDirDeg);

  const windDirCardinal = degreesToCardinal(windDirection);

  container.innerHTML = `
    <article class="surf-card glass-card" aria-label="Prévisions de Surf et État de la Mer">
      <div class="surf-card__header">
        <div>
          <div class="surf-eyebrow-row">
            <span class="eyebrow">Surf &amp; Océan 🌊</span>
            ${distanceNotice}
          </div>
          <h2 class="surf-card__title" id="surf-title">
            ${escapeHtml(spotName)}
          </h2>
        </div>

        <div class="surf-card__spot-picker">
          <label for="surf-spot-select" class="sr-only">Changer de spot</label>
          <select id="surf-spot-select" class="surf-select" aria-label="Sélectionner un spot de surf">
            <optgroup label="Spots Populaires (Maroc &amp; Monde)">
              ${POPULAR_SURF_SPOTS.map(
                (s) => `<option value="${s.id}" ${nearestSpot?.id === s.id ? 'selected' : ''}>${s.name} (${s.country})</option>`
              ).join('')}
            </optgroup>
          </select>
        </div>
      </div>

      <div class="surf-card__hero">
        <div class="surf-score-badge" style="--badge-accent: ${surfEvaluation.badge.color}">
          <span class="surf-score-value">${surfEvaluation.score}</span>
          <span class="surf-score-max">/ 100</span>
          <span class="surf-score-status">${surfEvaluation.badge.text}</span>
        </div>

        <div class="surf-metrics-grid">
          <!-- Vagues -->
          <div class="surf-metric-box">
            <span class="surf-metric-label">Hauteur Vagues</span>
            <div class="surf-metric-value-wrap">
              <span class="surf-metric-value">${waveHeightFormatted}</span>
              <span class="surf-metric-sub">${surfEvaluation.heightLabel}</span>
            </div>
          </div>

          <!-- Période -->
          <div class="surf-metric-box">
            <span class="surf-metric-label">Période Houle</span>
            <div class="surf-metric-value-wrap">
              <span class="surf-metric-value">${swellPeriodFormatted}</span>
              <span class="surf-metric-sub">${surfEvaluation.periodQuality}</span>
            </div>
          </div>

          <!-- Direction Houle -->
          <div class="surf-metric-box">
            <span class="surf-metric-label">Direction Houle</span>
            <div class="surf-metric-value-wrap">
              <div class="compass-indicator">
                <span class="compass-arrow" style="transform: rotate(${swellDirDeg}deg);">↑</span>
                <span class="surf-metric-value">${swellDirCardinal}</span>
              </div>
              <span class="surf-metric-sub">${Math.round(swellDirDeg)}°</span>
            </div>
          </div>

          <!-- Vent Marin -->
          <div class="surf-metric-box">
            <span class="surf-metric-label">Vent sur le spot</span>
            <div class="surf-metric-value-wrap">
              <div class="compass-indicator">
                <span class="compass-arrow" style="transform: rotate(${Math.round(windDirection)}deg);">↑</span>
                <span class="surf-metric-value">${Math.round(windSpeed)} km/h</span>
              </div>
              <span class="surf-metric-sub">${windDirCardinal} · ${surfEvaluation.windImpact}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Recommandation Atmos Surf -->
      <div class="surf-advice-banner">
        <span class="surf-advice-icon">🏄</span>
        <div class="surf-advice-body">
          <strong>Analyse Atmos Surf :</strong>
          <p>${escapeHtml(surfEvaluation.recommendation)}</p>
        </div>
      </div>

      <!-- Prévisions Surf 24h -->
      ${renderHourlySurfPreview(hourly)}
    </article>
  `;

  // Écouteur pour le sélecteur de spots
  const select = container.querySelector('#surf-spot-select');
  if (select && onSelectSpot) {
    select.addEventListener('change', (e) => {
      const selectedId = e.target.value;
      const foundSpot = POPULAR_SURF_SPOTS.find((s) => s.id === selectedId);
      if (foundSpot) onSelectSpot(foundSpot);
    });
  }
}

function renderHourlySurfPreview(hourly = []) {
  if (!hourly.length) return '';

  const next12Hours = hourly.slice(0, 12);

  return `
    <div class="surf-hourly-section">
      <div class="surf-hourly-header">
        <span class="surf-hourly-title">Prévisions Surf Heure par Heure</span>
        <span class="surf-hourly-badge">12 h</span>
      </div>
      <div class="surf-hourly-scroll">
        ${next12Hours
          .map((item) => {
            const hourLabel = formatIsoHour(item.time);
            const height = item.waveHeight != null ? `${Number(item.waveHeight).toFixed(1)}m` : '—';
            const period = item.swellPeriod != null ? `${Math.round(item.swellPeriod)}s` : '—';
            const dir = degreesToCardinal(item.swellDirection ?? 0);

            return `
              <div class="surf-hourly-col">
                <span class="surf-hourly-col__time">${hourLabel}</span>
                <span class="surf-wave-icon">🌊</span>
                <strong class="surf-hourly-col__height">${height}</strong>
                <span class="surf-hourly-col__period">${period}</span>
                <small class="surf-hourly-col__dir">${dir}</small>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function formatIsoHour(isoString) {
  if (!isoString) return '—';
  const match = String(isoString).match(/T(\d{2}):/);
  return match ? `${match[1]}h` : '—';
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
