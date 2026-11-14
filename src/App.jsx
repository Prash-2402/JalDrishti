import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { Droplet, History, Map as MapIcon, Route as RouteIcon, X } from 'lucide-react'
import ActivityPanel from './components/ActivityPanel.jsx'
import MapPanel from './components/MapPanel.jsx'
import ReportForm from './components/ReportForm.jsx'
import RoutePanel from './components/RoutePanel.jsx'
import { floodZones } from './data/floodZones.js'
import { reportCard, zoneCard } from './lib/cards.js'
import { distM } from './lib/geo.js'
import { reverseGeocode } from './lib/places.js'
import { findRoute } from './lib/routing.js'
import {
  createScene, drawRoute, isNarrow, RAIN_WATER, sampleElevation, set3D, setAvoidZones, setSimulationView, setLowland, setZonesVisible, viewPadding,
} from './lib/scene.js'
import { MODES, SEVERITY } from './lib/severity.js'
import { listHistory, listReports, live, subscribe, voteReport } from './lib/store.js'
import { getRainAlert } from './lib/weather.js'

const TABS = [
  { id: 'map', label: 'Map', icon: MapIcon },
  { id: 'route', label: 'Route', icon: RouteIcon },
  { id: 'activity', label: 'Activity', icon: History },
]
const PICK_LABEL = { pin: 'where the water is', start: 'your starting point', end: 'your destination' }
const SPOT_RADIUS = 200 // metres: reports this close count as the same spot

const near = (rows, p, radius) => rows.filter((h) => distM(h, p) <= radius).length

function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This device has no location access.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('Location permission denied. Choose on the map instead.')),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  })
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

export default function App() {
  const boxRef = useRef(null)
  const pickRef = useRef(null)
  const markersRef = useRef(new Map())
  const popupRef = useRef(null)
  const reportsRef = useRef([])
  const historyRef = useRef([])
  const waterTouched = useRef(false)

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
  const [reports, setReports] = useState([])
  const [history, setHistory] = useState([])
  const [rain, setRain] = useState(null)
  const [dem, setDem] = useState(null)
  const [water, setWater] = useState(0) // 0 to 1: share of the area's height range under water
  const [playing, setPlaying] = useState(false)
  const [showZones, setShowZones] = useState(true)
  const [is3D, setIs3D] = useState(false)
  const [sim, setSim] = useState(false) // realistic 3D simulation view
  const [msg, setMsg] = useState('')
  const [, setTick] = useState(0)

  const refresh = useCallback(() => {
    listReports()
      .then(setReports)
      .catch((e) => setMsg(e.message))
    listHistory(720)
      .then(setHistory)
      .catch(() => {})
    setTick((t) => t + 1)
  }, [])

  // Sets a point, then fills in its street name when the lookup returns.
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
      const which = pickRef.current
      if (!which) return
      const p = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      setNamed({ pin: setPin, start: setStart, end: setEnd }[which], p)
      setPick(null)
    })
    const markers = markersRef.current
    return () => {
      markers.clear()
      setMap(null)
      m.remove()
    }
  }, [setNamed])

  useEffect(() => {
    pickRef.current = pick
    if (map) map.getCanvas().style.cursor = pick ? 'crosshair' : ''
  }, [pick, map])

  useEffect(() => {
    refresh()
    const unsubscribe = subscribe(refresh)
    const timer = setInterval(refresh, 30000) // drops expired reports
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [refresh])

  useEffect(() => {
    getRainAlert().then(setRain).catch(() => {})
    sampleElevation().then(setDem)
  }, [])

  // On heavy-rain days, start with some water showing until the user changes it.
  useEffect(() => {
    if (rain && !waterTouched.current) setWater(RAIN_WATER[rain.level] ?? 0)
  }, [rain])

  useEffect(() => {
    if (map && dem) setLowland(map, dem.base, water * dem.span)
  }, [map, dem, water])

  // "Simulate" raises the water steadily over 8 seconds.
  useEffect(() => {
    if (!playing) return
    const from = water >= 0.6 ? 0 : water
    const started = performance.now()
    let frame
    const step = (now) => {
      const t = Math.min(1, (now - started) / 8000)
      setWater(from + (0.6 - from) * t)
      if (t < 1) frame = requestAnimationFrame(step)
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
        reportCard(current || r, {
          active: Boolean(current),
          nearbyCount: near(historyRef.current, r, SPOT_RADIUS),
          onVote: vote,
        }),
      )
    },
    [openPopup, vote],
  )

  const zones = useMemo(() => floodZones.map((z) => ({ ...z, count: near(history, z, z.radius + 150) })), [history])

  useEffect(() => {
    historyRef.current = history
  }, [history])

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

  // Report markers.
  useEffect(() => {
    reportsRef.current = reports
    if (!map) return
    const markers = markersRef.current
    const ids = new Set(reports.map((r) => r.id))
    for (const [id, marker] of markers) {
      if (!ids.has(id)) {
        marker.remove()
        markers.delete(id)
      }
    }
    for (const r of reports) {
      if (markers.has(r.id)) continue
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'report-dot'
      el.style.setProperty('--c', SEVERITY[r.severity].color)
      el.setAttribute('aria-label', `${SEVERITY[r.severity].label} report`)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        if (!pickRef.current) showReport(r)
      })
      markers.set(r.id, new maplibregl.Marker({ element: el }).setLngLat([r.lng, r.lat]).addTo(map))
    }
  }, [map, reports, showReport])

  usePointMarker(map, pin, 'pt-pin')
  usePointMarker(map, start, 'pt-start')
  usePointMarker(map, end, 'pt-end')

  // Routing: only reports that matter for the chosen vehicle are avoided.
  const relevant = useMemo(() => reports.filter((r) => r.severity >= MODES[mode].minSeverity), [reports, mode])
  const relevantKey = relevant.map((r) => r.id).sort().join(',')
  useEffect(() => {
    if (!start || !end) return setRoute(null)
    let stale = false
    setRouteBusy(true)
    findRoute(start, end, relevant)
      .then((r) => !stale && setRoute(r))
      .catch((e) => !stale && (setRoute(null), setMsg(e.message)))
      .finally(() => !stale && setRouteBusy(false))
    return () => {
      stale = true
    }
  }, [start?.lat, start?.lng, end?.lat, end?.lng, relevantKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map) return
    drawRoute(map, route)
    setAvoidZones(map, route ? relevant : [])
  }, [map, route]) // eslint-disable-line react-hooks/exhaustive-deps

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
        onDone={() => {
          setReporting(false)
          setPin(null)
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
          setStart(null)
          setEnd(null)
        }}
      />
    )
  } else if (tab === 'activity') {
    panel = (
      <ActivityPanel
        history={history}
        activeIds={new Set(reports.map((r) => r.id))}
        zones={zones}
        onSelect={(h) => {
          if (isNarrow()) setTab('map')
          focus(h)
          showReport(h)
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
          setWater(v)
        }}
        onPlay={() => {
          waterTouched.current = true
          if (sim || !map) return setPlaying((p) => !p)
          // First switch to the realistic view, then let the water rise once
          // the camera has settled.
          setSim(true)
          setPlaying(false)
          setWater(0)
          setSimulationView(map, true, is3D)
          setTimeout(() => setPlaying(true), 2200)
        }}
        sim={sim}
        onExitSim={() => {
          setPlaying(false)
          setSim(false)
          setWater(0)
          if (map) setSimulationView(map, false, is3D)
        }}
        is3D={is3D}
        on3D={(on) => {
          setIs3D(on)
          if (map) set3D(map, on)
        }}
      />
    )
  }

  return (
    <div className="app">
      <nav className="rail" aria-label="Sections">
        <span className="logo" aria-hidden="true">
          <Droplet size={20} />
        </span>
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`tab${tab === t.id && !reporting ? ' on' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => goTab(t.id)}
          >
            <t.icon size={20} strokeWidth={1.75} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <section className="panel">{panel}</section>

      <main className="map-wrap">
        <div ref={boxRef} className="map" />
        {pick && (
          <div className="map-banner" role="status">
            <span>Tap the map to choose {PICK_LABEL[pick]}</span>
            <button type="button" className="icon-btn" aria-label="Cancel" onClick={() => setPick(null)}>
              <X size={16} />
            </button>
          </div>
        )}
        {msg && (
          <div className="toast" role="alert">
            <span>{msg}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setMsg('')}>
              <X size={16} />
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
