import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Calendar, Users, Plus, Save, Trash2, LogOut, Upload, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getSafeErrorMessage } from '@/lib/errorUtils';
import type { Tables } from '@/integrations/supabase/types';

type PartnerProfile = Tables<'partner_profiles'>;
type PartnerEmployee = Tables<'partner_employees'>;
type PartnerEvent = Tables<'partner_events'>;
type Category = Tables<'categories'>;
type Subcategory = Tables<'subcategories'>;

export default function PartnerDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Partial<PartnerProfile>>({});
  const [employees, setEmployees] = useState<PartnerEmployee[]>([]);
  const [events, setEvents] = useState<PartnerEvent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [newEvent, setNewEvent] = useState<Partial<PartnerEvent>>({ is_free: false, status: 'active' });
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventImageFile, setEventImageFile] = useState<File | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (!session) { navigate('/auth'); return; }
      // Check partner role
      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id);
      const isPartner = roles?.some(r => r.role === 'partner') || false;
      if (!isPartner) { navigate('/'); toast({ title: 'Access denied', description: 'Partner account required.', variant: 'destructive' }); return; }
      setUserId(session.user.id);
    });
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate('/auth'); return; }
      const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id);
      const isPartner = roles?.some(r => r.role === 'partner') || false;
      if (!isPartner) { navigate('/'); toast({ title: 'Access denied', description: 'Partner account required.', variant: 'destructive' }); return; }
      setUserId(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;
    const fetchAll = async () => {
      setLoading(true);
      const [catsRes, subsRes] = await Promise.all([
        supabase.from('categories').select('*').order('display_order'),
        supabase.from('subcategories').select('*').order('name'),
      ]);
      if (catsRes.data) setCategories(catsRes.data);
      if (subsRes.data) setSubcategories(subsRes.data);

      const { data: pp } = await supabase.from('partner_profiles').select('*').eq('user_id', userId).maybeSingle();
      if (pp) {
        setProfile(pp);
        const [empsRes, evtsRes] = await Promise.all([
          supabase.from('partner_employees').select('*').eq('partner_profile_id', pp.id),
          supabase.from('partner_events').select('*').eq('partner_profile_id', pp.id).order('event_date', { ascending: false }),
        ]);
        if (empsRes.data) setEmployees(empsRes.data);
        if (evtsRes.data) setEvents(evtsRes.data);
      }
      setLoading(false);
    };
    fetchAll();
  }, [userId]);

  const generateSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const handleSaveProfile = async () => {
    if (!userId) return;
    if (!profile.business_name?.trim()) {
      toast({ title: 'Business name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const slug = profile.slug || generateSlug(profile.business_name);
    const payload = { ...profile, slug, user_id: userId } as any;
    delete payload.id; delete payload.created_at; delete payload.updated_at;

    let logoUrl = profile.logo_url;
    if (logoFile) {
      const ext = logoFile.name.split('.').pop();
      const path = `${userId}/logo.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('partner-logos').upload(path, logoFile, { upsert: true });
      if (uploadErr) {
        toast({ title: 'Logo upload failed', description: getSafeErrorMessage(uploadErr), variant: 'destructive' });
      } else {
        const { data: urlData } = supabase.storage.from('partner-logos').getPublicUrl(path);
        logoUrl = urlData.publicUrl;
        payload.logo_url = logoUrl;
      }
    }

    if (profile.id) {
      const { error } = await supabase.from('partner_profiles').update(payload).eq('id', profile.id);
      if (error) toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
      else toast({ title: 'Profile saved!' });
    } else {
      const { data, error } = await supabase.from('partner_profiles').insert(payload).select().single();
      if (error) toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
      else { setProfile(data); toast({ title: 'Profile created!' }); }
    }
    setSaving(false);
  };

  const handleAddEmployee = async () => {
    if (!profile.id) { toast({ title: 'Save profile first', variant: 'destructive' }); return; }
    if (employees.length >= 2) { toast({ title: 'Maximum 2 employees', variant: 'destructive' }); return; }
    const { data, error } = await supabase.from('partner_employees')
      .insert({ partner_profile_id: profile.id, name: '' })
      .select().single();
    if (error) toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    else if (data) setEmployees([...employees, data]);
  };

  const handleUpdateEmployee = async (id: string, field: string, value: string) => {
    const { error } = await supabase.from('partner_employees').update({ [field]: value }).eq('id', id);
    if (!error) setEmployees(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const handleDeleteEmployee = async (id: string) => {
    const { error } = await supabase.from('partner_employees').delete().eq('id', id);
    if (!error) setEmployees(prev => prev.filter(e => e.id !== id));
  };

  const handleSaveEvent = async () => {
    if (!profile.id || !userId) { toast({ title: 'Save profile first', variant: 'destructive' }); return; }
    if (!newEvent.title?.trim() || !newEvent.event_date) {
      toast({ title: 'Title and date required', variant: 'destructive' }); return;
    }
    const payload = {
      ...newEvent,
      partner_profile_id: profile.id,
      city: newEvent.city || profile.city,
      state: newEvent.state || profile.state,
      zip_code: newEvent.zip_code || profile.zip_code,
    } as any;
    delete payload.id; delete payload.created_at; delete payload.updated_at;

    // Upload event image if a file was selected
    if (eventImageFile) {
      const ext = eventImageFile.name.split('.').pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('partner-event-images').upload(path, eventImageFile, { upsert: true });
      if (uploadErr) {
        toast({ title: 'Image upload failed', description: getSafeErrorMessage(uploadErr), variant: 'destructive' });
      } else {
        const { data: urlData } = supabase.storage.from('partner-event-images').getPublicUrl(path);
        payload.image_url = urlData.publicUrl;
      }
    }

    if (editingEventId) {
      const { error } = await supabase.from('partner_events').update(payload).eq('id', editingEventId);
      if (error) toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
      else {
        setEvents(prev => prev.map(e => e.id === editingEventId ? { ...e, ...payload } : e));
        toast({ title: 'Event updated!' });
        setNewEvent({ is_free: false, status: 'active' });
        setEditingEventId(null);
        setEventImageFile(null);
      }
    } else {
      const { data, error } = await supabase.from('partner_events').insert(payload).select().single();
      if (error) toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
      else { setEvents([data, ...events]); toast({ title: 'Event created!' }); setNewEvent({ is_free: false, status: 'active' }); setEventImageFile(null); }
    }
  };

  const handleEditEvent = (evt: PartnerEvent) => {
    setNewEvent(evt);
    setEditingEventId(evt.id);
  };

  const handleDeleteEvent = async (id: string) => {
    const { error } = await supabase.from('partner_events').delete().eq('id', id);
    if (!error) { setEvents(prev => prev.filter(e => e.id !== id)); toast({ title: 'Event deleted' }); }
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); navigate('/'); };

  const getSubsForCategory = (catId: string | null) => catId ? subcategories.filter(s => s.category_id === catId) : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16 px-4 flex items-center justify-center">
          <p className="text-muted-foreground">Loading partner dashboard...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <h1 className="font-display text-2xl font-bold text-foreground">Partner Dashboard</h1>
                  <p className="text-sm text-muted-foreground">{profile.business_name || 'Set up your business profile'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {profile.slug && (
                  <Button variant="outline" size="sm" onClick={() => navigate(`/partners/${profile.slug}`)}>
                    <ExternalLink className="w-4 h-4 mr-2" /> View Page
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="w-4 h-4 mr-2" /> Sign Out
                </Button>
              </div>
            </div>

            <Tabs defaultValue="profile">
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="profile"><Building2 className="w-4 h-4 mr-2" />Business Profile</TabsTrigger>
                <TabsTrigger value="team"><Users className="w-4 h-4 mr-2" />Team</TabsTrigger>
                <TabsTrigger value="events"><Calendar className="w-4 h-4 mr-2" />Events</TabsTrigger>
              </TabsList>

              {/* PROFILE TAB */}
              <TabsContent value="profile">
                <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
                  <h2 className="font-display text-lg font-semibold mb-4">Business Information</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Business Name *</Label>
                      <Input value={profile.business_name || ''} onChange={e => setProfile({ ...profile, business_name: e.target.value })} placeholder="Your Business Name" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Description</Label>
                      <Textarea value={profile.description || ''} onChange={e => setProfile({ ...profile, description: e.target.value })} placeholder="Tell people about your business..." rows={3} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Address</Label>
                      <Input value={profile.address || ''} onChange={e => setProfile({ ...profile, address: e.target.value })} placeholder="Street address" />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input value={profile.city || ''} onChange={e => setProfile({ ...profile, city: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input value={profile.state || ''} onChange={e => setProfile({ ...profile, state: e.target.value })} maxLength={2} />
                    </div>
                    <div className="space-y-2">
                      <Label>ZIP Code</Label>
                      <Input value={profile.zip_code || ''} onChange={e => setProfile({ ...profile, zip_code: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={profile.phone || ''} onChange={e => setProfile({ ...profile, phone: e.target.value })} placeholder="(555) 123-4567" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Website</Label>
                      <Input value={profile.website || ''} onChange={e => setProfile({ ...profile, website: e.target.value })} placeholder="https://..." />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={profile.category_id || ''} onValueChange={v => setProfile({ ...profile, category_id: v, subcategory_id: null })}>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Subcategory</Label>
                      <Select value={profile.subcategory_id || ''} onValueChange={v => setProfile({ ...profile, subcategory_id: v })} disabled={!profile.category_id}>
                        <SelectTrigger><SelectValue placeholder="Select subcategory" /></SelectTrigger>
                        <SelectContent>{getSubsForCategory(profile.category_id || null).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>

                    {/* Social Media */}
                    <div className="sm:col-span-2 pt-2"><h3 className="font-display text-sm font-semibold text-muted-foreground">Social Media</h3></div>
                    <div className="space-y-2">
                      <Label>Facebook</Label>
                      <Input value={profile.social_facebook || ''} onChange={e => setProfile({ ...profile, social_facebook: e.target.value })} placeholder="Facebook URL" />
                    </div>
                    <div className="space-y-2">
                      <Label>Instagram</Label>
                      <Input value={profile.social_instagram || ''} onChange={e => setProfile({ ...profile, social_instagram: e.target.value })} placeholder="Instagram URL" />
                    </div>
                    <div className="space-y-2">
                      <Label>Twitter/X</Label>
                      <Input value={profile.social_twitter || ''} onChange={e => setProfile({ ...profile, social_twitter: e.target.value })} placeholder="Twitter URL" />
                    </div>
                    <div className="space-y-2">
                      <Label>LinkedIn</Label>
                      <Input value={profile.social_linkedin || ''} onChange={e => setProfile({ ...profile, social_linkedin: e.target.value })} placeholder="LinkedIn URL" />
                    </div>

                    {/* Logo upload */}
                    <div className="sm:col-span-2 space-y-2">
                      <Label>Business Logo</Label>
                      <div className="flex items-center gap-4">
                        {profile.logo_url && <img src={profile.logo_url} alt="Logo" className="w-16 h-16 rounded-lg object-cover border border-border" />}
                        <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                          <Upload className="w-4 h-4" />
                          <span className="text-sm">{logoFile ? logoFile.name : 'Upload logo'}</span>
                          <input type="file" accept="image/*" className="hidden" onChange={e => setLogoFile(e.target.files?.[0] || null)} />
                        </label>
                      </div>
                    </div>
                  </div>
                  <Button onClick={handleSaveProfile} disabled={saving} className="mt-6 bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save Profile'}
                  </Button>
                </div>
              </TabsContent>

              {/* TEAM TAB */}
              <TabsContent value="team">
                <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display text-lg font-semibold">Key Contacts</h2>
                    <Button size="sm" variant="outline" onClick={handleAddEmployee} disabled={employees.length >= 2}>
                      <Plus className="w-4 h-4 mr-1" /> Add ({employees.length}/2)
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">Add up to 2 key employees to manage this account.</p>
                  {employees.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No team members yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {employees.map(emp => (
                        <div key={emp.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end p-4 rounded-xl bg-muted/50 border border-border">
                          <div className="space-y-1">
                            <Label className="text-xs">Name</Label>
                            <Input value={emp.name} onChange={e => handleUpdateEmployee(emp.id, 'name', e.target.value)} placeholder="Full name" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Title</Label>
                            <Input value={emp.title || ''} onChange={e => handleUpdateEmployee(emp.id, 'title', e.target.value)} placeholder="Job title" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Phone</Label>
                            <Input value={emp.phone || ''} onChange={e => handleUpdateEmployee(emp.id, 'phone', e.target.value)} placeholder="Phone" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Email</Label>
                            <Input value={emp.email || ''} onChange={e => handleUpdateEmployee(emp.id, 'email', e.target.value)} placeholder="Email" />
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteEmployee(emp.id)} className="text-destructive hover:text-destructive/80">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* EVENTS TAB */}
              <TabsContent value="events">
                <div className="bg-card rounded-2xl shadow-sm border border-border p-6 mb-6">
                  <h2 className="font-display text-lg font-semibold mb-4">{editingEventId ? 'Edit Event' : 'Create New Event'}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Title *</Label>
                      <Input value={newEvent.title || ''} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="Event title" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Description</Label>
                      <Textarea value={newEvent.description || ''} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} rows={3} />
                    </div>
                    <div className="space-y-2">
                      <Label>Date *</Label>
                      <Input type="date" value={newEvent.event_date || ''} onChange={e => setNewEvent({ ...newEvent, event_date: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Time</Label>
                      <Input value={newEvent.event_time || ''} onChange={e => setNewEvent({ ...newEvent, event_time: e.target.value })} placeholder="7:00 PM" />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input type="date" value={newEvent.end_date || ''} onChange={e => setNewEvent({ ...newEvent, end_date: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input value={newEvent.end_time || ''} onChange={e => setNewEvent({ ...newEvent, end_time: e.target.value })} placeholder="10:00 PM" />
                    </div>
                    <div className="space-y-2">
                      <Label>Venue Name</Label>
                      <Input value={newEvent.venue_name || ''} onChange={e => setNewEvent({ ...newEvent, venue_name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Venue Address</Label>
                      <Input value={newEvent.venue_address || ''} onChange={e => setNewEvent({ ...newEvent, venue_address: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input value={newEvent.city || ''} onChange={e => setNewEvent({ ...newEvent, city: e.target.value })} placeholder={profile.city || ''} />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input value={newEvent.state || ''} onChange={e => setNewEvent({ ...newEvent, state: e.target.value })} placeholder={profile.state || ''} maxLength={2} />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={newEvent.category_id || ''} onValueChange={v => setNewEvent({ ...newEvent, category_id: v, subcategory_id: null })}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Subcategory</Label>
                      <Select value={newEvent.subcategory_id || ''} onValueChange={v => setNewEvent({ ...newEvent, subcategory_id: v })} disabled={!newEvent.category_id}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{getSubsForCategory(newEvent.category_id || null).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Price ($)</Label>
                      <Input type="number" value={newEvent.price ?? ''} onChange={e => setNewEvent({ ...newEvent, price: e.target.value ? Number(e.target.value) : null })} placeholder="0.00" />
                    </div>
                    <div className="space-y-2">
                      <Label>Ticket URL</Label>
                      <Input value={newEvent.ticket_url || ''} onChange={e => setNewEvent({ ...newEvent, ticket_url: e.target.value })} placeholder="https://..." />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Event Image</Label>
                      <div className="flex items-center gap-4">
                        {(newEvent.image_url || eventImageFile) && (
                          <img
                            src={eventImageFile ? URL.createObjectURL(eventImageFile) : newEvent.image_url || ''}
                            alt="Preview"
                            className="w-20 h-20 rounded-lg object-cover border border-border"
                          />
                        )}
                        <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                          <Upload className="w-4 h-4" />
                          <span className="text-sm">{eventImageFile ? eventImageFile.name : 'Upload image'}</span>
                          <input type="file" accept="image/*" className="hidden" onChange={e => setEventImageFile(e.target.files?.[0] || null)} />
                        </label>
                      </div>
                      <p className="text-xs text-muted-foreground">Or enter a URL:</p>
                      <Input value={newEvent.image_url || ''} onChange={e => setNewEvent({ ...newEvent, image_url: e.target.value })} placeholder="https://..." />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-6">
                    <Button onClick={handleSaveEvent} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                      <Save className="w-4 h-4 mr-2" /> {editingEventId ? 'Update Event' : 'Create Event'}
                    </Button>
                    {editingEventId && (
                      <Button variant="outline" onClick={() => { setNewEvent({ is_free: false, status: 'active' }); setEditingEventId(null); }}>Cancel</Button>
                    )}
                  </div>
                </div>

                {/* Event List */}
                <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
                  <h2 className="font-display text-lg font-semibold mb-4">Your Events ({events.length})</h2>
                  {events.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No events yet. Create your first event above.</p>
                  ) : (
                    <div className="space-y-3">
                      {events.map(evt => (
                        <div key={evt.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
                          <div>
                            <h3 className="font-semibold text-foreground">{evt.title}</h3>
                            <p className="text-sm text-muted-foreground">{evt.event_date} {evt.event_time && `at ${evt.event_time}`} · {evt.venue_name || evt.city}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleEditEvent(evt)}>Edit</Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteEvent(evt.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
