# Jaldrishti

Flood alerts and safer routes for Bellandur and the Outer Ring Road, Bengaluru. Built for the IEEE GeoAI Hackathon 2026, Theme 05: Flood Alert and Mapping System.

## What it does

**Map**
- Live citizen reports of waterlogging, shown as coloured dots by depth.
- Known flood-prone spots, with how often each has been reported in the last 30 days.
- Today's rain forecast (Open-Meteo), in English and Kannada.

**Flood simulation**
- Press **Simulate** to switch to a 3D view of the area and watch the water rise as rain gets heavier.
- Water shows **on roads only**, coloured from shallow (light blue) to deep (dark blue). Bridges stay dry.
- **Hover a flooded road** (or tap it on a phone) to see roughly how deep the water is and whether a two-wheeler or car can pass.
- **Heat map** button: shows where roads are fully waterlogged, in red and yellow.

**Report**
- Pin a spot, choose how deep the water is (ankle ~10 cm, knee ~45 cm, waist ~90 cm), add a photo and a note.
- Reports clear automatically after 2–6 hours unless others tap "Still flooded". Anyone can mark one "Cleared".

**Route**
- Finds a route that steers around reported waterlogging and, while the simulation is on, around flooded roads.
- Two-wheeler mode avoids every flooded spot; car mode avoids knee-deep water and worse.

**Activity**
- Reports from the last 24 hours, including ones that have cleared, and the spots that flood most often.

## How the flood simulation works

The app loads ground height for the area from public terrain data. The slider raises a water line above the lowest ground; any road below that line floods, and the deeper below the line, the deeper the water. This shows which roads flood first, but it is an **illustration, not a forecast**: it ignores drains, and the terrain data is only about 20 m detailed. `plan.md` describes replacing it with a model learned from real reports and rainfall.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Without keys it runs in demo mode: reports are kept in your browser only.

## Live mode

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Get a free API key from openrouteservice.org.
3. Copy `.env.example` to `.env` and fill in the three values. Never commit `.env`.

If your database was set up before the activity log existed, also run `supabase/migrations/002_history.sql`.

`.npmrc` points npm at a mirror of the npm registry because some networks block the main one. Delete it if `npm install` works without it.

## Built with

React, Vite, MapLibre GL, OpenFreeMap tiles, Supabase (database, realtime, photo storage), OpenRouteService (routing and street names), Open-Meteo (rain), and AWS open terrain tiles (ground height).

## Project layout

| Path | What it holds |
|---|---|
| `src/App.jsx` | App shell: tabs, map events, state |
| `src/components/` | The Map, Route, Activity and Report panels |
| `src/lib/scene.js` | Map setup, clean and simulation views, layers |
| `src/lib/flood.js` | Flood simulation: ground height, road depths, flooded spots on a route |
| `src/lib/routing.js` | Safer routing around reports and flooded roads |
| `src/lib/store.js` | Reports: Supabase, or browser storage in demo mode |
| `src/theme.css` | All colours, in one place |
| `supabase/` | Database setup and migrations |
| `plan.md` | What we build next |

## Next

See [plan.md](plan.md): track my daily route, live activity logs, a demo dataset, and the longer roadmap.
