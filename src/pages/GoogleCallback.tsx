import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function GoogleCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (token) {
      // Store token
      localStorage.setItem('auth_token', token);

      // Ensure auth context is populated in the same page load.
      void (async () => {
        await refreshUser();
        // After Google login, guide user to connect Gmail in Sources (then return to dashboard).
        navigate('/sources?autoconnect=gmail&returnTo=%2F', { replace: true });
      })();
    } else {
      navigate('/auth?error=google_login_failed', { replace: true });
    }
  }, [searchParams, navigate, refreshUser]);

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

