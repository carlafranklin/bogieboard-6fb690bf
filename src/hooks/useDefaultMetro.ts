import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { detectUserLocation, findNearestMetro, mapCityToMetro } from '@/lib/locationUtils';
import { useDiscoverableMetros } from './useDiscoverableMetros';

interface UseDefaultMetroResult {
  metroSlug: string | null;
  metroName: string | null;
  loading: boolean;
  /** True once resolution has finished, even if nothing could be resolved. */
  resolved: boolean;
}

/**
 * Resolves a sensible default metro so the homepage isn't empty on first
 * load: logged-in users get the same profile-city cascade previously used
 * by NearbyEvents; logged-out users get a best-effort IP geolocation guess;
 * everyone falls back to the first active metro if nothing else resolves.
 * The Hero's own metro selector can always override this afterward.
 */
export function useDefaultMetro(userId: string | null): UseDefaultMetroResult {
  const { metros, loading: metrosLoading } = useDiscoverableMetros();
  const [metroSlug, setMetroSlug] = useState<string | null>(null);
  const [metroName, setMetroName] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (metrosLoading) return;

    let cancelled = false;

    const resolve = async () => {
      setResolved(false);

      // 1. Logged-in: try the profile's known cities, cascading.
      if (userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('current_city, detected_city, hometown')
          .eq('user_id', userId)
          .maybeSingle();

        const cityAttempts = [
          profile?.current_city,
          profile?.detected_city,
          profile?.hometown,
        ].filter(Boolean) as string[];

        for (const city of cityAttempts) {
          const mapping = await mapCityToMetro(city);
          if (mapping && !cancelled) {
            setMetroSlug(mapping.metroSlug);
            setMetroName(mapping.metroName);
            setResolved(true);
            return;
          }
        }
      }

      // 2. Best-effort IP geolocation (works for logged-out and logged-in alike).
      const loc = await detectUserLocation();
      if (loc.city) {
        const mapping = await mapCityToMetro(loc.city);
        if (mapping && !cancelled) {
          setMetroSlug(mapping.metroSlug);
          setMetroName(mapping.metroName);
          setResolved(true);
          return;
        }
        if (loc.latitude && loc.longitude) {
          const nearest = await findNearestMetro(loc.latitude, loc.longitude);
          if (nearest && !cancelled) {
            setMetroSlug(nearest.slug);
            setMetroName(nearest.name);
            setResolved(true);
            return;
          }
        }
      }

      // 3. Fallback: first discoverable metro, alphabetically (useDiscoverableMetros already sorts by name).
      if (!cancelled) {
        const fallback = metros[0];
        setMetroSlug(fallback?.value ?? null);
        setMetroName(fallback?.label ?? null);
        setResolved(true);
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [userId, metrosLoading, metros]);

  return { metroSlug, metroName, loading: metrosLoading || !resolved, resolved };
}
