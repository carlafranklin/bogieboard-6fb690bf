// supabase/functions/ingest-dispatcher/index.ts
//
// Reads feed_registry for feeds that are due and inserts one pending
// ingest_queue row per due feed. Does NO external HTTP fetching.
//
// Required secret:
//   BOGIEBOARD_SERVICE_ROLE_KEY — the service_role JWT for your Supabase project.
//   Add it in the Supabase Dashboard:
//     Project Settings → Edge Functions → Secrets → Add secret
//     Name:  BOGIEBOARD_SERVICE_ROLE_KEY
//     Value: <service_role JWT from Project Settings → API>
//
//   "SUPABASE_" is a reserved prefix in the Dashboard secret manager.
//   BOGIEBOARD_SERVICE_ROLE_KEY uses a non-reserved prefix and can be
//   created without restriction.
//
//   SUPABASE_URL is injected automatically by the runtime — do not set it.

import { createClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedRow {
  id: string;
  feed_name: string;
  scrape_interval_hours: number;
  last_fetched_at: string | null;
  backoff_until: string | null;
}

interface QueueInsertRow {
  feed_id: string;
  status: "pending";
  next_run_at: string;
}

interface DispatchResponse {
  enqueued: number;
  skipped: number;
  timestamp: string;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (_req: Request): Promise<Response> => {
  const startMs = Date.now();

  // ── 1. Read and validate required environment variables ──────────────────
  //
  // SUPABASE_URL — injected automatically by the Edge Function runtime.
  // BOGIEBOARD_SERVICE_ROLE_KEY — custom secret; must be added manually in
  //   the Dashboard under Project Settings → Edge Functions → Secrets.

  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!supabaseUrl) {
    return errorResponse(
      "SUPABASE_URL is not set. This variable is injected automatically " +
        "by the Supabase Edge Function runtime and should always be present.",
      500,
    );
  }

  const serviceRoleKey = Deno.env.get("BOGIEBOARD_SERVICE_ROLE_KEY");

  if (!serviceRoleKey) {
    return errorResponse(
      "BOGIEBOARD_SERVICE_ROLE_KEY is not set. Add it in Supabase Dashboard → " +
        "Project Settings → Edge Functions → Secrets using your Dev project " +
        "service_role key.",
      500,
    );
  }

  // ── 2. Service-role Supabase client ──────────────────────────────────────
  //
  // persistSession: false — Edge Functions are stateless; no session storage.
  // autoRefreshToken: false — service role JWTs do not expire during a request.

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    // ── 3. Query feed_registry for candidate feeds ────────────────────────
    //
    // Filters applied in the database query:
    //   a) enabled = true
    //   b) backoff_until IS NULL OR backoff_until < now()
    //      (circuit-broken feeds are skipped by the database filter)
    //
    // Filter (c) — interval elapsed — is evaluated in TypeScript because
    // PostgREST does not support interval arithmetic in .filter() calls.
    // The candidate set is small (tens of feeds), so in-process filtering
    // adds negligible latency.

    // nowIso is used both here (backoff_until filter) and below (interval check).
    // PostgREST treats now() as a literal string, not a SQL function call, so
    // an explicit ISO timestamp is required for reliable lt comparison.
    const nowIso = new Date().toISOString();

    const { data: candidates, error: queryError } = await supabase
      .from("feed_registry")
      .select(
        "id, feed_name, scrape_interval_hours, last_fetched_at, backoff_until",
      )
      .eq("enabled", true)
      .or(`backoff_until.is.null,backoff_until.lt.${nowIso}`);

    if (queryError) {
      return errorResponse(
        `feed_registry query failed: ${queryError.message} (code: ${queryError.code})`,
        500,
      );
    }

    const feeds = (candidates ?? []) as FeedRow[];

    if (feeds.length === 0) {
      return successResponse({ enqueued: 0, skipped: 0 }, startMs);
    }

    // ── 4. Filter: scrape interval has elapsed ────────────────────────────
    //
    // A feed is due when:
    //   - last_fetched_at is null (never successfully fetched), OR
    //   - now() − last_fetched_at >= scrape_interval_hours
    //
    // scrape_interval_hours defaults to 12 if somehow null (schema sets
    // NOT NULL DEFAULT 12, but the fallback guards against future changes).

    const nowMs = Date.now();

    const dueFeeds: FeedRow[] = [];
    const skippedFeeds: FeedRow[] = [];

    for (const feed of feeds) {
      if (feed.last_fetched_at === null) {
        dueFeeds.push(feed);
        continue;
      }
      const intervalMs = (feed.scrape_interval_hours ?? 12) * 60 * 60 * 1000;
      const lastFetchedMs = new Date(feed.last_fetched_at).getTime();
      if (nowMs - lastFetchedMs >= intervalMs) {
        dueFeeds.push(feed);
      } else {
        skippedFeeds.push(feed);
      }
    }

    if (dueFeeds.length === 0) {
      return successResponse(
        { enqueued: 0, skipped: skippedFeeds.length },
        startMs,
      );
    }

    // ── 5. Insert one queue job per due feed ──────────────────────────────
    //
    // ignoreDuplicates: true maps to ON CONFLICT DO NOTHING at the PostgREST
    // level. The partial unique index uq_ingest_queue_active_feed on
    // (feed_id) WHERE status IN ('pending','running') means a feed that
    // already has an active job is silently skipped — not double-queued.
    //
    // count: "exact" returns the actual number of rows inserted after
    // conflicts are excluded, giving an accurate `enqueued` count.

    const nextRunAt = new Date().toISOString();

    const rows: QueueInsertRow[] = dueFeeds.map((feed) => ({
      feed_id: feed.id,
      status: "pending",
      next_run_at: nextRunAt,
    }));

    const { count, error: insertError } = await supabase
      .from("ingest_queue")
      .insert(rows, { count: "exact", ignoreDuplicates: true });

    if (insertError) {
      return errorResponse(
        `ingest_queue insert failed: ${insertError.message} (code: ${insertError.code})`,
        500,
      );
    }

    // Feeds that were due but had an active job (conflict) count as skipped.
    const enqueued = count ?? 0;
    const alreadyActive = dueFeeds.length - enqueued;
    const totalSkipped = skippedFeeds.length + alreadyActive;

    return successResponse({ enqueued, skipped: totalSkipped }, startMs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`Unexpected error: ${message}`, 500);
  }
});

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function successResponse(
  body: { enqueued: number; skipped: number },
  startMs: number,
): Response {
  const payload: DispatchResponse = {
    ...body,
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startMs,
  };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      error: message,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}
