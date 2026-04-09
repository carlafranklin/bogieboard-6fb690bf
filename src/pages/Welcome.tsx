import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Heart, Clock, Sparkles, ChevronRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingModal } from '@/components/OnboardingModal';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ProfileData {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  address: string | null;
  hometown: string | null;
  favorite_cities: string[];
  onboarding_completed: boolean;
  onboarding_skipped: boolean;
}

export default function Welcome() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [currentCity, setCurrentCity] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth', { replace: true });
        return;
      }

      const user = session.user;
      setUserId(user.id);

      // Extract name from Google metadata or profile
      const meta = user.user_metadata || {};
      const googleFirstName = meta.full_name?.split(' ')[0] || meta.name?.split(' ')[0] || '';
      const googleLastName = meta.full_name?.split(' ').slice(1).join(' ') || '';

      // Fetch profile
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('first_name, last_name, email, address, hometown, favorite_cities, onboarding_completed, onboarding_skipped')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileRow) {
        // If name is empty, populate from Google metadata
        if (!profileRow.first_name && googleFirstName) {
          await supabase
            .from('profiles')
            .update({ first_name: googleFirstName, last_name: googleLastName || null })
            .eq('user_id', user.id);
          profileRow.first_name = googleFirstName;
          profileRow.last_name = googleLastName || null;
        }

        const favCities = Array.isArray(profileRow.favorite_cities) ? profileRow.favorite_cities as string[] : [];
        const p: ProfileData = { ...profileRow, favorite_cities: favCities };
        setProfile(p);

        // Show onboarding for first-time users
        if (!p.onboarding_completed && !p.onboarding_skipped) {
          setShowOnboarding(true);
        }
      }

      // Try to detect city via geolocation
      detectCity();
      setLoading(false);
    };

    init();
  }, [navigate]);

  const detectCity = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village;
          const state = data.address?.state;
          if (city) setCurrentCity(state ? `${city}, ${state}` : city);
        } catch { /* silent */ }
      },
      () => { /* permission denied — silent */ }
    );
  };

  const handleOnboardingComplete = async (data: { hometown: string; favoriteCities: string[] }) => {
    if (!userId) return;
    await supabase
      .from('profiles')
      .update({
        hometown: data.hometown || null,
        favorite_cities: data.favoriteCities,
        onboarding_completed: true,
      })
      .eq('user_id', userId);

    setProfile(prev => prev ? {
      ...prev,
      hometown: data.hometown || null,
      favorite_cities: data.favoriteCities,
      onboarding_completed: true,
    } : prev);
    setShowOnboarding(false);
    toast({ title: 'Profile updated!', description: 'Your preferences have been saved.' });
  };

  const handleOnboardingSkip = async () => {
    if (!userId) return;
    await supabase
      .from('profiles')
      .update({ onboarding_skipped: true })
      .eq('user_id', userId);

    setProfile(prev => prev ? { ...prev, onboarding_skipped: true } : prev);
    setShowOnboarding(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16 px-4 max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </main>
      </div>
    );
  }

  const firstName = profile?.first_name || 'there';
  const displayCity = profile?.address || currentCity;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Welcome banner */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 border border-border p-8"
          >
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium text-primary uppercase tracking-wide">Your Concierge</span>
              </div>
              <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
                Thank you, {firstName}.
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
                Welcome to BogieBoard — your personalized concierge for local events and happenings tailored to you.
              </p>
            </div>
            {/* Decorative blob */}
            <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
          </motion.div>

          {/* Profile card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="rounded-2xl shadow-md border-border">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-bold text-foreground">Your Profile</h2>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/profile')} className="text-primary">
                    Edit profile <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ProfileField
                    icon={<MapPin className="w-4 h-4 text-primary" />}
                    label="Name"
                    value={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null}
                  />
                  <ProfileField
                    icon={<MapPin className="w-4 h-4 text-primary" />}
                    label="Current City"
                    value={displayCity}
                    fallback="Location not detected"
                  />
                  <ProfileField
                    icon={<MapPin className="w-4 h-4 text-secondary" />}
                    label="Hometown"
                    value={profile?.hometown}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <Heart className="w-4 h-4 text-secondary" />
                      Favorite Cities
                    </div>
                    {profile?.favorite_cities && profile.favorite_cities.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {profile.favorite_cities.map(city => (
                          <Badge key={city} variant="secondary" className="text-xs">{city}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground/70 italic">Not set yet</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Liked events carousel */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="rounded-2xl shadow-md border-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                    <Clock className="w-5 h-5 text-accent" />
                    Liked Events & History
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/events')} className="text-primary">
                    Browse events <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>

                {/* Empty state carousel placeholder */}
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                  {[1, 2, 3].map(i => (
                    <div
                      key={i}
                      className="flex-shrink-0 w-64 h-44 rounded-xl border-2 border-dashed border-border bg-muted/30 flex flex-col items-center justify-center text-center p-6"
                    >
                      <Heart className="w-8 h-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground/60">
                        {i === 1
                          ? 'No liked events yet.'
                          : i === 2
                            ? 'Start exploring and save events you love.'
                            : 'Your favorites will appear here.'}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* CTA if onboarding not done */}
          {!profile?.onboarding_completed && !showOnboarding && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              <Button
                onClick={() => setShowOnboarding(true)}
                variant="outline"
                className="w-full h-12 border-primary/30 text-primary hover:bg-primary/5"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Customize my experience
              </Button>
            </motion.div>
          )}
        </div>
      </main>

      <Footer isLoggedIn={true} />

      {showOnboarding && (
        <OnboardingModal
          firstName={firstName}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
    </div>
  );
}

function ProfileField({
  icon,
  label,
  value,
  fallback = 'Not set yet',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  fallback?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {icon}
        {label}
      </div>
      {value ? (
        <p className="text-sm font-medium text-foreground">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground/70 italic">{fallback}</p>
      )}
    </div>
  );
}
