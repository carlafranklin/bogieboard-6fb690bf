import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Building2, Users, Calendar, Star, TrendingUp, Globe, Phone, MapPin, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Header } from '@/components/Header';
import { supabase } from '@/integrations/supabase/client';

import { useToast } from '@/hooks/use-toast';
import { getSafeErrorMessage } from '@/lib/errorUtils';
import { ForgotPasswordDialog } from '@/components/ForgotPasswordDialog';

const benefits = [
  { icon: Building2, title: 'Business Profile', description: 'Create a branded public page showcasing your business, location, and social links.' },
  { icon: Calendar, title: 'Event Posting', description: 'Post and manage your own events with image uploads, categories, and ticket links.' },
  { icon: Users, title: 'Team Management', description: 'Add key team members to your profile so customers know who to reach.' },
  { icon: Globe, title: 'Public Landing Page', description: 'Get a dedicated URL for your business with an event calendar visitors can browse.' },
  { icon: TrendingUp, title: 'Increased Visibility', description: 'Your events appear on BogieBoard, reaching local audiences actively looking for things to do.' },
  { icon: Star, title: 'Free to Join', description: 'The Partner Member program is completely free. Sign up and start posting today.' },
];

export default function PartnerMemberPage() {
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Partner signup fields
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (session) {
        const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id);
        const isPartner = roles?.some(r => r.role === 'partner') || false;
        if (isPartner) navigate('/partner-dashboard');
      }
    });
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id);
        const isPartner = roles?.some(r => r.role === 'partner') || false;
        if (isPartner) navigate('/partner-dashboard');
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: 'Welcome back!' });
      } else {
        // Signup flow
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (signUpData.user) {
          // Add partner role
          await supabase.from('user_roles').insert({ user_id: signUpData.user.id, role: 'partner' });

          // Create partner profile with slug
          const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const { data: profile } = await supabase.from('partner_profiles').insert({
            user_id: signUpData.user.id,
            business_name: businessName,
            slug: slug + '-' + Date.now().toString(36),
            address,
            city,
            state,
            zip_code: zipCode,
            phone,
          }).select('id').single();

          // Create contact as partner employee
          if (profile) {
            await supabase.from('partner_employees').insert({
              partner_profile_id: profile.id,
              name: contactName,
              email: contactEmail,
              phone: contactPhone,
              title: 'Primary Contact',
            });
          }
        }
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
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
      });
      if (result.redirected) return;
      if (result.error) {
        toast({ title: 'Error', description: getSafeErrorMessage(result.error), variant: 'destructive' });
        return;
      }
      toast({ title: 'Welcome!' });
      navigate('/partner-dashboard');
    } catch (error: any) {
      toast({ title: 'Sign in failed', description: getSafeErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-6xl">
          {/* Hero */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-4">
              For Businesses & Organizations
            </span>
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-foreground mb-4">Become a Partner Member</h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Promote your events, build your brand, and connect with local audiences — all for free on BogieBoard.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Benefits */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              <h2 className="font-display text-2xl font-bold text-foreground mb-6">Why Partner with BogieBoard?</h2>
              <div className="grid sm:grid-cols-2 gap-5">
                {benefits.map((b, i) => (
                  <motion.div key={b.title} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.07 }} className="flex gap-3 p-4 rounded-xl bg-card border border-border">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <b.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">{b.title}</h3>
                      <p className="text-muted-foreground text-xs mt-0.5">{b.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Auth Form */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
              <div className="bg-card rounded-2xl shadow-lg p-6 border border-border">
                <h2 className="font-display text-xl font-bold text-foreground text-center mb-1">
                  {isLogin ? 'Partner Sign In' : 'Partner Sign Up'}
                </h2>
                <p className="text-muted-foreground text-sm text-center mb-5">
                  {isLogin ? 'Sign in to manage your business' : 'Create your free Partner Member account'}
                </p>

                {/* Google - login only */}
                {isLogin && (
                  <>
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
                  </>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Business fields - signup only */}
                  {!isLogin && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="business-name">Business / Organization Name *</Label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input id="business-name" placeholder="Your Business Name" value={businessName} onChange={e => setBusinessName(e.target.value)} className="pl-10 h-12" required />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="biz-address">Address *</Label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input id="biz-address" placeholder="123 Main St" value={address} onChange={e => setAddress(e.target.value)} className="pl-10 h-12" required />
                        </div>
                      </div>

                      <div className="grid grid-cols-6 gap-2">
                        <div className="col-span-3 space-y-2">
                          <Label htmlFor="biz-city">City *</Label>
                          <Input id="biz-city" placeholder="City" value={city} onChange={e => setCity(e.target.value)} className="h-12" required />
                        </div>
                        <div className="col-span-1 space-y-2">
                          <Label htmlFor="biz-state">State *</Label>
                          <Input id="biz-state" placeholder="NC" value={state} onChange={e => setState(e.target.value)} className="h-12" required maxLength={2} />
                        </div>
                        <div className="col-span-2 space-y-2">
                          <Label htmlFor="biz-zip">Zip *</Label>
                          <Input id="biz-zip" placeholder="27601" value={zipCode} onChange={e => setZipCode(e.target.value)} className="h-12" required maxLength={10} />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="biz-phone">Phone *</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input id="biz-phone" type="tel" placeholder="(555) 123-4567" value={phone} onChange={e => setPhone(e.target.value)} className="pl-10 h-12" required />
                        </div>
                      </div>

                      <div className="border-t border-border pt-4 mt-2">
                        <p className="text-sm font-semibold text-foreground mb-3">Primary Contact</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="contact-name">Contact Name *</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input id="contact-name" placeholder="John Doe" value={contactName} onChange={e => setContactName(e.target.value)} className="pl-10 h-12" required />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="contact-email">Contact Email *</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input id="contact-email" type="email" placeholder="contact@business.com" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="pl-10 h-12" required />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="contact-phone">Contact Phone *</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input id="contact-phone" type="tel" placeholder="(555) 987-6543" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className="pl-10 h-12" required />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="partner-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="partner-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className="pl-10 h-12" required />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="partner-password">Password</Label>
                      {isLogin && <ForgotPasswordDialog />}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="partner-password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="pl-10 pr-10 h-12" required minLength={6} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-12 bg-primary hover:bg-green-dark text-primary-foreground font-semibold" disabled={loading}>
                    {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Partner Account'}
                  </Button>
                </form>

                <p className="text-center text-sm text-muted-foreground mt-4">
                  {isLogin ? 'New to BogieBoard?' : 'Already a Partner Member?'}{' '}
                  <button onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline font-medium">
                    {isLogin ? 'Sign up' : 'Sign in'}
                  </button>
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
