import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, User } from 'lucide-react';
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
}

export function UserAccountMenu({ userId }: UserAccountMenuProps) {
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [initials, setInitials] = useState('');

  useEffect(() => {
    const fetchAvatar = async () => {
      // Get profile data for avatar
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, custom_avatar_url, provider_avatar_url, selected_avatar_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (profile) {
        const first = profile.first_name || '';
        const last = profile.last_name || '';
        setInitials(
          (first.charAt(0) + last.charAt(0)).toUpperCase() || 'U'
        );

        // Image precedence: custom upload > selected avatar > provider > placeholder
        if (profile.custom_avatar_url) {
          setAvatarUrl(profile.custom_avatar_url);
        } else if (profile.selected_avatar_id) {
          const { data: avatar } = await supabase
            .from('avatars')
            .select('image_url')
            .eq('id', profile.selected_avatar_id)
            .single();
          if (avatar?.image_url) setAvatarUrl(avatar.image_url);
        } else if (profile.provider_avatar_url) {
          setAvatarUrl(profile.provider_avatar_url);
        }
      }

      // Fallback: try user metadata
      if (!avatarUrl) {
        const { data: { session } } = await supabase.auth.getSession();
        const meta = session?.user?.user_metadata;
        if (meta?.avatar_url || meta?.picture) {
          setAvatarUrl(meta.avatar_url || meta.picture);
        }
      }
    };
    fetchAvatar();
  }, [userId]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={() => navigate('/profile')}
        className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-semibold rounded-full px-3 h-8"
      >
        <Settings className="w-3.5 h-3.5 mr-1" />
        Update Profile
      </Button>

      <Button
        size="sm"
        variant="destructive"
        onClick={handleSignOut}
        className="text-xs font-semibold rounded-full px-3 h-8"
      >
        <LogOut className="w-3.5 h-3.5 mr-1" />
        Logout
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded-full ring-2 ring-primary/20 hover:ring-primary/50 transition-all focus:outline-none">
            <Avatar className="h-8 w-8">
              {avatarUrl && !avatarUrl.startsWith('�') ? (
                <AvatarImage src={avatarUrl} alt="Profile" />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {avatarUrl?.startsWith('�') ? avatarUrl : initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <User className="w-4 h-4 mr-2" />
            My Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <Settings className="w-4 h-4 mr-2" />
            Update Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
            <LogOut className="w-4 h-4 mr-2" />
            Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
