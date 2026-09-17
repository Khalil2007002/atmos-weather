import { authService } from '../services/auth-service.js';
import { getPremiumFeaturesList } from '../utils/premium-features.js';
import { showAuthModal } from './auth-modal.js';

export function showPremiumModal() {
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
    padding: 2rem; max-width: 500px; width: 90%; max-height: 85vh; 
    overflow-y: auto; color: white; position: relative; 
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  `;
  
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.cssText = `
    position: absolute; top: 1rem; right: 1rem; background: none; 
    border: none; color: rgba(255,255,255,0.6); font-size: 1.5rem; cursor: pointer;
  `;
  closeBtn.onclick = () => overlay.remove();
  
  const title = document.createElement('h2');
  title.innerHTML = 'Atmos Premium <span style="color: gold;">✦</span>';
  title.style.cssText = 'margin-top: 0; text-align: center; margin-bottom: 1.5rem;';
  
  const featuresList = getPremiumFeaturesList();
  const featuresHtml = featuresList.map(f => `
    <li style="margin-bottom: 0.75rem; display: flex; align-items: start; gap: 0.5rem;">
      <span style="color: #667eea;">✓</span>
      <div>
        <div style="font-weight: 600;">${f.name}</div>
        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7);">${f.description}</div>
      </div>
    </li>
  `).join('');
  
  const featuresContainer = document.createElement('ul');
  featuresContainer.style.cssText = 'list-style: none; padding: 0; margin-bottom: 2rem;';
  featuresContainer.innerHTML = featuresHtml;
  
  const pricingContainer = document.createElement('div');
  pricingContainer.style.cssText = 'display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;';
  
  let selectedPlan = 'monthly';
  
  const planStyle = (isSelected) => `
    flex: 1; min-width: 150px; padding: 1rem; border-radius: 12px; cursor: pointer; text-align: center;
    background: ${isSelected ? 'rgba(102,126,234,0.2)' : 'rgba(255,255,255,0.05)'};
    border: 1px solid ${isSelected ? '#667eea' : 'rgba(255,255,255,0.1)'};
    transition: all 0.2s ease;
  `;
  
  const renderPricing = () => {
    pricingContainer.innerHTML = `
      <div id="plan-monthly" style="${planStyle(selectedPlan === 'monthly')}">
        <div style="font-weight: 600; margin-bottom: 0.5rem;">Mensuel</div>
        <div style="font-size: 1.5rem; font-weight: bold;">4.99€<span style="font-size: 1rem; font-weight: normal;">/mois</span></div>
      </div>
      <div id="plan-annual" style="${planStyle(selectedPlan === 'annual')}">
        <div style="font-weight: 600; margin-bottom: 0.5rem;">Annuel</div>
        <div style="font-size: 1.5rem; font-weight: bold;">39.99€<span style="font-size: 1rem; font-weight: normal;">/an</span></div>
        <div style="font-size: 0.8rem; color: #667eea; margin-top: 0.5rem;">Économisez 33%</div>
      </div>
    `;
    
    pricingContainer.querySelector('#plan-monthly').onclick = () => {
      selectedPlan = 'monthly';
      renderPricing();
    };
    pricingContainer.querySelector('#plan-annual').onclick = () => {
      selectedPlan = 'annual';
      renderPricing();
    };
  };
  
  renderPricing();
  
  const msgContainer = document.createElement('div');
  msgContainer.style.cssText = 'margin-bottom: 1rem; text-align: center; font-size: 0.9rem;';
  
  const submitBtn = document.createElement('button');
  submitBtn.textContent = "S'abonner maintenant";
  submitBtn.style.cssText = `
    background: linear-gradient(135deg, #667eea, #764ba2); border: none;
    border-radius: 12px; padding: 1rem; color: white; font-weight: bold; font-size: 1.1rem;
    cursor: pointer; width: 100%; box-shadow: 0 4px 15px rgba(102,126,234,0.4);
  `;
  
  submitBtn.onclick = async () => {
    if (!authService.isAuthenticated()) {
      overlay.remove();
      showAuthModal('register');
      return;
    }
    
    if (authService.isPremium()) {
      msgContainer.innerHTML = '<span style="color: #667eea;">Vous êtes déjà Premium !</span>';
      return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Préparation de la commande...';
    msgContainer.innerHTML = '';
    
    try {
      const res = await fetch('/api/premium/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify({ plan: selectedPlan })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Erreur lors du paiement');
      }
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        msgContainer.innerHTML = '<span style="color: #4cd137;">Paiement initialisé avec succès.</span>';
      }
    } catch (err) {
      msgContainer.innerHTML = `<span style="color: #e84118;">Le paiement doit être configuré (Stripe non configuré). ${err.message}</span>`;
      submitBtn.disabled = false;
      submitBtn.textContent = "S'abonner maintenant";
    }
  };
  
  modal.appendChild(closeBtn);
  modal.appendChild(title);
  modal.appendChild(featuresContainer);
  modal.appendChild(pricingContainer);
  modal.appendChild(msgContainer);
  
  if (!authService.isAuthenticated()) {
    const loginHint = document.createElement('p');
    loginHint.style.cssText = 'text-align: center; margin-top: 1rem; font-size: 0.9rem; color: rgba(255,255,255,0.7);';
    loginHint.innerHTML = 'Vous devez être connecté pour vous abonner. <a href="#" id="premium-login-link" style="color: white;">Se connecter</a>';
    modal.appendChild(submitBtn);
    modal.appendChild(loginHint);
    
    setTimeout(() => {
      document.getElementById('premium-login-link').onclick = (e) => {
        e.preventDefault();
        overlay.remove();
        showAuthModal('login');
      };
    }, 0);
  } else {
    modal.appendChild(submitBtn);
  }
  
  overlay.appendChild(modal);
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  
  document.body.appendChild(overlay);
}
