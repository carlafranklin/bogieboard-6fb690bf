import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, MapPin, ExternalLink, Users, DollarSign, Tag, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { SaveEventButton } from './SaveEventButton';
import { format, parseISO } from 'date-fns';

interface CanonicalEvent {
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
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_zip: string | null;
  category_names: string[] | null;
  source_url: string | null;
  discount_info: string | null;
}

interface EventDetailModalProps {
  event: CanonicalEvent | null;
  onClose: () => void;
  userId?: string | null;
  isSaved?: boolean;
  onToggleSave?: () => void;
  saveLoading?: boolean;
}

// Category fallback images
const categoryFallbackImages: Record<string, string> = {
  'live-music': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&h=450&fit=crop',
  'festivals': 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&h=450&fit=crop',
  'business': 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=450&fit=crop',
  'bar-fun': 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800&h=450&fit=crop',
  'shopping': 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800&h=450&fit=crop',
  'family-kids': 'https://images.unsplash.com/photo-1484820540004-14229fe36ca4?w=800&h=450&fit=crop',
  'movies': 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&h=450&fit=crop',
  'religious-spiritual': 'https://images.unsplash.com/photo-1507692049790-de58290a4334?w=800&h=450&fit=crop',
  'sports-games': 'https://images.unsplash.com/photo-1461896836934-ber91080e9f?w=800&h=450&fit=crop',
  'lecture-series': 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&h=450&fit=crop',
  'political-events': 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&h=450&fit=crop',
  'arts-theater': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=450&fit=crop',
};

const defaultFallbackImage = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&h=450&fit=crop';

function getEventImage(event: CanonicalEvent): string {
  if (event.image_url) return event.image_url;
  const cats = event.category_names ?? [];
  for (const cat of cats) {
    const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (categoryFallbackImages[slug]) return categoryFallbackImages[slug];
  }
  return defaultFallbackImage;
}

export function EventDetailModal({ event, onClose, userId, isSaved = false, onToggleSave, saveLoading }: EventDetailModalProps) {
  if (!event) return null;

  const formattedDate = format(parseISO(event.start_time), 'EEEE, MMMM d, yyyy');
  const formattedTime = event.all_day ? 'All Day' : format(parseISO(event.start_time), 'h:mm a');
  const eventImage = getEventImage(event);

  const priceLabel = event.is_free
    ? 'Free'
    : event.price_min
      ? `$${Number(event.price_min)}${event.price_max && event.price_max !== event.price_min ? ` – $${Number(event.price_max)}` : ''}`
      : 'See details';

  // Build full address string
  const addressParts = [
    event.venue_address,
    event.venue_city,
    event.venue_state,
    event.venue_zip,
  ].filter(Boolean);
  const fullAddress = addressParts.join(', ');

  // Google Maps link
  const mapsQuery = encodeURIComponent(
    [event.venue_name, event.venue_address, event.venue_city, event.venue_state, event.venue_zip].filter(Boolean).join(', ')
  );
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="relative bg-card rounded-2xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-10 h-10 bg-background/90 backdrop-blur rounded-full flex items-center justify-center hover:bg-background transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Image Header */}
          <div className="aspect-video relative bg-muted">
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/30 to-transparent" />
            {event.category_names && event.category_names.length > 0 && (
              <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-1.5">
                {event.category_names.map((cat) => (
                  <CategoryBadge key={cat} category={cat} />
                ))}
              </div>
            )}
            <img
              src={eventImage}
              alt={event.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">
                  {event.title}
                </h2>
                {event.description_short && (
                  <p className="text-muted-foreground">{event.description_short}</p>
                )}
              </div>
              {onToggleSave && (
                <SaveEventButton
                  eventId={event.event_id}
                  isSaved={isSaved}
                  isLoggedIn={!!userId}
                  onToggle={onToggleSave}
                  loading={saveLoading}
                  size="sm"
                  className="shrink-0"
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-4 bg-muted rounded-xl">
                <Calendar className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium text-foreground">{formattedDate}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-muted rounded-xl">
                <Clock className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Time</p>
                  <p className="font-medium text-foreground">{formattedTime}</p>
                </div>
              </div>

              {event.venue_name && (
                <div className="flex items-start gap-3 p-4 bg-muted rounded-xl sm:col-span-2">
                  <MapPin className="w-5 h-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Location</p>
                    <p className="font-medium text-foreground">{event.venue_name}</p>
                    {fullAddress && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        {fullAddress} →
                      </a>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 p-4 bg-muted rounded-xl">
                <DollarSign className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="font-medium text-foreground">{priceLabel}</p>
                </div>
              </div>

              {event.discount_info && (
                <div className="flex items-start gap-3 p-4 bg-primary/10 rounded-xl border border-primary/20">
                  <Tag className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Deal / Discount</p>
                    <p className="font-medium text-primary">{event.discount_info}</p>
                  </div>
                </div>
              )}
            </div>

            {event.age_restriction && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">
                  Ages {event.age_restriction}+ only
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {event.ticket_url && (
                <Button
                  asChild
                  size="lg"
                  className="flex-1 bg-primary hover:bg-green-dark text-primary-foreground"
                >
                  <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {event.is_free ? 'Get Details' : 'Get Tickets'}
                  </a>
                </Button>
              )}
              {event.source_url && event.source_url !== event.ticket_url && (
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                >
                  <a href={event.source_url} target="_blank" rel="noopener noreferrer">
                    <Link2 className="w-4 h-4 mr-2" />
                    View Original Source
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                size="lg"
                onClick={onClose}
                className="sm:w-auto"
              >
                Back to Events
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
