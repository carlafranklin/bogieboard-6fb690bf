import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// ── Types ────────────────────────────────────────
interface FeedRecord {
  id: string
  feed_name: string
  feed_url: string
  feed_type: 'rss' | 'ical' | 'auto'
  metro_area_slug: string
  source_category: string
  default_venue_name: string | null
  default_city: string | null
  default_state: string | null
  default_zip: string | null
}

interface ParsedEvent {
  title: string
  description_short: string | null
  description_long: string | null
  start_time: string
  end_time: string | null
  all_day: boolean
  is_free: boolean
  venue_name: string
  venue_city: string
  venue_state: string
  venue_zip: string | null
  external_url: string | null
  external_event_id: string
  image_urls: string[]
  primary_image_url: string | null
}

// ── Feed Type Detection ──────────────────────────
function detectFeedType(content: string): 'rss' | 'ical' {
  const trimmed = content.trim()
  if (trimmed.startsWith('BEGIN:VCALENDAR') || trimmed.includes('BEGIN:VEVENT')) {
    return 'ical'
  }
  return 'rss'
}

// ── Image Extraction Helpers ─────────────────────
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?|$)/i
const TRACKING_PIXEL_PATTERNS = [
  /1x1/i, /pixel/i, /spacer/i, /tracking/i, /beacon/i,
  /transparent/i, /blank\./i, /\.gif\?/i,
]

function isValidImageUrl(url: string): boolean {
  if (!url || !url.startsWith('http')) return false
  if (url.length < 20) return false
  for (const pattern of TRACKING_PIXEL_PATTERNS) {
    if (pattern.test(url)) return false
  }
  // Prefer known image formats, but allow URLs without extension (could be dynamic)
  return true
}

function extractImagesFromHtml(html: string): string[] {
  const images: string[] = []
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    if (isValidImageUrl(match[1])) {
      images.push(match[1])
    }
  }
  return images
}

function selectPrimaryImage(imageUrls: string[]): string | null {
  if (imageUrls.length === 0) return null
  // Prefer images with known photo extensions
  const photoImages = imageUrls.filter(u => IMAGE_EXTENSIONS.test(u))
  if (photoImages.length > 0) return photoImages[0]
  return imageUrls[0]
}

// ── RSS Parser ───────────────────────────────────
function parseRssFeed(xmlText: string, feed: FeedRecord): ParsedEvent[] {
  const events: ParsedEvent[] = []

  // Simple XML tag extraction helpers
  const getTagContent = (xml: string, tag: string): string | null => {
    // Handle namespaced tags like media:content
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)</${escapedTag}>`, 'i')
    const match = regex.exec(xml)
    return match ? match[1].trim() : null
  }

  const getAttr = (xml: string, tag: string, attr: string): string | null => {
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const tagRegex = new RegExp(`<${escapedTag}[^>]*>`, 'i')
    const tagMatch = tagRegex.exec(xml)
    if (!tagMatch) return null
    const attrRegex = new RegExp(`${attr}=["']([^"']+)["']`, 'i')
    const attrMatch = attrRegex.exec(tagMatch[0])
    return attrMatch ? attrMatch[1] : null
  }

  // Detect if Atom or RSS
  const isAtom = xmlText.includes('<feed') && xmlText.includes('xmlns="http://www.w3.org/2005/Atom"')

  if (isAtom) {
    // Parse Atom entries
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi
    let entryMatch
    while ((entryMatch = entryRegex.exec(xmlText)) !== null) {
      try {
        const entry = entryMatch[1]
        const title = getTagContent(entry, 'title') || 'Untitled'
        const summary = getTagContent(entry, 'summary') || getTagContent(entry, 'content') || null
        const link = getAttr(entry, 'link', 'href') || null
        const id = getTagContent(entry, 'id') || link || title
        const updated = getTagContent(entry, 'updated') || getTagContent(entry, 'published') || ''

        // Image extraction
        const imageUrls: string[] = []
        const mediaUrl = getAttr(entry, 'media:content', 'url') || getAttr(entry, 'media:thumbnail', 'url')
        if (mediaUrl && isValidImageUrl(mediaUrl)) imageUrls.push(mediaUrl)
        if (summary) imageUrls.push(...extractImagesFromHtml(summary))
        const content = getTagContent(entry, 'content')
        if (content) imageUrls.push(...extractImagesFromHtml(content))

        const uniqueImages = [...new Set(imageUrls)]

        events.push({
          title: title.replace(/<[^>]+>/g, '').trim(),
          description_short: summary ? summary.replace(/<[^>]+>/g, '').substring(0, 500) : null,
          description_long: summary ? summary.replace(/<[^>]+>/g, '') : null,
          start_time: updated ? new Date(updated).toISOString() : new Date().toISOString(),
          end_time: null,
          all_day: false,
          is_free: true,
          venue_name: feed.default_venue_name || 'TBA',
          venue_city: feed.default_city || '',
          venue_state: feed.default_state || 'NC',
          venue_zip: feed.default_zip || null,
          external_url: link,
          external_event_id: `feed_${feed.id}_${btoa(id).substring(0, 40)}`,
          image_urls: uniqueImages,
          primary_image_url: selectPrimaryImage(uniqueImages),
        })
      } catch (e) {
        console.error('Error parsing Atom entry:', e)
      }
    }
  } else {
    // Parse RSS 2.0 items
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi
    let itemMatch
    while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
      try {
        const item = itemMatch[1]
        const title = getTagContent(item, 'title') || 'Untitled'
        const description = getTagContent(item, 'description') || null
        const contentEncoded = getTagContent(item, 'content:encoded') || null
        const link = getTagContent(item, 'link') || null
        const guid = getTagContent(item, 'guid') || link || title
        const pubDate = getTagContent(item, 'pubDate') || ''

        // Image extraction from multiple sources
        const imageUrls: string[] = []

        // 1. Enclosure
        const enclosureUrl = getAttr(item, 'enclosure', 'url')
        const enclosureType = getAttr(item, 'enclosure', 'type')
        if (enclosureUrl && (!enclosureType || enclosureType.startsWith('image/'))) {
          if (isValidImageUrl(enclosureUrl)) imageUrls.push(enclosureUrl)
        }

        // 2. media:content / media:thumbnail
        const mediaUrl = getAttr(item, 'media:content', 'url') || getAttr(item, 'media:thumbnail', 'url')
        if (mediaUrl && isValidImageUrl(mediaUrl)) imageUrls.push(mediaUrl)

        // 3. image block
        const imageBlockUrl = getTagContent(item, 'image')
        if (imageBlockUrl && isValidImageUrl(imageBlockUrl)) imageUrls.push(imageBlockUrl)

        // 4. HTML-embedded images in description
        if (description) imageUrls.push(...extractImagesFromHtml(description))

        // 5. HTML-embedded images in content:encoded
        if (contentEncoded) imageUrls.push(...extractImagesFromHtml(contentEncoded))

        const uniqueImages = [...new Set(imageUrls)]

        events.push({
          title: title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim(),
          description_short: (description || contentEncoded || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').substring(0, 500) || null,
          description_long: (contentEncoded || description || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '') || null,
          start_time: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          end_time: null,
          all_day: false,
          is_free: true,
          venue_name: feed.default_venue_name || 'TBA',
          venue_city: feed.default_city || '',
          venue_state: feed.default_state || 'NC',
          venue_zip: feed.default_zip || null,
          external_url: link?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() || null,
          external_event_id: `feed_${feed.id}_${btoa(String(guid)).substring(0, 40)}`,
          image_urls: uniqueImages,
          primary_image_url: selectPrimaryImage(uniqueImages),
        })
      } catch (e) {
        console.error('Error parsing RSS item:', e)
      }
    }
  }

  return events
}

// ── iCal Parser ──────────────────────────────────
function parseIcalFeed(icsText: string, feed: FeedRecord): ParsedEvent[] {
  const events: ParsedEvent[] = []
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi
  let match

  while ((match = veventRegex.exec(icsText)) !== null) {
    try {
      const block = match[1]

      const getProp = (name: string): string | null => {
        // Handle folded lines (RFC 5545: lines starting with space/tab are continuations)
        const unfolded = block.replace(/\r?\n[ \t]/g, '')
        const regex = new RegExp(`^${name}[;:](.*)$`, 'mi')
        const m = regex.exec(unfolded)
        return m ? m[1].trim() : null
      }

      const title = getProp('SUMMARY') || 'Untitled'
      const description = getProp('DESCRIPTION')
      const location = getProp('LOCATION')
      const url = getProp('URL')
      const uid = getProp('UID') || title
      const dtstart = getProp('DTSTART')
      const dtend = getProp('DTEND')

      // Parse dates
      const parseIcalDate = (val: string | null): string | null => {
        if (!val) return null
        // Remove VALUE=DATE: prefix or TZID=... prefix
        const cleaned = val.replace(/^[^:]*:/, '').replace(/^VALUE=DATE:/i, '')
        // Format: YYYYMMDD or YYYYMMDDTHHmmssZ
        if (cleaned.length === 8) {
          return `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}T00:00:00Z`
        }
        if (cleaned.length >= 15) {
          const d = `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}T${cleaned.substring(9, 11)}:${cleaned.substring(11, 13)}:${cleaned.substring(13, 15)}Z`
          return d
        }
        // Try direct ISO parse
        try {
          return new Date(cleaned).toISOString()
        } catch {
          return null
        }
      }

      const startTime = parseIcalDate(dtstart)
      if (!startTime) continue // Skip events with no valid start

      const allDay = dtstart ? !dtstart.includes('T') && dtstart.includes('VALUE=DATE') || (dtstart.replace(/^[^:]*:/, '').length === 8) : false

      // Extract images from ATTACH and DESCRIPTION
      const imageUrls: string[] = []

      // ATTACH fields
      const attachRegex = /^ATTACH[;:](.*?)$/gmi
      let attachMatch
      const unfoldedBlock = block.replace(/\r?\n[ \t]/g, '')
      while ((attachMatch = attachRegex.exec(unfoldedBlock)) !== null) {
        let attachVal = attachMatch[1]
        // Could be FMTTYPE=image/jpeg:https://...
        if (attachVal.includes(':')) {
          const parts = attachVal.split(':')
          const urlPart = parts.slice(1).join(':')
          if (isValidImageUrl(urlPart)) imageUrls.push(urlPart)
        } else if (isValidImageUrl(attachVal)) {
          imageUrls.push(attachVal)
        }
      }

      // Images in DESCRIPTION
      if (description) {
        // Look for URLs in description
        const urlRegex = /https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|webp|gif)/gi
        let urlMatch
        while ((urlMatch = urlRegex.exec(description)) !== null) {
          if (isValidImageUrl(urlMatch[0])) imageUrls.push(urlMatch[0])
        }
        // Also try HTML img tags if description contains HTML
        imageUrls.push(...extractImagesFromHtml(description))
      }

      const uniqueImages = [...new Set(imageUrls)]

      // Handle RRULE - expand recurring events for next 90 days
      const rrule = getProp('RRULE')
      if (rrule) {
        const occurrences = expandRRule(rrule, startTime, 90)
        for (const occurrence of occurrences) {
          events.push({
            title,
            description_short: description?.replace(/\\n/g, '\n').substring(0, 500) || null,
            description_long: description?.replace(/\\n/g, '\n') || null,
            start_time: occurrence,
            end_time: null,
            all_day: allDay,
            is_free: true,
            venue_name: location?.replace(/\\,/g, ',').split(',')[0]?.trim() || feed.default_venue_name || 'TBA',
            venue_city: feed.default_city || '',
            venue_state: feed.default_state || 'NC',
            venue_zip: feed.default_zip || null,
            external_url: url,
            external_event_id: `feed_${feed.id}_${btoa(uid + occurrence).substring(0, 40)}`,
            image_urls: uniqueImages,
            primary_image_url: selectPrimaryImage(uniqueImages),
          })
        }
      } else {
        events.push({
          title,
          description_short: description?.replace(/\\n/g, '\n').substring(0, 500) || null,
          description_long: description?.replace(/\\n/g, '\n') || null,
          start_time: startTime,
          end_time: parseIcalDate(dtend),
          all_day: allDay,
          is_free: true,
          venue_name: location?.replace(/\\,/g, ',').split(',')[0]?.trim() || feed.default_venue_name || 'TBA',
          venue_city: feed.default_city || '',
          venue_state: feed.default_state || 'NC',
          venue_zip: feed.default_zip || null,
          external_url: url,
          external_event_id: `feed_${feed.id}_${btoa(uid).substring(0, 40)}`,
          image_urls: uniqueImages,
          primary_image_url: selectPrimaryImage(uniqueImages),
        })
      }
    } catch (e) {
      console.error('Error parsing VEVENT:', e)
    }
  }

  return events
}

// ── RRULE Expansion (basic: DAILY, WEEKLY, MONTHLY) ──
function expandRRule(rrule: string, startTime: string, maxDays: number): string[] {
  const occurrences: string[] = []
  const start = new Date(startTime)
  const end = new Date()
  end.setDate(end.getDate() + maxDays)
  const now = new Date()

  // Parse RRULE parts
  const parts: Record<string, string> = {}
  rrule.split(';').forEach(p => {
    const [k, v] = p.split('=')
    if (k && v) parts[k.toUpperCase()] = v
  })

  const freq = parts['FREQ']
  const count = parts['COUNT'] ? parseInt(parts['COUNT']) : 52
  const interval = parts['INTERVAL'] ? parseInt(parts['INTERVAL']) : 1
  const until = parts['UNTIL'] ? new Date(
    parts['UNTIL'].length === 8
      ? `${parts['UNTIL'].substring(0, 4)}-${parts['UNTIL'].substring(4, 6)}-${parts['UNTIL'].substring(6, 8)}T23:59:59Z`
      : parts['UNTIL']
  ) : end

  const maxCount = Math.min(count, 26) // Cap at 26 occurrences
  let current = new Date(start)
  let generated = 0

  while (current <= until && current <= end && generated < maxCount) {
    if (current >= now) {
      occurrences.push(current.toISOString())
      generated++
    }

    switch (freq) {
      case 'DAILY':
        current.setDate(current.getDate() + interval)
        break
      case 'WEEKLY':
        current.setDate(current.getDate() + 7 * interval)
        break
      case 'MONTHLY':
        current.setMonth(current.getMonth() + interval)
        break
      case 'YEARLY':
        current.setFullYear(current.getFullYear() + interval)
        break
      default:
        return occurrences // Unknown freq, bail
    }
  }

  return occurrences
}

// ── Upsert Logic ─────────────────────────────────
async function upsertFeedEvents(
  supabase: any,
  events: ParsedEvent[],
  feed: FeedRecord,
  sourceId: string,
  metroAreas: any[],
  runId: string,
) {
  let created = 0, updated = 0, errors = 0, imageExtracted = 0, imageFailed = 0

  for (const ev of events) {
    try {
      // Determine metro area
      let metroAreaId: string | null = null
      for (const metro of metroAreas) {
        if (metro.slug === feed.metro_area_slug) {
          metroAreaId = metro.id
          break
        }
      }

      // Upsert venue
      let venueId: string | null = null
      if (ev.venue_name && ev.venue_name !== 'TBA') {
        const { data: existingVenue } = await supabase
          .from('venues')
          .select('id')
          .eq('name', ev.venue_name)
          .eq('city', ev.venue_city)
          .maybeSingle()

        if (existingVenue) {
          venueId = existingVenue.id
        } else {
          const { data: newVenue, error: venueErr } = await supabase
            .from('venues')
            .insert({
              name: ev.venue_name,
              city: ev.venue_city,
              state: ev.venue_state,
              zip: ev.venue_zip,
              metro_area_id: metroAreaId,
            })
            .select('id')
            .single()
          if (!venueErr && newVenue) venueId = newVenue.id
        }
      }

      // Generate hash for dedup
      const { data: hash } = await supabase.rpc('generate_event_hash', {
        p_title: ev.title,
        p_start_time: ev.start_time,
        p_city: ev.venue_city,
        p_venue_name: ev.venue_name,
      })

      // Check existing
      const { data: existingEvent } = await supabase
        .from('canonical_events')
        .select('id, image_url, image_source')
        .eq('normalized_hash', hash)
        .maybeSingle()

      let canonicalEventId: string

      if (existingEvent) {
        // Image merge: don't overwrite a better image with a worse one
        const updateFields: any = {
          description_short: ev.description_short,
          end_time: ev.end_time,
          ticket_url: ev.external_url,
          last_seen_at: new Date().toISOString(),
          last_refreshed_at: new Date().toISOString(),
        }

        if (ev.primary_image_url) {
          // Only overwrite if existing has no image or is a fallback
          if (!existingEvent.image_url || existingEvent.image_source === 'fallback') {
            updateFields.image_url = ev.primary_image_url
            updateFields.image_source = 'feed'
            updateFields.image_last_verified_at = new Date().toISOString()
            imageExtracted++
          }
        }

        await supabase.from('canonical_events').update(updateFields).eq('id', existingEvent.id)
        canonicalEventId = existingEvent.id
        updated++
      } else {
        const { data: newEvent, error: eventErr } = await supabase
          .from('canonical_events')
          .insert({
            title: ev.title,
            description_short: ev.description_short,
            description_long: ev.description_long,
            start_time: ev.start_time,
            end_time: ev.end_time,
            all_day: ev.all_day,
            is_free: ev.is_free,
            venue_id: venueId,
            metro_area_id: metroAreaId,
            normalized_hash: hash,
            status: 'active',
            ticket_url: ev.external_url,
            image_url: ev.primary_image_url,
            image_source: ev.primary_image_url ? 'feed' : 'fallback',
            image_last_verified_at: ev.primary_image_url ? new Date().toISOString() : null,
            source_url: ev.external_url,
          })
          .select('id')
          .single()

        if (eventErr) {
          console.error('Event insert error:', eventErr)
          errors++
          continue
        }
        canonicalEventId = newEvent.id
        created++
        if (ev.primary_image_url) imageExtracted++
      }

      // Auto-categorize: map title + description to app categories
      const textToMap = `${ev.title} ${ev.description_short ?? ''} ${feed.source_category ?? ''}`
      const { data: appSlug } = await supabase.rpc('map_to_app_category', { p_source_category: textToMap })
      if (appSlug) {
        const { data: appCat } = await supabase
          .from('categories')
          .select('id')
          .eq('slug', appSlug)
          .maybeSingle()
        if (appCat) {
          await supabase
            .from('event_categories')
            .upsert({ event_id: canonicalEventId, category_id: appCat.id }, { onConflict: 'event_id,category_id' })
        }
      }

      // Track source event with extracted images
      await supabase.from('source_events').insert({
        source_id: sourceId,
        external_event_id: ev.external_event_id,
        source_url: ev.external_url,
        canonical_event_id: canonicalEventId,
        parse_status: 'matched',
        normalized_hash: hash,
        extracted_image_urls: ev.image_urls,
        feed_id: feed.id,
      })
    } catch (e) {
      console.error('Error processing feed event:', ev.title, e)
      errors++
    }
  }

  return { created, updated, errors, imageExtracted, imageFailed }
}

// ── Main Handler ─────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parse optional params
    let feedIds: string[] | null = null
    let dryRun = false
    try {
      const body = await req.json()
      feedIds = body.feed_ids || null
      dryRun = body.dry_run || false
    } catch { /* no body is fine */ }

    // Get enabled feeds
    let query = supabase.from('feed_registry').select('*').eq('enabled', true)
    if (feedIds && feedIds.length > 0) {
      query = query.in('id', feedIds)
    }
    const { data: feeds, error: feedsErr } = await query
    if (feedsErr || !feeds?.length) {
      return new Response(JSON.stringify({ error: 'No enabled feeds found', detail: feedsErr }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get metro areas
    const { data: metroAreas } = await supabase.from('metro_areas').select('*')

    // Get or create feed source
    const getOrCreateSource = async (feedName: string) => {
      const { data: existing } = await supabase
        .from('sources')
        .select('id')
        .eq('name', feedName)
        .maybeSingle()
      if (existing) return existing.id
      const { data: newSource } = await supabase
        .from('sources')
        .insert({ name: feedName, type: 'rss', is_active: true, trust_score: 60 })
        .select('id')
        .single()
      return newSource?.id
    }

    const results: any[] = []

    for (const feed of feeds) {
      console.log(`Processing feed: ${feed.feed_name} (${feed.feed_url})`)

      try {
        // Fetch the feed content
        const resp = await fetch(feed.feed_url, {
          headers: { 'User-Agent': 'BogieBoard/1.0 Event Aggregator' },
        })

        if (!resp.ok) {
          const errMsg = `HTTP ${resp.status} fetching ${feed.feed_url}`
          console.error(errMsg)
          await supabase.from('feed_registry').update({ last_error: errMsg, last_fetched_at: new Date().toISOString() }).eq('id', feed.id)
          results.push({ feed: feed.feed_name, error: errMsg })
          continue
        }

        const content = await resp.text()
        const feedType = feed.feed_type === 'auto' ? detectFeedType(content) : feed.feed_type

        console.log(`  Detected type: ${feedType}, content length: ${content.length}`)

        // Parse based on type
        let parsedEvents: ParsedEvent[]
        if (feedType === 'ical') {
          parsedEvents = parseIcalFeed(content, feed)
        } else {
          parsedEvents = parseRssFeed(content, feed)
        }

        console.log(`  Parsed ${parsedEvents.length} events, ${parsedEvents.filter(e => e.primary_image_url).length} with images`)

        if (dryRun) {
          results.push({
            feed: feed.feed_name,
            type: feedType,
            events_parsed: parsedEvents.length,
            events_with_images: parsedEvents.filter(e => e.primary_image_url).length,
            sample_events: parsedEvents.slice(0, 3).map(e => ({
              title: e.title,
              start_time: e.start_time,
              primary_image_url: e.primary_image_url,
              all_image_urls: e.image_urls,
              fallback_reason: e.primary_image_url ? null : 'no_image_found',
            })),
          })
          continue
        }

        // Create ingestion run
        const sourceId = await getOrCreateSource(`Feed: ${feed.feed_name}`)
        const { data: run } = await supabase.from('ingestion_runs').insert({
          source_id: sourceId, status: 'running',
        }).select('id').single()

        const stats = await upsertFeedEvents(supabase, parsedEvents, feed, sourceId, metroAreas || [], run.id)

        // Update ingestion run
        await supabase.from('ingestion_runs').update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          records_fetched: parsedEvents.length,
          records_created: stats.created,
          records_updated: stats.updated,
          errors_count: stats.errors,
          metadata: { images_extracted: stats.imageExtracted, images_failed: stats.imageFailed },
        }).eq('id', run.id)

        // Update feed registry
        await supabase.from('feed_registry').update({
          last_fetched_at: new Date().toISOString(),
          last_error: null,
        }).eq('id', feed.id)

        results.push({
          feed: feed.feed_name,
          type: feedType,
          ...stats,
          total_parsed: parsedEvents.length,
        })
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error(`Error processing feed ${feed.feed_name}:`, errMsg)
        await supabase.from('feed_registry').update({ last_error: errMsg, last_fetched_at: new Date().toISOString() }).eq('id', feed.id)

        // Log ingestion error
        const sourceId = await getOrCreateSource(`Feed: ${feed.feed_name}`)
        const { data: run } = await supabase.from('ingestion_runs').insert({
          source_id: sourceId, status: 'failed',
        }).select('id').single()
        if (run) {
          await supabase.from('ingestion_errors').insert({
            ingestion_run_id: run.id,
            error_type: 'feed_fetch_error',
            message: errMsg,
          })
        }

        results.push({ feed: feed.feed_name, error: errMsg })
      }
    }

    return new Response(JSON.stringify({ success: true, dry_run: dryRun, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Feed ingestion error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
