// Report storage. Uses Supabase when keys are set, otherwise this browser's
// localStorage (demo mode) so the app works before any backend exists.
import { createClient } from '@supabase/supabase-js'
import { t } from './i18n.js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const live = Boolean(url && key)
export const sb = live ? createClient(url, key) : null

// Hours a report stays on the map, by severity. A "still flooded" vote resets it.
export const TTL_HOURS = { 1: 2, 2: 4, 3: 6 }
const ttlMs = (severity) => TTL_HOURS[severity] * 3600 * 1000

const LS_KEY = 'jaldrishti.reports'
const listeners = new Set()
const readLocal = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || []
  } catch {
    return []
  }
}
const writeLocal = (rows) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rows))
  } catch {
    // storage full or blocked: keep working in memory for this render
  }
  listeners.forEach((fn) => fn())
}
const active = (r) => new Date(r.expires_at) > new Date()
const KEEP_MS = 30 * 24 * 3600 * 1000 // demo mode keeps 30 days of history
const recent = (r) => Date.now() - new Date(r.created_at) < KEEP_MS

export async function listReports() {
  if (live) {
    const { data, error } = await sb
      .from('reports')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  }
  return readLocal().filter(active)
}

export async function addReport({ lat, lng, severity, note, place, observedAt, photoDataUrl }) {
  const observed = new Date(observedAt)
  const row = {
    lat,
    lng,
    severity,
    note: note || null,
    place: place || null,
    observed_at: observed.toISOString(),
    expires_at: new Date(observed.getTime() + ttlMs(severity)).toISOString(),
    photo_url: null,
  }
  if (live) {
    if (photoDataUrl) {
      const blob = await (await fetch(photoDataUrl)).blob()
      const path = `${crypto.randomUUID()}.jpg`
      const up = await sb.storage.from('report-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      row.photo_url = sb.storage.from('report-photos').getPublicUrl(path).data.publicUrl
    }
    let { error } = await sb.from('reports').insert(row)
    // Older databases have no "place" column yet: save without it.
    if (error?.code === 'PGRST204') ({ error } = await sb.from('reports').insert({ ...row, place: undefined }))
    if (error) throw error
    return
  }
  writeLocal([
    {
      ...row,
      id: crypto.randomUUID(),
      photo_url: photoDataUrl || null,
      created_at: new Date().toISOString(),
      confirmations: 0,
    },
    ...readLocal().filter(recent),
  ])
}

// Every report (active or not) from the last `hours`, newest first, without
// photos or notes. Falls back to active reports if the database has no
// report_history function yet.
export async function listHistory(hours = 720) {
  if (live) {
    const { data, error } = await sb.rpc('report_history', { hours })
    if (!error) return data
    if (error.code === 'PGRST202') return listReports()
    throw error
  }
  const since = Date.now() - hours * 3600 * 1000
  return readLocal()
    .filter((r) => new Date(r.created_at) > since)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

// vote: 'still' extends the report, 'cleared' expires it now.
export async function voteReport(id, vote) {
  if (live) {
    const { error } = await sb.rpc(vote === 'still' ? 'confirm_report' : 'clear_report', { report_id: id })
    if (error) throw error
    return
  }
  const now = Date.now()
  writeLocal(
    readLocal().map((r) => {
      if (r.id !== id) return r
      return vote === 'still'
        ? { ...r, confirmations: r.confirmations + 1, expires_at: new Date(now + ttlMs(r.severity)).toISOString() }
        : { ...r, expires_at: new Date(now).toISOString() }
    }),
  )
}

// Calls fn whenever reports change. Returns an unsubscribe function.
export function subscribe(fn) {
  if (live) {
    const channel = sb
      .channel('reports-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, fn)
      .subscribe()
    return () => sb.removeChannel(channel)
  }
  listeners.add(fn)
  const onStorage = (e) => e.key === LS_KEY && fn()
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

// Downscale a photo in the browser so uploads stay small on mobile data.
export function shrinkPhoto(file, maxSide = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => reject(new Error(t('err.photo')))
    img.src = URL.createObjectURL(file)
  })
}

// Saved trips live on this device only, so no sign-in is needed.
const TRIPS_KEY = 'jaldrishti.trips'
export function loadTrips() {
  try {
    return JSON.parse(localStorage.getItem(TRIPS_KEY)) || []
  } catch {
    return []
  }
}
export function saveTrips(trips) {
  try {
    localStorage.setItem(TRIPS_KEY, JSON.stringify(trips))
  } catch {
    // storage full or blocked: kept for this visit only
  }
}
