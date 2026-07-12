import { motion } from 'framer-motion';
import { Calendar, MapPin, Clock } from 'lucide-react';
import { Event } from '@/data/mockEvents';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { getPriceDisplay } from '@/lib/priceDisplay';

interface EventCardProps {
  event: Event;
  index: number;
  onViewDetails: (event: Event) => void;
}

export function EventCard({ event, index, onViewDetails }: EventCardProps) {
  const formattedDate = format(parseISO(event.date), 'EEE, MMM d');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="group bg-card rounded-xl overflow-hidden card-hover cursor-pointer"
      onClick={() => onViewDetails(event)}
    >
      <div className="aspect-[16/10] relative overflow-hidden bg-muted">
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent z-10" />
        <div className="absolute top-3 left-3 z-20">
          <CategoryBadge category={event.category} />
        </div>
        {event.isFree && (
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
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span>{formattedDate}</span>
            <Clock className="w-4 h-4 text-primary ml-2" />
            <span>{event.time}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="line-clamp-1">{event.venue}, {event.city}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {(() => {
            const price = getPriceDisplay({ is_free: event.isFree, price_min: event.price, price_max: event.price });
            return (
              <span className={`font-semibold ${price.isFree ? 'text-primary' : 'text-foreground'}`}>
                {price.label}
              </span>
            );
          })()}
          <Button
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary hover:bg-green-light"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(event);
            }}
          >
            View Details
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
