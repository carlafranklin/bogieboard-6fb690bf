import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Sparkles, User } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { HomeHero } from '@/components/HomeHero';
import { AudienceTabs } from '@/components/AudienceTabs';
import { EventShelf } from '@/components/EventShelf';
import { ShelfEventCard } from '@/components/ShelfEventCard';
import { SavedEventsHistory } from '@/components/SavedEventsHistory';
import { EventDetailModal } from '@/components/EventDetailModal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useSavedEvents } from '@/hooks/useSavedEvents';
import { useDiscoverableMetros } from '@/hooks/useDiscoverableMetros';
import { useDefaultMetro } from '@/hooks/useDefaultMetro';
import { useHomeFeed } from '@/hooks/useHomeFeed';
import { syncProfileOnLogin } from '@/lib/profileSync';
import { AUDIENCE_TABS, HOME_SHELVES, type HomeEvent } from '@/data/homeShelves';

const Index = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<HomeEvent | null>(null);
  const [activeTabId, setActiveTabId] = useState<string>('all');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [metroOverride, setMetroOverride] = useState<string | null>(null);

  const { isSaved, toggleSave, loading: saveLoading } = useSavedEvents(userId);
  const { metros, loading: metrosLoading, error: metrosError } = useDiscoverableMetros();
  const defaultMetro = useDefaultMetro(userId);

  const metroSlug = metroOverride ?? defaultMetro.metroSlug;
  const metroName = metroOverride
    ? metros.find((m) => m.value === metroOverride)?.label ?? metroOverride
    : defaultMetro.metroName;

  // Shelves are always scoped to the metro only (never city-filtered) so the
  // city picker never narrows its own option list — see useDefaultMetro/EventShelf notes.
  const homeFeed = useHomeFeed(metroSlug, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
      setAuthChecked(true);
      if (session) syncProfileOnLogin(session.user.id, session.user.email);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id || null);
      setAuthChecked(true);
      if (session) syncProfileOnLogin(session.user.id, session.user.email);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setFirstName(null);
      setOnboardingCompleted(null);
      return;
    }
    supabase
      .from('profiles')
      .select('first_name, onboarding_completed')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setFirstName(data?.first_name ?? null);
        setOnboardingCompleted(data?.onboarding_completed ?? false);
      });
  }, [userId]);

  // Reset city selection whenever the metro actually changes (not on initial resolution).
  useEffect(() => {
    setSelectedCities([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metroSlug]);

  const availableCities = useMemo(() => {
    const set = new Set<string>();
    homeFeed.events.forEach((e) => { if (e.venue_city) set.add(e.venue_city); });
    return Array.from(set).sort();
  }, [homeFeed.events]);

  const isLoggedIn = authChecked && !!userId;
  const activeTab = AUDIENCE_TABS.find((t) => t.id === activeTabId) ?? AUDIENCE_TABS[0];
  const hasCustomFilters = activeTabId !== 'all' || selectedCities.length > 0 || (metroOverride !== null && metroOverride !== defaultMetro.metroSlug);

  const resetFilters = () => {
    setActiveTabId('all');
    setSelectedCities([]);
    setMetroOverride(null);
  };

  const now = new Date();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-16">
        <HomeHero
          metros={metros}
          metrosLoading={metrosLoading}
          metrosError={metrosError}
          metroSlug={metroSlug}
          onMetroChange={setMetroOverride}
          availableCities={availableCities}
          selectedCities={selectedCities}
          onCitiesChange={setSelectedCities}
        />

        <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
          <div className="flex items-center justify-between gap-3 mb-5">
            <AudienceTabs activeTabId={activeTabId} onChange={setActiveTabId} />
          </div>

          {hasCustomFilters && (
            <div className="mb-5">
              <button
                onClick={resetFilters}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Reset filters
              </button>
            </div>
          )}

          {homeFeed.error ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-destructive/10 rounded-full mb-4">
                <AlertCircle className="w-7 h-7 text-destructive" />
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                Couldn't load events
              </h3>
              <p className="text-sm text-muted-foreground mb-5">
                Something went wrong fetching events for this area.
              </p>
              <Button onClick={homeFeed.retry} variant="outline">Try Again</Button>
            </div>
          ) : activeTabId === 'all' ? (
            <>
              {HOME_SHELVES.filter((shelf) => !shelf.isEligible || shelf.isEligible(now)).map((shelf) => {
                const title = shelf.title.replace('{metro}', metroName ?? 'Your Area');
                const shelfEvents = homeFeed.loading
                  ? []
                  : [...homeFeed.events].filter((e) => shelf.filter(e, now)).sort(shelf.sort).slice(0, 12);
                return (
                  <EventShelf
                    key={shelf.id}
                    title={title}
                    events={shelfEvents}
                    loading={homeFeed.loading}
                    emptyMessage={shelf.emptyMessage}
                    isSaved={isSaved}
                    isLoggedIn={isLoggedIn}
                    saveLoading={saveLoading}
                    onToggleSave={(id) => toggleSave(id, 'canonical')}
                    onSelectEvent={setSelectedEvent}
                    onViewAll={() => navigate(`/events${metroSlug ? `?location=${metroSlug}` : ''}`)}
                  />
                );
              })}
            </>
          ) : (
            <TabResultsGrid
              tabLabel={activeTab.label}
              tabDescription={activeTab.description}
              events={homeFeed.events.filter(activeTab.filter)}
              loading={homeFeed.loading}
              isSaved={isSaved}
              isLoggedIn={isLoggedIn}
              saveLoading={saveLoading}
              onToggleSave={(id) => toggleSave(id, 'canonical')}
              onSelectEvent={setSelectedEvent}
              onResetFilters={resetFilters}
            />
          )}
        </div>

        {isLoggedIn ? (
          <div className="container mx-auto max-w-6xl px-4">
            {onboardingCompleted === false && (
              <div className="mb-8 rounded-2xl border border-primary/20 bg-primary/5 p-5 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Complete your profile to improve suggestions</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Add your hometown and favorite cities.</p>
                  </div>
                </div>
                <Link to="/profile">
                  <Button size="sm" variant="outline">Complete Profile</Button>
                </Link>
              </div>
            )}
            <SavedEventsHistory userId={userId!} />
          </div>
        ) : (
          <div className="container mx-auto max-w-6xl px-4 pb-4">
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Save events and get a personalized feed</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Create a free account to save events and pick up where you left off.</p>
                </div>
              </div>
              <Link to="/auth">
                <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">Sign up / in</Button>
              </Link>
            </div>
          </div>
        )}
      </main>

      <Footer isLoggedIn={isLoggedIn} />

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        userId={userId}
        isSaved={selectedEvent ? isSaved(selectedEvent.event_id) : false}
        onToggleSave={selectedEvent ? () => toggleSave(selectedEvent.event_id) : undefined}
        saveLoading={saveLoading}
      />
    </div>
  );
};

interface TabResultsGridProps {
  tabLabel: string;
  tabDescription: string;
  events: HomeEvent[];
  loading: boolean;
  isSaved: (id: string) => boolean;
  isLoggedIn: boolean;
  saveLoading: boolean;
  onToggleSave: (id: string) => void;
  onSelectEvent: (event: HomeEvent) => void;
  onResetFilters: () => void;
}

function TabResultsGrid({
  tabLabel,
  tabDescription,
  events,
  loading,
  isSaved,
  isLoggedIn,
  saveLoading,
  onToggleSave,
  onSelectEvent,
  onResetFilters,
}: TabResultsGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-16">
        <h3 className="font-display text-lg font-semibold text-foreground mb-2">
          No {tabDescription} found
        </h3>
        <p className="text-sm text-muted-foreground mb-5">
          Try a different metro, or check back soon as more events come in.
        </p>
        <Button onClick={onResetFilters} variant="outline">Reset Filters</Button>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm font-medium text-foreground mb-4">
        <span className="font-bold">{events.length}</span> {tabLabel.toLowerCase()} found
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {events.map((event) => (
          <ShelfEventCard
            key={event.event_id}
            event={event}
            isSaved={isSaved(event.event_id)}
            isLoggedIn={isLoggedIn}
            saveLoading={saveLoading}
            onToggleSave={() => onToggleSave(event.event_id)}
            onSelect={() => onSelectEvent(event)}
          />
        ))}
      </div>
    </>
  );
}

export default Index;
