import { motion } from 'framer-motion';
import { SearchModule, SearchParams } from './SearchModule';
import bogieBoardLogo from '@/assets/bogieboard-logo-v3.png';
import eventFestival from '@/assets/event-festival.jpg';

interface HeroSectionProps {
  onSearch: (params: SearchParams) => void;
}

export function HeroSection({ onSearch }: HeroSectionProps) {
  return (
    <section className="relative min-h-[85vh] flex items-center overflow-hidden bg-card">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-card via-card to-green-light/30" />
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-yellow-light/40 to-transparent" />

      <div className="container mx-auto max-w-7xl px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Content + Search */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <motion.img
              src={bogieBoardLogo}
              alt="BogieBoard"
              className="h-28 sm:h-36 w-auto object-contain"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            />

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
              Discover what's
              <br />
              <span className="text-primary">happening</span> near <span className="text-secondary">you</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-md">
              Local events, activities, and experiences — all in one place. Find your next adventure.
            </p>

            {/* Search Module */}
            <div className="pt-2">
              <SearchModule onSearch={onSearch} variant="hero" />
            </div>
          </motion.div>

          {/* Right: Featured imagery (hidden on mobile) */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="hidden lg:block"
          >
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-primary/30 to-accent/30 rounded-3xl blur-2xl" />
              <img
                src={eventFestival}
                alt="Festival events"
                className="relative rounded-2xl shadow-2xl w-full aspect-[4/3] object-cover"
              />
              <div className="absolute bottom-4 left-4 right-4 bg-card/90 backdrop-blur-md rounded-xl p-4 shadow-lg">
                <p className="text-sm font-semibold text-foreground">🎉 1,200+ events this month</p>
                <p className="text-xs text-muted-foreground mt-0.5">Across Charlotte, Raleigh, and Greensboro</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
