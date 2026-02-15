import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Calendar, Clock, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { SaveEventButton } from './SaveEventButton';
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import type { Tables } from '@/integrations/supabase/types';

type CanonicalEvent = Tables<'canonical_events'>;

interface NearbyEventsProps {
  userId: string;
  isSaved: (id: string) => boolean;
  onToggleSave: (id: string) => void;
  savingLoading: boolean;
  onSelectEvent?: (event: CanonicalEvent) => void;
}

export function NearbyEvents({ userId, isSaved, onToggleSave, savingLoading, onSelectEvent }: NearbyEventsProps) {
  const [events, setEvents] = useState<(CanonicalEvent & { venue_name?: string; venue_city?: string; category_names?: string[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [metroName, setMetroName] = useState<string | null>(null);

  useEffect(() => {
    const fetchNearby = async () => {
      setLoading(true);

      // Get user's profile address to determine metro area
      const { data: profile } = await supabase
        .from('profiles')
        .select('address')
        .eq('user_id', userId)
        .single();

      // Try to match metro area from profile address
      let metroSlug: string | null = null;
      if (profile?.address) {
        const { data: metros } = await supabase.from('metro_areas').select('*');
        if (metros) {
          const addressLower = profile.address.toLowerCase();
          for (const metro of metros) {
            const cities = metro.core_cities as string[];
            if (cities?.some(c => addressLower.includes(c.toLowerCase()))) {
              metroSlug = metro.slug;
              setMetroName(metro.name);
              break;
            }
          }
        }
      }

      // Use search_events function to get nearby events
      const { data } = await supabase.rpc('search_events', {
        p_metro_slug: metroSlug,
        p_date_from: new Date().toISOString(),
        p_limit: 12,
      });

      if (data && data.length > 0) {
        // Shuffle for randomness
        const shuffled = [...data].sort(() => Math.random() - 0.5);
        setEvents(shuffled.map(d => ({
          id: d.event_id,
          title: d.title,
          description_short: d.description_short,
          start_time: d.start_time,
          end_time: d.end_time,
          all_day: d.all_day,
          is_free: d.is_free,
          price_min: d.price_min,
          price_max: d.price_max,
          ticket_url: d.ticket_url,
          image_url: d.image_url,
          age_restriction: d.age_restriction,
          status: d.status,
          venue_name: d.venue_name,
          venue_city: d.venue_city,
          category_names: d.category_names,
          // Fill required fields with defaults
          currency: 'USD',
          created_at: '',
          updated_at: '',
          first_seen_at: '',
          last_seen_at: '',
          last_refreshed_at: '',
          metro_area_id: null,
          venue_id: null,
          event_series_id: null,
          normalized_hash: null,
          description_long: null,
          organizer_name: null,
          image_source: 'feed',
          image_attribution: null,
          image_last_verified_at: null,
        })));
      }

      setLoading(false);
    };

    fetchNearby();
  }, [userId]);

  if (loading) {
    return (
      <section className="py-8 px-4">
        <div className="container mx-auto max-w-6xl text-center">
          <p className="text-muted-foreground">Finding events near you...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-8 px-4">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              Near You
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
              Events {metroName ? `in ${metroName}` : 'Nearby'}
            </h2>
          </div>
          <Link to="/events">
            <Button variant="outline" size="sm">View All</Button>
          </Link>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {events.map((event, index) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group bg-card rounded-xl overflow-hidden card-hover cursor-pointer"
              onClick={() => onSelectEvent?.(event)}
            >
              <div className="aspect-[16/10] relative overflow-hidden bg-muted">
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent z-10" />
                {(event as any).category_names?.[0] && (
                  <div className="absolute top-3 left-3 z-20">
                    <span className="bg-accent text-accent-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                      {(event as any).category_names[0]}
                    </span>
                  </div>
                )}
                {event.is_free && (
                  <div className="absolute top-3 right-3 z-20 bg-primary text-primary-foreground px-2.5 py-1 rounded-full text-xs font-semibold">
                    FREE
                  </div>
                )}
                {event.image_url ? (
                  <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                    <span className="text-4xl opacity-50">🎉</span>
                  </div>
                )}
              </div>

              <div className="p-4 space-y-3">
                <h3 className="font-display text-base font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                  {event.title}
                </h3>
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    <span>{format(parseISO(event.start_time), 'EEE, MMM d')}</span>
                    {!event.all_day && (
                      <>
                        <Clock className="w-3.5 h-3.5 text-primary ml-1" />
                        <span>{format(parseISO(event.start_time), 'h:mm a')}</span>
                      </>
                    )}
                  </div>
                  {(event as any).venue_name && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-primary" />
                      <span className="line-clamp-1">
                        {(event as any).venue_name}{(event as any).venue_city ? `, ${(event as any).venue_city}` : ''}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1">
                  {event.price_min ? (
                    <span className="font-semibold text-foreground text-sm">
                      ${Number(event.price_min)}{event.price_max && event.price_max !== event.price_min ? ` – $${Number(event.price_max)}` : ''}
                    </span>
                  ) : (
                    <span className="text-primary font-semibold text-sm">Free</span>
                  )}
                  <SaveEventButton
                    eventId={event.id}
                    isSaved={isSaved(event.id)}
                    isLoggedIn={true}
                    onToggle={() => onToggleSave(event.id)}
                    loading={savingLoading}
                    size="sm"
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {events.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No upcoming events found near you yet.</p>
            <Link to="/events">
              <Button className="bg-primary hover:bg-green-dark text-primary-foreground">Browse All Events</Button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
