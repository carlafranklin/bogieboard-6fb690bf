import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { HeroSection } from '@/components/HeroSection';
import { EventShowcase } from '@/components/EventShowcase';
import { HowItWorks } from '@/components/HowItWorks';
import { FeaturedEvents } from '@/components/FeaturedEvents';
import { Footer } from '@/components/Footer';
import { EventDetailModal } from '@/components/EventDetailModal';
import { SearchParams } from '@/components/SearchModule';
import { Event } from '@/data/mockEvents';

const Index = () => {
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

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
        
        <div id="how-it-works">
          <HowItWorks />
        </div>

        <FeaturedEvents onViewDetails={setSelectedEvent} />
      </main>

      <Footer />

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
};

export default Index;
