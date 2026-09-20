class AuthService {
  constructor() {
    this.user = null;
  }

  emitAuthChanged() {
    window.dispatchEvent(new CustomEvent('atmos:auth-changed', {
      detail: { isAuthenticated: this.isAuthenticated(), isPremium: this.isPremium(), user: this.user },
    }));
  }

  async init() {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
      this.user = response.ok ? (await response.json()).user : null;
    } catch {
      this.user = null;
    }
    this.emitAuthChanged();
    return this.user;
  }

  isAuthenticated() { return Boolean(this.user); }
  isPremium() { return this.user?.tier === 'premium'; }
  getUser() { return this.user; }

  async login(email, password) {
    return this.#submit('/api/auth/login', { email, password });
  }

  async register(email, name, password, acceptedTerms) {
    return this.#submit('/api/auth/register', { email, name, password, acceptedTerms });
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // A local logout still removes the browser state when the network is unavailable.
    }
    this.user = null;
    this.emitAuthChanged();
  }

  async updateName(name) {
    const response = await fetch('/api/account', {
      method: 'PATCH', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const data = await readResponse(response);
    if (!response.ok) throw new Error(data.error || 'La mise à jour du profil a échoué.');
    this.user = data.user;
    this.emitAuthChanged();
    return this.user;
  }

  async #submit(path, body) {
    const response = await fetch(path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await readResponse(response);
    if (!response.ok) throw new Error(data.error || 'Une erreur est survenue.');
    this.user = data.user;
    this.emitAuthChanged();
    return this.user;
  }
}

export async function readResponse(response) {
  try { return await response.json(); } catch { return {}; }
}

export const authService = new AuthService();
