const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_GEOCODING_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const REQUEST_TIMEOUT_MS = 10_000;

/** Recherche et conversion de lieux, isolées de la météo et de l'interface. */
export async function searchLocations(query, { signal } = {}) {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  const directUrl = new URL(GEOCODING_ENDPOINT);
  directUrl.search = new URLSearchParams({
    name: normalizedQuery,
    count: '6',
    language: 'fr',
    format: 'json',
  }).toString();

  const urls = shouldUseLocalProxy()
    ? [createLocalUrl('/api/geocoding', { name: normalizedQuery }), directUrl]
    : [directUrl];
  const data = await requestFirstAvailable(urls, { signal });

  return (data.results || []).map(normalizeSearchResult).filter(Boolean);
}

export async function reverseGeocode(latitude, longitude, { signal } = {}) {
  const coordinates = { latitude: Number(latitude), longitude: Number(longitude) };
  if (!areValidCoordinates(coordinates)) throw new Error('Invalid coordinates');

  const url = shouldUseLocalProxy()
    ? createLocalUrl('/api/reverse-geocode', coordinates)
    : createReverseGeocodingUrl(coordinates);
  const data = await fetchJson(url, { signal });
  const location = normalizeReverseResult(data, coordinates);

  if (!location) throw new Error('Reverse geocoding response is incomplete');
  return location;
}

function normalizeSearchResult(result) {
  if (!result?.name || !areValidCoordinates(result)) return null;

  return {
    id: result.id ? String(result.id) : undefined,
    name: result.name,
    country: result.country || result.country_code || '—',
    countryCode: result.country_code || undefined,
    admin1: result.admin1 || undefined,
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
    timezone: result.timezone || undefined,
  };
}

function normalizeReverseResult(result, coordinates) {
  const address = result?.address || {};
  const name = address.city
    || address.town
    || address.village
    || address.municipality
    || address.county
    || address.state
    || result?.name
    || result?.display_name?.split(',')[0];
  const country = address.country || result?.display_name?.split(',').at(-1)?.trim();

  if (!name || !country) return null;

  return {
    name,
    country,
    countryCode: address.country_code?.toUpperCase(),
    admin1: address.state || undefined,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
}

function createReverseGeocodingUrl({ latitude, longitude }) {
  const url = new URL(REVERSE_GEOCODING_ENDPOINT);
  url.search = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    zoom: '10',
    addressdetails: '1',
    'accept-language': 'fr',
  }).toString();

  return url;
}

function createLocalUrl(path, params) {
  const url = new URL(path, window.location.origin);
  url.search = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
  return url;
}

function shouldUseLocalProxy() {
  if (typeof window === 'undefined') return false;
  return ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname);
}

async function requestFirstAvailable(urls, { signal } = {}) {
  let lastError;

  for (const url of urls) {
    try {
      return await fetchJson(url, { signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }

  throw lastError || new Error('Geocoding request failed');
}

async function fetchJson(url, { signal } = {}) {
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
    if (!response.ok) throw new Error(`Geocoding request failed (${response.status})`);
    return await response.json();
  } catch (error) {
    if (!signal?.aborted && controller.signal.aborted) {
      throw new Error('Geocoding request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

function areValidCoordinates({ latitude, longitude }) {
  return Number.isFinite(Number(latitude))
    && Number.isFinite(Number(longitude))
    && Math.abs(Number(latitude)) <= 90
    && Math.abs(Number(longitude)) <= 180;
}
