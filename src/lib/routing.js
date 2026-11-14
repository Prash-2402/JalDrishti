// Safer routing. Steers around reported waterlogging and, while the flood
// simulation is running, around simulated flooded roads.
//
// With an OpenRouteService key, flooded spots are sent as avoid-areas and the
// route is re-checked up to three times, since going around one spot can lead
// into another. Without a key, public OSRM alternatives are compared and the
// one crossing the fewest spots is chosen.
import { AVOID_RADIUS, circleRing, countHits } from './geo.js'

const ORS_KEY = import.meta.env.VITE_ORS_KEY
export const routingEngine = ORS_KEY ? 'OpenRouteService' : 'OSRM (demo)'
const MAX_AVOID = 60 // OpenRouteService rejects very large avoid lists

const shape = (lngLat, metres, seconds) => ({
  coords: lngLat.map(([lng, lat]) => [lat, lng]),
  km: metres / 1000,
  min: seconds / 60,
})

// Counts what a route passes through: reports, plus flooded road if a
// floodAlong function is given.
function tally(route, reports, floodAlong) {
  const flooded = floodAlong ? floodAlong(route.coords) : []
  const reportHits = countHits(route.coords, reports)
  return { ...route, flooded, reportHits, floodHits: flooded.length, hits: reportHits + flooded.length }
}

async function orsRoute(start, end, avoid) {
  const body = { coordinates: [[start.lng, start.lat], [end.lng, end.lat]] }
  if (avoid.length) {
    body.options = {
      avoid_polygons: {
        type: 'MultiPolygon',
        coordinates: avoid.slice(0, MAX_AVOID).map((r) => [circleRing(r.lat, r.lng, AVOID_RADIUS[r.severity])]),
      },
    }
  }
  const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
    method: 'POST',
    headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || 'Routing failed')
  const f = json.features[0]
  return shape(f.geometry.coordinates, f.properties.summary.distance, f.properties.summary.duration)
}

async function osrmRoutes(start, end) {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}` +
      '?alternatives=3&overview=full&geometries=geojson',
  )
  const json = await res.json()
  if (json.code !== 'Ok') throw new Error(json.message || 'Routing failed')
  return json.routes.map((r) => shape(r.geometry.coordinates, r.distance, r.duration))
}

const better = (a, b) => a.hits < b.hits || (a.hits === b.hits && a.min < b.min)

// Returns { safe, fastest }. fastest is null when it is the same as safe.
// floodAlong(line) returns flooded spots on a line, or is null when the
// simulation is off.
export async function findRoute(start, end, reports, floodAlong = null) {
  if (!ORS_KEY) {
    const routes = (await osrmRoutes(start, end)).map((r) => tally(r, reports, floodAlong))
    const fastest = routes[0]
    const safe = routes.reduce((best, r) => (better(r, best) ? r : best))
    return { safe, fastest: safe === fastest ? null : fastest }
  }

  const fastest = tally(await orsRoute(start, end, []), reports, floodAlong)
  if (!fastest.hits) return { safe: fastest, fastest: null }

  let best = fastest
  let flooded = [...fastest.flooded]
  for (let round = 0; round < 3; round++) {
    let r
    try {
      // Reports first, so they are never dropped by the avoid-list limit.
      r = tally(await orsRoute(start, end, [...reports, ...flooded]), reports, floodAlong)
    } catch {
      break // no way around everything: keep the best found so far
    }
    if (better(r, best)) best = r
    if (!r.hits) break
    flooded = [...flooded, ...r.flooded].sort((a, b) => b.severity - a.severity)
  }
  return { safe: best, fastest: best === fastest ? null : fastest }
}
