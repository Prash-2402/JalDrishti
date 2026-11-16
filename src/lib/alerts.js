// Sensors and alerts. An alert is water rising or electricity in the water
// (from a sensor or the demo menu), or a logged vote. Alerts reach every open
// app in real time.
//
// Live mode with migration 003: alerts are rows in the database, written only
// by database functions (simulate_reading, simulate_alert, clear_alert).
// Live mode without it: alerts travel between devices on a realtime channel.
// Demo mode (no keys): alerts stay in this browser.
import { live, sb } from './store.js'

// Placeholder sensor sites at known flood spots, approximate coordinates.
// The same list is created in the database by migration 003.
export const SENSORS = [
  { id: 's-bellandur', name: 'Bellandur, Outer Ring Road', lat: 12.9279, lng: 77.681 },
  { id: 's-sarjapur', name: 'Rainbow Drive, Sarjapur Road', lat: 12.908, lng: 77.687 },
  { id: 's-kadubeesanahalli', name: 'Kadubeesanahalli, Outer Ring Road', lat: 12.9395, lng: 77.6955 },
  { id: 's-munnekolala', name: 'Munnekolala, Marathahalli', lat: 12.955, lng: 77.701 },
  { id: 's-koramangala', name: 'Koramangala 4th Block', lat: 12.934, lng: 77.63 },
  { id: 's-silkboard', name: 'Silk Board Junction', lat: 12.9177, lng: 77.6233 },
]

const DEMO_MINUTES = 30 // demo alerts clear themselves after this
const listeners = new Set()
let noTable = !live // true when alerts cannot be stored in the database
let local = [] // alerts that are not in the database
let channel = null

const emit = () => listeners.forEach((fn) => fn())
function keep(a) {
  local = [a, ...local.filter((x) => x.id !== a.id)].slice(0, 200)
  emit()
}

// Alerts from the last `hours`, newest first, including cleared ones.
export async function listAlerts(hours = 168) {
  if (!noTable) {
    const { data, error } = await sb.rpc('alert_history', { hours })
    if (!error) return data
    if (error.code !== 'PGRST202') throw error
    noTable = true // migration 003 not run yet
  }
  return local
}

async function rpc(name, args) {
  if (noTable) return false
  const { error } = await sb.rpc(name, args)
  if (!error) return true
  if (error.code !== 'PGRST202') throw error
  noTable = true
  return false
}

// Demo trigger: water rising (cm) or electricity in the water at a point.
// A sensor alert goes through the same path a real sensor reading would.
export async function sendAlert({ kind, lat, lng, cm = 0, place, sensorId = null }) {
  const stored = sensorId
    ? await rpc('simulate_reading', { sensor: sensorId, water_cm: kind === 'wire' ? 40 : cm, volts: kind === 'wire' ? 230 : 0 })
    : await rpc('simulate_alert', { kind, lat, lng, cm, place })
  if (stored) return
  const now = Date.now()
  const a = {
    id: crypto.randomUUID(),
    kind,
    lat,
    lng,
    cm,
    place,
    sensor_id: sensorId,
    is_simulated: true,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + DEMO_MINUTES * 60000).toISOString(),
    cleared_at: null,
  }
  keep(a)
  channel?.send({ type: 'broadcast', event: 'alert', payload: a })
}

export async function clearAlert(a) {
  if (await rpc('clear_alert', { alert_id: a.id })) return
  const done = { ...a, cleared_at: new Date().toISOString() }
  keep(done)
  channel?.send({ type: 'broadcast', event: 'alert', payload: done })
}

export async function clearDemoAlerts(alerts) {
  if (await rpc('clear_demo_alerts', {})) return
  for (const a of alerts) if (a.is_simulated && !a.cleared_at) await clearAlert(a)
}

// Calls fn whenever alerts change, on any device. Returns an unsubscribe.
export function subscribeAlerts(fn) {
  listeners.add(fn)
  let table = null
  if (live) {
    channel ??= sb
      .channel('jaldrishti-alerts', { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'alert' }, ({ payload }) => keep(payload))
      .subscribe()
    // Separate channel: if the alerts table does not exist yet, only this one fails.
    table = sb
      .channel('alerts-table')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, emit)
      .subscribe()
  }
  return () => {
    listeners.delete(fn)
    if (table) sb.removeChannel(table)
  }
}
