import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, SearchX, Calendar, MapPin, Clock, DollarSign, ExternalLink, Tag, ChevronRight } from 'lucide-react';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SearchModule, SearchParams } from '@/components/SearchModule';
import { SearchFilters, FilterState } from '@/components/SearchFilters';
import { SearchContextBar } from '@/components/SearchContextBar';
import { EventDetailModal } from '@/components/EventDetailModal';
import { SaveEventButton } from '@/components/SaveEventButton';
import { useSavedEvents } from '@/hooks/useSavedEvents';
import { metroAreas } from '@/data/metroAreas';
import { categoryLabels, categoryIcons, categoryColors } from '@/data/mockEvents';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { icons } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  venue_address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_zip: string | null;
  metro_name: string | null;
  category_names: string[] | null;
  source_url: string | null;
  discount_info: string | null;
}

const defaultFilters: FilterState = {
  priceRange: 'all',
  distance: 25,
  categories: [],
};

// Category fallback images for events without photos
const categoryFallbackImages: Record<string, string> = {
  'live-music': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=300&fit=crop',
  'festivals': 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&h=300&fit=crop',
  'business': 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=300&fit=crop',
  'bar-fun': 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=400&h=300&fit=crop',
  'shopping': 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=400&h=300&fit=crop',
  'family-kids': 'https://images.unsplash.com/photo-1484820540004-14229fe36ca4?w=400&h=300&fit=crop',
  'movies': 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=300&fit=crop',
  'religious-spiritual': 'https://images.unsplash.com/photo-1507692049790-de58290a4334?w=400&h=300&fit=crop',
  'sports-games': 'https://images.unsplash.com/photo-1461896836934-ber91080e9f?w=400&h=300&fit=crop',
  'lecture-series': 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=400&h=300&fit=crop',
  'political-events': 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=400&h=300&fit=crop',
  'arts-theater': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop',
};

const defaultFallbackImage = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400&h=300&fit=crop';

// Category display order (popularity-based)
const categoryDisplayOrder = [
  'family-kids',
  'live-music',
  'festivals',
  'arts-theater',
  'sports-games',
  'bar-fun',
  'shopping',
  'business',
  'movies',
  'lecture-series',
  'religious-spiritual',
  'political-events',
];

const INITIAL_VISIBLE_COUNT = 4;

function getEventImage(event: CanonicalEvent): string {
  if (event.image_url) return event.image_url;
  const cats = event.category_names ?? [];
  for (const cat of cats) {
    const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (categoryFallbackImages[slug]) return categoryFallbackImages[slug];
  }
  return defaultFallbackImage;
}

function CategoryIcon({ slug }: { slug: string }) {
  const iconName = categoryIcons[slug];
  const LucideIcon = iconName ? (icons as Record<string, any>)[iconName] : null;
  if (!LucideIcon) return null;
  return <LucideIcon className="w-5 h-5" />;
}

export default function EventsPage() {
  const [searchParams] = useSearchParams();
  const [selectedEvent, setSelectedEvent] = useState<CanonicalEvent | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [events, setEvents] = useState<CanonicalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const { isSaved, toggleSave, loading: saveLoading } = useSavedEvents(userId);
  const [showSearch, setShowSearch] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState({
    location: searchParams.get('location') || '',
    category: searchParams.get('category') || 'all',
    date: undefined as Date | undefined,
    dateRange: undefined as import('react-day-picker').DateRange | undefined,
    dateMode: 'single' as 'single' | 'range',
  });

  // Get auth state
  useEffect(() => {
    supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
  }, []);

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
      p_limit: 200,
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
    setShowSearch(false);
  };

  useEffect(() => {
    fetchEvents();
  }, [searchQuery]);

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

  // Group events by category
  const categoryGroupedEvents = useMemo(() => {
    const groups: Record<string, CanonicalEvent[]> = {};

    filteredEvents.forEach((event) => {
      const cats = event.category_names ?? ['Uncategorized'];
      // Place event in its first/primary category
      const primaryCat = cats[0] || 'Uncategorized';
      const slug = primaryCat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (!groups[slug]) groups[slug] = [];
      groups[slug].push(event);
    });

    // Sort events within each category by date
    Object.values(groups).forEach((arr) => {
      arr.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    });

    // Sort categories by display order
    const sortedEntries = Object.entries(groups).sort(([a], [b]) => {
      const aIdx = categoryDisplayOrder.indexOf(a);
      const bIdx = categoryDisplayOrder.indexOf(b);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

    return sortedEntries;
  }, [filteredEvents]);

  const toggleCategoryExpand = (slug: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const handleEditSearch = () => {
    setShowSearch(true);
    setTimeout(() => {
      searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleNewSearch = () => {
    setSearchQuery({ location: '', category: 'all', date: undefined, dateRange: undefined, dateMode: 'single' });
    setFilters(defaultFilters);
    setShowSearch(true);
  };

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
            className="mb-6"
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

          {/* Search Module - Collapsible */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                ref={searchRef}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 overflow-hidden"
              >
                <SearchModule onSearch={handleSearch} compact />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search Context Bar - visible when results are showing */}
          {!loading && filteredEvents.length > 0 && (
            <div className="mb-4">
              <SearchContextBar
                location={searchQuery.location}
                category={searchQuery.category}
                date={searchQuery.date}
                dateRange={searchQuery.dateRange}
                dateMode={searchQuery.dateMode}
                priceFilter={filters.priceRange}
                activeCategories={filters.categories}
                resultCount={filteredEvents.length}
                onEditSearch={handleEditSearch}
                onNewSearch={handleNewSearch}
                onRemoveLocation={() => setSearchQuery((q) => ({ ...q, location: '' }))}
                onRemoveCategory={() => setSearchQuery((q) => ({ ...q, category: 'all' }))}
                onRemoveDate={() => setSearchQuery((q) => ({ ...q, date: undefined, dateRange: undefined }))}
                onRemovePrice={() => setFilters((f) => ({ ...f, priceRange: 'all' }))}
                onRemoveActiveCategory={(cat) =>
                  setFilters((f) => ({ ...f, categories: f.categories.filter((c) => c !== cat) }))
                }
              />
            </div>
          )}

          {/* Filters */}
          <div className="mb-8">
            <SearchFilters
              filters={filters}
              onFiltersChange={setFilters}
              onClearFilters={() => setFilters(defaultFilters)}
            />
          </div>

          {/* Results */}
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-muted rounded-full mb-4 animate-pulse">
                <Calendar className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Loading events...</p>
            </div>
          ) : categoryGroupedEvents.length > 0 ? (
            <div className="space-y-10">
              {categoryGroupedEvents.map(([catSlug, catEvents]) => {
                const isExpanded = expandedCategories.has(catSlug);
                const visibleEvents = isExpanded ? catEvents : catEvents.slice(0, INITIAL_VISIBLE_COUNT);
                const hasMore = catEvents.length > INITIAL_VISIBLE_COUNT;
                const catLabel = categoryLabels[catSlug] || catSlug;
                const colorClass = categoryColors[catSlug] || 'bg-muted text-muted-foreground';

                return (
                  <motion.section
                    key={catSlug}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {/* Category Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn('inline-flex items-center justify-center w-9 h-9 rounded-lg', colorClass)}>
                          <CategoryIcon slug={catSlug} />
                        </div>
                        <div>
                          <h2 className="font-display text-xl font-bold text-foreground">
                            {catLabel}
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            {catEvents.length} event{catEvents.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      {hasMore && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCategoryExpand(catSlug)}
                          className="text-primary hover:text-primary gap-1"
                        >
                          {isExpanded ? 'Show less' : `See all ${catEvents.length}`}
                          <ChevronRight className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-90')} />
                        </Button>
                      )}
                    </div>

                    {/* Event Cards */}
                    <div className="space-y-3">
                      {visibleEvents.map((event, index) => {
                        const eventImage = getEventImage(event);
                        return (
                          <motion.div
                            key={event.event_id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.04 }}
                            className="group bg-card rounded-xl overflow-hidden card-hover cursor-pointer border border-border"
                            onClick={() => setSelectedEvent(event)}
                          >
                            <div className="flex flex-col sm:flex-row">
                              {/* Image */}
                              <div className="sm:w-48 sm:min-h-[140px] relative overflow-hidden bg-muted shrink-0">
                                {event.category_names && event.category_names.length > 0 && (
                                  <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-1">
                                    {event.category_names.map((cat) => (
                                      <CategoryBadge key={cat} category={cat} className="text-[10px] px-1.5 py-0.5" />
                                    ))}
                                  </div>
                                )}
                                {event.is_free && (
                                  <div className="absolute top-2 right-2 z-10 bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-xs font-semibold">
                                    FREE
                                  </div>
                                )}
                                <img
                                  src={eventImage}
                                  alt={event.title}
                                  className="w-full h-full min-h-[120px] object-cover"
                                  loading="lazy"
                                />
                              </div>

                              {/* Content */}
                              <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between">
                                <div>
                                  <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors mb-1.5">
                                      {event.title}
                                    </h3>
                                    <SaveEventButton
                                      eventId={event.event_id}
                                      isSaved={isSaved(event.event_id)}
                                      isLoggedIn={!!userId}
                                      onToggle={() => toggleSave(event.event_id)}
                                      loading={saveLoading}
                                      size="icon"
                                      className="shrink-0"
                                    />
                                  </div>
                                  {event.description_short && (
                                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                      {event.description_short}
                                    </p>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                                  <span className="inline-flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-primary" />
                                    {format(parseISO(event.start_time), 'EEE, MMM d')}
                                  </span>
                                  <span className="inline-flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-primary" />
                                    {event.all_day
                                      ? 'All Day'
                                      : format(parseISO(event.start_time), 'h:mm a')}
                                  </span>
                                  {event.venue_name && (
                                    <span className="inline-flex items-center gap-1.5">
                                      <MapPin className="w-3.5 h-3.5 text-primary" />
                                      {event.venue_name}
                                      {event.venue_city ? `, ${event.venue_city}` : ''}
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
                                  {event.discount_info && (
                                    <span className="inline-flex items-center gap-1.5 text-primary font-medium">
                                      <Tag className="w-3.5 h-3.5" />
                                      {event.discount_info}
                                    </span>
                                  )}
                                  {event.age_restriction && (
                                    <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                                      {event.age_restriction}+
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* See All link at bottom */}
                    {hasMore && !isExpanded && (
                      <div className="mt-3 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleCategoryExpand(catSlug)}
                          className="text-primary border-primary/30 hover:bg-primary/5"
                        >
                          View all {catEvents.length} {catLabel} events
                        </Button>
                      </div>
                    )}
                  </motion.section>
                );
              })}
            </div>
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
                We couldn't find any events matching your search. Try broadening your filters or searching a different area.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={handleEditSearch} variant="outline" className="gap-2">
                  Edit Search
                </Button>
                <Button onClick={handleNewSearch} className="gap-2">
                  Start New Search
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      <Footer />

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        userId={userId}
        isSaved={selectedEvent ? isSaved(selectedEvent.event_id) : false}
        onToggleSave={selectedEvent ? () => toggleSave(selectedEvent.event_id) : () => {}}
        saveLoading={saveLoading}
      />
    </div>
  );
}