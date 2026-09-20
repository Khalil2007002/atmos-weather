import { createHmac } from 'node:crypto';
import {
  DatabaseConfigurationError,
  consumeRateLimit,
  createSession,
  createUser,
  deleteResetCode,
  deleteSession,
  deleteSessionsForUser,
  deleteUser,
  getLatestResetForEmail,
  getResetByToken,
  getUserByEmail,
  getUserById,
  getUserBySessionHash,
  getUserBySubscriptionId,
  markResetUsed,
  recordResetAttempt,
  replaceResetCode,
  setSubscriptionForUser,
  updatePassword,
  updateUserName,
  verifyResetCode,
} from './_lib/database.js';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  SecurityConfigurationError,
  createId,
  createResetCode,
  createSessionToken,
  expiredSessionCookie,
  hashResetValue,
  hashToken,
  hasSameOrigin,
  parseCookies,
  requestIp,
  requestOrigin,
  safeEqual,
  sessionCookie,
  validateSecurityConfiguration,
  verifyPassword,
  hashPassword,
} from './_lib/security.js';
import { isEmailConfigured, sendPasswordResetEmail } from './_lib/email-service.js';

const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const MARINE_ENDPOINT = 'https://marine-api.open-meteo.com/v1/marine';
const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_GEOCODING_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const LEGAL_VERSION = '2026-09-20';
const RESET_TTL_MS = 10 * 60 * 1000;
const RESET_RESEND_DELAY_MS = 60 * 1000;
const MAX_RESET_ATTEMPTS = 5;

export default async function handler(request, response) {
  setSecurityHeaders(response);
  if (request.method === 'OPTIONS') return sendEmpty(response, 204);

  try {
    validateSecurityConfiguration();
    const url = new URL(request.url || '/', requestOrigin(request) || 'http://localhost');
    const path = url.pathname;

    if (path === '/api/auth/register' && request.method === 'POST') return register(request, response);
    if (path === '/api/auth/login' && request.method === 'POST') return login(request, response);
    if (path === '/api/auth/me' && request.method === 'GET') return me(request, response);
    if (path === '/api/auth/logout' && request.method === 'POST') return logout(request, response);
    if (path === '/api/auth/password-reset/request' && request.method === 'POST') return requestPasswordReset(request, response);
    if (path === '/api/auth/password-reset/verify' && request.method === 'POST') return verifyPasswordReset(request, response);
    if (path === '/api/auth/password-reset/confirm' && request.method === 'POST') return confirmPasswordReset(request, response);

    if (path === '/api/premium/checkout' && request.method === 'POST') return createCheckout(request, response);
    if (path === '/api/premium/webhook' && request.method === 'POST') return stripeWebhook(request, response);
    if (path === '/api/premium/cancel' && request.method === 'POST') return cancelSubscription(request, response);

    if (path === '/api/account/export' && request.method === 'GET') return exportAccount(request, response);
    if (path === '/api/account' && request.method === 'PATCH') return updateAccount(request, response);
    if (path === '/api/account' && request.method === 'DELETE') return removeAccount(request, response);

    if (path === '/api/weather' && request.method === 'GET') return proxyWeather(url, response);
    if (path === '/api/marine' && request.method === 'GET') return proxyMarine(request, url, response);
    if (path === '/api/geocoding' && request.method === 'GET') return proxyGeocoding(url, response);
    if (path === '/api/reverse-geocode' && request.method === 'GET') return proxyReverseGeocoding(url, request, response);

    return sendJson(response, 404, { error: 'Route API introuvable.' });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError || error instanceof SecurityConfigurationError) {
      return sendJson(response, 503, { error: 'Le service de compte est temporairement indisponible.', code: 'SERVICE_NOT_CONFIGURED' });
    }
    if (error?.message === 'INVALID_JSON') return sendJson(response, 400, { error: 'La requête doit contenir un JSON valide.' });
    if (error?.message === 'BODY_TOO_LARGE') return sendJson(response, 413, { error: 'La requête est trop volumineuse.' });
    console.error('[Atmos API]', error);
    return sendJson(response, 500, { error: 'Une erreur serveur est survenue. Réessayez dans quelques instants.' });
  }
}

async function register(request, response) {
  if (!requireSameOrigin(request, response)) return;
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const acceptedTerms = body.acceptedTerms === true;

  if (!isEmail(email)) return sendJson(response, 400, { error: 'Veuillez saisir une adresse email valide.' });
  if (name.length < 2 || name.length > 80) return sendJson(response, 400, { error: 'Le nom doit comporter entre 2 et 80 caractères.' });
  if (!isValidPassword(password)) return sendJson(response, 400, { error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  if (!acceptedTerms) return sendJson(response, 400, { error: 'Vous devez accepter les Conditions d’utilisation et la Politique de confidentialité.' });
  if (!await consumeRateLimit(`register:${requestIp(request)}`, 5, 60 * 60)) {
    return sendJson(response, 429, { error: 'Trop de tentatives. Réessayez dans une heure.' });
  }

  if (await getUserByEmail(email)) return sendJson(response, 409, { error: 'Cette adresse email est déjà utilisée.' });

  const credentials = await hashPassword(password);
  const now = new Date().toISOString();
  const user = await createUser({
    id: createId(), email, name, passwordHash: credentials.hash, passwordSalt: credentials.salt,
    termsVersion: LEGAL_VERSION, termsAcceptedAt: now, createdAt: now,
  });
  await authenticateUser(user, request, response, 201);
}

async function login(request, response) {
  if (!requireSameOrigin(request, response)) return;
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!isEmail(email) || !password) return sendJson(response, 400, { error: 'Email et mot de passe requis.' });
  if (!await consumeRateLimit(`login:${requestIp(request)}`, 10, 15 * 60) || !await consumeRateLimit(`login-email:${email}`, 8, 15 * 60)) {
    return sendJson(response, 429, { error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  }
  const user = await getUserByEmail(email);
  if (!user || !await verifyPassword(password, user.password_salt ?? user.passwordSalt, user.password_hash ?? user.passwordHash)) {
    return sendJson(response, 401, { error: 'Email ou mot de passe incorrect.' });
  }
  await authenticateUser(user, request, response);
}

async function me(request, response) {
  const user = await currentUser(request);
  if (!user) return sendJson(response, 401, { error: 'Non authentifié.' });
  return sendJson(response, 200, { user: publicUser(user) });
}

async function logout(request, response) {
  if (!requireSameOrigin(request, response)) return;
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) await deleteSession(hashToken(token));
  response.setHeader('Set-Cookie', expiredSessionCookie(request));
  return sendJson(response, 200, { message: 'Déconnexion réussie.' });
}

async function requestPasswordReset(request, response) {
  if (!requireSameOrigin(request, response)) return;
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const genericResponse = { message: 'Si un compte correspond à cette adresse, vous recevrez un code dans quelques instants.' };
  if (!isEmail(email)) return sendJson(response, 400, { error: 'Veuillez saisir une adresse email valide.' });
  if (!isEmailConfigured()) return sendJson(response, 503, { error: 'Le service de récupération est temporairement indisponible.', code: 'EMAIL_NOT_CONFIGURED' });
  if (!await consumeRateLimit(`reset-ip:${requestIp(request)}`, 8, 60 * 60) || !await consumeRateLimit(`reset-email:${email}`, 4, 60 * 60)) {
    return sendJson(response, 429, { error: 'Trop de demandes. Réessayez plus tard.' });
  }

  const user = await getUserByEmail(email);
  if (!user) return sendJson(response, 200, genericResponse);

  const priorReset = await getLatestResetForEmail(email);
  if (priorReset?.lastSentAt && Date.now() - Date.parse(priorReset.lastSentAt) < RESET_RESEND_DELAY_MS) {
    return sendJson(response, 429, { error: 'Attendez une minute avant de demander un nouveau code.', code: 'RESET_RESEND_DELAY' });
  }

  const code = createResetCode();
  const now = new Date();
  const reset = {
    id: createId(), userId: user.id, codeHash: hashResetValue(`${email}:${code}`),
    expiresAt: new Date(now.getTime() + RESET_TTL_MS).toISOString(),
    attempts: 0, lastSentAt: now.toISOString(), createdAt: now.toISOString(),
  };
  await replaceResetCode(reset);
  try {
    await sendPasswordResetEmail({ to: email, code });
  } catch (error) {
    await deleteResetCode(reset.id);
    // Return the same generic response as for an unknown email: delivery failures must not reveal account existence.
    console.error('[Atmos Email]', error);
  }
  return sendJson(response, 200, { ...genericResponse, resendAvailableAt: new Date(now.getTime() + RESET_RESEND_DELAY_MS).toISOString() });
}

async function verifyPasswordReset(request, response) {
  if (!requireSameOrigin(request, response)) return;
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const code = String(body.code || '').replace(/\D/g, '');
  if (!isEmail(email) || !/^\d{6}$/.test(code)) return sendJson(response, 400, { error: 'Saisissez le code à 6 chiffres reçu par email.' });
  if (!await consumeRateLimit(`reset-verify:${requestIp(request)}`, 12, 60 * 60)) {
    return sendJson(response, 429, { error: 'Trop de tentatives. Réessayez plus tard.' });
  }
  const reset = await getLatestResetForEmail(email);
  if (!reset || reset.usedAt || reset.verifiedAt || Date.parse(reset.expiresAt) < Date.now()) {
    return sendJson(response, 400, { error: 'Ce code est invalide ou a expiré.' });
  }
  if (!safeEqual(hashResetValue(`${email}:${code}`), reset.codeHash)) {
    const attempts = await recordResetAttempt(reset.id);
    return sendJson(response, 400, { error: attempts >= MAX_RESET_ATTEMPTS ? 'Trop de codes incorrects. Demandez un nouveau code.' : 'Ce code est incorrect.' });
  }
  const resetToken = createSessionToken();
  if (!await verifyResetCode(reset.id, hashResetValue(resetToken))) {
    return sendJson(response, 400, { error: 'Ce code est invalide ou a déjà été utilisé.' });
  }
  return sendJson(response, 200, { resetToken, expiresAt: reset.expiresAt });
}

async function confirmPasswordReset(request, response) {
  if (!requireSameOrigin(request, response)) return;
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const confirmation = String(body.confirmPassword || '');
  const resetToken = String(body.resetToken || '');
  if (!isEmail(email) || !resetToken) return sendJson(response, 400, { error: 'La demande de réinitialisation est invalide.' });
  if (!isValidPassword(password)) return sendJson(response, 400, { error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  if (password !== confirmation) return sendJson(response, 400, { error: 'Les mots de passe ne correspondent pas.' });

  const reset = await getResetByToken(email, hashResetValue(resetToken));
  if (!reset || reset.usedAt || !reset.verifiedAt || Date.parse(reset.expiresAt) < Date.now()) {
    return sendJson(response, 400, { error: 'La vérification a expiré. Demandez un nouveau code.' });
  }
  const credentials = await hashPassword(password);
  await updatePassword(reset.userId, credentials.hash, credentials.salt);
  await markResetUsed(reset.id);
  await deleteSessionsForUser(reset.userId);
  return sendJson(response, 200, { message: 'Votre mot de passe a été modifié avec succès.' });
}

async function createCheckout(request, response) {
  if (!requireSameOrigin(request, response)) return;
  const user = await requireUser(request, response);
  if (!user) return;
  if (user.tier === 'premium') return sendJson(response, 400, { error: 'Votre compte Atmos est déjà Premium.' });
  const body = await readJson(request);
  const priceId = body.plan === 'annual' ? process.env.STRIPE_YEARLY_PRICE_ID : body.plan === 'monthly' ? process.env.STRIPE_MONTHLY_PRICE_ID : '';
  if (!process.env.STRIPE_SECRET_KEY || !priceId) {
    return sendJson(response, 503, { error: 'Les abonnements sont momentanément indisponibles. Réessayez plus tard.', code: 'PAYMENT_NOT_CONFIGURED' });
  }
  const origin = requestOrigin(request);
  if (!origin) return sendJson(response, 400, { error: 'Impossible de préparer le paiement pour cette adresse.' });
  const form = new URLSearchParams({
    mode: 'subscription',
    success_url: `${origin}/?checkout=success`,
    cancel_url: `${origin}/?checkout=cancelled`,
    client_reference_id: user.id,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'metadata[userId]': user.id,
    'subscription_data[metadata][userId]': user.id,
    allow_promotion_codes: 'true',
  });
  if (user.stripeCustomerId) form.set('customer', user.stripeCustomerId);
  else form.set('customer_email', user.email);
  const stripeResponse = await stripeRequest('/v1/checkout/sessions', { method: 'POST', body: form });
  if (!stripeResponse.ok) {
    console.error('[Atmos Stripe]', await stripeResponse.text());
    return sendJson(response, 502, { error: 'Le paiement ne peut pas être initialisé pour le moment.' });
  }
  const session = await stripeResponse.json();
  return sendJson(response, 200, { url: session.url });
}

async function stripeWebhook(request, response) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return sendJson(response, 503, { error: 'Webhook non configuré.' });
  const rawBody = await readRawBody(request, 1_000_000);
  if (!isValidStripeSignature(rawBody, request.headers['stripe-signature'], secret)) {
    return sendJson(response, 400, { error: 'Signature webhook invalide.' });
  }
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); } catch { return sendJson(response, 400, { error: 'Webhook invalide.' }); }
  const object = event.data?.object || {};
  if (event.type === 'checkout.session.completed') {
    const userId = object.client_reference_id || object.metadata?.userId;
    if (userId) {
      await setSubscriptionForUser(userId, {
        customerId: stringOrNull(object.customer), subscriptionId: stringOrNull(object.subscription), status: 'active',
        currentPeriodEnd: null, cancelAtPeriodEnd: false,
      });
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const user = await getUserBySubscriptionId(object.id);
    const userId = user?.id || object.metadata?.userId;
    if (userId) {
      await setSubscriptionForUser(userId, {
        customerId: stringOrNull(object.customer), subscriptionId: object.id, status: object.status,
        currentPeriodEnd: object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null,
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
      });
    }
  } else if (event.type === 'invoice.paid' && object.subscription) {
    const user = await getUserBySubscriptionId(object.subscription);
    if (user) await setSubscriptionForUser(user.id, { subscriptionId: object.subscription, status: 'active' });
  }
  return sendJson(response, 200, { received: true });
}

async function cancelSubscription(request, response) {
  if (!requireSameOrigin(request, response)) return;
  const user = await requireUser(request, response);
  if (!user) return;
  if (!user.stripeSubscriptionId || !process.env.STRIPE_SECRET_KEY) {
    return sendJson(response, 400, { error: 'Aucun abonnement actif ne peut être géré depuis ce compte.' });
  }
  const stripeResponse = await stripeRequest(`/v1/subscriptions/${encodeURIComponent(user.stripeSubscriptionId)}`, {
    method: 'POST', body: new URLSearchParams({ cancel_at_period_end: 'true' }),
  });
  if (!stripeResponse.ok) return sendJson(response, 502, { error: 'La résiliation n’a pas pu être enregistrée. Réessayez plus tard.' });
  const subscription = await stripeResponse.json();
  await setSubscriptionForUser(user.id, {
    customerId: stringOrNull(subscription.customer), subscriptionId: subscription.id, status: subscription.status,
    currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  });
  return sendJson(response, 200, { message: 'Votre abonnement sera résilié à la fin de la période en cours.' });
}

async function exportAccount(request, response) {
  const user = await requireUser(request, response);
  if (!user) return;
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    account: publicUser(user),
    consent: { termsVersion: user.termsVersion, acceptedAt: user.termsAcceptedAt },
    note: 'Cet export contient les données de compte Atmos Weather. Les secrets, mots de passe, sessions et codes de récupération ne sont jamais exportés.',
  };
  response.setHeader('Content-Disposition', 'attachment; filename="atmos-weather-account.json"');
  return sendJson(response, 200, exportPayload);
}

async function updateAccount(request, response) {
  if (!requireSameOrigin(request, response)) return;
  const user = await requireUser(request, response);
  if (!user) return;
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  if (name.length < 2 || name.length > 80) {
    return sendJson(response, 400, { error: 'Le nom doit comporter entre 2 et 80 caractères.' });
  }
  if (!await consumeRateLimit(`account-update:${user.id}`, 10, 60 * 60)) {
    return sendJson(response, 429, { error: 'Trop de modifications. Réessayez plus tard.' });
  }
  await updateUserName(user.id, name);
  const updatedUser = await getUserById(user.id);
  return sendJson(response, 200, { user: publicUser(updatedUser) });
}

async function removeAccount(request, response) {
  if (!requireSameOrigin(request, response)) return;
  const user = await requireUser(request, response);
  if (!user) return;
  const body = await readJson(request);
  if (body.confirmation !== 'SUPPRIMER') {
    return sendJson(response, 400, { error: 'Saisissez SUPPRIMER pour confirmer la suppression du compte.' });
  }
  if (user.stripeSubscriptionId && ['active', 'trialing', 'past_due'].includes(user.subscriptionStatus)) {
    return sendJson(response, 409, { error: 'Résiliez d’abord votre abonnement Premium avant de supprimer votre compte.' });
  }
  await deleteUser(user.id);
  response.setHeader('Set-Cookie', expiredSessionCookie(request));
  return sendJson(response, 200, { message: 'Votre compte et les données associées ont été supprimés.' });
}

async function proxyWeather(url, response) {
  const latitude = Number(url.searchParams.get('latitude'));
  const longitude = Number(url.searchParams.get('longitude'));
  if (!validCoordinates(latitude, longitude)) return sendJson(response, 400, { error: 'Coordonnées météo invalides.' });
  const upstream = new URL(FORECAST_ENDPOINT);
  const params = new URLSearchParams(url.searchParams);
  if (!params.has('current')) params.set('current', 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,visibility');
  if (!params.has('hourly')) params.set('hourly', 'temperature_2m,weather_code,precipitation_probability,wind_speed_10m,wind_direction_10m,relative_humidity_2m,uv_index');
  if (!params.has('daily')) params.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset,uv_index_max');
  if (!params.has('timezone')) params.set('timezone', 'auto');
  if (!params.has('forecast_days')) params.set('forecast_days', '16');
  upstream.search = params;
  return proxyJson(upstream, response);
}

async function proxyMarine(request, url, response) {
  const latitude = Number(url.searchParams.get('latitude'));
  const longitude = Number(url.searchParams.get('longitude'));
  if (!validCoordinates(latitude, longitude)) return sendJson(response, 400, { error: 'Coordonnées marines invalides.' });
  const user = await currentUser(request);
  if (user?.tier !== 'premium') {
    return sendJson(response, 200, {
      isPremiumRequired: true,
      message: 'Les prévisions détaillées de surf sont réservées aux membres Atmos Premium.',
    });
  }
  const upstream = new URL(MARINE_ENDPOINT);
  upstream.search = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    hourly: 'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,swell_wave_peak_period,wind_wave_height',
    daily: 'wave_height_max,wave_direction_dominant,wave_period_max', timezone: 'auto', forecast_days: '7',
  });
  return proxyJson(upstream, response);
}

async function proxyGeocoding(url, response) {
  const name = url.searchParams.get('name')?.trim() || '';
  if (name.length < 2 || name.length > 100) return sendJson(response, 400, { error: 'Recherche de ville invalide.' });
  const upstream = new URL(GEOCODING_ENDPOINT);
  upstream.search = new URLSearchParams({ name, count: '6', language: 'fr', format: 'json' });
  return proxyJson(upstream, response);
}

async function proxyReverseGeocoding(url, request, response) {
  const latitude = Number(url.searchParams.get('latitude'));
  const longitude = Number(url.searchParams.get('longitude'));
  if (!validCoordinates(latitude, longitude)) return sendJson(response, 400, { error: 'Coordonnées invalides.' });
  const upstream = new URL(REVERSE_GEOCODING_ENDPOINT);
  upstream.search = new URLSearchParams({ lat: String(latitude), lon: String(longitude), format: 'jsonv2', zoom: '10', addressdetails: '1', 'accept-language': 'fr' });
  try {
    const upstreamResponse = await fetch(upstream, {
      headers: { Accept: 'application/json', 'User-Agent': 'Atmos Weather/1.0', Referer: requestOrigin(request) || 'https://atmos-weather.app' },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await upstreamResponse.text();
    response.writeHead(upstreamResponse.ok ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(text);
  } catch {
    return sendJson(response, 502, { error: 'Le fournisseur de localisation est indisponible.' });
  }
}

async function proxyJson(upstream, response) {
  try {
    const upstreamResponse = await fetch(upstream, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    const text = await upstreamResponse.text();
    response.writeHead(upstreamResponse.ok ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(text);
  } catch {
    return sendJson(response, 502, { error: 'Le fournisseur de données est indisponible.' });
  }
}

async function authenticateUser(user, request, response, status = 200) {
  const token = createSessionToken();
  await createSession({ id: createId(), userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString() });
  response.setHeader('Set-Cookie', sessionCookie(token, request));
  return sendJson(response, status, { user: publicUser(user) });
}

async function currentUser(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  return token ? getUserBySessionHash(hashToken(token)) : null;
}

async function requireUser(request, response) {
  const user = await currentUser(request);
  if (!user) sendJson(response, 401, { error: 'Connectez-vous pour continuer.' });
  return user;
}

function publicUser(user) {
  return {
    id: user.id, email: user.email, name: user.name, tier: user.tier,
    subscription: user.subscriptionStatus ? {
      status: user.subscriptionStatus, currentPeriodEnd: user.subscription_current_period_end ?? user.subscriptionCurrentPeriodEnd ?? null,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd,
    } : null,
    createdAt: user.created_at ?? user.createdAt,
  };
}

function requireSameOrigin(request, response) {
  if (hasSameOrigin(request)) return true;
  sendJson(response, 403, { error: 'Requête non autorisée.' });
  return false;
}

function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254; }
function isValidPassword(value) { return value.length >= 8 && value.length <= 128; }
function validCoordinates(latitude, longitude) { return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180; }
function stringOrNull(value) { return typeof value === 'string' && value ? value : null; }

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('Cache-Control', 'no-store');
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function sendEmpty(response, status) { response.writeHead(status); response.end(); }

async function readJson(request) {
  const raw = await readRawBody(request, 12_000);
  try { return JSON.parse(raw.toString('utf8')); } catch { throw new Error('INVALID_JSON'); }
}

async function readRawBody(request, maximumBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maximumBytes) { reject(new Error('BODY_TOO_LARGE')); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function stripeRequest(path, { method, body }) {
  return fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
}

function isValidStripeSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string') return false;
  const values = Object.fromEntries(signatureHeader.split(',').map((part) => part.split('=')));
  const timestamp = values.t;
  const signatures = signatureHeader.split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  return signatures.some((signature) => safeEqual(signature, expected));
}
