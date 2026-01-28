import { motion } from 'framer-motion';
import eventFestival from '@/assets/event-festival.jpg';
import eventFamily from '@/assets/event-family.jpg';
import eventTrivia from '@/assets/event-trivia.jpg';
import eventFood from '@/assets/event-food.jpg';
import eventFitness from '@/assets/event-fitness.jpg';

const showcaseEvents = [
  {
    id: 1,
    image: eventFestival,
    title: 'Music Festivals',
    category: 'Outdoor Events',
  },
  {
    id: 2,
    image: eventFamily,
    title: 'Family Fun',
    category: 'Family Friendly',
  },
  {
    id: 3,
    image: eventTrivia,
    title: 'Pub Trivia',
    category: 'Nightlife',
  },
  {
    id: 4,
    image: eventFood,
    title: 'Food Festivals',
    category: 'Food & Drink',
  },
  {
    id: 5,
    image: eventFitness,
    title: 'Outdoor Fitness',
    category: 'Athletic',
  },
];

export function EventShowcase() {
  return (
    <section className="py-12 px-4 bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Events Happening <span className="text-primary">Everywhere</span>
          </h2>
          <p className="text-muted-foreground text-base max-w-lg mx-auto">
            From festivals to trivia nights, find your next adventure
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {showcaseEvents.map((event, index) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group relative aspect-[4/5] rounded-xl overflow-hidden cursor-pointer shadow-card hover:shadow-card-hover transition-shadow"
            >
              <img
                src={event.image}
                alt={event.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate/90 via-slate/40 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <span className="inline-block px-2 py-0.5 bg-accent text-accent-foreground text-xs font-medium rounded-full mb-1">
                  {event.category}
                </span>
                <h3 className="font-display text-sm sm:text-base font-semibold text-white">
                  {event.title}
                </h3>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
