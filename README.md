# Jaldrishti

Flood alerts and safer routes for Bellandur and the Outer Ring Road, Bengaluru. Built for the IEEE GeoAI Hackathon 2026, Theme 05.

- **Map:** live citizen reports of waterlogging, known flood-prone spots, and a flood simulation that shows where water collects first, in a 3D view of the area.
- **Report:** pin a spot, choose how deep the water is (ankle, knee, waist), add a photo. Reports clear automatically after 2–6 hours unless others confirm them.
- **Route:** a route that steers around reported water, for two-wheelers or cars.
- **Activity:** reports from the last 24 hours and the spots that flood most often.

Built with React, Vite, MapLibre GL, Supabase, OpenRouteService and Open-Meteo.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Without keys it runs in demo mode: reports are kept in your browser only.

## Live mode

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Get a free API key from openrouteservice.org.
3. Copy `.env.example` to `.env` and fill in the three values.

`.npmrc` points npm at a mirror of the npm registry because some networks block the main one. Delete it if `npm install` works without it.
