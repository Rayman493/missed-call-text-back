// Server-only OpenAI summarization helper (no realtime)
// Keeps model name in one place; returns structured + readable summary.

export interface StructuredSummary {
  overview: string
  customerNeeds: string[]
  keyDiscussionPoints: string[]
  decisions: string[]
  pricingMentioned: string[]
  nextSteps: string[]
  followUpItems: string[]
}

export interface SummaryResult {
  summary: string
  structured: StructuredSummary
}

const MODEL = process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini'

export async function summarizeMeetingTranscript(transcript: string): Promise<SummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('openai_api_key_missing')

  const system = `You are a helpful assistant that summarizes business meetings for small service businesses.\n- Use ONLY facts from the provided transcript.\n- Do NOT invent pricing, commitments, or customer needs.\n- Be concise and practical.`

  const user = `Transcript:\n\n${transcript.slice(0, 60000)}`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Return JSON with the following exact shape:\n{\n  \"overview\": string,\n  \"customerNeeds\": string[],\n  \"keyDiscussionPoints\": string[],\n  \"decisions\": string[],\n  \"pricingMentioned\": string[],\n  \"nextSteps\": string[],\n  \"followUpItems\": string[]\n}\n\n${user}` }
      ]
    })
  })

  if (!response.ok) throw new Error('openai_summary_failed')
  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  let parsed: StructuredSummary | null = null
  try {
    parsed = JSON.parse(content)
  } catch {}

  if (!parsed) {
    // Fallback empty structure
    parsed = { overview: '', customerNeeds: [], keyDiscussionPoints: [], decisions: [], pricingMentioned: [], nextSteps: [], followUpItems: [] }
  }

  // Build readable summary from structured sections
  const lines: string[] = []
  if (parsed.overview) lines.push(parsed.overview)
  const sect = (title: string, items: string[]) => {
    if (!items || items.length === 0) return
    lines.push(`${title}:`)
    for (const it of items) lines.push(`- ${it}`)
  }
  sect('Customer Needs', parsed.customerNeeds)
  sect('Key Discussion Points', parsed.keyDiscussionPoints)
  sect('Decisions', parsed.decisions)
  sect('Pricing Mentioned', parsed.pricingMentioned)
  sect('Next Steps', parsed.nextSteps)
  sect('Follow-Up Items', parsed.followUpItems)

  return { summary: lines.join('\n'), structured: parsed }
}
