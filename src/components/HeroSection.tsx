import { motion } from 'framer-motion';
import { SearchModule, SearchParams } from './SearchModule';

interface HeroSectionProps {
  onSearch: (params: SearchParams) => void;
}

export function HeroSection({ onSearch }: HeroSectionProps) {
  return (
    <section className="relative min-h-[85vh] flex flex-col justify-center py-16 px-4 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-coral/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-teal/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-coral/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 bg-coral-light text-coral-dark px-4 py-2 rounded-full text-sm font-medium mb-6"
          >
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            Discover local experiences
          </motion.div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6 leading-tight">
            Find something to do
            <br />
            <span className="text-primary">near you — today</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Discover local events, activities, and experiences happening in your city.
            From family outings to nightlife adventures.
          </p>
        </motion.div>

        <SearchModule onSearch={onSearch} />
      </div>
    </section>
  );
}
