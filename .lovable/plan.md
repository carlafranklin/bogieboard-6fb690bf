## Add Team Page

### New page: `src/pages/Team.tsx`
- Header + Footer wrapper (matches site pattern, e.g. PrivacyPolicy/CookiePolicy).
- Page title "Our Team" with short intro line.
- Two member cards (responsive grid, 1 col mobile / 2 col md+):
  1. **Marvin Boguslawski** — Founder & CEO — LinkedIn: https://www.linkedin.com/in/marvin-boguslawski-15097014/
  2. **Carla Franklin** — Co-Founder & Chief Technology Officer — LinkedIn: https://www.linkedin.com/in/carlafranklin/
- Each card: avatar/initials placeholder (no photos provided), name, title, LinkedIn button (opens in new tab, `rel="noopener noreferrer"`).
- Uses existing `Card`, `Avatar`, `Button` UI primitives and brand tokens (no hardcoded colors).

### Route: `src/App.tsx`
- Import `Team` and add `<Route path="/team" element={<Team />} />` above the catch-all.

### Footer link: `src/components/Footer.tsx`
- In the Company list (guest-only block), add a `<li>` with `<a href="/team">Team</a>` above About.
- Note: Company section currently only renders when `!isLoggedIn`. Leaving that gating as-is for consistency; the `/team` route remains directly reachable for everyone.

### Out of scope
- No photos (none provided).
- No CMS/database — content is static in the page file so future edits are a single-file change.
- No changes to auth, env, edge functions, or workflows.
