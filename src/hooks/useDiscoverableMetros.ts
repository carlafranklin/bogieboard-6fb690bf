import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DiscoverableMetro {
  value: string;
  label: string;
}

interface UseDiscoverableMetrosResult {
  metros: DiscoverableMetro[];
  loading: boolean;
  error: boolean;
}

/**
 * Live, consumer-facing metro list. A metro is discoverable (shown in
 * search/location dropdowns) when:
 *   1. metro_areas.is_active = true
 *   2. slug and name are present (already NOT NULL at the schema level;
 *      filtered here too for explicitness/defense-in-depth)
 *   3. it has at least one upcoming, status='active' canonical_event
 *
 * This is intentionally stricter than "just active" — an is_active metro
 * with zero current inventory is hidden from consumers (empty results are
 * a worse experience than not offering the metro at all) but remains fully
 * visible/manageable in Admin, which queries metro_areas directly and does
 * not use this hook.
 *
 * No new RPC: uses PostgREST's embedded-resource inner-join filtering
 * (canonical_events!inner(...)) against the existing metro_areas <->
 * canonical_events foreign key, so newly active metros with real inventory
 * appear automatically — no frontend code change needed per new metro.
 */
export function useDiscoverableMetros(): UseDiscoverableMetrosResult {
  const [metros, setMetros] = useState<DiscoverableMetro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);

      const { data, error: fetchError } = await supabase
        .from('metro_areas')
        .select('slug, name, canonical_events!inner(id)')
        .eq('is_active', true)
        .not('slug', 'is', null)
        .not('name', 'is', null)
        .eq('canonical_events.status', 'active')
        .gte('canonical_events.start_time', new Date().toISOString())
        .order('name');

      if (cancelled) return;

      if (fetchError || !data) {
        console.error('[useDiscoverableMetros] failed to load metros:', fetchError);
        setError(true);
        setMetros([]);
      } else {
        // The inner join returns one row per matching event, so the same
        // metro can repeat — dedupe by slug, then sort for a stable order.
        const bySlug = new Map<string, DiscoverableMetro>();
        for (const row of data as unknown as { slug: string; name: string }[]) {
          if (!bySlug.has(row.slug)) {
            bySlug.set(row.slug, { value: row.slug, label: row.name });
          }
        }
        setMetros(Array.from(bySlug.values()).sort((a, b) => a.label.localeCompare(b.label)));
      }
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return { metros, loading, error };
}
