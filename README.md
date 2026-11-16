# Jaldrishti

Flood alerts and safer routes for Bellandur and the Outer Ring Road, Bengaluru. Built for the IEEE GeoAI Hackathon 2026, Theme 05: Flood Alert and Mapping System.

## Two modes

- **Live** (default): only what is real. Citizen reports, real sensor alerts, the rain forecast, and flood-prone spots with their **past flood records** (dated, with the news source). Route gives turn-by-turn **navigation** with your GPS.
- **Simulation**: practice scenarios, clearly marked as not real. A dark 3D city where water rises on roads, the Demo menu (replay, raise water, place an electricity fault), and animated drives. Simulated alerts never appear in Live.

Switch at the top of the Map tab.

## What it does

**Map**
- Live citizen reports of waterlogging, shown as coloured dots by depth.
- Known flood-prone spots with past flood records (for example 5 Sep 2022 at Bellandur ORR and Rainbow Drive, 19 May 2025 at Silk Board and Sai Layout), and water-level sensors (simulated for now).
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
- Turn-by-turn directions like a maps app: the next turn with its arrow, road name and distance, spoken aloud in English or Kannada (voice button in the drive panel). Your vehicle shows as 🛵 or 🚗.
- A green route means the road is free; blue stretches have water; red means it cannot be passed.
- **Start drive** moves a vehicle along the route with the camera behind it (1×, 5×, 10×). **Use my real location** follows your phone's GPS instead.
- The road ahead is checked continuously. When water rises or danger appears ahead, the route is re-planned from just ahead of the vehicle without stopping.
- **Water never forces a stop.** If every route has water, it takes the one with the least and drives through it at a third of the speed. Before water deeper than the vehicle can handle, it eases to a halt and asks: **Wait** or **Go through slowly**.
- **Reroute** in the drive panel asks for a new route at any time.

**Electricity in floodwater**
- Electricity is only a danger in floodwater, so a fault can only be placed on a flooded road (or inside a report or water alert). Real sensors raise it only when they also measure water.
- It creates a 150 m danger zone. Every route avoids it, and every open device shows a red alert, vibrates and plays a tone.
- **If every route crosses electricity**, the vehicle stops 200 m short with a red "Stop here" card, and carries on by itself once the fault is cleared.

**Activity**
- A live log of reports, votes, water and electricity alerts, and rain-level changes. Filter by last hour, today or 7 days. New items are marked "New".

**Flood simulation**
- Press **Simulate** for a 3D view where water rises on roads as rain gets heavier. Hover a road to see its depth in cm and inches; **Heat map** shows the worst spots.

## Demo menu

The **Demo** button on the map triggers what sensors would do, for judging and testing:

1. **Replay Sept 2022**: the Aug–Sept 2022 Bellandur floods in 60 seconds, from real hourly rainfall.
2. **Raise water ahead** (during a drive): floods the road 600 m ahead; watch the route change.
3. **Place water**: tap any road to put knee-deep water there.
4. **Place electricity fault**: tap a flooded road to put a fault there. Taps away from water are refused.
5. **Clear demo events**.

A good two-minute demo: save a Home → Office trip, start the drive, raise water ahead, then place an electricity fault on a flooded road ahead. Open the app on a phone too: the alert appears there as well.

## How the flood simulation works

The app loads ground height for the area from public terrain data. Like real waterlogging, the simulated water is patchy: a road floods only where it sits in a dip (lower than the average ground within about 150 m) deeper than its drains can clear. Drain capacity varies from stretch to stretch, heavier rain fills more of each dip and overwhelms more drains, and the low parts of the valley pond most. At "Simulate" about 13% of the valley is wet, in patches averaging about 65 m. It is an **illustration, not a forecast**: the terrain data is only about 20 m detailed and real drains are not mapped. `plan.md` describes replacing it with a model learned from real reports and rainfall.

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

## AI route summary with Groq (optional)

When a drive starts, the app speaks a short summary. Out of the box it writes this itself. To have an AI model on Groq write it, with the first turns and road names:

1. In Supabase: **Edge Functions → Secrets**, add `GROQ_API_KEY` (your Groq key, starts with `gsk_`). Optional: `GROQ_MODEL` (default `llama-3.3-70b-versatile`).
2. Deploy the function in `supabase/functions/guide` (`supabase functions deploy guide`, or create a function named `guide` in the dashboard and paste the file).
3. Set `VITE_GROQ_GUIDE=on` in `.env` and in Vercel's environment variables, then redeploy.

The key stays on the server; it is never put in the app. Turn-by-turn directions come from OpenRouteService and work without it.

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
| `src/theme.css` | All colours: clotted cream 60%, navy 30%, heirloom tomato 10% |
| `src/data/floodZones.js` | Flood-prone spots and dated past flood records with sources |
| `scripts/seed-demo.mjs` | Demo data and the Sept 2022 replay |
| `supabase/` | Database setup, migrations, sensor ingest function |
| `docs/bengaluru-deployment.md` | Sensors and a pilot on real roads |
| `plan.md` | What is built and what comes next |
