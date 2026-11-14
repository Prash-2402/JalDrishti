const M_PER_DEG = 111320

// Metres an active report blocks around itself, by severity.
export const AVOID_RADIUS = { 1: 60, 2: 100, 3: 150 }

// Polygon ring ([lng, lat]) approximating a circle, for routing avoid-zones.
export function circleRing(lat, lng, radiusM, steps = 12) {
  const ring = []
  const k = Math.cos((lat * Math.PI) / 180)
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    ring.push([
      lng + (radiusM * Math.cos(a)) / (M_PER_DEG * k),
      lat + (radiusM * Math.sin(a)) / M_PER_DEG,
    ])
  }
  return ring
}

// Shortest distance in metres from a point to a polyline of [lat, lng] pairs.
export function distToLine(lat, lng, line) {
  const k = Math.cos((lat * Math.PI) / 180)
  const px = lng * k * M_PER_DEG
  const py = lat * M_PER_DEG
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i][1] * k * M_PER_DEG
    const ay = line[i][0] * M_PER_DEG
    const bx = line[i + 1][1] * k * M_PER_DEG
    const by = line[i + 1][0] * M_PER_DEG
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    if (d < best) best = d
  }
  return best
}

// How many active reports a route passes through.
export function countHits(line, reports) {
  return reports.filter((r) => distToLine(r.lat, r.lng, line) < AVOID_RADIUS[r.severity]).length
}

// Straight-line distance in metres between two { lat, lng } points.
export function distM(a, b) {
  const k = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  return Math.hypot((a.lng - b.lng) * k * M_PER_DEG, (a.lat - b.lat) * M_PER_DEG)
}
