/**
 * Centralized MVP holiday & seasonal date-window config.
 *
 * All shelf/tab logic must reference this file rather than hardcoding dates
 * elsewhere. A holiday/seasonal "window" is a date range used to decide
 * whether an event qualifies for the Holiday & Seasonal Picks shelf — it is
 * NOT a claim that any individual event is officially tied to that holiday.
 * Never label an individual event card as holiday-specific based solely on
 * falling inside one of these windows.
 *
 * Fixed-formula US federal holidays and Mother's/Father's Day are computed
 * from calendar rules (nth-weekday-of-month, etc.) so this file never needs
 * annual date maintenance for those entries.
 *
 * Movable religious holidays (lunar/astronomical calendars) are NOT computed
 * here — they are hardcoded best-effort estimates and are explicitly flagged
 * for annual verification. Do not treat them as authoritative without checking.
 */

export interface HolidayWindow {
  id: string;
  label: string;
  start: Date;
  end: Date;
}

function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, n: number): Date {
  const first = new Date(year, monthIndex, 1);
  const firstWeekday = first.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return new Date(year, monthIndex, day);
}

function lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number): Date {
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0);
  const lastWeekday = lastDayOfMonth.getDay();
  const diff = (lastWeekday - weekday + 7) % 7;
  return new Date(year, monthIndex, lastDayOfMonth.getDate() - diff);
}

function withBuffer(date: Date, beforeDays: number, afterDays: number): { start: Date; end: Date } {
  const start = new Date(date);
  start.setDate(start.getDate() - beforeDays);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setDate(end.getDate() + afterDays);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Fixed-formula US federal holidays + Mother's/Father's Day, computed per year. */
function computeFixedRuleHolidays(year: number): HolidayWindow[] {
  const entries: Array<{ id: string; label: string; date: Date; before: number; after: number }> = [
    { id: 'new-years', label: "New Year's", date: new Date(year, 0, 1), before: 2, after: 1 },
    { id: 'mlk-day', label: 'MLK Day', date: nthWeekdayOfMonth(year, 0, 1, 3), before: 3, after: 0 },
    { id: 'presidents-day', label: 'Presidents Day', date: nthWeekdayOfMonth(year, 1, 1, 3), before: 3, after: 0 },
    { id: 'mothers-day', label: "Mother's Day", date: nthWeekdayOfMonth(year, 4, 0, 2), before: 7, after: 0 },
    { id: 'memorial-day', label: 'Memorial Day', date: lastWeekdayOfMonth(year, 4, 1), before: 5, after: 0 },
    { id: 'fathers-day', label: "Father's Day", date: nthWeekdayOfMonth(year, 5, 0, 3), before: 7, after: 0 },
    { id: 'juneteenth', label: 'Juneteenth', date: new Date(year, 5, 19), before: 2, after: 0 },
    { id: 'independence-day', label: 'Independence Day', date: new Date(year, 6, 4), before: 5, after: 1 },
    { id: 'labor-day', label: 'Labor Day', date: nthWeekdayOfMonth(year, 8, 1, 1), before: 4, after: 0 },
    { id: 'columbus-day', label: 'Columbus Day', date: nthWeekdayOfMonth(year, 9, 1, 2), before: 3, after: 0 },
    { id: 'halloween', label: 'Halloween', date: new Date(year, 9, 31), before: 14, after: 1 },
    { id: 'veterans-day', label: 'Veterans Day', date: new Date(year, 10, 11), before: 3, after: 0 },
    { id: 'thanksgiving', label: 'Thanksgiving', date: nthWeekdayOfMonth(year, 10, 4, 4), before: 7, after: 4 },
    { id: 'christmas', label: 'Christmas', date: new Date(year, 11, 25), before: 21, after: 3 },
  ];

  return entries.map((e) => {
    const { start, end } = withBuffer(e.date, e.before, e.after);
    return { id: `${e.id}-${year}`, label: e.label, start, end };
  });
}

/**
 * Movable religious holidays — approximate dates, NOT astronomically computed.
 * VERIFY THESE DATES before each calendar year they're relied on. These are
 * best-effort estimates only and may be off by a day or more.
 */
const MOVABLE_RELIGIOUS_HOLIDAYS: HolidayWindow[] = [
  // 2026 — VERIFY: Western/Gregorian Easter
  { id: 'easter-2026', label: 'Easter', start: new Date(2026, 2, 29), end: new Date(2026, 3, 6) },
  // 2026 — VERIFY: Ramadan start (lunar calendar, approximate)
  { id: 'ramadan-2026', label: 'Ramadan', start: new Date(2026, 1, 17), end: new Date(2026, 1, 24) },
  // 2026 — VERIFY: Diwali (lunar calendar, approximate)
  { id: 'diwali-2026', label: 'Diwali', start: new Date(2026, 10, 6), end: new Date(2026, 10, 10) },
  // 2026 — VERIFY: Hanukkah start (lunar calendar, approximate)
  { id: 'hanukkah-2026', label: 'Hanukkah', start: new Date(2026, 11, 4), end: new Date(2026, 11, 13) },
];

/** NC seasonal periods — approximate, marketing-style windows, not exact facts. */
function computeSeasonalWindows(year: number): HolidayWindow[] {
  return [
    { id: `nc-spring-${year}`, label: 'NC Spring', start: new Date(year, 2, 1), end: new Date(year, 4, 15) },
    { id: `nc-summer-${year}`, label: 'NC Summer', start: new Date(year, 4, 20), end: new Date(year, 8, 1) },
    { id: `nc-fall-foliage-${year}`, label: 'NC Fall Foliage', start: new Date(year, 9, 1), end: new Date(year, 10, 15) },
    { id: `nc-holiday-season-${year}`, label: 'Holiday Season', start: new Date(year, 10, 20), end: new Date(year + 1, 0, 2) },
  ];
}

export function getAllHolidayWindows(referenceYear: number = new Date().getFullYear()): HolidayWindow[] {
  return [
    ...computeFixedRuleHolidays(referenceYear),
    ...computeFixedRuleHolidays(referenceYear + 1), // covers year-boundary lookahead
    ...MOVABLE_RELIGIOUS_HOLIDAYS,
    ...computeSeasonalWindows(referenceYear),
    ...computeSeasonalWindows(referenceYear + 1),
  ];
}

/**
 * Returns the window "today" currently falls inside, or the soonest upcoming
 * one within `withinDays`, else null. Fixed-rule/religious holidays are
 * ordered before broad seasonal windows so a specific holiday wins ties.
 */
export function getActiveOrUpcomingHolidayWindow(
  now: Date = new Date(),
  withinDays: number = 45,
): HolidayWindow | null {
  const windows = getAllHolidayWindows(now.getFullYear());
  const active = windows.find((w) => now >= w.start && now <= w.end);
  if (active) return active;

  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + withinDays);

  const upcoming = windows
    .filter((w) => w.start > now && w.start <= horizon)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return upcoming[0] ?? null;
}
