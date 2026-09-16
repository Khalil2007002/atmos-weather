/**
 * Module d'intelligence météo pour le Surf et les Activités Outdoor (Phase 6 & 7)
 */

export function evaluateSurfConditions({
  waveHeight = 0,
  wavePeriod = 0,
  swellHeight = 0,
  swellPeriod = 0,
  windSpeed = 0,
  windDirection = 0,
  waveDirection = 0,
} = {}) {
  const height = Number(swellHeight || waveHeight || 0);
  const period = Number(swellPeriod || wavePeriod || 0);
  const wind = Number(windSpeed || 0);

  let heightScore = 0;
  let heightLabel = '';

  if (height < 0.4) {
    heightScore = 15;
    heightLabel = 'Micro-vagues (< 0.5 m)';
  } else if (height < 0.8) {
    heightScore = 55;
    heightLabel = 'Petites vagues faciles (0.5 – 0.8 m)';
  } else if (height <= 1.8) {
    heightScore = 100;
    heightLabel = 'Taille idéale (0.9 – 1.8 m)';
  } else if (height <= 2.8) {
    heightScore = 85;
    heightLabel = 'Vagues puissantes (1.9 – 2.8 m)';
  } else if (height <= 4.0) {
    heightScore = 60;
    heightLabel = 'Grosse houle / Confirmés (3 – 4 m)';
  } else {
    heightScore = 30;
    heightLabel = 'Conditions extrêmes (> 4 m)';
  }

  let periodScore = 0;
  let periodQuality = '';
  if (period < 7) {
    periodScore = 25;
    periodQuality = 'Houle courte et désordonnée';
  } else if (period < 10) {
    periodScore = 60;
    periodQuality = 'Période moyenne';
  } else if (period < 13) {
    periodScore = 90;
    periodQuality = 'Belle houle bien espacée';
  } else {
    periodScore = 100;
    periodQuality = 'Houle longue de haute qualité (World-Class)';
  }

  let windScore = 0;
  let windImpact = '';
  if (wind < 12) {
    windScore = 100;
    windImpact = 'Plan d’eau lisse (Glassy)';
  } else if (wind < 22) {
    windScore = 75;
    windImpact = 'Légère brise';
  } else if (wind < 35) {
    windScore = 45;
    windImpact = 'Clapot formé par le vent';
  } else {
    windScore = 15;
    windImpact = 'Vent fort / Plan d’eau haché';
  }

  const globalScore = Math.round(
    heightScore * 0.45 + periodScore * 0.35 + windScore * 0.2
  );

  let badge = { text: 'Session Praticable', color: '#ffb347' };
  if (globalScore >= 82) {
    badge = { text: 'Conditions Idéales 🔥', color: '#38ef7d' };
  } else if (globalScore >= 68) {
    badge = { text: 'Bonne Session ✨', color: '#11998e' };
  } else if (globalScore >= 45) {
    badge = { text: 'Session Accessible', color: '#4facfe' };
  } else if (globalScore >= 25) {
    badge = { text: 'Plan d’eau Agité ⚠️', color: '#f7971e' };
  } else {
    badge = { text: 'Déconseillé 🛑', color: '#e74c3c' };
  }

  return {
    score: globalScore,
    badge,
    heightLabel,
    periodQuality,
    windImpact,
    summary: `${height.toFixed(1)}m · ${Math.round(period)}s — ${badge.text}`,
    recommendation: generateSurfAdvice(height, period, wind, globalScore),
    waveHeight: height,
    wavePeriod: period,
    swellHeight: Number(swellHeight || height),
    windSpeed: wind,
    windDirection: Math.round(windDirection),
    waveDirection: Math.round(waveDirection),
  };
}

function generateSurfAdvice(height, period, wind, score) {
  if (score >= 80) {
    return 'Fenêtre météo exceptionnelle ! La houle est longue et propre, idéale pour une session mémorable.';
  }
  if (height < 0.6) {
    return 'Idéal pour l’apprentissage, le longboard ou le stand-up paddle. Peu de puissance.';
  }
  if (wind > 30) {
    return 'Le vent perturbe le plan d’eau. Privilégiez les baies abritées ou attendez la tombée du vent au crépuscule.';
  }
  if (period >= 12) {
    return 'Séries consistantes et puissantes espacées de plus de 12 secondes. Timing parfait sur les point-breaks.';
  }
  return 'Conditions navigables. Vérifiez la marée locale pour cibler le pic de marée montante.';
}

export function evaluateOutdoorActivities(weather) {
  const temp = Number(weather.temperature ?? 20);
  const wind = Number(weather.windSpeed ?? 10);
  const rainProb = Number(weather.hourly?.precipitationProbability?.[0] ?? 0);
  const uv = Number(weather.uvIndex ?? 4);
  const isNight = !weather.isDay;

  // 1. Randonnée
  let hikeScore = 80;
  if (rainProb > 40) hikeScore -= 35;
  if (rainProb > 70) hikeScore -= 35;
  if (temp < 6 || temp > 33) hikeScore -= 25;
  else if (temp >= 14 && temp <= 23) hikeScore += 15;
  if (wind > 35) hikeScore -= 20;
  if (isNight) hikeScore -= 30;
  hikeScore = Math.min(100, Math.max(10, Math.round(hikeScore)));

  // 2. Cyclisme / Vélo
  let cycleScore = 85;
  if (wind > 25) cycleScore -= 20;
  if (wind > 40) cycleScore -= 40;
  if (rainProb > 30) cycleScore -= 30;
  if (temp < 8 || temp > 34) cycleScore -= 25;
  if (isNight) cycleScore -= 25;
  cycleScore = Math.min(100, Math.max(10, Math.round(cycleScore)));

  // 3. Course à pied (Running)
  let runScore = 90;
  if (temp > 27) runScore -= 35; // Trop chaud pour courir confortablement
  else if (temp >= 10 && temp <= 18) runScore += 10;
  if (rainProb > 50) runScore -= 25;
  if (wind > 30) runScore -= 15;
  runScore = Math.min(100, Math.max(15, Math.round(runScore)));

  // 4. Plage & Détente
  let beachScore = 50;
  if (temp >= 24 && !isNight && rainProb < 20) beachScore = 95;
  else if (temp >= 21 && !isNight && rainProb < 30) beachScore = 75;
  else if (isNight) beachScore = 20;
  if (wind > 28) beachScore -= 25;
  beachScore = Math.min(100, Math.max(10, Math.round(beachScore)));

  // 5. Camping
  let campScore = 80;
  if (rainProb > 30) campScore -= 40;
  if (wind > 30) campScore -= 30;
  if (Number(weather.minTemperature ?? temp) < 8) campScore -= 25;
  campScore = Math.min(100, Math.max(10, Math.round(campScore)));

  const activities = [
    {
      id: 'running',
      name: 'Course à pied',
      icon: '🏃',
      score: runScore,
      status: getActivityStatus(runScore),
      advice: getRunAdvice(temp, wind, rainProb),
    },
    {
      id: 'cycling',
      name: 'Vélo & Cyclisme',
      icon: '🚴',
      score: cycleScore,
      status: getActivityStatus(cycleScore),
      advice: getCycleAdvice(wind, rainProb),
    },
    {
      id: 'hiking',
      name: 'Randonnée',
      icon: '🥾',
      score: hikeScore,
      status: getActivityStatus(hikeScore),
      advice: getHikeAdvice(temp, rainProb),
    },
    {
      id: 'beach',
      name: 'Plage & Détente',
      icon: '🏖️',
      score: beachScore,
      status: getActivityStatus(beachScore),
      advice: getBeachAdvice(temp, uv, wind),
    },
    {
      id: 'camping',
      name: 'Camping & Bivouac',
      icon: '⛺',
      score: campScore,
      status: getActivityStatus(campScore),
      advice: getCampAdvice(rainProb, wind),
    },
  ];

  return {
    activities,
    recommendation: buildNaturalLanguageSummary(activities, temp, rainProb),
  };
}

function getActivityStatus(score) {
  if (score >= 80) return { label: 'Excellent', class: 'status--good' };
  if (score >= 60) return { label: 'Favorable', class: 'status--fair' };
  if (score >= 40) return { label: 'Mitigé', class: 'status--moderate' };
  return { label: 'Déconseillé', class: 'status--poor' };
}

function getRunAdvice(temp, wind, rain) {
  if (temp > 25) return 'Privilégiez les heures fraîches en début de matinée.';
  if (rain > 40) return 'Risque d’averses, prévoyez un coupe-vent imperméable.';
  if (temp >= 10 && temp <= 18) return 'Température idéale pour performer sans surchauffe.';
  return 'Allure modérée recommandée.';
}

function getCycleAdvice(wind, rain) {
  if (wind > 30) return `Vent sensible (${Math.round(wind)} km/h), attention aux rafales latérales.`;
  if (rain > 40) return 'Chaussée glissante possible avec les précipitations.';
  return 'Conditions roulantes très agréables.';
}

function getHikeAdvice(temp, rain) {
  if (rain > 50) return 'Sentiers boueux probables, visibilité réduite.';
  if (temp > 28) return 'Hydratation essentielle et protection solaire requise.';
  return 'Excellente clarté pour partir sur les sentiers.';
}

function getBeachAdvice(temp, uv, wind) {
  if (uv >= 7) return `Indice UV très élevé (${Math.round(uv)}). Protection solaire 50+ indispensable.`;
  if (wind > 25) return 'Brise marine fraîche, sable volant possible.';
  if (temp >= 24) return 'Baignade et farniente très agréables.';
  return 'Météo un peu fraîche pour la baignade prolongée.';
}

function getCampAdvice(rain, wind) {
  if (rain > 40 || wind > 30) return 'Conditions venteuses ou humides pour la nuit sous tente.';
  return 'Nuit calme et propice au bivouac.';
}

function buildNaturalLanguageSummary(activities, temp, rain) {
  const best = activities.reduce((a, b) => (a.score > b.score ? a : b));
  if (rain > 50) {
    return `☔ Atmos signale un risque élevé de pluie (${rain}%). Les sorties extérieures nécessitent un équipement adapté.`;
  }
  if (best.score >= 80) {
    return `✨ Météo propice : conditions excellentes aujourd'hui pour ${best.name.toLowerCase()} avec ${Math.round(temp)}°C.`;
  }
  return `🌤️ Conditions globales tempérées (${Math.round(temp)}°C). Prévoyez vos activités selon l'évolution du ciel.`;
}

export function degreesToCardinal(degrees) {
  if (!Number.isFinite(degrees)) return '—';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  const index = Math.round((degrees % 360) / 22.5) % 16;
  return directions[index];
}
