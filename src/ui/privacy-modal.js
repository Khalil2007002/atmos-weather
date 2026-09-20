import { authService, readResponse } from '../services/auth-service.js';
import { showAuthModal } from './auth-modal.js';

export function showPrivacyModal() {
  if (!authService.isAuthenticated()) return showAuthModal('login');
  const overlay = document.createElement('div'); overlay.className = 'atmos-modal-overlay';
  const modal = document.createElement('div'); modal.className = 'atmos-modal';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'atmos-modal__close'; close.innerHTML = '&times;'; close.onclick = () => overlay.remove();
  const title = document.createElement('h2'); title.className = 'atmos-modal__title'; title.textContent = 'Privacy & Account';
  const message = document.createElement('p'); message.className = 'atmos-modal__intro'; message.textContent = 'Consultez vos données de compte, téléchargez un export ou supprimez votre compte.';
  const data = document.createElement('div'); data.className = 'privacy-account-data';
  const user = authService.getUser();
  const nameLabel = document.createElement('label'); nameLabel.textContent = 'Nom'; nameLabel.htmlFor = 'privacy-account-name';
  const nameInput = document.createElement('input'); nameInput.id = 'privacy-account-name'; nameInput.type = 'text'; nameInput.value = user.name || ''; nameInput.maxLength = 80;
  const email = document.createElement('p'); email.innerHTML = `<strong>Email :</strong> ${escapeHtml(user.email)}`;
  const status = document.createElement('p'); status.innerHTML = `<strong>Statut :</strong> ${user.tier === 'premium' ? 'Atmos Premium' : 'Gratuit'}`;
  data.append(nameLabel, nameInput, email, status);
  const notice = document.createElement('div'); notice.className = 'atmos-modal__message'; notice.hidden = true;
  const saveButton = actionButton('Enregistrer le nom', async () => {
    await authService.updateName(nameInput.value);
    setNotice('Votre nom a été mis à jour.', 'success');
  });
  const exportButton = actionButton('Télécharger mes données', async () => {
    const response = await fetch('/api/account/export', { credentials: 'same-origin' });
    if (!response.ok) throw new Error((await readResponse(response)).error || 'L’export est indisponible.');
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'atmos-weather-account.json'; link.click(); URL.revokeObjectURL(url);
    setNotice('Votre export a été téléchargé.', 'success');
  });
  const deleteButton = actionButton('Supprimer mon compte', async () => {
    const confirmation = window.prompt('Cette action est définitive. Saisissez SUPPRIMER pour confirmer.');
    if (confirmation === null) return;
    const response = await fetch('/api/account', { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation }) });
    const payload = await readResponse(response);
    if (!response.ok) throw new Error(payload.error || 'La suppression a échoué.');
    await authService.logout(); overlay.remove(); window.alert('Votre compte a été supprimé.');
  }, true);
  function setNotice(text, type = 'error') { notice.textContent = text; notice.dataset.type = type; notice.hidden = false; }
  for (const button of [saveButton, exportButton, deleteButton]) {
    button.addEventListener('click', async () => { notice.hidden = true; button.disabled = true; try { await button.action(); } catch (error) { setNotice(error.message); } finally { button.disabled = false; } });
  }
  modal.append(close, title, message, data, notice, saveButton, exportButton, deleteButton); overlay.appendChild(modal);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); }); document.body.appendChild(overlay);
}

function actionButton(label, action, destructive = false) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  button.style.cssText = `width:100%;padding:.8rem;border-radius:12px;border:0;margin-top:.75rem;color:white;font-weight:700;cursor:pointer;background:${destructive ? 'linear-gradient(135deg,#b32645,#e65454)' : 'linear-gradient(135deg,#667eea,#764ba2)'};`;
  button.action = action; return button;
}

function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
