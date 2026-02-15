import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { HeroSection } from '@/components/HeroSection';
import { EventShowcase } from '@/components/EventShowcase';
import { BrowseEvents } from '@/components/BrowseEvents';
import { NearbyEvents } from '@/components/NearbyEvents';
import { SavedEventsHistory } from '@/components/SavedEventsHistory';
import { Footer } from '@/components/Footer';
import { EventDetailModal } from '@/components/EventDetailModal';
import { SearchParams } from '@/components/SearchModule';
import { Event } from '@/data/mockEvents';
import { supabase } from '@/integrations/supabase/client';
import { useSavedEvents } from '@/hooks/useSavedEvents';

const Index = () => {
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const { isSaved, toggleSave, loading: savingLoading } = useSavedEvents(userId);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id || null);
      setAuthChecked(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSearch = (params: SearchParams) => {
    const searchParams = new URLSearchParams();
    if (params.location) searchParams.set('location', params.location);
    if (params.category) searchParams.set('category', params.category);
    navigate(`/events?${searchParams.toString()}`);
  };

  const isLoggedIn = authChecked && !!userId;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-16">
        {isLoggedIn ? (
          <>
            {/* Signed-in: app-style dashboard — no hero, no marketing */}
            <NearbyEvents
              userId={userId!}
              isSaved={isSaved}
              onToggleSave={(id) => toggleSave(id, 'canonical')}
              savingLoading={savingLoading}
            />
            <SavedEventsHistory userId={userId!} />
          </>
        ) : (
          <>
            {/* Logged-out: content-first browsing experience */}
            <HeroSection onSearch={handleSearch} />
            <EventShowcase />
            <BrowseEvents />
          </>
        )}
      </main>

      <Footer />

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
};

export default Index;
