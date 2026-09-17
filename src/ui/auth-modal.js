import { authService } from '../services/auth-service.js';

export function showAuthModal(mode = 'login') {
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
  
  const form = document.createElement('form');
  
  const render = (currentMode) => {
    form.innerHTML = '';
    const isLogin = currentMode === 'login';
    
    const title = document.createElement('h2');
    title.textContent = isLogin ? 'Connexion' : 'Inscription';
    title.style.cssText = 'margin-top: 0; text-align: center; margin-bottom: 1.5rem;';
    
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = 'color: #ff6b6b; margin-bottom: 1rem; text-align: center; display: none;';
    
    const inputStyle = `
      width: 100%; padding: 0.75rem 1rem; border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05);
      color: white; font-size: 1rem; outline: none; margin-bottom: 1rem; box-sizing: border-box;
    `;
    
    form.appendChild(title);
    form.appendChild(errorMsg);

    let nameInput;
    if (!isLogin) {
      nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = 'Nom';
      nameInput.required = true;
      nameInput.style.cssText = inputStyle;
      form.appendChild(nameInput);
    }
    
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.placeholder = 'Email';
    emailInput.required = true;
    emailInput.style.cssText = inputStyle;
    
    const pwdInput = document.createElement('input');
    pwdInput.type = 'password';
    pwdInput.placeholder = 'Mot de passe';
    pwdInput.required = true;
    pwdInput.style.cssText = inputStyle;
    
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = isLogin ? 'Se connecter' : "S'inscrire";
    submitBtn.style.cssText = `
      background: linear-gradient(135deg, #667eea, #764ba2); border: none;
      border-radius: 12px; padding: 0.75rem; color: white; font-weight: 600;
      cursor: pointer; width: 100%; margin-top: 0.5rem; font-size: 1rem;
    `;
    
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.textContent = isLogin ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Se connecter";
    toggleBtn.style.cssText = `
      background: none; border: none; color: rgba(255,255,255,0.7); 
      width: 100%; margin-top: 1rem; cursor: pointer; text-decoration: underline;
    `;
    toggleBtn.onclick = () => render(isLogin ? 'register' : 'login');
    
    form.appendChild(emailInput);
    form.appendChild(pwdInput);
    form.appendChild(submitBtn);
    form.appendChild(toggleBtn);
    
    form.onsubmit = async (e) => {
      e.preventDefault();
      errorMsg.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Patientez...';
      try {
        if (isLogin) {
          await authService.login(emailInput.value, pwdInput.value);
        } else {
          await authService.register(emailInput.value, nameInput.value, pwdInput.value);
        }
        overlay.remove();
      } catch (error) {
        errorMsg.textContent = error.message;
        errorMsg.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = isLogin ? 'Se connecter' : "S'inscrire";
      }
    };
  };
  
  render(mode);
  
  modal.appendChild(closeBtn);
  modal.appendChild(form);
  overlay.appendChild(modal);
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  
  document.body.appendChild(overlay);
}
