const TOKEN_KEY = 'atmos_auth_token';

class AuthService {
  constructor() {
    this.user = null;
    this.token = localStorage.getItem(TOKEN_KEY);
  }

  emitAuthChanged() {
    window.dispatchEvent(new CustomEvent('atmos:auth-changed', {
      detail: {
        isAuthenticated: this.isAuthenticated(),
        isPremium: this.isPremium(),
        user: this.user
      }
    }));
  }

  async init() {
    if (this.token) {
      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          this.user = data.user;
        } else {
          this.logout();
        }
      } catch (e) {
        console.error('Auth check failed', e);
      }
    }
    this.emitAuthChanged();
    return this.user;
  }

  getToken() {
    return this.token;
  }

  isAuthenticated() {
    return !!this.user;
  }

  isPremium() {
    return this.user && this.user.tier === 'premium';
  }

  getUser() {
    return this.user;
  }

  async login(email, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Erreur de connexion');
    }
    
    this.token = data.token;
    this.user = data.user;
    localStorage.setItem(TOKEN_KEY, this.token);
    this.emitAuthChanged();
    return this.user;
  }

  async register(email, name, password) {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password })
    });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Erreur d\'inscription');
    }
    
    this.token = data.token;
    this.user = data.user;
    localStorage.setItem(TOKEN_KEY, this.token);
    this.emitAuthChanged();
    return this.user;
  }

  async logout() {
    if (this.token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
      } catch (e) {
        console.error('Logout request failed', e);
      }
    }
    this.token = null;
    this.user = null;
    localStorage.removeItem(TOKEN_KEY);
    this.emitAuthChanged();
  }
}

export const authService = new AuthService();
