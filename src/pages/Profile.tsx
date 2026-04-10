import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Save, Plus, Trash2, Camera, MapPin, Home, Star, Upload,
  Heart, ChevronRight, Check, X, Sparkles, Calendar, ImageIcon, Loader2
} from 'lucide-react';
import { getSafeErrorMessage } from '@/lib/errorUtils';
import { CityAutocomplete } from '@/components/CityAutocomplete';
import { detectUserLocation } from '@/lib/locationUtils';
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
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
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
  const [imgError, setImgError] = useState(false);
  const [detectingCity, setDetectingCity] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) navigate('/auth');
      else {
        setUserId(session.user.id);
        const created = session.user.created_at;
        if (created) setMemberSince(new Date(created).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate('/auth');
      else {
        setUserId(session.user.id);
        const created = session.user.created_at;
        if (created) setMemberSince(new Date(created).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
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
        setFavoriteCities(Array.isArray(profileRes.data.favorite_cities) ? (profileRes.data.favorite_cities as string[]) : []);
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
  const showImage = avatarUrl && !isEmojiAvatar && !imgError;

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
    if (error) toast.error('Error saving profile', { description: getSafeErrorMessage(error) });
    else toast.success('Profile saved!');
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    setImgError(false);
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
    setImgError(false);
    toast.success('Photo removed');
  };

  const handleSelectAvatar = async (avatar: AvatarRow) => {
    if (!userId) return;
    await supabase.from('profiles').update({ selected_avatar_id: avatar.id, custom_avatar_url: null }).eq('user_id', userId);
    setProfile(prev => ({ ...prev, selected_avatar_id: avatar.id, custom_avatar_url: null }));
    setImgError(false);
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
        <main className="pt-24 pb-16 px-4 flex items-center justify-center min-h-[60vh]">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <p className="text-muted-foreground text-sm font-medium">Loading your profile…</p>
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
          <motion.section custom={0} variants={sectionVariants} initial="hidden" animate="visible" className="relative mb-6">
            <div className="h-32 sm:h-36 rounded-t-2xl bg-gradient-to-br from-primary/70 via-secondary/50 to-accent/60 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary)/0.3),transparent_70%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_30%,hsl(var(--accent)/0.25),transparent_60%)]" />
            </div>
            <div className="bg-card rounded-b-2xl border border-t-0 border-border shadow-sm px-5 sm:px-6 pb-5 -mt-px">
              <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 -mt-14 sm:-mt-16">
                {/* Avatar with upload overlay */}
                <div className="relative group shrink-0">
                  <div className="rounded-full ring-4 ring-card shadow-lg">
                    <Avatar className="h-28 w-28 sm:h-32 sm:w-32">
                      {showImage ? (
                        <AvatarImage
                          src={avatarUrl!}
                          alt="Profile"
                          className="object-cover"
                          onError={() => setImgError(true)}
                        />
                      ) : null}
                      <AvatarFallback className="bg-gradient-to-br from-primary/15 to-secondary/15 text-primary text-3xl sm:text-4xl font-bold">
                        {isEmojiAvatar && avatarUrl ? (
                          <span className="text-5xl">{avatarUrl}</span>
                        ) : initials}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 rounded-full bg-foreground/50 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center cursor-pointer backdrop-blur-sm"
                    aria-label="Upload photo"
                  >
                    <Camera className="w-7 h-7 text-white drop-shadow-md" />
                  </button>
                  {uploading && (
                    <div className="absolute inset-0 rounded-full bg-foreground/60 flex items-center justify-center backdrop-blur-sm">
                      <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="text-center sm:text-left flex-1 pb-1 min-w-0">
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground leading-tight truncate">
                    {displayName || 'Welcome!'}
                  </h1>
                  <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
                  {memberSince && (
                    <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1 justify-center sm:justify-start">
                      <Calendar className="w-3 h-3" /> Member since {memberSince}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </motion.section>

          {/* ─── PROFILE PHOTO / AVATAR ─── */}
          <motion.section custom={1} variants={sectionVariants} initial="hidden" animate="visible" className="bg-card rounded-2xl border border-border shadow-sm p-5 sm:p-6 mb-5">
            <h2 className="font-display text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" /> Profile Photo
            </h2>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            <div className="flex flex-wrap gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-full border-primary/30 hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {uploading ? 'Uploading…' : 'Upload Photo'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAvatarGallery(true)}
                className="rounded-full border-secondary/30 hover:border-secondary hover:bg-secondary/5 transition-all active:scale-95"
              >
                🐾 Choose Avatar
              </Button>
              {(profile.custom_avatar_url || profile.selected_avatar_id) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemovePhoto}
                  className="rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
                </Button>
              )}
            </div>
            {!avatarUrl && (
              <div className="mt-4 flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
                <ImageIcon className="w-5 h-5 text-muted-foreground/50 mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Add a profile photo or choose a fun state-animal avatar to make your account uniquely yours.
                </p>
              </div>
            )}
          </motion.section>

          {/* ─── PERSONAL INFORMATION ─── */}
          <motion.section custom={2} variants={sectionVariants} initial="hidden" animate="visible" className="bg-card rounded-2xl border border-border shadow-sm p-5 sm:p-6 mb-5">
            <h2 className="font-display text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Personal Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">First Name</Label>
                <Input value={profile.first_name || ''} onChange={e => setProfile({ ...profile, first_name: e.target.value })} placeholder="First name" className="h-10 rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Last Name</Label>
                <Input value={profile.last_name || ''} onChange={e => setProfile({ ...profile, last_name: e.target.value })} placeholder="Last name" className="h-10 rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Email</Label>
                <Input value={profile.email || ''} readOnly className="h-10 rounded-lg bg-muted/40 cursor-default text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Phone</Label>
                <Input value={profile.phone || ''} onChange={e => setProfile({ ...profile, phone: e.target.value })} placeholder="(555) 123-4567" className="h-10 rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Date of Birth</Label>
                <Input type="date" value={profile.date_of_birth || ''} onChange={e => setProfile({ ...profile, date_of_birth: e.target.value })} className="h-10 rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Gender</Label>
                <Select value={profile.gender || ''} onValueChange={v => setProfile({ ...profile, gender: v as any })}>
                  <SelectTrigger className="h-10 rounded-lg"><SelectValue placeholder="Select" /></SelectTrigger>
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
          <motion.section custom={3} variants={sectionVariants} initial="hidden" animate="visible" className="bg-card rounded-2xl border border-border shadow-sm p-5 sm:p-6 mb-5">
            <h2 className="font-display text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Location & Preferences
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Current City
                </Label>
                <div className="flex gap-2 items-start">
                  <CityAutocomplete
                    value={profile.address || ''}
                    onChange={(val) => setProfile({ ...profile, address: val })}
                    placeholder="Search city or zip…"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 rounded-lg shrink-0 text-xs"
                    disabled={detectingCity}
                    onClick={async () => {
                      setDetectingCity(true);
                      const loc = await detectUserLocation();
                      setDetectingCity(false);
                      if (loc.display) {
                        setProfile({ ...profile, address: loc.display });
                      }
                    }}
                  >
                    {detectingCity ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                {!profile.address && !detectingCity && (
                  <p className="text-xs text-muted-foreground/60 italic mt-1">Type a city or zip, or click the pin to auto-detect.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Home className="w-3 h-3" /> Hometown
                </Label>
                <CityAutocomplete
                  value={profile.hometown || ''}
                  onChange={(val) => setProfile({ ...profile, hometown: val })}
                  placeholder="Where are you from?"
                />
                {!profile.hometown && (
                  <p className="text-xs text-muted-foreground/60 italic mt-1">Tell us where you're from to get local recommendations.</p>
                )}
              </div>
            </div>

            {/* Favorite cities */}
            <div className="mt-5">
              <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2.5">
                <Star className="w-3 h-3" /> Favorite Cities (up to 3)
              </Label>
              <div className="flex flex-wrap gap-2 mb-3">
                <AnimatePresence mode="popLayout">
                  {favoriteCities.map(city => (
                    <motion.span
                      key={city}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-sm font-medium px-3 py-1.5 rounded-full"
                    >
                      {city}
                      <button
                        onClick={() => setFavoriteCities(favoriteCities.filter(c => c !== city))}
                        className="hover:text-destructive transition-colors rounded-full hover:bg-destructive/10 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
                {favoriteCities.length === 0 && (
                  <p className="text-sm text-muted-foreground/60 italic">Add your favorite cities to personalize your event feed.</p>
                )}
              </div>
              {favoriteCities.length < 3 && (
                <div className="flex gap-2">
                  <Input
                    value={newCity}
                    onChange={e => setNewCity(e.target.value)}
                    placeholder="Add a city"
                    className="max-w-xs h-9 rounded-lg"
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCity())}
                  />
                  <Button variant="outline" size="sm" onClick={handleAddCity} className="rounded-full h-9 active:scale-95 transition-all">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add
                  </Button>
                </div>
              )}
            </div>
          </motion.section>

          {/* ─── INTERESTS & PERSONALIZATION ─── */}
          <motion.section custom={4} variants={sectionVariants} initial="hidden" animate="visible" className="bg-card rounded-2xl border border-border shadow-sm p-5 sm:p-6 mb-5">
            <h2 className="font-display text-base font-semibold text-foreground mb-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" /> Interests
            </h2>
            <p className="text-sm text-muted-foreground mb-4">Select categories to personalize your event feed.</p>
            <div className="flex flex-wrap gap-2">
              {EVENT_INTERESTS.map(interest => {
                const active = interests.includes(interest.id);
                return (
                  <motion.button
                    key={interest.id}
                    onClick={() => toggleInterest(interest.id)}
                    whileTap={{ scale: 0.95 }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium border-2 transition-all duration-200 ${
                      active
                        ? 'bg-primary/10 border-primary text-primary shadow-sm'
                        : 'bg-muted/30 border-transparent text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <span className="text-base">{interest.icon}</span>
                    {interest.label}
                    {active && <Check className="w-3.5 h-3.5" />}
                  </motion.button>
                );
              })}
            </div>
          </motion.section>

          {/* ─── LIKED EVENTS PREVIEW ─── */}
          <motion.section custom={5} variants={sectionVariants} initial="hidden" animate="visible" className="bg-card rounded-2xl border border-border shadow-sm p-5 sm:p-6 mb-5">
            <h2 className="font-display text-base font-semibold text-foreground mb-3 flex items-center gap-2">
              <Heart className="w-4 h-4 text-destructive" /> Liked Events
            </h2>
            {savedEvents.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide snap-x snap-mandatory">
                {savedEvents.map((se: any) => {
                  const ev = se.canonical_events;
                  return (
                    <div key={se.canonical_event_id} className="shrink-0 w-44 rounded-xl overflow-hidden border border-border bg-muted/20 snap-start hover:shadow-md transition-shadow">
                      {ev.image_url ? (
                        <img src={ev.image_url} alt={ev.title} className="w-full h-28 object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-28 bg-gradient-to-br from-primary/15 to-secondary/15 flex items-center justify-center">
                          <Calendar className="w-8 h-8 text-muted-foreground/30" />
                        </div>
                      )}
                      <div className="p-2.5">
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">{ev.title}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 px-4">
                <div className="w-14 h-14 rounded-full bg-destructive/5 flex items-center justify-center mx-auto mb-3">
                  <Heart className="w-7 h-7 text-destructive/30" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">No liked events yet</p>
                <p className="text-xs text-muted-foreground/60 mb-3">Explore events and tap the heart to save your favorites.</p>
                <Button variant="outline" size="sm" onClick={() => navigate('/events')} className="rounded-full active:scale-95 transition-all">
                  Start Exploring <ChevronRight className="w-3 h-3 ml-0.5" />
                </Button>
              </div>
            )}
          </motion.section>

          {/* ─── SAVE / ACTIONS ─── */}
          <motion.section custom={6} variants={sectionVariants} initial="hidden" animate="visible" className="flex flex-col sm:flex-row gap-3 mb-8">
            <Button
              onClick={handleSaveProfile}
              disabled={saving}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-12 font-semibold text-base shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
            >
              {saving ? (
                <>
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => navigate(-1)} className="sm:w-auto rounded-full h-12 font-medium active:scale-[0.98] transition-all">
              Cancel
            </Button>
          </motion.section>

        </div>
      </main>
      <Footer />

      {/* ─── AVATAR GALLERY MODAL ─── */}
      <Dialog open={showAvatarGallery} onOpenChange={setShowAvatarGallery}>
        <DialogContent className="max-w-lg sm:max-w-2xl max-h-[85vh] overflow-hidden p-0 rounded-2xl">
          <div className="sticky top-0 bg-card z-10 px-5 sm:px-6 pt-5 pb-3 border-b border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-lg">Choose Your Avatar</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mt-1">
              Pick a state animal avatar — each one represents a U.S. state!
            </p>
          </div>
          <div className="overflow-y-auto max-h-[calc(85vh-5rem)] p-5 sm:p-6">
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5">
              {avatars.map(avatar => {
                const selected = profile.selected_avatar_id === avatar.id;
                return (
                  <motion.button
                    key={avatar.id}
                    onClick={() => handleSelectAvatar(avatar)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-colors ${
                      selected
                        ? 'border-primary bg-primary/10 shadow-md'
                        : 'border-border/60 hover:border-primary/50 hover:bg-primary/5'
                    }`}
                  >
                    {selected && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm">
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                    <span className="text-3xl sm:text-4xl leading-none">{avatar.image_url}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight text-center line-clamp-2 font-medium">
                      {avatar.state_name}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
