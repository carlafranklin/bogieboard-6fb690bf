import { motion } from 'framer-motion';
import { Menu, X, Search, MapPin, Building2, Shield } from 'lucide-react';
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
import { UserAccountMenu } from '@/components/UserAccountMenu';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPartner, setIsPartner] = useState(false);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const navigate = useNavigate();

  const [searchLocation, setSearchLocation] = useState('');

  useEffect(() => {
    let isActive = true;

    const resetRoles = () => {
      if (!isActive) return;
      setIsAdmin(false);
      setIsPartner(false);
      setRolesLoaded(false);
    };

    const loadRoles = async (uid: string) => {
      if (!isActive) return;
      setRolesLoaded(false);

      const [adminResult, partnerResult] = await Promise.all([
        supabase.rpc('has_role', { _user_id: uid, _role: 'admin' }),
        supabase.rpc('has_role', { _user_id: uid, _role: 'partner' }),
      ]);

      if (!adminResult.error && !partnerResult.error) {
        if (!isActive) return;
        setIsAdmin(!!adminResult.data);
        setIsPartner(!!partnerResult.data);
        setRolesLoaded(true);
        return;
      }

      const { data } = await supabase.from('user_roles').select('role').eq('user_id', uid);
      if (!isActive) return;
      setIsAdmin(data?.some((role) => role.role === 'admin') || false);
      setIsPartner(data?.some((role) => role.role === 'partner') || false);
      setRolesLoaded(true);
    };

    const syncAuthState = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => {
      if (!isActive) return;
      setIsLoggedIn(!!session);
      setUserId(session?.user?.id || null);

      if (session?.user?.id) {
        await loadRoles(session.user.id);
      } else {
        resetRoles();
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      await syncAuthState(session);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await syncAuthState(session);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
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
              <Link to="/" className="text-sm font-medium text-white hover:text-white/80 transition-colors">Home</Link>
              <Link to="/events" className="text-sm font-medium text-white hover:text-white/80 transition-colors">Events</Link>
              <Link to="/partner-member" className="text-sm font-medium text-white hover:text-white/80 transition-colors">Partner Member</Link>
            </nav>
          )}

          {/* Right side actions */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {isLoggedIn && userId ? (
              <>
                {isAdmin && (
                  <Link to="/admin">
                    <Button variant="outline" size="sm">
                      <Shield className="w-4 h-4 mr-2" />
                      Admin
                    </Button>
                  </Link>
                )}
                {isPartner && (
                  <Link to="/partner-dashboard">
                    <Button variant="outline" size="sm">
                      <Building2 className="w-4 h-4 mr-2" />
                      Partner
                    </Button>
                  </Link>
                )}
                <UserAccountMenu userId={userId} />
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
                  {isAdmin && (
                    <Link to="/admin" onClick={() => setIsMenuOpen(false)}>
                      <Button variant="outline" className="w-full">
                        <Shield className="w-4 h-4 mr-2" />Admin
                      </Button>
                    </Link>
                  )}
                  {isPartner && (
                    <Link to="/partner-dashboard" onClick={() => setIsMenuOpen(false)}>
                      <Button variant="outline" className="w-full">
                        <Building2 className="w-4 h-4 mr-2" />Partner Dashboard
                      </Button>
                    </Link>
                  )}
                  {/* Mobile account controls */}
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      onClick={() => { navigate('/profile'); setIsMenuOpen(false); }}
                      className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-semibold rounded-full h-9"
                    >
                      Update Profile
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
