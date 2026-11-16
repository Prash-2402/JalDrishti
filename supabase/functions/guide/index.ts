// Spoken route summary from Grok (xAI). Called by the app when a drive starts.
// The xAI key is a Supabase secret, so it is never sent to the browser.
//
// Set up (once):
//   1. Supabase dashboard → Edge Functions → Secrets: add XAI_API_KEY (and optionally XAI_MODEL)
//   2. Deploy: supabase functions deploy guide   (or paste this file in Dashboard → Edge Functions → New function "guide")
//   3. In .env (and Vercel's environment variables): VITE_GROK_GUIDE=on
const KEY = Deno.env.get('XAI_API_KEY')
const MODEL = Deno.env.get('XAI_MODEL') ?? 'grok-3-mini'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!KEY) return Response.json({ error: 'XAI_API_KEY is not set' }, { status: 503, headers: CORS })
  const facts = await req.json().catch(() => null)
  if (!facts) return Response.json({ error: 'Send the route facts as JSON' }, { status: 400, headers: CORS })

  const language = facts.lang === 'kn' ? 'Kannada' : 'English'
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 120,
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
  if (!res.ok) return Response.json({ error: `xAI ${res.status}` }, { status: 502, headers: CORS })
  const text = (await res.json()).choices?.[0]?.message?.content?.trim() ?? ''
  return Response.json({ text }, { headers: CORS })
})
