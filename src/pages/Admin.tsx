import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, LayoutGrid, BarChart3, Plus, Pencil, Trash2, Save, X, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;
type Category = Tables<'categories'>;
type Subcategory = Tables<'subcategories'>;
type UserRole = Tables<'user_roles'>;

interface UserWithRole extends Profile {
  roles: string[];
}

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
    const [profilesRes, rolesRes, catsRes, subsRes, eventsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('user_roles').select('*'),
      supabase.from('categories').select('*').order('display_order'),
      supabase.from('subcategories').select('*').order('name'),
      supabase.from('events').select('id'),
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
    if (!newCategoryName.trim()) return;
    const slug = newCategoryName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { error } = await supabase.from('categories').insert({
      name: newCategoryName.trim(),
      slug,
      display_order: categories.length + 1,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setNewCategoryName('');
      await loadData();
      toast({ title: 'Category added' });
    }
  };

  const handleUpdateCategory = async (id: string) => {
    if (!editCategoryName.trim()) return;
    const slug = editCategoryName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { error } = await supabase.from('categories').update({ name: editCategoryName.trim(), slug }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setEditingCategory(null);
      await loadData();
      toast({ title: 'Category updated' });
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await loadData();
      toast({ title: 'Category deleted' });
    }
  };

  const handleAddSubcategory = async (categoryId: string) => {
    if (!newSubName.trim()) return;
    const slug = newSubName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const { error } = await supabase.from('subcategories').insert({
      category_id: categoryId,
      name: newSubName.trim(),
      slug,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await loadData();
      toast({ title: 'Subcategory deleted' });
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
                <p className="text-sm text-muted-foreground">Manage users, categories, and view statistics</p>
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
                { label: 'Categories', value: stats.totalCategories, color: 'bg-muted text-muted-foreground' },
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
                          <TableHead>Phone</TableHead>
                          <TableHead>Gender</TableHead>
                          <TableHead>Roles</TableHead>
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
                            <TableCell>{user.phone || '—'}</TableCell>
                            <TableCell className="capitalize">{user.gender || '—'}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {user.roles.map(role => (
                                  <Badge
                                    key={role}
                                    variant={role === 'admin' ? 'destructive' : role === 'business' ? 'secondary' : 'outline'}
                                    className="text-xs"
                                  >
                                    {role}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {new Date(user.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        {users.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users found</TableCell>
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
                              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDeleteCategory(cat.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Subcategories */}
                          <div className="flex flex-wrap gap-2 ml-4">
                            {subs.map(sub => (
                              <Badge key={sub.id} variant="secondary" className="gap-1 pr-1">
                                {sub.name}
                                <button onClick={() => handleDeleteSubcategory(sub.id)} className="ml-1 hover:text-destructive">
                                  <X className="w-3 h-3" />
                                </button>
                              </Badge>
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
                          <p className="text-3xl font-bold text-foreground">{stats.totalUsers}</p>
                          <p className="text-xs text-muted-foreground mt-1">Total Users</p>
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
