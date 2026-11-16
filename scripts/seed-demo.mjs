// Demo dataset from real rainfall.
//
//   node scripts/seed-demo.mjs --replay   writes src/data/sept2022.json (the in-app replay)
//   node scripts/seed-demo.mjs --seed     adds ~30 days of demo reports to Supabase
//
// Reports are generated, not real: they are placed at low-lying roads and
// known flood spots, more and deeper when it rained harder (hourly rainfall
// for Bellandur from the Open-Meteo archive). Seeded rows have is_demo = true;
// remove them with: delete from reports where is_demo;
// --seed needs migration 003 and the keys in .env.
import { readFileSync, writeFileSync } from 'node:fs'
import { floodZones } from '../src/data/floodZones.js'
import { lowRoads } from '../src/data/lowRoads.js'

const REPLAY = { from: '2022-08-28', to: '2022-09-10' } // the Aug–Sept 2022 Bellandur floods
const SEED = { from: '2022-08-14', to: '2022-09-12' } // 30 days, shifted to end today
const TTL = { 1: 2, 2: 4, 3: 6 } // hours a report stays active, as in the app

// Seeded random numbers, so the same rainfall always gives the same data.
let seed = 2022
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)

const spots = [
  ...lowRoads.map((r) => ({ ...r, v: r.cm / 90 })),
  ...floodZones.filter((z) => z.lat > 12.88 && z.lat < 12.97 && z.lng > 77.6 && z.lng < 77.76).map((z) => ({ ...z, v: 0.8 })),
]

async function rainfall({ from, to }) {
  const url =
    'https://archive-api.open-meteo.com/v1/archive?latitude=12.93&longitude=77.68' +
    `&start_date=${from}&end_date=${to}&hourly=precipitation&timezone=Asia%2FKolkata`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Rainfall archive: ${res.status}`)
  return (await res.json()).hourly.precipitation.map((x) => x || 0)
}

const rain3h = (hours, h) => hours.slice(Math.max(0, h - 2), h + 1).reduce((s, x) => s + x, 0)

// One report list for an hourly rainfall series: { h, lat, lng, severity, place, ttl }.
// The archive is a ~10 km average and smooths out local cloudbursts, so rain is
// judged against the period's own wettest 3 hours (scored 50) rather than in mm.
function generate(hours) {
  const out = []
  const busyUntil = new Map()
  const peak = Math.max(...hours.map((_, h) => rain3h(hours, h))) || 1
  hours.forEach((_, h) => {
    const intensity = (rain3h(hours, h) / peak) * 50
    for (const s of spots) {
      if ((busyUntil.get(s) ?? -1) > h) continue
      const score = intensity * s.v
      if (rand() >= Math.min(0.85, Math.max(0, (score - 6) / 30))) continue
      const severity = score < 15 ? 1 : score < 35 ? 2 : 3
      const at = h + rand()
      busyUntil.set(s, at + TTL[severity])
      out.push({
        h: Math.round(at * 100) / 100,
        lat: Math.round((s.lat + (rand() - 0.5) * 0.0016) * 1e5) / 1e5,
        lng: Math.round((s.lng + (rand() - 0.5) * 0.0016) * 1e5) / 1e5,
        severity,
        place: s.name,
        ttl: TTL[severity],
      })
    }
  })
  return out
}

function env() {
  const vars = {}
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return vars
}

async function seedDatabase() {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = env()
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env first')
  const hours = await rainfall(SEED)
  const startMs = Date.now() - hours.length * 3600e3
  const rows = generate(hours).map((r) => {
    const observed = startMs + r.h * 3600e3
    const life = rand() < 0.25 ? rand() * r.ttl : r.ttl // a quarter are marked cleared early
    return {
      lat: r.lat,
      lng: r.lng,
      severity: r.severity,
      place: r.place,
      observed_at: new Date(observed).toISOString(),
      created_at: new Date(observed + rand() * 600e3).toISOString(),
      expires_at: new Date(observed + life * 3600e3).toISOString(),
      is_demo: true,
    }
  })
  for (let i = 0; i < rows.length; i += 200) {
    const res = await fetch(`${url}/rest/v1/reports`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 200)),
    })
    if (!res.ok) throw new Error(`Insert failed (${res.status}): ${await res.text()}. Has migration 003 been run?`)
  }
  console.log(`Added ${rows.length} demo reports over the last ${Math.round(hours.length / 24)} days.`)
}

async function writeReplay() {
  const hours = await rainfall(REPLAY)
  const data = { start: `${REPLAY.from}T00:00:00+05:30`, hours, reports: generate(hours) }
  writeFileSync(new URL('../src/data/sept2022.json', import.meta.url), JSON.stringify(data))
  console.log(`Replay: ${hours.length} hours, ${data.reports.length} reports, ${Math.round(hours.reduce((s, x) => s + x, 0))} mm of rain.`)
}

const args = process.argv.slice(2)
if (!args.length) console.log('Use --replay, --seed, or both.')
if (args.includes('--replay')) await writeReplay()
if (args.includes('--seed')) await seedDatabase()
