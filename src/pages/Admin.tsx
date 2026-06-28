import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, LayoutGrid, BarChart3, Plus, Pencil, Trash2, Save, X, Shield, UserCog, Globe, Loader2, ClipboardCheck, CheckCircle2, XCircle, Eye, Building2, Calendar, Clock, AlertTriangle, RefreshCw, MapPin, Power, PowerOff, Search } from 'lucide-react';
import { getSafeErrorMessage } from '@/lib/errorUtils';
import { categoryNameSchema, subcategoryNameSchema } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;
type Category = Tables<'categories'>;
type Subcategory = Tables<'subcategories'>;
type UserRole = Tables<'user_roles'>;
type FeedRegistry = Tables<'feed_registry'>;
type PartnerEvent = Tables<'partner_events'>;
type MetroArea = Tables<'metro_areas'>;

interface PartnerEventWithProfile extends PartnerEvent {
  partner_profiles: { business_name: string; slug: string } | null;
  categories: { name: string } | null;
}

interface UserWithRole extends Profile {
  roles: string[];
}

const METRO_OPTIONS = [
  { slug: 'charlotte-nc', label: 'Charlotte, NC Metro' },
  { slug: 'greensboro-nc', label: 'Greensboro, NC Metro' },
  { slug: 'raleigh-durham-nc', label: 'Raleigh/Durham, NC Metro' },
];

export default function AdminPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('users');

  // Users state
  const [users, setUsers] = useState<UserWithRole[]>([]);

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);

  // Stats state
  const [stats, setStats] = useState({ totalUsers: 0, generalUsers: 0, businessUsers: 0, adminUsers: 0, totalEvents: 0, totalCategories: 0 });

  // Scrape sources state
  const [scrapeSources, setScrapeSources] = useState<FeedRegistry[]>([]);
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedMetro, setNewFeedMetro] = useState('');
  const [newFeedCity, setNewFeedCity] = useState('');
  

  // Moderation state
  const [pendingEvents, setPendingEvents] = useState<PartnerEventWithProfile[]>([]);
  const [moderationFilter, setModerationFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [moderationNotes, setModerationNotes] = useState<Record<string, string>>({});
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  // Feed health state
  interface FeedHealthItem {
    feed_name: string;
    status: 'healthy' | 'stale' | 'error' | 'never_fetched';
    last_error: string | null;
    hours_since_fetch: number | null;
    metro_area_slug: string;
  }
  const [feedAlerts, setFeedAlerts] = useState<FeedHealthItem[]>([]);
  const [feedHealthLoading, setFeedHealthLoading] = useState(false);

  // Metro Areas state
  interface MetroFormState {
    name: string;
    slug: string;
    core_cities: string;
    included_counties: string;
    included_zip_prefixes: string;
    latitude: string;
    longitude: string;
  }
  const emptyMetroForm: MetroFormState = {
    name: '', slug: '', core_cities: '', included_counties: '', included_zip_prefixes: '', latitude: '', longitude: '',
  };
  const [metros, setMetros] = useState<MetroArea[]>([]);
  const [metrosLoading, setMetrosLoading] = useState(false);
  const [metroSearch, setMetroSearch] = useState('');
  const [editingMetroId, setEditingMetroId] = useState<string | null>(null);
  const [metroForm, setMetroForm] = useState<MetroFormState>(emptyMetroForm);
  const [metroSaving, setMetroSaving] = useState(false);
  const [statusDialog, setStatusDialog] = useState<{ open: boolean; metro: MetroArea | null; target: boolean; reason: string; submitting: boolean }>({
    open: false, metro: null, target: false, reason: '', submitting: false,
  });


  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/auth'); return; }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id);

      const hasAdmin = roles?.some(r => r.role === 'admin');
      if (!hasAdmin) {
        toast({ title: 'Access Denied', description: 'Admin privileges required.', variant: 'destructive' });
        navigate('/');
        return;
      }
      setIsAdmin(true);
      await loadData();
    };
    checkAdmin();
  }, [navigate]);

  const loadData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, catsRes, subsRes, eventsRes, feedsRes, partnerEventsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('*'),
      supabase.from('categories').select('*').order('display_order'),
      supabase.from('subcategories').select('*').order('name'),
      supabase.from('events').select('id'),
      supabase.from('feed_registry').select('*').eq('feed_type', 'html').order('feed_name'),
      supabase.from('partner_events').select('*, partner_profiles!inner(business_name, slug), categories(name)').order('created_at', { ascending: false }),
    ]);

    // Merge profiles with roles
    const profiles = profilesRes.data || [];
    const allRoles = rolesRes.data || [];
    const usersWithRoles: UserWithRole[] = profiles.map(p => ({
      ...p,
      roles: allRoles.filter(r => r.user_id === p.user_id).map(r => r.role),
    }));
    setUsers(usersWithRoles);

    const cats = catsRes.data || [];
    const subs = subsRes.data || [];
    setCategories(cats);
    setSubcategories(subs);
    setScrapeSources(feedsRes.data || []);
    setPendingEvents((partnerEventsRes.data || []) as unknown as PartnerEventWithProfile[]);

    const roleCount = (role: string) => allRoles.filter(r => r.role === role).length;
    setStats({
      totalUsers: profiles.length,
      generalUsers: roleCount('general'),
      businessUsers: roleCount('business'),
      adminUsers: roleCount('admin'),
      totalEvents: eventsRes.data?.length || 0,
      totalCategories: cats.length,
    });

    setLoading(false);

    // Check feed health from feed_registry directly
    checkFeedHealth();
  };

  const checkFeedHealth = async () => {
    setFeedHealthLoading(true);
    try {
      const { data: feeds } = await supabase
        .from('feed_registry')
        .select('feed_name, last_fetched_at, last_error, enabled, metro_area_slug')
        .eq('enabled', true);

      const now = new Date();
      const STALE_HOURS = 48;
      const alerts: FeedHealthItem[] = [];

      for (const feed of feeds || []) {
        let status: FeedHealthItem['status'] = 'healthy';
        let hoursSinceFetch: number | null = null;

        if (!feed.last_fetched_at) {
          status = 'never_fetched';
        } else {
          hoursSinceFetch = Math.round((now.getTime() - new Date(feed.last_fetched_at).getTime()) / (1000 * 60 * 60));
          if (feed.last_error) {
            status = 'error';
          } else if (hoursSinceFetch > STALE_HOURS) {
            status = 'stale';
          }
        }

        if (status !== 'healthy') {
          alerts.push({
            feed_name: feed.feed_name,
            status,
            last_error: feed.last_error,
            hours_since_fetch: hoursSinceFetch,
            metro_area_slug: feed.metro_area_slug,
          });
        }
      }

      setFeedAlerts(alerts);
    } catch (e) {
      console.error('Feed health check error:', e);
    } finally {
      setFeedHealthLoading(false);
    }
  };

  // Moderation handlers
  const handleApproveEvent = async (eventId: string) => {
    const { error } = await supabase.from('partner_events').update({ 
      status: 'approved', 
      moderation_notes: moderationNotes[eventId] || null 
    }).eq('id', eventId);
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      setModerationNotes(prev => { const n = { ...prev }; delete n[eventId]; return n; });
      await loadData();
      toast({ title: 'Event approved', description: 'The event is now live in search results.' });
    }
  };

  const handleRejectEvent = async (eventId: string) => {
    if (!moderationNotes[eventId]?.trim()) {
      toast({ title: 'Notes required', description: 'Please provide a reason for rejection.', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('partner_events').update({ 
      status: 'rejected', 
      moderation_notes: moderationNotes[eventId] 
    }).eq('id', eventId);
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      setModerationNotes(prev => { const n = { ...prev }; delete n[eventId]; return n; });
      await loadData();
      toast({ title: 'Event rejected', description: 'The partner has been notified with your feedback.' });
    }
  };

  const filteredModerationEvents = pendingEvents.filter(e => 
    moderationFilter === 'all' ? true : e.status === moderationFilter
  );

  const moderationCounts = {
    pending: pendingEvents.filter(e => e.status === 'pending').length,
    approved: pendingEvents.filter(e => e.status === 'approved').length,
    rejected: pendingEvents.filter(e => e.status === 'rejected').length,
    all: pendingEvents.length,
  };

  // Category CRUD
  const handleAddCategory = async () => {
    const result = categoryNameSchema.safeParse(newCategoryName);
    if (!result.success) {
      toast({ title: 'Invalid input', description: result.error.errors[0].message, variant: 'destructive' });
      return;
    }
    const name = result.data;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { error } = await supabase.from('categories').insert({
      name,
      slug,
      display_order: categories.length + 1,
    });
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      setNewCategoryName('');
      await loadData();
      toast({ title: 'Category added' });
    }
  };

  const handleUpdateCategory = async (id: string) => {
    const result = categoryNameSchema.safeParse(editCategoryName);
    if (!result.success) {
      toast({ title: 'Invalid input', description: result.error.errors[0].message, variant: 'destructive' });
      return;
    }
    const name = result.data;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { error } = await supabase.from('categories').update({ name, slug }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      setEditingCategory(null);
      await loadData();
      toast({ title: 'Category updated' });
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      await loadData();
      toast({ title: 'Category deleted' });
    }
  };

  const handleAddSubcategory = async (categoryId: string) => {
    const result = subcategoryNameSchema.safeParse(newSubName);
    if (!result.success) {
      toast({ title: 'Invalid input', description: result.error.errors[0].message, variant: 'destructive' });
      return;
    }
    const name = result.data;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { error } = await supabase.from('subcategories').insert({
      category_id: categoryId,
      name,
      slug,
    });
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      setNewSubName('');
      setAddingSubTo(null);
      await loadData();
      toast({ title: 'Subcategory added' });
    }
  };

  const handleDeleteSubcategory = async (id: string) => {
    const { error } = await supabase.from('subcategories').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      await loadData();
      toast({ title: 'Subcategory deleted' });
    }
  };

  const handleAddRole = async (userId: string, role: string) => {
    const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: role as any });
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      await loadData();
      toast({ title: 'Role added', description: `${role} role granted.` });
    }
  };

  const handleRemoveRole = async (userId: string, role: string) => {
    if (role === 'general') {
      toast({ title: 'Cannot remove', description: 'General role cannot be removed.', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role as any);
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      await loadData();
      toast({ title: 'Role removed', description: `${role} role removed.` });
    }
  };

  // Scrape source CRUD
  const handleAddScrapeSource = async () => {
    if (!newFeedName.trim() || !newFeedUrl.trim() || !newFeedMetro) {
      toast({ title: 'Missing fields', description: 'Name, URL, and Metro area are required.', variant: 'destructive' });
      return;
    }
    try {
      new URL(newFeedUrl);
    } catch {
      toast({ title: 'Invalid URL', description: 'Please enter a valid URL.', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('feed_registry').insert({
      feed_name: newFeedName.trim(),
      feed_url: newFeedUrl.trim(),
      feed_type: 'html' as any,
      metro_area_slug: newFeedMetro,
      default_city: newFeedCity.trim() || null,
      default_state: 'NC',
      source_category: 'other' as any,
      enabled: true,
    });
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      setNewFeedName('');
      setNewFeedUrl('');
      setNewFeedMetro('');
      setNewFeedCity('');
      await loadData();
      toast({ title: 'Scrape source added' });
    }
  };

  const handleDeleteScrapeSource = async (id: string) => {
    const { error } = await supabase.from('feed_registry').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      await loadData();
      toast({ title: 'Scrape source deleted' });
    }
  };

  const handleToggleScrapeSource = async (id: string, enabled: boolean) => {
    const { error } = await supabase.from('feed_registry').update({ enabled: !enabled }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      await loadData();
      toast({ title: enabled ? 'Source disabled' : 'Source enabled' });
    }
  };

  const handleUpdateInterval = async (id: string, hours: number) => {
    const { error } = await supabase.from('feed_registry').update({ scrape_interval_hours: hours }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      await loadData();
      toast({ title: 'Frequency updated' });
    }
  };


  // -------- Metro Areas --------
  const loadMetros = async () => {
    setMetrosLoading(true);
    const { data, error } = await supabase.from('metro_areas').select('*').order('name');
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
    } else {
      setMetros((data as MetroArea[]) || []);
    }
    setMetrosLoading(false);
  };

  useEffect(() => {
    if (isAdmin && activeTab === 'metros') {
      loadMetros();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, activeTab]);

  const jsonbToCsv = (v: unknown): string => {
    if (Array.isArray(v)) return v.map(String).join(', ');
    return '';
  };
  const parseCsvList = (s: string): string[] =>
    s.split(',').map(x => x.trim()).filter(Boolean);

  const openCreateMetro = () => {
    setMetroForm(emptyMetroForm);
    setEditingMetroId('new');
  };

  const openEditMetro = (m: MetroArea) => {
    setMetroForm({
      name: m.name ?? '',
      slug: m.slug ?? '',
      core_cities: jsonbToCsv(m.core_cities),
      included_counties: jsonbToCsv(m.included_counties),
      included_zip_prefixes: jsonbToCsv(m.included_zip_prefixes),
      latitude: m.latitude != null ? String(m.latitude) : '',
      longitude: m.longitude != null ? String(m.longitude) : '',
    });
    setEditingMetroId(m.id);
  };

  const cancelMetroEdit = () => {
    setEditingMetroId(null);
    setMetroForm(emptyMetroForm);
  };

  const saveMetro = async () => {
    const name = metroForm.name.trim();
    const slug = metroForm.slug.trim().toLowerCase();
    if (!name) {
      toast({ title: 'Validation', description: 'Name is required.', variant: 'destructive' });
      return;
    }
    if (editingMetroId === 'new' && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      toast({ title: 'Validation', description: 'Slug must use lowercase letters and digits separated by single hyphens, with no leading, trailing, or consecutive hyphens.', variant: 'destructive' });
      return;
    }
    const cities = parseCsvList(metroForm.core_cities);
    if (cities.length === 0) {
      toast({ title: 'Validation', description: 'At least one core city is required.', variant: 'destructive' });
      return;
    }
    const lat = metroForm.latitude.trim() === '' ? null : Number(metroForm.latitude);
    const lon = metroForm.longitude.trim() === '' ? null : Number(metroForm.longitude);
    if (lat !== null && Number.isNaN(lat)) {
      toast({ title: 'Validation', description: 'Latitude must be a number.', variant: 'destructive' });
      return;
    }
    if (lon !== null && Number.isNaN(lon)) {
      toast({ title: 'Validation', description: 'Longitude must be a number.', variant: 'destructive' });
      return;
    }

    if (!editingMetroId) return;

    setMetroSaving(true);
    const { error } = editingMetroId === 'new'
      ? await supabase.rpc('admin_create_metro', {
          p_name:                  name,
          p_slug:                  slug,
          p_core_cities:           cities,
          p_included_counties:     parseCsvList(metroForm.included_counties),
          p_included_zip_prefixes: parseCsvList(metroForm.included_zip_prefixes),
          p_latitude:              lat,
          p_longitude:             lon,
        })
      : await supabase.rpc('admin_update_metro', {
          p_metro_id:              editingMetroId,
          p_name:                  name,
          p_core_cities:           cities,
          p_included_counties:     parseCsvList(metroForm.included_counties),
          p_included_zip_prefixes: parseCsvList(metroForm.included_zip_prefixes),
          p_latitude:              lat,
          p_longitude:             lon,
        });
    setMetroSaving(false);

    if (error) {
      const code = (error as { code?: string }).code;
      const msg = code === '23505'
        ? 'A metro with that name or slug already exists.'
        : getSafeErrorMessage(error);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved', description: editingMetroId === 'new' ? 'Metro area created.' : 'Metro area updated.' });
    cancelMetroEdit();
    await loadMetros();
  };

  const requestStatusChange = (m: MetroArea, target: boolean) => {
    setStatusDialog({ open: true, metro: m, target, reason: '', submitting: false });
  };

  const submitStatusChange = async () => {
    const { metro, target, reason } = statusDialog;
    if (!metro) return;
    if (!target && reason.trim().length < 3) return;

    setStatusDialog(s => ({ ...s, submitting: true }));
    const { error } = await supabase.rpc('admin_set_metro_active', {
      p_metro_id: metro.id,
      p_active:   target,
      p_reason:   target ? null : reason.trim(),
    });
    if (error) {
      toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
      setStatusDialog(s => ({ ...s, submitting: false }));
      return;
    }
    toast({ title: 'Updated', description: target ? 'Metro area activated.' : 'Metro area deactivated.' });
    setStatusDialog({ open: false, metro: null, target: false, reason: '', submitting: false });
    await loadMetros();
  };

  const filteredMetros = metros.filter(m => {
    const q = metroSearch.trim().toLowerCase();
    if (!q) return true;
    return (m.name?.toLowerCase().includes(q) || m.slug?.toLowerCase().includes(q));
  });



  if (!isAdmin || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16 px-4 flex items-center justify-center">
          <p className="text-muted-foreground">{loading ? 'Loading...' : 'Checking access...'}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold text-foreground">Admin Dashboard</h1>
                <p className="text-sm text-muted-foreground">Manage users, categories, scrape sources, and view statistics</p>
              </div>
            </div>

            {/* Feed Health Alerts */}
            {feedAlerts.length > 0 && (
              <Alert variant="destructive" className="mb-6">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Feed Health Issues ({feedAlerts.length} feed{feedAlerts.length > 1 ? 's' : ''})</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 space-y-1">
                    {feedAlerts.map((alert, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className={`inline-block w-2 h-2 rounded-full ${
                          alert.status === 'error' ? 'bg-destructive' : alert.status === 'stale' ? 'bg-yellow-500' : 'bg-muted-foreground'
                        }`} />
                        <span className="font-medium">{alert.feed_name}</span>
                        <span className="text-muted-foreground">({alert.metro_area_slug})</span>
                        <span>—</span>
                        <span>
                          {alert.status === 'error' && (alert.last_error || 'Unknown error')}
                          {alert.status === 'stale' && `No data in ${alert.hours_since_fetch}h`}
                          {alert.status === 'never_fetched' && 'Never fetched'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setActiveTab('scrape')}
                  >
                    <Globe className="w-3 h-3 mr-1" />
                    Go to Scrape Sources
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              {[
                { label: 'Total Users', value: stats.totalUsers, color: 'bg-primary/10 text-primary' },
                { label: 'General', value: stats.generalUsers, color: 'bg-green-light text-green-dark' },
                { label: 'Business', value: stats.businessUsers, color: 'bg-purple-light text-purple-dark' },
                { label: 'Admins', value: stats.adminUsers, color: 'bg-yellow-light text-yellow-foreground' },
                { label: 'Events', value: stats.totalEvents, color: 'bg-secondary/10 text-secondary' },
                { label: 'Scrape Sources', value: scrapeSources.length, color: 'bg-muted text-muted-foreground' },
              ].map(stat => (
                <div key={stat.label} className="bg-card rounded-xl border border-border p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className={`text-xs font-medium mt-1 ${stat.color} inline-block px-2 py-0.5 rounded-full`}>{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="users" className="gap-2"><Users className="w-4 h-4" />Users</TabsTrigger>
                <TabsTrigger value="moderation" className="gap-2">
                  <ClipboardCheck className="w-4 h-4" />Moderation
                  {moderationCounts.pending > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{moderationCounts.pending}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="categories" className="gap-2"><LayoutGrid className="w-4 h-4" />Categories</TabsTrigger>
                <TabsTrigger value="scrape" className="gap-2"><Globe className="w-4 h-4" />Scrape Sources</TabsTrigger>
                <TabsTrigger value="metros" className="gap-2"><MapPin className="w-4 h-4" />Metro Areas</TabsTrigger>
                <TabsTrigger value="stats" className="gap-2"><BarChart3 className="w-4 h-4" />Statistics</TabsTrigger>
              </TabsList>

              {/* Users Tab */}
              <TabsContent value="users">
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Roles</TableHead>
                          <TableHead>Manage Role</TableHead>
                          <TableHead>Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map(user => (
                           <TableRow key={user.id}>
                            <TableCell className="font-medium">
                              {user.first_name || user.last_name
                                ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                                : '—'}
                            </TableCell>
                            <TableCell>{user.email || '—'}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {user.roles.map(role => (
                                  role !== 'general' ? (
                                    <AlertDialog key={role}>
                                      <AlertDialogTrigger asChild>
                                        <Badge
                                          variant={role === 'admin' ? 'destructive' : 'secondary'}
                                          className="text-xs cursor-pointer gap-1"
                                          title={`Click to remove ${role} role`}
                                        >
                                          {role}
                                          <X className="w-3 h-3" />
                                        </Badge>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Remove {role} role?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            This will remove the <strong>{role}</strong> role from {user.first_name || user.email || 'this user'}. They will lose access to {role}-level features.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleRemoveRole(user.user_id, role)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  ) : (
                                    <Badge key={role} variant="outline" className="text-xs" title="Cannot remove general role">
                                      {role}
                                    </Badge>
                                  )
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select onValueChange={(val) => handleAddRole(user.user_id, val)}>
                                <SelectTrigger className="w-32 h-8 text-xs">
                                  <SelectValue placeholder="Add role..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {['business', 'admin'].filter(r => !user.roles.includes(r)).map(role => (
                                    <SelectItem key={role} value={role} className="text-xs capitalize">{role}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {new Date(user.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        {users.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No users found</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              {/* Categories Tab */}
              <TabsContent value="categories">
                <div className="bg-card rounded-xl border border-border p-6">
                  {/* Add Category */}
                  <div className="flex gap-2 mb-6">
                    <Input
                      placeholder="New category name..."
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                      className="max-w-xs"
                    />
                    <Button onClick={handleAddCategory} size="sm" className="bg-primary hover:bg-green-dark text-primary-foreground">
                      <Plus className="w-4 h-4 mr-1" />Add Category
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {categories.map(cat => {
                      const subs = subcategories.filter(s => s.category_id === cat.id);
                      return (
                        <div key={cat.id} className="border border-border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            {editingCategory === cat.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editCategoryName}
                                  onChange={e => setEditCategoryName(e.target.value)}
                                  className="w-48"
                                  onKeyDown={e => e.key === 'Enter' && handleUpdateCategory(cat.id)}
                                />
                                <Button size="icon" variant="ghost" onClick={() => handleUpdateCategory(cat.id)}>
                                  <Save className="w-4 h-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => setEditingCategory(null)}>
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <h3 className="font-semibold text-foreground">{cat.name}</h3>
                            )}
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => { setEditingCategory(cat.id); setEditCategoryName(cat.name); }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="text-destructive">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete "{cat.name}"?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete this category and may affect associated events. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteCategory(cat.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>

                          {/* Subcategories */}
                          <div className="flex flex-wrap gap-2 ml-4">
                            {subs.map(sub => (
                              <AlertDialog key={sub.id}>
                                <Badge variant="secondary" className="gap-1 pr-1">
                                  {sub.name}
                                  <AlertDialogTrigger asChild>
                                    <button className="ml-1 hover:text-destructive">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </AlertDialogTrigger>
                                </Badge>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete "{sub.name}"?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete this subcategory. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteSubcategory(sub.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            ))}
                            {addingSubTo === cat.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={newSubName}
                                  onChange={e => setNewSubName(e.target.value)}
                                  placeholder="Subcategory..."
                                  className="h-7 w-32 text-xs"
                                  onKeyDown={e => e.key === 'Enter' && handleAddSubcategory(cat.id)}
                                  autoFocus
                                />
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleAddSubcategory(cat.id)}>
                                  <Save className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setAddingSubTo(null); setNewSubName(''); }}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs px-2"
                                onClick={() => setAddingSubTo(cat.id)}
                              >
                                <Plus className="w-3 h-3 mr-1" />Add
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              {/* Scrape Sources Tab */}
              <TabsContent value="scrape">
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="font-display text-lg font-semibold text-foreground">HTML Scrape Sources</h2>
                    <Button onClick={handleRunScraper} disabled={scrapeRunning} size="sm" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
                      {scrapeRunning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Globe className="w-4 h-4 mr-1" />}
                      {scrapeRunning ? 'Scraping...' : 'Run Scraper Now'}
                    </Button>
                  </div>

                  {/* Add New Source */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-6 p-4 bg-muted/30 rounded-lg border border-border">
                    <Input placeholder="Source name" value={newFeedName} onChange={e => setNewFeedName(e.target.value)} />
                    <Input placeholder="URL (https://...)" value={newFeedUrl} onChange={e => setNewFeedUrl(e.target.value)} />
                    <Select value={newFeedMetro} onValueChange={setNewFeedMetro}>
                      <SelectTrigger><SelectValue placeholder="Metro area" /></SelectTrigger>
                      <SelectContent>
                        {METRO_OPTIONS.map(m => (
                          <SelectItem key={m.slug} value={m.slug}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Default city (optional)" value={newFeedCity} onChange={e => setNewFeedCity(e.target.value)} />
                    <Button onClick={handleAddScrapeSource} className="bg-primary hover:bg-green-dark text-primary-foreground">
                      <Plus className="w-4 h-4 mr-1" />Add Source
                    </Button>
                  </div>

                  {/* Sources Table */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>URL</TableHead>
                          <TableHead>Metro</TableHead>
                          <TableHead>City</TableHead>
                         <TableHead>Status</TableHead>
                          <TableHead>Frequency</TableHead>
                          <TableHead>Last Scraped</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scrapeSources.map(source => (
                          <TableRow key={source.id}>
                            <TableCell className="font-medium">{source.feed_name}</TableCell>
                            <TableCell>
                              <a href={source.feed_url} target="_blank" rel="noopener noreferrer" className="text-secondary hover:underline text-sm truncate block max-w-[200px]">
                                {source.feed_url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                              </a>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {METRO_OPTIONS.find(m => m.slug === source.metro_area_slug)?.label.split(',')[0] || source.metro_area_slug}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{source.default_city || '—'}</TableCell>
                            <TableCell>
                              <Badge
                                variant={source.enabled ? 'default' : 'secondary'}
                                className={`text-xs cursor-pointer ${source.enabled ? 'bg-primary/80' : ''}`}
                                onClick={() => handleToggleScrapeSource(source.id, source.enabled)}
                              >
                                {source.enabled ? 'Active' : 'Disabled'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={String(source.scrape_interval_hours ?? 12)}
                                onValueChange={(val) => handleUpdateInterval(source.id, Number(val))}
                              >
                                <SelectTrigger className="h-8 w-[130px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">Every hour</SelectItem>
                                  <SelectItem value="2">Every 2 hours</SelectItem>
                                  <SelectItem value="4">Every 4 hours</SelectItem>
                                  <SelectItem value="6">Every 6 hours</SelectItem>
                                  <SelectItem value="8">Every 8 hours</SelectItem>
                                  <SelectItem value="12">Every 12 hours</SelectItem>
                                  <SelectItem value="24">Daily</SelectItem>
                                  <SelectItem value="48">Every 2 days</SelectItem>
                                  <SelectItem value="72">Every 3 days</SelectItem>
                                  <SelectItem value="168">Weekly</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {source.last_fetched_at
                                ? new Date(source.last_fetched_at).toLocaleDateString()
                                : 'Never'}
                              {source.last_error && (
                                <span className="block text-xs text-destructive truncate max-w-[150px]" title={source.last_error}>
                                  Error: {source.last_error}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="text-destructive h-8 w-8">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete "{source.feed_name}"?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will remove this scrape source. Events already scraped will remain in the database.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteScrapeSource(source.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        ))}
                        {scrapeSources.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No scrape sources configured</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              {/* Moderation Tab */}
              <TabsContent value="moderation">
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="font-display text-lg font-semibold text-foreground">Partner Event Moderation</h2>
                    <div className="flex gap-2">
                      {([
                        { key: 'pending', label: 'Pending', count: moderationCounts.pending },
                        { key: 'approved', label: 'Approved', count: moderationCounts.approved },
                        { key: 'rejected', label: 'Rejected', count: moderationCounts.rejected },
                        { key: 'all', label: 'All', count: moderationCounts.all },
                      ] as const).map(f => (
                        <Button
                          key={f.key}
                          size="sm"
                          variant={moderationFilter === f.key ? 'default' : 'outline'}
                          onClick={() => setModerationFilter(f.key)}
                          className="text-xs"
                        >
                          {f.label} ({f.count})
                        </Button>
                      ))}
                    </div>
                  </div>

                  {filteredModerationEvents.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No {moderationFilter === 'all' ? '' : moderationFilter} events to review</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredModerationEvents.map(event => (
                        <div key={event.id} className="border border-border rounded-lg overflow-hidden">
                          <div
                            className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                          >
                            {event.image_url && (
                              <img src={event.image_url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-foreground truncate">{event.title}</h3>
                                <Badge
                                  variant={event.status === 'approved' ? 'default' : event.status === 'rejected' ? 'destructive' : 'secondary'}
                                  className="text-xs flex-shrink-0"
                                >
                                  {event.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {event.partner_profiles?.business_name || 'Unknown'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {new Date(event.event_date).toLocaleDateString()}
                                </span>
                                {event.event_time && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {event.event_time}
                                  </span>
                                )}
                                {event.categories?.name && (
                                  <Badge variant="outline" className="text-xs">{event.categories.name}</Badge>
                                )}
                              </div>
                            </div>
                            <Eye className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                          </div>

                          {expandedEvent === event.id && (
                            <div className="border-t border-border p-4 bg-muted/10 space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground font-medium">Description</Label>
                                  <p className="text-sm text-foreground">{event.description || 'No description provided'}</p>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs text-muted-foreground font-medium">Venue & Location</Label>
                                  <p className="text-sm text-foreground">
                                    {[event.venue_name, event.venue_address, event.city, event.state, event.zip_code].filter(Boolean).join(', ') || 'Not specified'}
                                  </p>
                                  <Label className="text-xs text-muted-foreground font-medium">Pricing</Label>
                                  <p className="text-sm text-foreground">
                                    {event.is_free ? 'Free' : event.price ? `$${event.price}` : 'Not specified'}
                                  </p>
                                  {event.ticket_url && (
                                    <>
                                      <Label className="text-xs text-muted-foreground font-medium">Ticket URL</Label>
                                      <a href={event.ticket_url} target="_blank" rel="noopener noreferrer" className="text-sm text-secondary hover:underline block truncate">{event.ticket_url}</a>
                                    </>
                                  )}
                                  {event.age_restriction && (
                                    <>
                                      <Label className="text-xs text-muted-foreground font-medium">Age Restriction</Label>
                                      <p className="text-sm text-foreground">{event.age_restriction}+</p>
                                    </>
                                  )}
                                </div>
                              </div>

                              {event.moderation_notes && event.status !== 'pending' && (
                                <div className="bg-muted/50 rounded-lg p-3">
                                  <Label className="text-xs text-muted-foreground font-medium">Previous Moderation Notes</Label>
                                  <p className="text-sm text-foreground mt-1">{event.moderation_notes}</p>
                                </div>
                              )}

                              <div className="space-y-2">
                                <Label className="text-sm font-medium">Moderation Notes</Label>
                                <Textarea
                                  placeholder={event.status === 'pending' ? 'Add notes (required for rejection, optional for approval)...' : 'Update moderation notes...'}
                                  value={moderationNotes[event.id] || ''}
                                  onChange={e => setModerationNotes(prev => ({ ...prev, [event.id]: e.target.value }))}
                                  className="min-h-[80px]"
                                />
                              </div>

                              <div className="flex gap-2 justify-end">
                                {event.status !== 'approved' && (
                                  <Button
                                    onClick={() => handleApproveEvent(event.id)}
                                    className="bg-primary hover:bg-green-dark text-primary-foreground gap-1"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Approve
                                  </Button>
                                )}
                                {event.status !== 'rejected' && (
                                  <Button
                                    onClick={() => handleRejectEvent(event.id)}
                                    variant="destructive"
                                    className="gap-1"
                                  >
                                    <XCircle className="w-4 h-4" />
                                    Reject
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Stats Tab */}
              <TabsContent value="stats">
                <div className="bg-card rounded-xl border border-border p-6">
                  <h2 className="font-display text-lg font-semibold mb-4">Platform Statistics</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h3 className="font-medium text-foreground">User Breakdown</h3>
                      {[
                        { label: 'General Users', value: stats.generalUsers, pct: stats.totalUsers ? Math.round((stats.generalUsers / stats.totalUsers) * 100) : 0 },
                        { label: 'Business Users', value: stats.businessUsers, pct: stats.totalUsers ? Math.round((stats.businessUsers / stats.totalUsers) * 100) : 0 },
                        { label: 'Admin Users', value: stats.adminUsers, pct: stats.totalUsers ? Math.round((stats.adminUsers / stats.totalUsers) * 100) : 0 },
                      ].map(item => (
                        <div key={item.label}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground">{item.label}</span>
                            <span className="font-medium">{item.value} ({item.pct}%)</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${item.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <h3 className="font-medium text-foreground">Content</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-muted/50 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold text-foreground">{stats.totalEvents}</p>
                          <p className="text-xs text-muted-foreground mt-1">Total Events</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold text-foreground">{stats.totalCategories}</p>
                          <p className="text-xs text-muted-foreground mt-1">Categories</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold text-foreground">{subcategories.length}</p>
                          <p className="text-xs text-muted-foreground mt-1">Subcategories</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-4 text-center">
                          <p className="text-3xl font-bold text-foreground">{scrapeSources.length}</p>
                          <p className="text-xs text-muted-foreground mt-1">Scrape Sources</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Note: Site visit analytics (bounce rate, page views) will be available via external analytics integration.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Metro Areas Tab */}
              <TabsContent value="metros">
                <div className="bg-card rounded-xl border border-border p-6 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                        <MapPin className="w-5 h-5" />Metro Areas
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">Manage supported metro regions. Records can be deactivated but not deleted.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                        <Input
                          value={metroSearch}
                          onChange={e => setMetroSearch(e.target.value)}
                          placeholder="Search name or slug…"
                          className="pl-8 w-56"
                        />
                      </div>
                      <Button onClick={openCreateMetro} disabled={editingMetroId !== null} className="gap-2">
                        <Plus className="w-4 h-4" />Add Metro Area
                      </Button>
                    </div>
                  </div>

                  {editingMetroId !== null && (
                    <div className="border border-border rounded-lg p-4 bg-muted/30 space-y-4">
                      <h3 className="font-medium text-foreground">
                        {editingMetroId === 'new' ? 'Add Metro Area' : 'Edit Metro Area'}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="metro-name">Name *</Label>
                          <Input id="metro-name" value={metroForm.name} onChange={e => setMetroForm({ ...metroForm, name: e.target.value })} />
                        </div>
                        <div>
                          {editingMetroId === 'new' ? (
                            <>
                              <Label htmlFor="metro-slug">Slug * <span className="text-xs text-muted-foreground">(lowercase, hyphens — cannot be changed later)</span></Label>
                              <Input
                                id="metro-slug"
                                value={metroForm.slug}
                                onChange={e => setMetroForm({ ...metroForm, slug: e.target.value })}
                                onBlur={e => setMetroForm(f => ({ ...f, slug: e.target.value.trim().toLowerCase() }))}
                              />
                            </>
                          ) : (
                            <>
                              <Label htmlFor="metro-slug">Slug <span className="text-xs text-muted-foreground">(cannot be changed)</span></Label>
                              <Input id="metro-slug" value={metroForm.slug} readOnly disabled className="opacity-60 cursor-not-allowed" />
                            </>
                          )}
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="metro-cities">Core cities (comma-separated)</Label>
                          <Input id="metro-cities" value={metroForm.core_cities} onChange={e => setMetroForm({ ...metroForm, core_cities: e.target.value })} placeholder="Charlotte, Concord, Gastonia" />
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="metro-counties">Included counties (comma-separated)</Label>
                          <Input id="metro-counties" value={metroForm.included_counties} onChange={e => setMetroForm({ ...metroForm, included_counties: e.target.value })} placeholder="Mecklenburg, Cabarrus" />
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="metro-zips">Included ZIP prefixes (comma-separated)</Label>
                          <Input id="metro-zips" value={metroForm.included_zip_prefixes} onChange={e => setMetroForm({ ...metroForm, included_zip_prefixes: e.target.value })} placeholder="280, 281" />
                        </div>
                        <div>
                          <Label htmlFor="metro-lat">Latitude</Label>
                          <Input id="metro-lat" value={metroForm.latitude} onChange={e => setMetroForm({ ...metroForm, latitude: e.target.value })} />
                        </div>
                        <div>
                          <Label htmlFor="metro-lon">Longitude</Label>
                          <Input id="metro-lon" value={metroForm.longitude} onChange={e => setMetroForm({ ...metroForm, longitude: e.target.value })} />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={cancelMetroEdit} disabled={metroSaving}>
                          <X className="w-4 h-4 mr-1" />Cancel
                        </Button>
                        <Button onClick={saveMetro} disabled={metroSaving}>
                          {metroSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                          Save
                        </Button>
                      </div>
                    </div>
                  )}

                  {metrosLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading metro areas…
                    </div>
                  ) : metros.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">No metro areas yet.</div>
                  ) : filteredMetros.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">No matches for "{metroSearch}".</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Slug</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Cities</TableHead>
                            <TableHead>Counties</TableHead>
                            <TableHead>Updated</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredMetros.map(m => {
                            const cities = Array.isArray(m.core_cities) ? m.core_cities.length : 0;
                            const counties = Array.isArray(m.included_counties) ? m.included_counties.length : 0;
                            return (
                              <TableRow key={m.id}>
                                <TableCell className="font-medium">{m.name}</TableCell>
                                <TableCell className="font-mono text-xs">{m.slug}</TableCell>
                                <TableCell>
                                  {m.is_active ? (
                                    <Badge variant="default">Active</Badge>
                                  ) : (
                                    <Badge variant="secondary">Inactive</Badge>
                                  )}
                                </TableCell>
                                <TableCell>{cities}</TableCell>
                                <TableCell>{counties}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {m.updated_at ? new Date(m.updated_at).toLocaleDateString() : '—'}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="inline-flex gap-1">
                                    <Button size="sm" variant="outline" onClick={() => openEditMetro(m)} disabled={editingMetroId !== null}>
                                      <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                                    </Button>
                                    {m.is_active ? (
                                      <Button size="sm" variant="outline" onClick={() => requestStatusChange(m, false)}>
                                        <PowerOff className="w-3.5 h-3.5 mr-1" />Deactivate
                                      </Button>
                                    ) : (
                                      <Button size="sm" variant="outline" onClick={() => requestStatusChange(m, true)}>
                                        <Power className="w-3.5 h-3.5 mr-1" />Activate
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <AlertDialog
                  open={statusDialog.open}
                  onOpenChange={(open) => { if (!open && !statusDialog.submitting) setStatusDialog({ open: false, metro: null, target: false, reason: '', submitting: false }); }}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {statusDialog.target ? 'Activate metro area?' : 'Deactivate metro area?'}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {statusDialog.target
                          ? <>This will make <strong>{statusDialog.metro?.name}</strong> active again.</>
                          : <>This will deactivate <strong>{statusDialog.metro?.name}</strong>. A reason is required and will be recorded in the audit log.</>}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {!statusDialog.target && (
                      <div className="space-y-2">
                        <Label htmlFor="deact-reason">Reason (min 3 characters)</Label>
                        <Textarea
                          id="deact-reason"
                          value={statusDialog.reason}
                          onChange={e => setStatusDialog(s => ({ ...s, reason: e.target.value }))}
                          placeholder="Why is this being deactivated?"
                          rows={3}
                        />
                      </div>
                    )}
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={statusDialog.submitting}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); submitStatusChange(); }}
                        disabled={statusDialog.submitting || (!statusDialog.target && statusDialog.reason.trim().length < 3)}
                      >
                        {statusDialog.submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                        {statusDialog.target ? 'Activate' : 'Deactivate'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
