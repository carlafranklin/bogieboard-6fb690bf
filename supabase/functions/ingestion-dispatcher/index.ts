// supabase/functions/ingest-dispatcher/index.ts
//
// Reads feed_registry for feeds that are due and inserts one pending
// ingest_queue row per due feed. Does NO external HTTP fetching.
//
// Required environment variables:
//   SUPABASE_URL                  — injected automatically by Supabase
//   BOGIEBOARD_SERVICE_ROLE_KEY   — custom secret created in
//                                   Supabase Dashboard → Edge Functions → Secrets

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("BOGIEBOARD_SERVICE_ROLE_KEY");

  if (!supabaseUrl) {
    return errorResponse(
      "SUPABASE_URL is not set. This variable is normally injected automatically by the Supabase Edge Function runtime.",
      500,
    );
  }

  if (!serviceRoleKey) {
    return errorResponse(
      "BOGIEBOARD_SERVICE_ROLE_KEY is not set. Add it in Supabase Dashboard → Edge Functions → Secrets using your Dev project service_role key.",
      500,
    );
  }

  // ── 2. Create service-role Supabase client ───────────────────────────────

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    // ── 3. Find enabled feeds that are not currently backed off ────────────
    //
    // The scrape interval is evaluated below in TypeScript because PostgREST
    // does not support SQL interval arithmetic inside normal client filters.

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

    // ── 4. Keep only feeds whose scrape interval has elapsed ───────────────

    const nowMs = Date.now();
    const dueFeeds: FeedRow[] = [];
    const skippedFeeds: FeedRow[] = [];

    for (const feed of feeds) {
      // Never fetched before: queue it immediately.
      if (feed.last_fetched_at === null) {
        dueFeeds.push(feed);
        continue;
      }

      const intervalMs =
        (feed.scrape_interval_hours ?? 12) * 60 * 60 * 1000;

      const lastFetchedMs = new Date(feed.last_fetched_at).getTime();

      // Treat an invalid stored timestamp as due so it can be repaired by
      // a successful worker run rather than silently skipped forever.
      if (
        Number.isNaN(lastFetchedMs) ||
        nowMs - lastFetchedMs >= intervalMs
      ) {
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

    // ── 5. Queue one pending job per due feed ──────────────────────────────
    //
    // ignoreDuplicates maps to ON CONFLICT DO NOTHING. Your partial unique
    // active-job index prevents duplicate pending/running jobs for a feed.

    const nextRunAt = new Date().toISOString();

    const rows: QueueInsertRow[] = dueFeeds.map((feed) => ({
      feed_id: feed.id,
      status: "pending",
      next_run_at: nextRunAt,
    }));

    const { count, error: insertError } = await supabase
      .from("ingest_queue")
      .insert(rows, {
        count: "exact",
        ignoreDuplicates: true,
      });

    if (insertError) {
      return errorResponse(
        `ingest_queue insert failed: ${insertError.message} (code: ${insertError.code})`,
        500,
      );
    }

    const enqueued = count ?? 0;
    const alreadyActive = dueFeeds.length - enqueued;
    const totalSkipped = skippedFeeds.length + alreadyActive;

    return successResponse(
      {
        enqueued,
        skipped: totalSkipped,
      },
      startMs,
    );
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
    headers: {
      "Content-Type": "application/json",
    },
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
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}
