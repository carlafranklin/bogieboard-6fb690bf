import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { HeroSection } from '@/components/HeroSection';
import { EventShowcase } from '@/components/EventShowcase';
import { HowItWorks } from '@/components/HowItWorks';
import { FeaturedEvents } from '@/components/FeaturedEvents';
import { PersonalizedEvents } from '@/components/PersonalizedEvents';
import { Footer } from '@/components/Footer';
import { EventDetailModal } from '@/components/EventDetailModal';
import { SearchParams } from '@/components/SearchModule';
import { Event } from '@/data/mockEvents';
import { supabase } from '@/integrations/supabase/client';

const Index = () => {
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

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

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-16">
        <HeroSection onSearch={handleSearch} />
        
        <EventShowcase />

        {authChecked && userId ? (
          <PersonalizedEvents userId={userId} />
        ) : (
          <>
            <div id="how-it-works">
              <HowItWorks />
            </div>
            <FeaturedEvents onViewDetails={setSelectedEvent} />
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
