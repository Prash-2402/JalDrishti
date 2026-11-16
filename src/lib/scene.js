// The map: a quiet light basemap with flood-prone spots, low-lying ground,
// optional 3D terrain and buildings, and the route. Colours come from theme.css.
import maplibregl from 'maplibre-gl'
import { floodZones } from '../data/floodZones.js'
import { AVOID_RADIUS, circleRing } from './geo.js'
import { WIRE_RADIUS } from './hazards.js'
import { getLang } from './i18n.js'

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
const CUSTOM_SOURCES = ['dem', 'zones', 'alerts', 'avoid', 'route-fast', 'route-safe', 'route-wet', 'route-done', 'road-water', 'flood-heat']
const BELOW_LABELS = ['flood-heat', 'road-water-glow', 'road-water', 'buildings-3d']
const ABOVE_LABELS = ['zones-fill', 'zones-line', 'alerts-fill', 'alerts-line', 'avoid-fill', 'route-fast', 'route-safe-casing', 'route-safe', 'route-wet', 'route-done']
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
  simOn = false // a new map always starts in the clean view
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

    // Simulated flooding: a heat map (off by default) and flooded roads, drawn
    // under labels and buildings so the city still reads on top.
    map.addSource('flood-heat', { type: 'geojson', data: empty })
    map.addLayer(
      {
        id: 'flood-heat',
        type: 'heatmap',
        source: 'flood-heat',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': ['get', 'w'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 1.4],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 34],
          'heatmap-opacity': 0.85,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0, 0, 0, 0)',
            0.15, 'rgba(70, 180, 255, 0.55)',
            0.4, '#2f8fe8',
            0.65, '#ffd166',
            0.85, '#ff8a3d',
            1, '#e63946',
          ],
        },
      },
      firstLabel,
    )
    map.addSource('road-water', { type: 'geojson', data: empty })
    const depthColor = ['interpolate', ['linear'], ['get', 'depth'], 10, css('--flood-1'), 30, css('--flood-2'), 60, css('--flood-3'), 120, css('--flood-4')]
    map.addLayer(
      {
        id: 'road-water-glow',
        type: 'line',
        source: 'road-water',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': depthColor, 'line-blur': 6, 'line-opacity': 0.45, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 22] },
      },
      firstLabel,
    )
    map.addLayer(
      {
        id: 'road-water',
        type: 'line',
        source: 'road-water',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': depthColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 10] },
      },
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

    // Water and electricity alerts, drawn at their real radius.
    map.addSource('alerts', { type: 'geojson', data: empty })
    map.addLayer({ id: 'alerts-fill', type: 'fill', source: 'alerts', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 } })
    map.addLayer({ id: 'alerts-line', type: 'line', source: 'alerts', paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 } })

    // Area the route is steering around, shown only while a route is on screen.
    map.addSource('avoid', { type: 'geojson', data: empty })
    map.addLayer({ id: 'avoid-fill', type: 'fill', source: 'avoid', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 } })

    map.addSource('route-fast', { type: 'geojson', data: empty })
    map.addSource('route-safe', { type: 'geojson', data: empty })
    const round = { 'line-cap': 'round', 'line-join': 'round' }
    map.addLayer({ id: 'route-fast', type: 'line', source: 'route-fast', layout: round, paint: { 'line-color': css('--route-alt'), 'line-width': 4, 'line-dasharray': [1, 1.5] } })
    map.addLayer({ id: 'route-safe-casing', type: 'line', source: 'route-safe', layout: round, paint: { 'line-color': '#ffffff', 'line-width': 9 } })
    map.addLayer({ id: 'route-safe', type: 'line', source: 'route-safe', layout: round, paint: { 'line-color': css('--route'), 'line-width': 5 } })
    // Wet stretches on the chosen route, and the part already driven.
    map.addSource('route-wet', { type: 'geojson', data: empty })
    map.addSource('route-done', { type: 'geojson', data: empty })
    map.addLayer({ id: 'route-wet', type: 'line', source: 'route-wet', layout: round, paint: { 'line-color': css('--flood-3'), 'line-width': 5 } })
    map.addLayer({ id: 'route-done', type: 'line', source: 'route-done', layout: round, paint: { 'line-color': css('--route-alt'), 'line-width': 5 } })

    onReady(map)
  })

  map.once('style.load', () => setMapLang(map, getLang()))
  return map
}

// Draws the flooded roads and the heat map points from floodLines().
export function setFloodData(map, { lines, points }) {
  if (!map.style) return
  map.getSource('road-water')?.setData({ type: 'FeatureCollection', features: lines })
  map.getSource('flood-heat')?.setData({ type: 'FeatureCollection', features: points })
}

export function setHeatVisible(map, on) {
  if (!map.style || !map.getLayer('flood-heat')) return
  map.setLayoutProperty('flood-heat', 'visibility', on ? 'visible' : 'none')
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
    labels.clear()
    setMapLang(map, getLang())
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

// Road name at a point on screen, from the map's own labels.
export function roadNameAt(map, point) {
  const box = [[point.x - 14, point.y - 14], [point.x + 14, point.y + 14]]
  const f = map.queryRenderedFeatures(box).find((x) => x.sourceLayer === 'transportation_name' && x.properties.name)
  if (!f) return null
  const p = f.properties
  return (getLang() === 'kn' && p['name:kn']) || p['name:en'] || p.name_en || p.name
}

// Map labels in Kannada where OpenStreetMap has a Kannada name.
const labels = new Map() // layer id -> original label expression
export function setMapLang(map, lang) {
  if (!map.style) return
  for (const l of map.getStyle().layers) {
    if (l.type !== 'symbol' || !l.layout?.['text-field']) continue
    if (!labels.has(l.id)) labels.set(l.id, l.layout['text-field'])
    map.setLayoutProperty(l.id, 'text-field', lang === 'kn' ? ['coalesce', ['get', 'name:kn'], labels.get(l.id)] : labels.get(l.id))
  }
}

export function setAlerts(map, alerts) {
  if (!map.style) return
  map.getSource('alerts')?.setData({
    type: 'FeatureCollection',
    features: alerts.map((a) => ({
      type: 'Feature',
      properties: { color: css(a.kind === 'wire' ? '--sev-3' : '--flood-2') },
      geometry: { type: 'Polygon', coordinates: [circleRing(a.lat, a.lng, a.kind === 'wire' ? WIRE_RADIUS : 100, 32)] },
    })),
  })
}

// fit: zoom to the route (off while driving, so the camera stays behind the vehicle).
export function drawRoute(map, route, fit = true) {
  if (!map.style) return
  const safe = map.getSource('route-safe')
  const fast = map.getSource('route-fast')
  if (!safe || !fast) return
  const wet = map.getSource('route-wet')
  if (!route) {
    safe.setData(empty)
    fast.setData(empty)
    wet?.setData(empty)
    return
  }
  const bad = route.status === 'blocked' || route.status === 'wire'
  map.setPaintProperty('route-safe', 'line-color', bad ? css('--sev-3') : routeColor())
  fast.setData(route.fastest ? lineFeature(route.fastest.coords) : empty)
  safe.setData(lineFeature(route.safe.coords))
  wet?.setData({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: route.safe.prof.wet } })
  if (!fit) return

  const all = route.fastest ? route.safe.coords.concat(route.fastest.coords) : route.safe.coords
  const bounds = all.reduce((b, [lat, lng]) => b.extend([lng, lat]), new maplibregl.LngLatBounds())
  map.fitBounds(bounds, { padding: viewPadding(), maxZoom: 15.5, duration: 900 })
}
