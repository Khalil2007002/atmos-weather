import { authService } from '../services/auth-service.js';
import { showPremiumModal } from './premium-modal.js';

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
  info.innerHTML = `
    <p style="margin: 0 0 0.5rem 0;"><strong>Nom:</strong> ${user.name || 'Utilisateur'}</p>
    <p style="margin: 0 0 0.5rem 0;"><strong>Email:</strong> ${user.email}</p>
    <p style="margin: 0;"><strong>Statut:</strong> ${isPremium ? '<span style="color: gold;">Premium ✦</span>' : 'Gratuit'}</p>
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
  
  if (!isPremium) {
    const upgradeBtn = document.createElement('button');
    upgradeBtn.textContent = 'Passer à Premium ✦';
    upgradeBtn.style.cssText = btnStyle;
    upgradeBtn.onclick = () => {
      overlay.remove();
      showPremiumModal();
    };
    content.appendChild(upgradeBtn);
  }
  
  content.appendChild(logoutBtn);
  
  modal.appendChild(closeBtn);
  modal.appendChild(content);
  overlay.appendChild(modal);
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  
  document.body.appendChild(overlay);
}
