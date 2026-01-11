import { motion } from 'framer-motion';
import { Search, Compass, MapPin } from 'lucide-react';

const steps = [
  {
    icon: Search,
    title: 'Search',
    description: 'Enter your city or ZIP code and choose a category that interests you.',
    color: 'bg-coral-light text-primary',
  },
  {
    icon: Compass,
    title: 'Discover',
    description: 'Browse curated events and activities happening near you.',
    color: 'bg-teal-light text-teal',
  },
  {
    icon: MapPin,
    title: 'Go',
    description: 'Get details, directions, and tickets — then enjoy your experience!',
    color: 'bg-secondary text-secondary-foreground',
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 px-4 bg-card">
      <div className="container mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
            How It Works
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Finding your next adventure is as easy as 1-2-3
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className="text-center"
            >
              <div
                className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${step.color} mb-5`}
              >
                <step.icon className="w-7 h-7" />
              </div>
              <div className="flex items-center justify-center gap-3 mb-3">
                <span className="text-sm font-medium text-muted-foreground">0{index + 1}</span>
                <h3 className="font-display text-xl font-semibold text-foreground">{step.title}</h3>
              </div>
              <p className="text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
