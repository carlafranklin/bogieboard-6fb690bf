import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getSafeErrorMessage } from '@/lib/errorUtils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Approve/Reject pending business applications via the existing admin_review_business
// RPC (writes admin_audit_log itself — nothing here duplicates that). After a
// successful RPC call, also mirrors the decision onto the matching partner_profiles
// row: admin_review_business only ever touches businesses/business_applications, and
// partner_profiles (the legacy table PartnerPage.tsx's public profile still reads)
// is otherwise never synced, which is what left every partner's public page
// permanently broken.

interface PendingBusiness {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  created_at: string;
}

export function BusinessApplicationsPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<PendingBusiness[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    setLoadError(null);

    // Cast: 'businesses' isn't in the generated Database Tables type (added by
    // 20260526_bogieboard_phase1_business_schema.sql, generated types not
    // regenerated since) — same pre-existing gap already noted in IngestionHealthPanel.tsx.
    const { data, error } = await supabase
      .from('businesses' as any)
      .select('id, name, slug, description, contact_name, contact_email, contact_phone, website, created_at')
      .eq('verification_status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      setLoadError(error.message);
    } else {
      setBusinesses((data || []) as unknown as PendingBusiness[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // businesses -> business_members(role='owner') -> user_id -> partner_profiles.user_id.
  // Returns false (non-fatal) if no owner or no partner_profiles row is found — the
  // business decision itself has already been saved via the RPC either way.
  const syncPartnerProfile = async (businessId: string, status: 'approved' | 'rejected'): Promise<boolean> => {
    const { data: owner, error: ownerErr } = await supabase
      .from('business_members')
      .select('user_id')
      .eq('business_id', businessId)
      .eq('role', 'owner')
      .maybeSingle();

    if (ownerErr || !owner?.user_id) {
      console.warn('BusinessApplicationsPanel: could not resolve business owner for partner_profiles sync', ownerErr);
      return false;
    }

    const { error: syncErr } = await supabase
      .from('partner_profiles')
      .update({ verification_status: status })
      .eq('user_id', owner.user_id);

    if (syncErr) {
      console.warn('BusinessApplicationsPanel: partner_profiles sync failed', syncErr);
      return false;
    }
    return true;
  };

  const handleDecision = async (business: PendingBusiness, status: 'approved' | 'rejected') => {
    const note = notes[business.id]?.trim() || '';
    if (status === 'rejected' && !note) {
      toast({ title: 'Notes required', description: 'Please provide a reason for rejection.', variant: 'destructive' });
      return;
    }

    setSubmitting(prev => ({ ...prev, [business.id]: true }));
    try {
      // Cast: admin_review_business isn't in the generated Database Functions type
      // (same pre-existing generated-types gap as admin_moderate_event in Admin.tsx).
      const { error } = await (supabase.rpc as any)('admin_review_business', {
        p_business_id: business.id,
        p_status: status,
        p_notes: note || null,
      });

      if (error) {
        toast({ title: 'Error', description: getSafeErrorMessage(error), variant: 'destructive' });
        return;
      }

      const synced = await syncPartnerProfile(business.id, status);

      setNotes(prev => { const n = { ...prev }; delete n[business.id]; return n; });
      await load();
      toast({
        title: status === 'approved' ? 'Business approved' : 'Business rejected',
        description: synced
          ? 'Saved. The partner’s public profile status has been updated to match.'
          : 'Business decision saved, but the partner’s public profile record could not be synced automatically — check manually.',
        variant: synced ? 'default' : 'destructive',
      });
    } finally {
      setSubmitting(prev => ({ ...prev, [business.id]: false }));
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading business applications…
      </div>
    );
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load business applications</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h2 className="font-display text-lg font-semibold mb-1">Business Applications</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Pending business signups awaiting review. Partners already have dashboard access at
        signup — approving here marks the business verified and unlocks their public profile page.
      </p>
      {businesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending business applications.</p>
      ) : (
        <div className="space-y-4">
          {businesses.map(b => (
            <div key={b.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">/{b.slug} · Applied {new Date(b.created_at).toLocaleString()}</p>
                </div>
                <Badge variant="outline">Pending</Badge>
              </div>
              {b.description && <p className="text-sm text-muted-foreground">{b.description}</p>}
              <div className="text-sm grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><span className="text-muted-foreground">Contact: </span>{b.contact_name || '—'}</div>
                <div><span className="text-muted-foreground">Email: </span>{b.contact_email || '—'}</div>
                <div><span className="text-muted-foreground">Phone: </span>{b.contact_phone || '—'}</div>
              </div>
              {b.website && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Website: </span>
                  <a href={b.website} target="_blank" rel="noopener noreferrer" className="text-primary underline">{b.website}</a>
                </p>
              )}
              <Textarea
                placeholder="Notes (required for rejection, optional for approval)"
                value={notes[b.id] || ''}
                onChange={e => setNotes(prev => ({ ...prev, [b.id]: e.target.value }))}
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!!submitting[b.id]}
                  onClick={() => handleDecision(b, 'approved')}
                  className="bg-primary hover:bg-green-dark text-primary-foreground gap-1"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!!submitting[b.id]}
                  onClick={() => handleDecision(b, 'rejected')}
                  className="gap-1"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
