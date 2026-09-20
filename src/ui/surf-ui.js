import { degreesToCardinal, evaluateSurfConditions } from '../utils/outdoor-analyzer.js';
import { POPULAR_SURF_SPOTS } from '../services/marine-api.js';
import { authService } from '../services/auth-service.js';
import { showPremiumModal } from './premium-modal.js';

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

  if (!authService.isPremium() || marineData.isPremiumRequired) {
    renderLockedSurfCard(container);
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
              ${POPULAR_SURF_SPOTS.map((s) => {
                const isCurrent = nearestSpot?.id === s.id;
                const isPrem = authService.isPremium();
                const lockPrefix = (!isPrem && !isCurrent) ? '🔒 ' : '';
                const lockSuffix = (!isPrem && !isCurrent) ? ' [✦ Premium]' : '';
                return `<option value="${s.id}" ${isCurrent ? 'selected' : ''}>${lockPrefix}${s.name} (${s.country})${lockSuffix}</option>`;
              }).join('')}
            </optgroup>
          </select>
          ${!authService.isPremium() ? `
            <button type="button" id="surf-spots-upgrade-btn" class="surf-upgrade-btn" title="Débloquer tous les 15 spots">
              <span style="color:gold;">✦</span> Débloquer 15 spots
            </button>
          ` : ''}
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
      ${renderHourlySurfPreview(hourly, weatherData)}
    </article>
  `;

  // Écouteur pour le sélecteur de spots
  const select = container.querySelector('#surf-spot-select');
  if (select && onSelectSpot) {
    select.addEventListener('change', (e) => {
      const selectedId = e.target.value;
      const isPrem = authService.isPremium();
      if (!isPrem && selectedId !== (nearestSpot?.id || POPULAR_SURF_SPOTS[0].id)) {
        // Revert selection to current spot
        select.value = nearestSpot?.id || POPULAR_SURF_SPOTS[0].id;
        showPremiumModal();
        return;
      }
      const foundSpot = POPULAR_SURF_SPOTS.find((s) => s.id === selectedId);
      if (foundSpot) onSelectSpot(foundSpot);
    });
  }

  const upgradeBtn = container.querySelector('#surf-spots-upgrade-btn');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      showPremiumModal();
    });
  }
}

function renderLockedSurfCard(container) {
  container.innerHTML = `
    <article class="surf-card glass-card surf-card--locked" role="button" tabindex="0" aria-label="Débloquer les prévisions Surf et Océan avec Atmos Premium">
      <div class="surf-card__locked-preview" aria-hidden="true">
        <div class="surf-card__header"><div><span class="eyebrow">Surf &amp; Océan 🌊</span><h2 class="surf-card__title">Conditions du spot</h2></div><div class="surf-card__fake-select">Sélection du spot</div></div>
        <div class="surf-card__hero"><div class="surf-score-badge"><span class="surf-score-value">••</span><span class="surf-score-max">/ 100</span><span class="surf-score-status">Conditions</span></div>
          <div class="surf-metrics-grid">${['Hauteur Vagues', 'Période Houle', 'Direction Houle', 'Vent sur le spot'].map((label) => `<div class="surf-metric-box"><span class="surf-metric-label">${label}</span><span class="surf-metric-value">•••</span><span class="surf-metric-sub">••••••</span></div>`).join('')}</div>
        </div>
        <div class="surf-advice-banner"><span class="surf-advice-icon">🏄</span><div class="surf-advice-body"><strong>Analyse Atmos Surf</strong><p>••••••••••••••••••••••••••••••••••••</p></div></div>
        <div class="surf-hourly-section"><div class="surf-hourly-header"><span class="surf-hourly-title">Prévisions Surf Heure par Heure</span><span class="surf-hourly-badge">24 h</span></div><div class="surf-hourly-forecast">${Array.from({ length: 6 }, () => '<div class="surf-card__fake-hour">••<br>🌊<br>•••</div>').join('')}</div></div>
      </div>
      <div class="surf-card__premium-overlay"><span class="premium-lock-pill"><span>✦</span> Atmos Premium</span><strong>Surf &amp; Océan est réservé aux membres Premium</strong><button type="button" class="surf-upgrade-btn">Débloquer Premium</button></div>
    </article>`;
  const lockedCard = container.querySelector('.surf-card--locked');
  const unlock = () => showPremiumModal();
  lockedCard.addEventListener('click', unlock);
  lockedCard.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); unlock(); } });
}

function renderHourlySurfPreview(hourly = [], weatherData = null) {
  if (!hourly.length) return '';

  const next24Hours = hourly.slice(0, 24);
  const hourlyTimes = weatherData?.hourly?.time || [];
  const hourlyWindSpeeds = weatherData?.hourly?.windSpeed || [];
  const hourlyWindDirs = weatherData?.hourly?.windDirection || [];

  return `
    <div class="surf-hourly-section">
      <div class="surf-hourly-header">
        <span class="surf-hourly-title">Prévisions Surf Heure par Heure</span>
        <span class="surf-hourly-badge">24 h</span>
      </div>
      <div class="hourly-forecast surf-hourly-forecast" aria-label="Prévisions surf 24h">
        ${next24Hours
          .map((item) => {
            const hourLabel = formatIsoHour(item.time);
            const height = item.waveHeight != null ? `${Number(item.waveHeight).toFixed(1)}m` : '—';
            const period = item.swellPeriod != null ? `${Math.round(item.swellPeriod)}s` : '—';
            const dir = degreesToCardinal(item.swellDirection ?? item.waveDirection ?? 0);

            let windSpd = null;
            let windDir = null;
            if (hourlyTimes.length) {
              const idx = hourlyTimes.indexOf(item.time);
              if (idx !== -1) {
                windSpd = hourlyWindSpeeds[idx];
                windDir = hourlyWindDirs[idx];
              }
            }
            if (windSpd == null) windSpd = weatherData?.windSpeed;
            if (windDir == null) windDir = weatherData?.windDirection;

            const windText = windSpd != null ? `${Math.round(windSpd)} km/h` : '—';
            const windDirCard = windDir != null ? degreesToCardinal(windDir) : '';

            return `
              <article class="hourly-item hourly-item--surf" data-wave="${item.waveHeight ?? 0}">
                <span class="hourly-item__time">${hourLabel}</span>
                <span class="hourly-item__icon" aria-hidden="true">🌊</span>
                <strong class="hourly-item__temperature">${height}</strong>
                <span class="hourly-item__surf-period" title="Période de houle : ${period}">${period}</span>
                <span class="hourly-item__surf-dir" title="Direction houle : ${dir}">${dir}</span>
                <span class="hourly-item__surf-wind" title="Vent : ${windText} ${windDirCard}">💨 ${Math.round(windSpd ?? 0)}k</span>
              </article>
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
