# Jaldrishti plan

What is built, and what comes next.

## Built

- **Reports**: live citizen reports with photos, depth levels (cm and inches), auto-expiry, "Still flooded" and "Cleared" votes.
- **Routing**: steers around reports, sensor alerts and simulated flooding, separately for two-wheelers and cars. When no route is dry, it picks the route with the least water (shallowest deepest point, then the least water overall), and says when a vehicle cannot pass.
- **Drive simulation**: a vehicle follows the route with the camera behind it, at 1×, 5× or 10×, or follows the device's real GPS.
- **Live rerouting**: while driving, the road 2 km ahead is checked every quarter second. New water or danger re-plans the route from just ahead of the vehicle without stopping it; if there is no way around, it stops 200 m short and waits.
- **Sensors and live-wire alerts**: six simulated water-level sensors. Electricity in the water creates a 150 m danger zone that every route avoids, a full-width alert, vibration and a tone, on every open device.
- **Activity**: a live log of reports, votes, water and electricity alerts and rain-level changes, with filters (last hour, today, 7 days).
- **Saved trips**: up to five trips in the Route tab, each with a live status line, and a notification when danger lands on one while the app is in the background.
- **Demo data**: `scripts/seed-demo.mjs` generates reports from real hourly rainfall (Open-Meteo archive). In-app "Replay Sept 2022" plays the Aug–Sept 2022 floods in 60 seconds.
- **Kannada**: the whole app, alerts and map labels switch between English and Kannada.
- **Flood simulation**: water on roads by ground height, depth on hover, heat map. Changing the water level costs about 1 ms; roads are re-sampled at most once a second while the map moves.

## Next

### 1. Predict waterlogging (most important)
- Join every report with the rainfall at that hour and place (Open-Meteo history, KSNDMC rain gauges).
- Start simple: a rain threshold per spot ("this underpass floods above about 35 mm in an hour"), learned from reports.
- Then a model per road stretch using how low it sits, distance to lakes and drains, built-up ground, past flooding, and rain over the last 3 and 24 hours.
- Use the hourly forecast to warn before anyone reports: "Bellandur ORR: likely knee-deep around 7 pm". Saved trips get the warning first.
- Test on whole rain events the model has not seen; report floods caught and false alarms.

### 2. Real sensor pilot
- 20 nodes at the worst spots in Bellandur and Mahadevapura, about ₹1–1.5 lakh. Details: [docs/bengaluru-deployment.md](docs/bengaluru-deployment.md).
- Show sensors as offline when they miss heartbeats.
- BESCOM fault data for electrical danger.

### 3. Reaching people
- Installable app with push notifications (works when the app is closed, unlike today's browser notifications).
- WhatsApp bot: "Is Silk Board flooded?"
- First-time intro: three short screens and "save your home".

### 4. Trust
- Optional phone sign-in with reporter reputation; trusted reports show first.
- Photo moderation, and blurring faces and number plates (India's DPDP Act).
- Limit how often one device can trigger demo alerts in production (today: at most 30 demo alerts in 10 minutes across everyone).

### 5. Scale and cost
- Self-host routing (Valhalla or OSRM) when OpenRouteService's free limit (about 2,000 routes a day) is not enough. Rerouting while driving uses 1–3 requests each time.
- Expand from Bellandur to more of Bengaluru, then other cities by swapping the area and boundary data.

## Known limitations

- The flood simulation is an illustration from ground height (about 20 m detail), not a forecast.
- Flood-prone spots, sensor sites and low-lying road points are approximate placeholders, not the official BBMP list.
- The rainfall archive is a ~10 km average and smooths out local cloudbursts, so the demo data scales rain against each period's own peak. Replay shows the archive's real mm values.
- Without migration 003, alerts still reach other open devices through a realtime channel, but they are not stored and disappear on reload.
- Kannada text needs a review by a fluent speaker.
- Road names on hover come from map labels; unlabelled roads show "Road".
