import { authService } from '../services/auth-service.js';
import { showPremiumModal } from './premium-modal.js';
import { showPrivacyModal } from './privacy-modal.js';

export function showProfileModal() {
  const user = authService.getUser();
  if (!user) return;
  
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.6); 
    backdrop-filter: blur(8px); z-index: 9999; display: flex; 
    align-items: center; justify-content: center;
  `;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: rgba(15,25,50,0.85); backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 20px;
    padding: 2rem; max-width: 440px; width: 90%; color: white;
    position: relative; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  `;
  
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.cssText = `
    position: absolute; top: 1rem; right: 1rem; background: none; 
    border: none; color: rgba(255,255,255,0.6); font-size: 1.5rem; cursor: pointer;
  `;
  closeBtn.onclick = () => overlay.remove();
  
  const content = document.createElement('div');
  
  const title = document.createElement('h2');
  title.textContent = 'Profil';
  title.style.cssText = 'margin-top: 0; text-align: center; margin-bottom: 1.5rem;';
  
  const info = document.createElement('div');
  info.style.cssText = 'background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;';
  
  const isPremium = authService.isPremium();
  const isAdmin = authService.isAdmin();
  const sub = user.subscription;
  const periodEndFormatted = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  info.innerHTML = `
    <p style="margin: 0 0 0.5rem 0;"><strong>Nom:</strong> ${escapeHtml(user.name || 'Utilisateur')}</p>
    <p style="margin: 0 0 0.5rem 0;"><strong>Email:</strong> ${escapeHtml(user.email)}</p>
    <p style="margin: 0${(isAdmin || sub) ? ' 0 0.5rem 0' : ''};"><strong>Statut:</strong> ${isPremium && !isAdmin ? '<span style="color: gold;">Premium ✦</span>' : isAdmin ? '<span style="color: gold;">Premium ✦</span>' : 'Gratuit'}</p>
    ${isAdmin ? '<p style="margin: 0;"><span style="display:inline-block;background:linear-gradient(135deg,#e040fb,#7c4dff);color:white;font-size:0.75rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:20px;letter-spacing:0.05em;">⚙ ADMIN</span></p>' : ''}
    ${sub && !isAdmin ? `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.85rem; color: rgba(255,255,255,0.8);">
        <p style="margin: 0 0 0.25rem 0;"><strong>Abonnement:</strong> ${sub.status === 'active' ? 'Actif' : sub.status === 'past_due' ? '<span style="color:#ff6b6b;">Paiement en attente</span>' : sub.status}</p>
        ${periodEndFormatted ? `<p style="margin: 0 0 0.25rem 0;">${sub.cancelAtPeriodEnd ? '<strong>Prend fin le:</strong> ' : '<strong>Renouvellement:</strong> '} ${periodEndFormatted}</p>` : ''}
        ${sub.cancelAtPeriodEnd ? '<p style="margin: 0.25rem 0 0; color: #fbc531;">Annulation programmée à l’échéance</p>' : ''}
      </div>
    ` : ''}
  `;
  
  const btnStyle = `
    background: linear-gradient(135deg, #667eea, #764ba2); border: none;
    border-radius: 12px; padding: 0.75rem; color: white; font-weight: 600;
    cursor: pointer; width: 100%; margin-bottom: 1rem;
  `;
  
  const logoutBtn = document.createElement('button');
  logoutBtn.textContent = 'Se déconnecter';
  logoutBtn.style.cssText = `
    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
    border-radius: 12px; padding: 0.75rem; color: white; font-weight: 600;
    cursor: pointer; width: 100%;
  `;
  logoutBtn.onclick = async () => {
    await authService.logout();
    overlay.remove();
  };
  
  content.appendChild(title);
  content.appendChild(info);
  
  if (!isPremium && !isAdmin) {
    const upgradeBtn = document.createElement('button');
    upgradeBtn.textContent = 'Passer à Premium ✦';
    upgradeBtn.style.cssText = btnStyle;
    upgradeBtn.onclick = () => {
      overlay.remove();
      showPremiumModal();
    };
    content.appendChild(upgradeBtn);
  }

  if (isPremium && !isAdmin && sub && !sub.cancelAtPeriodEnd) {
    const cancelSubBtn = document.createElement('button');
    cancelSubBtn.textContent = 'Résilier l’abonnement';
    cancelSubBtn.style.cssText = `
      background: transparent; border: 1px solid rgba(255,100,100,0.35);
      border-radius: 12px; padding: 0.65rem; color: #ff9999; font-weight: 600;
      font-size: 0.85rem; cursor: pointer; width: 100%; margin-bottom: 1rem;
      transition: background 150ms ease;
    `;
    cancelSubBtn.onclick = async () => {
      if (!confirm('Voulez-vous vraiment résilier votre abonnement ? Vous conserverez tous vos avantages Premium jusqu’à la fin de la période en cours.')) return;
      cancelSubBtn.disabled = true;
      cancelSubBtn.textContent = 'Résiliation en cours…';
      try {
        const res = await fetch('/api/premium/cancel', { method: 'POST', credentials: 'same-origin' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur lors de la résiliation');
        alert(data.message || 'Votre abonnement a été résilié pour la fin de la période en cours.');
        await authService.init();
        overlay.remove();
        showProfileModal();
      } catch (e) {
        alert(e.message);
        cancelSubBtn.disabled = false;
        cancelSubBtn.textContent = 'Résilier l’abonnement';
      }
    };
    content.appendChild(cancelSubBtn);
  }

  const privacyBtn = document.createElement('button');
  privacyBtn.textContent = 'Privacy & Account';
  privacyBtn.style.cssText = btnStyle;
  privacyBtn.onclick = () => {
    overlay.remove();
    showPrivacyModal();
  };
  content.appendChild(privacyBtn);
  
  content.appendChild(logoutBtn);
  
  modal.appendChild(closeBtn);
  modal.appendChild(content);
  overlay.appendChild(modal);
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  
  document.body.appendChild(overlay);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
