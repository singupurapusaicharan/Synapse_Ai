import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Mail, Lock, Loader2, User, Check, X, ArrowLeft } from 'lucide-react';
import { GoogleButton } from '@/components/GoogleButton';

type AuthMode = 'signin' | 'signup';

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

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export function Auth() {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  const [formError, setFormError] = useState('');

  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error === 'google_login_failed') {
      toast({
        title: 'Google sign-in failed',
        description: 'Please try again or use email/password.',
        variant: 'destructive',
      });
      // Clear the error from URL
      navigate('/auth', { replace: true });
    }
  }, [searchParams, toast, navigate]);

  useEffect(() => {
    setFormError('');
    setEmailTouched(false);
    setPasswordTouched(false);
    setConfirmPasswordTouched(false);
  }, [mode]);

  const isEmailValid = useMemo(() => validateEmail(email), [email]);
  const passwordValidation = useMemo(() => {
    return passwordRules.map(rule => ({
      ...rule,
      passed: rule.test(password),
    }));
  }, [password]);
  const allPasswordRulesPassed = passwordValidation.every(rule => rule.passed);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const canSubmit = useMemo(() => {
    if (mode === 'signin') {
      return email.length > 0 && password.length > 0;
    }
    return fullName.trim().length > 0 && isEmailValid && allPasswordRulesPassed && passwordsMatch;
  }, [mode, email, password, fullName, isEmailValid, allPasswordRulesPassed, passwordsMatch]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!email || !password) {
      setFormError('Please fill in all fields.');
      return;
    }

    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      if (error.message === 'Invalid login credentials') {
        setFormError('Incorrect email or password.');
      } else {
        toast({
          title: 'Sign in failed',
          description: error.message,
          variant: 'destructive',
        });
      }
    } else {
      toast({
        title: 'Welcome back!',
        description: 'You have successfully signed in.',
      });
      navigate('/');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!fullName.trim() || !email || !password || !confirmPassword) {
      setFormError('Please fill in all fields.');
      return;
    }

    if (!isEmailValid) {
      setFormError('Please enter a valid email address.');
      return;
    }

    if (!allPasswordRulesPassed) {
      setFormError('Please ensure your password meets all requirements.');
      return;
    }

    if (!passwordsMatch) {
      setFormError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(email, password);
    setIsLoading(false);

    if (error) {
      if (error.message.includes('already registered')) {
        setFormError('This email is already registered. Please sign in instead.');
      } else {
        toast({
          title: 'Sign up failed',
          description: error.message,
          variant: 'destructive',
        });
      }
    } else {
      toast({
        title: 'Account created!',
        description: 'You have successfully signed up.',
      });
      navigate('/');
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFormError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient p-4">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to home
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
              {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              {mode === 'signin' 
                ? 'Sign in to your AI memory assistant'
                : 'Get started with your AI memory assistant'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-8">
            {mode === 'signin' ? (
              <form onSubmit={handleSignIn} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signin-email" className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setEmailTouched(true)}
                      className="pl-11 h-12 rounded-xl bg-secondary/40 border-border/50 focus:border-primary/50 transition-all duration-300"
                      disabled={isLoading}
                    />
                  </div>
                  {emailTouched && email && !isEmailValid && (
                    <p className="text-xs text-destructive mt-1.5">Please enter a valid email address.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signin-password" className="text-sm font-medium">Password</Label>
                    <button
                      type="button"
                      onClick={() => navigate('/forgot-password')}
                      className="text-xs text-primary font-medium underline underline-offset-4 hover:text-primary/80 transition-colors duration-300"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-11 h-12 rounded-xl bg-secondary/40 border-border/50 focus:border-primary/50 transition-all duration-300"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {formError && (
                  <p className="text-sm text-destructive text-center py-2">{formError}</p>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 glow-subtle transition-all duration-500" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-sm font-medium">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-11 h-12 rounded-xl bg-secondary/40 border-border/50 focus:border-primary/50 transition-all duration-300"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setEmailTouched(true)}
                      className="pl-11 h-12 rounded-xl bg-secondary/40 border-border/50 focus:border-primary/50 transition-all duration-300"
                      disabled={isLoading}
                    />
                  </div>
                  {emailTouched && email && !isEmailValid && (
                    <p className="text-xs text-destructive mt-1.5">Please enter a valid email address.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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
                  <Label htmlFor="signup-confirm-password" className="text-sm font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="signup-confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
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

                {formError && (
                  <p className="text-sm text-destructive text-center py-2">{formError}</p>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 glow-subtle transition-all duration-500" 
                  disabled={isLoading || !canSubmit}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>
            )}

            <div className="relative my-7">
              <Separator className="bg-border/50" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-4 text-xs text-muted-foreground font-medium">
                or continue with
              </span>
            </div>

            <GoogleButton disabled={isLoading} />

            <div className="mt-8 text-center">
              {mode === 'signin' ? (
                <p className="text-sm text-muted-foreground">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="text-primary font-semibold underline underline-offset-4 hover:text-primary/80 transition-colors duration-300"
                  >
                    Sign up
                  </button>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="text-primary font-semibold underline underline-offset-4 hover:text-primary/80 transition-colors duration-300"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/70 mt-8 font-medium">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}