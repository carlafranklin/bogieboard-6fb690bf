import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Header } from '@/components/Header';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getSafeErrorMessage } from '@/lib/errorUtils';
import { ForgotPasswordDialog } from '@/components/ForgotPasswordDialog';
import bogieBoardLogo from '@/assets/bogieboard-logo.png';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isPartnerSignup, setIsPartnerSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        if ((event as string) === 'SIGNED_UP') {
          navigate('/welcome');
          return;
        }
        const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id);
        const isPartner = roles?.some(r => r.role === 'partner') || false;
        navigate(isPartner ? '/partner-dashboard' : '/');
      }
    });
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id);
        const isPartner = roles?.some(r => r.role === 'partner') || false;
        navigate(isPartner ? '/partner-dashboard' : '/');
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: 'Welcome back!' });
      } else {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              first_name: firstName,
              last_name: lastName,
              ...(isPartnerSignup ? { is_partner: true } : {}),
            },
          },
        });
        if (error) throw error;
        toast({ title: 'Check your email', description: 'We sent you a confirmation link.' });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Sign in failed', description: getSafeErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16 px-4 flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src={bogieBoardLogo} alt="BogieBoard" className="h-12 mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold text-foreground">
              {isLogin ? 'Welcome Back' : isPartnerSignup ? 'Partner Sign Up' : 'Create Account'}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isLogin ? 'Sign in to your account' : isPartnerSignup ? 'Create a Partner Member account to post events' : 'Join BogieBoard today'}
            </p>
          </div>

          <div className="bg-card rounded-2xl shadow-lg p-6 border border-border">
            <Button variant="outline" className="w-full h-12 mb-4" onClick={handleGoogleSignIn}>
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-4">
              {!isLogin && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" type="text" placeholder="Jane" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-12" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" type="text" placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-12" required />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-12" required />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password">Password</Label>
                  {isLogin && <ForgotPasswordDialog />}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-10 h-12" required minLength={6} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full h-12 bg-primary hover:bg-green-dark text-primary-foreground font-semibold" disabled={loading}>
                {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-4">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button onClick={() => { setIsLogin(!isLogin); setIsPartnerSignup(false); }} className="text-primary hover:underline font-medium">
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
            {!isLogin && !isPartnerSignup && (
              <p className="text-center text-sm text-muted-foreground mt-2">
                Are you a business?{' '}
                <button onClick={() => setIsPartnerSignup(true)} className="text-secondary hover:underline font-medium">
                  Sign up as a Partner Member
                </button>
              </p>
            )}
            {isPartnerSignup && (
              <p className="text-center text-sm text-muted-foreground mt-2">
                <button onClick={() => setIsPartnerSignup(false)} className="text-primary hover:underline font-medium">
                  Sign up as a regular user instead
                </button>
              </p>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            Note: Facebook login is not yet available. Use Google or email/password.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
