// Rainfall forecast from Open-Meteo, turned into a four-level alert.
const LEVELS = [
  { max: 15, level: 'Green' },
  { max: 35, level: 'Yellow' },
  { max: 65, level: 'Orange' },
  { max: Infinity, level: 'Red' },
]

export async function getRainAlert(lat = 12.9716, lng = 77.5946) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      '&hourly=precipitation&forecast_days=2&timezone=UTC',
  )
  if (!res.ok) throw new Error('Rain forecast unavailable')
  const { hourly } = await res.json()
  const now = Date.now()
  let mm = 0
  hourly.time.forEach((t, i) => {
    const ts = Date.parse(t + 'Z')
    if (ts >= now - 3600e3 && ts < now + 24 * 3600e3) mm += hourly.precipitation[i] || 0
  })
  return { mm: Math.round(mm * 10) / 10, ...LEVELS.find((l) => mm < l.max) }
}
