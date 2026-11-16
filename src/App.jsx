import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { History, Map as MapIcon, Route as RouteIcon, X, Zap } from 'lucide-react'
import ActivityPanel from './components/ActivityPanel.jsx'
import DemoMenu from './components/DemoMenu.jsx'
import DriveHud from './components/DriveHud.jsx'
import MapPanel from './components/MapPanel.jsx'
import ReportForm from './components/ReportForm.jsx'
import RoutePanel from './components/RoutePanel.jsx'
import { floodZones } from './data/floodZones.js'
import { clearAlert, clearDemoAlerts, listAlerts, SENSORS, sendAlert, subscribeAlerts } from './lib/alerts.js'
import { reportCard, roadCard, sensorCard, zoneCard } from './lib/cards.js'
import { createDrive } from './lib/drive.js'
import { depthAt, floodLines, loadDem, sampleRoads } from './lib/flood.js'
import { distM } from './lib/geo.js'
import { buildHazards, isActiveAlert, profile } from './lib/hazards.js'
import { aiSummary } from './lib/guide.js'
import { getLang, setLang, t } from './lib/i18n.js'
import { reverseGeocode } from './lib/places.js'
import { findRoute } from './lib/routing.js'
import {
  createScene, drawRoute, isNarrow, RAIN_WATER, roadNameAt, set3D, setAlerts, setAvoidZones, setFloodData, setGate, setGateGlow, setHeatVisible,
  setMapLang, setPlacing as setPlacingGlow, setSimulationView, setZonesVisible, viewPadding,
} from './lib/scene.js'
import { MODES, SEVERITY, sev } from './lib/severity.js'
import { listHistory, listReports, live, loadTrips, saveTrips, subscribe, voteReport } from './lib/store.js'
import { getRainAlert } from './lib/weather.js'

const TABS = [
  { id: 'map', icon: MapIcon },
  { id: 'route', icon: RouteIcon },
  { id: 'activity', icon: History },
]
const SPOT_RADIUS = 200 // metres: reports this close count as the same spot
const LOOK_M = 2000 // while driving, the road this far ahead is checked
const KNOWN_M = 120 // water this close to water already planned for is not new
const REPLAY_MS = 60000
const RAIN_KEY = 'jaldrishti.rain'

const near = (rows, p, radius) => rows.filter((h) => distM(h, p) <= radius).length
const thin = (coords, max = 400) => coords.filter((_, i) => i % Math.ceil(coords.length / max) === 0 || i === coords.length - 1)
const lineM = (c) => c.reduce((s, p, i) => (i ? s + distM({ lat: c[i - 1][0], lng: c[i - 1][1] }, { lat: p[0], lng: p[1] }) : 0), 0)
const rain3h = (hours, h) => hours.slice(Math.max(0, Math.floor(h) - 2), Math.floor(h) + 1).reduce((s, x) => s + x, 0)

function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error(t('err.noGps')))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error(t('err.gpsDenied'))),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  })
}

// Vibrate and play two short tones for a danger alert.
function buzz() {
  navigator.vibrate?.([200, 100, 200, 100, 400])
  try {
    const ctx = new AudioContext()
    for (const [at, f] of [[0, 880], [0.3, 660]]) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      g.gain.setValueAtTime(0.15, ctx.currentTime + at)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.25)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + at)
      o.stop(ctx.currentTime + at + 0.25)
    }
  } catch {
    // sound blocked until the user interacts with the page
  }
}

function usePointMarker(map, point, className) {
  useEffect(() => {
    if (!map || !point) return
    const el = document.createElement('div')
    el.className = `pt ${className}`
    const marker = new maplibregl.Marker({ element: el }).setLngLat([point.lng, point.lat]).addTo(map)
    return () => marker.remove()
  }, [map, point?.lat, point?.lng, className]) // eslint-disable-line react-hooks/exhaustive-deps
}

// Keeps one HTML marker per item ({ key, lat, lng }); make(item) builds its element.
function useMarkers(map, items, make) {
  const store = useRef(new Map())
  useEffect(() => {
    if (!map) return
    const m = store.current
    const keys = new Set(items.map((i) => i.key))
    for (const [k, marker] of m) {
      if (!keys.has(k)) {
        marker.remove()
        m.delete(k)
      }
    }
    for (const i of items) if (!m.has(i.key)) m.set(i.key, new maplibregl.Marker({ element: make(i) }).setLngLat([i.lng, i.lat]).addTo(map))
  }, [map, items]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = store.current
    return () => {
      m.forEach((marker) => marker.remove())
      m.clear()
    }
  }, [map])
}

export default function App() {
  const boxRef = useRef(null)
  const pickRef = useRef(null)
  const popupRef = useRef(null)
  const reportsRef = useRef([])
  const historyRef = useRef([])
  const tabRef = useRef('map')
  const waterTouched = useRef(false)
  const driveRef = useRef(null)
  const tickRef = useRef(null)
  const knownRef = useRef([]) // water on the current drive route, already planned for
  const rerouteRef = useRef({ busy: false, last: 0, strict: false, gate: null })
  const decidedRef = useRef([]) // deep water the user chose to go through
  const placingRef = useRef(false)
  const placeRef = useRef(null)
  const waterAtRef = useRef(null)
  const stepsRef = useRef([]) // turns on the current drive route, { at, type, name }
  const spokenRef = useRef(new Set())
  const voiceRef = useRef(true)

  const [map, setMap] = useState(null)
  const [tab, setTab] = useState('map')
  const [reporting, setReporting] = useState(false)
  const [pick, setPick] = useState(null)
  const [pin, setPin] = useState(null)
  const [start, setStart] = useState(null)
  const [end, setEnd] = useState(null)
  const [mode, setMode] = useState('bike')
  const [route, setRoute] = useState(null)
  const [routeBusy, setRouteBusy] = useState(false)
  const [routeNonce, setRouteNonce] = useState(0)
  const [reports, setReports] = useState([])
  const [history, setHistory] = useState([])
  const [alerts, setAlerts_] = useState([])
  const [rain, setRain] = useState(null)
  const [rainEvent, setRainEvent] = useState(null)
  const [dem, setDem] = useState(null)
  const [water, setWater] = useState(0) // 0 to 1: share of the area's height range under water
  const [playing, setPlaying] = useState(false)
  const [showZones, setShowZones] = useState(true)
  const [is3D, setIs3D] = useState(false)
  const [sim, setSim] = useState(false)
  const [heat, setHeat] = useState(false)
  const [routeWater, setRouteWater] = useState(0) // water level the current route was planned for
  const [driveInfo, setDriveInfo] = useState(null)
  const [speed, setSpeed] = useState(10)
  const [paused, setPaused] = useState(false)
  const [trips, setTrips] = useState(loadTrips)
  const [replay, setReplay] = useState(null) // { data, h }
  const [banner, setBanner] = useState(null) // drive status: { tone, text, auto? }
  const [alarm, setAlarm] = useState(null) // new alert: { tone, text, alertId, auto? }
  const [note, setNote] = useState('')
  const [rerouting, setRerouting] = useState(false)
  const [placing, setPlacing] = useState(false) // choosing where to put an electricity fault
  const [placeErr, setPlaceErr] = useState(false)
  const [voice, setVoice] = useState(true)
  const [msg, setMsg] = useState('')
  const [, setTick] = useState(0)

  const refresh = useCallback(() => {
    listReports()
      .then((rows) => {
        const before = new Set(reportsRef.current.map((r) => r.id))
        const fresh = reportsRef.current.length ? rows.filter((r) => !before.has(r.id)) : []
        if (fresh.length && tabRef.current !== 'activity') setNote(t('new.item', { label: sev(fresh[0].severity).label, place: fresh[0].place }))
        setReports(rows)
      })
      .catch((e) => setMsg(e.message))
    listHistory(720)
      .then(setHistory)
      .catch(() => {})
    setTick((x) => x + 1)
  }, [])
  const refreshAlerts = useCallback(() => {
    listAlerts()
      .then((rows) => setAlerts_([...rows]))
      .catch((e) => setMsg(e.message))
  }, [])

  const setNamed = useCallback((setter, p) => {
    setter(p)
    reverseGeocode(p).then((name) => {
      if (name) setter((cur) => (cur && cur.lat === p.lat && cur.lng === p.lng ? { ...cur, name } : cur))
    })
  }, [])

  // Create the map once.
  useEffect(() => {
    const m = createScene(boxRef.current, setMap)
    m.on('click', (e) => {
      if (placingRef.current) return placeRef.current?.(e)
      const which = pickRef.current
      if (!which) return
      setNamed({ pin: setPin, start: setStart, end: setEnd }[which], { lat: e.lngLat.lat, lng: e.lngLat.lng })
      setPick(null)
    })
    return () => {
      driveRef.current?.stop()
      driveRef.current = null
      setMap(null)
      m.remove()
    }
  }, [setNamed])

  useEffect(() => {
    pickRef.current = pick
    if (map) map.getCanvas().style.cursor = pick ? 'crosshair' : ''
  }, [pick, map])
  useEffect(() => {
    tabRef.current = tab
  }, [tab])
  useEffect(() => {
    placingRef.current = Boolean(placing)
    if (!map) return
    setPlacingGlow(map, placing === 'wire')
    map.getCanvas().style.cursor = placing ? 'crosshair' : ''
  }, [placing, map])

  useEffect(() => {
    refresh()
    refreshAlerts()
    const offReports = subscribe(refresh)
    const offAlerts = subscribeAlerts(refreshAlerts)
    const timer = setInterval(() => {
      refresh()
      refreshAlerts()
    }, 30000) // drops expired reports and alerts
    return () => {
      offReports()
      offAlerts()
      clearInterval(timer)
    }
  }, [refresh, refreshAlerts])

  useEffect(() => {
    getRainAlert().then(setRain).catch(() => {})
    loadDem().then(setDem)
  }, [])

  // On heavy-rain days, start with some water showing until the user changes it.
  // A change in the rain level is kept for the activity log.
  useEffect(() => {
    if (!rain) return
    try {
      const prev = JSON.parse(localStorage.getItem(RAIN_KEY))
      const next = prev?.level === rain.level ? prev : { level: rain.level, at: new Date().toISOString(), changed: Boolean(prev) }
      localStorage.setItem(RAIN_KEY, JSON.stringify(next))
      setRainEvent(next.changed ? next : null) // only a change of level is news
    } catch {
      // storage blocked: no rain entry in the log
    }
  }, [rain])

  // Flooded roads. Sampling the roads is the slow part and runs at most once a
  // second while the map moves; a new water level only re-checks the samples.
  const waterRef = useRef(water)
  const floodUpdate = useRef(null)
  waterRef.current = water
  useEffect(() => {
    if (!map || !dem) return
    let pieces = []
    let dirty = true
    let sampledAt = 0
    let timer = 0
    const draw = () => {
      timer = 0
      if (waterRef.current > 0 && dirty) {
        pieces = sampleRoads(map)
        dirty = false
        sampledAt = performance.now()
      }
      setFloodData(map, floodLines(pieces, waterRef.current))
    }
    // Throttle, not debounce: while the water rises every frame, a redraw is
    // already waiting, so it still happens every 40 ms instead of only at the end.
    const schedule = (wait = 0) => {
      if (!timer) timer = setTimeout(draw, wait)
    }
    const onChange = () => {
      dirty = true
      schedule(Math.max(250, 1000 - (performance.now() - sampledAt)))
    }
    const onData = (e) => e.sourceId === 'openmaptiles' && e.isSourceLoaded && onChange()
    floodUpdate.current = () => schedule(40)
    schedule()
    map.on('moveend', onChange)
    map.on('sourcedata', onData)
    return () => {
      clearTimeout(timer)
      map.off('moveend', onChange)
      map.off('sourcedata', onData)
    }
  }, [map, dem])
  useEffect(() => {
    floodUpdate.current?.()
  }, [water])

  useEffect(() => {
    if (map) setHeatVisible(map, heat)
  }, [map, heat, sim])

  // Re-plan the route once the water stops changing.
  useEffect(() => {
    if (playing || replay) return
    const timer = setTimeout(() => setRouteWater(Math.round(water * 100) / 100), 500)
    return () => clearTimeout(timer)
  }, [water, playing, replay])

  // "Simulate" raises the water steadily over 8 seconds.
  useEffect(() => {
    if (!playing) return
    const from = water >= 0.6 ? 0 : water
    const began = performance.now()
    let frame
    const step = (now) => {
      const k = Math.min(1, (now - began) / 8000)
      setWater(from + (0.6 - from) * k)
      if (k < 1) frame = requestAnimationFrame(step)
      else setPlaying(false)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (map) setZonesVisible(map, showZones)
  }, [map, showZones])

  const openPopup = useCallback(
    (lngLat, content) => {
      popupRef.current?.remove()
      popupRef.current = new maplibregl.Popup({ offset: 12, maxWidth: '260px' }).setLngLat(lngLat).setDOMContent(content).addTo(map)
    },
    [map],
  )

  const vote = useCallback(
    (id, v) => {
      popupRef.current?.remove()
      voteReport(id, v)
        .then(refresh)
        .catch((e) => setMsg(e.message))
    },
    [refresh],
  )

  const showReport = useCallback(
    (r) => {
      const current = reportsRef.current.find((x) => x.id === r.id)
      openPopup(
        [r.lng, r.lat],
        reportCard(current || r, { active: Boolean(current), nearbyCount: near(historyRef.current, r, SPOT_RADIUS), onVote: r.replay ? null : vote }),
      )
    },
    [openPopup, vote],
  )

  const zones = useMemo(() => floodZones.map((z) => ({ ...z, count: near(history, z, z.radius + 150) })), [history])
  useEffect(() => {
    historyRef.current = history
  }, [history])

  // Hover (or tap) a flooded road to see how deep the water is.
  useEffect(() => {
    if (!map) return
    const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'hover-pop', maxWidth: '240px' })
    const card = (e) => {
      const f = e.features?.[0]
      return f && roadCard(roadNameAt(map, e.point), f.properties.depth, f.properties.cls)
    }
    let frame = 0
    const move = (e) => {
      if (pickRef.current || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const c = card(e)
        if (!c) return
        map.getCanvas().style.cursor = 'pointer'
        hover.setLngLat(e.lngLat).setDOMContent(c).addTo(map)
      })
    }
    const leave = () => {
      cancelAnimationFrame(frame)
      frame = 0
      if (!pickRef.current) map.getCanvas().style.cursor = ''
      hover.remove()
    }
    const click = (e) => {
      if (pickRef.current || !e.originalEvent || e.originalEvent.pointerType === 'mouse') return
      const c = card(e) // touch screens have no hover: show it on tap instead
      if (c) openPopup(e.lngLat, c)
    }
    map.on('mousemove', 'road-water', move)
    map.on('mouseleave', 'road-water', leave)
    map.on('click', 'road-water', click)
    return () => {
      leave()
      map.off('mousemove', 'road-water', move)
      map.off('mouseleave', 'road-water', leave)
      map.off('click', 'road-water', click)
    }
  }, [map, openPopup])

  // Flood-prone spot popups.
  useEffect(() => {
    if (!map) return
    const onClick = (e) => {
      if (pickRef.current) return
      const z = floodZones.find((x) => x.name === e.features?.[0]?.properties.name)
      if (z) openPopup([z.lng, z.lat], zoneCard(z, near(historyRef.current, z, z.radius + 150)))
    }
    const enter = () => !pickRef.current && (map.getCanvas().style.cursor = 'pointer')
    const leave = () => !pickRef.current && (map.getCanvas().style.cursor = '')
    map.on('click', 'zones-fill', onClick)
    map.on('mouseenter', 'zones-fill', enter)
    map.on('mouseleave', 'zones-fill', leave)
    return () => {
      map.off('click', 'zones-fill', onClick)
      map.off('mouseenter', 'zones-fill', enter)
      map.off('mouseleave', 'zones-fill', leave)
    }
  }, [map, openPopup])

  // Replay of Sept 2022: reports appear and clear in step with the real rainfall.
  const replayReports = useMemo(() => {
    if (!replay) return null
    const { data, h } = replay
    const now = Date.now()
    return data.reports
      .filter((r) => r.h <= h && h < r.h + (r.ttl ?? 3))
      .map((r, i) => {
        const observed = now - (h - r.h) * 3600e3
        return {
          id: `replay-${r.h}-${i}`,
          lat: r.lat,
          lng: r.lng,
          severity: r.severity,
          place: r.place,
          replay: true,
          confirmations: 0,
          observed_at: new Date(observed).toISOString(),
          created_at: new Date(observed).toISOString(),
          expires_at: new Date(observed + (r.ttl ?? 3) * 3600e3).toISOString(),
        }
      })
  }, [replay])
  const shown = replayReports || reports

  // Report markers.
  useEffect(() => {
    reportsRef.current = shown
  }, [shown])
  const reportItems = useMemo(() => shown.map((r) => ({ ...r, key: r.id })), [shown])
  useMarkers(map, reportItems, (r) => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'report-dot'
    el.style.setProperty('--c', SEVERITY[r.severity].color)
    el.setAttribute('aria-label', sev(r.severity).label)
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!pickRef.current) showReport(r)
    })
    return el
  })

  // Alerts: drawn on the map, on the sensors, and announced when new.
  const shownAlerts = useMemo(() => (sim ? alerts : alerts.filter((a) => !a.is_simulated)), [alerts, sim])
  const activeAlerts = useMemo(() => shownAlerts.filter((a) => isActiveAlert(a)), [shownAlerts])
  useEffect(() => {
    if (map) setAlerts(map, [...activeAlerts, ...shown.map((r) => ({ kind: 'report', lat: r.lat, lng: r.lng, severity: r.severity }))])
  }, [map, activeAlerts, shown])
  useMarkers(
    map,
    useMemo(() => activeAlerts.filter((a) => a.kind === 'wire').map((a) => ({ key: a.id, lat: a.lat, lng: a.lng })), [activeAlerts]),
    () => Object.assign(document.createElement('div'), { className: 'pulse' }),
  )
  const sensorItems = useMemo(
    () =>
      SENSORS.map((s) => {
        const wire = activeAlerts.find((a) => a.sensor_id === s.id && a.kind === 'wire')
        const wet = activeAlerts.find((a) => a.sensor_id === s.id && a.kind === 'water')
        return { ...s, wire, wet, key: `${s.id}:${wire ? 'w' : wet ? 'r' : ''}` }
      }),
    [activeAlerts],
  )
  useMarkers(map, sensorItems, (s) => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = `sensor${s.wire ? ' danger' : s.wet ? ' wet' : ''}`
    el.setAttribute('aria-label', s.name)
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      if (pickRef.current) return
      openPopup(
        [s.lng, s.lat],
        sensorCard(s, {
          water: s.wet,
          wire: s.wire,
          cm: s.wire?.cm || s.wet?.cm || waterAtRef.current?.(s) || 0,
          onWire: !sim ? null : () => {
            popupRef.current?.remove()
            const cm = s.wet?.cm || waterAtRef.current?.(s) || 0
            sendAlert({ kind: 'wire', lat: s.lat, lng: s.lng, cm, place: s.name, sensorId: s.id }).catch((err) => setMsg(err.message))
          },
          onSafe: () => {
            popupRef.current?.remove()
            clearAlert(s.wire).catch((err) => setMsg(err.message))
          },
        }),
      )
    })
    return el
  })

  const seenRef = useRef(null)
  useEffect(() => {
    if (seenRef.current) {
      for (const a of activeAlerts) {
        if (seenRef.current.has(a.id)) continue
        if (a.kind === 'wire') {
          setAlarm({ tone: 'danger', text: t('bn.wire', a.place || t('sensor.pole')), alertId: a.id })
          buzz()
        } else setAlarm({ tone: 'water', text: t('bn.water', { place: a.place || t('road.road'), cm: Math.round(a.cm) }), alertId: a.id, auto: 6000 })
      }
    }
    seenRef.current = new Set(shownAlerts.map((a) => a.id))
    setAlarm((b) => (b && !activeAlerts.some((a) => a.id === b.alertId) ? null : b))
  }, [shownAlerts, activeAlerts])

  useEffect(() => {
    if (!banner?.auto) return
    const timer = setTimeout(() => setBanner((b) => (b === banner ? null : b)), banner.auto)
    return () => clearTimeout(timer)
  }, [banner])
  useEffect(() => {
    if (!alarm?.auto) return
    const timer = setTimeout(() => setAlarm((b) => (b === alarm ? null : b)), alarm.auto)
    return () => clearTimeout(timer)
  }, [alarm])
  useEffect(() => {
    if (!note) return
    const timer = setTimeout(() => setNote(''), 4000)
    return () => clearTimeout(timer)
  }, [note])

  usePointMarker(map, pin, 'pt-pin')
  usePointMarker(map, start, 'pt-start')
  usePointMarker(map, end, 'pt-end')

  // Routing. Hazards that matter for the vehicle decide when to re-plan.
  const modeCfg = MODES[mode]
  const planHazards = useMemo(() => buildHazards(shown, activeAlerts, true), [shown, activeAlerts])
  const planRef = useRef(planHazards)
  planRef.current = planHazards
  const hazardKey = planHazards
    .filter((h) => h.hard || h.cm >= modeCfg.avoidCm)
    .map((h) => h.id)
    .sort()
    .join(',')
  useEffect(() => {
    if (driveRef.current) return // while driving, the drive check re-plans
    if (!start || !end) return setRoute(null)
    let stale = false
    setRouteBusy(true)
    const w = dem && sim ? routeWater : 0
    findRoute(start, end, { hazards: planRef.current, water: w, mode: MODES[mode] })
      .then((r) => !stale && setRoute({ ...r, simulated: w > 0 }))
      .catch((e) => !stale && (setRoute(null), setMsg(e.message)))
      .finally(() => !stale && setRouteBusy(false))
    return () => {
      stale = true
    }
  }, [start?.lat, start?.lng, end?.lat, end?.lng, hazardKey, routeWater, mode, dem, routeNonce, sim]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map) return
    drawRoute(map, route, !driveRef.current)
    setAvoidZones(map, route ? shown.filter((r) => SEVERITY[r.severity].cm >= modeCfg.avoidCm) : [])
  }, [map, route]) // eslint-disable-line react-hooks/exhaustive-deps

  // Driving. Every tick checks the road ahead:
  //   electricity: always go around it; if every route crosses it, stop short and wait
  //   new water: look for a drier route; if there is none, take the least water
  //   water deeper than the vehicle can handle: pause before it and ask
  // Water already planned for never triggers a reroute again, so there are no loops.
  const matches = (list, s) => list.some((k) => (s.id && k.id === s.id) || (!s.id && distM(k, s) < KNOWN_M))
  const vehicle = t(`mode.${mode}`)

  const clearGate = () => {
    rerouteRef.current.gate = null
    if (map) setGate(map, null)
    driveRef.current?.setZoom(16)
    setDriveInfo((i) => i && { ...i, prompt: null })
  }
  const openGate = (spot, at) => {
    const d = driveRef.current
    d.stopBefore(at + spot.at - 80)
    rerouteRef.current.gate = { spot, waiting: false }
    setGate(map, d.slice(at + spot.at, at + spot.end + 20))
    d.setZoom(15.3) // pull back so the water is in view
    setDriveInfo((i) => i && { ...i, prompt: { cm: spot.cm, m: Math.max(20, Math.round((spot.end - spot.at + 25) / 10) * 10), waiting: false } })
  }
  const gateWait = () => {
    const g = rerouteRef.current.gate
    if (!g) return
    g.waiting = true
    setDriveInfo((i) => i && { ...i, prompt: { ...i.prompt, waiting: true } })
  }
  const gateGo = () => {
    const g = rerouteRef.current.gate
    if (!g) return
    decidedRef.current.push(g.spot)
    driveRef.current?.release()
    clearGate()
  }

  const reroute = async (reason, force = false) => {
    const d = driveRef.current
    const st = rerouteRef.current
    if (!d || st.busy || (!force && performance.now() - st.last < 5000)) return
    st.busy = true
    setRerouting(true)
    const blockAt = reason.m != null ? d.at + reason.m : null
    if (blockAt != null) d.stopBefore(blockAt - 120) // never drive into it while the new route loads
    if (reason.kind === 'wire') setBanner({ tone: 'danger', text: t('bn.wireAhead') })
    else if (reason.kind === 'water') setBanner({ tone: 'water', text: t('bn.rising', reason.cm) })
    else if (reason.kind === 'off') setBanner({ tone: 'water', text: t('bn.offRoute') })
    const originAt = blockAt != null ? d.at + Math.max(0, Math.min(300, blockAt - d.at - 250)) : d.at
    const o = d.pointAt(originAt)
    const w = waterRef.current
    const hz = buildHazards(reportsRef.current, shownAlerts, true)
    try {
      const r = await findRoute({ lat: o.lat, lng: o.lng }, end, { hazards: hz, water: w, mode: modeCfg })
      if (driveRef.current !== d) return
      if (r.status === 'wire') {
        // Every route crosses electricity: stop well short of it and wait for it to clear.
        const ahead = profile(d.slice(d.at), hz, w, modeCfg.avoidCm, [end])
        d.stopBefore(d.at + Math.max(0, (ahead.hard?.at ?? reason.m ?? 0) - 200))
        st.strict = true
        if (st.gate) clearGate()
        setDriveInfo((i) => i && { ...i, strict: true })
        setBanner(null)
        return
      }
      const oldRest = d.slice(d.at)
      const lead = d.slice(d.at, Math.max(d.at, originAt))
      const coords = [...lead, ...r.safe.coords]
      const leadM = lineM(lead)
      stepsRef.current = (r.safe.steps || []).map((s) => ({ ...s, at: s.at + leadM }))
      spokenRef.current = new Set()
      d.reroute(coords)
      const prof = profile(coords, hz, w, modeCfg.avoidCm, [end])
      knownRef.current = prof.spots
      const timed = (c) => ({ coords: c, km: lineM(c) / 1000, min: lineM(c) / d.mps / 60 })
      setRoute({
        ...r,
        safe: { ...r.safe, ...timed(coords), prof },
        fastest: { ...timed(oldRest), prof: profile(oldRest, hz, w, modeCfg.avoidCm, [end]) },
        simulated: w > 0,
      })
      st.strict = false
      if (st.gate) clearGate()
      setDriveInfo((i) => i && { ...i, strict: false })
      const cm = prof.maxCm
      setBanner(
        r.status === 'dry'
          ? { tone: 'info', text: t('bn.rerouted'), auto: 4000 }
          : r.status === 'blocked'
            ? { tone: 'warn', text: t('bn.deep', { cm, vehicle }), auto: 8000 }
            : { tone: 'warn', text: t('bn.least', cm), auto: 6000 },
      )
    } catch (e) {
      setMsg(e.message)
      d.release()
    } finally {
      st.busy = false
      st.last = performance.now()
      setRerouting(false)
    }
  }

  tickRef.current = ({ at, leftM, leftMin, offRoute }) => {
    const d = driveRef.current
    if (!d) return
    const st = rerouteRef.current
    const prof = profile(d.slice(at, at + LOOK_M), buildHazards(reportsRef.current, shownAlerts), waterRef.current, modeCfg.avoidCm, [end])
    d.setSlow(prof.spots.map((s) => [at + s.at - 15, at + s.end + 25]))
    const inWater = prof.spots.find((s) => s.at <= 5)
    const spot = prof.spots.find((s) => s.at > 40) // water under the vehicle cannot be avoided any more
    const wireFirst = prof.hard && (!spot || prof.hard.at < spot.at)
    const next = wireFirst ? { kind: 'wire', m: prof.hard.at } : spot ? { kind: 'water', cm: spot.cm, m: spot.at } : null
    // The next turn, spoken once when it is 150 m away (not at fast demo speeds).
    const step = stepsRef.current.find((s) => s.at > at + 8 && s.type !== 11)
    const turn = step && { type: step.type, name: step.name, m: step.at - at }
    if (turn && turn.m < 150 && !spokenRef.current.has(step.at) && (d.gps || speed <= 5)) {
      spokenRef.current.add(step.at)
      say(turnText(turn))
    }
    setDriveInfo((i) => i && { ...i, leftM, leftMin, next, inWater: inWater?.cm || 0, turn })

    if (st.strict && !prof.hard) {
      st.strict = false // the electricity was cleared: carry on
      d.release()
      setDriveInfo((i) => i && { ...i, strict: false })
    }
    if (st.gate) {
      const still = prof.spots.some((s) => distM(s, st.gate.spot) < KNOWN_M && s.cm >= modeCfg.maxCm)
      if (!still) {
        d.release() // the water went down: carry on
        clearGate()
      } else if (st.gate.waiting && performance.now() - st.last > 30000) reroute({ kind: 'manual' }, true) // a drier way may have opened
    }
    if (st.busy || st.strict) return
    if (offRoute) reroute({ kind: 'off' })
    else if (wireFirst) reroute(next)
    else if (spot && !matches(knownRef.current, spot)) reroute(next)
    else if (!st.gate && !d.gps && spot && spot.cm >= modeCfg.maxCm && spot.at < 300 && !matches(decidedRef.current, spot)) openGate(spot, at)
  }

  // The deep stretch pulses while the choice is open.
  const prompting = Boolean(driveInfo?.prompt && !driveInfo.prompt.waiting)
  useEffect(() => {
    if (!map || !prompting) return
    let on = false
    const timer = setInterval(() => setGateGlow(map, (on = !on)), 700)
    return () => {
      clearInterval(timer)
      setGateGlow(map, true)
    }
  }, [map, prompting])

  const startDrive = (gps) => {
    if (!map || !route || route.status === 'wire') return
    driveRef.current?.stop()
    popupRef.current?.remove()
    const d = createDrive(map, {
      gps,
      icon: mode === 'bike' ? '🛵' : '🚗',
      onTick: (info) => tickRef.current?.(info),
      onEnd: () => setDriveInfo((i) => i && { ...i, arrived: true, next: null }),
    })
    driveRef.current = d
    knownRef.current = route.safe.prof.spots
    decidedRef.current = []
    rerouteRef.current = { busy: false, last: 0, strict: false, gate: null }
    d.setSpeed(speed)
    d.start(route.safe.coords, route.safe.min)
    stepsRef.current = route.safe.steps || []
    spokenRef.current = new Set()
    setDriveInfo({ leftM: route.safe.km * 1000, leftMin: route.safe.min, next: null, gps })
    announce(route)
    setPaused(false)
    drawRoute(map, route, false)
  }
  const stopDrive = () => {
    driveRef.current?.stop()
    driveRef.current = null
    if (map) setGate(map, null)
    setDriveInfo(null)
    setBanner(null)
    setRouteNonce((n) => n + 1)
    map?.easeTo({ pitch: sim || is3D ? 55 : 0, bearing: 0, zoom: 13.5, duration: 900, padding: viewPadding() })
  }

  // Directions out loud, in the app's language.
  const say = (text) => {
    if (!voiceRef.current || !window.speechSynthesis || !text) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = getLang() === 'kn' ? 'kn-IN' : 'en-IN'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }
  const turnText = (s) => t(`turn.${s.type}`) + (s.name ? t('turn.onto', s.name) : '')
  // A short summary when a drive starts, written by Grok if it is set up.
  const announce = (r) => {
    const { maxCm, spots, hard } = r.safe.prof
    const base = t('sum.base', { km: r.safe.km.toFixed(1), min: Math.round(r.safe.min) })
    const text = `${base} ${hard ? t('sum.wire') : maxCm ? t('sum.wet', { cm: maxCm, n: spots.length }) : t('sum.free')}`
    setBanner({ tone: 'info', text, auto: 8000 })
    say(text)
    aiSummary({
      lang: getLang(),
      vehicle: mode,
      km: Number(r.safe.km.toFixed(1)),
      min: Math.round(r.safe.min),
      status: r.status,
      maxWaterCm: maxCm,
      wetStretches: spots.length,
      turns: (r.safe.steps || []).slice(0, 8).map((s) => ({ do: t(`turn.${s.type}`), road: s.name, afterKm: Number((s.at / 1000).toFixed(1)) })),
    }).then((ai) => {
      if (!ai || !driveRef.current) return
      setBanner({ tone: 'info', text: ai, auto: 10000 })
      say(ai)
    })
  }

  // Demo triggers.
  const raiseWater = () => {
    const d = driveRef.current
    if (!d || !map) return
    const p = d.pointAt(Math.min(d.at + 600, d.total - 150))
    sendAlert({ kind: 'water', lat: p.lat, lng: p.lng, cm: 60, place: roadNameAt(map, map.project([p.lng, p.lat])) || t('road.road') }).catch((e) => setMsg(e.message))
  }

  // Water depth at a point: a flooded road in the simulation, a report or a water alert.
  const waterAt = (p) => {
    const cm = depthAt(p.lng, p.lat, waterRef.current)
    if (cm >= 10) return cm
    const h = buildHazards(reportsRef.current, shownAlerts).find((x) => !x.hard && x.cm >= 10 && distM(x, p) < x.radius)
    return h ? h.cm : 0
  }
  waterAtRef.current = waterAt
  const startPlacing = (kind = 'wire') => {
    if (kind === 'water') {
      popupRef.current?.remove()
      setPlaceErr(false)
      return setPlacing('water')
    }
    const anyWater = waterRef.current > 0 || buildHazards(reportsRef.current, shownAlerts).some((h) => !h.hard && h.cm >= 10)
    if (!anyWater) return setMsg(t('place.none'))
    popupRef.current?.remove()
    setPlaceErr(false)
    setPlacing('wire')
  }
  // A tap while placing: snap to the nearest flooded road within 60 m, else
  // accept it inside a report or water alert, else explain and shake.
  placeRef.current = (e) => {
    const tap = { lat: e.lngLat.lat, lng: e.lngLat.lng }
    if (placing === 'water') {
      setPlacing(false)
      return sendAlert({ kind: 'water', ...tap, cm: 45, place: roadNameAt(map, e.point) || t('road.road') }).catch((err) => setMsg(err.message))
    }
    let best = null
    const box = [[e.point.x - 30, e.point.y - 30], [e.point.x + 30, e.point.y + 30]]
    for (const f of map.queryRenderedFeatures(box, { layers: ['road-water'] })) {
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
      for (const [lng, lat] of lines.flat()) {
        const dist = distM(tap, { lat, lng })
        if (dist < 60 && (!best || dist < best.dist)) best = { lat, lng, dist, cm: f.properties.depth }
      }
    }
    const here = best ? 0 : waterAt(tap)
    if (here) best = { ...tap, cm: here }
    if (!best) {
      setPlaceErr(false)
      requestAnimationFrame(() => setPlaceErr(true)) // restart the shake
      return
    }
    setPlacing(false)
    sendAlert({ kind: 'wire', lat: best.lat, lng: best.lng, cm: best.cm, place: roadNameAt(map, map.project([best.lng, best.lat])) || t('road.road') }).catch((err) =>
      setMsg(err.message),
    )
  }
  const enterSim = () => {
    if (sim || !map) return
    setSim(true)
    setSimulationView(map, true, is3D)
    if (!waterTouched.current && rain) setWater(RAIN_WATER[rain.level] ?? 0) // start from today's forecast
  }
  // Live shows only what is real: reports, real sensor alerts and past floods.
  const exitSim = () => {
    if (driveRef.current) stopDrive()
    setPlaying(false)
    setReplay(null)
    setPlacing(false)
    setSim(false)
    setWater(0)
    waterTouched.current = false
    if (map) setSimulationView(map, false, is3D)
  }
  const startReplay = async () => {
    const data = (await import('./data/sept2022.json')).default
    waterTouched.current = true
    setPlaying(false)
    enterSim()
    setReplay({ data, h: 0 })
  }
  useEffect(() => {
    if (!replay?.data) return
    const { hours } = replay.data
    const peak = Math.max(...hours.map((_, i) => rain3h(hours, i))) || 1 // water peaks with the period's heaviest rain
    const began = performance.now()
    const id = setInterval(() => {
      const h = ((performance.now() - began) / REPLAY_MS) * hours.length
      if (h >= hours.length) {
        setReplay(null)
        setWater(0)
        return
      }
      setReplay((r) => r && { ...r, h })
      setWater((0.6 * rain3h(hours, h)) / peak)
    }, 100)
    return () => clearInterval(id)
  }, [replay?.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Saved trips: status from live hazards; a notification when new danger
  // lands on one while the app is in the background.
  const liveHazards = useMemo(() => buildHazards(reports, activeAlerts, true), [reports, activeAlerts])
  const tripStatus = (trip) => {
    const prof = profile(trip.coords, liveHazards, 0, MODES[trip.mode].avoidCm, [trip.start, trip.end])
    if (prof.hard) return { tone: 'danger', text: t('trip.wire'), keys: [prof.hard.id] }
    const keys = prof.spots.map((s) => s.id).filter(Boolean)
    if (prof.spots.some((s) => s.kind === 'water')) return { tone: 'danger', text: t('trip.water'), keys }
    const n = prof.spots.filter((s) => s.kind === 'report').length
    if (n) return { tone: 'warn', text: t('trip.reports', n), keys }
    if (rain?.level === 'Orange' || rain?.level === 'Red') return { tone: 'warn', text: t('trip.rain'), keys }
    return { tone: 'ok', text: t('trip.clear'), keys }
  }
  const notified = useRef(null)
  useEffect(() => {
    const seen = notified.current
    const now = new Set()
    for (const trip of trips) {
      const st = tripStatus(trip)
      for (const k of st.keys) {
        now.add(`${trip.id}:${k}`)
        if (seen && !seen.has(`${trip.id}:${k}`) && document.hidden && window.Notification?.permission === 'granted') {
          new Notification('Jaldrishti', { body: `${trip.name}: ${st.text}`, tag: `${trip.id}:${k}` })
        }
      }
    }
    notified.current = now
  }, [liveHazards, trips]) // eslint-disable-line react-hooks/exhaustive-deps
  const saveTrip = (name) => {
    if (!route || !start || !end) return
    const next = [{ id: crypto.randomUUID(), name, start, end, mode, coords: thin(route.safe.coords) }, ...trips].slice(0, 5)
    setTrips(next)
    saveTrips(next)
    if (window.Notification?.permission === 'default') Notification.requestPermission()
  }

  const useGps = async (setter) => {
    setMsg('')
    try {
      setNamed(setter, await locate())
    } catch (e) {
      setMsg(e.message)
    }
  }

  const goTab = (id) => {
    setTab(id)
    setReporting(false)
    setPick(null)
  }

  const focus = (p, zoom = 15) => map?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), zoom), padding: viewPadding(), duration: 900 })
  const hourCount = history.filter((h) => Date.now() - Date.parse(h.created_at) < 3600e3).length
  const [, setLangTick] = useState(0)

  let panel
  if (reporting) {
    panel = (
      <ReportForm
        pin={pin}
        onPick={() => setPick('pin')}
        onGps={() => useGps(setPin)}
        onCancel={() => {
          setReporting(false)
          setPin(null)
          setPick(null)
        }}
        onDone={(saved) => {
          setReporting(false)
          setPin(null)
          if (saved) {
            setReports((rows) => [saved, ...rows.filter((x) => x.id !== saved.id)])
            focus(saved, 16)
            setTimeout(() => showReport(saved), 950)
          }
          refresh()
        }}
        onError={setMsg}
      />
    )
  } else if (tab === 'route') {
    panel = (
      <RoutePanel
        start={start}
        end={end}
        mode={mode}
        onMode={setMode}
        route={route}
        busy={routeBusy}
        onPick={setPick}
        onGps={(which) => useGps(which === 'start' ? setStart : setEnd)}
        onClear={() => {
          if (driveRef.current) stopDrive()
          setStart(null)
          setEnd(null)
        }}
        onDrive={startDrive}
        driving={Boolean(driveInfo)}
        simMode={sim}
        trips={trips}
        tripStatus={tripStatus}
        onTrip={(trip) => {
          setStart(trip.start)
          setEnd(trip.end)
          setMode(trip.mode)
        }}
        onRemoveTrip={(id) => {
          const next = trips.filter((x) => x.id !== id)
          setTrips(next)
          saveTrips(next)
        }}
        onSave={saveTrip}
      />
    )
  } else if (tab === 'activity') {
    panel = (
      <ActivityPanel
        history={history}
        alerts={shownAlerts}
        rainEvent={rainEvent}
        activeIds={new Set(reports.map((r) => r.id))}
        zones={zones}
        onSelect={(h) => {
          if (isNarrow()) setTab('map')
          focus(h)
          if (h.severity && !h.kind) showReport(h)
        }}
        onSelectZone={(z) => {
          if (isNarrow()) setTab('map')
          focus(z, 14.5)
          openPopup([z.lng, z.lat], zoneCard(z, z.count))
        }}
      />
    )
  } else {
    panel = (
      <MapPanel
        rain={rain}
        activeCount={reports.length}
        hourCount={hourCount}
        live={live}
        onReport={() => {
          setReporting(true)
          setPick('pin')
        }}
        showZones={showZones}
        onZones={setShowZones}
        water={water}
        playing={playing}
        ready={Boolean(dem)}
        onWater={(v) => {
          waterTouched.current = true
          setPlaying(false)
          setReplay(null)
          setWater(v)
        }}
        onPlay={() => {
          waterTouched.current = true
          setReplay(null)
          if (sim || !map) return setPlaying((p) => !p)
          // First switch to the realistic view, then let the water rise once the camera has settled.
          setPlaying(false)
          setWater(0)
          enterSim()
          setTimeout(() => setPlaying(true), 2200)
        }}
        sim={sim}
        heat={heat}
        onHeat={setHeat}
        onExitSim={exitSim}
        onEnterSim={enterSim}
        is3D={is3D}
        on3D={(on) => {
          setIs3D(on)
          if (map) set3D(map, on)
        }}
        onLang={(l) => {
          setLang(l)
          if (map) setMapLang(map, l)
          setLangTick((x) => x + 1)
        }}
      />
    )
  }

  const replayDate = replay
    ? new Date(Date.parse(replay.data.start) + replay.h * 3600e3).toLocaleString(getLang() === 'kn' ? 'kn-IN' : 'en-IN', { day: 'numeric', month: 'short', hour: 'numeric' })
    : null

  return (
    <div className={`app${driveInfo ? ' driving' : ''}`}>
      <nav className="rail" aria-label="Sections">
        <img className="logo" src="/logo.png" alt="Jaldrishti" />
        {TABS.map((tb) => (
          <button
            type="button"
            key={tb.id}
            className={`tab${tab === tb.id && !reporting ? ' on' : ''}`}
            aria-current={tab === tb.id ? 'page' : undefined}
            onClick={() => goTab(tb.id)}
          >
            <tb.icon size={20} strokeWidth={1.75} />
            <span>{t(`tab.${tb.id}`)}</span>
          </button>
        ))}
      </nav>

      <section className="panel">
        <div key={reporting ? 'report' : tab} className="panel-in">
          {panel}
        </div>
      </section>

      <main className="map-wrap">
        <div ref={boxRef} className="map" />
        {sim && <DemoMenu driving={Boolean(driveInfo)} onReplay={startReplay} onRaise={raiseWater} onWater={() => startPlacing('water')} onPlace={() => startPlacing('wire')} onClear={() => clearDemoAlerts(alerts).catch((e) => setMsg(e.message))} />}
        <div className="map-top">
          {[alarm, banner].map(
            (b, i) =>
              b && (
                <div key={i} className={`alert-bar ${b.tone}`} role="alert">
                  {b.tone === 'danger' && <Zap size={16} />}
                  <span>{b.text}</span>
                  <button type="button" className="icon-btn" aria-label={t('dismiss')} onClick={() => (i ? setBanner(null) : setAlarm(null))}>
                    <X size={16} />
                  </button>
                </div>
              ),
          )}
          {replay && (
            <div className="map-banner" role="status">
              <span>{t('rp.at', { date: replayDate, mm: Math.round(rain3h(replay.data.hours, replay.h)) })}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setReplay(null), setWater(0))}>
                {t('rp.stop')}
              </button>
            </div>
          )}
          {placing && (
            <div className={`map-banner${placeErr ? ' shake' : ''}`} role="status">
              <span>{placing === 'water' ? t('place.tapWater') : placeErr ? t('place.dry') : t('place.tap')}</span>
              <button type="button" className="icon-btn" aria-label={t('cancel')} onClick={() => setPlacing(false)}>
                <X size={16} />
              </button>
            </div>
          )}
          {pick && (
            <div className="map-banner" role="status">
              <span>{t(`pick.${pick}`)}</span>
              <button type="button" className="icon-btn" aria-label={t('cancel')} onClick={() => setPick(null)}>
                <X size={16} />
              </button>
            </div>
          )}
          {msg && (
            <div className="toast" role="alert">
              <span>{msg}</span>
              <button type="button" className="icon-btn" aria-label={t('dismiss')} onClick={() => setMsg('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {note && !msg && (
            <div className="toast note" role="status">
              <span>{note}</span>
            </div>
          )}
        </div>
        {driveInfo && (
          <DriveHud
            info={driveInfo}
            mode={mode}
            speed={speed}
            paused={paused}
            gps={driveInfo.gps}
            onSpeed={(x) => {
              setSpeed(x)
              driveRef.current?.setSpeed(x)
            }}
            onPause={() => {
              setPaused((p) => !p)
              driveRef.current?.setPaused(!paused)
            }}
            onStop={stopDrive}
            rerouting={rerouting}
            onReroute={() => reroute({ kind: 'manual' }, true)}
            onWait={gateWait}
            onGo={gateGo}
            voice={voice}
            onVoice={() => {
              voiceRef.current = !voice
              if (voice) window.speechSynthesis?.cancel()
              setVoice(!voice)
            }}
          />
        )}
      </main>
    </div>
  )
}
