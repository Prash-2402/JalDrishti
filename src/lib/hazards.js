// Everything that can block a road, in one list: citizen reports and alerts
// (sensor readings and demo events). The flood simulation is added per point
// by profile(), since it depends on the water level.
import { depthAt } from './flood.js'
import { AVOID_RADIUS, distM } from './geo.js'
import { SEVERITY } from './severity.js'

export const WIRE_RADIUS = 150 // metres kept clear around electricity in water
const WATER_RADIUS = 100
const RISE_MS = 5000 // a new water alert climbs to its full depth over 5 s
const STEP = 25 // routes are checked every 25 m
const SPOT_GAP = 80 // wet road closer than this counts as one spot
const END_GAP = 150 // water at the very start or end cannot be avoided

// Depth of a water alert right now.
export const alertCm = (a, now = Date.now()) => Math.round((a.cm || 0) * Math.min(1, (now - Date.parse(a.created_at)) / RISE_MS))

export const isActiveAlert = (a, now = Date.now()) =>
  (a.kind === 'water' || a.kind === 'wire') && !a.cleared_at && Date.parse(a.expires_at) > now

// full: use each water alert's final depth (for planning) instead of its
// depth right now (for the live check while driving).
export function buildHazards(reports, alerts, full = false) {
  const now = Date.now()
  const list = reports.map((r) => ({ id: r.id, kind: 'report', lat: r.lat, lng: r.lng, cm: SEVERITY[r.severity].cm, radius: AVOID_RADIUS[r.severity] }))
  for (const a of alerts) {
    if (!isActiveAlert(a, now)) continue
    list.push(
      a.kind === 'wire'
        ? { id: a.id, kind: 'wire', lat: a.lat, lng: a.lng, cm: 0, radius: WIRE_RADIUS, hard: true, place: a.place }
        : { id: a.id, kind: 'water', lat: a.lat, lng: a.lng, cm: full ? a.cm : alertCm(a, now), radius: WATER_RADIUS, place: a.place },
    )
  }
  return list
}

// Walks a route ([lat, lng] points) and reports the water on it.
//   minCm: shallower water is ignored (depends on the vehicle)
//   skip: points near which water is ignored (start and end)
// Returns { maxCm, exposure, spots, wet, hard }:
//   exposure: sum of depth x metres, to compare equally deep routes
//   spots: one per wet stretch, { lat, lng, cm, at (metres along), id, kind }
//   wet: wet stretches as [lng, lat] lines, for drawing
//   hard: the first danger zone crossed, with its distance along, or null
export function profile(coords, hazards, water, minCm, skip = []) {
  let maxCm = 0
  let exposure = 0
  let hard = null
  const spots = []
  const wet = []
  let run = null
  let along = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const a = { lat: coords[i][0], lng: coords[i][1] }
    const b = { lat: coords[i + 1][0], lng: coords[i + 1][1] }
    const len = distM(a, b)
    const n = Math.max(1, Math.ceil(len / STEP))
    for (let k = 0; k < n; k++) {
      const p = { lat: a.lat + ((b.lat - a.lat) * k) / n, lng: a.lng + ((b.lng - a.lng) * k) / n }
      const at = along + (len * k) / n
      let cm = 0
      let src = null
      if (!skip.some((s) => distM(s, p) < END_GAP)) {
        cm = water > 0 ? depthAt(p.lng, p.lat, water) : 0
        for (const h of hazards) {
          if (Math.abs(h.lat - p.lat) > 0.0015 || distM(h, p) > h.radius) continue
          if (h.hard) hard ??= { ...h, at }
          else if (h.cm > cm) (cm = h.cm), (src = h)
        }
      }
      if (cm < minCm) {
        run = null
        continue
      }
      maxCm = Math.max(maxCm, cm)
      exposure += cm * (len / n)
      const last = spots[spots.length - 1]
      if (last && at - last.end < SPOT_GAP) {
        last.end = at
        if (cm > last.cm) Object.assign(last, { cm, id: src?.id ?? last.id, kind: src?.kind ?? last.kind })
      } else spots.push({ lat: p.lat, lng: p.lng, cm, at, end: at, id: src?.id ?? null, kind: src?.kind ?? 'flood' })
      if (!run) wet.push((run = [[p.lng, p.lat]]))
      run.push([p.lng + (b.lng - a.lng) / n, p.lat + (b.lat - a.lat) / n])
    }
    along += len
  }
  return { maxCm, exposure, spots, wet: wet.filter((l) => l.length > 1), hard }
}

// Stable key for a spot, to tell new water from water already planned for.
export const spotKey = (s) => s.id || `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`
