import { evaluateOutdoorActivities } from '../utils/outdoor-analyzer.js';

export function renderOutdoorCard(weatherData) {
  const container = document.querySelector('#outdoor-section');
  if (!container) return;

  if (!weatherData) {
    container.innerHTML = `
      <div class="outdoor-placeholder glass-card">
        <p>Calcul des conditions outdoor…</p>
      </div>
    `;
    return;
  }

  const analysis = evaluateOutdoorActivities(weatherData);

  container.innerHTML = `
    <article class="outdoor-card glass-card" aria-label="Activités Outdoor et Recommandations">
      <div class="outdoor-card__header">
        <div>
          <p class="eyebrow">Outdoor &amp; Plein Air 🎯</p>
          <h2 class="outdoor-card__title" id="outdoor-title">
            Quelles activités pratiquer aujourd’hui ?
          </h2>
        </div>
        <span class="outdoor-card__badge">Indice Atmos</span>
      </div>

      <!-- Résumé Recommandation -->
      <div class="outdoor-summary-banner">
        <p>${escapeHtml(analysis.recommendation)}</p>
      </div>

      <!-- Grille des Activités -->
      <div class="outdoor-activities-grid">
        ${analysis.activities
          .map((act) => {
            const barWidth = Math.max(10, act.score);
            return `
              <div class="activity-box ${act.status.class}">
                <div class="activity-box__top">
                  <div class="activity-box__ident">
                    <span class="activity-box__icon" aria-hidden="true">${act.icon}</span>
                    <div>
                      <strong class="activity-box__name">${act.name}</strong>
                      <span class="activity-box__status">${act.status.label}</span>
                    </div>
                  </div>
                  <div class="activity-box__score">
                    <strong>${act.score}</strong><span>%</span>
                  </div>
                </div>

                <div class="activity-bar" role="progressbar" aria-valuenow="${act.score}" aria-valuemin="0" aria-valuemax="100">
                  <div class="activity-bar__fill" style="width: ${barWidth}%"></div>
                </div>

                <p class="activity-box__advice">${escapeHtml(act.advice)}</p>
              </div>
            `;
          })
          .join('')}
      </div>
    </article>
  `;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
