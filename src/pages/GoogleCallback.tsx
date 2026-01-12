import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export function GoogleCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[GoogleCallback] Page loaded');
    console.log('[GoogleCallback] Location:', {
      href: window.location.href,
      origin: window.location.origin,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    });
    
    const token = searchParams.get('token');
    console.log('[GoogleCallback] Token from searchParams:', token ? 'FOUND' : 'NOT FOUND');
    
    if (token) {
      console.log('[GoogleCallback] Token length:', token.length);
      console.log('[GoogleCallback] Token preview:', token.substring(0, 50) + '...');
      
      // Store token
      localStorage.setItem('auth_token', token);
      console.log('[GoogleCallback] ✅ Token stored in localStorage');
      
      // Verify
      const stored = localStorage.getItem('auth_token');
      console.log('[GoogleCallback] Verification:', stored ? 'SUCCESS' : 'FAILED');
      
      // Navigate to landing/dashboard route (app decides what to show based on auth)
      console.log('[GoogleCallback] Navigating to / ...');
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 500);
    } else {
      console.error('[GoogleCallback] No token found, redirecting to auth');
      navigate('/auth?error=google_login_failed', { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div className="h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-primary animate-pulse">
          <Sparkles className="w-8 h-8 text-primary-foreground" />
        </div>
        <div className="text-lg font-medium">Completing sign-in...</div>
        <div className="text-sm text-muted-foreground">Please wait</div>
      </div>
    </div>
  );
}

