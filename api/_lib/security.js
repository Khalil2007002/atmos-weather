import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const production = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
const configuredSecret = process.env.AUTH_SECRET || '';
const developmentSecret = 'atmos-local-development-secret-change-before-production';
const authSecret = configuredSecret || developmentSecret;

export const SESSION_COOKIE = 'atmos_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export class SecurityConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecurityConfigurationError';
  }
}

export function validateSecurityConfiguration() {
  if (production && configuredSecret.length < 32) {
    throw new SecurityConfigurationError('AUTH_SECRET doit contenir au moins 32 caractères en production.');
  }
}

export function createId() {
  return randomUUID();
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function createResetCode() {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function hashResetValue(value) {
  return createHmac('sha256', authSecret).update(String(value)).digest('hex');
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = await scryptAsync(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt, hash: Buffer.from(hash).toString('base64url') };
}

export async function verifyPassword(password, salt, storedHash) {
  try {
    const candidate = Buffer.from(await scryptAsync(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
    const stored = Buffer.from(storedHash, 'base64url');
    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  } catch {
    return false;
  }
}

export function safeEqual(left, right) {
  try {
    const a = Buffer.from(String(left));
    const b = Buffer.from(String(right));
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function parseCookies(request) {
  const raw = request.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map((item) => {
    const separator = item.indexOf('=');
    if (separator < 0) return ['', ''];
    return [item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

export function sessionCookie(token, request) {
  const secure = isSecureRequest(request);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure ? '; Secure' : ''}`;
}

export function expiredSessionCookie(request) {
  const secure = isSecureRequest(request);
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function isSecureRequest(request) {
  return production || request.headers['x-forwarded-proto'] === 'https';
}

export function requestIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || request.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
}

export function requestOrigin(request) {
  const protocol = request.headers['x-forwarded-proto'] || (isSecureRequest(request) ? 'https' : 'http');
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  return host ? `${protocol}://${host}` : '';
}

export function hasSameOrigin(request) {
  const origin = request.headers.origin;
  return !origin || origin === requestOrigin(request);
}
