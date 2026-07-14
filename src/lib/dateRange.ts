import { getUpcomingWeekendRange } from '@/data/homeShelves';

export interface DateBoundary {
  from: Date;
  to: Date;
}

export function localStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function localEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function getTodayRange(now: Date = new Date()): DateBoundary {
  return { from: localStartOfDay(now), to: localEndOfDay(now) };
}

// Reuses the same Fri-through-Sun window already used by the "This Weekend" home shelf,
// so Home's date picker and that shelf never disagree about what "this weekend" means.
export function getWeekendRange(now: Date = new Date()): DateBoundary {
  const { start, end } = getUpcomingWeekendRange(now);
  return { from: start, to: end };
}

export function getNext7DaysRange(now: Date = new Date()): DateBoundary {
  const from = localStartOfDay(now);
  const to = localEndOfDay(new Date(from.getTime() + 6 * 24 * 60 * 60 * 1000));
  return { from, to };
}

export function getCustomDayRange(date: Date): DateBoundary {
  return { from: localStartOfDay(date), to: localEndOfDay(date) };
}

export function getCustomRange(from: Date, to?: Date): DateBoundary {
  return { from: localStartOfDay(from), to: localEndOfDay(to ?? from) };
}

export function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}
