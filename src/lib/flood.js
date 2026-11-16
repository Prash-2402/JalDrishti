// Simulated flooding on roads, worked out from ground height.
//
// Real waterlogging is patchy: water collects where a road dips below the
// ground around it, and drains carry some of it away. So a road floods only
// where it sits lower than the average ground within about 150 m, by more
// than its drains can take; heavier rain fills more of each dip and
// overwhelms more drains. Lower parts of the valley pond more. Ground height
// comes from public terrain data (about 20 m detail), so this is an
// illustration of where water collects, not a measurement. See plan.md.
import { AREA } from './scene.js'
import { distM } from './geo.js'

const Z = 13 // terrain tile zoom: about 19 m per pixel here
const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const BLUR = 8 // pixels (~150 m): the "ground around" a point
const MIN_DIP = 0.9 // metres: shallower dips do not hold water
const FILL_M = 2.5 // at full rain, a dip holds water up to 2.5 m of its depth
const CM_PER_M = 30 // each metre of filled dip shows as 30 cm of water on the road
const MAX_CM = 150
const MIN_CM = 10 // shallower than this counts as dry
const ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'])
const STEP_M = 40 // long road segments are checked every 40 m

const SIZE = 2 ** Z * 256
const px = (lng) => ((lng + 180) / 360) * SIZE
const py = (lat) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * SIZE

let grid = null // ground heights for the whole area, in metres, and the local average
let model = null // { base, span }: the valley's lowest ground and its height range

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
  grid = { x0: tx0 * 256, y0: ty0 * 256, W, H, data, avg: null }

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
  model = { base, span: Math.max(4, Math.ceil(at(0.6) - base)) }
  grid.avg = boxBlur(data, W, H, BLUR, base)
  return model
}

// Average of each pixel's neighbourhood (a square r pixels each way), in two
// passes of running sums. Missing pixels count as `fill`.
function boxBlur(src, W, H, r, fill) {
  const tmp = new Float32Array(W * H)
  const out = new Float32Array(W * H)
  const v = (i) => (Number.isNaN(src[i]) ? fill : src[i])
  for (let y = 0; y < H; y++) {
    let sum = 0
    for (let x = -r; x <= r; x++) sum += v(y * W + Math.min(W - 1, Math.max(0, x)))
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = sum / (2 * r + 1)
      sum += v(y * W + Math.min(W - 1, x + r + 1)) - v(y * W + Math.max(0, x - r))
    }
  }
  for (let x = 0; x < W; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]
    for (let y = 0; y < H; y++) {
      out[y * W + x] = sum / (2 * r + 1)
      sum += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]
    }
  }
  return out
}

// What decides the water at a point: how deep a dip it sits in (m), how low
// in the valley it is (0.3 to 1), and its drains (0 to 1, fixed per ~75 m so
// some stretches drain well and their neighbours do not).
function cellAt(lng, lat) {
  if (!grid?.avg) return null
  const x = Math.round(px(lng) - grid.x0)
  const y = Math.round(py(lat) - grid.y0)
  if (x < 0 || y < 0 || x >= grid.W || y >= grid.H) return null
  const ground = grid.data[y * grid.W + x]
  if (Number.isNaN(ground)) return null
  const low = Math.min(1, Math.max(0.3, 1 - (ground - model.base) / (2 * model.span)))
  const h = Math.imul((x >> 2) * 73856093 ^ (y >> 2) * 19349663, 2654435761) >>> 0
  return { dip: grid.avg[y * grid.W + x] - ground, low, drain: (h % 1000) / 1000 }
}

// Water depth in cm for a cell at a rain level (water, 0 to 1).
function cmFor(c, water) {
  if (!c || c.dip <= 0 || water <= 0) return 0
  const filled = Math.min(c.dip - MIN_DIP, water * FILL_M) * c.low // shallow dips just run off
  const drained = (0.15 + 0.6 * c.drain) * (1 - 0.5 * water) // heavy rain overwhelms drains
  const cm = Math.min(MAX_CM, Math.round((filled - drained) * CM_PER_M))
  return cm >= MIN_CM ? cm : 0
}

// Simulated water depth in cm at a point. water is the slider value, 0 to 1.
export function depthAt(lng, lat, water) {
  return model && water > 0 ? cmFor(cellAt(lng, lat), water) : 0
}

// Every road on the map cut into ~40 m pieces, each with its ground cell.
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
          const cell = cellAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
          if (cell) pieces.push({ a, b, cell, cls: p.class, first })
          first = false
        }
      }
    }
  }
  return pieces
}

// Flooded stretches for a water level, as lines (drawing and hover) and
// points (heat map). Cheap: only re-scores the stored cells.
export function floodLines(pieces, water) {
  const lines = []
  const points = []
  if (!model || water <= 0) return { lines, points }
  let run = null
  const close = () => {
    if (run) lines.push({ type: 'Feature', properties: { depth: run.depth, cls: run.cls }, geometry: { type: 'LineString', coordinates: run.coords } })
    run = null
  }
  for (const p of pieces) {
    if (p.first) close()
    const cm = cmFor(p.cell, water)
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
