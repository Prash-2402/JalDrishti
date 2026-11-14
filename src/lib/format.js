const span = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 && h < 6 ? `${h} h ${m % 60} min` : `${h} h`
  return `${Math.floor(h / 24)} d`
}

export const ago = (ts) => {
  const s = span(Date.now() - new Date(ts))
  return s === 'just now' ? s : `${s} ago`
}

export const until = (ts) => span(new Date(ts) - Date.now())

export const coords = (p) => `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`
