import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, MapPin, ExternalLink, Users, DollarSign } from 'lucide-react';
import { Event, categoryLabels } from '@/data/mockEvents';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';

interface EventDetailModalProps {
  event: Event | null;
  onClose: () => void;
}

export function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  if (!event) return null;

  const formattedDate = format(parseISO(event.date), 'EEEE, MMMM d, yyyy');

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="relative bg-card rounded-2xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
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
            <div className="absolute bottom-4 left-4">
              <CategoryBadge category={event.category} />
            </div>
            <div className="w-full h-full bg-gradient-to-br from-coral/30 to-teal/30 flex items-center justify-center">
              <span className="text-6xl">🎉</span>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">
                {event.title}
              </h2>
              <p className="text-muted-foreground">{event.description}</p>
            </div>

            {/* Details Grid */}
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
                  <p className="font-medium text-foreground">{event.time}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-muted rounded-xl">
                <MapPin className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p className="font-medium text-foreground">{event.venue}</p>
                  {event.address && (
                    <p className="text-sm text-muted-foreground">{event.address}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{event.city}, {event.state} {event.zipCode}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-muted rounded-xl">
                <DollarSign className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="font-medium text-foreground">
                    {event.isFree ? 'Free' : `$${event.price}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Age Restriction */}
            {event.ageRestriction && (
              <div className="flex items-center gap-2 p-3 bg-coral-light rounded-lg">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-coral-dark">
                  Ages {event.ageRestriction}+ only
                </span>
              </div>
            )}

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                asChild
                size="lg"
                className="flex-1 bg-primary hover:bg-coral-dark text-primary-foreground"
              >
                <a href={event.ticketUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {event.isFree ? 'Get Details' : 'Get Tickets'}
                </a>
              </Button>
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
