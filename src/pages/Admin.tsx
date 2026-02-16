import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, LayoutGrid, BarChart3, Plus, Pencil, Trash2, Save, X, Shield, UserCog, Globe, Loader2 } from 'lucide-react';
import { getSafeErrorMessage } from '@/lib/errorUtils';
import { categoryNameSchema, subcategoryNameSchema } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
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
  const [scrapeRunning, setScrapeRunning] = useState(false);

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
    const [profilesRes, rolesRes, catsRes, subsRes, eventsRes, feedsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('*'),
      supabase.from('categories').select('*').order('display_order'),
      supabase.from('subcategories').select('*').order('name'),
      supabase.from('events').select('id'),
      supabase.from('feed_registry').select('*').eq('feed_type', 'html').order('feed_name'),
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

  const handleRunScraper = async () => {
    setScrapeRunning(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      const data = await resp.json();
      if (data.success) {
        const totalCreated = data.results?.reduce((sum: number, r: any) => sum + (r.created || 0), 0) || 0;
        const totalFound = data.results?.reduce((sum: number, r: any) => sum + (r.events_found || 0), 0) || 0;
        toast({ title: 'Scrape complete', description: `Found ${totalFound} events, created ${totalCreated} new.` });
      } else {
        toast({ title: 'Scrape error', description: data.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to run scraper.', variant: 'destructive' });
    } finally {
      setScrapeRunning(false);
    }
  };

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
                <TabsTrigger value="categories" className="gap-2"><LayoutGrid className="w-4 h-4" />Categories</TabsTrigger>
                <TabsTrigger value="scrape" className="gap-2"><Globe className="w-4 h-4" />Scrape Sources</TabsTrigger>
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
            </Tabs>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}