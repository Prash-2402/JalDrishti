// Moves a vehicle along a route and keeps the camera behind it. Runs outside
// React: each frame moves one marker and the camera; onTick fires 4 times a
// second with progress for the panel and the hazard check.
//
// With gps: true the vehicle follows the device's real position, snapped to
// the route, instead of being animated.
import maplibregl from 'maplibre-gl'
import { distM } from './geo.js'

const empty = { type: 'FeatureCollection', features: [] }

export function createDrive(map, { onTick, onEnd, gps = false }) {
  const el = document.createElement('div')
  el.className = 'car'
  const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })
  let pts = []
  let cum = []
  let total = 0
  let at = 0
  let mps = 8 // real speed in metres per second, from the route's travel time
  let speed = 10 // demo multiplier
  let paused = false
  let stopAt = Infinity
  let bearing = null
  let frame = 0
  let last = 0
  let lastTick = 0
  let follow = true
  let followTimer = 0
  let offRoute = 0
  let watch = null
  let ended = false
  let stopped = false

  function pointAt(d) {
    d = Math.max(0, Math.min(total, d))
    let lo = 0
    let hi = cum.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (cum[mid] <= d) lo = mid
      else hi = mid
    }
    const seg = cum[hi] - cum[lo] || 1
    const k = (d - cum[lo]) / seg
    return { lat: pts[lo].lat + (pts[hi].lat - pts[lo].lat) * k, lng: pts[lo].lng + (pts[hi].lng - pts[lo].lng) * k, i: lo }
  }

  // The route between two distances along it, as [lat, lng] points.
  function slice(from, to = total) {
    const a = pointAt(from)
    const b = pointAt(to)
    const mid = pts.slice(a.i + 1, b.i + 1).map((p) => [p.lat, p.lng])
    return [[a.lat, a.lng], ...mid, [b.lat, b.lng]]
  }

  function heading(d) {
    const a = pointAt(d)
    const b = pointAt(d + 40)
    const k = Math.cos((a.lat * Math.PI) / 180)
    return (Math.atan2((b.lng - a.lng) * k, b.lat - a.lat) * 180) / Math.PI
  }

  // Nearest point on the route to p: distance along it and distance off it.
  function project(p) {
    let best = { along: at, off: Infinity }
    const k = Math.cos((p.lat * Math.PI) / 180)
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].lng * k, ay = pts[i].lat
      const dx = pts[i + 1].lng * k - ax, dy = pts[i + 1].lat - ay
      const len2 = dx * dx + dy * dy
      const t = len2 ? Math.max(0, Math.min(1, ((p.lng * k - ax) * dx + (p.lat - ay) * dy) / len2)) : 0
      const q = { lat: ay + dy * t, lng: (ax + dx * t) / k }
      const off = distM(p, q)
      if (off < best.off) best = { along: cum[i] + (cum[i + 1] - cum[i]) * t, off }
    }
    return best
  }

  function setLine(coords, minutes) {
    pts = coords.map(([lat, lng]) => ({ lat, lng }))
    cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distM(pts[i - 1], pts[i]))
    total = cum[cum.length - 1]
    if (minutes) mps = Math.max(3, total / (minutes * 60))
    at = 0
    stopAt = Infinity
    ended = false
  }

  function step(now) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (!gps && !paused) at = Math.min(total, stopAt, at + mps * speed * dt)
    const p = pointAt(at)
    const target = heading(at)
    bearing = bearing == null ? target : bearing + ((((target - bearing) % 360) + 540) % 360 - 180) * Math.min(1, dt * 2.5)
    marker.setLngLat([p.lng, p.lat]).setRotation(bearing)
    if (follow) map.jumpTo({ center: [p.lng, p.lat], bearing })
    if (now - lastTick > 250) {
      lastTick = now
      map.getSource('route-done')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: slice(0, at).map(([la, ln]) => [ln, la]) } })
      onTick?.({ at, total, leftM: total - at, leftMin: (total - at) / mps / 60, offRoute: offRoute > 2 })
    }
    if (at >= total - 5 && !ended) {
      ended = true
      onEnd?.()
    }
    frame = requestAnimationFrame(step)
  }

  const pauseFollow = () => {
    follow = false
    clearTimeout(followTimer)
  }
  const resumeFollow = () => {
    clearTimeout(followTimer)
    followTimer = setTimeout(() => (follow = true), 4000) // back behind the vehicle after a look around
  }

  return {
    start(coords, minutes) {
      setLine(coords, minutes)
      const p = pointAt(0)
      marker.setLngLat([p.lng, p.lat]).addTo(map)
      map.easeTo({ center: [p.lng, p.lat], zoom: 16, pitch: 55, bearing: heading(0), duration: 1200 })
      map.on('dragstart', pauseFollow)
      map.on('dragend', resumeFollow)
      if (gps && navigator.geolocation) {
        watch = navigator.geolocation.watchPosition(
          (pos) => {
            const pr = project({ lat: pos.coords.latitude, lng: pos.coords.longitude })
            at = Math.max(at, pr.along)
            offRoute = pr.off > 50 ? offRoute + 1 : 0
          },
          () => {},
          { enableHighAccuracy: true },
        )
      }
      setTimeout(() => {
        if (stopped) return
        last = performance.now()
        frame = requestAnimationFrame(step)
      }, 1200)
    },
    // Swaps in a new route from the vehicle's current position.
    reroute(coords) {
      const keep = mps
      setLine(coords)
      mps = keep
      offRoute = 0
    },
    stopBefore(d) {
      stopAt = Math.max(at, d)
    },
    release() {
      stopAt = Infinity
    },
    setSpeed(x) {
      speed = x
    },
    setPaused(p) {
      paused = p
    },
    get at() {
      return at
    },
    get total() {
      return total
    },
    get gps() {
      return gps
    },
    get mps() {
      return mps
    },
    pointAt,
    slice,
    stop() {
      stopped = true
      cancelAnimationFrame(frame)
      clearTimeout(followTimer)
      if (watch != null) navigator.geolocation.clearWatch(watch)
      map.off('dragstart', pauseFollow)
      map.off('dragend', resumeFollow)
      marker.remove()
      map.getSource('route-done')?.setData(empty)
    },
  }
}
