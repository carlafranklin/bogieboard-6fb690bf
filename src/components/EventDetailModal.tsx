import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, MapPin, ExternalLink, Users, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  venue_city: string | null;
  venue_state: string | null;
  venue_zip: string | null;
  category_names: string[] | null;
}

interface EventDetailModalProps {
  event: CanonicalEvent | null;
  onClose: () => void;
}

export function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  if (!event) return null;

  const formattedDate = format(parseISO(event.start_time), 'EEEE, MMMM d, yyyy');
  const formattedTime = event.all_day ? 'All Day' : format(parseISO(event.start_time), 'h:mm a');

  const priceLabel = event.is_free
    ? 'Free'
    : event.price_min
      ? `$${Number(event.price_min)}${event.price_max && event.price_max !== event.price_min ? ` – $${Number(event.price_max)}` : ''}`
      : 'See details';

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
            {event.category_names?.[0] && (
              <div className="absolute bottom-4 left-4 z-10">
                <span className="bg-accent text-accent-foreground text-xs font-medium px-2.5 py-1 rounded-full">
                  {event.category_names[0]}
                </span>
              </div>
            )}
            {event.image_url ? (
              <img
                src={event.image_url}
                alt={event.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                <span className="text-6xl">🎉</span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">
                {event.title}
              </h2>
              {event.description_short && (
                <p className="text-muted-foreground">{event.description_short}</p>
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
                <div className="flex items-start gap-3 p-4 bg-muted rounded-xl">
                  <MapPin className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Location</p>
                    <p className="font-medium text-foreground">{event.venue_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {[event.venue_city, event.venue_state, event.venue_zip].filter(Boolean).join(', ')}
                    </p>
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
