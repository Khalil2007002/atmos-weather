const MARINE_ENDPOINT = 'https://marine-api.open-meteo.com/v1/marine';
const REQUEST_TIMEOUT_MS = 12_000;

export const POPULAR_SURF_SPOTS = [
  { id: 'rabat-oudayas', name: 'Rabat — Les Oudayas', country: 'Maroc', latitude: 34.032, longitude: -6.837, type: 'Point break / Beach break' },
  { id: 'skhirat', name: 'Skhirat Plage', country: 'Maroc', latitude: 33.856, longitude: -7.039, type: 'Beach break' },
  { id: 'mehdia', name: 'Mehdia Beach', country: 'Maroc', latitude: 34.258, longitude: -6.674, type: 'Beach break puissant' },
  { id: 'dar-bouazza', name: 'Dar Bouazza (Jack Beach)', country: 'Maroc', latitude: 33.528, longitude: -7.821, type: 'Reef & Point' },
  { id: 'taghazout', name: 'Taghazout — Anchor Point', country: 'Maroc', latitude: 30.548, longitude: -9.714, type: 'World-class Right Point' },
  { id: 'imsouane', name: 'Imsouane — La Baie', country: 'Maroc', latitude: 30.841, longitude: -9.827, type: 'Longboard Paradise' },
  { id: 'safi', name: 'Safi — Ras Lafaa', country: 'Maroc', latitude: 32.321, longitude: -9.261, type: 'Tubular Right Reef' },
  { id: 'essaouira', name: 'Essaouira — Sidi Kaouki', country: 'Maroc', latitude: 31.353, longitude: -9.797, type: 'Beach break & Wind' },
  { id: 'dakhla', name: 'Dakhla — Foum Labouir', country: 'Maroc', latitude: 23.708, longitude: -15.942, type: 'Point break' },
  { id: 'mirleft', name: 'Mirleft — Imin Turga', country: 'Maroc', latitude: 29.584, longitude: -10.043, type: 'Beach break' },
  { id: 'hossegor', name: 'Hossegor — La Gravière', country: 'France', latitude: 43.666, longitude: -1.442, type: 'Heavy Beach break' },
  { id: 'biarritz', name: 'Biarritz — Côte des Basques', country: 'France', latitude: 43.479, longitude: -1.568, type: 'Beach & Longboard' },
  { id: 'nazare', name: 'Nazaré — Praia do Norte', country: 'Portugal', latitude: 39.604, longitude: -9.085, type: 'Big Wave Giant' },
  { id: 'ericeira', name: 'Ericeira — Ribeira d\'Ilhas', country: 'Portugal', latitude: 38.988, longitude: -9.419, type: 'World Surf Reserve' },
  { id: 'peniche', name: 'Peniche — Supertubos', country: 'Portugal', latitude: 39.345, longitude: -9.362, type: 'European Pipeline' },
];

export async function getMarineForecast(location, { signal } = {}) {
  const requests = shouldUseLocalProxy()
    ? [createLocalProxyUrl(location), createMarineUrl(location)]
    : [createMarineUrl(location)];

  let lastError;

  for (const url of requests) {
    try {
      const data = await fetchMarineData(url, { signal });
      return normalizeMarineData(data, location);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }

  // En cas d'erreur ou d'emplacement terrestre, chercher le spot le plus proche
  const nearest = findNearestSurfSpot(location.latitude, location.longitude);
  return {
    isCoastal: false,
    nearestSpot: nearest,
    error: lastError?.message || 'Marine request failed',
  };
}

function createMarineUrl(location) {
  const url = new URL(MARINE_ENDPOINT);
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: 'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,swell_wave_peak_period,wind_wave_height',
    daily: 'wave_height_max,wave_direction_dominant,wave_period_max',
    timezone: 'auto',
    forecast_days: '7',
  }).toString();
  return url;
}

function createLocalProxyUrl(location) {
  const url = new URL('/api/marine', window.location.origin);
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
  }).toString();
  return url;
}

function shouldUseLocalProxy() {
  if (typeof window === 'undefined') return false;
  return ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname);
}

async function fetchMarineData(url, { signal } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) abortFromCaller();
    else signal.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Marine request failed (${response.status})`);
    }

    return await response.json();
  } catch (error) {
    if (!signal?.aborted && controller.signal.aborted) {
      throw new Error('Marine request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

function normalizeMarineData(data, location) {
  const hourly = data.hourly;
  if (!hourly?.time?.length || !hourly?.wave_height) {
    throw new Error('No marine data available');
  }

  // Vérifier si toutes les valeurs sont nulles (position terrestre)
  const validWaveHeights = hourly.wave_height.filter((v) => v !== null && Number.isFinite(Number(v)));
  if (validWaveHeights.length === 0) {
    const nearest = findNearestSurfSpot(location.latitude, location.longitude);
    return {
      isCoastal: false,
      nearestSpot: nearest,
    };
  }

  const nowIndex = findCurrentHourIndex(hourly.time);
  const currentWaveHeight = hourly.wave_height[nowIndex] ?? validWaveHeights[0];
  const currentWavePeriod = hourly.wave_period?.[nowIndex] ?? 0;
  const currentWaveDirection = hourly.wave_direction?.[nowIndex] ?? 0;
  const currentSwellHeight = hourly.swell_wave_height?.[nowIndex] ?? currentWaveHeight;
  const currentSwellPeriod = hourly.swell_wave_peak_period?.[nowIndex] ?? hourly.swell_wave_period?.[nowIndex] ?? currentWavePeriod;
  const currentSwellDirection = hourly.swell_wave_direction?.[nowIndex] ?? currentWaveDirection;
  const currentWindWaveHeight = hourly.wind_wave_height?.[nowIndex] ?? 0;

  // 24 prochaines heures de surf
  const hours24 = [];
  for (let i = nowIndex; i < Math.min(nowIndex + 24, hourly.time.length); i++) {
    hours24.push({
      time: hourly.time[i],
      waveHeight: hourly.wave_height[i],
      wavePeriod: hourly.wave_period?.[i],
      waveDirection: hourly.wave_direction?.[i],
      swellHeight: hourly.swell_wave_height?.[i],
      swellPeriod: hourly.swell_wave_peak_period?.[i] ?? hourly.swell_wave_period?.[i],
      swellDirection: hourly.swell_wave_direction?.[i],
    });
  }

  // Prévisions 7 jours
  const daily = data.daily || {};
  const days7 = (daily.time || []).map((date, idx) => ({
    date,
    waveHeightMax: daily.wave_height_max?.[idx] ?? null,
    wavePeriodMax: daily.wave_period_max?.[idx] ?? null,
    dominantDirection: daily.wave_direction_dominant?.[idx] ?? null,
  }));

  const nearestSpot = findNearestSurfSpot(location.latitude, location.longitude);

  return {
    isCoastal: true,
    location,
    nearestSpot,
    current: {
      waveHeight: Number(currentWaveHeight),
      wavePeriod: Number(currentWavePeriod),
      waveDirection: Number(currentWaveDirection),
      swellHeight: Number(currentSwellHeight),
      swellPeriod: Number(currentSwellPeriod),
      swellDirection: Number(currentSwellDirection),
      windWaveHeight: Number(currentWindWaveHeight),
    },
    hourly: hours24,
    daily: days7,
  };
}

function findCurrentHourIndex(times) {
  const now = new Date();
  const currentIsoHour = now.toISOString().slice(0, 13); // 'YYYY-MM-DDTHH'
  const index = times.findIndex((t) => t.startsWith(currentIsoHour));
  return index >= 0 ? index : 0;
}

export function findNearestSurfSpot(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return POPULAR_SURF_SPOTS[0];

  let closest = POPULAR_SURF_SPOTS[0];
  let minDistance = Infinity;

  for (const spot of POPULAR_SURF_SPOTS) {
    const d = calculateDistance(lat, lon, spot.latitude, spot.longitude);
    if (d < minDistance) {
      minDistance = d;
      closest = spot;
    }
  }

  return {
    ...closest,
    distanceKm: Math.round(minDistance),
  };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon de la terre en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
