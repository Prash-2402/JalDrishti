# Jaldrishti pitch notes

Answers to the questions judges are likely to ask on demo day.

## 1. What the brief asked for, and what we added

**Core features from the theme brief:**

| Asked for | Status |
|---|---|
| Map with flood-prone zones as a layer | Done (12 approximate spots) |
| Report form: GPS pin, photo, severity, time | Done |
| Live incident markers that expire automatically | Done (2–6 h by depth) |
| Safer-route view that avoids reported spots | Done |

**What we added beyond the brief:**
- **Rain alert:** Green, Yellow, Orange or Red from the Open-Meteo forecast, with Kannada text.
- **"Still flooded" and "Cleared" votes:** other users keep a report alive or remove it, so the map corrects itself.
- **Depth in plain terms:** ankle, knee or waist, with what each means for a two-wheeler and a car.
- **Vehicle-aware routing:** a two-wheeler avoids every spot; a car only avoids knee-deep water and worse.
- **3D flood simulation:** water rises on roads only, you can hover a road to see its depth, and there's a heat map.
- **Routing around simulated flooding:** not just around reported spots.
- **Activity log:** the last 24 hours, plus the spots that get reported most often.
- **Street names and a phone layout:** street names on reports and routes, and a bottom-sheet layout on phones.

## 2. Doesn't Google Maps already do this?

Partly. Google Maps and Waze show road closures and slow traffic. Waze also lets drivers report a "flood" hazard. Some of Google's road closures in Indian cities come from traffic police. Google also runs Flood Hub, but that forecasts **river** floods, not waterlogged city streets. Check what Google Maps currently offers in Bengaluru before demo day.

**Where Google falls short on waterlogging:**
- It sees a slowdown from phone speeds but doesn't know **why**, so waterlogging looks the same as an ordinary jam.
- It has **no depth**. Ankle-deep water is fine for a car and dangerous for a scooter, and Google treats every vehicle the same.
- It has **no photo** and no way to confirm or clear a report, so old reports stay up or disappear without explanation.
- It only reacts once traffic slows. It doesn't warn you that a spot **usually floods at this much rain**.

**What Jaldrishti does differently:** depth plus photo, a route chosen for your vehicle, reports that expire automatically and get checked by other users, a rain alert, and a simulation of which roads go under first.

**Others working on this:**
- **Mumbai:** BMC's Disaster Management app, and iFLOWS-Mumbai, a flood warning system from IIT Bombay and the city.
- **Chennai:** C-FLOWS.
- **Bengaluru:**
  - KSNDMC's Varunamitra rain helpline and dashboards.
  - BBMP's list of flood-vulnerable spots.
  - Traffic police posting waterlogging updates on X.

None of these combine citizen depth reports with routing for your vehicle. That's our gap, but say "as far as we know" when you pitch it.

## 3. How we'd predict waterlogging

**Be upfront that the app doesn't predict yet.** The simulation is a "bathtub" model: it raises a water line over ground height, so it shows which roads go under first but not when or how deep. If you call it a forecast, judges will push back.

**How prediction would work:**
1. **What we learn from:** every report gives "this spot flooded, this deep, at this time". Joining that with hourly rainfall for that time (Open-Meteo history, or KSNDMC rain gauges) gives a training example.
2. **Facts about each road stretch:**
   - How low it sits compared with its surroundings, from elevation data.
   - Distance to a lake or storm drain.
   - Whether the ground is built-over or open.
   - How often it has flooded before.
3. **Rain inputs:** how hard it's raining right now, and how much rain fell in the last 3 hours and the last 24 hours. Ground that's already wet floods faster.
4. **The model:**
   - **Simple version first:** a rain threshold per spot, such as "this underpass floods above about 35 mm in an hour".
   - **Later:** a gradient-boosted model that gives each road stretch a probability of flooding.
5. **Using it:** feed in Open-Meteo's hourly forecast for the next few hours and warn people before anyone reports, for example "Bellandur ORR: likely knee-deep around 7 pm". Saved daily routes from plan.md get the alert.
6. **Cold start, before we have many reports:**
   - Seed it with BBMP's vulnerable-spot list.
   - Add past waterlogging posts from the traffic police and news, with their dates.
   - Add historical rainfall for those dates.
7. **Checking it:** test on whole rain events the model hasn't seen, and report how many floods it caught and how many false alarms it raised.

**One line for the pitch:** "Today, citizens tell us where it's flooded. With each rain, Jaldrishti learns how much rain floods each road, so next time it warns you before you get there."
