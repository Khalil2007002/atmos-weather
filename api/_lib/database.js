import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const localDataFile = fileURLToPath(new URL('../../data/users.json', import.meta.url));
const databaseUrl = process.env.DATABASE_URL || '';
const isVercel = Boolean(process.env.VERCEL);
let schemaPromise;
let sql;

export class DatabaseConfigurationError extends Error {
  constructor(message = 'La base de données n’est pas configurée.') {
    super(message);
    this.name = 'DatabaseConfigurationError';
  }
}

function useRemoteDatabase() {
  return Boolean(databaseUrl);
}

function getSql() {
  if (!databaseUrl) {
    throw new DatabaseConfigurationError(
      'La base de données n’est pas configurée. Ajoutez DATABASE_URL dans les variables d’environnement.',
    );
  }
  if (!sql) sql = neon(databaseUrl);
  return sql;
}

function readLocalState() {
  try {
    if (!existsSync(localDataFile)) return { users: [], sessions: [], passwordResets: [], rateLimits: {} };
    const parsed = JSON.parse(readFileSync(localDataFile, 'utf8'));
    if (Array.isArray(parsed)) return { users: parsed, sessions: [], passwordResets: [], rateLimits: {} };
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      passwordResets: Array.isArray(parsed.passwordResets) ? parsed.passwordResets : [],
      rateLimits: parsed.rateLimits && typeof parsed.rateLimits === 'object' ? parsed.rateLimits : {},
    };
  } catch {
    return { users: [], sessions: [], passwordResets: [], rateLimits: {} };
  }
}

function writeLocalState(state) {
  mkdirSync(dirname(localDataFile), { recursive: true });
  writeFileSync(localDataFile, JSON.stringify(state, null, 2), 'utf8');
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    tier: user.tier === 'premium' || premiumStatuses.has(user.subscription_status ?? user.subscriptionStatus) ? 'premium' : 'free',
    subscriptionStatus: user.subscription_status ?? user.subscriptionStatus ?? null,
    stripeCustomerId: user.stripe_customer_id ?? user.stripeCustomerId ?? null,
    stripeSubscriptionId: user.stripe_subscription_id ?? user.stripeSubscriptionId ?? null,
    cancelAtPeriodEnd: Boolean(user.cancel_at_period_end ?? user.cancelAtPeriodEnd),
    termsAcceptedAt: user.terms_accepted_at ?? user.termsAcceptedAt ?? null,
    termsVersion: user.terms_version ?? user.termsVersion ?? null,
  };
}

const premiumStatuses = new Set(['active', 'trialing', 'past_due']);

export async function ensureDatabase() {
  if (!useRemoteDatabase()) {
    if (isVercel) {
      throw new DatabaseConfigurationError(
        'DATABASE_URL est requis en production. Connectez une base PostgreSQL compatible Vercel/Neon.',
      );
    }
    return;
  }

  if (!schemaPromise) {
    schemaPromise = (async () => {
      const query = getSql();
      await query(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'free',
        stripe_customer_id TEXT UNIQUE,
        stripe_subscription_id TEXT UNIQUE,
        subscription_status TEXT,
        subscription_current_period_end TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
        terms_version TEXT,
        terms_accepted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query('CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash)');
      await query(`CREATE TABLE IF NOT EXISTS password_reset_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        reset_token_hash TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        used_at TIMESTAMPTZ,
        verified_at TIMESTAMPTZ,
        last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query('CREATE INDEX IF NOT EXISTS password_reset_codes_user_id_idx ON password_reset_codes(user_id, created_at DESC)');
      await query(`CREATE TABLE IF NOT EXISTS auth_rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        window_started_at TIMESTAMPTZ NOT NULL
      )`);
    })();
  }
  return schemaPromise;
}

export async function getUserByEmail(email) {
  await ensureDatabase();
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!useRemoteDatabase()) return normalizeUser(readLocalState().users.find((user) => user.email === normalizedEmail));
  const rows = await getSql()('SELECT * FROM users WHERE email = $1 LIMIT 1', [normalizedEmail]);
  return normalizeUser(rows[0]);
}

export async function getUserById(id) {
  await ensureDatabase();
  if (!useRemoteDatabase()) return normalizeUser(readLocalState().users.find((user) => user.id === id));
  const rows = await getSql()('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  return normalizeUser(rows[0]);
}

export async function getUserBySubscriptionId(subscriptionId) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    return normalizeUser(readLocalState().users.find((user) => user.stripeSubscriptionId === subscriptionId));
  }
  const rows = await getSql()('SELECT * FROM users WHERE stripe_subscription_id = $1 LIMIT 1', [subscriptionId]);
  return normalizeUser(rows[0]);
}

export async function createUser(user) {
  await ensureDatabase();
  const record = {
    ...user,
    email: String(user.email).trim().toLowerCase(),
    tier: 'free',
    subscriptionStatus: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    cancelAtPeriodEnd: false,
  };
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    state.users.push(record);
    writeLocalState(state);
    return normalizeUser(record);
  }
  const rows = await getSql()(`INSERT INTO users (
      id, email, name, password_hash, password_salt, tier, terms_version, terms_accepted_at, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,'free',$6,$7,$8,$8) RETURNING *`, [
    record.id, record.email, record.name, record.passwordHash, record.passwordSalt,
    record.termsVersion, record.termsAcceptedAt, record.createdAt,
  ]);
  return normalizeUser(rows[0]);
}

export async function createSession(session) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    state.sessions = state.sessions.filter((item) => item.expiresAt > new Date().toISOString());
    state.sessions.push(session);
    writeLocalState(state);
    return;
  }
  await getSql()('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)', [
    session.id, session.userId, session.tokenHash, session.expiresAt,
  ]);
}

export async function getUserBySessionHash(tokenHash) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    const session = state.sessions.find((item) => item.tokenHash === tokenHash && item.expiresAt > new Date().toISOString());
    return session ? normalizeUser(state.users.find((user) => user.id === session.userId)) : null;
  }
  const rows = await getSql()(`SELECT u.* FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > NOW() LIMIT 1`, [tokenHash]);
  return normalizeUser(rows[0]);
}

export async function deleteSession(tokenHash) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    state.sessions = state.sessions.filter((item) => item.tokenHash !== tokenHash);
    writeLocalState(state);
    return;
  }
  await getSql()('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

export async function deleteSessionsForUser(userId) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    state.sessions = state.sessions.filter((item) => item.userId !== userId);
    writeLocalState(state);
    return;
  }
  await getSql()('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function updatePassword(userId, passwordHash, passwordSalt) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    const user = state.users.find((item) => item.id === userId);
    if (user) {
      user.passwordHash = passwordHash;
      user.passwordSalt = passwordSalt;
      user.updatedAt = new Date().toISOString();
      writeLocalState(state);
    }
    return;
  }
  await getSql()('UPDATE users SET password_hash = $2, password_salt = $3, updated_at = NOW() WHERE id = $1', [
    userId, passwordHash, passwordSalt,
  ]);
}

export async function updateUserName(userId, name) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    const user = state.users.find((item) => item.id === userId);
    if (user) {
      user.name = name;
      user.updatedAt = new Date().toISOString();
      writeLocalState(state);
    }
    return;
  }
  await getSql()('UPDATE users SET name = $2, updated_at = NOW() WHERE id = $1', [userId, name]);
}

export async function consumeRateLimit(key, maximum, windowSeconds) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    const now = Date.now();
    const current = state.rateLimits[key];
    if (!current || now - current.startedAt > windowSeconds * 1000) {
      state.rateLimits[key] = { count: 1, startedAt: now };
    } else {
      current.count += 1;
    }
    const count = state.rateLimits[key].count;
    writeLocalState(state);
    return count <= maximum;
  }
  const rows = await getSql()(`INSERT INTO auth_rate_limits (key, count, window_started_at)
    VALUES ($1, 1, NOW())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN auth_rate_limits.window_started_at < NOW() - ($2::int * INTERVAL '1 second')
        THEN 1 ELSE auth_rate_limits.count + 1 END,
      window_started_at = CASE WHEN auth_rate_limits.window_started_at < NOW() - ($2::int * INTERVAL '1 second')
        THEN NOW() ELSE auth_rate_limits.window_started_at END
    RETURNING count`, [key, windowSeconds]);
  return Number(rows[0]?.count || maximum + 1) <= maximum;
}

export async function getLatestResetForEmail(email) {
  await ensureDatabase();
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    const user = state.users.find((item) => item.email === normalizedEmail);
    if (!user) return null;
    return state.passwordResets
      .filter((item) => item.userId === user.id && !item.usedAt)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null;
  }
  const rows = await getSql()(`SELECT pr.*, u.email FROM password_reset_codes pr
    INNER JOIN users u ON u.id = pr.user_id
    WHERE u.email = $1 AND pr.used_at IS NULL
    ORDER BY pr.created_at DESC LIMIT 1`, [normalizedEmail]);
  return rows[0] ? mapResetRow(rows[0]) : null;
}

export async function replaceResetCode(reset) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    state.passwordResets = state.passwordResets.filter((item) => item.userId !== reset.userId || item.usedAt);
    state.passwordResets.push(reset);
    writeLocalState(state);
    return;
  }
  const query = getSql();
  await query('UPDATE password_reset_codes SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [reset.userId]);
  await query(`INSERT INTO password_reset_codes (
      id, user_id, code_hash, expires_at, attempts, last_sent_at, created_at
    ) VALUES ($1,$2,$3,$4,0,$5,$5)`, [
    reset.id, reset.userId, reset.codeHash, reset.expiresAt, reset.lastSentAt,
  ]);
}

export async function deleteResetCode(resetId) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    state.passwordResets = state.passwordResets.filter((item) => item.id !== resetId);
    writeLocalState(state);
    return;
  }
  await getSql()('DELETE FROM password_reset_codes WHERE id = $1', [resetId]);
}

export async function recordResetAttempt(resetId) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    const reset = state.passwordResets.find((item) => item.id === resetId);
    if (!reset) return 999;
    reset.attempts = Number(reset.attempts || 0) + 1;
    if (reset.attempts >= 5) reset.usedAt = new Date().toISOString();
    writeLocalState(state);
    return reset.attempts;
  }
  const rows = await getSql()(`UPDATE password_reset_codes SET
      attempts = attempts + 1,
      used_at = CASE WHEN attempts + 1 >= 5 THEN NOW() ELSE used_at END
    WHERE id = $1 RETURNING attempts`, [resetId]);
  return Number(rows[0]?.attempts || 999);
}

export async function verifyResetCode(resetId, resetTokenHash) {
  await ensureDatabase();
  const verifiedAt = new Date().toISOString();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    const reset = state.passwordResets.find((item) => item.id === resetId);
    if (reset && !reset.usedAt && !reset.verifiedAt) {
      reset.resetTokenHash = resetTokenHash;
      reset.verifiedAt = verifiedAt;
      writeLocalState(state);
      return true;
    }
    return false;
  }
  const rows = await getSql()(`UPDATE password_reset_codes
    SET reset_token_hash = $2, verified_at = NOW()
    WHERE id = $1 AND used_at IS NULL AND verified_at IS NULL
    RETURNING id`, [
    resetId, resetTokenHash,
  ]);
  return Boolean(rows[0]);
}

export async function getResetByToken(email, resetTokenHash) {
  await ensureDatabase();
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    const user = state.users.find((item) => item.email === normalizedEmail);
    if (!user) return null;
    return state.passwordResets.find((item) => item.userId === user.id && item.resetTokenHash === resetTokenHash && !item.usedAt) || null;
  }
  const rows = await getSql()(`SELECT pr.*, u.email FROM password_reset_codes pr
    INNER JOIN users u ON u.id = pr.user_id
    WHERE u.email = $1 AND pr.reset_token_hash = $2 AND pr.used_at IS NULL
    ORDER BY pr.created_at DESC LIMIT 1`, [normalizedEmail, resetTokenHash]);
  return rows[0] ? mapResetRow(rows[0]) : null;
}

export async function markResetUsed(resetId) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    const reset = state.passwordResets.find((item) => item.id === resetId);
    if (reset) reset.usedAt = new Date().toISOString();
    writeLocalState(state);
    return;
  }
  await getSql()('UPDATE password_reset_codes SET used_at = NOW() WHERE id = $1 AND used_at IS NULL', [resetId]);
}

export async function setSubscriptionForUser(userId, subscription) {
  await ensureDatabase();
  const status = subscription.status || 'active';
  const tier = premiumStatuses.has(status) ? 'premium' : 'free';
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    const user = state.users.find((item) => item.id === userId);
    if (user) {
      user.tier = tier;
      user.subscriptionStatus = status;
      user.stripeCustomerId = subscription.customerId || user.stripeCustomerId || null;
      user.stripeSubscriptionId = subscription.subscriptionId || user.stripeSubscriptionId || null;
      user.cancelAtPeriodEnd = Boolean(subscription.cancelAtPeriodEnd);
      user.subscriptionCurrentPeriodEnd = subscription.currentPeriodEnd || null;
      user.updatedAt = new Date().toISOString();
      writeLocalState(state);
    }
    return;
  }
  await getSql()(`UPDATE users SET
      tier = $2, subscription_status = $3, stripe_customer_id = COALESCE($4, stripe_customer_id),
      stripe_subscription_id = COALESCE($5, stripe_subscription_id),
      cancel_at_period_end = $6, subscription_current_period_end = $7, updated_at = NOW()
    WHERE id = $1`, [
    userId, tier, status, subscription.customerId || null, subscription.subscriptionId || null,
    Boolean(subscription.cancelAtPeriodEnd), subscription.currentPeriodEnd || null,
  ]);
}

export async function deleteUser(userId) {
  await ensureDatabase();
  if (!useRemoteDatabase()) {
    const state = readLocalState();
    state.users = state.users.filter((user) => user.id !== userId);
    state.sessions = state.sessions.filter((session) => session.userId !== userId);
    state.passwordResets = state.passwordResets.filter((reset) => reset.userId !== userId);
    writeLocalState(state);
    return;
  }
  await getSql()('DELETE FROM users WHERE id = $1', [userId]);
}

function mapResetRow(row) {
  return {
    id: row.id,
    userId: row.user_id ?? row.userId,
    codeHash: row.code_hash ?? row.codeHash,
    resetTokenHash: row.reset_token_hash ?? row.resetTokenHash,
    expiresAt: row.expires_at ?? row.expiresAt,
    attempts: Number(row.attempts || 0),
    usedAt: row.used_at ?? row.usedAt,
    verifiedAt: row.verified_at ?? row.verifiedAt,
    lastSentAt: row.last_sent_at ?? row.lastSentAt,
    createdAt: row.created_at ?? row.createdAt,
  };
}
