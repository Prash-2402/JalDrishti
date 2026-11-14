// The map: a quiet light basemap with flood-prone spots, low-lying ground,
// optional 3D terrain and buildings, and the route. Colours come from theme.css.
import maplibregl from 'maplibre-gl'
import { floodZones } from '../data/floodZones.js'
import { AVOID_RADIUS, circleRing } from './geo.js'

export const AREA = {
  name: 'Bellandur & Outer Ring Road',
  center: [77.685, 12.93],
  bounds: [[77.56, 12.83], [77.8, 13.02]], // the camera cannot leave this box
  sample: [77.63, 12.895, 77.725, 12.96], // west, south, east, north: used to find the lowest ground
}

// Water level for each forecast alert, as a share of the simulation slider.
export const RAIN_WATER = { Green: 0, Yellow: 0, Orange: 0.15, Red: 0.3 }

// The everyday map is light and quiet; the flood simulation switches to a dark,
// tilted 3D city where buildings and water depth read clearly.
const STYLE = {
  clean: 'https://tiles.openfreemap.org/styles/positron',
  sim: 'https://tiles.openfreemap.org/styles/dark',
}
const VALLEY = { center: [77.685, 12.932], zoom: 14, pitch: 62, bearing: -18 }
const CUSTOM_SOURCES = ['dem', 'dem-color', 'zones', 'avoid', 'route-fast', 'route-safe']
const BELOW_LABELS = ['lowland', 'buildings-3d']
const ABOVE_LABELS = ['zones-fill', 'zones-line', 'avoid-fill', 'route-fast', 'route-safe-casing', 'route-safe']
let simOn = false

const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const demSource = () => ({ type: 'raster-dem', tiles: [DEM_URL], encoding: 'terrarium', tileSize: 256, maxzoom: 13 })
const empty = { type: 'FeatureCollection', features: [] }
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const lineFeature = (coords) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: coords.map(([lat, lng]) => [lng, lat]) },
})

export const isNarrow = () => window.matchMedia('(max-width: 899px)').matches

// Space to keep clear when framing something, so it is not hidden under the sheet.
export const viewPadding = () =>
  isNarrow()
    ? { top: 72, bottom: Math.round(window.innerHeight * 0.5) + 72, left: 32, right: 32 }
    : { top: 64, bottom: 64, left: 64, right: 64 }

export function createScene(container, onReady) {
  const map = new maplibregl.Map({
    container,
    style: STYLE.clean,
    center: AREA.center,
    zoom: 13,
    maxPitch: 70,
    maxBounds: AREA.bounds,
    attributionControl: { compact: true },
  })
  // On phones the bottom sheet covers the lower half: centre the map above it.
  if (isNarrow()) map.setPadding({ top: 0, left: 0, right: 0, bottom: Math.round(window.innerHeight * 0.45) })
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
  map.on('error', (e) => console.error('[map]', e.error?.message || e))
  if (import.meta.env.DEV) window.__map = map

  map.once('style.load', () => {
    const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id

    map.addSource('dem-color', demSource())
    map.addLayer(
      { id: 'lowland', type: 'color-relief', source: 'dem-color', layout: { visibility: 'none' }, paint: { 'color-relief-opacity': 0.9 } },
      firstLabel,
    )

    map.addLayer(
      {
        id: 'buildings-3d',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-color': css('--map-building'),
          'fill-extrusion-opacity': 0.85,
        },
      },
      firstLabel,
    )

    map.addSource('zones', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: floodZones.map((z) => ({
          type: 'Feature',
          properties: { name: z.name },
          geometry: { type: 'Polygon', coordinates: [circleRing(z.lat, z.lng, z.radius, 40)] },
        })),
      },
    })
    map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': css('--zone'), 'fill-opacity': 0.1 } })
    map.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': css('--zone'), 'line-width': 1, 'line-opacity': 0.6 } })

    // Area the route is steering around, shown only while a route is on screen.
    map.addSource('avoid', { type: 'geojson', data: empty })
    map.addLayer({ id: 'avoid-fill', type: 'fill', source: 'avoid', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 } })

    map.addSource('route-fast', { type: 'geojson', data: empty })
    map.addSource('route-safe', { type: 'geojson', data: empty })
    const round = { 'line-cap': 'round', 'line-join': 'round' }
    map.addLayer({ id: 'route-fast', type: 'line', source: 'route-fast', layout: round, paint: { 'line-color': css('--route-alt'), 'line-width': 4, 'line-dasharray': [1, 1.5] } })
    map.addLayer({ id: 'route-safe-casing', type: 'line', source: 'route-safe', layout: round, paint: { 'line-color': '#ffffff', 'line-width': 9 } })
    map.addLayer({ id: 'route-safe', type: 'line', source: 'route-safe', layout: round, paint: { 'line-color': css('--route'), 'line-width': 5 } })

    onReady(map)
  })

  return map
}

// Fills ground below the water line: deep in the lowest ground, fading to a
// light edge. rise is metres above the area's lowest ground; 0 hides it.
export function setLowland(map, base, rise) {
  if (!map.style || !map.getLayer('lowland')) return
  if (rise <= 0) return map.setLayoutProperty('lowland', 'visibility', 'none')
  const level = base + rise
  map.setPaintProperty('lowland', 'color-relief-color', [
    'interpolate', ['linear'], ['elevation'],
    level - 14, css('--water-deep'),
    level - 0.4, css('--water-edge'),
    level, 'rgba(0, 0, 0, 0)',
  ])
  map.setLayoutProperty('lowland', 'visibility', 'visible')
}

export function setZonesVisible(map, visible) {
  if (!map.style) return // the map was removed (hot reload or unmount)
  for (const id of ['zones-fill', 'zones-line']) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  }
}

// Until terrain tiles arrive the camera aims at sea level, which leaves the
// scene off-centre. Re-aim once they arrive, unless the user moved the map.
function aimAtGround(map, target) {
  let tries = 0
  const timer = setInterval(() => {
    if (!map.style || !map.getTerrain() || ++tries > 60) return clearInterval(timer)
    if (map.isMoving()) return
    const c = map.getCenter()
    if (Math.abs(c.lng - target.lng) > 1e-6 || Math.abs(c.lat - target.lat) > 1e-6) return clearInterval(timer)
    if (map.getCenterElevation() > 0) return clearInterval(timer)
    if (map.queryTerrainElevation(target)) map.jumpTo({ center: target })
  }, 300)
}

const routeColor = () => (simOn ? '#3ddc84' : css('--route'))

// Colours that differ between the clean map and the simulation.
function applyLook(map, sim) {
  const paint = (id, prop, value) => map.getLayer(id) && map.setPaintProperty(id, prop, value)
  if (sim) {
    paint('background', 'background-color', '#070b12')
    paint('water', 'fill-color', '#0d2a4a')
    paint('highway_motorway_inner', 'line-color', '#ffb454')
    paint('highway_major_inner', 'line-color', '#8a9bb5')
    paint('highway_minor', 'line-color', '#3b475a')
    if (map.getLayer('building')) map.setLayoutProperty('building', 'visibility', 'none')
  }
  paint(
    'buildings-3d',
    'fill-extrusion-color',
    sim
      ? ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#1b2433', 20, '#2b3a52', 60, '#4a6387']
      : css('--map-building'),
  )
  paint('buildings-3d', 'fill-extrusion-opacity', sim ? 0.92 : 0.85)
  paint('zones-fill', 'fill-color', sim ? '#4cc9ff' : css('--zone'))
  paint('zones-line', 'line-color', sim ? '#4cc9ff' : css('--zone'))
  paint('route-safe', 'line-color', routeColor())
  paint('route-safe-casing', 'line-color', sim ? '#070b12' : '#ffffff')
}

export function set3D(map, on) {
  if (!map.style || simOn) return // the simulation is always 3D
  if (!on) {
    map.setTerrain(null)
    map.setLayoutProperty('buildings-3d', 'visibility', 'none')
    map.easeTo({ pitch: 0, bearing: 0, duration: 700 })
    return
  }
  if (!map.getSource('dem')) map.addSource('dem', demSource())
  map.setTerrain({ source: 'dem', exaggeration: 2 })
  map.setLayoutProperty('buildings-3d', 'visibility', 'visible')
  const target = map.getCenter()
  map.easeTo({ pitch: 55, bearing: -15, duration: 900 })
  aimAtGround(map, target)
}

// Switches between the clean map and the realistic simulation view, keeping
// every report, route and water layer.
export function setSimulationView(map, sim, is3D) {
  if (!map.style || sim === simOn) return
  simOn = sim
  const terrain = sim || is3D
  map.setStyle(sim ? STYLE.sim : STYLE.clean, {
    diff: false,
    transformStyle: (prev, next) => {
      const sources = { ...next.sources }
      for (const id of CUSTOM_SOURCES) if (prev.sources[id]) sources[id] = prev.sources[id]
      if (terrain && !sources.dem) sources.dem = demSource()
      const pick = (ids) =>
        prev.layers
          .filter((l) => ids.includes(l.id))
          .map((l) => (l.id === 'buildings-3d' ? { ...l, layout: { ...l.layout, visibility: terrain ? 'visible' : 'none' } } : l))
      const at = next.layers.findIndex((l) => l.type === 'symbol')
      const base = at < 0 ? next.layers : next.layers.slice(0, at)
      const labels = at < 0 ? [] : next.layers.slice(at)
      return {
        ...next,
        sources,
        layers: [...base, ...pick(BELOW_LABELS), ...labels, ...pick(ABOVE_LABELS)],
        terrain: terrain ? { source: 'dem', exaggeration: sim ? 3 : 2 } : undefined,
      }
    },
  })
  map.once('style.load', () => {
    applyLook(map, sim)
    if (sim) {
      map.easeTo({ ...VALLEY, padding: viewPadding(), duration: 2500, essential: true })
      map.once('moveend', () => aimAtGround(map, map.getCenter()))
    } else {
      map.easeTo(is3D ? { pitch: 55, bearing: -15, duration: 900 } : { pitch: 0, bearing: 0, duration: 900 })
    }
  })
}

export function setAvoidZones(map, reports) {
  if (!map.style) return
  map.getSource('avoid')?.setData({
    type: 'FeatureCollection',
    features: reports.map((r) => ({
      type: 'Feature',
      properties: { color: css(`--sev-${r.severity}`) },
      geometry: { type: 'Polygon', coordinates: [circleRing(r.lat, r.lng, AVOID_RADIUS[r.severity], 24)] },
    })),
  })
}

export function drawRoute(map, route) {
  if (!map.style) return
  const safe = map.getSource('route-safe')
  const fast = map.getSource('route-fast')
  if (!safe || !fast) return
  if (!route) {
    safe.setData(empty)
    fast.setData(empty)
    return
  }
  map.setPaintProperty('route-safe', 'line-color', route.safe.hits ? css('--sev-3') : routeColor())
  fast.setData(route.fastest ? lineFeature(route.fastest.coords) : empty)
  safe.setData(lineFeature(route.safe.coords))

  const all = route.fastest ? route.safe.coords.concat(route.fastest.coords) : route.safe.coords
  const bounds = all.reduce((b, [lat, lng]) => b.extend([lng, lat]), new maplibregl.LngLatBounds())
  map.fitBounds(bounds, { padding: viewPadding(), maxZoom: 15.5, duration: 900 })
}

// Reads real elevations for the area. Returns { base, span } in metres: the
// lowest ground and how much higher most of the area sits.
export async function sampleElevation() {
  const z = 12
  const n = 2 ** z
  const px = (lng) => ((lng + 180) / 360) * n * 256
  const py = (lat) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n * 256
  const [w, s, e, nn] = AREA.sample
  const x0 = px(w), x1 = px(e), y0 = py(nn), y1 = py(s)
  const values = []
  try {
    const jobs = []
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor(x1 / 256); tx++) {
      for (let ty = Math.floor(y0 / 256); ty <= Math.floor(y1 / 256); ty++) {
        jobs.push(
          new Promise((resolve, reject) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
              const c = document.createElement('canvas')
              c.width = c.height = 256
              const g = c.getContext('2d', { willReadFrequently: true })
              g.drawImage(img, 0, 0)
              const d = g.getImageData(0, 0, 256, 256).data
              for (let y = 0; y < 256; y += 3) {
                for (let x = 0; x < 256; x += 3) {
                  const gx = tx * 256 + x, gy = ty * 256 + y
                  if (gx < x0 || gx > x1 || gy < y0 || gy > y1) continue
                  const i = (y * 256 + x) * 4
                  values.push(d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768)
                }
              }
              resolve()
            }
            img.onerror = reject
            img.src = DEM_URL.replace('{z}', z).replace('{x}', tx).replace('{y}', ty)
          }),
        )
      }
    }
    await Promise.all(jobs)
    values.sort((a, b) => a - b)
    const at = (q) => values[Math.floor(q * (values.length - 1))]
    const base = Math.floor(at(0.01))
    return { base, span: Math.max(6, Math.ceil(at(0.6) - base)) }
  } catch {
    return { base: 865, span: 30 }
  }
}
