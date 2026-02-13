import { motion } from 'framer-motion';
import { SearchModule, SearchParams } from './SearchModule';
import bogieBoardLogo from '@/assets/bogieboard-logo.png';

interface HeroSectionProps {
  onSearch: (params: SearchParams) => void;
}

export function HeroSection({ onSearch }: HeroSectionProps) {
  return (
    <section className="relative flex flex-col justify-center pt-4 pb-4 px-4 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-10 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-3"
        >
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex justify-center mb-2"
          >
            <img 
              src={bogieBoardLogo} 
              alt="BogieBoard" 
              className="h-48 sm:h-64 md:h-80 w-auto object-contain"
            />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto mb-1"
          >
            Discover local events, activities, and experiences happening near you
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <SearchModule onSearch={onSearch} />
        </motion.div>
      </div>
    </section>
  );
}
