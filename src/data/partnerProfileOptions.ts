// Shared option lists for partner profile fields — used at sign-up (PartnerMember.tsx)
// and in the Partner Dashboard Profile tab, so the two forms never drift apart.

export const INDUSTRY_SECTOR_OPTIONS = [
  'For-profit business',
  'Nonprofit',
  'Public sector / government',
  'Educational institution',
  'Faith-based organization',
  'Community organization',
  'Other',
] as const;

export const INDUSTRY_TYPE_OPTIONS = [
  'Restaurant / Food & Beverage',
  'Bar / Nightlife',
  'Live Music / Venue',
  'Arts / Culture',
  'Family / Kids',
  'Sports / Recreation',
  'Retail / Shopping',
  'Health / Wellness',
  'Education',
  'Faith / Spiritual',
  'Professional Services',
  'Community / Nonprofit',
  'Government / Public Sector',
  'Other',
] as const;

export const EMPLOYEE_COUNT_OPTIONS = [
  '1',
  '2–5',
  '6–10',
  '11–25',
  '26–50',
  '51–100',
  '101–250',
  '250+',
  'Prefer not to say',
] as const;

export const CUSTOMER_AUDIENCE_OPTIONS = [
  'Families',
  'Young professionals',
  'College students',
  'Seniors',
  'Tourists / visitors',
  'Faith communities',
  'Corporate / business audience',
  'Parents with young children',
  'Teens',
  'General public',
  'Other',
] as const;

export const MARKETING_GOAL_OPTIONS = [
  'Drive foot traffic',
  'Promote events',
  'Sell tickets',
  'Promote specials/deals',
  'Increase brand awareness',
  'Reach families',
  'Reach young professionals',
  'Reach tourists',
  'Recruit volunteers',
  'Build email/social following',
  'Other',
] as const;
