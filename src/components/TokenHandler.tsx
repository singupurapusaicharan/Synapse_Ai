import { useEffect } from 'react';

// Check for token IMMEDIATELY when module loads (before React Router)
const urlParams = new URLSearchParams(window.location.search);
const tokenFromUrl = urlParams.get('token');

if (tokenFromUrl) {
  console.log('[TokenHandler INIT] Token found in URL on module load!');
  console.log('[TokenHandler INIT] Token:', tokenFromUrl.substring(0, 30) + '...');
  
  // Store it immediately
  localStorage.setItem('auth_token', tokenFromUrl);
  console.log('[TokenHandler INIT] Token stored in localStorage');
  
  // Clean URL
  window.history.replaceState({}, '', '/');
  console.log('[TokenHandler INIT] URL cleaned, will reload...');
  
  // Mark that we need to reload
  sessionStorage.setItem('needs_reload_after_google_login', 'true');
}

export function TokenHandler() {
  useEffect(() => {
    console.log('[TokenHandler] Component mounted');
    
    // Check if we need to reload after token storage
    if (sessionStorage.getItem('needs_reload_after_google_login') === 'true') {
      console.log('[TokenHandler] Reload flag found, reloading now...');
      sessionStorage.removeItem('needs_reload_after_google_login');
      window.location.reload();
    }
  }, []);

  return null;
}

