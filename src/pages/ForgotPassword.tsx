import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { apiClient } from '@/lib/api/client';

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  
  const navigate = useNavigate();
  const { toast } = useToast();

  const isEmailValid = validateEmail(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    if (!isEmailValid) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiClient.forgotPassword(email);
      setIsLoading(false);

      if (response.error) {
        console.error('Forgot password error:', response.error);
        setError(response.error);
        toast({
          title: 'Error',
          description: response.error,
          variant: 'destructive',
        });
      } else {
        setIsSuccess(true);
        toast({
          title: 'Reset link sent',
          description: 'If an account with that email exists, a password reset link has been sent.',
        });
      }
    } catch (err) {
      setIsLoading(false);
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Forgot password exception:', err);
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

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
              Forgot your password?
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              Enter your registered email address and we'll send you a reset link.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-8">
            {isSuccess ? (
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-accent" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Password reset link has been sent to your email.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Please check your inbox and follow the instructions to reset your password.
                  </p>
                </div>
                <Button
                  onClick={() => navigate('/auth')}
                  className="w-full h-12 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 glow-subtle transition-all duration-500"
                >
                  Back to Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError('');
                      }}
                      onBlur={() => setEmailTouched(true)}
                      className="pl-11 h-12 rounded-xl bg-secondary/40 border-border/50 focus:border-primary/50 transition-all duration-300"
                      disabled={isLoading}
                    />
                  </div>
                  {emailTouched && email && !isEmailValid && (
                    <p className="text-xs text-destructive mt-1.5">Please enter a valid email address.</p>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-destructive text-center py-2">{error}</p>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 glow-subtle transition-all duration-500" 
                  disabled={isLoading || !email || !isEmailValid}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending reset link...
                    </>
                  ) : (
                    'Send reset link'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/70 mt-8 font-medium">
          Remember your password?{' '}
          <button
            onClick={() => navigate('/auth')}
            className="text-primary font-semibold underline underline-offset-4 hover:text-primary/80 transition-colors duration-300"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
