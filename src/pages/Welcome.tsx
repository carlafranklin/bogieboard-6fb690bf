import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Heart, Compass, Sparkles, ChevronRight, Home, Star, User } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
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

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

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
      if (!session) { navigate('/auth', { replace: true }); return; }

      const user = session.user;
      setUserId(user.id);

      const meta = user.user_metadata || {};
      const googleFirstName = meta.full_name?.split(' ')[0] || meta.name?.split(' ')[0] || '';
      const googleLastName = meta.full_name?.split(' ').slice(1).join(' ') || '';

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('first_name, last_name, email, address, hometown, favorite_cities, onboarding_completed, onboarding_skipped')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileRow) {
        if (!profileRow.first_name && googleFirstName) {
          await supabase.from('profiles').update({ first_name: googleFirstName, last_name: googleLastName || null }).eq('user_id', user.id);
          profileRow.first_name = googleFirstName;
          profileRow.last_name = googleLastName || null;
        }
        const favCities = Array.isArray(profileRow.favorite_cities) ? profileRow.favorite_cities as string[] : [];
        const p: ProfileData = { ...profileRow, favorite_cities: favCities };
        setProfile(p);
        if (!p.onboarding_completed && !p.onboarding_skipped) setShowOnboarding(true);
      }

      detectCity(user.id, profileRow?.address ?? null);
      setLoading(false);
    };
    init();
  }, [navigate]);

  const detectCity = async (uid: string, savedAddress: string | null) => {
    // 1) If profile already has a saved city, use it immediately
    if (savedAddress) {
      setCurrentCity(savedAddress);
      return;
    }

    // 2) Try IP-based geolocation first (fast, no permission prompt)
    try {
      const ipRes = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        const city = ipData.city;
        const region = ipData.region;
        if (city) {
          const detected = region ? `${city}, ${region}` : city;
          setCurrentCity(detected);
          // Persist to profile
          await supabase.from('profiles').update({ address: detected }).eq('user_id', uid);
          return;
        }
      }
    } catch { /* timeout or network error – fall through */ }

    // 3) Fall back to browser Geolocation API + reverse geocoding
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`,
            { headers: { 'Accept-Language': 'en' }, signal: AbortSignal.timeout(5000) }
          );
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village;
          const state = data.address?.state;
          if (city) {
            const detected = state ? `${city}, ${state}` : city;
            setCurrentCity(detected);
            await supabase.from('profiles').update({ address: detected }).eq('user_id', uid);
          }
        } catch { /* silent */ }
      },
      () => { /* permission denied or unavailable – city stays null */ },
      { timeout: 8000 }
    );
  };

  const handleOnboardingComplete = async (data: { hometown: string; favoriteCities: string[] }) => {
    if (!userId) return;
    await supabase.from('profiles').update({ hometown: data.hometown || null, favorite_cities: data.favoriteCities, onboarding_completed: true }).eq('user_id', userId);
    setProfile(prev => prev ? { ...prev, hometown: data.hometown || null, favorite_cities: data.favoriteCities, onboarding_completed: true } : prev);
    setShowOnboarding(false);
    toast({ title: 'You\'re all set!', description: 'Your preferences have been saved.' });
  };

  const handleOnboardingSkip = async () => {
    if (!userId) return;
    await supabase.from('profiles').update({ onboarding_skipped: true }).eq('user_id', userId);
    setProfile(prev => prev ? { ...prev, onboarding_skipped: true } : prev);
    setShowOnboarding(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-20 pb-16 px-4 max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-40 w-full rounded-3xl" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
          <Skeleton className="h-48 w-full rounded-3xl" />
        </main>
      </div>
    );
  }

  const firstName = profile?.first_name || 'there';
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
  const displayCity = profile?.address || currentCity;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-20 pb-20">
        <motion.div
          className="max-w-3xl mx-auto px-4 sm:px-6"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          {/* ── Hero greeting ── */}
          <motion.section variants={fadeUp} className="relative mb-8">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/12 via-card to-secondary/8 border border-primary/10 px-6 py-10 sm:px-10 sm:py-14">
              {/* Decorative elements */}
              <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-primary/6 blur-3xl pointer-events-none" />
              <div className="absolute -left-12 -bottom-12 w-48 h-48 rounded-full bg-accent/10 blur-2xl pointer-events-none" />

              <div className="relative z-10">
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1.5 mb-5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary uppercase tracking-widest">Your Concierge</span>
                </motion.div>

                <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-4">
                  Welcome, <span className="text-primary">{firstName}</span>.
                </h1>
                <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl">
                  Thank you for joining BogieBoard — your personalized concierge for local events and happenings, tailored just for you.
                </p>
              </div>
            </div>
          </motion.section>

          {/* ── Profile details grid ── */}
          <motion.section variants={fadeUp} className="mb-8">
            <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="font-display text-lg font-bold text-foreground">About You</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/profile')}
                className="text-primary hover:text-primary/80 text-sm gap-1 -mr-2"
              >
                Edit profile <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <ProfileTile
                icon={<User className="w-5 h-5" />}
                iconColor="text-primary"
                label="Name"
                value={fullName}
                emptyText="Add your name"
              />
              <ProfileTile
                icon={<MapPin className="w-5 h-5" />}
                iconColor="text-primary"
                label="Current City"
                value={displayCity}
                emptyText="Detecting location…"
              />
              <ProfileTile
                icon={<Home className="w-5 h-5" />}
                iconColor="text-secondary"
                label="Hometown"
                value={profile?.hometown}
                emptyText="Where are you from?"
                onAdd={!profile?.onboarding_completed ? () => setShowOnboarding(true) : undefined}
              />
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-5 h-5 text-accent" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Favorite Cities</span>
                </div>
                {profile?.favorite_cities && profile.favorite_cities.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-auto">
                    {profile.favorite_cities.map(city => (
                      <Badge key={city} variant="secondary" className="text-xs font-medium">{city}</Badge>
                    ))}
                  </div>
                ) : (
                  <div className="mt-auto">
                    <p className="text-sm text-muted-foreground/60 italic leading-snug">Where do you love to visit?</p>
                    {!profile?.onboarding_completed && (
                      <button onClick={() => setShowOnboarding(true)} className="text-xs text-primary font-medium mt-1.5 hover:underline">
                        + Add cities
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.section>

          {/* ── Liked events rail ── */}
          <motion.section variants={fadeUp} className="mb-8">
            <div className="flex items-center justify-between mb-4 px-1">
              <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                <Heart className="w-5 h-5 text-destructive/70" />
                Liked Events
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/events')}
                className="text-primary hover:text-primary/80 text-sm gap-1 -mr-2"
              >
                Explore events <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Premium empty-state rail */}
            <div className="relative">
              <div className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-hide -mx-1 px-1">
                {[
                  { emoji: '🎶', title: 'Live Music', text: 'Concerts and jams near you' },
                  { emoji: '🎨', title: 'Arts & Culture', text: 'Galleries, theatre, and more' },
                  { emoji: '🍔', title: 'Food & Drink', text: 'Tastings, pop-ups, and fests' },
                  { emoji: '🏃', title: 'Active & Outdoors', text: 'Runs, hikes, and games' },
                ].map((card, i) => (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    onClick={() => navigate('/events')}
                    className="flex-shrink-0 w-56 sm:w-64 snap-start cursor-pointer group"
                  >
                    <div className="h-40 sm:h-44 rounded-2xl border border-dashed border-border/80 bg-gradient-to-b from-muted/20 to-muted/40 flex flex-col items-center justify-center text-center p-5 transition-all duration-300 group-hover:border-primary/30 group-hover:bg-primary/5 group-hover:shadow-md">
                      <span className="text-3xl mb-2.5">{card.emoji}</span>
                      <p className="text-sm font-semibold text-foreground/80 mb-1">{card.title}</p>
                      <p className="text-xs text-muted-foreground/60 leading-snug">{card.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
              {/* Fade edge hint */}
              <div className="absolute right-0 top-0 bottom-3 w-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />
            </div>
            <p className="text-center text-sm text-muted-foreground/50 mt-3 italic">
              Save events you love and they'll appear here.
            </p>
          </motion.section>

          {/* ── Customize CTA (if onboarding incomplete) ── */}
          {!profile?.onboarding_completed && !showOnboarding && (
            <motion.section variants={fadeUp}>
              <button
                onClick={() => setShowOnboarding(true)}
                className="w-full rounded-2xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors p-5 flex items-center justify-center gap-3 group"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Compass className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">Customize your experience</p>
                  <p className="text-xs text-muted-foreground">Tell us what you love so we can curate events for you.</p>
                </div>
                <ChevronRight className="w-5 h-5 text-primary/50 ml-auto" />
              </button>
            </motion.section>
          )}
        </motion.div>
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

/* ── Profile tile component ── */
function ProfileTile({
  icon,
  iconColor,
  label,
  value,
  emptyText,
  onAdd,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  value: string | null | undefined;
  emptyText: string;
  onAdd?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <span className={iconColor}>{icon}</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      {value ? (
        <p className="text-sm font-medium text-foreground mt-auto">{value}</p>
      ) : (
        <div className="mt-auto">
          <p className="text-sm text-muted-foreground/60 italic leading-snug">{emptyText}</p>
          {onAdd && (
            <button onClick={onAdd} className="text-xs text-primary font-medium mt-1.5 hover:underline">
              + Add
            </button>
          )}
        </div>
      )}
    </div>
  );
}
