import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Save, Plus, Trash2, Camera, MapPin, Home, Star, Upload,
  Heart, ChevronRight, Check, X, Sparkles, Calendar
} from 'lucide-react';
import { getSafeErrorMessage } from '@/lib/errorUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import type { Json } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;
type AvatarRow = Tables<'avatars'>;

const EVENT_INTERESTS = [
  { id: 'family-kids', label: 'Family & Kids', icon: '👨‍👩‍👧‍👦' },
  { id: 'live-music', label: 'Live Music', icon: '🎵' },
  { id: 'sports-games', label: 'Sports', icon: '🏟️' },
  { id: 'bar-fun', label: 'Food & Drink', icon: '🍽️' },
  { id: 'arts-theater', label: 'Arts & Theater', icon: '🎭' },
  { id: 'festivals', label: 'Festivals', icon: '🎪' },
  { id: 'business', label: 'Business', icon: '💼' },
  { id: 'movies', label: 'Movies', icon: '🎬' },
  { id: 'lecture-series', label: 'Learning', icon: '📚' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️' },
  { id: 'religious-spiritual', label: 'Spiritual', icon: '🙏' },
  { id: 'political-events', label: 'Community', icon: '🏛️' },
];

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: 'easeOut' },
  }),
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [avatars, setAvatars] = useState<AvatarRow[]>([]);
  const [showAvatarGallery, setShowAvatarGallery] = useState(false);
  const [favoriteCities, setFavoriteCities] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [newCity, setNewCity] = useState('');
  const [savedEvents, setSavedEvents] = useState<any[]>([]);
  const [memberSince, setMemberSince] = useState<string>('');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) navigate('/auth');
      else {
        setUserId(session.user.id);
        const created = session.user.created_at;
        if (created) {
          setMemberSince(new Date(created).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
        }
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate('/auth');
      else {
        setUserId(session.user.id);
        const created = session.user.created_at;
        if (created) {
          setMemberSince(new Date(created).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;
    const fetchAll = async () => {
      setLoading(true);
      const [profileRes, avatarsRes, savedRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', userId).single(),
        supabase.from('avatars').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('saved_events').select('canonical_event_id, canonical_events(id, title, image_url, start_time)').eq('user_id', userId).order('saved_at', { ascending: false }).limit(10),
      ]);
      if (profileRes.data) {
        setProfile(profileRes.data);
        setFavoriteCities(
          Array.isArray(profileRes.data.favorite_cities)
            ? (profileRes.data.favorite_cities as string[])
            : []
        );
        const rawInterests = (profileRes.data as any).interests;
        setInterests(Array.isArray(rawInterests) ? rawInterests : []);
      }
      if (avatarsRes.data) setAvatars(avatarsRes.data);
      if (savedRes.data) setSavedEvents(savedRes.data.filter((e: any) => e.canonical_events));
      setLoading(false);
    };
    fetchAll();
  }, [userId]);

  const getAvatarUrl = (): string | null => {
    if (profile.custom_avatar_url) return profile.custom_avatar_url;
    if (profile.selected_avatar_id) {
      const a = avatars.find(av => av.id === profile.selected_avatar_id);
      if (a?.image_url) return a.image_url;
    }
    if (profile.provider_avatar_url) return profile.provider_avatar_url;
    return null;
  };

  const avatarUrl = getAvatarUrl();
  const initials = ((profile.first_name?.charAt(0) || '') + (profile.last_name?.charAt(0) || '')).toUpperCase() || 'U';
  const isEmojiAvatar = avatarUrl ? avatarUrl.length <= 4 || /^\p{Emoji}/u.test(avatarUrl) : false;
  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');

  const handleSaveProfile = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
        phone: profile.phone || null,
        address: profile.address || null,
        date_of_birth: profile.date_of_birth || null,
        gender: profile.gender || null,
        marital_status: profile.marital_status || null,
        hometown: profile.hometown || null,
        favorite_cities: favoriteCities as unknown as Json,
        interests: interests as unknown as Json,
      } as any)
      .eq('user_id', userId);
    setSaving(false);
    if (error) {
      toast.error('Error saving profile', { description: getSafeErrorMessage(error) });
    } else {
      toast.success('Profile saved successfully!');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${userId}/profile.${ext}`;
    const { error: uploadError } = await supabase.storage.from('profile-photos').upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error('Upload failed', { description: getSafeErrorMessage(uploadError) });
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('profile-photos').getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;
    await supabase.from('profiles').update({ custom_avatar_url: url, selected_avatar_id: null }).eq('user_id', userId);
    setProfile(prev => ({ ...prev, custom_avatar_url: url, selected_avatar_id: null }));
    setUploading(false);
    toast.success('Photo updated!');
  };

  const handleRemovePhoto = async () => {
    if (!userId) return;
    await supabase.from('profiles').update({ custom_avatar_url: null, selected_avatar_id: null }).eq('user_id', userId);
    setProfile(prev => ({ ...prev, custom_avatar_url: null, selected_avatar_id: null }));
    toast.success('Photo removed');
  };

  const handleSelectAvatar = async (avatar: AvatarRow) => {
    if (!userId) return;
    await supabase.from('profiles').update({ selected_avatar_id: avatar.id, custom_avatar_url: null }).eq('user_id', userId);
    setProfile(prev => ({ ...prev, selected_avatar_id: avatar.id, custom_avatar_url: null }));
    setShowAvatarGallery(false);
    toast.success(`Avatar set to ${avatar.avatar_name}!`);
  };

  const handleAddCity = () => {
    const city = newCity.trim();
    if (city && favoriteCities.length < 3 && !favoriteCities.includes(city)) {
      setFavoriteCities([...favoriteCities, city]);
      setNewCity('');
    }
  };

  const toggleInterest = (id: string) => {
    setInterests(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16 px-4 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
            <p className="text-muted-foreground text-sm">Loading your profile…</p>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-20 pb-16 px-4">
        <div className="container mx-auto max-w-2xl">

          {/* ─── PROFILE HEADER ─── */}
          <motion.section
            custom={0}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className="relative mb-8"
          >
            {/* Gradient banner */}
            <div className="h-28 sm:h-32 rounded-t-2xl bg-gradient-to-br from-primary/80 via-secondary/60 to-accent/70" />
            <div className="bg-card rounded-b-2xl border border-t-0 border-border shadow-sm px-5 pb-5 -mt-px">
              {/* Avatar overlapping banner */}
              <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 -mt-12 sm:-mt-14">
                <div className="relative group shrink-0">
                  <Avatar className="h-24 w-24 sm:h-28 sm:w-28 ring-4 ring-card shadow-lg">
                    {avatarUrl && !isEmojiAvatar ? (
                      <AvatarImage src={avatarUrl} alt="Profile" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl sm:text-3xl font-bold">
                      {isEmojiAvatar && avatarUrl ? <span className="text-4xl">{avatarUrl}</span> : initials}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 rounded-full bg-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    aria-label="Upload photo"
                  >
                    <Camera className="w-6 h-6 text-white" />
                  </button>
                </div>
                <div className="text-center sm:text-left flex-1 pb-1">
                  <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground leading-tight">
                    {displayName || 'Your Profile'}
                  </h1>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                  {memberSince && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 justify-center sm:justify-start">
                      <Calendar className="w-3 h-3" /> Member since {memberSince}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </motion.section>

          {/* ─── PROFILE PHOTO / AVATAR ─── */}
          <motion.section custom={1} variants={sectionVariants} initial="hidden" animate="visible" className="bg-card rounded-2xl border border-border shadow-sm p-5 mb-5">
            <h2 className="font-display text-base font-semibold text-foreground mb-3 flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" /> Profile Photo
            </h2>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rounded-full">
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {uploading ? 'Uploading…' : 'Upload Photo'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAvatarGallery(true)} className="rounded-full">
                🐾 Choose Avatar
              </Button>
              {(profile.custom_avatar_url || profile.selected_avatar_id) && (
                <Button variant="ghost" size="sm" onClick={handleRemovePhoto} className="rounded-full text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
                </Button>
              )}
            </div>
            {!avatarUrl && (
              <p className="text-sm text-muted-foreground mt-3 italic">
                Add a profile photo or choose a fun state-animal avatar to personalize your account.
              </p>
            )}
          </motion.section>

          {/* ─── PERSONAL INFORMATION ─── */}
          <motion.section custom={2} variants={sectionVariants} initial="hidden" animate="visible" className="bg-card rounded-2xl border border-border shadow-sm p-5 mb-5">
            <h2 className="font-display text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Personal Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">First Name</Label>
                <Input value={profile.first_name || ''} onChange={e => setProfile({ ...profile, first_name: e.target.value })} placeholder="First name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Last Name</Label>
                <Input value={profile.last_name || ''} onChange={e => setProfile({ ...profile, last_name: e.target.value })} placeholder="Last name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Email</Label>
                <Input value={profile.email || ''} readOnly className="bg-muted/50 cursor-default" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Phone</Label>
                <Input value={profile.phone || ''} onChange={e => setProfile({ ...profile, phone: e.target.value })} placeholder="(555) 123-4567" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Date of Birth</Label>
                <Input type="date" value={profile.date_of_birth || ''} onChange={e => setProfile({ ...profile, date_of_birth: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Gender</Label>
                <Select value={profile.gender || ''} onValueChange={v => setProfile({ ...profile, gender: v as any })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="nonbinary">Non-Binary</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.section>

          {/* ─── LOCATION & PREFERENCES ─── */}
          <motion.section custom={3} variants={sectionVariants} initial="hidden" animate="visible" className="bg-card rounded-2xl border border-border shadow-sm p-5 mb-5">
            <h2 className="font-display text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Location & Preferences
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Current City</Label>
                <Input value={profile.address || ''} onChange={e => setProfile({ ...profile, address: e.target.value })} placeholder="Auto-detected or enter manually" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Home className="w-3 h-3" /> Hometown</Label>
                <Input value={profile.hometown || ''} onChange={e => setProfile({ ...profile, hometown: e.target.value })} placeholder="Where are you from?" />
              </div>
            </div>

            {/* Favorite cities */}
            <div className="mt-5">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                <Star className="w-3 h-3" /> Favorite Cities (up to 3)
              </Label>
              <div className="flex flex-wrap gap-2 mb-3">
                {favoriteCities.map(city => (
                  <span key={city} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-sm font-medium px-3 py-1 rounded-full">
                    {city}
                    <button onClick={() => setFavoriteCities(favoriteCities.filter(c => c !== city))} className="hover:text-destructive transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {favoriteCities.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No favorite cities yet — add up to 3 to personalize your feed.</p>
                )}
              </div>
              {favoriteCities.length < 3 && (
                <div className="flex gap-2">
                  <Input
                    value={newCity}
                    onChange={e => setNewCity(e.target.value)}
                    placeholder="Add a city"
                    className="max-w-xs"
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCity())}
                  />
                  <Button variant="outline" size="sm" onClick={handleAddCity} className="rounded-full">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add
                  </Button>
                </div>
              )}
            </div>
          </motion.section>

          {/* ─── INTERESTS & PERSONALIZATION ─── */}
          <motion.section custom={4} variants={sectionVariants} initial="hidden" animate="visible" className="bg-card rounded-2xl border border-border shadow-sm p-5 mb-5">
            <h2 className="font-display text-base font-semibold text-foreground mb-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" /> Interests
            </h2>
            <p className="text-sm text-muted-foreground mb-4">Select categories you're interested in to personalize your event feed.</p>
            <div className="flex flex-wrap gap-2">
              {EVENT_INTERESTS.map(interest => {
                const active = interests.includes(interest.id);
                return (
                  <button
                    key={interest.id}
                    onClick={() => toggleInterest(interest.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      active
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    <span>{interest.icon}</span>
                    {interest.label}
                    {active && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          </motion.section>

          {/* ─── LIKED EVENTS PREVIEW ─── */}
          <motion.section custom={5} variants={sectionVariants} initial="hidden" animate="visible" className="bg-card rounded-2xl border border-border shadow-sm p-5 mb-5">
            <h2 className="font-display text-base font-semibold text-foreground mb-3 flex items-center gap-2">
              <Heart className="w-4 h-4 text-destructive" /> Liked Events
            </h2>
            {savedEvents.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                {savedEvents.map((se: any) => {
                  const ev = se.canonical_events;
                  return (
                    <div key={se.canonical_event_id} className="shrink-0 w-40 rounded-xl overflow-hidden border border-border bg-muted/30">
                      {ev.image_url ? (
                        <img src={ev.image_url} alt={ev.title} className="w-full h-24 object-cover" />
                      ) : (
                        <div className="w-full h-24 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                          <Calendar className="w-8 h-8 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="p-2">
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-tight">{ev.title}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <Heart className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">You haven't liked any events yet.</p>
                <Button variant="link" size="sm" onClick={() => navigate('/events')} className="mt-1 text-primary">
                  Start exploring <ChevronRight className="w-3 h-3 ml-0.5" />
                </Button>
              </div>
            )}
          </motion.section>

          {/* ─── SAVE / ACTIONS ─── */}
          <motion.section custom={6} variants={sectionVariants} initial="hidden" animate="visible" className="flex flex-col sm:flex-row gap-3 mb-8">
            <Button onClick={handleSaveProfile} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 font-semibold">
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => navigate(-1)} className="flex-1 sm:flex-none rounded-full h-11">
              Cancel
            </Button>
          </motion.section>

        </div>
      </main>
      <Footer />

      {/* ─── AVATAR GALLERY MODAL ─── */}
      <Dialog open={showAvatarGallery} onOpenChange={setShowAvatarGallery}>
        <DialogContent className="max-w-lg sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          <div className="sticky top-0 bg-card z-10 px-5 pt-5 pb-3 border-b border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-lg">Choose Your Avatar</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-1">
              Pick a state animal avatar — each one represents a U.S. state!
            </p>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5 p-5">
            {avatars.map(avatar => {
              const selected = profile.selected_avatar_id === avatar.id;
              return (
                <button
                  key={avatar.id}
                  onClick={() => handleSelectAvatar(avatar)}
                  className={`relative flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all hover:border-primary hover:bg-primary/5 ${
                    selected ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'border-border'
                  }`}
                >
                  {selected && (
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-primary-foreground" />
                    </div>
                  )}
                  <span className="text-2xl sm:text-3xl">{avatar.image_url}</span>
                  <span className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight text-center line-clamp-2">
                    {avatar.state_name}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
