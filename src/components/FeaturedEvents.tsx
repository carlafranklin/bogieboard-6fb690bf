import { motion } from 'framer-motion';
import { EventCard } from './EventCard';
import { mockEvents, Event } from '@/data/mockEvents';

interface FeaturedEventsProps {
  onViewDetails: (event: Event) => void;
}

export function FeaturedEvents({ onViewDetails }: FeaturedEventsProps) {
  const featuredEvents = mockEvents.slice(0, 4);

  return (
    <section className="py-20 px-4">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Popular Events Near You
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Check out what's trending in your area
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredEvents.map((event, index) => (
            <EventCard
              key={event.id}
              event={event}
              index={index}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
