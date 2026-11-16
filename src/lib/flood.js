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
  // The full slider covers half the height of the lower 60% of the valley, so
  // heavy rain floods the lowest roads (about 6% of the area at "Simulate")
  // rather than most of them.
  model = { base, span: Math.max(4, Math.ceil((at(0.6) - base) / 2)) }
  return model
}

function groundAt(lng, lat) {
  if (!grid) return NaN
  const x = Math.round(px(lng) - grid.x0)
  const y = Math.round(py(lat) - grid.y0)
  if (x < 0 || y < 0 || x >= grid.W || y >= grid.H) return NaN
  return grid.data[y * grid.W + x]
}

const cmBelow = (metres) => {
  const cm = Math.min(MAX_CM, Math.round(metres * CM_PER_M))
  return cm >= MIN_CM ? cm : 0
}
const waterLine = (water) => model.base + water * model.span

// Simulated water depth in cm at a point. water is the slider value, 0 to 1.
export function depthAt(lng, lat, water) {
  if (!model || water <= 0) return 0
  const ground = groundAt(lng, lat)
  return Number.isNaN(ground) ? 0 : cmBelow(waterLine(water) - ground)
}

// Every road on the map cut into ~40 m pieces, each with its ground height.
// This is the slow part, so it runs only when the map moves or new tiles
// load; changing the water level reuses it (see floodLines).
export function sampleRoads(map) {
  const pieces = []
  if (!model || !map.style || !map.getSource('openmaptiles')) return pieces
  for (const f of map.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' })) {
    const p = f.properties
    if (!ROADS.has(p.class) || p.brunnel === 'bridge') continue // bridges stay dry
    const g = f.geometry
    const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
    for (const coords of parts) {
      let first = true
      for (let i = 0; i < coords.length - 1; i++) {
        const [ax, ay] = coords[i]
        const [bx, by] = coords[i + 1]
        const n = Math.max(1, Math.ceil(distM({ lng: ax, lat: ay }, { lng: bx, lat: by }) / STEP_M))
        for (let k = 0; k < n; k++) {
          const a = [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]
          const b = [ax + ((bx - ax) * (k + 1)) / n, ay + ((by - ay) * (k + 1)) / n]
          const ground = groundAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
          if (!Number.isNaN(ground)) pieces.push({ a, b, ground, cls: p.class, first })
          first = false
        }
      }
    }
  }
  return pieces
}

// Flooded stretches for a water level, as lines (drawing and hover) and
// points (heat map). Cheap: only compares stored heights with the water line.
export function floodLines(pieces, water) {
  const lines = []
  const points = []
  if (!model || water <= 0) return { lines, points }
  const line = waterLine(water)
  let run = null
  const close = () => {
    if (run) lines.push({ type: 'Feature', properties: { depth: run.depth, cls: run.cls }, geometry: { type: 'LineString', coordinates: run.coords } })
    run = null
  }
  for (const p of pieces) {
    if (p.first) close()
    const cm = cmBelow(line - p.ground)
    if (!cm) {
      close()
      continue
    }
    points.push({ type: 'Feature', properties: { w: cm / MAX_CM }, geometry: { type: 'Point', coordinates: p.a } })
    const depth = Math.round(cm / 10) * 10
    if (run && run.depth === depth) run.coords.push(p.b)
    else {
      close()
      run = { depth, cls: p.cls, coords: [p.a, p.b] }
    }
  }
  close()
  return { lines, points }
}
