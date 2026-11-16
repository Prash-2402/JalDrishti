// Safer routing. Collects candidate routes, measures the water on each, and
// picks the best: no danger zone first, then the shallowest deepest point,
// then the least water overall, then the quickest. If no route is dry, the
// result is the route with the least water.
//
// With an OpenRouteService key: the fastest route and its alternatives, a
// route avoiding every known hazard (both requested at once), then up to two
// more rounds avoiding the water found on the best route so far. Without a
// key: public OSRM alternatives.
import { circleRing, distM } from './geo.js'
import { profile } from './hazards.js'

const ORS_KEY = import.meta.env.VITE_ORS_KEY
const MAX_AVOID = 60 // OpenRouteService rejects very large avoid lists
const cache = new Map() // request -> promise, so repeated routes are instant

// steps: OpenRouteService turns, as { at (metres along), type, name }.
function shape(lngLat, metres, seconds, steps = []) {
  const coords = lngLat.map(([lng, lat]) => [lat, lng])
  const cum = [0]
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distM({ lat: coords[i - 1][0], lng: coords[i - 1][1] }, { lat: coords[i][0], lng: coords[i][1] }))
  return {
    coords,
    km: metres / 1000,
    min: seconds / 60,
    steps: steps.map((s) => ({ at: cum[s.way_points[0]] ?? 0, type: s.type, name: s.name && s.name !== '-' ? s.name : '' })),
  }
}

function cached(key, load) {
  if (!cache.has(key)) {
    if (cache.size > 40) cache.delete(cache.keys().next().value)
    const p = load()
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return cache.get(key)
}

function ors(start, end, avoid = [], alternatives = false) {
  const body = { coordinates: [[start.lng, start.lat], [end.lng, end.lat]] }
  if (avoid.length) {
    body.options = {
      avoid_polygons: { type: 'MultiPolygon', coordinates: avoid.slice(0, MAX_AVOID).map((a) => [circleRing(a.lat, a.lng, a.radius)]) },
    }
  }
  if (alternatives) body.alternative_routes = { target_count: 3, weight_factor: 1.6, share_factor: 0.6 }
  const json = JSON.stringify(body)
  return cached(json, async () => {
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
      body: json,
    })
    const out = await res.json()
    if (!res.ok) throw new Error(out?.error?.message || 'Routing failed')
    return out.features.map((f) =>
      shape(f.geometry.coordinates, f.properties.summary.distance, f.properties.summary.duration, (f.properties.segments || []).flatMap((s) => s.steps || [])),
    )
  })
}

function osrm(start, end) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}` +
    '?alternatives=3&overview=full&geometries=geojson'
  return cached(url, async () => {
    const json = await (await fetch(url)).json()
    if (json.code !== 'Ok') throw new Error(json.message || 'Routing failed')
    return json.routes.map((r) => shape(r.geometry.coordinates, r.distance, r.duration))
  })
}

const rank = (r) => [r.prof.hard ? 1 : 0, Math.ceil(r.prof.maxCm / 10), Math.round(r.prof.exposure / 100), r.min]
function better(a, b) {
  const x = rank(a)
  const y = rank(b)
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]
  return false
}
const avoidFor = (s) => ({ lat: s.lat, lng: s.lng, radius: s.radius ?? Math.min(150, 60 + s.cm) })

// hazards: from buildHazards(). water: simulation level (0 when off).
// mode: { avoidCm, maxCm } from MODES.
// Returns { safe, fastest, status }: fastest is null when it is the same as
// safe; status is 'dry', 'wet' (least water), 'blocked' or 'wire'.
export async function findRoute(start, end, { hazards, water, mode }) {
  const skip = [start, end]
  const rate = (r) => ({ ...r, prof: profile(r.coords, hazards, water, mode.avoidCm, skip) })
  const dry = (r) => !r.prof.hard && !r.prof.maxCm
  const pick = (list) => list.reduce((a, b) => (better(b, a) ? b : a))
  let all

  if (!ORS_KEY) all = (await osrm(start, end)).map(rate)
  else {
    let avoid = hazards.filter((h) => h.hard || h.cm >= mode.avoidCm).sort((a, b) => (b.hard ? 1 : 0) - (a.hard ? 1 : 0) || b.cm - a.cm)
    const [base, around] = await Promise.all([ors(start, end, [], true), avoid.length ? ors(start, end, avoid).catch(() => []) : []])
    all = [...base, ...around].map(rate)
    for (let round = 0; round < 2 && !all.some(dry); round++) {
      const best = pick(all)
      const more = best.prof.spots.map(avoidFor)
      if (best.prof.hard) more.unshift(avoidFor(best.prof.hard))
      avoid = [...avoid.filter((h) => h.hard), ...more, ...avoid.filter((h) => !h.hard)]
      try {
        all.push(...(await ors(start, end, avoid)).map(rate))
      } catch {
        break // no way around everything: keep the best found so far
      }
    }
  }

  const fastest = all[0]
  const safe = pick(all)
  const { hard, maxCm } = safe.prof
  const status = hard ? 'wire' : !maxCm ? 'dry' : maxCm >= mode.maxCm ? 'blocked' : 'wet'
  return { safe, fastest: safe === fastest ? null : fastest, status }
}
