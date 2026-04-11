import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Calendar, Clock, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { SaveEventButton } from './SaveEventButton';

interface FeaturedEventsNearYouProps {
  userId: string;
  isSaved: (id: string) => boolean;
  onToggleSave: (id: string) => void;
  savingLoading: boolean;
}

interface FeaturedEvent {
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
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
  category_names: string[] | null;
  source_url: string | null;
}

const DEFAULT_METRO_SLUG = 'raleigh-durham';
const DEFAULT_METRO_LABEL = 'Raleigh-Durham';

export function FeaturedEventsNearYou({ userId, isSaved, onToggleSave, savingLoading }: FeaturedEventsNearYouProps) {
  const [events, setEvents] = useState<FeaturedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    const fetchFeatured = async () => {
      setLoading(true);

      // Get profile for location
      const { data: profile } = await supabase
        .from('profiles')
        .select('current_city, current_state, current_zip, detected_city, detected_state, detected_zip, hometown, address')
        .eq('user_id', userId)
        .single();

      let metroSlug: string | null = null;
      let label: string | null = null;

      // 1. Try structured city/state fields
      const city = profile?.current_city || profile?.detected_city;
      const state = profile?.current_state || profile?.detected_state;
      const zip = profile?.current_zip || profile?.detected_zip;

      if (city && state) {
        const result = await resolveMetroFromCity(city, state);
        if (result) { metroSlug = result.slug; label = result.name; }
      }

      // 2. Fallback: zip
      if (!metroSlug && zip) {
        const result = await resolveMetroFromZip(zip);
        if (result) { metroSlug = result.slug; label = result.name; }
      }

      // 3. Fallback: hometown
      if (!metroSlug && profile?.hometown) {
        const parts = profile.hometown.split(',').map((s: string) => s.trim());
        if (parts.length >= 2) {
          const result = await resolveMetroFromCity(parts[0], parts[1]);
          if (result) { metroSlug = result.slug; label = result.name; }
        }
      }

      // 4. Fallback: legacy address
      if (!metroSlug && profile?.address) {
        const { data: metros } = await supabase.from('metro_areas').select('slug, name, core_cities');
        if (metros) {
          const addrLower = profile.address.toLowerCase();
          for (const m of metros) {
            const cities = m.core_cities as string[];
            if (cities?.some(c => addrLower.includes(c.toLowerCase()))) {
              metroSlug = m.slug;
              label = m.name;
              break;
            }
          }
        }
      }

      // 5. Final fallback: default market
      if (!metroSlug) {
        metroSlug = DEFAULT_METRO_SLUG;
        label = DEFAULT_METRO_LABEL;
        setIsDefault(true);
      }

      setLocationLabel(label);

      // Fetch featured events
      const { data } = await supabase.rpc('search_events', {
        p_metro_slug: metroSlug,
        p_date_from: new Date().toISOString(),
        p_limit: 8,
      });

      if (data && data.length > 0) {
        setEvents(data.map((d: any) => ({
          event_id: d.event_id,
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
          venue_name: d.venue_name,
          venue_city: d.venue_city,
          venue_state: d.venue_state,
          category_names: d.category_names,
          source_url: d.source_url,
        })));
      }

      setLoading(false);
    };

    fetchFeatured();
  }, [userId]);

  if (loading) {
    return (
      <section className="py-8 px-4">
        <div className="container mx-auto max-w-6xl text-center">
          <p className="text-muted-foreground">Loading featured events...</p>
        </div>
      </section>
    );
  }

  if (events.length === 0) return null;

  return (
    <section className="py-8 px-4">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <div className="inline-flex items-center gap-2 bg-accent/10 text-accent-foreground px-3 py-1 rounded-full text-sm font-medium mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              Featured
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
              What's happening {locationLabel ? `in ${locationLabel}` : 'near you'}
            </h2>
            {isDefault && (
              <p className="text-sm text-muted-foreground mt-1">
                Showing events from {locationLabel}. Update your profile to see events near you.
              </p>
            )}
          </div>
          <Link to="/events">
            <Button variant="outline" size="sm">Browse All</Button>
          </Link>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {events.map((event, index) => (
            <motion.div
              key={event.event_id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group bg-card rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
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
                <div className="absolute bottom-3 right-3 z-20">
                  <SaveEventButton
                    eventId={event.event_id}
                    isSaved={isSaved(event.event_id)}
                    isLoggedIn={true}
                    onToggle={() => onToggleSave(event.event_id)}
                    loading={savingLoading}
                    size="sm"
                  />
                </div>
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
                    <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>{format(parseISO(event.start_time), 'EEE, MMM d')}</span>
                    {!event.all_day && (
                      <>
                        <Clock className="w-3.5 h-3.5 text-primary ml-1 shrink-0" />
                        <span>{format(parseISO(event.start_time), 'h:mm a')}</span>
                      </>
                    )}
                  </div>
                  {event.venue_name && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="line-clamp-1">
                        {event.venue_name}
                        {event.venue_city ? `, ${event.venue_city}` : ''}
                      </span>
                    </div>
                  )}
                </div>
                {!event.is_free && event.price_min != null && (
                  <p className="text-sm font-semibold text-primary">
                    ${event.price_min}{event.price_max && event.price_max !== event.price_min ? `–$${event.price_max}` : ''}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Helper: resolve metro from city/state via city_lookup
async function resolveMetroFromCity(city: string, state: string) {
  const { data: lookup } = await supabase
    .from('city_lookup')
    .select('metro_area_id')
    .ilike('city_name', city)
    .ilike('state_code', state)
    .limit(1)
    .maybeSingle();

  if (lookup?.metro_area_id) {
    const { data: metro } = await supabase
      .from('metro_areas')
      .select('slug, name')
      .eq('id', lookup.metro_area_id)
      .single();
    return metro;
  }
  return null;
}

// Helper: resolve metro from zip via city_lookup
async function resolveMetroFromZip(zip: string) {
  const { data: lookup } = await supabase
    .from('city_lookup')
    .select('metro_area_id')
    .eq('zip_code', zip)
    .limit(1)
    .maybeSingle();

  if (lookup?.metro_area_id) {
    const { data: metro } = await supabase
      .from('metro_areas')
      .select('slug, name')
      .eq('id', lookup.metro_area_id)
      .single();
    return metro;
  }
  return null;
}
