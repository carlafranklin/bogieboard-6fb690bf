/**
 * Centralized, auditable audience-tab and homepage-shelf rules.
 *
 * Every rule here is a plain, query-style predicate over fields already
 * returned by the search_events RPC (category_names, is_free, price_min,
 * start_time, image_url). No AI tagging, no unverified claims, no
 * popularity/social signals that don't exist in the data yet.
 *
 * "Local Picks" is intentionally NOT a popularity ranking — there is no
 * click/save/view data backing it today. It sorts events with a real listing
 * image first, then by soonest start time, as an honest, data-driven (not
 * fabricated) ordering. Do not relabel this shelf "Popular" until real
 * engagement data exists to justify the claim.
 */

import { getActiveOrUpcomingHolidayWindow } from './holidays';

export interface HomeEvent {
  event_id: string;
  title: string;
  description_short: string | null;
  start_time: string;
  end_time: string | null;
  all_day: boolean;
  is_free: boolean;
  price_min: number | null;
  price_max: number | null;
  ticket_url: string | null;
  image_url: string | null;
  age_restriction: number | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_zip: string | null;
  category_names: string[] | null;
  source_url: string | null;
  discount_info: string | null;
}

function categorySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function eventHasAnyCategory(event: HomeEvent, slugs: string[]): boolean {
  const eventSlugs = (event.category_names ?? []).map(categorySlug);
  return slugs.some((s) => eventSlugs.includes(s));
}

export function isFreeEvent(event: HomeEvent): boolean {
  return event.is_free === true;
}

/**
 * "Budget-friendly" is a price rule only — there is no data field that
 * identifies student-specific relevance. Keep tab copy honest about this
 * (e.g. "budget-friendly picks"), not implying verified student curation.
 */
export function isBudgetFriendly(event: HomeEvent, maxPrice = 20): boolean {
  return event.is_free === true || (event.price_min !== null && event.price_min <= maxPrice);
}

export function isEveningEvent(event: HomeEvent): boolean {
  if (event.all_day) return false;
  const hour = new Date(event.start_time).getHours();
  return hour >= 17;
}

export function getUpcomingWeekendRange(now: Date = new Date()): { start: Date; end: Date } {
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const daysUntilFriday = (5 - day + 7) % 7;
  const start = new Date(now);
  start.setDate(start.getDate() + daysUntilFriday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 2); // Friday -> Sunday
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function isWithinWeekend(event: HomeEvent, now: Date = new Date()): boolean {
  const { start, end } = getUpcomingWeekendRange(now);
  const t = new Date(event.start_time).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

const byStartTimeAsc = (a: HomeEvent, b: HomeEvent): number =>
  new Date(a.start_time).getTime() - new Date(b.start_time).getTime();

const byImageThenStartTime = (a: HomeEvent, b: HomeEvent): number => {
  const aHasImage = a.image_url ? 0 : 1;
  const bHasImage = b.image_url ? 0 : 1;
  if (aHasImage !== bHasImage) return aHasImage - bHasImage;
  return byStartTimeAsc(a, b);
};

// ---------------------------------------------------------------------------
// Audience tabs — these narrow the whole page to a single interest.
// ---------------------------------------------------------------------------

export interface AudienceTab {
  id: string;
  label: string;
  /** Used in "No {description} found" empty-state copy. */
  description: string;
  filter: (event: HomeEvent) => boolean;
}

export const AUDIENCE_TABS: AudienceTab[] = [
  {
    id: 'all',
    label: 'All Events',
    description: 'events',
    filter: () => true,
  },
  {
    id: 'families-kids',
    label: 'Families & Kids',
    description: 'family-friendly events',
    filter: (e) => eventHasAnyCategory(e, ['family-kids']),
  },
  {
    id: 'nightlife-social',
    label: 'Nightlife & Social',
    description: 'nightlife or social events',
    filter: (e) => eventHasAnyCategory(e, ['bar-fun', 'live-music']),
  },
  {
    id: 'students-budget',
    label: 'Students & Budget',
    description: 'budget-friendly events',
    filter: (e) => isBudgetFriendly(e),
  },
  {
    id: 'networking-business',
    label: 'Networking & Business',
    description: 'networking or business events',
    filter: (e) => eventHasAnyCategory(e, ['business', 'lecture-series']),
  },
];

// ---------------------------------------------------------------------------
// Homepage shelves — shown together under the "All Events" tab.
// ---------------------------------------------------------------------------

export interface HomeShelf {
  id: string;
  /** May contain a literal "{metro}" token, replaced at render time. */
  title: string;
  emptyMessage: string;
  filter: (event: HomeEvent, now: Date) => boolean;
  sort: (a: HomeEvent, b: HomeEvent) => number;
  /** If false, the whole shelf is hidden (not just shown-empty) — used by the holiday shelf when no window is currently relevant. */
  isEligible?: (now: Date) => boolean;
}

export const HOME_SHELVES: HomeShelf[] = [
  {
    id: 'happening-near-you',
    title: 'Happening Near You',
    emptyMessage: 'No upcoming events found for this area yet.',
    filter: () => true,
    sort: byStartTimeAsc,
  },
  {
    id: 'this-weekend',
    title: 'This Weekend',
    emptyMessage: 'Nothing on the calendar for this weekend yet.',
    filter: (e, now) => isWithinWeekend(e, now),
    sort: byStartTimeAsc,
  },
  {
    id: 'free-things-to-do',
    title: 'Free Things To Do',
    emptyMessage: 'No free events found right now.',
    filter: (e) => isFreeEvent(e),
    sort: byStartTimeAsc,
  },
  {
    id: 'local-picks',
    title: 'Local Picks in {metro}',
    emptyMessage: 'No local picks available yet.',
    filter: () => true,
    sort: byImageThenStartTime,
  },
  {
    id: 'family-friendly',
    title: 'Family-Friendly',
    emptyMessage: 'No family-friendly events found right now.',
    filter: (e) => eventHasAnyCategory(e, ['family-kids']),
    sort: byStartTimeAsc,
  },
  {
    id: 'date-night',
    title: 'Date Night',
    emptyMessage: 'No date night picks found right now.',
    filter: (e) => eventHasAnyCategory(e, ['arts-theater', 'live-music', 'bar-fun']) && isEveningEvent(e),
    sort: byStartTimeAsc,
  },
  {
    id: 'live-music-nightlife',
    title: 'Live Music & Nightlife',
    emptyMessage: 'No live music or nightlife events found right now.',
    filter: (e) => eventHasAnyCategory(e, ['live-music', 'bar-fun']),
    sort: byStartTimeAsc,
  },
  {
    id: 'arts-culture-community',
    title: 'Arts, Culture & Community',
    emptyMessage: 'No arts or community events found right now.',
    filter: (e) => eventHasAnyCategory(e, ['arts-theater', 'festivals']),
    sort: byStartTimeAsc,
  },
  {
    id: 'holiday-seasonal',
    title: 'Holiday & Seasonal Picks',
    emptyMessage: 'No seasonal picks found right now.',
    isEligible: (now) => getActiveOrUpcomingHolidayWindow(now) !== null,
    filter: (e, now) => {
      const window = getActiveOrUpcomingHolidayWindow(now);
      if (!window) return false;
      const t = new Date(e.start_time).getTime();
      return t >= window.start.getTime() && t <= window.end.getTime();
    },
    sort: byStartTimeAsc,
  },
];
