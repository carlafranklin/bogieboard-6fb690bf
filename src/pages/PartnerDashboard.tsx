import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Calendar, Users, Plus, Save, Trash2, LogOut, Upload, ExternalLink, FileText, Clock, CheckCircle2, XCircle, Send, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getSafeErrorMessage } from '@/lib/errorUtils';
import type { Tables } from '@/integrations/supabase/types';
import { EMPLOYEE_COUNT_OPTIONS, CUSTOMER_AUDIENCE_OPTIONS, MARKETING_GOAL_OPTIONS } from '@/data/partnerProfileOptions';
import {
  TIME_HOURS,
  TIME_MINUTES,
  TIME_AMPM,
  parseTimeString,
  formatTimeParts,
  getTodayLocalDateString,
  isPastDate,
  isEndBeforeOrEqualStart,
  getMissingEventFields,
} from '@/lib/partnerEventValidation';

type PartnerProfile = Tables<'partner_profiles'>;
type PartnerEmployee = Tables<'partner_employees'>;
type PartnerEvent = Tables<'partner_events'>;
type Category = Tables<'categories'>;
type Subcategory = Tables<'subcategories'>;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground', icon: FileText },
  pending: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  approved: { label: 'Live', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

// partner_profiles.verification_status real values: pending, approved, rejected, suspended.
const VERIFICATION_STATUS_CONFIG: Record<string, { label: string }> = {
  pending: { label: 'Pending Verification' },
  approved: { label: 'Approved Partner' },
  rejected: { label: 'Application Rejected' },
  suspended: { label: 'Suspended' },
};

// Phase A: event creation/submission gating copy, keyed by businesses.verification_status
// (not the partner_profiles mirror above — see businessVerificationStatus state below).
const EVENT_GATING_MESSAGES: Record<string, string> = {
  pending: 'Your partner account is pending review. You’ll be able to submit events after approval.',
  rejected: 'Your partner application was not approved. Event submission is disabled.',
  suspended: 'Your partner account is suspended. Event submission is disabled.',
};

export default function PartnerDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Partial<PartnerProfile>>({});
  // Source of truth for event-submission gating is businesses.verification_status,
  // not partner_profiles.verification_status above (PR #57's sync to partner_profiles
  // is non-fatal and can lag) — same source the partner_events INSERT RLS policy uses.
  const [businessVerificationStatus, setBusinessVerificationStatus] = useState<string | null>(null);
  const [employees, setEmployees] = useState<PartnerEmployee[]>([]);
  const [events, setEvents] = useState<PartnerEvent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [newEvent, setNewEvent] = useState<Partial<PartnerEvent>>({ is_free: false, status: 'draft' });
  const [startHour, setStartHour] = useState('');
  const [startMinute, setStartMinute] = useState('');
  const [startAmPm, setStartAmPm] = useState('');
  const [endHour, setEndHour] = useState('');
  const [endMinute, setEndMinute] = useState('');
  const [endAmPm, setEndAmPm] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventImageFile, setEventImageFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const eventImageInputRef = useRef<HTMLInputElement>(null);

  // Hour/minute/AM-PM dropdowns are the source of truth while the partner is
  // picking a time — composing directly into newEvent.event_time on every
  // partial selection would null the field (formatTimeParts returns null
  // until all three parts are present) and reset the dropdowns to placeholder.
  useEffect(() => {
    setNewEvent(prev => ({ ...prev, event_time: formatTimeParts(startHour, startMinute, startAmPm) }));
  }, [startHour, startMinute, startAmPm]);

  useEffect(() => {
    setNewEvent(prev => ({ ...prev, end_time: formatTimeParts(endHour, endMinute, endAmPm) }));
  }, [endHour, endMinute, endAmPm]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (!session) { navigate('/auth'); return; }
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
      const [catsRes, subsRes, memberRes] = await Promise.all([
        supabase.from('categories').select('*').order('display_order'),
        supabase.from('subcategories').select('*').order('name'),
        supabase.from('business_members').select('business_id').eq('user_id', userId).eq('role', 'owner').maybeSingle(),
      ]);
      if (catsRes.data) setCategories(catsRes.data);
      if (subsRes.data) setSubcategories(subsRes.data);

      if (memberRes.data?.business_id) {
        // Cast: 'businesses' isn't in the generated Database Tables type (same
        // pre-existing generated-types gap already noted in IngestionHealthPanel.tsx
        // and BusinessApplicationsPanel.tsx).
        const { data: biz } = await supabase
          .from('businesses' as any)
          .select('verification_status')
          .eq('id', memberRes.data.business_id)
          .maybeSingle();
        setBusinessVerificationStatus((biz as any)?.verification_status ?? null);
      } else {
        setBusinessVerificationStatus(null);
      }

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

  const toggleProfileListValue = (field: 'primary_customer_audience' | 'primary_marketing_goal', value: string) => {
    const current = (profile[field] as string[] | null) || [];
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    setProfile({ ...profile, [field]: next });
  };

  const handleSaveProfile = async () => {
    if (!userId) return;
    if (!profile.business_name?.trim()) {
      toast({ title: 'Business name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const slug = profile.slug || generateSlug(profile.business_name);
      const payload = { ...profile, slug, user_id: userId } as any;
      delete payload.id; delete payload.created_at; delete payload.updated_at;

      // Upload logo
      let logoUrl = profile.logo_url;
      if (logoFile) {
        const ext = logoFile.name.split('.').pop();
        const path = `${userId}/logo.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('partner-logos').upload(path, logoFile, { upsert: true });
        if (uploadErr) {
          console.error('[PartnerDashboard] Logo upload error:', uploadErr);
          toast({ title: 'Logo upload failed', description: getSafeErrorMessage(uploadErr), variant: 'destructive' });
        } else {
          const { data: urlData } = supabase.storage.from('partner-logos').getPublicUrl(path);
          logoUrl = urlData.publicUrl;
          payload.logo_url = logoUrl;
        }
      }

      // Upload cover image
      if (coverFile) {
        const ext = coverFile.name.split('.').pop();
        const path = `${userId}/cover.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('partner-logos').upload(path, coverFile, { upsert: true });
        if (uploadErr) {
          console.error('[PartnerDashboard] Cover upload error:', uploadErr);
          toast({ title: 'Cover upload failed', description: getSafeErrorMessage(uploadErr), variant: 'destructive' });
        } else {
          const { data: urlData } = supabase.storage.from('partner-logos').getPublicUrl(path);
          payload.cover_url = urlData.publicUrl;
        }
      }

      if (profile.id) {
        const { error } = await supabase.from('partner_profiles').update(payload).eq('id', profile.id);
        if (error) {
          console.error('[PartnerDashboard] Profile update error:', error);
          toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
        } else {
          // Sync local state with what was actually saved (including freshly uploaded
          // logo_url/cover_url) — without this, the form shows stale data until a reload.
          setProfile(prev => ({ ...prev, ...payload }));
          toast({ title: 'Profile saved!' });
        }
      } else {
        const { data, error } = await supabase.from('partner_profiles').insert(payload).select().single();
        if (error) {
          console.error('[PartnerDashboard] Profile insert error:', error);
          toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
        } else { setProfile(data); toast({ title: 'Profile created!' }); }
      }
    } catch (err) {
      console.error('[PartnerDashboard] Unexpected profile save error:', err);
      toast({ title: 'Error', description: 'Something went wrong saving your profile. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
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

  const handleSaveEvent = async (submitForReview = false) => {
    if (!profile.id || !userId) { toast({ title: 'Save profile first', variant: 'destructive' }); return; }

    const missingFields = getMissingEventFields(newEvent, !!(eventImageFile || newEvent.image_url));
    if (missingFields.length > 0) {
      toast({
        title: 'Missing required fields',
        description: `Please fill in: ${missingFields.join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    if (newEvent.event_date && isPastDate(newEvent.event_date)) {
      toast({ title: 'Invalid date', description: 'Event date cannot be in the past.', variant: 'destructive' });
      return;
    }
    if (newEvent.end_date && isPastDate(newEvent.end_date)) {
      toast({ title: 'Invalid date', description: 'End date cannot be in the past.', variant: 'destructive' });
      return;
    }

    if (
      newEvent.event_date && newEvent.event_time && newEvent.end_time &&
      isEndBeforeOrEqualStart(newEvent.event_date, newEvent.event_time, newEvent.end_date, newEvent.end_time)
    ) {
      toast({ title: 'Invalid time range', description: 'End time must be after start time.', variant: 'destructive' });
      return;
    }

    const status = submitForReview ? 'pending' : (newEvent.status === 'rejected' ? 'draft' : (newEvent.status || 'draft'));

    const payload = {
      ...newEvent,
      status,
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
        toast({ title: submitForReview ? 'Submitted for review!' : 'Event updated!' });
        resetEventForm();
      }
    } else {
      const { data, error } = await supabase.from('partner_events').insert(payload).select().single();
      if (error) toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
      else {
        setEvents([data, ...events]);
        toast({ title: submitForReview ? 'Submitted for review!' : 'Draft saved!' });
        resetEventForm();
      }
    }
  };

  const resetEventForm = () => {
    setNewEvent({ is_free: false, status: 'draft' });
    setEditingEventId(null);
    setEventImageFile(null);
    setStartHour(''); setStartMinute(''); setStartAmPm('');
    setEndHour(''); setEndMinute(''); setEndAmPm('');
  };

  const handleEditEvent = (evt: PartnerEvent) => {
    setNewEvent(evt);
    const start = parseTimeString(evt.event_time);
    setStartHour(start.hour); setStartMinute(start.minute); setStartAmPm(start.ampm);
    const end = parseTimeString(evt.end_time);
    setEndHour(end.hour); setEndMinute(end.minute); setEndAmPm(end.ampm);
    setEditingEventId(evt.id);
    setActiveTab('events');
  };

  const handleDeleteEvent = async (id: string) => {
    const { error } = await supabase.from('partner_events').delete().eq('id', id);
    if (!error) { setEvents(prev => prev.filter(e => e.id !== id)); toast({ title: 'Event deleted' }); }
  };

  const handleDuplicateEvent = (evt: PartnerEvent) => {
    const { id, created_at, updated_at, ...rest } = evt as any;
    setNewEvent({ ...rest, status: 'draft', title: `${evt.title} (Copy)` });
    const start = parseTimeString(evt.event_time);
    setStartHour(start.hour); setStartMinute(start.minute); setStartAmPm(start.ampm);
    const end = parseTimeString(evt.end_time);
    setEndHour(end.hour); setEndMinute(end.minute); setEndAmPm(end.ampm);
    setEditingEventId(null);
    setActiveTab('events');
    toast({ title: 'Event duplicated as draft' });
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); navigate('/'); };

  const getSubsForCategory = (catId: string | null) => catId ? subcategories.filter(s => s.category_id === catId) : [];

  // Event counts by status
  const eventCounts = {
    draft: events.filter(e => e.status === 'draft').length,
    pending: events.filter(e => e.status === 'pending').length,
    approved: events.filter(e => e.status === 'approved').length,
    rejected: events.filter(e => e.status === 'rejected').length,
    total: events.length,
  };

  const filteredEvents = eventFilter === 'all' ? events : events.filter(e => e.status === eventFilter);

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

  const canSubmitEvents = businessVerificationStatus === 'approved';
  const eventGatingMessage = businessVerificationStatus
    ? (EVENT_GATING_MESSAGES[businessVerificationStatus] ?? EVENT_GATING_MESSAGES.pending)
    : 'We couldn’t verify your business account status. Please contact support before submitting events.';

  const StatusBadge = ({ status }: { status: string }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Dashboard Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                {profile.logo_url ? (
                  <img src={profile.logo_url} alt="" className="w-12 h-12 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-secondary" />
                  </div>
                )}
                <div>
                  <h1 className="font-display text-2xl font-bold text-foreground">Business Dashboard</h1>
                  <p className="text-sm text-muted-foreground">{profile.business_name || 'Set up your business profile'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {profile.slug && (
                  <Button variant="outline" size="sm" onClick={() => navigate(`/partners/${profile.slug}`)}>
                    <Eye className="w-4 h-4 mr-2" /> View Public Page
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="w-4 h-4 mr-2" /> Sign Out
                </Button>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 mb-6">
                <TabsTrigger value="overview"><Building2 className="w-4 h-4 mr-2" />Overview</TabsTrigger>
                <TabsTrigger value="profile"><Building2 className="w-4 h-4 mr-2" />Profile</TabsTrigger>
                <TabsTrigger value="team"><Users className="w-4 h-4 mr-2" />Team</TabsTrigger>
                <TabsTrigger value="events"><Calendar className="w-4 h-4 mr-2" />Events</TabsTrigger>
              </TabsList>

              {/* OVERVIEW TAB */}
              <TabsContent value="overview">
                <div className="space-y-6">
                  {/* Profile Summary Card */}
                  <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
                    <div className="flex items-start gap-4">
                      {profile.logo_url ? (
                        <img src={profile.logo_url} alt="" className="w-16 h-16 rounded-xl object-cover border border-border" />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center">
                          <Building2 className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="font-display text-xl font-bold text-foreground">{profile.business_name || 'Unnamed Business'}</h2>
                          <Badge variant="outline" className="text-xs">
                            {(VERIFICATION_STATUS_CONFIG[profile.verification_status ?? 'pending'] ?? VERIFICATION_STATUS_CONFIG.pending).label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{profile.description || 'No description yet.'}</p>
                        {(profile.city || profile.state) && (
                          <p className="text-sm text-muted-foreground mt-1">{[profile.city, profile.state].filter(Boolean).join(', ')}</p>
                        )}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setActiveTab('profile')}>
                        Edit Profile
                      </Button>
                    </div>
                  </div>

                  {/* Event Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { key: 'draft', label: 'Drafts', count: eventCounts.draft, icon: FileText, color: 'text-muted-foreground' },
                      { key: 'pending', label: 'Pending Review', count: eventCounts.pending, icon: Clock, color: 'text-yellow-600' },
                      { key: 'approved', label: 'Live', count: eventCounts.approved, icon: CheckCircle2, color: 'text-green-600' },
                      { key: 'rejected', label: 'Rejected', count: eventCounts.rejected, icon: XCircle, color: 'text-red-600' },
                    ].map(stat => (
                      <button
                        key={stat.key}
                        onClick={() => { setEventFilter(stat.key); setActiveTab('events'); }}
                        className="bg-card rounded-xl border border-border p-4 text-left hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <stat.icon className={`w-4 h-4 ${stat.color}`} />
                          <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">{stat.count}</p>
                      </button>
                    ))}
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-3">
                    <Button onClick={() => { resetEventForm(); setActiveTab('events'); }} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                      <Plus className="w-4 h-4 mr-2" /> Create New Event
                    </Button>
                    <Button variant="outline" onClick={() => setActiveTab('profile')}>
                      Edit Business Profile
                    </Button>
                  </div>

                  {/* Recent Events */}
                  {events.length > 0 && (
                    <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
                      <h3 className="font-display text-lg font-semibold mb-4">Recent Events</h3>
                      <div className="space-y-3">
                        {events.slice(0, 5).map(evt => (
                          <div key={evt.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                            <div className="flex items-center gap-3">
                              {evt.image_url && <img src={evt.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                              <div>
                                <h4 className="font-semibold text-foreground text-sm">{evt.title}</h4>
                                <p className="text-xs text-muted-foreground">{evt.event_date} {evt.event_time && `at ${evt.event_time}`}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={evt.status} />
                              <Button size="sm" variant="ghost" onClick={() => handleEditEvent(evt)}>Edit</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

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

                    {/* Business Details (optional) */}
                    <div className="sm:col-span-2 pt-2"><h3 className="font-display text-sm font-semibold text-muted-foreground">Business Details (optional)</h3></div>
                    <div className="space-y-2">
                      <Label>Year Established</Label>
                      <Input type="number" value={profile.year_established ?? ''} onChange={e => setProfile({ ...profile, year_established: e.target.value ? Number(e.target.value) : null })} placeholder="2020" />
                    </div>
                    <div className="space-y-2">
                      <Label>Number of Employees</Label>
                      <Select value={profile.employee_count_range || ''} onValueChange={v => setProfile({ ...profile, employee_count_range: v })}>
                        <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                        <SelectContent>{EMPLOYEE_COUNT_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Business Hours</Label>
                      <Input value={profile.business_hours || ''} onChange={e => setProfile({ ...profile, business_hours: e.target.value })} placeholder="e.g. Mon–Fri 9am–5pm, Sat 10am–2pm" />
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
                    <div className="space-y-2">
                      <Label>TikTok</Label>
                      <Input value={profile.social_tiktok || ''} onChange={e => setProfile({ ...profile, social_tiktok: e.target.value })} placeholder="TikTok URL" />
                    </div>

                    {/* Branding */}
                    <div className="sm:col-span-2 pt-2"><h3 className="font-display text-sm font-semibold text-muted-foreground">Branding</h3></div>
                    <div className="space-y-2">
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
                    <div className="space-y-2">
                      <Label>Cover Image (optional)</Label>
                      <div className="flex items-center gap-4">
                        {(profile as any).cover_url && <img src={(profile as any).cover_url} alt="Cover" className="w-24 h-14 rounded-lg object-cover border border-border" />}
                        <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                          <Upload className="w-4 h-4" />
                          <span className="text-sm">{coverFile ? coverFile.name : 'Upload cover'}</span>
                          <input type="file" accept="image/*" className="hidden" onChange={e => setCoverFile(e.target.files?.[0] || null)} />
                        </label>
                      </div>
                    </div>

                    {/* Primary Contact (optional) */}
                    <div className="sm:col-span-2 pt-2"><h3 className="font-display text-sm font-semibold text-muted-foreground">Primary Contact (optional)</h3></div>
                    <div className="space-y-2">
                      <Label>Contact Name</Label>
                      <Input value={profile.primary_contact_name || ''} onChange={e => setProfile({ ...profile, primary_contact_name: e.target.value })} placeholder="Full name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Email</Label>
                      <Input type="email" value={profile.primary_contact_email || ''} onChange={e => setProfile({ ...profile, primary_contact_email: e.target.value })} placeholder="contact@business.com" />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Phone</Label>
                      <Input value={profile.primary_contact_phone || ''} onChange={e => setProfile({ ...profile, primary_contact_phone: e.target.value })} placeholder="(555) 123-4567" />
                    </div>

                    {/* Audience & Marketing (optional) */}
                    <div className="sm:col-span-2 pt-2"><h3 className="font-display text-sm font-semibold text-muted-foreground">Audience &amp; Marketing (optional)</h3></div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Primary Customer Audience</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {CUSTOMER_AUDIENCE_OPTIONS.map(opt => {
                          const selected = ((profile.primary_customer_audience as string[] | null) || []).includes(opt);
                          return (
                            <button
                              type="button"
                              key={opt}
                              onClick={() => toggleProfileListValue('primary_customer_audience', opt)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                selected ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:bg-muted'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      {((profile.primary_customer_audience as string[] | null) || []).includes('Other') && (
                        <Input
                          className="mt-2"
                          value={profile.primary_customer_audience_other || ''}
                          onChange={e => setProfile({ ...profile, primary_customer_audience_other: e.target.value })}
                          placeholder="Describe other audience"
                        />
                      )}
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Primary Marketing Goal</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {MARKETING_GOAL_OPTIONS.map(opt => {
                          const selected = ((profile.primary_marketing_goal as string[] | null) || []).includes(opt);
                          return (
                            <button
                              type="button"
                              key={opt}
                              onClick={() => toggleProfileListValue('primary_marketing_goal', opt)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                selected ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:bg-muted'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      {((profile.primary_marketing_goal as string[] | null) || []).includes('Other') && (
                        <Input
                          className="mt-2"
                          value={profile.primary_marketing_goal_other || ''}
                          onChange={e => setProfile({ ...profile, primary_marketing_goal_other: e.target.value })}
                          placeholder="Describe other goal"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Checkbox
                        id="interested-in-promotions"
                        checked={!!profile.interested_in_promotions}
                        onCheckedChange={checked => setProfile({ ...profile, interested_in_promotions: checked === true })}
                      />
                      <Label htmlFor="interested-in-promotions" className="cursor-pointer font-normal">
                        I'm interested in promotions or featured placement
                      </Label>
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
                {!canSubmitEvents && (
                  <Alert className="mb-6">
                    <AlertTitle>Event submission unavailable</AlertTitle>
                    <AlertDescription>{eventGatingMessage}</AlertDescription>
                  </Alert>
                )}
                {/* Event Form — hidden entirely (not just disabled) when the business
                    isn't approved, so there's nothing to submit through the UI, matching
                    the businesses.verification_status = 'approved' requirement enforced
                    at the RLS layer on partner_events INSERT. */}
                {canSubmitEvents && (
                <div className="bg-card rounded-2xl shadow-sm border border-border p-6 mb-6">
                  <h2 className="font-display text-lg font-semibold mb-4">{editingEventId ? 'Edit Event' : 'Create New Event'}</h2>

                  {/* Show rejection reason if editing a rejected event */}
                  {editingEventId && newEvent.status === 'rejected' && (newEvent as any).moderation_notes && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-sm font-medium text-red-800 dark:text-red-400 mb-1">Rejection Reason:</p>
                      <p className="text-sm text-red-700 dark:text-red-300">{(newEvent as any).moderation_notes}</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-2">Edit and resubmit for review.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Title *</Label>
                      <Input value={newEvent.title || ''} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="Event title" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Description *</Label>
                      <Textarea value={newEvent.description || ''} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} rows={3} />
                    </div>
                    <div className="space-y-2">
                      <Label>Start Date *</Label>
                      <Input
                        type="date"
                        min={getTodayLocalDateString()}
                        value={newEvent.event_date || ''}
                        onChange={e => setNewEvent({ ...newEvent, event_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Start Time *</Label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <Select value={startHour} onValueChange={setStartHour}>
                          <SelectTrigger><SelectValue placeholder="Hr" /></SelectTrigger>
                          <SelectContent>{TIME_HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={startMinute} onValueChange={setStartMinute}>
                          <SelectTrigger><SelectValue placeholder="Min" /></SelectTrigger>
                          <SelectContent>{TIME_MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={startAmPm} onValueChange={setStartAmPm}>
                          <SelectTrigger><SelectValue placeholder="AM/PM" /></SelectTrigger>
                          <SelectContent>{TIME_AMPM.map(ap => <SelectItem key={ap} value={ap}>{ap}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        min={getTodayLocalDateString()}
                        value={newEvent.end_date || ''}
                        onChange={e => setNewEvent({ ...newEvent, end_date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time *</Label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <Select value={endHour} onValueChange={setEndHour}>
                          <SelectTrigger><SelectValue placeholder="Hr" /></SelectTrigger>
                          <SelectContent>{TIME_HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={endMinute} onValueChange={setEndMinute}>
                          <SelectTrigger><SelectValue placeholder="Min" /></SelectTrigger>
                          <SelectContent>{TIME_MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={endAmPm} onValueChange={setEndAmPm}>
                          <SelectTrigger><SelectValue placeholder="AM/PM" /></SelectTrigger>
                          <SelectContent>{TIME_AMPM.map(ap => <SelectItem key={ap} value={ap}>{ap}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Venue Name</Label>
                      <Input value={newEvent.venue_name || ''} onChange={e => setNewEvent({ ...newEvent, venue_name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Venue Address *</Label>
                      <Input value={newEvent.venue_address || ''} onChange={e => setNewEvent({ ...newEvent, venue_address: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Venue City *</Label>
                      <Input value={newEvent.city || ''} onChange={e => setNewEvent({ ...newEvent, city: e.target.value })} placeholder={profile.city || ''} />
                    </div>
                    <div className="space-y-2">
                      <Label>Venue State *</Label>
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
                      <Label>Age Guidance</Label>
                      <Select value={newEvent.age_restriction ? String(newEvent.age_restriction) : 'any'} onValueChange={v => setNewEvent({ ...newEvent, age_restriction: v === 'any' ? null : Number(v) })}>
                        <SelectTrigger><SelectValue placeholder="All Ages" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">All Ages</SelectItem>
                          <SelectItem value="18">18+</SelectItem>
                          <SelectItem value="21">21+</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Price ($)</Label>
                      <Input type="number" value={newEvent.price ?? ''} onChange={e => setNewEvent({ ...newEvent, price: e.target.value ? Number(e.target.value) : null, is_free: !e.target.value || Number(e.target.value) === 0 })} placeholder="0.00 = Free" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Ticket / RSVP URL</Label>
                      <Input value={newEvent.ticket_url || ''} onChange={e => setNewEvent({ ...newEvent, ticket_url: e.target.value })} placeholder="https://..." />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Event Image *</Label>
                      <div
                        className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors cursor-pointer ${
                          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30'
                        }`}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
                        onDrop={e => {
                          e.preventDefault();
                          setDragOver(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file && file.type.startsWith('image/')) setEventImageFile(file);
                        }}
                        onClick={() => eventImageInputRef.current?.click()}
                      >
                        {(newEvent.image_url || eventImageFile) ? (
                          <img
                            src={eventImageFile ? URL.createObjectURL(eventImageFile) : newEvent.image_url || ''}
                            alt="Preview"
                            className="w-24 h-24 rounded-lg object-cover border border-border"
                          />
                        ) : (
                          <Upload className="w-8 h-8 text-muted-foreground" />
                        )}
                        <p className="text-sm text-muted-foreground">
                          {eventImageFile ? eventImageFile.name : 'Drag & drop an image here, or click to browse'}
                        </p>
                        <input
                          ref={eventImageInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => setEventImageFile(e.target.files?.[0] || null)}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Or enter a URL:</p>
                      <Input value={newEvent.image_url || ''} onChange={e => setNewEvent({ ...newEvent, image_url: e.target.value })} placeholder="https://..." />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 mt-6">
                    <Button variant="outline" onClick={() => handleSaveEvent(false)}>
                      <Save className="w-4 h-4 mr-2" /> {editingEventId ? 'Save Changes' : 'Save as Draft'}
                    </Button>
                    <Button onClick={() => handleSaveEvent(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                      <Send className="w-4 h-4 mr-2" /> {editingEventId ? 'Update & Submit for Review' : 'Submit for Review'}
                    </Button>
                    {editingEventId && (
                      <Button variant="ghost" onClick={resetEventForm}>Cancel</Button>
                    )}
                  </div>
                </div>
                )}

                {/* Event List */}
                <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display text-lg font-semibold">Your Events ({filteredEvents.length})</h2>
                    <Select value={eventFilter} onValueChange={setEventFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All ({eventCounts.total})</SelectItem>
                        <SelectItem value="draft">Drafts ({eventCounts.draft})</SelectItem>
                        <SelectItem value="pending">Pending ({eventCounts.pending})</SelectItem>
                        <SelectItem value="approved">Live ({eventCounts.approved})</SelectItem>
                        <SelectItem value="rejected">Rejected ({eventCounts.rejected})</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {filteredEvents.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      {eventFilter === 'all' ? 'No events yet. Create your first event above.' : `No ${eventFilter} events.`}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {filteredEvents.map(evt => (
                        <div key={evt.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {evt.image_url && <img src={evt.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-foreground truncate">{evt.title}</h3>
                                <StatusBadge status={evt.status} />
                              </div>
                              <p className="text-sm text-muted-foreground">{evt.event_date} {evt.event_time && `at ${evt.event_time}`} · {evt.venue_name || evt.city}</p>
                              {evt.status === 'rejected' && (evt as any).moderation_notes && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1">Reason: {(evt as any).moderation_notes}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0 ml-2">
                            <Button size="sm" variant="outline" disabled={!canSubmitEvents} onClick={() => handleEditEvent(evt)}>Edit</Button>
                            <Button size="sm" variant="ghost" disabled={!canSubmitEvents} onClick={() => handleDuplicateEvent(evt)} title="Duplicate">
                              <Plus className="w-4 h-4" />
                            </Button>
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
