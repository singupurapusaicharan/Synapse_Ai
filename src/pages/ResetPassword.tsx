import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Lock, Loader2, ArrowLeft, Check, X, CheckCircle2 } from 'lucide-react';
import { apiClient } from '@/lib/api/client';

interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

const passwordRules: PasswordRule[] = [
  { id: 'length', label: 'Minimum 8 characters', test: (p) => p.length >= 8 },
  { id: 'uppercase', label: 'At least one uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'At least one number', test: (p) => /\d/.test(p) },
  { id: 'special', label: 'At least one special character', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  
  const navigate = useNavigate();
  const { toast } = useToast();

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setIsValidating(false);
        setIsValidToken(false);
        return;
      }

      try {
        const response = await apiClient.validateResetToken(token);
        if (response.error || !response.data?.valid) {
          setIsValidToken(false);
        } else {
          setIsValidToken(true);
        }
      } catch (err) {
        setIsValidToken(false);
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const passwordValidation = passwordRules.map(rule => ({
    ...rule,
    passed: rule.test(password),
  }));
  const allPasswordRulesPassed = passwordValidation.every(rule => rule.passed);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const canSubmit = allPasswordRulesPassed && passwordsMatch && password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (!allPasswordRulesPassed) {
      setError('Please ensure your password meets all requirements.');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    if (!token) {
      setError('Invalid reset token.');
      return;
    }

    setIsLoading(true);
    const response = await apiClient.resetPassword(token, password);
    setIsLoading(false);

    if (response.error) {
      setError(response.error);
      toast({
        title: 'Error',
        description: response.error,
        variant: 'destructive',
      });
    } else {
      setIsSuccess(true);
      toast({
        title: 'Password updated',
        description: 'Your password has been reset successfully.',
      });
      
      // Redirect to sign in after 2 seconds
      setTimeout(() => {
        navigate('/auth');
      }, 2000);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center mesh-gradient p-4">
        <div className="w-full max-w-md">
          <Card className="border-border/40 bg-card/60 backdrop-blur-xl rounded-2xl">
            <CardContent className="px-6 py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Validating reset link...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center mesh-gradient p-4">
        <div className="w-full max-w-md">
          {/* Back Button */}
          <button 
            onClick={() => navigate('/auth')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to sign in
          </button>

          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center glow-primary">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
            </div>
            <span className="text-2xl font-bold tracking-tight">Synapse</span>
          </div>

          <Card className="border-border/40 bg-card/60 backdrop-blur-xl rounded-2xl">
            <CardHeader className="text-center pb-6 pt-8">
              <CardTitle className="text-2xl font-bold text-destructive">
                Invalid Reset Link
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-2">
                This reset link is invalid or has expired.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-8">
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Please request a new password reset link from the sign in page.
                </p>
                <Button
                  onClick={() => navigate('/forgot-password')}
                  className="w-full h-12 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 glow-subtle transition-all duration-500"
                >
                  Request New Reset Link
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/auth')}
                  className="w-full h-12 rounded-xl border-border/50 bg-secondary/30 hover:bg-secondary/50 transition-all duration-300"
                >
                  Back to Sign In
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center mesh-gradient p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center glow-primary">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
            </div>
            <span className="text-2xl font-bold tracking-tight">Synapse</span>
          </div>

          <Card className="border-border/40 bg-card/60 backdrop-blur-xl rounded-2xl">
            <CardContent className="px-6 py-12 text-center">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-accent" />
                </div>
              </div>
              <h2 className="text-2xl font-bold mb-2">Password updated successfully.</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Redirecting to sign in page...
              </p>
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient p-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <button 
          onClick={() => navigate('/auth')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to sign in
        </button>

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary via-primary/80 to-accent flex items-center justify-center glow-primary">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <span className="text-2xl font-bold tracking-tight">Synapse</span>
        </div>

        <Card className="border-border/40 bg-card/60 backdrop-blur-xl rounded-2xl">
          <CardHeader className="text-center pb-6 pt-8">
            <CardTitle className="text-2xl font-bold">
              Reset Password
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              Enter your new password below
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="reset-password" className="text-sm font-medium">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="reset-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    onBlur={() => setPasswordTouched(true)}
                    className="pl-11 h-12 rounded-xl bg-secondary/40 border-border/50 focus:border-primary/50 transition-all duration-300"
                    disabled={isLoading}
                  />
                </div>
                {(passwordTouched || password.length > 0) && (
                  <div className="mt-3 space-y-1.5 bg-secondary/30 rounded-lg p-3">
                    {passwordValidation.map((rule) => (
                      <div 
                        key={rule.id} 
                        className={`flex items-center gap-2.5 text-xs transition-all duration-300 ${
                          rule.passed ? 'text-accent' : 'text-muted-foreground'
                        }`}
                      >
                        {rule.passed ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-muted-foreground/60" />
                        )}
                        <span className="font-medium">{rule.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reset-confirm-password" className="text-sm font-medium">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="reset-confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError('');
                    }}
                    onBlur={() => setConfirmPasswordTouched(true)}
                    className="pl-11 h-12 rounded-xl bg-secondary/40 border-border/50 focus:border-primary/50 transition-all duration-300"
                    disabled={isLoading}
                  />
                </div>
                {confirmPasswordTouched && confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-destructive mt-1.5">Passwords do not match.</p>
                )}
                {confirmPasswordTouched && confirmPassword && passwordsMatch && (
                  <p className="text-xs text-accent flex items-center gap-1.5 mt-1.5 font-medium">
                    <Check className="w-3.5 h-3.5" />
                    Passwords match
                  </p>
                )}
              </div>

              {error && (
                <p className="text-sm text-destructive text-center py-2">{error}</p>
              )}

              <Button 
                type="submit" 
                className="w-full h-12 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 glow-subtle transition-all duration-500" 
                disabled={isLoading || !canSubmit}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Resetting password...
                  </>
                ) : (
                  'Reset Password'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
