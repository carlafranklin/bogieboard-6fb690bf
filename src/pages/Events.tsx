import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, SearchX } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SearchModule, SearchParams } from '@/components/SearchModule';
import { SearchFilters, FilterState } from '@/components/SearchFilters';
import { EventCard } from '@/components/EventCard';
import { EventDetailModal } from '@/components/EventDetailModal';
import { mockEvents, Event } from '@/data/mockEvents';
import { Button } from '@/components/ui/button';

const defaultFilters: FilterState = {
  priceRange: 'all',
  distance: 25,
  categories: [],
};

export default function EventsPage() {
  const [searchParams] = useSearchParams();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [searchQuery, setSearchQuery] = useState({
    location: searchParams.get('location') || '',
    category: searchParams.get('category') || 'all',
  });

  const handleSearch = (params: SearchParams) => {
    setSearchQuery({
      location: params.location,
      category: params.category,
    });
  };

  const filteredEvents = useMemo(() => {
    return mockEvents.filter((event) => {
      // Category filter from search
      if (searchQuery.category !== 'all' && event.category !== searchQuery.category) {
        return false;
      }

      // Category filter from sidebar
      if (filters.categories.length > 0 && !filters.categories.includes(event.category)) {
        return false;
      }

      // Price filter
      if (filters.priceRange === 'free' && !event.isFree) return false;
      if (filters.priceRange === 'paid' && event.isFree) return false;

      return true;
    });
  }, [searchQuery, filters]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-6xl">
          {/* Back Link */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>

          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-2">
              Discover Events
            </h1>
            <p className="text-muted-foreground">
              {searchQuery.location
                ? `Showing events near ${searchQuery.location}`
                : 'Find events happening near you'}
            </p>
          </motion.div>

          {/* Compact Search */}
          <div className="mb-6">
            <SearchModule onSearch={handleSearch} compact />
          </div>

          {/* Filters */}
          <div className="mb-8">
            <SearchFilters
              filters={filters}
              onFiltersChange={setFilters}
              onClearFilters={() => setFilters(defaultFilters)}
            />
          </div>

          {/* Results */}
          {filteredEvents.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Showing {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEvents.map((event, index) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    index={index}
                    onViewDetails={setSelectedEvent}
                  />
                ))}
              </div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-full mb-4">
                <SearchX className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                No events found
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                We couldn't find any events matching your criteria. Try adjusting your filters or search location.
              </p>
              <Button
                onClick={() => {
                  setFilters(defaultFilters);
                  setSearchQuery({ location: '', category: 'all' });
                }}
                variant="outline"
              >
                Clear all filters
              </Button>
            </motion.div>
          )}
        </div>
      </main>

      <Footer />

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
