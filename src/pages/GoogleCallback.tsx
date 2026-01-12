import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export function GoogleCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (token) {
      // Store token
      localStorage.setItem('auth_token', token);

      // After Google login, force a full reload into Sources auto-connect flow.
      // This avoids timing issues where the Sources page mounts before auth context updates.
      window.location.replace('/sources?autoconnect=gmail&returnTo=%2F');
    } else {
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

