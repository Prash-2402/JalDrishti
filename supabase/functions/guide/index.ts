// Spoken route summary from a model on Groq. Called by the app when a drive starts.
// The Groq key is a Supabase secret (GROQ_API_KEY), so it is never sent to the browser.
// GROQ_MODEL is optional; if that model is retired, the first available one from
// PREFERRED is used instead, so the summary keeps working.
const KEY = Deno.env.get('GROQ_API_KEY')
const PREFERRED = [Deno.env.get('GROQ_MODEL'), 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct', 'openai/gpt-oss-20b'].filter(Boolean)
const API = 'https://api.groq.com/openai/v1'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
let model = PREFERRED[0]

async function pickModel() {
  const res = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${KEY}` } })
  if (!res.ok) return null
  const ids = (await res.json()).data?.map((m) => m.id) ?? []
  return PREFERRED.find((id) => ids.includes(id)) ?? ids.find((id) => !/whisper|tts|guard|embed/i.test(id)) ?? null
}

function ask(facts) {
  const language = facts.lang === 'kn' ? 'Kannada' : 'English'
  return fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content:
            `You are a calm navigation voice for flood-hit Bengaluru roads. In ${language}, in at most two short sentences ` +
            '(under 40 words), summarise the drive: distance and time, the first one or two turns with road names, and any water ' +
            '(depth in cm) or electrical danger. Water depths are simulated or reported, never certain. No emojis, no lists.',
        },
        { role: 'user', content: JSON.stringify(facts).slice(0, 2000) },
      ],
    }),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!KEY) return Response.json({ error: 'GROQ_API_KEY is not set' }, { status: 503, headers: CORS })
  const facts = await req.json().catch(() => null)
  if (!facts) return Response.json({ error: 'Send the route facts as JSON' }, { status: 400, headers: CORS })

  let res = await ask(facts)
  if (res.status === 404 || res.status === 400) {
    const next = await pickModel() // the model was retired: switch to one that exists
    if (next && next !== model) {
      model = next
      res = await ask(facts)
    }
  }
  if (!res.ok) return Response.json({ error: `Groq ${res.status}`, model }, { status: 502, headers: CORS })
  const text = (await res.json()).choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim() ?? ''
  return Response.json({ text, model }, { headers: CORS })
})
