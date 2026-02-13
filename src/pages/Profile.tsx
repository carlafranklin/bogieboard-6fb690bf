import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Save, Plus, Trash2, LogOut } from 'lucide-react';
import { getSafeErrorMessage } from '@/lib/errorUtils';
import { profileSchema } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;
type Category = Tables<'categories'>;
type Subcategory = Tables<'subcategories'>;
type SearchPreference = Tables<'search_preferences'>;

export default function ProfilePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [preferences, setPreferences] = useState<SearchPreference[]>([]);

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
      const [profileRes, catsRes, subsRes, prefsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', userId).single(),
        supabase.from('categories').select('*').order('display_order'),
        supabase.from('subcategories').select('*').order('name'),
        supabase.from('search_preferences').select('*').eq('user_id', userId),
      ]);
      if (profileRes.data) setProfile(profileRes.data);
      if (catsRes.data) setCategories(catsRes.data);
      if (subsRes.data) setSubcategories(subsRes.data);
      if (prefsRes.data) setPreferences(prefsRes.data);
      setLoading(false);
    };
    fetchAll();
  }, [userId]);

  const handleSaveProfile = async () => {
    if (!userId) return;
    const validation = profileSchema.safeParse({
      first_name: profile.first_name,
      last_name: profile.last_name,
      phone: profile.phone,
      address: profile.address,
      date_of_birth: profile.date_of_birth,
      gender: profile.gender,
      marital_status: profile.marital_status,
    });
    if (!validation.success) {
      toast({ title: 'Invalid input', description: validation.error.errors[0].message, variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update(validation.data)
      .eq('user_id', userId);
    setSaving(false);
    if (error) {
      toast({ title: 'Error saving profile', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      toast({ title: 'Profile saved!' });
    }
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
    // Clear subcategory if category changes
    if (field === 'category_id') updates.subcategory_id = null;

    const { error } = await supabase
      .from('search_preferences')
      .update(updates)
      .eq('id', id);

    if (!error) {
      setPreferences(prev =>
        prev.map(p => p.id === id ? { ...p, ...updates } : p)
      );
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
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="font-display text-2xl font-bold text-foreground">My Profile</h1>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
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
                <div className="space-y-2 sm:col-span-2">
                  <Label>Address</Label>
                  <Input
                    value={profile.address || ''}
                    onChange={e => setProfile({ ...profile, address: e.target.value })}
                    placeholder="123 Main St, City, State ZIP"
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
    </div>
  );
}
