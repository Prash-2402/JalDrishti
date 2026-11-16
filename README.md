# Jaldrishti

Flood alerts and safer routes for Bellandur and the Outer Ring Road, Bengaluru. Built for the IEEE GeoAI Hackathon 2026, Theme 05: Flood Alert and Mapping System.

## What it does

**Map**
- Live citizen reports of waterlogging, shown as coloured dots by depth.
- Known flood-prone spots, and water-level sensors (simulated for now).
- Today's rain forecast (Open-Meteo).
- English and Kannada, switched from the top of the Map tab. Map labels switch too.

**Report**
- Pin a spot, choose how deep the water is (ankle ~10 cm, knee ~45 cm, waist ~90 cm), add a photo and a note.
- Reports clear automatically after 2–6 hours unless others tap "Still flooded". Anyone can mark one "Cleared".

**Route**
- Finds a route around reported water, sensor alerts and, while the simulation is on, flooded roads.
- Two-wheeler mode avoids all water; car mode avoids knee-deep water and worse.
- **No dry route?** It picks the route with the least water and says how deep it gets ("Water up to 25 cm (10 in) on 2 short stretches"), or that the vehicle cannot pass.
- **Saved trips**: save a trip and see its status ("Clear", "1 report on your route", "Electrical danger on your route"). A browser notification fires when danger lands on it while the app is in the background.

**Drive**
- **Start drive** moves a vehicle along the route with the camera behind it (1×, 5×, 10×). **Use my real location** follows your phone's GPS instead.
- The road ahead is checked continuously. When water rises or danger appears ahead, the route is re-planned from just ahead of the vehicle without stopping. If there is no way around, it stops short and waits.

**Electricity in floodwater**
- A sensor that detects electricity in the water creates a 150 m danger zone. Every route avoids it, and every open device shows a red alert, vibrates and plays a tone.

**Activity**
- A live log of reports, votes, water and electricity alerts, and rain-level changes. Filter by last hour, today or 7 days. New items are marked "New".

**Flood simulation**
- Press **Simulate** for a 3D view where water rises on roads as rain gets heavier. Hover a road to see its depth in cm and inches; **Heat map** shows the worst spots.

## Demo menu

The **Demo** button on the map triggers what sensors would do, for judging and testing:

1. **Replay Sept 2022**: the Aug–Sept 2022 Bellandur floods in 60 seconds, from real hourly rainfall.
2. **Raise water ahead** (during a drive): floods the road 600 m ahead; watch the route change.
3. **Live wire at a sensor**: electricity in the water at the sensor nearest your route (or the map centre).
4. **Clear demo events**.

A good two-minute demo: save a Home → Office trip, start the drive, raise water ahead, then trigger a live wire. Open the app on a phone too: the alert appears there as well.

## How the flood simulation works

The app loads ground height for the area from public terrain data. The slider raises a water line above the lowest ground; any road below that line floods, and the deeper below the line, the deeper the water. This shows which roads flood first, but it is an **illustration, not a forecast**: it ignores drains, and the terrain data is only about 20 m detailed. `plan.md` describes replacing it with a model learned from real reports and rainfall.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Without keys it runs in demo mode: reports and alerts are kept in your browser only.

## Live mode

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor, then `supabase/migrations/002_history.sql` and `supabase/migrations/003_sensors_alerts.sql`.
2. Get a free API key from openrouteservice.org.
3. Copy `.env.example` to `.env` and fill in the three values. Never commit `.env`.
4. Optional demo data: `node scripts/seed-demo.mjs --seed` adds about 30 days of generated reports, marked as demo. Remove them with `delete from reports where is_demo;` in the SQL editor.

Without migration 003, alerts still reach other open devices but are not stored.

`.npmrc` points npm at a mirror of the npm registry because some networks block the main one. Delete it if `npm install` works without it.

## Real sensors

[docs/bengaluru-deployment.md](docs/bengaluru-deployment.md) covers the sensor build (about ₹2,500–3,400 a node), the network, sensing electricity safely, and a 20-spot pilot for about ₹1–1.5 lakh. Real sensors post to `supabase/functions/ingest`.

## Built with

React, Vite, MapLibre GL, OpenFreeMap tiles, Supabase (database, realtime, photo storage), OpenRouteService (routing and street names), Open-Meteo (rain forecast and archive), and AWS open terrain tiles (ground height).

## Project layout

| Path | What it holds |
|---|---|
| `src/App.jsx` | App shell: tabs, map events, drive and alerts |
| `src/components/` | Map, Route, Activity and Report panels, the drive panel and the Demo menu |
| `src/lib/scene.js` | Map setup, clean and simulation views, layers, labels |
| `src/lib/flood.js` | Flood simulation: ground height and flooded roads |
| `src/lib/hazards.js` | Everything that blocks a road, and the water along a route |
| `src/lib/routing.js` | Safer and least-water routing |
| `src/lib/drive.js` | Vehicle animation and GPS following |
| `src/lib/alerts.js` | Sensors and alerts, shared in real time |
| `src/lib/store.js` | Reports and saved trips |
| `src/lib/i18n.js` | English and Kannada text |
| `src/theme.css` | All colours, in one place |
| `scripts/seed-demo.mjs` | Demo data and the Sept 2022 replay |
| `supabase/` | Database setup, migrations, sensor ingest function |
| `docs/bengaluru-deployment.md` | Sensors and a pilot on real roads |
| `plan.md` | What is built and what comes next |
