import { authService, readResponse } from '../services/auth-service.js';

const inputStyle = 'width:100%;padding:.78rem 1rem;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:white;font-size:1rem;outline:none;box-sizing:border-box;';
const primaryStyle = 'background:linear-gradient(135deg,#667eea,#764ba2);border:0;border-radius:12px;padding:.82rem;color:white;font-weight:700;cursor:pointer;width:100%;font-size:1rem;';
const textButtonStyle = 'background:none;border:0;color:rgba(255,255,255,.82);cursor:pointer;text-decoration:underline;padding:.35rem;font:inherit;';

export function showAuthModal(initialMode = 'login') {
  const overlay = document.createElement('div');
  overlay.className = 'atmos-modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'atmos-modal';
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'atmos-modal__close'; close.innerHTML = '&times;';
  close.setAttribute('aria-label', 'Fermer'); close.onclick = () => overlay.remove();
  const content = document.createElement('div');
  modal.append(close, content); overlay.appendChild(modal);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  let resetEmail = '';
  let resetToken = '';
  let resendAt = 0;
  let countdownTimer;

  const render = (mode) => {
    clearInterval(countdownTimer);
    content.replaceChildren();
    const heading = document.createElement('h2');
    heading.className = 'atmos-modal__title';
    heading.textContent = ({ login: 'Connexion', register: 'Inscription', request: 'Mot de passe oublié', verify: 'Vérification', reset: 'Nouveau mot de passe', success: 'Mot de passe réinitialisé' })[mode];
    content.appendChild(heading);
    const message = document.createElement('div');
    message.className = 'atmos-modal__message';
    content.appendChild(message);
    const form = document.createElement('form');
    form.className = 'atmos-modal__form';
    content.appendChild(form);
    const showError = (text, type = 'error') => { message.textContent = text; message.dataset.type = type; message.hidden = false; };
    const clearMessage = () => { message.hidden = true; message.textContent = ''; };
    const addInput = (type, placeholder, value = '') => {
      const input = document.createElement('input');
      input.type = type; input.placeholder = placeholder; input.value = value; input.required = true; input.style.cssText = inputStyle;
      form.appendChild(input); return input;
    };
    const addButton = (label) => {
      const button = document.createElement('button');
      button.type = 'submit'; button.textContent = label; button.style.cssText = primaryStyle; form.appendChild(button); return button;
    };
    const submit = (button, pending, action) => {
      form.onsubmit = async (event) => {
        event.preventDefault(); clearMessage(); button.disabled = true; button.textContent = pending;
        try { await action(); } catch (error) { showError(error.message); button.disabled = false; button.textContent = button.dataset.label; }
      };
    };

    if (mode === 'login' || mode === 'register') {
      const isLogin = mode === 'login';
      let nameInput;
      if (!isLogin) nameInput = addInput('text', 'Nom');
      const emailInput = addInput('email', 'Email');
      const passwordInput = addInput('password', 'Mot de passe (8 caractères minimum)');
      let accepted;
      if (!isLogin) {
        const consent = document.createElement('label');
        consent.className = 'atmos-modal__consent';
        accepted = document.createElement('input'); accepted.type = 'checkbox'; accepted.required = true;
        consent.append(accepted, document.createTextNode(' J’accepte les '));
        const terms = document.createElement('a'); terms.href = '/terms'; terms.target = '_blank'; terms.rel = 'noreferrer'; terms.textContent = 'Conditions d’utilisation';
        const privacy = document.createElement('a'); privacy.href = '/privacy'; privacy.target = '_blank'; privacy.rel = 'noreferrer'; privacy.textContent = 'Politique de confidentialité';
        consent.append(terms, document.createTextNode(' et reconnais avoir pris connaissance de la '), privacy, document.createTextNode('.'));
        form.appendChild(consent);
      }
      const button = addButton(isLogin ? 'Se connecter' : 'Créer mon compte'); button.dataset.label = button.textContent;
      const links = document.createElement('div'); links.className = 'atmos-modal__links';
      if (isLogin) {
        const forgot = linkButton('Mot de passe oublié ?', () => render('request'));
        links.appendChild(forgot);
      }
      links.appendChild(linkButton(isLogin ? 'Pas de compte ? S’inscrire' : 'Déjà un compte ? Se connecter', () => render(isLogin ? 'register' : 'login')));
      form.appendChild(links);
      submit(button, 'Patientez…', async () => {
        if (isLogin) await authService.login(emailInput.value, passwordInput.value);
        else await authService.register(emailInput.value, nameInput.value, passwordInput.value, accepted.checked);
        overlay.remove();
      });
      return;
    }

    if (mode === 'request') {
      const intro = document.createElement('p'); intro.className = 'atmos-modal__intro'; intro.textContent = 'Saisissez votre adresse email pour recevoir un code de vérification à 6 chiffres.'; form.appendChild(intro);
      const emailInput = addInput('email', 'Email', resetEmail);
      const button = addButton('Envoyer le code'); button.dataset.label = button.textContent;
      form.appendChild(linkButton('Retour à la connexion', () => render('login')));
      submit(button, 'Envoi en cours…', async () => {
        const data = await post('/api/auth/password-reset/request', { email: emailInput.value });
        resetEmail = emailInput.value.trim(); resendAt = Date.parse(data.resendAvailableAt || '') || Date.now() + 60_000;
        render('verify');
      });
      return;
    }

    if (mode === 'verify') {
      const intro = document.createElement('p'); intro.className = 'atmos-modal__intro'; intro.textContent = 'Un code a été envoyé à votre adresse email. Il expire après 10 minutes.'; form.appendChild(intro);
      const codeInput = addInput('text', 'Code à 6 chiffres'); codeInput.inputMode = 'numeric'; codeInput.pattern = '[0-9]{6}'; codeInput.maxLength = 6; codeInput.autocomplete = 'one-time-code';
      const button = addButton('Vérifier le code'); button.dataset.label = button.textContent;
      const countdown = document.createElement('p'); countdown.className = 'atmos-modal__timer'; form.appendChild(countdown);
      const resend = linkButton('Renvoyer le code', () => render('request')); resend.disabled = true; form.appendChild(resend);
      const change = linkButton('Modifier l’adresse email', () => render('request')); form.appendChild(change);
      const refreshCountdown = () => {
        const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
        resend.disabled = remaining > 0; countdown.textContent = remaining > 0 ? `Renvoi disponible dans ${remaining} s` : 'Vous pouvez demander un nouveau code.';
      };
      refreshCountdown(); countdownTimer = setInterval(refreshCountdown, 1000);
      submit(button, 'Vérification…', async () => {
        const data = await post('/api/auth/password-reset/verify', { email: resetEmail, code: codeInput.value });
        resetToken = data.resetToken; render('reset');
      });
      return;
    }

    if (mode === 'reset') {
      const intro = document.createElement('p'); intro.className = 'atmos-modal__intro'; intro.textContent = 'Choisissez un mot de passe d’au moins 8 caractères, puis confirmez-le.'; form.appendChild(intro);
      const password = addInput('password', 'Nouveau mot de passe');
      const confirmation = addInput('password', 'Confirmer le mot de passe');
      const button = addButton('Réinitialiser le mot de passe'); button.dataset.label = button.textContent;
      submit(button, 'Réinitialisation…', async () => {
        await post('/api/auth/password-reset/confirm', { email: resetEmail, password: password.value, confirmPassword: confirmation.value, resetToken });
        render('success');
      });
      return;
    }

    form.remove();
    const success = document.createElement('p'); success.className = 'atmos-modal__intro'; success.textContent = '✓ Votre mot de passe a été modifié avec succès.'; content.appendChild(success);
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Se connecter'; button.style.cssText = primaryStyle; button.onclick = () => render('login'); content.appendChild(button);
  };

  render(initialMode);
}

function linkButton(label, action) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.style.cssText = textButtonStyle; button.onclick = action; return button;
}

async function post(path, body) {
  const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await readResponse(response);
  if (!response.ok) throw new Error(data.error || 'Une erreur est survenue.');
  return data;
}
