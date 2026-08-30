import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = fileURLToPath(new URL(process.argv.includes('--dist') ? './dist/' : './', import.meta.url));
const port = Number(process.env.PORT || 4173);
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_GEOCODING_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const reverseGeocodeCache = new Map();
let lastReverseGeocodeAt = 0;

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
  const requestedPath = requestUrl.pathname;

  if (requestedPath === '/api/weather') {
    await proxyWeather(requestUrl, response);
    return;
  }

  if (requestedPath === '/api/geocoding') {
    await proxyGeocoding(requestUrl, response);
    return;
  }

  if (requestedPath === '/api/reverse-geocode') {
    await proxyReverseGeocoding(requestUrl, response);
    return;
  }

  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '');
  const filePath = resolve(rootDirectory, normalize(relativePath));

  if (!filePath.startsWith(rootDirectory) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Atmos is running at http://127.0.0.1:${port}`);
});

async function proxyWeather(requestUrl, response) {
  const latitude = Number(requestUrl.searchParams.get('latitude'));
  const longitude = Number(requestUrl.searchParams.get('longitude'));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    sendJson(response, 400, { error: 'Invalid weather coordinates' });
    return;
  }

  const upstreamUrl = new URL(FORECAST_ENDPOINT);
  upstreamUrl.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '1',
  }).toString();

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await upstreamResponse.text();

    response.writeHead(upstreamResponse.ok ? 200 : 502, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(payload);
  } catch {
    sendJson(response, 502, { error: 'Weather provider unavailable' });
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function proxyGeocoding(requestUrl, response) {
  const name = requestUrl.searchParams.get('name')?.trim();
  if (!name || name.length < 2 || name.length > 100) {
    sendJson(response, 400, { error: 'Invalid location query' });
    return;
  }

  const upstreamUrl = new URL(GEOCODING_ENDPOINT);
  upstreamUrl.search = new URLSearchParams({
    name,
    count: '6',
    language: 'fr',
    format: 'json',
  }).toString();

  await proxyJson(upstreamUrl, response);
}

async function proxyReverseGeocoding(requestUrl, response) {
  const latitude = Number(requestUrl.searchParams.get('latitude'));
  const longitude = Number(requestUrl.searchParams.get('longitude'));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    sendJson(response, 400, { error: 'Invalid reverse geocoding coordinates' });
    return;
  }

  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) {
    sendJson(response, 200, cached);
    return;
  }

  const millisecondsUntilNextRequest = Math.max(0, 1_100 - (Date.now() - lastReverseGeocodeAt));
  if (millisecondsUntilNextRequest) {
    await new Promise((resolve) => setTimeout(resolve, millisecondsUntilNextRequest));
  }

  const upstreamUrl = new URL(REVERSE_GEOCODING_ENDPOINT);
  upstreamUrl.search = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    zoom: '10',
    addressdetails: '1',
    'accept-language': 'fr',
  }).toString();

  lastReverseGeocodeAt = Date.now();

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Atmos Weather Prototype/0.2 (local development)',
        Referer: `http://127.0.0.1:${port}/`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await upstreamResponse.json();

    if (!upstreamResponse.ok) {
      sendJson(response, 502, { error: 'Reverse geocoding provider unavailable' });
      return;
    }

    if (reverseGeocodeCache.size >= 50) reverseGeocodeCache.delete(reverseGeocodeCache.keys().next().value);
    reverseGeocodeCache.set(cacheKey, payload);
    sendJson(response, 200, payload);
  } catch {
    sendJson(response, 502, { error: 'Reverse geocoding provider unavailable' });
  }
}

async function proxyJson(upstreamUrl, response) {
  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await upstreamResponse.text();

    response.writeHead(upstreamResponse.ok ? 200 : 502, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(payload);
  } catch {
    sendJson(response, 502, { error: 'Geocoding provider unavailable' });
  }
}
