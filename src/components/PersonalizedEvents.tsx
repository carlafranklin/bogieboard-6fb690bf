import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, MapPin, SearchX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { EventDetailModal } from './EventDetailModal';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { Calendar, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Tables } from '@/integrations/supabase/types';

type DbEvent = Tables<'events'>;
type SearchPreference = Tables<'search_preferences'>;
type Category = Tables<'categories'>;

interface PersonalizedEventsProps {
  userId: string;
}

export function PersonalizedEvents({ userId }: PersonalizedEventsProps) {
  const [events, setEvents] = useState<DbEvent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<DbEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [userCity, setUserCity] = useState<string | null>(null);

  useEffect(() => {
    const fetchPersonalized = async () => {
      setLoading(true);

      // Fetch preferences, profile, and categories in parallel
      const [prefsRes, profileRes, catsRes] = await Promise.all([
        supabase.from('search_preferences').select('*').eq('user_id', userId),
        supabase.from('profiles').select('address').eq('user_id', userId).single(),
        supabase.from('categories').select('*').order('display_order'),
      ]);

      const preferences: SearchPreference[] = prefsRes.data || [];
      const profile = profileRes.data;
      if (catsRes.data) setCategories(catsRes.data);

      // Extract cities and category_ids from preferences
      const prefCities = preferences.map(p => p.city).filter(Boolean) as string[];
      const prefCategoryIds = preferences.map(p => p.category_id).filter(Boolean) as string[];

      // Also try to extract city from profile address
      if (profile?.address) {
        const parts = profile.address.split(',').map(s => s.trim());
        if (parts.length >= 2) {
          const city = parts[parts.length - 2] || parts[0];
          if (city && !prefCities.includes(city)) prefCities.push(city);
        }
      }

      setUserCity(prefCities[0] || null);

      // Build query
      let query = supabase.from('events').select('*').order('event_date', { ascending: true }).limit(12);

      // Filter by preferred cities
      if (prefCities.length > 0) {
        query = query.in('city', prefCities.map(c => c.charAt(0).toUpperCase() + c.slice(1)));
      }

      // Filter by preferred categories
      if (prefCategoryIds.length > 0) {
        query = query.in('category_id', prefCategoryIds);
      }

      const { data: matchedEvents } = await query;

      // If no matches, fall back to all events
      if (matchedEvents && matchedEvents.length > 0) {
        setEvents(matchedEvents);
      } else {
        const { data: fallback } = await supabase
          .from('events')
          .select('*')
          .order('event_date', { ascending: true })
          .limit(8);
        setEvents(fallback || []);
      }

      setLoading(false);
    };

    fetchPersonalized();
  }, [userId]);

  const getCategorySlug = (categoryId: string | null) => {
    if (!categoryId) return '';
    const cat = categories.find(c => c.id === categoryId);
    return cat?.slug || '';
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return '';
    const cat = categories.find(c => c.id === categoryId);
    return cat?.name || '';
  };

  // Map DB event to the format EventDetailModal expects
  const mapToModalEvent = (e: DbEvent) => ({
    id: e.id,
    title: e.title,
    description: e.description || '',
    date: e.event_date || '',
    time: e.event_time || '',
    venue: e.venue || '',
    city: e.city || '',
    state: e.state || '',
    zipCode: e.zip_code || '',
    category: getCategorySlug(e.category_id) as any,
    imageUrl: e.image_url || '/placeholder.svg',
    price: e.price ? Number(e.price) : null,
    isFree: e.is_free || false,
    ageRestriction: e.age_restriction || undefined,
    ticketUrl: e.ticket_url || '',
  });

  if (loading) {
    return (
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl text-center">
          <p className="text-muted-foreground">Loading your personalized events...</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              Personalized for you
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">
              Events That May Interest You
            </h2>
            {userCity && (
              <p className="text-muted-foreground text-lg flex items-center justify-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Based on your preferences in {userCity}
              </p>
            )}
          </motion.div>

          {events.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {events.map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                  className="group bg-card rounded-xl overflow-hidden card-hover cursor-pointer"
                  onClick={() => setSelectedEvent(event)}
                >
                  <div className="aspect-[16/10] relative overflow-hidden bg-muted">
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent z-10" />
                    <div className="absolute top-3 left-3 z-20">
                      {getCategorySlug(event.category_id) && (
                        <CategoryBadge category={getCategorySlug(event.category_id)} />
                      )}
                    </div>
                    {event.is_free && (
                      <div className="absolute top-3 right-3 z-20 bg-primary text-primary-foreground px-2.5 py-1 rounded-full text-xs font-semibold">
                        FREE
                      </div>
                    )}
                    <div className="w-full h-full bg-gradient-to-br from-coral/20 to-teal/20 flex items-center justify-center">
                      <span className="text-4xl opacity-50">🎉</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    <h3 className="font-display text-lg font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {event.title}
                    </h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      {event.event_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-primary" />
                          <span>{format(parseISO(event.event_date), 'EEE, MMM d')}</span>
                          {event.event_time && (
                            <>
                              <Clock className="w-4 h-4 text-primary ml-2" />
                              <span>{event.event_time}</span>
                            </>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-primary" />
                        <span className="line-clamp-1">
                          {event.venue}{event.city ? `, ${event.city}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      {event.price ? (
                        <span className="font-semibold text-foreground">${Number(event.price)}</span>
                      ) : (
                        <span className="text-primary font-semibold">Free</span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:text-primary hover:bg-green-light"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(event);
                        }}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-full mb-4">
                <SearchX className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                No matching events yet
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Update your search preferences in your profile to see personalized events here.
              </p>
              <Link to="/profile">
                <Button variant="outline">Update Preferences</Button>
              </Link>
            </motion.div>
          )}

          <div className="text-center mt-10">
            <Link to="/events">
              <Button size="lg" className="bg-primary hover:bg-green-dark text-primary-foreground">
                Browse All Events
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {selectedEvent && (
        <EventDetailModal
          event={mapToModalEvent(selectedEvent)}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  );
}
