# Jaldrishti plan

What we build next, in order. Tomorrow covers parts 1 to 3; part 4 is the longer roadmap.

Today the app has: live citizen reports with photos, depth levels and auto-expiry; safer routes for two-wheelers and cars that avoid reports and simulated flooding; an activity log with spot history; and a 3D flood simulation that shows water on roads, depth on hover, and a heat map.

---

## 1. Track my daily route

**Goal:** a user saves the trips they make every day and hears about flooding on them without opening the map.

**Build:**
- A new **Saved** tab (fourth tab) listing saved places (Home, Office) and saved trips (Home → Office).
- "Save this route" button on the Route tab after a route is found. Store the start, end, vehicle and a name.
- For each saved trip, show a status line: "Clear", "1 report on your route", or "Heavy rain expected, 2 roads may flood" (from the rain forecast and the simulation).
- Optional time window per trip ("weekdays, 8–10 am") so the app checks it before the user leaves.
- Browser notification when a new report lands on a saved trip (Notifications API; ask permission only after the user saves a trip).

**Storage:** on the device first (localStorage), so no sign-in is needed. Move to Supabase with phone sign-in later (part 4).

**Done when:** a saved Home → Office trip shows "1 report on your route" within a few seconds of someone reporting on it, and a notification fires if the app is open in the background.

**Files:** new `src/components/SavedPanel.jsx`, `src/lib/saved.js`; small changes in `App.jsx` (tab) and `RoutePanel.jsx` (save button).

---

## 2. Live tracking of logs

**Goal:** the Activity tab feels live, and anyone can see what has happened during a rain event as it unfolds.

**Build:**
- New reports, confirmations and clears appear at the top of Activity instantly (Supabase realtime is already wired; add a short highlight animation and a "New" badge).
- A small toast on the map when a report arrives while you are looking at another tab ("New: knee-deep at Bellandur ORR").
- Log more event types, not just reports: "Still flooded" votes, "Cleared" votes, and the rain level changing (Green → Orange).
- A live counter in the Map tab: "3 reports in the last hour".
- Filters on Activity: Last hour / Today / 7 days, and by depth.

**Database:** add an `events` table (`id, type, report_id, severity, place, created_at`) written by the existing vote functions, plus a `report_events(hours)` function like `report_history`.

**Done when:** two browsers are open; a report or vote in one shows in the other's Activity tab within 2 seconds, with the right label.

**Files:** `supabase/migrations/003_events.sql`, `src/lib/store.js`, `src/components/ActivityPanel.jsx`.

---

## 3. Dummy dataset

**Goal:** realistic demo data so the activity log, spot history, heat map and routing look like a real monsoon, without passing fake data off as real.

**Build:**
- A script `scripts/seed-demo.mjs` that generates about 30 days of reports for Bellandur:
  - more reports on rainy days (use Open-Meteo **historical** rainfall for Sept 2022 or May 2025);
  - placed on low-lying roads (use `depthAt` from `src/lib/flood.js`) and near the known flood-prone spots;
  - depth based on how low the road is and how much it rained;
  - realistic times (clusters in the evening rain), confirmations and clears.
- Mark every generated row with `is_demo = true` (new column), and show "Demo data" in the app when demo rows are on screen.
- A "Replay Sept 2022" button: plays the seeded reports in order over 60 seconds, with the simulation water rising to match the rainfall.
- A one-line command to remove it all: `delete from reports where is_demo`.

**Done when:** `node scripts/seed-demo.mjs` fills the database, the heat map and "Often flooded" list look plausible, and the demo badge shows.

**Files:** `scripts/seed-demo.mjs`, `supabase/migrations/004_demo.sql`, small changes in `ActivityPanel.jsx` and `MapPanel.jsx`.

---

## 4. Future plans

**Better flood model (most important)**
- Today's simulation uses ground height only (about 20 m detail), so it shows which roads flood first, not true depths.
- Next: learn **per-spot thresholds** from reports joined with rainfall ("this underpass floods above ~35 mm/hour"), then warn before anyone reports.
- Add drains, lakes and past flood records (BBMP flood-prone list, Sentinel-1 radar flood maps) as model inputs.

**Reaching people**
- Push notifications (installable app) and a WhatsApp bot: "Is Silk Board flooded?".
- Kannada throughout the app, not just the rain line.
- First-time intro: three short screens and "save your home".

**Trust**
- Phone sign-in (optional) with reporter reputation; reports from trusted reporters show first.
- Photo moderation and blurring faces and number plates (India's DPDP Act).

**Getting data in (cold start)**
- Pilot with 2–3 Bellandur Resident Welfare Associations and a delivery-rider group before the May 2027 pre-monsoon rains.
- Pull public sources: BBMP and traffic police waterlogging updates, KSNDMC.

**Scale and cost**
- Self-host routing (Valhalla or OSRM) when OpenRouteService's free limit (about 2,000 routes a day) is not enough.
- Deploy on Vercel with a public link; add basic usage numbers (reports per rain event, time from first report to alert).
- Expand from Bellandur to more of Bengaluru, then other cities by swapping the area and boundary data.

---

## Known limitations today

- The flood simulation is an illustration from ground height, not a forecast. Depths are approximate.
- Flood-prone spots in `src/data/floodZones.js` are approximate placeholders, not the official BBMP list.
- Routing makes up to four OpenRouteService requests per route while the simulation is on, which uses the free quota faster.
- Road names on hover come from map labels, so unnamed or unlabelled roads show "Road".
