import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Heart, Compass, Sparkles, ChevronRight, Home, Star, User, Calendar, Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { OnboardingModal } from '@/components/OnboardingModal';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { detectUserLocation, findNearestMetro, mapCityToMetro } from '@/lib/locationUtils';
import { format } from 'date-fns';

interface ProfileData {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  address: string | null;
  hometown: string | null;
  favorite_cities: string[];
  onboarding_completed: boolean;
  onboarding_skipped: boolean;
  last_login_at: string | null;
  first_login_at: string | null;
  detected_city: string | null;
  detected_state: string | null;
}

interface NearbyEvent {
  event_id: string;
  title: string;
  image_url: string | null;
  start_time: string;
  venue_name: string | null;
  venue_city: string | null;
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
  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [lastLoginDisplay, setLastLoginDisplay] = useState<string | null>(null);
  const [nearbyEvents, setNearbyEvents] = useState<NearbyEvent[]>([]);
  const [nearestMetroName, setNearestMetroName] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [promptFirstName, setPromptFirstName] = useState('');
  const [promptLastName, setPromptLastName] = useState('');
  const [savingName, setSavingName] = useState(false);


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
        .select('first_name, last_name, email, address, hometown, favorite_cities, onboarding_completed, onboarding_skipped, last_login_at, first_login_at, detected_city, detected_state')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileRow) {
        // Fill in name from Google if missing
        if (!profileRow.first_name && googleFirstName) {
          await supabase.from('profiles').update({ first_name: googleFirstName, last_name: googleLastName || null }).eq('user_id', user.id);
          profileRow.first_name = googleFirstName;
          profileRow.last_name = googleLastName || null;
        }

        const favCities = Array.isArray(profileRow.favorite_cities) ? profileRow.favorite_cities as string[] : [];
        const p: ProfileData = { ...profileRow, favorite_cities: favCities } as ProfileData;
        setProfile(p);

        if (!p.first_name && !p.last_name) {
          setShowNamePrompt(true);
        }


        // Determine new vs returning user
        const prevLogin = (profileRow as any).last_login_at;
        if (!prevLogin && !(profileRow as any).first_login_at) {
          setIsNewUser(true);
        } else if (prevLogin) {
          setIsNewUser(false);
          try {
            setLastLoginDisplay(format(new Date(prevLogin), 'MMMM d, yyyy'));
          } catch { setLastLoginDisplay(null); }
        }

        // Update login timestamps
        const now = new Date().toISOString();
        const loginUpdate: Record<string, any> = { last_login_at: now };
        if (!(profileRow as any).first_login_at) {
          loginUpdate.first_login_at = now;
        }
        await supabase.from('profiles').update(loginUpdate).eq('user_id', user.id);

        if (!p.onboarding_completed && !p.onboarding_skipped) setShowOnboarding(true);

        // Use stored detected city if available
        if ((profileRow as any).detected_city) {
          const storedDisplay = (profileRow as any).detected_state
            ? `${(profileRow as any).detected_city}, ${(profileRow as any).detected_state}`
            : (profileRow as any).detected_city;
          setDetectedCity(storedDisplay);
        }
      }

      setLoading(false);

      // Detect location in background
      detectAndMapLocation(user.id, profileRow);
    };
    init();
  }, [navigate]);

  const detectAndMapLocation = async (uid: string, profileRow: any) => {
    // If we already have a detected city from profile, use it to load events
    if (profileRow?.detected_city) {
      const cityName = profileRow.detected_city;
      setDetectedCity(profileRow.detected_state ? `${cityName}, ${profileRow.detected_state}` : cityName);
      loadNearbyEventsForCity(cityName);
      return;
    }

    setDetectingLocation(true);
    const loc = await detectUserLocation();
    setDetectingLocation(false);

    if (loc.city) {
      setDetectedCity(loc.display);

      // Persist detected location
      await supabase.from('profiles').update({
        detected_city: loc.city,
        detected_state: loc.state,
        detected_zip: loc.zip,
        // Also update current_city if not set
        ...(profileRow?.address ? {} : { address: loc.display, current_city: loc.city, current_state: loc.state, current_zip: loc.zip }),
      } as any).eq('user_id', uid);

      loadNearbyEventsForCity(loc.city, loc.latitude, loc.longitude);
    }
  };

  const loadNearbyEventsForCity = async (cityName: string, lat?: number | null, lng?: number | null) => {
    setLoadingEvents(true);

    // Map to nearest metro
    let metroSlug: string | null = null;
    const mapping = await mapCityToMetro(cityName);
    if (mapping) {
      metroSlug = mapping.metroSlug;
      setNearestMetroName(mapping.metroName);
    } else if (lat && lng) {
      const nearest = await findNearestMetro(lat, lng);
      if (nearest) {
        metroSlug = nearest.slug;
        setNearestMetroName(nearest.name);
      }
    }

    if (metroSlug) {
      const { data } = await supabase.rpc('search_events', {
        p_metro_slug: metroSlug,
        p_limit: 8,
      });
      if (data) {
        setNearbyEvents(data.map((e: any) => ({
          event_id: e.event_id,
          title: e.title,
          image_url: e.image_url,
          start_time: e.start_time,
          venue_name: e.venue_name,
          venue_city: e.venue_city,
        })));
      }
    }
    setLoadingEvents(false);
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

  const handleSaveName = async () => {
    if (!userId) return;
    const first = promptFirstName.trim();
    const last = promptLastName.trim();
    if (!first && !last) return;
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: userId, first_name: first || null, last_name: last || null } as any, { onConflict: 'user_id' });
    setSavingName(false);
    if (error) {
      toast({ title: 'Could not save name', description: error.message, variant: 'destructive' });
      return;
    }
    setProfile(prev => prev ? { ...prev, first_name: first || null, last_name: last || null } : prev);
    setShowNamePrompt(false);
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
  const displayCity = detectedCity || profile?.address || null;

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

                {isNewUser ? (
                  <>
                    <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-4">
                      Thank you for signing up, <span className="text-primary">{firstName}</span>.
                    </h1>
                    <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl">
                      BogieBoard is your personalized concierge for local events and happenings, tailored just for you.
                    </p>
                  </>
                ) : (
                  <>
                    <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-4">
                      Welcome back, <span className="text-primary">{firstName}</span>.
                    </h1>
                    {lastLoginDisplay ? (
                      <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl">
                        You last logged in on <span className="font-medium text-foreground/80">{lastLoginDisplay}</span>.
                      </p>
                    ) : (
                      <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl">
                        Great to have you back. Let's find something fun.
                      </p>
                    )}
                  </>
                )}

                {/* Location-aware message */}
                <div className="mt-5 flex items-center gap-2 text-sm">
                  {detectingLocation ? (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Detecting your location…
                    </span>
                  ) : displayCity ? (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 text-primary" />
                      Logged in from <span className="font-medium text-foreground/80">{displayCity}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.section>

          {/* ── Nearby Events Section ── */}
          {(nearbyEvents.length > 0 || loadingEvents || nearestMetroName) && (
            <motion.section variants={fadeUp} className="mb-8">
              <div className="flex items-center justify-between mb-4 px-1">
                <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                  <Compass className="w-5 h-5 text-primary" />
                  {nearestMetroName
                    ? `Events near ${nearestMetroName}`
                    : 'Events in your area'}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/events')}
                  className="text-primary hover:text-primary/80 text-sm gap-1 -mr-2"
                >
                  See all <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>

              {loadingEvents ? (
                <div className="flex gap-4 overflow-hidden">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="w-56 h-48 rounded-2xl shrink-0" />)}
                </div>
              ) : nearbyEvents.length > 0 ? (
                <div className="relative">
                  <div className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-hide -mx-1 px-1">
                    {nearbyEvents.map((ev, i) => (
                      <motion.div
                        key={ev.event_id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + i * 0.06 }}
                        onClick={() => navigate('/events')}
                        className="flex-shrink-0 w-56 sm:w-64 snap-start cursor-pointer group"
                      >
                        <div className="rounded-2xl border border-border bg-card overflow-hidden transition-all duration-300 group-hover:shadow-md group-hover:border-primary/20">
                          {ev.image_url ? (
                            <img src={ev.image_url} alt={ev.title} className="w-full h-32 object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-32 bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                              <Calendar className="w-8 h-8 text-muted-foreground/30" />
                            </div>
                          )}
                          <div className="p-3">
                            <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug mb-1">{ev.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {ev.venue_city && <span>{ev.venue_city}</span>}
                              {ev.start_time && (
                                <span className="ml-1">· {format(new Date(ev.start_time), 'MMM d')}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="absolute right-0 top-0 bottom-3 w-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />
                </div>
              ) : null}
            </motion.section>
          )}

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
                emptyText={detectingLocation ? "Detecting…" : "Location not available"}
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
              <div className="absolute right-0 top-0 bottom-3 w-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />
            </div>
            <p className="text-center text-sm text-muted-foreground/50 mt-3 italic">
              Save events you love and they'll appear here.
            </p>
          </motion.section>

          {/* ── Customize CTA ── */}
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
