import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Save, Plus, Trash2, LogOut, Camera, MapPin, Home, Star, Upload } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;
type Category = Tables<'categories'>;
type Subcategory = Tables<'subcategories'>;
type SearchPreference = Tables<'search_preferences'>;
type AvatarRow = Tables<'avatars'>;

export default function ProfilePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [preferences, setPreferences] = useState<SearchPreference[]>([]);
  const [avatars, setAvatars] = useState<AvatarRow[]>([]);
  const [showAvatarGallery, setShowAvatarGallery] = useState(false);
  const [favoriteCities, setFavoriteCities] = useState<string[]>([]);
  const [newCity, setNewCity] = useState('');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) navigate('/auth');
      else setUserId(session.user.id);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate('/auth');
      else setUserId(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;
    const fetchAll = async () => {
      setLoading(true);
      const [profileRes, catsRes, subsRes, prefsRes, avatarsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', userId).single(),
        supabase.from('categories').select('*').order('display_order'),
        supabase.from('subcategories').select('*').order('name'),
        supabase.from('search_preferences').select('*').eq('user_id', userId),
        supabase.from('avatars').select('*').eq('is_active', true).order('sort_order'),
      ]);
      if (profileRes.data) {
        setProfile(profileRes.data);
        setFavoriteCities(
          Array.isArray(profileRes.data.favorite_cities)
            ? (profileRes.data.favorite_cities as string[])
            : []
        );
      }
      if (catsRes.data) setCategories(catsRes.data);
      if (subsRes.data) setSubcategories(subsRes.data);
      if (prefsRes.data) setPreferences(prefsRes.data);
      if (avatarsRes.data) setAvatars(avatarsRes.data);
      setLoading(false);
    };
    fetchAll();
  }, [userId]);

  // Compute display avatar URL
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
  const isEmojiAvatar = avatarUrl?.startsWith('�') || (avatarUrl?.length || 0) <= 4;

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
        favorite_cities: favoriteCities,
      })
      .eq('user_id', userId);
    setSaving(false);
    if (error) {
      toast({ title: 'Error saving profile', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      toast({ title: 'Profile saved!' });
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);

    const ext = file.name.split('.').pop();
    const path = `${userId}/profile.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('profile-photos')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast({ title: 'Upload failed', description: getSafeErrorMessage(uploadError), variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('profile-photos')
      .getPublicUrl(path);

    // Add cache buster
    const url = `${publicUrl}?t=${Date.now()}`;
    await supabase.from('profiles').update({ custom_avatar_url: url, selected_avatar_id: null }).eq('user_id', userId);
    setProfile(prev => ({ ...prev, custom_avatar_url: url, selected_avatar_id: null }));
    setUploading(false);
    toast({ title: 'Photo updated!' });
  };

  const handleSelectAvatar = async (avatar: AvatarRow) => {
    if (!userId) return;
    await supabase.from('profiles').update({
      selected_avatar_id: avatar.id,
      custom_avatar_url: null,
    }).eq('user_id', userId);
    setProfile(prev => ({ ...prev, selected_avatar_id: avatar.id, custom_avatar_url: null }));
    setShowAvatarGallery(false);
    toast({ title: `Avatar set to ${avatar.avatar_name}!` });
  };

  const handleAddCity = () => {
    const city = newCity.trim();
    if (city && favoriteCities.length < 3 && !favoriteCities.includes(city)) {
      setFavoriteCities([...favoriteCities, city]);
      setNewCity('');
    }
  };

  const handleRemoveCity = (city: string) => {
    setFavoriteCities(favoriteCities.filter(c => c !== city));
  };

  const handleAddPreference = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('search_preferences')
      .insert({ user_id: userId })
      .select()
      .single();
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else if (data) {
      setPreferences([...preferences, data]);
    }
  };

  const handleUpdatePreference = async (id: string, field: string, value: string | null) => {
    const updates: Record<string, string | null> = { [field]: value };
    if (field === 'category_id') updates.subcategory_id = null;
    const { error } = await supabase.from('search_preferences').update(updates).eq('id', id);
    if (!error) {
      setPreferences(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    }
  };

  const handleDeletePreference = async (id: string) => {
    const { error } = await supabase.from('search_preferences').delete().eq('id', id);
    if (!error) {
      setPreferences(prev => prev.filter(p => p.id !== id));
      toast({ title: 'Preference removed' });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const getSubcategoriesForCategory = (categoryId: string | null) => {
    if (!categoryId) return [];
    return subcategories.filter(s => s.category_id === categoryId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16 px-4 flex items-center justify-center">
          <p className="text-muted-foreground">Loading profile...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Profile header with avatar */}
            <div className="flex flex-col sm:flex-row items-center gap-5 mb-8">
              {/* Avatar with upload overlay */}
              <div className="relative group">
                <Avatar className="h-24 w-24 ring-4 ring-primary/10">
                  {avatarUrl && !isEmojiAvatar ? (
                    <AvatarImage src={avatarUrl} alt="Profile" />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                    {isEmojiAvatar && avatarUrl ? (
                      <span className="text-4xl">{avatarUrl}</span>
                    ) : initials}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => setShowAvatarGallery(true)}
                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <Camera className="w-6 h-6 text-white" />
                </button>
              </div>
              <div className="text-center sm:text-left flex-1">
                <h1 className="font-display text-2xl font-bold text-foreground">
                  {[profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Your Profile'}
                </h1>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
                {profile.address && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 justify-center sm:justify-start mt-1">
                    <MapPin className="w-3.5 h-3.5" /> {profile.address}
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>

            {/* Photo & Avatar actions */}
            <div className="bg-card rounded-2xl shadow-sm border border-border p-6 mb-6">
              <h2 className="font-display text-lg font-semibold text-foreground mb-4">Profile Photo</h2>
              <div className="flex flex-wrap gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload Photo'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAvatarGallery(true)}
                >
                  🐾 Choose Avatar
                </Button>
              </div>
              {!avatarUrl && (
                <p className="text-sm text-muted-foreground mt-3 italic">
                  Add a profile photo or pick a fun state-animal avatar to personalize your account.
                </p>
              )}
            </div>

            {/* Personal Info */}
            <div className="bg-card rounded-2xl shadow-sm border border-border p-6 mb-6">
              <h2 className="font-display text-lg font-semibold text-foreground mb-4">Personal Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={profile.first_name || ''}
                    onChange={e => setProfile({ ...profile, first_name: e.target.value })}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={profile.last_name || ''}
                    onChange={e => setProfile({ ...profile, last_name: e.target.value })}
                    placeholder="Last name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={profile.phone || ''}
                    onChange={e => setProfile({ ...profile, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={profile.date_of_birth || ''}
                    onChange={e => setProfile({ ...profile, date_of_birth: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Current City</Label>
                  <Input
                    value={profile.address || ''}
                    onChange={e => setProfile({ ...profile, address: e.target.value })}
                    placeholder="Detected automatically or enter manually"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5"><Home className="w-3.5 h-3.5" /> Hometown</Label>
                  <Input
                    value={profile.hometown || ''}
                    onChange={e => setProfile({ ...profile, hometown: e.target.value })}
                    placeholder="Where are you from?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select
                    value={profile.gender || ''}
                    onValueChange={v => setProfile({ ...profile, gender: v as any })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="nonbinary">Non-Binary</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Marital Status</Label>
                  <Select
                    value={profile.marital_status || ''}
                    onValueChange={v => setProfile({ ...profile, marital_status: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="married">Married</SelectItem>
                      <SelectItem value="divorced">Divorced</SelectItem>
                      <SelectItem value="widowed">Widowed</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Favorite cities */}
              <div className="mt-6">
                <Label className="flex items-center gap-1.5 mb-2"><Star className="w-3.5 h-3.5" /> Favorite Cities (up to 3)</Label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {favoriteCities.map(city => (
                    <span key={city} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-sm font-medium px-3 py-1 rounded-full">
                      {city}
                      <button onClick={() => handleRemoveCity(city)} className="hover:text-destructive">×</button>
                    </span>
                  ))}
                </div>
                {favoriteCities.length < 3 && (
                  <div className="flex gap-2">
                    <Input
                      value={newCity}
                      onChange={e => setNewCity(e.target.value)}
                      placeholder="Add a city"
                      className="max-w-xs"
                      onKeyDown={e => e.key === 'Enter' && handleAddCity()}
                    />
                    <Button variant="outline" size="sm" onClick={handleAddCity}>
                      <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                  </div>
                )}
              </div>

              <Button
                onClick={handleSaveProfile}
                disabled={saving}
                className="mt-6 bg-primary hover:bg-green-dark text-primary-foreground"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Profile'}
              </Button>
            </div>

            {/* Search Preferences */}
            <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-semibold text-foreground">Saved Search Preferences</h2>
                <Button size="sm" variant="outline" onClick={handleAddPreference}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Save your favorite categories and locations to quickly find events you love.
              </p>

              {preferences.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No saved preferences yet. Click "Add" to create one.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {preferences.map(pref => {
                    const subs = getSubcategoriesForCategory(pref.category_id);
                    return (
                      <motion.div
                        key={pref.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end p-4 rounded-xl bg-muted/50 border border-border"
                      >
                        <div className="space-y-1">
                          <Label className="text-xs">Category</Label>
                          <Select
                            value={pref.category_id || ''}
                            onValueChange={v => handleUpdatePreference(pref.id, 'category_id', v)}
                          >
                            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                            <SelectContent>
                              {categories.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Subcategory</Label>
                          <Select
                            value={pref.subcategory_id || ''}
                            onValueChange={v => handleUpdatePreference(pref.id, 'subcategory_id', v)}
                            disabled={subs.length === 0}
                          >
                            <SelectTrigger><SelectValue placeholder="Subcategory" /></SelectTrigger>
                            <SelectContent>
                              {subs.map(s => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">City</Label>
                          <Input
                            value={pref.city || ''}
                            onChange={e => handleUpdatePreference(pref.id, 'city', e.target.value)}
                            placeholder="City"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">State</Label>
                          <Input
                            value={pref.state || ''}
                            onChange={e => handleUpdatePreference(pref.id, 'state', e.target.value)}
                            placeholder="State"
                            maxLength={2}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeletePreference(pref.id)}
                          className="text-destructive hover:text-destructive/80"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />

      {/* Avatar Gallery Modal */}
      <Dialog open={showAvatarGallery} onOpenChange={setShowAvatarGallery}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Choose Your State Animal Avatar</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            Pick a fun avatar representing a U.S. state animal. Or upload your own photo above.
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
            {avatars.map(avatar => (
              <button
                key={avatar.id}
                onClick={() => handleSelectAvatar(avatar)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all hover:border-primary hover:bg-primary/5 ${
                  profile.selected_avatar_id === avatar.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border'
                }`}
              >
                <span className="text-3xl">{avatar.image_url}</span>
                <span className="text-[10px] text-muted-foreground leading-tight text-center line-clamp-2">
                  {avatar.state_name}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
