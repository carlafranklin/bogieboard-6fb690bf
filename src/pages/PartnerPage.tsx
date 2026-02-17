import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Phone, Globe, Facebook, Instagram, Twitter, Linkedin, Calendar, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type PartnerProfile = Tables<'partner_profiles'>;
type PartnerEvent = Tables<'partner_events'>;

export default function PartnerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [events, setEvents] = useState<PartnerEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    const fetch = async () => {
      setLoading(true);
      const { data: pp } = await supabase.from('partner_profiles').select('*').eq('slug', slug).single();
      if (pp) {
        setProfile(pp);
        const { data: evts } = await supabase.from('partner_events')
          .select('*')
          .eq('partner_profile_id', pp.id)
          .eq('status', 'active')
          .gte('event_date', new Date().toISOString().split('T')[0])
          .order('event_date');
        if (evts) setEvents(evts);
      }
      setLoading(false);
    };
    fetch();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16 px-4 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16 px-4 flex items-center justify-center">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold text-foreground mb-2">Partner Not Found</h1>
            <p className="text-muted-foreground">This partner page doesn't exist.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const fullAddress = [profile.address, profile.city, profile.state, profile.zip_code].filter(Boolean).join(', ');

  // Group events by month
  const eventsByMonth: Record<string, PartnerEvent[]> = {};
  events.forEach(evt => {
    const month = new Date(evt.event_date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    if (!eventsByMonth[month]) eventsByMonth[month] = [];
    eventsByMonth[month].push(evt);
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Business Header */}
            <div className="bg-card rounded-2xl shadow-sm border border-border p-8 mb-6">
              <div className="flex flex-col sm:flex-row items-start gap-6">
                {profile.logo_url && (
                  <img src={profile.logo_url} alt={profile.business_name} className="w-24 h-24 rounded-xl object-cover border border-border" />
                )}
                <div className="flex-1">
                  <h1 className="font-display text-3xl font-bold text-foreground mb-2">{profile.business_name}</h1>
                  {profile.description && <p className="text-muted-foreground mb-4">{profile.description}</p>}
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    {fullAddress && (
                      <a href={`https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground transition-colors">
                        <MapPin className="w-4 h-4" /> {fullAddress}
                      </a>
                    )}
                    {profile.phone && <span className="flex items-center gap-1"><Phone className="w-4 h-4" /> {profile.phone}</span>}
                    {profile.website && (
                      <a href={profile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground transition-colors">
                        <Globe className="w-4 h-4" /> Website
                      </a>
                    )}
                  </div>
                  {/* Social Links */}
                  <div className="flex gap-3 mt-3">
                    {profile.social_facebook && <a href={profile.social_facebook} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><Facebook className="w-5 h-5" /></a>}
                    {profile.social_instagram && <a href={profile.social_instagram} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><Instagram className="w-5 h-5" /></a>}
                    {profile.social_twitter && <a href={profile.social_twitter} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><Twitter className="w-5 h-5" /></a>}
                    {profile.social_linkedin && <a href={profile.social_linkedin} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><Linkedin className="w-5 h-5" /></a>}
                  </div>
                </div>
              </div>
            </div>

            {/* Events Calendar */}
            <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
              <div className="flex items-center gap-2 mb-6">
                <Calendar className="w-5 h-5 text-primary" />
                <h2 className="font-display text-xl font-semibold text-foreground">Upcoming Events</h2>
              </div>

              {events.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground">No upcoming events scheduled.</p>
              ) : (
                <div className="space-y-8">
                  {Object.entries(eventsByMonth).map(([month, monthEvents]) => (
                    <div key={month}>
                      <h3 className="font-display text-lg font-semibold text-foreground mb-3 border-b border-border pb-2">{month}</h3>
                      <div className="space-y-3">
                        {monthEvents.map(evt => {
                          const date = new Date(evt.event_date + 'T00:00:00');
                          return (
                            <div key={evt.id} className="flex gap-4 p-4 rounded-xl bg-muted/50 border border-border hover:shadow-md transition-shadow">
                              <div className="flex flex-col items-center justify-center min-w-[60px] bg-primary/10 rounded-lg p-2">
                                <span className="text-xs font-semibold text-primary uppercase">{date.toLocaleDateString('en-US', { month: 'short' })}</span>
                                <span className="text-2xl font-bold text-primary">{date.getDate()}</span>
                              </div>
                              <div className="flex-1">
                                <h4 className="font-semibold text-foreground">{evt.title}</h4>
                                {evt.event_time && <p className="text-sm text-muted-foreground">{evt.event_time}</p>}
                                {evt.venue_name && <p className="text-sm text-muted-foreground">{evt.venue_name}{evt.city ? `, ${evt.city}` : ''}</p>}
                                {evt.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{evt.description}</p>}
                                <div className="flex items-center gap-3 mt-2">
                                  {evt.is_free ? (
                                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">FREE</span>
                                  ) : evt.price ? (
                                    <span className="text-xs font-semibold text-foreground">${Number(evt.price).toFixed(2)}</span>
                                  ) : null}
                                  {evt.ticket_url && (
                                    <a href={evt.ticket_url} target="_blank" rel="noopener noreferrer">
                                      <Button size="sm" variant="outline" className="h-7 text-xs">
                                        <ExternalLink className="w-3 h-3 mr-1" /> Tickets
                                      </Button>
                                    </a>
                                  )}
                                </div>
                              </div>
                              {evt.image_url && <img src={evt.image_url} alt={evt.title} className="w-20 h-20 rounded-lg object-cover hidden sm:block" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
