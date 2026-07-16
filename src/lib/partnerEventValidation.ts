// Date/time helpers for the Partner Dashboard event form.
// All comparisons are done on plain strings (YYYY-MM-DD dates, "H:MM AM/PM"
// times) rather than Date objects, so there is no UTC/local timezone shift risk.

export const TIME_HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
export const TIME_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
export const TIME_AMPM = ['AM', 'PM'] as const;

export interface TimeParts {
  hour: string;
  minute: string;
  ampm: string;
}

const TIME_PATTERN = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

export function parseTimeString(value: string | null | undefined): TimeParts {
  const match = value?.trim().match(TIME_PATTERN);
  if (!match) return { hour: '', minute: '', ampm: '' };
  const [, hour, minute, ampm] = match;
  return { hour: String(Number(hour)), minute, ampm: ampm.toUpperCase() };
}

export function formatTimeParts(hour: string, minute: string, ampm: string): string | null {
  if (!hour || !minute || !ampm) return null;
  return `${hour}:${minute} ${ampm}`;
}

function toMinutesSinceMidnight(value: string | null | undefined): number | null {
  const { hour, minute, ampm } = parseTimeString(value);
  if (!hour || !minute || !ampm) return null;
  const h = Number(hour) % 12 + (ampm === 'PM' ? 12 : 0);
  return h * 60 + Number(minute);
}

export function getTodayLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Plain string comparison is safe here because both sides are YYYY-MM-DD.
export function isPastDate(dateStr: string): boolean {
  return dateStr < getTodayLocalDateString();
}

// "End time earlier than or equal to start time" only applies when the event
// doesn't span into a later day (an explicit later end_date is a multi-day
// event and isn't a same-day ordering conflict).
export function isEndBeforeOrEqualStart(
  startDate: string,
  startTime: string,
  endDate: string | null | undefined,
  endTime: string
): boolean {
  const effectiveEndDate = endDate || startDate;
  if (effectiveEndDate !== startDate) return false;
  const startMin = toMinutesSinceMidnight(startTime);
  const endMin = toMinutesSinceMidnight(endTime);
  if (startMin == null || endMin == null) return false;
  return endMin <= startMin;
}

export interface PartnerEventFormLike {
  title?: string | null;
  description?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  end_time?: string | null;
  venue_address?: string | null;
  city?: string | null;
  state?: string | null;
  image_url?: string | null;
}

// Returns the list of missing required-field labels, in form order, for the
// "tell the partner exactly what to fix" toast.
export function getMissingEventFields(event: PartnerEventFormLike, hasImage: boolean): string[] {
  const missing: string[] = [];
  if (!event.title?.trim()) missing.push('Title');
  if (!event.description?.trim()) missing.push('Description');
  if (!event.event_date) missing.push('Date');
  if (!event.event_time) missing.push('Start Time');
  if (!event.end_time) missing.push('End Time');
  if (!event.venue_address?.trim()) missing.push('Venue Address');
  if (!event.city?.trim()) missing.push('Venue City');
  if (!event.state?.trim()) missing.push('Venue State');
  if (!hasImage) missing.push('Event Image');
  return missing;
}
