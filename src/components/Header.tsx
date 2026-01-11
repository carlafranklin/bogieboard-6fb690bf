import { motion } from 'framer-motion';
import { MapPin, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Link } from 'react-router-dom';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border"
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <MapPin className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold text-foreground">BogieBoard</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Home
            </Link>
            <Link to="/events" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Events
            </Link>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </a>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:block">
            <Button className="bg-primary hover:bg-coral-dark text-primary-foreground">
              Get Started
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? (
              <X className="w-6 h-6 text-foreground" />
            ) : (
              <Menu className="w-6 h-6 text-foreground" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden py-4 border-t border-border"
          >
            <div className="flex flex-col gap-4">
              <Link to="/" className="text-sm font-medium text-foreground" onClick={() => setIsMenuOpen(false)}>
                Home
              </Link>
              <Link to="/events" className="text-sm font-medium text-foreground" onClick={() => setIsMenuOpen(false)}>
                Events
              </Link>
              <a href="#how-it-works" className="text-sm font-medium text-foreground" onClick={() => setIsMenuOpen(false)}>
                How It Works
              </a>
              <Button className="bg-primary hover:bg-coral-dark text-primary-foreground w-full mt-2">
                Get Started
              </Button>
            </div>
          </motion.nav>
        )}
      </div>
    </motion.header>
  );
}
