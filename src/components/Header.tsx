import { motion } from 'framer-motion';
import { Menu, X, Search, MapPin, Shield } from 'lucide-react';
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
import { useDiscoverableMetros } from '@/hooks/useDiscoverableMetros';
import { UserAccountMenu } from '@/components/UserAccountMenu';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOps, setIsOps] = useState(false);
  const [isPartner, setIsPartner] = useState(false);
  const navigate = useNavigate();

  const [searchLocation, setSearchLocation] = useState('');
  const { metros, loading: metrosLoading, error: metrosError } = useDiscoverableMetros();

  useEffect(() => {
    const loadRoles = (uid: string) => {
      // Fire-and-forget: never await inside onAuthStateChange to avoid deadlocking the auth client
      supabase.rpc('has_role', { _user_id: uid, _role: 'admin' }).then(({ data, error }) => {
        console.log('[Header] has_role admin for', uid, ':', data, error);
        setIsAdmin(data === true);
      });

      supabase.rpc('has_role', { _user_id: uid, _role: 'partner' }).then(({ data, error }) => {
        console.log('[Header] has_role partner for', uid, ':', data, error);
        setIsPartner(data === true);
      });

      // Cast: 'ops' isn't in the generated app_role enum type yet (added by a
      // later migration, generated types not regenerated) — same pre-existing
      // generated-types gap already noted in Admin.tsx.
      (supabase.rpc as any)('has_role', { _user_id: uid, _role: 'ops' }).then(({ data, error }: { data: boolean | null; error: unknown }) => {
        console.log('[Header] has_role ops for', uid, ':', data, error);
        setIsOps(data === true);
      });
    };

    // Non-async callback prevents auth client deadlock
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
      setUserId(session?.user?.id || null);
      if (session) loadRoles(session.user.id);
      else { setIsAdmin(false); setIsOps(false); setIsPartner(false); }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
      setUserId(session?.user?.id || null);
      if (session) loadRoles(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleInlineSearch = () => {
    const params = new URLSearchParams();
    if (searchLocation && searchLocation !== 'all') params.set('location', searchLocation);
    navigate(`/events?${params.toString()}`);
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed top-0 left-0 right-0 z-50 bg-secondary backdrop-blur-md border-b border-secondary"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img
              src={bogieBoardLogo}
              alt="BogieBoard"
              className={isLoggedIn ? "h-8 w-auto object-contain" : "h-10 w-auto object-contain"}
            />
          </Link>

          {/* Inline search for logged-in users (desktop) */}
          {isLoggedIn && (
            <div className="hidden md:flex items-center gap-2 flex-1 max-w-md mx-4">
              <Select value={searchLocation} onValueChange={setSearchLocation}>
                <SelectTrigger className="w-[160px] h-9 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground mr-1 shrink-0" />
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {metrosLoading ? (
                    <SelectItem value="__loading" disabled>Loading locations…</SelectItem>
                  ) : metrosError ? (
                    <SelectItem value="__error" disabled>Locations unavailable</SelectItem>
                  ) : (
                    metros.map((metro) => (
                      <SelectItem key={metro.value} value={metro.value}>
                        {metro.label}
                      </SelectItem>
                    ))
                  )}
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
              <Link to="/" className="text-sm font-medium text-white hover:text-white/80 transition-colors">Home</Link>
              <Link to="/events" className="text-sm font-medium text-white hover:text-white/80 transition-colors">Events</Link>
              <Link to="/partner-member" className="text-sm font-medium text-white hover:text-white/80 transition-colors">Partner Member</Link>
            </nav>
          )}

          {/* Right side actions */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {isLoggedIn && userId ? (
              <>
                <Link to="/events" className="text-sm font-medium text-white hover:text-white/80 transition-colors mr-2">
                  Events
                </Link>
                {(isAdmin || isOps) && (
                  <Link to="/admin">
                    <Button variant="outline" size="sm">
                      <Shield className="w-4 h-4 mr-2" />
                      Admin
                    </Button>
                  </Link>
                )}
                {/* No separate "Partner" link here — UserAccountMenu's "Business Profile"
                    action already routes partners to /partner-dashboard, so a standalone
                    link would just be a second button pointing at the same place. */}
                <UserAccountMenu userId={userId} isPartner={isPartner} />
              </>
            ) : (
              <Link to="/auth">
                <Button className="bg-accent text-accent-foreground hover:bg-accent/90 text-sm font-medium rounded-full px-5">Sign up / in</Button>
              </Link>
            )}
          </div>

          <button className="md:hidden p-2" onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Toggle menu">
            {isMenuOpen ? <X className="w-6 h-6 text-white" /> : <Menu className="w-6 h-6 text-white" />}
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
              {isLoggedIn && userId ? (
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
                        {metrosLoading ? (
                          <SelectItem value="__loading" disabled>Loading locations…</SelectItem>
                        ) : metrosError ? (
                          <SelectItem value="__error" disabled>Locations unavailable</SelectItem>
                        ) : (
                          metros.map((metro) => (
                            <SelectItem key={metro.value} value={metro.value}>
                              {metro.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => { handleInlineSearch(); setIsMenuOpen(false); }} className="bg-primary hover:bg-green-dark text-primary-foreground h-9">
                      <Search className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <Link to="/events" className="text-sm font-medium text-white" onClick={() => setIsMenuOpen(false)}>Events</Link>
                  {(isAdmin || isOps) && (
                    <Link to="/admin" onClick={() => setIsMenuOpen(false)}>
                      <Button variant="outline" className="w-full">
                        <Shield className="w-4 h-4 mr-2" />Admin
                      </Button>
                    </Link>
                  )}
                  {/* No separate "Partner Dashboard" link here — the "Business Profile"
                      button below already routes partners to /partner-dashboard. */}
                  {/* Mobile account controls */}
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      onClick={() => { navigate(isPartner ? '/partner-dashboard' : '/profile'); setIsMenuOpen(false); }}
                      className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-semibold rounded-full h-9"
                    >
                      {isPartner ? 'Business Profile' : 'Update Profile'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => { await supabase.auth.signOut(); navigate('/'); setIsMenuOpen(false); }}
                      className="flex-1 text-xs font-semibold rounded-full h-9"
                    >
                      Logout
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Link to="/" className="text-sm font-medium text-white" onClick={() => setIsMenuOpen(false)}>Home</Link>
                  <Link to="/events" className="text-sm font-medium text-white" onClick={() => setIsMenuOpen(false)}>Events</Link>
                  <Link to="/partner-member" className="text-sm font-medium text-white" onClick={() => setIsMenuOpen(false)}>Partner Member</Link>
                  <Link to="/auth" onClick={() => setIsMenuOpen(false)}>
                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground w-full mt-2">Sign up / in</Button>
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
