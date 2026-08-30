const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT_MS = 12_000;

const WEATHER_PARAMETERS = {
  current:
    'temperature_2m,apparent_temperature,weather_code,is_day',

  hourly:
    'temperature_2m,weather_code,precipitation_probability',

  daily:
    'temperature_2m_max,temperature_2m_min',

  timezone: 'auto',
  forecast_days: '2',
};

/**
 * Couche d'accès à Open-Meteo : aucun composant d'interface ne dépend de sa réponse brute.
 * Cette frontière permet de remplacer le fournisseur sans modifier le rendu.
 */
export async function getCurrentWeather(location, { signal } = {}) {
  const requests = shouldUseLocalProxy()
    ? [createLocalProxyUrl(location), createOpenMeteoUrl(location)]
    : [createOpenMeteoUrl(location)];

  let lastError;

  for (const url of requests) {
    try {
      const data = await fetchWeatherData(url, { signal });
      return normalizeWeather(data, location);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }

  throw lastError || new Error('Weather request failed');
}

function createOpenMeteoUrl(location) {
  const url = new URL(FORECAST_ENDPOINT);

  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    ...WEATHER_PARAMETERS,
  }).toString();

  return url;
}

function createLocalProxyUrl(location) {
  const url = new URL('/api/weather', window.location.origin);

  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
  }).toString();

  return url;
}

function shouldUseLocalProxy() {
  if (typeof window === 'undefined') return false;

  return ['127.0.0.1', 'localhost', '::1'].includes(
    window.location.hostname,
  );
}

async function fetchWeatherData(url, { signal } = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  const abortFromCaller = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      abortFromCaller();
    } else {
      signal.addEventListener('abort', abortFromCaller, {
        once: true,
      });
    }
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Weather request failed (${response.status})`,
      );
    }

    return await response.json();
  } catch (error) {
    if (
      !signal?.aborted &&
      controller.signal.aborted
    ) {
      throw new Error('Weather request timed out');
    }

    throw error;
  } finally {
    clearTimeout(timeout);

    signal?.removeEventListener(
      'abort',
      abortFromCaller,
    );
  }
}

function normalizeWeather(data, location) {
  const current = data.current;
  const hourly = data.hourly;
  const daily = data.daily;

  if (
    !current ||
    !hourly?.time?.length ||
    !hourly?.temperature_2m?.length ||
    !daily?.temperature_2m_max?.length ||
    !daily?.temperature_2m_min?.length
  ) {
    throw new Error('Weather response is incomplete');
  }

  return {
    location: {
      name: location.name,
      country: location.country,
      timezone: data.timezone || 'UTC',
    },

    temperature: current.temperature_2m,
    apparentTemperature: current.apparent_temperature,
    weatherCode: current.weather_code,
    isDay: Boolean(current.is_day),

    minTemperature: daily.temperature_2m_min[0],
    maxTemperature: daily.temperature_2m_max[0],

    observedAt: current.time,

    hourly: {
      time: hourly.time,
      temperature: hourly.temperature_2m,
      weatherCode: hourly.weather_code,
      precipitationProbability:
        hourly.precipitation_probability || [],
    },
  };
}