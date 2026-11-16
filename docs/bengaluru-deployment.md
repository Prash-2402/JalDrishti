# Running Jaldrishti on Bengaluru roads, cheaply

How the app's simulated sensors become real ones, what they cost, and how a pilot in Bellandur would run. Prices are typical Indian retail in 2026 and will vary.

## 1. What a sensor does

A small box on a streetlight pole above a road that floods. It measures:

- **Water depth on the road**, in cm. An ultrasonic sensor points down at the road. On a dry day it records the distance to the road surface; when water collects, the distance shrinks, and the difference is the depth.
- **Electricity in the water** (phase 2, see section 4).

It sends a reading every 5 minutes when dry and every 30 seconds once water is found. A reading of 30 cm or more becomes a "water rising" alert in the app; electricity becomes a danger zone that every route avoids. This is exactly what the app's Demo menu simulates, through the same database path.

## 2. Parts for one node

| Part | Example | Approx. cost |
|---|---|---|
| Microcontroller | ESP32 board | ₹350–500 |
| Water depth | JSN-SR04T waterproof ultrasonic sensor | ₹450–600 |
| Radio | LoRa module, 865–867 MHz (India band), e.g. SX1276 | ₹400–550 |
| Power | 6 V 3 W solar panel, charge controller, two 18650 cells | ₹850–1,050 |
| Housing | IP65 box, pole clamp, cable glands | ₹450–700 |
| **Total** | | **₹2,500–3,400** |

Cheaper still: skip the radio and solar on poles that already have power and Wi-Fi (some Smart City poles do), about ₹1,200 per node.

Without a gateway: a 4G/NB-IoT module (about ₹1,500, plus a ₹100–150/month SIM) replaces LoRa. Better for a handful of scattered sites; LoRa is cheaper once there are more than about 10 nodes.

## 3. Network

- **LoRaWAN gateway**: one 8-channel gateway (₹15,000–25,000) with a 4G SIM covers roughly 1–3 km in dense city streets, more along open stretches like the Outer Ring Road.
- **Path**: sensor → LoRa → gateway → network server (The Things Network free tier, or self-hosted ChirpStack) → webhook → Supabase `ingest` function → `sensor_readings` table → database trigger → `alerts` → every open app in real time.
- `supabase/functions/ingest` is written: each sensor has its own key (stored as a hash in `sensors.device_key_hash`), so a fake device cannot post readings.

## 4. Electricity in floodwater, done safely

Fallen or leaking cables in floodwater kill people in Bengaluru almost every monsoon. Two ways to detect it:

1. **Utility data (preferred, cheapest)**: BESCOM feeders already detect earth faults and trip. A data link from BESCOM's fault and trip alerts, mapped to the streets each feeder serves, would mark danger zones with no hardware at all. This needs a partnership, not engineering.
2. **Sensing at the node**: two stainless-steel probes a metre apart in the water, read through an isolated, high-impedance circuit, detect a voltage difference across the water. Parts are cheap (₹300–600), but this circuit sits next to possibly live water and **must be designed and certified by a qualified electrical engineer**, ideally with BESCOM. It is phase 2 for that reason.

Either way, the app treats electricity as a hard block: every route avoids a 150 m zone, and anyone nearby gets a full-width alert.

## 5. Pilot: 20 spots in Bellandur and Mahadevapura

| Item | Cost |
|---|---|
| 20 sensor nodes at the worst-flooding spots (BBMP's vulnerable-spot list, plus the app's simulation) | ₹50,000–68,000 |
| 2 LoRaWAN gateways with 4G | ₹30,000–50,000 |
| Installation (pole clamps, labour, permissions) | ₹10,000–20,000 |
| Tipping-bucket rain gauges, one per ward (4) | ₹10,000–16,000 |
| **One-time total** | **about ₹1–1.5 lakh** |
| Running cost: SIMs, hosting (Supabase and Vercel free tiers cover a pilot) | about ₹1,000–1,500 per month |

For scale: about 20 nodes cover the main flood points along a 20 km stretch of the Outer Ring Road, because floods collect at known low points, not evenly along the road.

## 6. Keeping it running

- **Calibration**: record the dry road distance at installation and after any resurfacing.
- **False readings**: a passing bus or truck looks like water for a moment. Take the median of 5 quick readings and require two high readings in a row.
- **Health**: each node sends a heartbeat. A node silent for 30 minutes shows as offline (to build: plan.md).
- **Maintenance**: clean the sensor face every quarter; batteries last 2–3 years; mount 4 m up to deter theft, with a tamper alert.

## 7. Who does what

- **BBMP / Greater Bengaluru Authority**: pole access, the vulnerable-spot list, using alerts for pump and traffic deployment.
- **BESCOM**: fault data for electrical danger; sign-off on any electrical sensing.
- **KSNDMC**: already runs telemetric rain gauges across Bengaluru; their rainfall feed should be pulled in rather than duplicated.
- **Bengaluru Traffic Police**: closures and diversions, and receiving the app's alerts.
- **Resident Welfare Associations**: host nodes, report from the ground, and test the app before the monsoon.

## 8. What stays the same without sensors

Sensors make alerts faster and more trustworthy, but the app works without them: citizen reports, the rain forecast, and the flood simulation already drive routing. Sensors are added spot by spot, starting where floods are worst.
