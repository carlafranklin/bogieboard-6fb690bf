import { motion } from 'framer-motion';
import { Menu, X, User, Shield, Search, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import bogieBoardLogo from '@/assets/bogieboard-logo-v3.png';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { metroAreas } from '@/data/metroAreas';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  // Inline search state
  const [searchLocation, setSearchLocation] = useState('');
  const [searchCategory, setSearchCategory] = useState('all');

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

  const handleInlineSearch = () => {
    const params = new URLSearchParams();
    if (searchLocation && searchLocation !== 'all') params.set('location', searchLocation);
    if (searchCategory && searchCategory !== 'all') params.set('category', searchCategory);
    navigate(`/events?${params.toString()}`);
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed top-0 left-0 right-0 z-50 bg-slate/90 backdrop-blur-md border-b border-white/10"
    >
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo - smaller when logged in */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img
              src={bogieBoardLogo}
              alt="BogieBoard"
              className={isLoggedIn ? "h-8 w-auto object-contain" : "h-10 w-auto object-contain"}
            />
          </Link>

          {/* Inline search for logged-in users (desktop) */}
          {isLoggedIn && (
            <div className="hidden md:flex items-center gap-2 flex-1 max-w-xl mx-4">
              <Select value={searchLocation} onValueChange={setSearchLocation}>
                <SelectTrigger className="w-[160px] h-9 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground mr-1 shrink-0" />
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {metroAreas.map((metro) => (
                    <SelectItem key={metro.value} value={metro.value}>
                      {metro.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleInlineSearch}
                className="bg-primary hover:bg-green-dark text-primary-foreground h-9"
              >
                <Search className="w-3.5 h-3.5 mr-1" />
                Search
              </Button>
            </div>
          )}

          {/* Nav links for non-logged-in */}
          {!isLoggedIn && (
            <nav className="hidden md:flex items-center gap-8">
              <Link to="/" className="text-sm font-medium text-white/70 hover:text-white transition-colors">Home</Link>
              <Link to="/events" className="text-sm font-medium text-white/70 hover:text-white transition-colors">Events</Link>
              <a href="#how-it-works" className="text-sm font-medium text-white/70 hover:text-white transition-colors">How It Works</a>
            </nav>
          )}

          {/* Right side actions */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {isLoggedIn ? (
              <>
                <Link to="/events" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mr-2">
                  Events
                </Link>
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
              <div className="flex items-center gap-3">
                <Link to="/auth">
                  <Button variant="ghost" className="text-white hover:bg-white/10 text-sm">Log in</Button>
                </Link>
                <Link to="/auth">
                  <Button className="bg-white text-slate hover:bg-white/90 text-sm font-medium rounded-full px-5">Sign up</Button>
                </Link>
              </div>
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
              {isLoggedIn ? (
                <>
                  {/* Mobile inline search */}
                  <div className="flex gap-2">
                    <Select value={searchLocation} onValueChange={setSearchLocation}>
                      <SelectTrigger className="flex-1 h-9 text-sm">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground mr-1" />
                        <SelectValue placeholder="Location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Locations</SelectItem>
                        {metroAreas.map((metro) => (
                          <SelectItem key={metro.value} value={metro.value}>
                            {metro.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => { handleInlineSearch(); setIsMenuOpen(false); }} className="bg-primary hover:bg-green-dark text-primary-foreground h-9">
                      <Search className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <Link to="/events" className="text-sm font-medium text-foreground" onClick={() => setIsMenuOpen(false)}>Events</Link>
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
                <>
                  <Link to="/" className="text-sm font-medium text-foreground" onClick={() => setIsMenuOpen(false)}>Home</Link>
                  <Link to="/events" className="text-sm font-medium text-foreground" onClick={() => setIsMenuOpen(false)}>Events</Link>
                  <a href="#how-it-works" className="text-sm font-medium text-foreground" onClick={() => setIsMenuOpen(false)}>How It Works</a>
                  <Link to="/auth" onClick={() => setIsMenuOpen(false)}>
                    <Button className="bg-primary hover:bg-green-dark text-primary-foreground w-full mt-2">Sign In</Button>
                  </Link>
                </>
              )}
            </div>
          </motion.nav>
        )}
      </div>
    </motion.header>
  );
}
