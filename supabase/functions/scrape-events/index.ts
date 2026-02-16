import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExtractedEvent {
  title: string
  description: string | null
  start_date: string | null
  start_time: string | null
  end_date: string | null
  end_time: string | null
  venue_name: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  price: string | null
  is_free: boolean
  ticket_url: string | null
  image_url: string | null
  category: string | null
}

// Strip HTML to readable text, keeping structure hints
function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim()
    .substring(0, 15000) // Limit context size for AI
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BogieBoard/1.0; +https://bogieboard.lovable.app)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!resp.ok) {
      console.error(`Failed to fetch ${url}: ${resp.status}`)
      return null
    }
    const html = await resp.text()
    return htmlToText(html)
  } catch (e) {
    console.error(`Error fetching ${url}:`, e)
    return null
  }
}

async function extractEventsWithAI(
  text: string,
  feedName: string,
  defaultCity: string | null,
  defaultState: string | null,
): Promise<ExtractedEvent[]> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured')

  const today = new Date().toISOString().split('T')[0]

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        {
          role: 'system',
          content: `You are an event data extraction assistant. Extract structured event information from webpage text. Today's date is ${today}. Only extract future events. Default city: ${defaultCity ?? 'unknown'}, default state: ${defaultState ?? 'NC'}.`,
        },
        {
          role: 'user',
          content: `Extract all events from this \"${feedName}\" webpage text. Return structured data for each event found.\n\nWebpage text:\n${text}`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'report_events',
            description: 'Report the extracted events from the webpage.',
            parameters: {
              type: 'object',
              properties: {
                events: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: 'Event title' },
                      description: { type: 'string', description: 'Short description, max 500 chars' },
                      start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
                      start_time: { type: 'string', description: 'Start time in HH:MM format (24h), null if unknown' },
                      end_date: { type: 'string', description: 'End date in YYYY-MM-DD, null if same as start' },
                      end_time: { type: 'string', description: 'End time in HH:MM format (24h), null if unknown' },
                      venue_name: { type: 'string', description: 'Venue or location name' },
                      address: { type: 'string', description: 'Street address' },
                      city: { type: 'string', description: 'City name' },
                      state: { type: 'string', description: 'State abbreviation' },
                      zip: { type: 'string', description: 'ZIP code' },
                      price: { type: 'string', description: 'Price info like "Free", "$10", "$10-$25"' },
                      is_free: { type: 'boolean', description: 'Whether the event is free' },
                      ticket_url: { type: 'string', description: 'URL to buy tickets' },
                      image_url: { type: 'string', description: 'Event image URL' },
                      category: { type: 'string', description: 'Category like Music, Food, Sports, Arts, Family, Festival, Comedy, Theatre, Fitness, Community' },
                    },
                    required: ['title', 'is_free'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['events'],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'report_events' } },
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    console.error(`AI extraction error: ${response.status} ${errText}`)
    return []
  }

  const data = await response.json()
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]
  if (!toolCall?.function?.arguments) {
    console.error('No tool call in AI response')
    return []
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments)
    return parsed.events ?? []
  } catch (e) {
    console.error('Failed to parse AI response:', e)
    return []
  }
}

function parsePrice(priceStr: string | null): { min: number | null; max: number | null } {
  if (!priceStr) return { min: null, max: null }
  const numbers = priceStr.match(/\d+(\.\d+)?/g)
  if (!numbers?.length) return { min: null, max: null }
  const vals = numbers.map(Number)
  return { min: Math.min(...vals), max: Math.max(...vals) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get enabled HTML scrape targets
    const { data: feeds, error: feedErr } = await supabase
      .from('feed_registry')
      .select('*')
      .eq('feed_type', 'html')
      .eq('enabled', true)

    if (feedErr) {
      console.error('Error fetching feeds:', feedErr)
      return new Response(JSON.stringify({ error: 'Failed to fetch scrape targets' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!feeds?.length) {
      return new Response(JSON.stringify({ message: 'No HTML scrape targets configured', results: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get metro areas for city matching
    const { data: metroAreas } = await supabase.from('metro_areas').select('*')

    // Get or create scrape source
    const { data: existingSource } = await supabase
      .from('sources')
      .select('id')
      .eq('name', 'Web Scraper')
      .maybeSingle()

    let sourceId: string
    if (existingSource) {
      sourceId = existingSource.id
    } else {
      const { data: newSource } = await supabase
        .from('sources')
        .insert({ name: 'Web Scraper', type: 'scrape', is_active: true, trust_score: 60 })
        .select('id')
        .single()
      sourceId = newSource!.id
    }

    const results: any[] = []

    for (const feed of feeds) {
      const feedResult = { feed_name: feed.feed_name, url: feed.feed_url, events_found: 0, created: 0, updated: 0, errors: 0 }

      // Create ingestion run
      const { data: run } = await supabase
        .from('ingestion_runs')
        .insert({ source_id: sourceId, status: 'running', metadata: { feed_id: feed.id } })
        .select('id')
        .single()

      try {
        // Check if feed should be scraped based on interval
        const intervalHours = (feed as any).scrape_interval_hours ?? 12
        if (feed.last_fetched_at) {
          const lastFetched = new Date(feed.last_fetched_at).getTime()
          const intervalMs = intervalHours * 60 * 60 * 1000
          if (Date.now() - lastFetched < intervalMs) {
            console.log(`Skipping ${feed.feed_name}: last scraped ${Math.round((Date.now() - lastFetched) / 3600000)}h ago, interval is ${intervalHours}h`)
            continue
          }
        }

        console.log(`Scraping: ${feed.feed_name} (${feed.feed_url})`)

        const text = await fetchPage(feed.feed_url)
        if (!text) {
          await supabase.from('feed_registry').update({ last_error: 'Failed to fetch page', last_fetched_at: new Date().toISOString() }).eq('id', feed.id)
          feedResult.errors++
          continue
        }

        const events = await extractEventsWithAI(text, feed.feed_name, feed.default_city, feed.default_state)
        feedResult.events_found = events.length
        console.log(`${feed.feed_name}: ${events.length} events extracted by AI`)

        for (const ev of events) {
          try {
            const city = ev.city || feed.default_city || ''
            const state = ev.state || feed.default_state || 'NC'

            // Determine metro area
            let metroAreaId: string | null = null
            if (metroAreas) {
              for (const metro of metroAreas) {
                const cities = (metro.core_cities as string[]).map((c: string) => c.toLowerCase())
                if (cities.includes(city.toLowerCase())) {
                  metroAreaId = metro.id
                  break
                }
              }
            }

            // Build start_time
            const startDate = ev.start_date || new Date().toISOString().split('T')[0]
            const startTime = ev.start_time ? `${startDate}T${ev.start_time}:00` : `${startDate}T00:00:00`
            const endTime = ev.end_date && ev.end_time
              ? `${ev.end_date}T${ev.end_time}:00`
              : ev.end_time ? `${startDate}T${ev.end_time}:00` : null

            // Upsert venue
            let venueId: string | null = null
            if (ev.venue_name) {
              const { data: existingVenue } = await supabase
                .from('venues')
                .select('id')
                .eq('name', ev.venue_name)
                .eq('city', city)
                .maybeSingle()

              if (existingVenue) {
                venueId = existingVenue.id
              } else {
                const { data: newVenue } = await supabase
                  .from('venues')
                  .insert({
                    name: ev.venue_name,
                    address_1: ev.address,
                    city,
                    state,
                    zip: ev.zip,
                    metro_area_id: metroAreaId,
                  })
                  .select('id')
                  .single()
                if (newVenue) venueId = newVenue.id
              }
            }

            // Generate hash
            const { data: hash } = await supabase.rpc('generate_event_hash', {
              p_title: ev.title,
              p_start_time: startTime,
              p_city: city,
              p_venue_name: ev.venue_name ?? '',
            })

            // Check existing
            const { data: existing } = await supabase
              .from('canonical_events')
              .select('id')
              .eq('normalized_hash', hash)
              .maybeSingle()

            const { min: priceMin, max: priceMax } = parsePrice(ev.price)

            if (existing) {
              await supabase
                .from('canonical_events')
                .update({
                  description_short: ev.description?.substring(0, 500),
                  end_time: endTime,
                  price_min: priceMin,
                  price_max: priceMax,
                  ticket_url: ev.ticket_url,
                  image_url: ev.image_url,
                  last_seen_at: new Date().toISOString(),
                  last_refreshed_at: new Date().toISOString(),
                })
                .eq('id', existing.id)
              feedResult.updated++
            } else {
              const { data: newEvent, error: insertErr } = await supabase
                .from('canonical_events')
                .insert({
                  title: ev.title,
                  description_short: ev.description?.substring(0, 500),
                  start_time: startTime,
                  end_time: endTime,
                  all_day: !ev.start_time,
                  is_free: ev.is_free,
                  price_min: priceMin,
                  price_max: priceMax,
                  ticket_url: ev.ticket_url,
                  image_url: ev.image_url,
                  venue_id: venueId,
                  metro_area_id: metroAreaId,
                  normalized_hash: hash,
                  status: 'active',
                  image_source: 'scrape',
                  source_url: ev.ticket_url || feed.feed_url,
                })
                .select('id')
                .single()

              if (insertErr) {
                console.error('Event insert error:', insertErr)
                feedResult.errors++
                continue
              }

              // Link category — map to app category via DB function
              const eventId = newEvent!.id
              if (ev.category) {
                // Map to app category
                const { data: appSlug } = await supabase.rpc('map_to_app_category', { p_source_category: ev.category })
                if (appSlug) {
                  const { data: appCat } = await supabase
                    .from('categories')
                    .select('id')
                    .eq('slug', appSlug)
                    .maybeSingle()
                  if (appCat) {
                    await supabase
                      .from('event_categories')
                      .upsert({ event_id: eventId, category_id: appCat.id }, { onConflict: 'event_id,category_id' })
                  }
                }
                
                // Also store original category
                const slug = ev.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                let { data: cat } = await supabase
                  .from('categories')
                  .select('id')
                  .eq('slug', slug)
                  .maybeSingle()

                if (!cat) {
                  const { data: newCat } = await supabase
                    .from('categories')
                    .insert({ name: ev.category, slug })
                    .select('id')
                    .single()
                  cat = newCat
                }

                if (cat) {
                  await supabase
                    .from('event_categories')
                    .upsert({ event_id: eventId, category_id: cat.id }, { onConflict: 'event_id,category_id' })
                }
              } else {
                // No category from AI — try mapping from title/description
                const textToMap = `${ev.title} ${ev.description ?? ''}`
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
                      .upsert({ event_id: eventId, category_id: appCat.id }, { onConflict: 'event_id,category_id' })
                  }
                }
              }

              feedResult.created++
            }

            // Track source event
            await supabase.from('source_events').insert({
              source_id: sourceId,
              feed_id: feed.id,
              external_event_id: `scrape_${hash}`,
              source_url: feed.feed_url,
              canonical_event_id: existing?.id,
              parse_status: 'matched',
              normalized_hash: hash,
            })
          } catch (e) {
            console.error(`Error processing scraped event \"${ev.title}\":`, e)
            feedResult.errors++
          }
        }

        // Update feed metadata
        await supabase.from('feed_registry').update({
          last_fetched_at: new Date().toISOString(),
          last_error: null,
        }).eq('id', feed.id)

      } catch (e) {
        console.error(`Error scraping ${feed.feed_name}:`, e)
        feedResult.errors++
        await supabase.from('feed_registry').update({
          last_error: e instanceof Error ? e.message : 'Unknown error',
          last_fetched_at: new Date().toISOString(),
        }).eq('id', feed.id)
      }

      // Finalize ingestion run
      if (run) {
        await supabase.from('ingestion_runs').update({
          status: feedResult.errors > 0 && feedResult.created === 0 ? 'failed' : 'completed',
          ended_at: new Date().toISOString(),
          records_fetched: feedResult.events_found,
          records_created: feedResult.created,
          records_updated: feedResult.updated,
          errors_count: feedResult.errors,
        }).eq('id', run.id)
      }

      results.push(feedResult)
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Scrape error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
