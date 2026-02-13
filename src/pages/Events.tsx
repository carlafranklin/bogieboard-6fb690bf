import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, SearchX, Calendar, MapPin, Clock, DollarSign } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SearchModule, SearchParams } from '@/components/SearchModule';
import { SearchFilters, FilterState } from '@/components/SearchFilters';
import { EventDetailModal } from '@/components/EventDetailModal';
import { mockEvents, Event, categoryLabels } from '@/data/mockEvents';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { metroAreas, getCitiesForMetro } from '@/data/metroAreas';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';

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
    date: undefined as Date | undefined,
    dateRange: undefined as import('react-day-picker').DateRange | undefined,
    dateMode: 'single' as 'single' | 'range',
  });

  const handleSearch = (params: SearchParams) => {
    setSearchQuery({
      location: params.location,
      category: params.category,
      date: params.date,
      dateRange: params.dateRange,
      dateMode: params.dateMode,
    });
  };

  const filteredEvents = useMemo(() => {
    return mockEvents.filter((event) => {
      // Metro area location filter
      if (searchQuery.location && searchQuery.location !== 'all') {
        const metroCities = getCitiesForMetro(searchQuery.location);
        if (metroCities.length > 0) {
          const eventCityLower = event.city.toLowerCase();
          if (!metroCities.some((c) => c.toLowerCase() === eventCityLower)) {
            return false;
          }
        }
      }

      // Category filter from search
      if (searchQuery.category !== 'all' && event.category !== searchQuery.category) {
        return false;
      }

      // Category filter from sidebar
      if (filters.categories.length > 0 && !filters.categories.includes(event.category)) {
        return false;
      }

      // Date filter
      if (searchQuery.dateMode === 'range' && searchQuery.dateRange?.from) {
        const eventDate = parseISO(event.date);
        const from = searchQuery.dateRange.from;
        const to = searchQuery.dateRange.to || from;
        if (eventDate < new Date(from.getFullYear(), from.getMonth(), from.getDate()) ||
            eventDate > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59)) {
          return false;
        }
      } else if (searchQuery.dateMode === 'single' && searchQuery.date) {
        const eventDate = parseISO(event.date);
        const searchDate = searchQuery.date;
        if (
          eventDate.getFullYear() !== searchDate.getFullYear() ||
          eventDate.getMonth() !== searchDate.getMonth() ||
          eventDate.getDate() !== searchDate.getDate()
        ) {
          return false;
        }
      }

      // Price filter
      if (filters.priceRange === 'free' && !event.isFree) return false;
      if (filters.priceRange === 'paid' && event.isFree) return false;

      return true;
    });
  }, [searchQuery, filters]);

  // Group events by date for a structured display
  const groupedEvents = useMemo(() => {
    const sorted = [...filteredEvents].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const groups: Record<string, Event[]> = {};
    sorted.forEach((event) => {
      if (!groups[event.date]) groups[event.date] = [];
      groups[event.date].push(event);
    });
    return groups;
  }, [filteredEvents]);

  const locationLabel = searchQuery.location && searchQuery.location !== 'all'
    ? metroAreas.find((m) => m.value === searchQuery.location)?.label
    : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-5xl">
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
              {locationLabel
                ? `Showing events in the ${locationLabel}`
                : 'Find events happening in your area'}
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
              <p className="text-sm text-muted-foreground mb-6">
                Showing {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
                {locationLabel ? ` in ${locationLabel}` : ''}
              </p>

              <div className="space-y-8">
                {Object.entries(groupedEvents).map(([dateStr, events]) => (
                  <div key={dateStr}>
                    <h2 className="font-display text-lg font-semibold text-foreground mb-4 border-b border-border pb-2">
                      {format(parseISO(dateStr), 'EEEE, MMMM d, yyyy')}
                    </h2>
                    <div className="space-y-3">
                      {events.map((event, index) => (
                        <motion.div
                          key={event.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          className="group bg-card rounded-xl overflow-hidden card-hover cursor-pointer border border-border"
                          onClick={() => setSelectedEvent(event)}
                        >
                          <div className="flex flex-col sm:flex-row">
                            {/* Image */}
                            <div className="sm:w-48 sm:min-h-[140px] relative overflow-hidden bg-muted shrink-0">
                              <div className="absolute top-2 left-2 z-10">
                                <CategoryBadge category={event.category} />
                              </div>
                              {event.isFree && (
                                <div className="absolute top-2 right-2 z-10 bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-xs font-semibold">
                                  FREE
                                </div>
                              )}
                              <div className="w-full h-full min-h-[120px] bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                                <span className="text-3xl opacity-40">🎉</span>
                              </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between">
                              <div>
                                <h3 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-1.5">
                                  {event.title}
                                </h3>
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                  {event.description}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-primary" />
                                  {event.time}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-primary" />
                                  {event.venue}, {event.city}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <DollarSign className="w-3.5 h-3.5 text-primary" />
                                  {event.isFree ? (
                                    <span className="text-primary font-medium">Free</span>
                                  ) : (
                                    <span className="font-medium text-foreground">${event.price}</span>
                                  )}
                                </span>
                                {event.ageRestriction && (
                                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                                    {event.ageRestriction}+
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
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
                  setSearchQuery({ location: '', category: 'all', date: undefined, dateRange: undefined, dateMode: 'single' });
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
