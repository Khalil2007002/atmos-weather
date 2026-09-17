import { createReadStream, existsSync, statSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const rootDirectory = fileURLToPath(new URL(process.argv.includes('--dist') ? './dist/' : './', import.meta.url));
const dataDirectory = resolve(rootDirectory, 'data');
const usersFilePath = resolve(dataDirectory, 'users.json');
const port = Number(process.env.PORT || 4173);
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const MARINE_ENDPOINT = 'https://marine-api.open-meteo.com/v1/marine';
const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_GEOCODING_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const reverseGeocodeCache = new Map();
let lastReverseGeocodeAt = 0;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

mkdirSync(dataDirectory, { recursive: true });

function loadUsers() {
  try {
    if (!existsSync(usersFilePath)) return [];
    return JSON.parse(readFileSync(usersFilePath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveUsers(users) {
  writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
}

function findUserByEmail(email) {
  const users = loadUsers();
  const target = (email || '').trim().toLowerCase();
  return users.find(u => (u.email || '').trim().toLowerCase() === target);
}

function findUserByToken(token) {
  const users = loadUsers();
  return users.find(u => u.sessions && u.sessions.some(t => {
    try {
      const b1 = Buffer.from(t, 'hex');
      const b2 = Buffer.from(token, 'hex');
      if (b1.length !== b2.length) return false;
      return timingSafeEqual(b1, b2);
    } catch {
      return false;
    }
  }));
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, storedHash) {
  try {
    const hash = scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (hash.length !== storedBuf.length) return false;
    return timingSafeEqual(hash, storedBuf);
  } catch {
    return false;
  }
}

function generateToken() {
  return randomBytes(32).toString('hex');
}

async function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    if (request.method !== 'POST') return reject(new Error('Must be POST'));
    const contentType = request.headers['content-type'] || '';
    if (!contentType.includes('application/json')) return reject(new Error('Must be JSON'));

    let body = '';
    request.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 10 * 1024) {
        request.destroy();
        reject(new Error('Body too large'));
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    request.on('error', reject);
  });
}

function createUserPublicProfile(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    tier: user.tier,
    subscription: user.subscription,
    createdAt: user.createdAt
  };
}

async function handleRegister(request, response) {
  try {
    const body = await readJsonBody(request);
    const email = (body.email || '').trim().toLowerCase();
    const name = (body.name || '').trim();
    const password = body.password || '';

    if (!email || !email.includes('@') || !email.includes('.')) {
      return sendJson(response, 400, { error: 'Veuillez saisir une adresse email valide' });
    }
    if (!name || name.length < 2) {
      return sendJson(response, 400, { error: 'Le nom doit comporter au moins 2 caractères' });
    }
    if (!password || password.length < 8) {
      return sendJson(response, 400, { error: 'Le mot de passe doit comporter au moins 8 caractères' });
    }
    
    const users = loadUsers();
    if (users.some(u => (u.email || '').trim().toLowerCase() === email)) {
      return sendJson(response, 400, { error: 'Cette adresse email est déjà utilisée' });
    }
    
    const { salt, hash: passwordHash } = hashPassword(password);
    const token = generateToken();
    const user = {
      id: randomBytes(16).toString('hex'),
      email,
      name,
      passwordHash,
      salt,
      tier: 'free',
      subscription: null,
      sessions: [token],
      createdAt: new Date().toISOString()
    };
    
    users.push(user);
    saveUsers(users);
    sendJson(response, 201, { user: createUserPublicProfile(user), token });
  } catch (err) {
    sendJson(response, 400, { error: err.message || 'Erreur lors de la création du compte' });
  }
}

async function handleLogin(request, response) {
  try {
    const body = await readJsonBody(request);
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';

    if (!email || !password) {
      return sendJson(response, 400, { error: 'Email et mot de passe requis' });
    }

    const users = loadUsers();
    const user = users.find(u => (u.email || '').trim().toLowerCase() === email);
    
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      return sendJson(response, 401, { error: 'Email ou mot de passe incorrect' });
    }
    
    const token = generateToken();
    user.sessions = user.sessions || [];
    user.sessions.push(token);
    saveUsers(users);
    
    sendJson(response, 200, { user: createUserPublicProfile(user), token });
  } catch (err) {
    sendJson(response, 400, { error: err.message || 'Erreur lors de la connexion' });
  }
}

function extractToken(request) {
  const auth = request.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.substring(7);
  return null;
}

async function handleGetMe(request, response) {
  const token = extractToken(request);
  if (!token) return sendJson(response, 401, { error: 'Non authentifié' });
  
  const user = findUserByToken(token);
  if (!user) return sendJson(response, 401, { error: 'Non authentifié' });
  
  sendJson(response, 200, { user: createUserPublicProfile(user) });
}

async function handleLogout(request, response) {
  const token = extractToken(request);
  if (!token) return sendJson(response, 401, { error: 'Non authentifié' });
  
  const users = loadUsers();
  const user = users.find(u => u.sessions && u.sessions.includes(token));
  if (user) {
    user.sessions = user.sessions.filter(t => t !== token);
    saveUsers(users);
  }
  
  sendJson(response, 200, { message: 'Déconnexion réussie' });
}

async function handlePremiumCheckout(request, response) {
  const token = extractToken(request);
  if (!token) return sendJson(response, 401, { error: 'Non authentifié' });
  
  const user = findUserByToken(token);
  if (!user) return sendJson(response, 401, { error: 'Non authentifié' });
  
  if (user.tier === 'premium') return sendJson(response, 400, { error: 'Déjà abonné Premium' });
  
  try {
    const body = await readJsonBody(request);
    const { plan } = body;
    
    if (!STRIPE_SECRET_KEY) {
      return sendJson(response, 503, { error: 'Le système de paiement n\'est pas encore configuré. Veuillez contacter l\'administrateur.', code: 'PAYMENT_NOT_CONFIGURED' });
    }
    
    // Stripe checkout session creation would go here
    return sendJson(response, 503, { error: 'Le système de paiement n\'est pas encore configuré. Veuillez contacter l\'administrateur.', code: 'PAYMENT_NOT_CONFIGURED' });
  } catch (err) {
    sendJson(response, 400, { error: err.message });
  }
}

async function handlePremiumWebhook(request, response) {
  if (!STRIPE_WEBHOOK_SECRET) return sendJson(response, 503, { error: 'Webhook non configuré' });
  
  // Stripe webhook verification and event handling would go here
  // This is where user.tier = 'premium' and user.subscription = {...} would be set
  sendJson(response, 200, { received: true });
}

async function handlePremiumCancel(request, response) {
  const token = extractToken(request);
  if (!token) return sendJson(response, 401, { error: 'Non authentifié' });
  
  const user = findUserByToken(token);
  if (!user) return sendJson(response, 401, { error: 'Non authentifié' });
  
  if (user.tier !== 'premium') return sendJson(response, 400, { error: 'Aucun abonnement actif' });
  
  if (!STRIPE_SECRET_KEY) return sendJson(response, 503, { error: 'Le système de paiement n\'est pas encore configuré.' });
  
  // Stripe cancellation would go here
  sendJson(response, 200, { message: 'Abonnement annulé' });
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
  const requestedPath = requestUrl.pathname;

  // En-têtes CORS pour toutes les requêtes API
  if (requestedPath.startsWith('/api/')) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
  }

  if (requestedPath === '/api/auth/register' && request.method === 'POST') { await handleRegister(request, response); return; }
  if (requestedPath === '/api/auth/login' && request.method === 'POST') { await handleLogin(request, response); return; }
  if (requestedPath === '/api/auth/me' && request.method === 'GET') { await handleGetMe(request, response); return; }
  if (requestedPath === '/api/auth/logout' && request.method === 'POST') { await handleLogout(request, response); return; }
  if (requestedPath === '/api/premium/checkout' && request.method === 'POST') { await handlePremiumCheckout(request, response); return; }
  if (requestedPath === '/api/premium/webhook' && request.method === 'POST') { await handlePremiumWebhook(request, response); return; }
  if (requestedPath === '/api/premium/cancel' && request.method === 'POST') { await handlePremiumCancel(request, response); return; }

  if (requestedPath === '/api/weather') {
    await proxyWeather(requestUrl, response);
    return;
  }

  if (requestedPath === '/api/marine') {
    await proxyMarine(requestUrl, request, response);
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
});

let currentPort = port;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Atmos] Port ${currentPort} indisponible, tentative sur ${currentPort + 1}...`);
    currentPort++;
    server.listen(currentPort, '127.0.0.1');
  } else {
    console.error('[Atmos] Erreur serveur:', err);
  }
});

server.listen(currentPort, '127.0.0.1', () => {
  console.log(`Atmos is running at http://127.0.0.1:${currentPort}`);
});

async function proxyWeather(requestUrl, response) {
  const latitude = Number(requestUrl.searchParams.get('latitude'));
  const longitude = Number(requestUrl.searchParams.get('longitude'));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    sendJson(response, 400, { error: 'Invalid weather coordinates' });
    return;
  }

  const upstreamUrl = new URL(FORECAST_ENDPOINT);
  const params = new URLSearchParams(requestUrl.searchParams);
  if (!params.has('current')) {
    params.set('current', 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,visibility');
  }
  if (!params.has('hourly')) {
    params.set('hourly', 'temperature_2m,weather_code,precipitation_probability,wind_speed_10m,wind_direction_10m,relative_humidity_2m,uv_index');
  }
  if (!params.has('daily')) {
    params.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset,uv_index_max');
  }
  if (!params.has('timezone')) params.set('timezone', 'auto');
  if (!params.has('forecast_days')) params.set('forecast_days', '16');
  upstreamUrl.search = params.toString();

  await proxyJson(upstreamUrl, response);
}

async function proxyMarine(requestUrl, request, response) {
  const latitude = Number(requestUrl.searchParams.get('latitude'));
  const longitude = Number(requestUrl.searchParams.get('longitude'));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    sendJson(response, 400, { error: 'Invalid marine coordinates' });
    return;
  }

  const token = extractToken(request);
  const user = token ? findUserByToken(token) : null;
  const isPremium = user && user.tier === 'premium';

  const upstreamUrl = new URL(MARINE_ENDPOINT);
  const params = new URLSearchParams(requestUrl.searchParams);
  if (!params.has('hourly')) {
    params.set('hourly', 'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,swell_wave_peak_period,wind_wave_height');
  }
  if (!params.has('daily')) {
    params.set('daily', 'wave_height_max,wave_direction_dominant,wave_period_max');
  }
  if (!params.has('timezone')) params.set('timezone', 'auto');
  if (!params.has('forecast_days')) params.set('forecast_days', '7');
  upstreamUrl.search = params.toString();

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstreamResponse.ok) {
      sendJson(response, 502, { error: 'Marine provider unavailable' });
      return;
    }

    const payload = await upstreamResponse.json();

    if (!isPremium) {
      // SÉCURITÉ SERVEUR : Les prévisions de surf détaillées (données horaires, vagues, houle)
      // ne sont JAMAIS envoyées aux utilisateurs Free
      sendJson(response, 200, {
        latitude: payload.latitude,
        longitude: payload.longitude,
        elevation: payload.elevation,
        timezone: payload.timezone,
        isPremiumRequired: true,
        isCoastal: true,
        current: null,
        hourly: null,
        daily: null,
        message: 'Prévisions détaillées de surf réservées aux membres Atmos Premium.'
      });
      return;
    }

    sendJson(response, 200, payload);
  } catch {
    sendJson(response, 502, { error: 'Marine provider unavailable' });
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
