import { supabase } from '@/integrations/supabase/client';
import { detectUserLocation, findNearestMetro, mapCityToMetro } from '@/lib/locationUtils';

/**
 * Ensures the logged-in user has a complete profile with location data.
 * Call after every successful login / session restore.
 * Safe to call multiple times — idempotent.
 */
export async function syncProfileOnLogin(userId: string, email?: string | null): Promise<void> {
  console.log('[profileSync] starting for', userId);

  // 1. Check if profile row exists
  const { data: existing, error: fetchErr } = await supabase
    .from('profiles')
    .select('id, first_login_at, last_login_at, detected_city, detected_state, detected_zip, current_city, current_state, current_zip')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr) {
    console.error('[profileSync] fetch error:', fetchErr);
  }

  const now = new Date().toISOString();

  if (!existing) {
    // Profile row missing — create it (trigger should have done this but safety net)
    console.log('[profileSync] no profile row found, creating one');
    const { error: insertErr } = await supabase.from('profiles').insert({
      user_id: userId,
      email: email || null,
      first_login_at: now,
      last_login_at: now,
    } as any);
    if (insertErr) console.error('[profileSync] insert error:', insertErr);
  } else {
    // Update login timestamps
    const update: Record<string, any> = { last_login_at: now };
    if (!existing.first_login_at) update.first_login_at = now;
    const { error: updateErr } = await supabase.from('profiles').update(update).eq('user_id', userId);
    if (updateErr) console.error('[profileSync] timestamp update error:', updateErr);
  }

  // 2. Detect current location (non-blocking — fire and forget for speed)
  detectAndSaveLocation(userId, existing).catch(err =>
    console.error('[profileSync] location detection error:', err)
  );
}

async function detectAndSaveLocation(userId: string, existingProfile: any): Promise<void> {
  console.log('[profileSync] detecting location...');
  const loc = await detectUserLocation();
  console.log('[profileSync] detected location:', loc);

  if (!loc.city) {
    console.log('[profileSync] no city detected, skipping location save');
    return;
  }

  // Always update detected_* fields (reflects current login location)
  const locationUpdate: Record<string, any> = {
    detected_city: loc.city,
    detected_state: loc.state,
    detected_zip: loc.zip,
  };

  // Only fill current_* if they're empty (don't overwrite user-entered data)
  if (!existingProfile?.current_city) {
    locationUpdate.current_city = loc.city;
    locationUpdate.current_state = loc.state;
    locationUpdate.current_zip = loc.zip;
  }

  const { error } = await supabase.from('profiles').update(locationUpdate).eq('user_id', userId);
  if (error) console.error('[profileSync] location save error:', error);
  else console.log('[profileSync] location saved:', locationUpdate);
}
