// Rainfall forecast from Open-Meteo, turned into a four-level alert.
const LEVELS = [
  { max: 15, level: 'Green', color: '#2f9e44', en: 'No heavy rain expected', kn: 'ಸಾಮಾನ್ಯ ಸ್ಥಿತಿ' },
  { max: 35, level: 'Yellow', color: '#e0a100', en: 'Be alert in low-lying areas', kn: 'ಎಚ್ಚರಿಕೆಯಿಂದಿರಿ' },
  { max: 65, level: 'Orange', color: '#e8590c', en: 'Avoid underpasses and low-lying roads', kn: 'ತಗ್ಗು ಪ್ರದೇಶಗಳನ್ನು ತಪ್ಪಿಸಿ' },
  { max: Infinity, level: 'Red', color: '#c92a2a', en: 'Avoid non-essential travel', kn: 'ಅನಗತ್ಯ ಪ್ರಯಾಣ ಬೇಡ' },
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
