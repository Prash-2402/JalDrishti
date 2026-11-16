// Route summary written by an AI model on Groq, spoken when a drive starts.
// The call goes through the `guide` Supabase function so the xAI key stays on
// the server and never reaches the browser. Off until VITE_GROQ_GUIDE=on;
// without it the app speaks its own short summary. Turn-by-turn directions
// come from OpenRouteService and work either way.
import { live, sb } from './store.js'

const ON = import.meta.env.VITE_GROQ_GUIDE === 'on'

export async function aiSummary(facts) {
  if (!ON || !live) return null
  try {
    const { data, error } = await sb.functions.invoke('guide', { body: facts })
    return error ? null : data?.text || null
  } catch {
    return null
  }
}
