// Simulated flooding on roads, worked out from ground height.
//
// The simulation raises a water line above the area's lowest ground. A road
// floods where it sits below that line. Ground height comes from public
// terrain data (about 20 m detail), so depths are an illustration of which
// roads flood first, not a measurement. See plan.md for replacing this with
// real data.
import { AREA } from './scene.js'
import { distM } from './geo.js'

const Z = 13 // terrain tile zoom: about 19 m per pixel here
const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const CM_PER_M = 6 // each metre below the water line adds 6 cm of water
const MAX_CM = 150
const MIN_CM = 10 // shallower than this counts as dry
const ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'])
const STEP_M = 40 // long road segments are checked every 40 m

const SIZE = 2 ** Z * 256
const px = (lng) => ((lng + 180) / 360) * SIZE
const py = (lat) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * SIZE

let grid = null // ground heights for the whole area, in metres
let model = null // { base, span }: lowest ground and the height range the slider covers

function loadTile(tx, ty) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const g = c.getContext('2d', { willReadFrequently: true })
      g.drawImage(img, 0, 0)
      resolve(g.getImageData(0, 0, 256, 256).data)
    }
    img.onerror = reject
    img.src = DEM_URL.replace('{z}', Z).replace('{x}', tx).replace('{y}', ty)
  })
}

// Loads ground height for the whole area. Returns { base, span } in metres,
// or null if the terrain data could not be loaded.
export async function loadDem() {
  const [[w, s], [e, n]] = AREA.bounds
  const tx0 = Math.floor(px(w) / 256), tx1 = Math.floor(px(e) / 256)
  const ty0 = Math.floor(py(n) / 256), ty1 = Math.floor(py(s) / 256)
  const W = (tx1 - tx0 + 1) * 256
  const H = (ty1 - ty0 + 1) * 256
  const data = new Float32Array(W * H).fill(NaN)
  const jobs = []
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      jobs.push(
        loadTile(tx, ty)
          .then((d) => {
            for (let y = 0; y < 256; y++) {
              const row = ((ty - ty0) * 256 + y) * W + (tx - tx0) * 256
              for (let x = 0; x < 256; x++) {
                const i = (y * 256 + x) * 4
                data[row + x] = d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768
              }
            }
          })
          .catch(() => {}),
      )
    }
  }
  await Promise.all(jobs)
  grid = { x0: tx0 * 256, y0: ty0 * 256, W, H, data }

  // Calibrate the slider on the valley around Bellandur.
  const [sw, ss, se, sn] = AREA.sample
  const values = []
  for (let y = Math.floor(py(sn)); y <= py(ss); y += 2) {
    for (let x = Math.floor(px(sw)); x <= px(se); x += 2) {
      const v = data[(y - grid.y0) * W + (x - grid.x0)]
      if (!Number.isNaN(v)) values.push(v)
    }
  }
  if (!values.length) {
    grid = null
    return null
  }
  values.sort((a, b) => a - b)
  const at = (q) => values[Math.floor(q * (values.length - 1))]
  const base = Math.floor(at(0.01))
  model = { base, span: Math.max(6, Math.ceil(at(0.6) - base)) }
  return model
}

function groundAt(lng, lat) {
  if (!grid) return NaN
  const x = Math.round(px(lng) - grid.x0)
  const y = Math.round(py(lat) - grid.y0)
  if (x < 0 || y < 0 || x >= grid.W || y >= grid.H) return NaN
  return grid.data[y * grid.W + x]
}

// Simulated water depth in cm at a point. water is the slider value, 0 to 1.
export function depthAt(lng, lat, water) {
  if (!model || water <= 0) return 0
  const ground = groundAt(lng, lat)
  if (Number.isNaN(ground)) return 0
  const below = model.base + water * model.span - ground
  const cm = Math.min(MAX_CM, Math.round(below * CM_PER_M))
  return cm >= MIN_CM ? cm : 0
}

// Report level for a depth: 0 dry, 1 ankle, 2 knee, 3 waist.
export const severityFor = (cm) => (cm >= 60 ? 3 : cm >= 30 ? 2 : cm >= MIN_CM ? 1 : 0)

// Flooded stretches of every road currently loaded on the map, as lines (for
// drawing and hover) and points (for the heat map).
export function floodedRoads(map, water) {
  const lines = []
  const points = []
  if (!model || water <= 0 || !map.style || !map.getSource('openmaptiles')) return { lines, points }
  const feats = map.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' })
  for (const f of feats) {
    const p = f.properties
    if (!ROADS.has(p.class) || p.brunnel === 'bridge') continue // bridges stay dry
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : []
    for (const coords of parts) {
      let run = null
      const close = () => {
        if (run && run.coords.length > 1) lines.push({ type: 'Feature', properties: { depth: run.depth, cls: p.class }, geometry: { type: 'LineString', coordinates: run.coords } })
        run = null
      }
      for (let i = 0; i < coords.length - 1; i++) {
        const [ax, ay] = coords[i]
        const [bx, by] = coords[i + 1]
        const n = Math.max(1, Math.ceil(distM({ lng: ax, lat: ay }, { lng: bx, lat: by }) / STEP_M))
        for (let k = 0; k < n; k++) {
          const from = [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]
          const to = [ax + ((bx - ax) * (k + 1)) / n, ay + ((by - ay) * (k + 1)) / n]
          const depth = depthAt((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, water)
          if (!depth) {
            close()
            continue
          }
          points.push({ type: 'Feature', properties: { w: depth / MAX_CM }, geometry: { type: 'Point', coordinates: from } })
          const bucket = Math.round(depth / 10) * 10
          if (run && run.depth === bucket) run.coords.push(to)
          else {
            close()
            run = { depth: bucket, coords: [from, to] }
          }
        }
      }
      close()
    }
  }
  return { lines, points }
}

// Flooded spots along a route (a list of [lat, lng]), at least minSeverity
// deep, one spot every ~80 m of flooded road. Used to steer routes around them.
export function floodSpotsAlong(line, water, minSeverity) {
  const spots = []
  if (!model || water <= 0) return spots
  let last = null
  for (let i = 0; i < line.length - 1; i++) {
    const a = { lat: line[i][0], lng: line[i][1] }
    const b = { lat: line[i + 1][0], lng: line[i + 1][1] }
    const n = Math.max(1, Math.ceil(distM(a, b) / 25))
    for (let k = 0; k < n; k++) {
      const p = { lat: a.lat + ((b.lat - a.lat) * k) / n, lng: a.lng + ((b.lng - a.lng) * k) / n }
      const sev = severityFor(depthAt(p.lng, p.lat, water))
      if (sev < minSeverity) continue
      if (last && distM(last, p) < 80) last.severity = Math.max(last.severity, sev)
      else spots.push((last = { ...p, severity: sev, flooded: true }))
    }
  }
  return spots
}
