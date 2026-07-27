import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, SearchX, Calendar, MapPin, Clock, DollarSign, ExternalLink, Tag, Filter, ChevronDown, ChevronLeft, ChevronRight, X, Search, Building2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { EventDetailModal } from '@/components/EventDetailModal';
import { SaveEventButton } from '@/components/SaveEventButton';
import { useSavedEvents } from '@/hooks/useSavedEvents';
import { useDiscoverableMetros } from '@/hooks/useDiscoverableMetros';
import { categoryLabels } from '@/data/mockEvents';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { localStartOfDay, localEndOfDay, isSameLocalDay, parseDateParam } from '@/lib/dateRange';
import type { DateRange } from 'react-day-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getPriceDisplay } from '@/lib/priceDisplay';

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
  // Partner event fields
  posted_by?: string | null;
}

const categoryChips = [
  { value: 'all', label: 'All' },
  { value: 'live-music', label: 'Live Music' },
  { value: 'festivals', label: 'Festivals' },
  { value: 'family-kids', label: 'Family & Kids' },
  { value: 'arts-theater', label: 'Arts & Theater' },
  { value: 'sports-games', label: 'Sports & Games' },
  { value: 'bar-fun', label: 'Bar Fun' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'business', label: 'Business' },
  { value: 'movies', label: 'Movies' },
  { value: 'lecture-series', label: 'Lecture Series' },
  { value: 'religious-spiritual', label: 'Religious & Spiritual' },
  { value: 'political-events', label: 'Political Events' },
];

type SortOption = 'featured' | 'date-asc' | 'date-desc' | 'price-low' | 'price-high';

const sortLabels: Record<SortOption, string> = {
  'featured': 'Featured',
  'date-asc': 'Date (Soonest)',
  'date-desc': 'Date (Latest)',
  'price-low': 'Price (Low to High)',
  'price-high': 'Price (High to Low)',
};

type PriceFilter = 'all' | 'free' | 'paid';

// Load More page size for the canonical (Ticketmaster) side of results.
// partner_events is fetched in full and never paginated — its volume is
// small enough not to need it.
const EVENTS_PAGE_SIZE = 200;

interface EventSearchQuery {
  location: string;
  category: string;
  date: Date | undefined;
  dateRange: DateRange | undefined;
  dateMode: 'single' | 'range';
}

// Single source of truth for the URL <-> filter-state contract, shared by
// the initial useState hydration and the URL -> state sync effect so the
// two can never drift apart.
function parseFiltersFromParams(params: URLSearchParams): {
  searchQuery: EventSearchQuery;
  cities: string[];
  price: PriceFilter;
  sort: SortOption;
} {
  const urlDate = parseDateParam(params.get('date'));
  const urlDateTo = parseDateParam(params.get('dateTo'));
  const urlIsRange = !!(urlDate && urlDateTo && !isSameLocalDay(urlDate, urlDateTo));
  const priceRaw = params.get('price');
  const sortRaw = params.get('sort') as SortOption | null;

  return {
    searchQuery: {
      location: params.get('location') || '',
      category: params.get('category') || 'all',
      date: urlDate && !urlIsRange ? urlDate : undefined,
      dateRange: urlIsRange ? { from: urlDate, to: urlDateTo } as DateRange : undefined,
      dateMode: (urlIsRange ? 'range' : 'single') as 'single' | 'range',
    },
    cities: (params.get('cities') || '').split(',').filter(Boolean),
    price: priceRaw === 'free' || priceRaw === 'paid' ? priceRaw : 'all',
    sort: sortRaw && Object.prototype.hasOwnProperty.call(sortLabels, sortRaw) ? sortRaw : 'featured',
  };
}

function paramsFromFilters(
  searchQuery: EventSearchQuery,
  cities: string[],
  price: PriceFilter,
  sort: SortOption,
): URLSearchParams {
  const params = new URLSearchParams();
  if (searchQuery.location && searchQuery.location !== 'all') params.set('location', searchQuery.location);
  if (searchQuery.category && searchQuery.category !== 'all') params.set('category', searchQuery.category);
  if (cities.length > 0) params.set('cities', cities.join(','));
  if (searchQuery.dateMode === 'single' && searchQuery.date) {
    params.set('date', searchQuery.date.toISOString());
  } else if (searchQuery.dateMode === 'range' && searchQuery.dateRange?.from) {
    params.set('date', searchQuery.dateRange.from.toISOString());
    if (searchQuery.dateRange.to) params.set('dateTo', searchQuery.dateRange.to.toISOString());
  }
  if (price !== 'all') params.set('price', price);
  if (sort !== 'featured') params.set('sort', sort);
  return params;
}

const defaultFallbackImage = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400&h=300&fit=crop';

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

function getEventImage(event: CanonicalEvent): string {
  if (event.image_url) return event.image_url;
  const cats = event.category_names ?? [];
  for (const cat of cats) {
    const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (categoryFallbackImages[slug]) return categoryFallbackImages[slug];
  }
  return defaultFallbackImage;
}

export default function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { metros, loading: metrosLoading, error: metrosError } = useDiscoverableMetros();
  const [selectedEvent, setSelectedEvent] = useState<CanonicalEvent | null>(null);
  // Canonical (Ticketmaster) events accumulate across Load More pages; partner
  // events are always fetched in full and kept separate so appending a new
  // canonical page never re-duplicates them. displayEvents merges the two.
  const [canonicalEvents, setCanonicalEvents] = useState<CanonicalEvent[]>([]);
  const [partnerEventsList, setPartnerEventsList] = useState<CanonicalEvent[]>([]);
  const [canonicalOffset, setCanonicalOffset] = useState(0);
  const [hasMoreEvents, setHasMoreEvents] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // City options must stay stable regardless of the current city selection (option 7a), so
  // they're sourced from a separate, city-unfiltered fetch scoped only to metro/category/date.
  const [facetEvents, setFacetEvents] = useState<CanonicalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const { isSaved, toggleSave, loading: saveLoading } = useSavedEvents(userId);
  const [sortBy, setSortBy] = useState<SortOption>(() => parseFiltersFromParams(searchParams).sort);
  const [priceFilter, setPriceFilter] = useState<PriceFilter>(() => parseFiltersFromParams(searchParams).price);
  const chipsRef = useRef<HTMLDivElement>(null);

  // Monotonic request sequence guards. Two filter changes in quick succession
  // (e.g. an on-page category pick immediately followed by a Header-driven
  // same-route navigation) start two overlapping fetches; without this, an
  // older fetch resolving after a newer one silently overwrites correct
  // results with stale data even though the URL and filter UI have already
  // moved on. Each fetch only applies its response if it's still the latest
  // one requested.
  const eventsFetchSeqRef = useRef(0);
  const facetsFetchSeqRef = useRef(0);

  const [searchQuery, setSearchQuery] = useState<EventSearchQuery>(() => parseFiltersFromParams(searchParams).searchQuery);

  // Selected cities within the chosen metro (client-side drill-down; search_events RPC has no city param)
  const [selectedCities, setSelectedCities] = useState<string[]>(() => parseFiltersFromParams(searchParams).cities);

  // Tracks the URL string this component itself last wrote, so the two
  // effects below (state -> URL and URL -> state) never fight each other or
  // loop: each only acts when the URL and state have actually diverged.
  const lastSyncedParamsRef = useRef<string>(searchParams.toString());

  // Keep the URL in sync so location/category/city/date/price/sort filters
  // survive navigation and reloads.
  useEffect(() => {
    const next = paramsFromFilters(searchQuery, selectedCities, priceFilter, sortBy);
    const nextStr = next.toString();
    if (nextStr !== lastSyncedParamsRef.current) {
      lastSyncedParamsRef.current = nextStr;
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, selectedCities, priceFilter, sortBy]);

  // Re-hydrate filter state whenever the URL changes from outside this
  // component's own write above — same-route navigation (e.g. the logged-in
  // Header search while already on /events), browser back/forward, or a
  // manually edited/shared URL. Without this, those navigations updated the
  // address bar but left the filter state (and therefore the results) stale.
  useEffect(() => {
    const currentStr = searchParams.toString();
    if (currentStr === lastSyncedParamsRef.current) return;
    lastSyncedParamsRef.current = currentStr;
    const parsed = parseFiltersFromParams(searchParams);
    setSearchQuery(parsed.searchQuery);
    setSelectedCities(parsed.cities);
    setPriceFilter(parsed.price);
    setSortBy(parsed.sort);
  }, [searchParams]);

  // Get auth state
  useEffect(() => {
    supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
  }, []);

  // Helper to convert time strings like "7:00 PM" to "19:00:00"
  function convertTimeToISO(timeStr: string): string {
    try {
      const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
      if (!match) return '00:00:00';
      let hours = parseInt(match[1]);
      const minutes = match[2] ? parseInt(match[2]) : 0;
      const ampm = match[3]?.toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    } catch {
      return '00:00:00';
    }
  }

  // Map a partner_events row to the same shape as a canonical search_events row
  function mapPartnerEvent(pe: any): CanonicalEvent {
    return {
      event_id: pe.id,
      title: pe.title,
      description_short: pe.description,
      start_time: `${pe.event_date}T${pe.event_time ? convertTimeToISO(pe.event_time) : '00:00:00'}`,
      end_time: pe.end_date ? `${pe.end_date}T${pe.end_time ? convertTimeToISO(pe.end_time) : '23:59:59'}` : null,
      all_day: !pe.event_time,
      is_free: pe.is_free || false,
      price_min: pe.price,
      price_max: pe.price,
      ticket_url: pe.ticket_url,
      image_url: pe.image_url,
      age_restriction: pe.age_restriction,
      status: 'active',
      venue_name: pe.venue_name,
      venue_address: pe.venue_address,
      venue_city: pe.city,
      venue_state: pe.state,
      venue_zip: pe.zip_code,
      metro_name: null,
      category_names: pe.categories?.name ? [pe.categories.name] : [],
      source_url: null,
      discount_info: null,
      posted_by: pe.partner_profiles?.business_name || null,
    };
  }

  function getDateRange() {
    let dateFrom = new Date().toISOString();
    let dateTo: string | undefined;

    if (searchQuery.dateMode === 'single' && searchQuery.date) {
      dateFrom = localStartOfDay(searchQuery.date).toISOString();
      dateTo = localEndOfDay(searchQuery.date).toISOString();
    } else if (searchQuery.dateMode === 'range' && searchQuery.dateRange?.from) {
      dateFrom = localStartOfDay(searchQuery.dateRange.from).toISOString();
      if (searchQuery.dateRange.to) {
        dateTo = localEndOfDay(searchQuery.dateRange.to).toISOString();
      }
    }
    return { dateFrom, dateTo };
  }

  const metroSlug = searchQuery.location && searchQuery.location !== 'all' ? searchQuery.location : undefined;
  const categorySlug = searchQuery.category !== 'all' ? searchQuery.category : undefined;

  // Actual display results: filtered by metro/category/date and, now, by selected cities
  // at the database level (search_events p_cities / partner_events .in('city', ...)).
  // append=true fetches the next canonical page (Load More) and appends it;
  // otherwise this is a fresh filter-driven load that resets back to page 1.
  const fetchEvents = async (options: { append?: boolean } = {}) => {
    const { append = false } = options;
    const seq = ++eventsFetchSeqRef.current;
    const offset = append ? canonicalOffset : 0;
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      const { dateFrom, dateTo } = getDateRange();
      const cityFilter = selectedCities.length > 0 ? selectedCities : undefined;

      const canonicalPromise = supabase.rpc('search_events', {
        p_metro_slug: metroSlug,
        p_category_slug: categorySlug,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_limit: EVENTS_PAGE_SIZE,
        p_offset: offset,
        p_cities: cityFilter,
      });

      // partner_events is small enough to always fetch in full and is not
      // paginated — only re-fetch it on a fresh load, not on Load More, so
      // appending a canonical page never re-adds/duplicates partner rows.
      let partnerQuery = supabase
        .from('partner_events')
        .select('*, partner_profiles!inner(business_name), categories(name)')
        .eq('status', 'approved')
        .gte('event_date', dateFrom.split('T')[0]);
      if (cityFilter) {
        partnerQuery = partnerQuery.in('city', cityFilter);
      }
      partnerQuery = partnerQuery.order('event_date');

      const [canonicalRes, partnerRes] = await Promise.all([
        canonicalPromise,
        append ? Promise.resolve(null) : partnerQuery,
      ]);

      if (seq !== eventsFetchSeqRef.current) return; // superseded by a newer fetch

      if (canonicalRes.error) {
        console.error('Error fetching canonical events:', canonicalRes.error);
      }
      const newCanonical: CanonicalEvent[] = (canonicalRes.data as CanonicalEvent[]) || [];

      if (append) {
        setCanonicalEvents(prev => [...prev, ...newCanonical]);
      } else {
        setCanonicalEvents(newCanonical);
        if (partnerRes) {
          if (partnerRes.error) {
            console.error('Error fetching partner events:', partnerRes.error);
          }
          setPartnerEventsList((partnerRes.data || []).map(mapPartnerEvent));
        }
      }

      setCanonicalOffset(offset + newCanonical.length);
      setHasMoreEvents(newCanonical.length === EVENTS_PAGE_SIZE);
    } catch (err) {
      if (seq !== eventsFetchSeqRef.current) return;
      console.error('Failed to fetch events:', err);
    } finally {
      if (seq === eventsFetchSeqRef.current) {
        if (append) setLoadingMore(false); else setLoading(false);
      }
    }
  };

  // City-option facet: same metro/category/date scope, but never filtered by the current
  // city selection, so picking one city never removes other cities from the picker.
  const fetchCityFacets = async () => {
    const seq = ++facetsFetchSeqRef.current;
    try {
      const { dateFrom, dateTo } = getDateRange();

      const [canonicalRes, partnerRes] = await Promise.all([
        supabase.rpc('search_events', {
          p_metro_slug: metroSlug,
          p_category_slug: categorySlug,
          p_date_from: dateFrom,
          p_date_to: dateTo,
          p_limit: 200,
        }),
        supabase
          .from('partner_events')
          .select('*, partner_profiles!inner(business_name), categories(name)')
          .eq('status', 'approved')
          .gte('event_date', dateFrom.split('T')[0])
          .order('event_date'),
      ]);

      if (seq !== facetsFetchSeqRef.current) return; // superseded by a newer fetch

      if (canonicalRes.error) {
        console.error('Error fetching city facets:', canonicalRes.error);
      }

      const partnerEvents: CanonicalEvent[] = (partnerRes.data || []).map(mapPartnerEvent);
      setFacetEvents([...(canonicalRes.data as CanonicalEvent[] || []), ...partnerEvents]);
    } catch (err) {
      if (seq !== facetsFetchSeqRef.current) return;
      console.error('Failed to fetch city facets:', err);
    }
  };

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, selectedCities]);

  useEffect(() => {
    fetchCityFacets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Cities available to filter on, derived from the metro/category/date-scoped facet set
  // (independent of selectedCities, per option 7a)
  const availableCities = useMemo(() => {
    const set = new Set<string>();
    facetEvents.forEach((e) => { if (e.venue_city) set.add(e.venue_city); });
    return Array.from(set).sort();
  }, [facetEvents]);

  const toggleCity = (city: string) => {
    setSelectedCities((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]));
  };

  // Filter and sort (city filtering now happens in fetchEvents at the database level).
  // Merges all currently-loaded canonical pages with the (unpaginated) partner events;
  // price/sort here only ever operate over what's been loaded so far — see the
  // Load More button's note in the JSX below.
  const displayEvents = useMemo(() => {
    let filtered: CanonicalEvent[] = [...canonicalEvents, ...partnerEventsList];

    // Price filter
    if (priceFilter === 'free') filtered = filtered.filter(e => e.is_free);
    if (priceFilter === 'paid') filtered = filtered.filter(e => !e.is_free);

    // Sort
    const sorted = [...filtered];
    // Null price_min means "unknown," not "$0" — it must always sort last,
    // regardless of direction. A genuinely free event (is_free or a verified
    // $0 minimum) still sorts as $0.
    const effectivePrice = (e: CanonicalEvent): number | null =>
      e.is_free || e.price_min === 0 ? 0 : e.price_min;
    switch (sortBy) {
      case 'date-asc':
        sorted.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        break;
      case 'date-desc':
        sorted.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
        break;
      case 'price-low':
        sorted.sort((a, b) => {
          const ap = effectivePrice(a), bp = effectivePrice(b);
          if (ap === null && bp === null) return 0;
          if (ap === null) return 1;
          if (bp === null) return -1;
          return ap - bp;
        });
        break;
      case 'price-high':
        sorted.sort((a, b) => {
          const ap = effectivePrice(a), bp = effectivePrice(b);
          if (ap === null && bp === null) return 0;
          if (ap === null) return 1;
          if (bp === null) return -1;
          return bp - ap;
        });
        break;
      default:
        // featured: keep original order
        break;
    }

    return sorted;
  }, [canonicalEvents, partnerEventsList, priceFilter, sortBy]);

  const locationLabel = searchQuery.location && searchQuery.location !== 'all'
    ? metros.find((m) => m.value === searchQuery.location)?.label
    : null;

  const hasDate = searchQuery.dateMode === 'single' ? !!searchQuery.date : !!searchQuery.dateRange?.from;

  const dateLabel = (() => {
    if (searchQuery.dateMode === 'single' && searchQuery.date) return format(searchQuery.date, 'MMM d, yyyy');
    if (searchQuery.dateMode === 'range' && searchQuery.dateRange?.from) {
      if (searchQuery.dateRange.to) return `${format(searchQuery.dateRange.from, 'MMM d')} – ${format(searchQuery.dateRange.to, 'MMM d')}`;
      return `${format(searchQuery.dateRange.from, 'MMM d')} – ...`;
    }
    return 'Select Dates';
  })();

  const scrollChips = (dir: 'left' | 'right') => {
    if (chipsRef.current) {
      chipsRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-24 pb-16">
        <div className="container mx-auto max-w-7xl px-4">
          {/* Page Title */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5"
          >
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
              {locationLabel
                ? `All ${locationLabel} Events`
                : 'All Events & Experiences'}
            </h1>
          </motion.div>

          {/* Controls Row: Select Dates + Filters + Category Chips */}
          <div className="mb-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* Select Dates */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "gap-2 rounded-full text-sm h-9 px-4",
                      hasDate && "bg-primary/10 border-primary text-primary"
                    )}
                  >
                    <Calendar className="w-4 h-4" />
                    {dateLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-3 space-y-3">
                    <div className="flex gap-1 bg-muted rounded-lg p-1">
                      <button
                        onClick={() => setSearchQuery(q => ({ ...q, dateMode: 'single', dateRange: undefined }))}
                        className={cn(
                          'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                          searchQuery.dateMode === 'single' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Single Date
                      </button>
                      <button
                        onClick={() => setSearchQuery(q => ({ ...q, dateMode: 'range', date: undefined }))}
                        className={cn(
                          'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                          searchQuery.dateMode === 'range' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Date Range
                      </button>
                    </div>
                    {searchQuery.dateMode === 'single' ? (
                      <CalendarComponent
                        mode="single"
                        selected={searchQuery.date}
                        onSelect={(d) => setSearchQuery(q => ({ ...q, date: d }))}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    ) : (
                      <CalendarComponent
                        mode="range"
                        selected={searchQuery.dateRange}
                        onSelect={(r) => setSearchQuery(q => ({ ...q, dateRange: r }))}
                        numberOfMonths={2}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    )}
                    {hasDate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-muted-foreground"
                        onClick={() => setSearchQuery(q => ({ ...q, date: undefined, dateRange: undefined }))}
                      >
                        <X className="w-3 h-3 mr-1" /> Clear date
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Filters Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "gap-2 rounded-full text-sm h-9 px-4",
                      priceFilter !== 'all' && "bg-primary/10 border-primary text-primary"
                    )}
                  >
                    <Filter className="w-4 h-4" />
                    Filters
                    {priceFilter !== 'all' && (
                      <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full ml-1">1</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="start">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Price</h4>
                      <div className="flex gap-2">
                        {(['all', 'free', 'paid'] as const).map((opt) => (
                          <Button
                            key={opt}
                            variant={priceFilter === opt ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPriceFilter(opt)}
                            className="flex-1 text-xs"
                          >
                            {opt === 'all' ? 'All' : opt === 'free' ? 'Free' : 'Paid'}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Location */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">Location</h4>
                      <Select
                        value={searchQuery.location || 'all'}
                        onValueChange={(v) => {
                          // Clear cities from the previous metro — they don't apply to the new one.
                          setSelectedCities([]);
                          setSearchQuery(q => ({ ...q, location: v === 'all' ? '' : v }));
                        }}
                      >
                        <SelectTrigger className="w-full h-9 text-sm">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground mr-1" />
                          <SelectValue placeholder="All Locations" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Locations</SelectItem>
                          {metrosLoading ? (
                            <SelectItem value="__loading" disabled>Loading locations…</SelectItem>
                          ) : metrosError ? (
                            <SelectItem value="__error" disabled>Locations unavailable</SelectItem>
                          ) : (
                            metros.map((metro) => (
                              <SelectItem key={metro.value} value={metro.value}>
                                {metro.label}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* City drill-down: only once a specific metro is selected */}
                    {searchQuery.location && searchQuery.location !== 'all' && availableCities.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium">Cities</h4>
                          {selectedCities.length > 0 && (
                            <button
                              onClick={() => setSelectedCities([])}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Clear Cities
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {availableCities.map((city) => (
                            <button
                              key={city}
                              onClick={() => toggleCity(city)}
                              className={cn(
                                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                                selectedCities.includes(city)
                                  ? 'bg-foreground text-background border-foreground'
                                  : 'bg-background text-foreground border-border hover:bg-muted'
                              )}
                            >
                              {city}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Category Chips - horizontally scrollable */}
              <div className="relative flex-1 min-w-0 flex items-center">
                <button
                  onClick={() => scrollChips('left')}
                  className="shrink-0 hidden sm:flex items-center justify-center w-7 h-7 rounded-full bg-card border border-border shadow-sm hover:bg-muted mr-1"
                  aria-label="Scroll categories left"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div
                  ref={chipsRef}
                  className="flex gap-2 overflow-x-auto scrollbar-hide scroll-smooth"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {categoryChips.map((chip) => (
                    <button
                      key={chip.value}
                      onClick={() => setSearchQuery(q => ({ ...q, category: chip.value }))}
                      className={cn(
                        'shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap',
                        searchQuery.category === chip.value
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-background text-foreground border-border hover:bg-muted'
                      )}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => scrollChips('right')}
                  className="shrink-0 hidden sm:flex items-center justify-center w-7 h-7 rounded-full bg-card border border-border shadow-sm hover:bg-muted ml-1"
                  aria-label="Scroll categories right"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Selected city chips */}
            {selectedCities.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {selectedCities.map((city) => (
                  <span
                    key={city}
                    className="inline-flex items-center gap-1.5 bg-muted text-foreground text-xs font-medium px-2.5 py-1.5 rounded-full"
                  >
                    <MapPin className="w-3 h-3" />
                    {city}
                    <button
                      onClick={() => toggleCity(city)}
                      className="ml-0.5 hover:text-destructive transition-colors"
                      aria-label={`Remove ${city}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => setSelectedCities([])}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear Cities
                </button>
              </div>
            )}
          </div>

          {/* Results count + Sort */}
          {!loading && (
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm font-medium text-foreground">
                <span className="font-bold">{displayEvents.length}</span>{' '}
                result{displayEvents.length !== 1 ? 's' : ''}
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-sm">
                    Sort by: <span className="font-semibold">{sortLabels[sortBy]}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(Object.keys(sortLabels) as SortOption[]).map((opt) => (
                    <DropdownMenuItem
                      key={opt}
                      onClick={() => setSortBy(opt)}
                      className={cn(sortBy === opt && 'font-semibold')}
                    >
                      {sortLabels[opt]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Results Grid */}
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-muted rounded-full mb-4 animate-pulse">
                <Calendar className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Loading events...</p>
            </div>
          ) : displayEvents.length > 0 ? (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {displayEvents.map((event, index) => {
                const eventImage = getEventImage(event);
                return (
                  <motion.div
                    key={event.event_id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.02, 0.3) }}
                    className="group bg-card rounded-xl overflow-hidden cursor-pointer border border-border hover:shadow-lg transition-shadow"
                    onClick={() => setSelectedEvent(event)}
                  >
                    {/* Image */}
                    <div className="aspect-[4/3] relative overflow-hidden bg-muted">
                      {event.is_free && (
                        <div className="absolute top-2.5 left-2.5 z-10 bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full text-xs font-semibold">
                          FREE
                        </div>
                      )}
                      <div className="absolute top-2.5 right-2.5 z-10">
                        <SaveEventButton
                          eventId={event.event_id}
                          isSaved={isSaved(event.event_id)}
                          isLoggedIn={!!userId}
                          onToggle={() => toggleSave(event.event_id)}
                          loading={saveLoading}
                          size="icon"
                          className="bg-background/80 backdrop-blur-sm border-0 hover:bg-background shadow-sm"
                        />
                      </div>
                      <img
                        src={eventImage}
                        alt={event.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>

                    {/* Content */}
                    <div className="p-3.5 space-y-2">
                      {/* Category chip + Posted by */}
                      {(event.category_names?.[0] || event.posted_by) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {event.category_names?.[0] && (
                            <span className="inline-block text-[11px] font-medium text-muted-foreground">
                              {event.category_names[0]}
                            </span>
                          )}
                          {event.posted_by && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                              <Building2 className="w-2.5 h-2.5" />
                              {event.posted_by}
                            </span>
                          )}
                        </div>
                      )}

                      <h3 className="font-display text-[15px] font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {event.title}
                      </h3>

                      {/* Date & time */}
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>{format(parseISO(event.start_time), 'EEE, MMM d')}</span>
                        {!event.all_day && (
                          <>
                            <span className="text-border">·</span>
                            <span>{format(parseISO(event.start_time), 'h:mm a')}</span>
                          </>
                        )}
                      </div>

                      {/* Venue */}
                      {event.venue_name && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="line-clamp-1">
                            {event.venue_name}{event.venue_city ? `, ${event.venue_city}` : ''}
                          </span>
                        </div>
                      )}

                      {/* Price */}
                      <div className="pt-1">
                        {(() => {
                          const price = getPriceDisplay(event);
                          return (
                            <span className={`font-semibold text-sm ${price.isFree ? 'text-primary' : 'text-foreground'}`}>
                              {price.label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            {hasMoreEvents && (
              <div className="flex justify-center mt-8">
                <Button
                  onClick={() => fetchEvents({ append: true })}
                  disabled={loadingMore}
                  size="lg"
                  className="font-semibold shadow-md hover:shadow-lg transition-all"
                >
                  {loadingMore ? 'Loading more...' : 'Load More'}
                </Button>
              </div>
            )}
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
                We couldn't find any events matching your search. Try broadening your filters or searching a different area.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => { setSearchQuery(q => ({ ...q, category: 'all' })); setPriceFilter('all'); setSelectedCities([]); }} variant="outline" className="gap-2">
                  Clear Filters
                </Button>
                <Button onClick={() => { setSearchQuery({ location: '', category: 'all', date: undefined, dateRange: undefined, dateMode: 'single' }); setPriceFilter('all'); setSelectedCities([]); }} className="gap-2">
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
