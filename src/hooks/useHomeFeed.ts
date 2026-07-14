import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { HomeEvent } from '@/data/homeShelves';

interface UseHomeFeedResult {
  events: HomeEvent[];
  loading: boolean;
  error: boolean;
  retry: () => void;
}

/**
 * Single search_events fetch per metro/city scope. All homepage tabs and
 * shelves slice this one result set client-side (see homeShelves.ts) rather
 * than issuing a separate network call each — matches the pattern already
 * used on /events.
 */
export function useHomeFeed(metroSlug: string | null, cities: string[]): UseHomeFeedResult {
  const [events, setEvents] = useState<HomeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const citiesKey = cities.join(',');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(false);

    const { data, error: fetchError } = await supabase.rpc('search_events', {
      p_metro_slug: metroSlug ?? undefined,
      p_date_from: new Date().toISOString(),
      p_limit: 200,
      p_cities: cities.length > 0 ? cities : undefined,
    });

    if (fetchError) {
      console.error('[useHomeFeed] search_events failed:', fetchError);
      setError(true);
      setEvents([]);
    } else {
      setEvents((data ?? []) as HomeEvent[]);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metroSlug, citiesKey]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, retry: fetchEvents };
}
