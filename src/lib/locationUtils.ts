import { supabase } from '@/integrations/supabase/client';

interface DetectedLocation {
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  display: string | null;
}

/**
 * Detect user's location using IP-based geolocation (ipapi.co free tier).
 * Falls back gracefully if unavailable.
 */
export async function detectUserLocation(): Promise<DetectedLocation> {
  const empty: DetectedLocation = { city: null, state: null, zip: null, latitude: null, longitude: null, display: null };

  // Try IP geolocation (ipapi.co - free, no API key, 1000 req/day)
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data.city) {
        return {
          city: data.city,
          state: data.region_code || data.region || null,
          zip: data.postal || null,
          latitude: data.latitude || null,
          longitude: data.longitude || null,
          display: data.region_code ? `${data.city}, ${data.region_code}` : data.city,
        };
      }
    }
  } catch { /* timeout or error */ }

  return empty;
}

/**
 * Find the nearest supported BogieBoard metro area given lat/lng.
 * Uses haversine distance.
 */
export async function findNearestMetro(lat: number, lng: number): Promise<{ id: string; slug: string; name: string } | null> {
  const { data: metros } = await supabase
    .from('metro_areas')
    .select('id, slug, name, latitude, longitude')
    .not('latitude', 'is', null);

  if (!metros || metros.length === 0) return null;

  let nearest = metros[0];
  let minDist = haversine(lat, lng, metros[0].latitude!, metros[0].longitude!);

  for (const m of metros) {
    if (!m.latitude || !m.longitude) continue;
    const d = haversine(lat, lng, m.latitude, m.longitude);
    if (d < minDist) {
      minDist = d;
      nearest = m;
    }
  }

  return { id: nearest.id, slug: nearest.slug, name: nearest.name };
}

/**
 * Map a city name to the nearest supported metro area by looking up city_lookup.
 */
export async function mapCityToMetro(cityName: string): Promise<{ metroSlug: string; metroName: string } | null> {
  // Try exact match in city_lookup
  const { data: cities } = await supabase
    .from('city_lookup')
    .select('latitude, longitude, metro_area_id, metro_areas(slug, name)')
    .ilike('city_name', cityName.trim())
    .limit(1);

  if (cities && cities.length > 0) {
    const city = cities[0] as any;
    if (city.metro_areas) {
      return { metroSlug: city.metro_areas.slug, metroName: city.metro_areas.name };
    }
    // No direct metro assignment, use lat/lng to find nearest
    if (city.latitude && city.longitude) {
      const nearest = await findNearestMetro(city.latitude, city.longitude);
      if (nearest) return { metroSlug: nearest.slug, metroName: nearest.name };
    }
  }

  return null;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
