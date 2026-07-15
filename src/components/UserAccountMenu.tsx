import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, User, ChevronDown, Building2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';

interface UserAccountMenuProps {
  userId: string;
  /** Partner accounts get routed to their business dashboard instead of the general consumer profile. */
  isPartner?: boolean;
}

export function UserAccountMenu({ userId, isPartner = false }: UserAccountMenuProps) {
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initials, setInitials] = useState('');
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchAvatar = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, custom_avatar_url, provider_avatar_url, selected_avatar_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (profile) {
        const first = profile.first_name || '';
        const last = profile.last_name || '';
        setInitials((first.charAt(0) + last.charAt(0)).toUpperCase() || 'U');

        if (profile.custom_avatar_url) {
          setAvatarUrl(profile.custom_avatar_url);
        } else if (profile.selected_avatar_id) {
          const { data: avatar } = await supabase
            .from('avatars')
            .select('image_url')
            .eq('id', profile.selected_avatar_id)
            .single();
          if (!cancelled && avatar?.image_url) setAvatarUrl(avatar.image_url);
        } else if (profile.provider_avatar_url) {
          setAvatarUrl(profile.provider_avatar_url);
        }
      }

      if (!cancelled) setLoaded(true);

      // Fallback: try user metadata
      if (!cancelled) {
        const { data: { session } } = await supabase.auth.getSession();
        const meta = session?.user?.user_metadata;
        if (!cancelled && !avatarUrl && (meta?.avatar_url || meta?.picture)) {
          setAvatarUrl(meta.avatar_url || meta.picture);
        }
      }
    };
    fetchAvatar();
    return () => { cancelled = true; };
  }, [userId]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const isEmoji = avatarUrl ? avatarUrl.length <= 4 || /^\p{Emoji}/u.test(avatarUrl) : false;
  const showImage = avatarUrl && !isEmoji && !imgError;

  // Partner accounts get routed to their business dashboard, not the general
  // consumer profile — surfacing the consumer profile as the primary action
  // reads as wrong for a business account.
  const profilePath = isPartner ? '/partner-dashboard' : '/profile';
  const profileLabel = isPartner ? 'Business Profile' : 'Update Profile';

  return (
    <div className="flex items-center gap-2.5">
      <Button
        size="sm"
        onClick={(e) => { e.stopPropagation(); navigate(profilePath); }}
        className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-semibold rounded-full px-3.5 h-8 shadow-sm transition-all hover:shadow-md active:scale-95"
      >
        {isPartner ? <Building2 className="w-3.5 h-3.5 mr-1" /> : <Settings className="w-3.5 h-3.5 mr-1" />}
        {profileLabel}
      </Button>

      <Button
        size="sm"
        variant="destructive"
        onClick={(e) => { e.stopPropagation(); handleSignOut(); }}
        className="text-xs font-semibold rounded-full px-3.5 h-8 shadow-sm transition-all hover:shadow-md active:scale-95"
      >
        <LogOut className="w-3.5 h-3.5 mr-1" />
        Logout
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="relative rounded-full ring-2 ring-primary/20 hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all outline-none active:scale-95 z-10"
            aria-label="Account menu"
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar className="h-8 w-8">
              {showImage ? (
                <AvatarImage
                  src={avatarUrl!}
                  alt="Profile"
                  className="object-cover"
                  onError={() => setImgError(true)}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {isEmoji && avatarUrl ? (
                  <span className="text-lg leading-none">{avatarUrl}</span>
                ) : (
                  initials || 'U'
                )}
              </AvatarFallback>
            </Avatar>
            {/* Tiny online dot */}
            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-lg border-border/60">
          <DropdownMenuItem
            onClick={() => navigate(profilePath)}
            className="cursor-pointer rounded-lg focus:bg-primary/5"
          >
            {isPartner ? <Building2 className="w-4 h-4 mr-2 text-primary" /> : <User className="w-4 h-4 mr-2 text-primary" />}
            {isPartner ? 'Business Profile' : 'My Profile'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => navigate(profilePath)}
            className="cursor-pointer rounded-lg focus:bg-primary/5"
          >
            {isPartner ? <Building2 className="w-4 h-4 mr-2 text-primary" /> : <Settings className="w-4 h-4 mr-2 text-primary" />}
            {isPartner ? 'Partner Dashboard' : 'Update Profile'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSignOut}
            className="cursor-pointer rounded-lg text-destructive focus:text-destructive focus:bg-destructive/5"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
