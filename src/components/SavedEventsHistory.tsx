import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { History, Calendar, MapPin, Clock, Bookmark } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import type { Tables } from '@/integrations/supabase/types';

type CanonicalEvent = Tables<'canonical_events'>;

interface SavedEventsHistoryProps {
  userId: string;
}

interface SavedItem {
  id: string;
  saved_at: string;
  canonical_event_id: string | null;
  event_id: string | null;
}

export function SavedEventsHistory({ userId }: SavedEventsHistoryProps) {
  const [savedItems, setSavedItems] = useState<(SavedItem & { event?: CanonicalEvent })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSaved = async () => {
      setLoading(true);

      // Get saved events (past ones - where event start_time < now)
      const { data: saved } = await supabase
        .from('saved_events')
        .select('id, saved_at, canonical_event_id, event_id')
        .eq('user_id', userId)
        .order('saved_at', { ascending: false });

      if (!saved || saved.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch canonical events for past saved items
      const canonicalIds = saved
        .map(s => s.canonical_event_id)
        .filter(Boolean) as string[];

      let events: CanonicalEvent[] = [];
      if (canonicalIds.length > 0) {
        const { data } = await supabase
          .from('canonical_events')
          .select('*')
          .in('id', canonicalIds)
          .lt('start_time', new Date().toISOString());
        events = data || [];
      }

      const eventMap = new Map(events.map(e => [e.id, e]));
      const merged = saved
        .filter(s => s.canonical_event_id && eventMap.has(s.canonical_event_id))
        .map(s => ({ ...s, event: eventMap.get(s.canonical_event_id!)! }));

      setSavedItems(merged);
      setLoading(false);
    };

    fetchSaved();
  }, [userId]);

  if (loading || savedItems.length === 0) return null;

  return (
    <section className="py-12 px-4 bg-muted/30">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-2">
            <History className="w-5 h-5 text-primary" />
            <h2 className="font-display text-2xl font-bold text-foreground">
              Past Saved Events
            </h2>
          </div>
          <p className="text-muted-foreground text-sm">
            Events you've saved that have already occurred
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedItems.slice(0, 6).map((item, index) => {
            const ev = item.event!;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="bg-card rounded-xl p-4 card-hover opacity-75"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-display text-base font-semibold text-foreground line-clamp-2">
                    {ev.title}
                  </h3>
                  <Bookmark className="w-4 h-4 text-primary shrink-0 ml-2" />
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{format(parseISO(ev.start_time), 'MMM d, yyyy')}</span>
                  </div>
                  {ev.description_short && (
                    <p className="line-clamp-2 text-xs mt-1">{ev.description_short}</p>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground/60">
                  Saved {format(parseISO(item.saved_at), 'MMM d, yyyy')}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
