// Safer routing. With an OpenRouteService key, active reports are sent as
// avoid-zones. Without one, public OSRM alternatives are compared and the one
// crossing the fewest reports is chosen.
import { AVOID_RADIUS, circleRing, countHits } from './geo.js'

const ORS_KEY = import.meta.env.VITE_ORS_KEY
export const routingEngine = ORS_KEY ? 'OpenRouteService' : 'OSRM (demo)'

const shape = (lngLat, metres, seconds, reports) => {
  const coords = lngLat.map(([lng, lat]) => [lat, lng])
  return { coords, km: metres / 1000, min: seconds / 60, hits: countHits(coords, reports) }
}

async function orsRoute(start, end, reports, avoid) {
  const body = { coordinates: [[start.lng, start.lat], [end.lng, end.lat]] }
  if (avoid && reports.length) {
    body.options = {
      avoid_polygons: {
        type: 'MultiPolygon',
        coordinates: reports.map((r) => [circleRing(r.lat, r.lng, AVOID_RADIUS[r.severity])]),
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
  return shape(f.geometry.coordinates, f.properties.summary.distance, f.properties.summary.duration, reports)
}

async function osrmRoutes(start, end, reports) {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}` +
      '?alternatives=3&overview=full&geometries=geojson',
  )
  const json = await res.json()
  if (json.code !== 'Ok') throw new Error(json.message || 'Routing failed')
  return json.routes.map((r) => shape(r.geometry.coordinates, r.distance, r.duration, reports))
}

// Returns { safe, fastest }. fastest is null when it is the same as safe.
export async function findRoute(start, end, reports) {
  if (ORS_KEY) {
    const fastest = await orsRoute(start, end, reports, false)
    if (!fastest.hits) return { safe: fastest, fastest: null }
    try {
      return { safe: await orsRoute(start, end, reports, true), fastest }
    } catch {
      return { safe: fastest, fastest: null } // no way around: show it with its warning
    }
  }
  const routes = await osrmRoutes(start, end, reports)
  const fastest = routes[0]
  const safe = [...routes].sort((a, b) => a.hits - b.hits || a.min - b.min)[0]
  return { safe, fastest: safe === fastest ? null : fastest }
}
