// Turns a point into a short street or area name, using OpenRouteService.
// Returns null when there is no key or the lookup fails; callers fall back
// to coordinates.
const KEY = import.meta.env.VITE_ORS_KEY

export async function reverseGeocode({ lat, lng }) {
  if (!KEY) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const res = await fetch(
      `https://api.openrouteservice.org/geocode/reverse?point.lon=${lng}&point.lat=${lat}` +
        '&size=1&layers=street,neighbourhood,locality',
      { headers: { Authorization: KEY }, signal: ctrl.signal },
    )
    if (!res.ok) return null
    const p = (await res.json()).features?.[0]?.properties
    if (!p?.name) return null
    const area = p.neighbourhood || p.locality
    return [p.name, area && area !== p.name ? area : null].filter(Boolean).join(', ').slice(0, 120)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
