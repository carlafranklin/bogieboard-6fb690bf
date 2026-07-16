import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getSafeErrorMessage } from '@/lib/errorUtils';

export function useSavedEvents(userId: string | null) {
  const [savedEventIds, setSavedEventIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) {
      setSavedEventIds(new Set());
      return;
    }

    const fetchSaved = async () => {
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

      const { data } = await supabase
        .from('saved_events')
        .select('canonical_event_id, event_id')
        .eq('user_id', userId)
        .gte('saved_at', threeYearsAgo.toISOString());

      if (data) {
        const ids = new Set<string>();
        data.forEach(d => {
          if (d.canonical_event_id) ids.add(d.canonical_event_id);
          if (d.event_id) ids.add(d.event_id);
        });
        setSavedEventIds(ids);
      }
    };

    fetchSaved();
  }, [userId]);

  const toggleSave = useCallback(async (eventId: string, type: 'canonical' | 'event' = 'canonical') => {
    if (!userId) return false;

    setLoading(true);
    const isSaved = savedEventIds.has(eventId);

    try {
      if (isSaved) {
        const col = type === 'canonical' ? 'canonical_event_id' : 'event_id';
        const { error } = await supabase.from('saved_events').delete().eq('user_id', userId).eq(col, eventId);
        if (error) {
          toast({ title: 'Error removing event', description: getSafeErrorMessage(error), variant: 'destructive' });
          return isSaved;
        }
        setSavedEventIds(prev => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
        toast({ title: 'Event removed from saved' });
      } else {
        const insert: Record<string, string> = { user_id: userId };
        if (type === 'canonical') insert.canonical_event_id = eventId;
        else insert.event_id = eventId;

        const { error } = await supabase.from('saved_events').insert([insert as { user_id: string; canonical_event_id?: string; event_id?: string }]);
        if (error) {
          toast({ title: 'Error saving event', description: getSafeErrorMessage(error), variant: 'destructive' });
          return isSaved;
        }
        setSavedEventIds(prev => new Set(prev).add(eventId));
        toast({ title: 'Event saved!' });
      }
    } catch (err) {
      toast({ title: 'Error saving event', description: getSafeErrorMessage(err), variant: 'destructive' });
      return isSaved;
    } finally {
      setLoading(false);
    }

    return !isSaved;
  }, [userId, savedEventIds, toast]);

  const isSaved = useCallback((eventId: string) => savedEventIds.has(eventId), [savedEventIds]);

  return { isSaved, toggleSave, loading, savedEventIds };
}
