import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Calendar, Clock, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { SaveEventButton } from './SaveEventButton';
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDiscoverableMetros } from '@/hooks/useDiscoverableMetros';
import { getPriceDisplay } from '@/lib/priceDisplay';

interface BrowseEvent {
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
  metro_name: string | null;
  category_names: string[] | null;
}

export function BrowseEvents() {
  const { metros, loading: metrosLoading, error: metrosError } = useDiscoverableMetros();
  const [events, setEvents] = useState<BrowseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [metroFilter, setMetroFilter] = useState<string>('all');

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      const { data } = await supabase.rpc('search_events', {
        p_metro_slug: metroFilter !== 'all' ? metroFilter : undefined,
        p_date_from: new Date().toISOString(),
        p_limit: 16,
      });

      if (data) {
        setEvents(data as BrowseEvent[]);
      }
      setLoading(false);
    };

    fetchEvents();
  }, [metroFilter]);

  return (
    <section className="py-10 px-4">
      <div className="container mx-auto max-w-6xl">
        {/* Section header with filter */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6"
        >
          <div>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium mb-2">
              <TrendingUp className="w-3.5 h-3.5" />
              Upcoming Events
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
              What's Happening Near You
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Select value={metroFilter} onValueChange={setMetroFilter}>
              <SelectTrigger className="w-[180px] h-9 text-sm">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground mr-1 shrink-0" />
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
            <Link to="/events">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </div>
        </motion.div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading events...</p>
          </div>
        ) : events.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {events.map((event, index) => (
              <motion.div
                key={event.event_id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="group bg-card rounded-xl overflow-hidden card-hover"
              >
                {/* Image */}
                <div className="aspect-[16/10] relative overflow-hidden bg-muted">
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent z-10" />
                  {event.category_names?.[0] && (
                    <div className="absolute top-3 left-3 z-20">
                      <span className="bg-accent text-accent-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                        {event.category_names[0]}
                      </span>
                    </div>
                  )}
                  {event.is_free && (
                    <div className="absolute top-3 right-3 z-20 bg-primary text-primary-foreground px-2.5 py-1 rounded-full text-xs font-semibold">
                      FREE
                    </div>
                  )}
                  {event.image_url ? (
                    <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                      <span className="text-4xl opacity-50">🎉</span>
                    </div>
                  )}
                </div>

                {/* Content */}
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
                    {event.venue_name && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        <span className="line-clamp-1">
                          {event.venue_name}{event.venue_city ? `, ${event.venue_city}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    {(() => {
                      const price = getPriceDisplay(event);
                      return (
                        <span className={`font-semibold text-sm ${price.isFree ? 'text-primary' : 'text-foreground'}`}>
                          {price.label}
                        </span>
                      );
                    })()}
                    <SaveEventButton
                      eventId={event.event_id}
                      isSaved={false}
                      isLoggedIn={false}
                      onToggle={() => {}}
                      size="sm"
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No upcoming events found in this area yet.</p>
            <Link to="/events">
              <Button className="bg-primary hover:bg-green-dark text-primary-foreground">Browse All Events</Button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
