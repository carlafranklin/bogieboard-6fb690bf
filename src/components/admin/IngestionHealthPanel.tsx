import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Read-only Admin panel. Never writes to feed_registry or sources, never
// invokes ingest-dispatcher/ingest-worker, never enables/schedules anything.

const MVP_METROS: { slug: string; label: string }[] = [
  { slug: 'charlotte-nc', label: 'Charlotte' },
  { slug: 'greensboro-nc', label: 'Greensboro/Triad' },
  { slug: 'raleigh-durham-nc', label: 'Raleigh-Durham/Triangle' },
  { slug: 'wilmington-nc', label: 'Wilmington' },
];

// feed_registry.consecutive_failures column comment: "When >= 5, ingest-worker
// sets backoff_until = now() + INTERVAL '24 hours'." Shown as context only —
// the actual backoff decision is read directly from backoff_until below, not
// re-derived from this threshold.
const BACKOFF_TRIGGER_FAILURES = 5;

interface TmFeedRow {
  id: string;
  feed_name: string;
  metro_area_slug: string;
  enabled: boolean;
  last_fetched_at: string | null;
  scrape_interval_hours: number;
  backoff_until: string | null;
  consecutive_failures: number | null;
}

interface FeedRegistryRow extends TmFeedRow {
  feed_type: string;
  source_category: string;
}

type TmHealthStatus = 'not_configured' | 'disabled' | 'backoff' | 'never_fetched' | 'due' | 'healthy';

interface TmMetroHealth {
  metro_area_slug: string;
  metro_label: string;
  feed: TmFeedRow | null;
  status: TmHealthStatus;
  next_due_at: string | null;
}

interface OtherRow {
  origin: 'feed_registry' | 'sources';
  id: string;
  name: string;
  detail: string;
  metro: string | null;
  enabled: boolean;
  last_fetched_at: string | null;
}

const STATUS_META: Record<TmHealthStatus, { label: string; className: string; note?: string }> = {
  not_configured: { label: 'Not Configured', className: 'bg-muted text-muted-foreground' },
  disabled: { label: 'Disabled', className: 'bg-muted text-muted-foreground' },
  backoff: { label: 'Backed Off', className: 'bg-destructive/10 text-destructive', note: 'Paused after repeated failures' },
  never_fetched: { label: 'Never Fetched', className: 'bg-secondary/10 text-secondary' },
  due: { label: 'Due for Next Run', className: 'bg-yellow-light text-yellow-foreground', note: 'Dispatcher is manual-only — expected until triggered' },
  healthy: { label: 'Healthy', className: 'bg-green-light text-green-dark' },
};

function computeStatus(feed: TmFeedRow | null, now: Date): { status: TmHealthStatus; nextDueAt: string | null } {
  if (!feed) return { status: 'not_configured', nextDueAt: null };
  if (!feed.enabled) return { status: 'disabled', nextDueAt: null };
  if (feed.backoff_until && new Date(feed.backoff_until) > now) return { status: 'backoff', nextDueAt: null };
  if (!feed.last_fetched_at) return { status: 'never_fetched', nextDueAt: null };

  const intervalMs = (feed.scrape_interval_hours ?? 12) * 60 * 60 * 1000;
  const nextDueMs = new Date(feed.last_fetched_at).getTime() + intervalMs;
  const nextDueAt = new Date(nextDueMs).toISOString();
  return { status: nextDueMs <= now.getTime() ? 'due' : 'healthy', nextDueAt };
}

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

export function IngestionHealthPanel() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tmHealth, setTmHealth] = useState<TmMetroHealth[]>([]);
  const [otherRows, setOtherRows] = useState<OtherRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);

      const [feedsRes, sourcesRes, metrosRes] = await Promise.all([
        supabase
          .from('feed_registry')
          .select('id, feed_name, feed_type, source_category, metro_area_slug, enabled, last_fetched_at, scrape_interval_hours, backoff_until, consecutive_failures')
          .order('feed_name'),
        supabase
          .from('sources')
          .select('id, name, type, is_active, metro_area_id')
          .order('name'),
        supabase.from('metro_areas').select('id, name, slug'),
      ]);

      if (cancelled) return;

      const firstError = feedsRes.error || sourcesRes.error || metrosRes.error;
      if (firstError) {
        setLoadError(firstError.message);
        setLoading(false);
        return;
      }

      // Cast through unknown: the generated Database type for feed_registry
      // is missing backoff_until/consecutive_failures (real columns, added by
      // 20260528_ingestion_reliability_foundation.sql, already read elsewhere
      // in this codebase) — same pre-existing generated-types gap, not
      // something to fix here.
      const allFeeds = (feedsRes.data || []) as unknown as FeedRegistryRow[];
      const now = new Date();

      // Section 1: Ticketmaster feed for each of the four MVP metros — always
      // exactly four rows, "Not Configured" standing in for any metro without
      // a matching feed_registry row yet.
      const tmFeedBySlug = new Map<string, FeedRegistryRow>();
      for (const feed of allFeeds) {
        if (feed.feed_name.startsWith('Ticketmaster') && MVP_METROS.some(m => m.slug === feed.metro_area_slug)) {
          tmFeedBySlug.set(feed.metro_area_slug, feed);
        }
      }
      const health: TmMetroHealth[] = MVP_METROS.map(m => {
        const feed = tmFeedBySlug.get(m.slug) ?? null;
        const { status, nextDueAt } = computeStatus(feed, now);
        return { metro_area_slug: m.slug, metro_label: m.label, feed, status, next_due_at: nextDueAt };
      });

      // Section 2: everything else. Excludes feed_registry rows already shown
      // above, the per-feed Ticketmaster `sources` rows ingest-worker creates
      // (already represented above via feed_registry), and the internal
      // audit/bookkeeping sources created by other Edge Functions (Feed
      // Health Monitor, Lifecycle Cleanup) — those don't ingest events at all.
      const metroNameBySlug = new Map((metrosRes.data || []).map(m => [m.slug, m.name] as const));
      const metroNameById = new Map((metrosRes.data || []).map(m => [m.id, m.name] as const));

      const shownFeedIds = new Set(health.map(h => h.feed?.id).filter((id): id is string => !!id));
      const otherFeeds: OtherRow[] = allFeeds
        .filter(f => !shownFeedIds.has(f.id))
        .map(f => ({
          origin: 'feed_registry' as const,
          id: f.id,
          name: f.feed_name,
          detail: `${f.feed_type} · ${f.source_category}`,
          metro: metroNameBySlug.get(f.metro_area_slug) ?? f.metro_area_slug,
          enabled: f.enabled,
          last_fetched_at: f.last_fetched_at,
        }));

      const SYSTEM_SOURCE_NAMES = new Set(['Feed Health Monitor', 'Lifecycle Cleanup']);
      const otherSources: OtherRow[] = (sourcesRes.data || [])
        .filter(s => !s.name.startsWith('Ticketmaster') && !SYSTEM_SOURCE_NAMES.has(s.name))
        .map(s => ({
          origin: 'sources' as const,
          id: s.id,
          name: s.name,
          detail: s.type,
          metro: s.metro_area_id ? metroNameById.get(s.metro_area_id) ?? null : null,
          enabled: s.is_active,
          last_fetched_at: null,
        }));

      setTmHealth(health);
      setOtherRows([...otherFeeds, ...otherSources]);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading ingestion health…
      </div>
    );
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load ingestion health</AlertTitle>
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <Alert>
        <AlertTitle>Read-only operations view</AlertTitle>
        <AlertDescription>
          Ticketmaster is the only currently validated, active ingestion pipeline for MVP launch.
          Sources below are shown for visibility only — nothing here is enabled, scheduled, or run
          from this page.
        </AlertDescription>
      </Alert>

      {/* Section 1: Primary Active Source Health */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="font-display text-lg font-semibold mb-1">Ticketmaster Feed Health by Metro</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The four MVP metros. Backoff triggers after {BACKOFF_TRIGGER_FAILURES} consecutive failures.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metro</TableHead>
                <TableHead>Feed Name</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Last Fetched</TableHead>
                <TableHead>Interval (hrs)</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead>Backoff Until</TableHead>
                <TableHead>Consecutive Failures</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tmHealth.map(row => {
                const meta = STATUS_META[row.status];
                return (
                  <TableRow key={row.metro_area_slug}>
                    <TableCell className="font-medium">{row.metro_label}</TableCell>
                    <TableCell>{row.feed?.feed_name ?? '—'}</TableCell>
                    <TableCell>{row.feed ? (row.feed.enabled ? 'Yes' : 'No') : '—'}</TableCell>
                    <TableCell>{fmt(row.feed?.last_fetched_at ?? null)}</TableCell>
                    <TableCell>{row.feed?.scrape_interval_hours ?? '—'}</TableCell>
                    <TableCell>{fmt(row.next_due_at)}</TableCell>
                    <TableCell>{fmt(row.feed?.backoff_until ?? null)}</TableCell>
                    <TableCell>{row.feed?.consecutive_failures ?? '—'}</TableCell>
                    <TableCell>
                      <Badge className={meta.className} variant="outline">{meta.label}</Badge>
                      {meta.note && <p className="text-xs text-muted-foreground mt-1">{meta.note}</p>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Section 2: All Configured Ingestion Sources */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="font-display text-lg font-semibold mb-1">All Configured Ingestion Sources</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Everything else configured in feed_registry / sources. Shown for visibility only — none of
          these are MVP-validated, and none are activated, scheduled, or modified from this page.
        </p>
        {otherRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other configured sources.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Origin</TableHead>
                  <TableHead>Type / Category</TableHead>
                  <TableHead>Metro</TableHead>
                  <TableHead>Enabled / Active</TableHead>
                  <TableHead>Last Fetched</TableHead>
                  <TableHead>Validation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {otherRows.map(row => (
                  <TableRow key={`${row.origin}-${row.id}`}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.origin === 'feed_registry' ? 'feed_registry' : 'sources'}</TableCell>
                    <TableCell>{row.detail}</TableCell>
                    <TableCell>{row.metro ?? '—'}</TableCell>
                    <TableCell>
                      <Badge className={row.enabled ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground'} variant="outline">
                        {row.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell>{fmt(row.last_fetched_at)}</TableCell>
                    <TableCell>
                      <Badge className="bg-muted text-muted-foreground" variant="outline">Unvalidated</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
