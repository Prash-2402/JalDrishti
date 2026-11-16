// Where real sensors send readings. Each sensor posts JSON:
//   { "sensor_id": "s-bellandur", "key": "<device key>", "water_cm": 42, "volts": 0 }
// The key is checked against sensors.device_key_hash (sha256, hex), then the
// reading is stored; the database trigger turns high readings into alerts.
//
// Deploy: supabase functions deploy ingest --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function sha256(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })
  const { sensor_id, key, water_cm = null, volts = null } = await req.json().catch(() => ({}))
  if (!sensor_id || !key) return new Response('sensor_id and key required', { status: 400 })

  const { data: sensor } = await db.from('sensors').select('device_key_hash').eq('id', sensor_id).single()
  if (!sensor?.device_key_hash || sensor.device_key_hash !== (await sha256(key))) return new Response('Unknown sensor or key', { status: 403 })

  const { error } = await db.from('sensor_readings').insert({ sensor_id, water_cm, volts })
  if (error) return new Response(error.message, { status: 400 })
  return new Response('ok')
})
