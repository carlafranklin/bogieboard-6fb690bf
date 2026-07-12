import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ActiveMetro {
  value: string;
  label: string;
}

interface UseActiveMetrosResult {
  metros: ActiveMetro[];
  loading: boolean;
  error: boolean;
}

/**
 * Live, consumer-facing metro list. Replaces the old hardcoded src/data/metroAreas.ts
 * so metros added/deactivated via Admin show up without a code deploy.
 */
export function useActiveMetros(): UseActiveMetrosResult {
  const [metros, setMetros] = useState<ActiveMetro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);

      const { data, error: fetchError } = await supabase
        .from('metro_areas')
        .select('slug, name')
        .eq('is_active', true)
        .order('name');

      if (cancelled) return;

      if (fetchError || !data) {
        console.error('[useActiveMetros] failed to load metro areas:', fetchError);
        setError(true);
        setMetros([]);
      } else {
        setMetros(data.map((m) => ({ value: m.slug, label: m.name })));
      }
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return { metros, loading, error };
}
