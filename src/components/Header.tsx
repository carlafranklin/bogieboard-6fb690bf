import { motion } from 'framer-motion';
import { Menu, X, User, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import bogieBoardLogo from '@/assets/bogieboard-logo-v3.png';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      setIsLoggedIn(!!session);
      if (session) {
        const { data } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id);
        setIsAdmin(data?.some(r => r.role === 'admin') || false);
      } else {
        setIsAdmin(false);
      }
    });
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setIsLoggedIn(!!session);
      if (session) {
        const { data } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id);
        setIsAdmin(data?.some(r => r.role === 'admin') || false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border"
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <img src={bogieBoardLogo} alt="BogieBoard" className="h-10 w-auto object-contain" />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Home</Link>
            <Link to="/events" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Events</Link>
            {!isLoggedIn && (
              <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
            )}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            {isLoggedIn ? (
              <>
                {isAdmin && (
                  <Link to="/admin">
                    <Button variant="outline" size="sm">
                      <Shield className="w-4 h-4 mr-2" />
                      Admin
                    </Button>
                  </Link>
                )}
                <Link to="/profile">
                  <Button variant="outline" size="sm">
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </Button>
                </Link>
              </>
            ) : (
              <Link to="/auth">
                <Button className="bg-primary hover:bg-green-dark text-primary-foreground">Sign In</Button>
              </Link>
            )}
          </div>

          <button className="md:hidden p-2" onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Toggle menu">
            {isMenuOpen ? <X className="w-6 h-6 text-foreground" /> : <Menu className="w-6 h-6 text-foreground" />}
          </button>
        </div>

        {isMenuOpen && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden py-4 border-t border-border"
          >
            <div className="flex flex-col gap-4">
              <Link to="/" className="text-sm font-medium text-foreground" onClick={() => setIsMenuOpen(false)}>Home</Link>
              <Link to="/events" className="text-sm font-medium text-foreground" onClick={() => setIsMenuOpen(false)}>Events</Link>
              {!isLoggedIn && (
                <a href="#how-it-works" className="text-sm font-medium text-foreground" onClick={() => setIsMenuOpen(false)}>How It Works</a>
              )}
              {isLoggedIn ? (
                <>
                  {isAdmin && (
                    <Link to="/admin" onClick={() => setIsMenuOpen(false)}>
                      <Button variant="outline" className="w-full">
                        <Shield className="w-4 h-4 mr-2" />Admin
                      </Button>
                    </Link>
                  )}
                  <Link to="/profile" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full">
                      <User className="w-4 h-4 mr-2" />Profile
                    </Button>
                  </Link>
                </>
              ) : (
                <Link to="/auth" onClick={() => setIsMenuOpen(false)}>
                  <Button className="bg-primary hover:bg-green-dark text-primary-foreground w-full mt-2">Sign In</Button>
                </Link>
              )}
            </div>
          </motion.nav>
        )}
      </div>
    </motion.header>
  );
}
