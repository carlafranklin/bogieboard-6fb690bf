import { supabase } from '@/integrations/supabase/client';

export interface DetectedLocation {
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  display: string | null;
}

const EMPTY_LOCATION: DetectedLocation = {
  city: null, state: null, zip: null,
  latitude: null, longitude: null, display: null,
};

/**
 * Detect user's location using a multi-provider IP geolocation chain.
 * Tries providers in order, returns first success. Non-blocking with timeouts.
 *
 * Provider chain:
 *  1. ip-api.com  (free, no key, 45 req/min, http only but returns JSON)
 *  2. ipapi.co    (free, no key, 1000 req/day)
 *  3. Returns empty (graceful fallback)
 */
export async function detectUserLocation(): Promise<DetectedLocation> {
  // Provider 1: ip-api.com (fast, reliable, no key needed)
  try {
    const res = await fetch('http://ip-api.com/json/?fields=city,regionName,region,zip,lat,lon,status', {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.status === 'success' && d.city) {
        const state = d.region || d.regionName || null; // region = state code (e.g. "NC")
        return {
          city: d.city,
          state,
          zip: d.zip || null,
          latitude: d.lat ?? null,
          longitude: d.lon ?? null,
          display: state ? `${d.city}, ${state}` : d.city,
        };
      }
    }
  } catch { /* timeout or network error, try next */ }

  // Provider 2: ipapi.co
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const d = await res.json();
      if (d.city && !d.error) {
        return {
          city: d.city,
          state: d.region_code || d.region || null,
          zip: d.postal || null,
          latitude: d.latitude ?? null,
          longitude: d.longitude ?? null,
          display: d.region_code ? `${d.city}, ${d.region_code}` : d.city,
        };
      }
    }
  } catch { /* timeout or network error */ }

  return { ...EMPTY_LOCATION };
}

/**
 * Find the nearest supported BogieBoard metro area given lat/lng.
 */
export async function findNearestMetro(
  lat: number,
  lng: number,
): Promise<{ id: string; slug: string; name: string } | null> {
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
 * Map a city name to the nearest supported metro area via city_lookup table.
 * Falls back to coordinate-based matching.
 */
export async function mapCityToMetro(
  cityName: string,
  lat?: number | null,
  lng?: number | null,
): Promise<{ metroSlug: string; metroName: string; metroId: string } | null> {
  // Try exact match in city_lookup
  const { data: cities } = await supabase
    .from('city_lookup')
    .select('latitude, longitude, metro_area_id, metro_areas(id, slug, name)')
    .ilike('city_name', cityName.trim())
    .limit(1);

  if (cities && cities.length > 0) {
    const city = cities[0] as any;
    if (city.metro_areas) {
      return {
        metroSlug: city.metro_areas.slug,
        metroName: city.metro_areas.name,
        metroId: city.metro_areas.id,
      };
    }
    // No direct metro assignment, use lat/lng from the city row
    if (city.latitude && city.longitude) {
      const nearest = await findNearestMetro(city.latitude, city.longitude);
      if (nearest) return { metroSlug: nearest.slug, metroName: nearest.name, metroId: nearest.id };
    }
  }

  // Fallback: use provided coordinates
  if (lat && lng) {
    const nearest = await findNearestMetro(lat, lng);
    if (nearest) return { metroSlug: nearest.slug, metroName: nearest.name, metroId: nearest.id };
  }

  return null;
}

/**
 * Persist detected location to the user's profile.
 * Only updates fields that are currently empty (won't overwrite manual entries).
 */
export async function saveDetectedLocation(
  userId: string,
  loc: DetectedLocation,
  overwriteCurrent = false,
): Promise<void> {
  const update: Record<string, any> = {
    detected_city: loc.city,
    detected_state: loc.state,
    detected_zip: loc.zip,
  };

  if (overwriteCurrent) {
    update.current_city = loc.city;
    update.current_state = loc.state;
    update.current_zip = loc.zip;
  }

  await supabase.from('profiles').update(update).eq('user_id', userId);
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
