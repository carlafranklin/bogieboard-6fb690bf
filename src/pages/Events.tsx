import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, SearchX, Calendar, MapPin, Clock, DollarSign } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SearchModule, SearchParams } from '@/components/SearchModule';
import { SearchFilters, FilterState } from '@/components/SearchFilters';
import { EventDetailModal } from '@/components/EventDetailModal';
import { metroAreas } from '@/data/metroAreas';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';

interface CanonicalEvent {
  event_id: string;
  title: string;
  description_short: string | null;
  start_time: string;
  end_time: string | null;
  all_day: boolean;
  is_free: boolean;
  price_min: number | null;
  price_max: number | null;
  ticket_url: string | null;
  image_url: string | null;
  age_restriction: number | null;
  status: string;
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_zip: string | null;
  metro_name: string | null;
  category_names: string[] | null;
}

const defaultFilters: FilterState = {
  priceRange: 'all',
  distance: 25,
  categories: [],
};

export default function EventsPage() {
  const [searchParams] = useSearchParams();
  const [selectedEvent, setSelectedEvent] = useState<CanonicalEvent | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [events, setEvents] = useState<CanonicalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState({
    location: searchParams.get('location') || '',
    category: searchParams.get('category') || 'all',
    date: undefined as Date | undefined,
    dateRange: undefined as import('react-day-picker').DateRange | undefined,
    dateMode: 'single' as 'single' | 'range',
  });

  const fetchEvents = async () => {
    setLoading(true);

    const metroSlug = searchQuery.location && searchQuery.location !== 'all'
      ? searchQuery.location
      : undefined;

    const categorySlug = searchQuery.category !== 'all'
      ? searchQuery.category
      : undefined;

    let dateFrom = new Date().toISOString();
    let dateTo: string | undefined;

    if (searchQuery.dateMode === 'single' && searchQuery.date) {
      dateFrom = searchQuery.date.toISOString();
      const endOfDay = new Date(searchQuery.date);
      endOfDay.setHours(23, 59, 59, 999);
      dateTo = endOfDay.toISOString();
    } else if (searchQuery.dateMode === 'range' && searchQuery.dateRange?.from) {
      dateFrom = searchQuery.dateRange.from.toISOString();
      if (searchQuery.dateRange.to) {
        const endOfDay = new Date(searchQuery.dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        dateTo = endOfDay.toISOString();
      }
    }

    const { data } = await supabase.rpc('search_events', {
      p_metro_slug: metroSlug,
      p_category_slug: categorySlug,
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_limit: 100,
    });

    if (data) {
      setEvents(data as CanonicalEvent[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleSearch = (params: SearchParams) => {
    setSearchQuery({
      location: params.location,
      category: params.category,
      date: params.date,
      dateRange: params.dateRange,
      dateMode: params.dateMode,
    });
  };

  // Trigger fetch when search changes
  useEffect(() => {
    fetchEvents();
  }, [searchQuery]);

  // Client-side price filter
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filters.priceRange === 'free' && !event.is_free) return false;
      if (filters.priceRange === 'paid' && event.is_free) return false;
      if (filters.categories.length > 0) {
        const eventCats = (event.category_names ?? []).map(c => c.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
        if (!filters.categories.some(fc => eventCats.includes(fc))) return false;
      }
      return true;
    });
  }, [events, filters]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    const sorted = [...filteredEvents].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    const groups: Record<string, CanonicalEvent[]> = {};
    sorted.forEach((event) => {
      const dateKey = format(parseISO(event.start_time), 'yyyy-MM-dd');
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(event);
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
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>

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

          <div className="mb-6">
            <SearchModule onSearch={handleSearch} compact />
          </div>

          <div className="mb-8">
            <SearchFilters
              filters={filters}
              onFiltersChange={setFilters}
              onClearFilters={() => setFilters(defaultFilters)}
            />
          </div>

          {loading ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Loading events...</p>
            </div>
          ) : filteredEvents.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-6">
                Showing {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
                {locationLabel ? ` in ${locationLabel}` : ''}
              </p>

              <div className="space-y-8">
                {Object.entries(groupedEvents).map(([dateStr, dayEvents]) => (
                  <div key={dateStr}>
                    <h2 className="font-display text-lg font-semibold text-foreground mb-4 border-b border-border pb-2">
                      {format(parseISO(dateStr), 'EEEE, MMMM d, yyyy')}
                    </h2>
                    <div className="space-y-3">
                      {dayEvents.map((event, index) => (
                        <motion.div
                          key={event.event_id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          className="group bg-card rounded-xl overflow-hidden card-hover cursor-pointer border border-border"
                          onClick={() => setSelectedEvent(event)}
                        >
                          <div className="flex flex-col sm:flex-row">
                            {/* Image */}
                            <div className="sm:w-48 sm:min-h-[140px] relative overflow-hidden bg-muted shrink-0">
                              {event.category_names?.[0] && (
                                <div className="absolute top-2 left-2 z-10">
                                  <span className="bg-accent text-accent-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                                    {event.category_names[0]}
                                  </span>
                                </div>
                              )}
                              {event.is_free && (
                                <div className="absolute top-2 right-2 z-10 bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-xs font-semibold">
                                  FREE
                                </div>
                              )}
                              {event.image_url ? (
                                <img
                                  src={event.image_url}
                                  alt={event.title}
                                  className="w-full h-full min-h-[120px] object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full min-h-[120px] bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                                  <span className="text-3xl opacity-40">🎉</span>
                                </div>
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between">
                              <div>
                                <h3 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-1.5">
                                  {event.title}
                                </h3>
                                {event.description_short && (
                                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                    {event.description_short}
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-primary" />
                                  {event.all_day
                                    ? 'All Day'
                                    : format(parseISO(event.start_time), 'h:mm a')}
                                </span>
                                {event.venue_name && (
                                  <span className="inline-flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-primary" />
                                    {event.venue_name}{event.venue_city ? `, ${event.venue_city}` : ''}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1.5">
                                  <DollarSign className="w-3.5 h-3.5 text-primary" />
                                  {event.is_free ? (
                                    <span className="text-primary font-medium">Free</span>
                                  ) : event.price_min ? (
                                    <span className="font-medium text-foreground">
                                      ${Number(event.price_min)}
                                      {event.price_max && event.price_max !== event.price_min
                                        ? ` – $${Number(event.price_max)}`
                                        : ''}
                                    </span>
                                  ) : (
                                    <span className="font-medium text-foreground">See details</span>
                                  )}
                                </span>
                                {event.age_restriction && (
                                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                                    {event.age_restriction}+
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

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
