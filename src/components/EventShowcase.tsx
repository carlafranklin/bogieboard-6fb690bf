import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import eventFestival from '@/assets/event-festival.jpg';
import eventFamily from '@/assets/event-family.jpg';
import eventTrivia from '@/assets/event-trivia.jpg';
import eventFood from '@/assets/event-food.jpg';
import eventFitness from '@/assets/event-fitness.jpg';

const suggestions = [
  {
    title: 'Live Music',
    description: 'Concerts, bands, and live performances near you.',
    image: eventFestival,
    slug: 'live-music',
  },
  {
    title: 'Family & Kids',
    description: 'Fun for the whole family — festivals, activities, and more.',
    image: eventFamily,
    slug: 'family-kids',
  },
  {
    title: 'Bar & Nightlife',
    description: 'Trivia nights, happy hours, and pub events.',
    image: eventTrivia,
    slug: 'bar-fun',
  },
  {
    title: 'Food & Drink',
    description: 'Food festivals, tastings, and culinary experiences.',
    image: eventFood,
    slug: 'shopping',
  },
  {
    title: 'Sports & Fitness',
    description: 'Outdoor fitness, runs, games, and athletic events.',
    image: eventFitness,
    slug: 'sports-games',
  },
  {
    title: 'Arts & Theater',
    description: 'Gallery openings, plays, comedy shows, and exhibitions.',
    image: eventFestival,
    slug: 'arts-theater',
  },
];

export function EventShowcase() {
  return (
    <section className="py-16 px-6">
      <div className="container mx-auto max-w-7xl">
        <motion.h2
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-8"
        >
          Suggestions
        </motion.h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {suggestions.map((item, index) => (
            <motion.div
              key={item.slug}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.07 }}
            >
              <Link
                to={`/events?category=${item.slug}`}
                className="group flex items-center gap-4 bg-muted/50 hover:bg-muted rounded-2xl p-5 transition-colors"
              >
                <div className="flex-1 space-y-1">
                  <h3 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                  <span className="inline-flex items-center text-sm font-medium text-foreground mt-2 group-hover:text-primary transition-colors">
                    Details
                    <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
                <div className="shrink-0 w-24 h-24 rounded-xl overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
