// supabase/functions/ingest-worker/index.ts
//
// Processes exactly one pending Ticketmaster ingest_queue job per invocation.
// One Ticketmaster page per invocation. Writes venues, canonical_events,
// event_categories, and source_events. Advances the page cursor. Marks the
// job completed when the last page is reached or no events are returned.
//
// Required secrets (Dashboard → Project Settings → Edge Functions → Secrets):
//   BOGIEBOARD_SERVICE_ROLE_KEY  — service_role JWT
//   TICKETMASTER_API_KEY         — never stored in DB, logs, or responses
//
// SUPABASE_URL is injected automatically by the runtime.
//
// Pre-requisites (apply in order before deploying this function):
//   1. bogieboard_ingestion_reliability_migration.sql
//      Creates uq_canonical_events_hash (full unique index on normalized_hash).
//   2. bogieboard_worker_support_migration.sql
//      Creates uq_source_events_source_external, claim/source RPCs.
//
// Confirmed schema columns used:
//   canonical_events.currency   TEXT NOT NULL DEFAULT 'USD'   ← confirmed
//   source_events.fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now() ← confirmed
//   source_events.canonical_event_id UUID nullable FK         ← confirmed

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TM_HOSTNAME      = "app.ticketmaster.com";
const TM_PATHNAME      = "/discovery/v2/events.json";
const FETCH_TIMEOUT_MS = 25_000;
const WORKER_ID        = crypto.randomUUID();
// Backoff: attempt index (0-based) → minutes before retry
const BACKOFF_MINUTES  = [5, 30, 120, 1440];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueueJob {
  id: string;
  feed_id: string;
  attempt_count: number;
  max_attempts: number;
  last_cursor: Record<string, unknown>;
  last_error: string | null;
}

interface FeedRow {
  id: string;
  feed_name: string;
  feed_url: string;
  metro_area_slug: string;
  default_city: string | null;
  default_state: string | null;
}

interface MetroRow {
  id: string;
  name: string;
  is_active: boolean;
}

interface TmVenue {
  name?: string;
  address?: { line1?: string };
  city?: { name?: string };
  state?: { stateCode?: string };
  postalCode?: string;
  location?: { latitude?: string; longitude?: string };
  url?: string;
}

interface TmPriceRange {
  type?: string;
  currency?: string;
  min?: number;
  max?: number;
}

interface TmClassification {
  segment?: { name?: string };
  genre?: { name?: string };
  subGenre?: { name?: string };
}

interface TmEvent {
  id: string;
  name: string;
  url?: string;
  images?: Array<{ url?: string; width?: number; height?: number }>;
  dates?: {
    start?: { dateTime?: string };
    end?: { dateTime?: string };
  };
  priceRanges?: TmPriceRange[];
  classifications?: TmClassification[];
  info?: string;
  pleaseNote?: string;
  _embedded?: { venues?: TmVenue[] };
}

interface TmResponse {
  _embedded?: { events?: TmEvent[] };
  page?: { totalPages?: number };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (_req: Request): Promise<Response> => {
  const startMs = Date.now();

  // ── 1. Environment ────────────────────────────────────────────────────────
  const supabaseUrl    = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("BOGIEBOARD_SERVICE_ROLE_KEY");
  const tmApiKey       = Deno.env.get("TICKETMASTER_API_KEY");

  if (!supabaseUrl) {
    return workerError("SUPABASE_URL is not set.", startMs);
  }
  if (!serviceRoleKey) {
    return workerError(
      "BOGIEBOARD_SERVICE_ROLE_KEY is not set. " +
      "Add it in Dashboard → Project Settings → Edge Functions → Secrets.",
      startMs,
    );
  }
  if (!tmApiKey) {
    return workerError(
      "TICKETMASTER_API_KEY is not set. " +
      "Add it in Dashboard → Project Settings → Edge Functions → Secrets.",
      startMs,
    );
  }

  // ── 2. Service-role client ────────────────────────────────────────────────
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 3. Atomic queue claim via FOR UPDATE SKIP LOCKED RPC ─────────────────
  // claim_ingest_queue_job() is GRANT-ed to service_role only; authenticated
  // users cannot call it. The single UPDATE...WHERE id=(SELECT...FOR UPDATE
  // SKIP LOCKED)...RETURNING statement eliminates the race window.
  const { data: claimed, error: claimErr } = await db.rpc(
    "claim_ingest_queue_job",
    { p_worker_id: WORKER_ID },
  );

  if (claimErr) {
    return workerError("Queue claim failed. Check Edge Function logs.", startMs);
  }
  if (!claimed || claimed.length === 0) {
    return workerOk({ claimed: false }, startMs);
  }
  const job = claimed[0] as QueueJob;

  // ── 4. Load feed ──────────────────────────────────────────────────────────
  const { data: feedData, error: feedErr } = await db
    .from("feed_registry")
    .select("id, feed_name, feed_url, metro_area_slug, default_city, default_state")
    .eq("id", job.feed_id)
    .maybeSingle();

  if (feedErr || !feedData) {
    return failJob(db, job, "Feed not found in feed_registry.", startMs);
  }
  const feed = feedData as FeedRow;

  // ── 5. Strict Ticketmaster URL validation ─────────────────────────────────
  // Hostname exact match AND pathname exact match required.
  let feedUrl: URL;
  try {
    feedUrl = new URL(feed.feed_url);
  } catch {
    return failJob(db, job, "feed_url is not a valid URL.", startMs);
  }
  if (feedUrl.hostname !== TM_HOSTNAME) {
    return failJob(
      db, job,
      `Unsupported hostname: expected ${TM_HOSTNAME}, got ${feedUrl.hostname}.`,
      startMs,
    );
  }
  if (feedUrl.pathname !== TM_PATHNAME) {
    return failJob(
      db, job,
      `Unsupported pathname: expected ${TM_PATHNAME}, got ${feedUrl.pathname}.`,
      startMs,
    );
  }

  // ── 6. Resolve active metro ───────────────────────────────────────────────
  const { data: metroData, error: metroErr } = await db
    .from("metro_areas")
    .select("id, name, is_active")
    .eq("slug", feed.metro_area_slug)
    .maybeSingle();

  if (metroErr || !metroData) {
    return failJob(
      db, job,
      `metro_area_slug "${feed.metro_area_slug}" not found in metro_areas.`,
      startMs,
    );
  }
  const metro = metroData as MetroRow;
  if (!metro.is_active) {
    return failJob(
      db, job,
      `Metro "${feed.metro_area_slug}" is inactive. Activate it before ingestion.`,
      startMs,
    );
  }

  // ── 7. Get or create sources row ──────────────────────────────────────────
  // feed_registry.feed_url contains no apikey or page — it is safe as base_url.
  const { data: sourceId, error: sourceErr } = await db.rpc(
    "get_or_create_ticketmaster_source",
    {
      p_base_url:      feed.feed_url,
      p_feed_name:     feed.feed_name,
      p_metro_area_id: metro.id,
    },
  );
  if (sourceErr || !sourceId) {
    return failJob(
      db, job,
      "Could not resolve Ticketmaster source. Check Edge Function logs.",
      startMs,
    );
  }
  const tmSourceId = sourceId as string;

  // ── 8. Build fetch URL ────────────────────────────────────────────────────
  // apikey and page are appended here and never stored anywhere.
  const cursor      = job.last_cursor as { page?: number };
  const currentPage = typeof cursor.page === "number" ? cursor.page : 0;

  const fetchUrl = new URL(feed.feed_url);
  fetchUrl.searchParams.set("apikey", tmApiKey);
  fetchUrl.searchParams.set("page",   String(currentPage));

  // ── 9. Fetch one Ticketmaster page ────────────────────────────────────────
  let tmData: TmResponse;
  try {
    const ctrl    = new AbortController();
    const timer   = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const resp    = await fetch(fetchUrl.toString(), {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!resp.ok) {
      // Never log or store the response body — it may contain internal details
      return failJob(
        db, job,
        `Ticketmaster API HTTP ${resp.status} on page ${currentPage}.`,
        startMs,
      );
    }
    tmData = (await resp.json()) as TmResponse;
  } catch (err: unknown) {
    const msg = err instanceof Error
      ? (err.name === "AbortError"
          ? `Fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s.`
          : err.message)
      : "Unknown fetch error.";
    return failJob(db, job, msg, startMs);
  }

  // ── 10. Process events ────────────────────────────────────────────────────
  const events     = tmData._embedded?.events ?? [];
  const totalPages = tmData.page?.totalPages ?? 1;
  const isLastPage = events.length === 0 || currentPage >= totalPages - 1;
  const now        = new Date().toISOString();

  let eventsPersisted      = 0;
  let categoriesLinked     = 0;
  let sourceEventsWritten  = 0;
  let perEventErrors       = 0;

  for (const ev of events) {
    try {
      const startDT = ev.dates?.start?.dateTime ?? null;
      const title   = ev.name?.trim() ?? "";
      if (!startDT || !title) continue;

      const tmVenue   = ev._embedded?.venues?.[0];
      const city      = tmVenue?.city?.name       ?? feed.default_city  ?? "";
      const state     = tmVenue?.state?.stateCode ?? feed.default_state ?? "NC";
      const venueName = tmVenue?.name?.trim()     ?? null;

      // ── 10a. Hash ─────────────────────────────────────────────────────────
      const { data: hashData, error: hashErr } = await db.rpc(
        "generate_event_hash",
        { p_title: title, p_start_time: startDT,
          p_city: city, p_venue_name: venueName },
      );
      if (hashErr || !hashData) {
        perEventErrors++;
        continue;
      }
      const normHash = hashData as string;

      // ── 10b. Venue (SELECT then INSERT — no unique constraint on venues) ──
      let venueId: string | null = null;
      if (venueName) {
        const { data: vExisting } = await db
          .from("venues")
          .select("id")
          .eq("name",  venueName)
          .eq("city",  city)
          .eq("state", state)
          .maybeSingle();

        if (vExisting) {
          venueId = (vExisting as { id: string }).id;
        } else {
          const vLat = tmVenue?.location?.latitude
            ? parseFloat(tmVenue.location.latitude)  : null;
          const vLng = tmVenue?.location?.longitude
            ? parseFloat(tmVenue.location.longitude) : null;
          const { data: vNew } = await db
            .from("venues")
            .insert({
              name: venueName, address_1: tmVenue?.address?.line1 ?? null,
              city, state, zip: tmVenue?.postalCode ?? null,
              latitude: vLat, longitude: vLng,
              metro_area_id: metro.id, venue_url: tmVenue?.url ?? null,
            })
            .select("id")
            .maybeSingle();
          venueId = (vNew as { id: string } | null)?.id ?? null;
        }
      }

      // ── 10c. Price / currency ─────────────────────────────────────────────
      const priceRange = ev.priceRanges?.find((p) => p.type === "standard")
        ?? ev.priceRanges?.[0]
        ?? null;
      const priceMin = priceRange?.min ?? null;
      const priceMax = priceRange?.max ?? null;
      // currency confirmed on canonical_events (TEXT NOT NULL DEFAULT 'USD')
      const currency = priceRange?.currency ?? "USD";
      const isFree   = priceMin === 0 || title.toLowerCase().includes("free");

      // ── 10d. Image / description / end time ───────────────────────────────
      const bestImage = ev.images
        ?.filter((i) => !!i.url)
        .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;
      const descParts = [ev.info, ev.pleaseNote].filter(Boolean);
      const description = descParts.length
        ? descParts.join(" ").trim().slice(0, 300)
        : null;
      // Ticketmaster end time lives in dates.end.dateTime, not dates.start
      const endDT = ev.dates?.end?.dateTime ?? null;

      // ── 10e. Canonical event upsert via ON CONFLICT (normalized_hash) ─────
      // Requires uq_canonical_events_hash (full non-partial unique index,
      // no WHERE clause). DO UPDATE refreshes last_seen_at and last_refreshed_at.
      // Select only id — we do not depend on created_at or updated_at.
      // A single eventsPersisted counter covers both inserts and updates.
      const { data: ceRow, error: ceErr } = await db
        .from("canonical_events")
        .upsert(
          {
            title,
            description_short: description,
            start_time:        startDT,
            end_time:          endDT,
            venue_id:          venueId,
            metro_area_id:     metro.id,
            normalized_hash:   normHash,
            is_free:           isFree,
            price_min:         priceMin,
            price_max:         priceMax,
            currency,               // confirmed column
            ticket_url:        ev.url ?? null,
            image_url:         bestImage,
            status:            "active",
            last_seen_at:      now,
            last_refreshed_at: now,
          },
          { onConflict: "normalized_hash", ignoreDuplicates: false },
        )
        .select("id")
        .maybeSingle();

      if (ceErr || !ceRow) {
        perEventErrors++;
        continue;
      }

      const canonicalEventId = (ceRow as { id: string }).id;
      eventsPersisted++;

      // ── 10f. Category linking (runs for both new AND existing events) ──────
      const classStrings: string[] = [];
      for (const cl of ev.classifications ?? []) {
        if (cl.segment?.name)  classStrings.push(cl.segment.name);
        if (cl.genre?.name)    classStrings.push(cl.genre.name);
        if (cl.subGenre?.name) classStrings.push(cl.subGenre.name);
      }
      for (const rawCat of classStrings) {
        const { data: slug } = await db.rpc("map_to_app_category",
          { p_source_category: rawCat });
        if (!slug) continue;

        const { data: catRow } = await db
          .from("categories").select("id")
          .eq("slug", slug as string).maybeSingle();
        if (!catRow) continue;

        // PK (event_id, category_id) prevents duplicates; INSERT is idempotent
        const { error: ecErr } = await db.from("event_categories").insert({
          event_id:    canonicalEventId,
          category_id: (catRow as { id: string }).id,
        });
        if (!ecErr) categoriesLinked++;
      }

      // ── 10g. source_events upsert ─────────────────────────────────────────
      // uq_source_events_source_external (WHERE both NOT NULL) created by the
      // support migration. DO UPDATE keeps canonical_event_id current.
      // fetched_at confirmed on source_events (TIMESTAMPTZ NOT NULL DEFAULT now()).
      // canonical_event_id is always populated (blockers 3+4 guarantee this).
      const { error: seErr } = await db
        .from("source_events")
        .upsert(
          {
            source_id:          tmSourceId,
            external_event_id:  ev.id,
            source_url:         ev.url ?? null,
            normalized_hash:    normHash,
            parse_status:       "matched",
            canonical_event_id: canonicalEventId,   // always set
            fetched_at:         now,                 // confirmed column
          },
          {
            onConflict:       "source_id,external_event_id",
            ignoreDuplicates: false,   // DO UPDATE: keep canonical_event_id current
          },
        );
      if (!seErr) sourceEventsWritten++;
    } catch {
      // Per-event errors are non-fatal individually but counted.
      // Raw DB errors and Ticketmaster response bodies are never exposed.
      perEventErrors++;
      continue;
    }
  }

  // ── 11. Guard: fail the job if events were found but none persisted ───────
  // This prevents silently marking a job complete when all events failed
  // due to DB errors. If events.length === 0 the job completes normally.
  if (events.length > 0 && eventsPersisted === 0) {
    return failJob(
      db, job,
      `Ticketmaster returned ${events.length} event(s) on page ${currentPage} ` +
        `but all failed to persist (per_event_errors=${perEventErrors}). ` +
        `Check DB connectivity and schema constraints.`,
      startMs,
    );
  }
  const nextPage = currentPage + 1;

  if (isLastPage) {
    await db.from("ingest_queue")
      .update({ status: "completed", locked_at: null, locked_by: null,
                last_cursor: { page: nextPage } })
      .eq("id", job.id);

    await db.from("feed_registry").update({
      last_fetched_at: now, last_success_at: now,
      consecutive_failures: 0, backoff_until: null, last_error: null,
    }).eq("id", job.feed_id);
  } else {
    // More pages remain — reset to pending immediately for next invocation
    await db.from("ingest_queue")
      .update({ status: "pending", locked_at: null, locked_by: null,
                next_run_at: now, last_cursor: { page: nextPage } })
      .eq("id", job.id);

    await db.from("feed_registry")
      .update({ last_fetched_at: now })
      .eq("id", job.feed_id);
  }

  return workerOk({
    claimed: true, job_id: job.id,
    feed_name: feed.feed_name, metro: feed.metro_area_slug,
    page: currentPage, total_pages: tmData.page?.totalPages ?? 1,
    events_found: events.length,
    events_persisted: eventsPersisted,
    per_event_errors: perEventErrors,
    source_events_written: sourceEventsWritten,
    categories_linked: categoriesLinked,
    completed: isLastPage,
  }, startMs);
});

// ---------------------------------------------------------------------------
// Failure handler
// ---------------------------------------------------------------------------

async function failJob(
  db: SupabaseClient,
  job: QueueJob,
  reason: string,
  startMs: number,
): Promise<Response> {
  const newAttempts = (job.attempt_count ?? 0) + 1;
  const exhausted   = newAttempts >= (job.max_attempts ?? 5);
  const backoffIdx  = Math.min(newAttempts - 1, BACKOFF_MINUTES.length - 1);
  const nextRunAt   = new Date(
    Date.now() + BACKOFF_MINUTES[backoffIdx] * 60_000,
  ).toISOString();
  const safeReason  = reason.slice(0, 500); // hard cap; never echoes API key

  await db.from("ingest_queue").update({
    status:        exhausted ? "failed" : "pending",
    locked_at:     null, locked_by: null,
    attempt_count: newAttempts,
    next_run_at:   nextRunAt,
    last_error:    safeReason,
  }).eq("id", job.id);

  const { data: feedNow } = await db
    .from("feed_registry").select("consecutive_failures")
    .eq("id", job.feed_id).maybeSingle();

  const prev = (feedNow as { consecutive_failures: number } | null)
    ?.consecutive_failures ?? 0;
  const feedPatch: Record<string, unknown> = {
    last_fetched_at:      new Date().toISOString(),
    last_error:           safeReason,
    consecutive_failures: prev + 1,
  };
  if (exhausted) {
    feedPatch.backoff_until = new Date(
      Date.now() + 24 * 60 * 60_000,
    ).toISOString();
  }
  await db.from("feed_registry").update(feedPatch).eq("id", job.feed_id);

  return workerError(
    `Attempt ${newAttempts}/${job.max_attempts ?? 5}: ${safeReason}`,
    startMs, { job_id: job.id, exhausted },
  );
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function workerOk(body: Record<string, unknown>, startMs: number): Response {
  return new Response(
    JSON.stringify({
      ...body,
      timestamp:   new Date().toISOString(),
      duration_ms: Date.now() - startMs,
      worker_id:   WORKER_ID,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function workerError(
  message: string,
  startMs: number,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      error: message, ...extra,
      timestamp:   new Date().toISOString(),
      duration_ms: Date.now() - startMs,
      worker_id:   WORKER_ID,
    }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );
}
