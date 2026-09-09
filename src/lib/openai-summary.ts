// Server-only OpenAI summarization helper (no realtime)
// Keeps model name in one place; returns structured + readable summary.

export interface StructuredSummary {
  overview: string
  customerNeeds: string[]
  keyDiscussionPoints: string[]
  decisions: string[]
  followUpItems: string[]
}

export interface SummaryResult {
  summary: string
  structured: StructuredSummary
}

const MODEL = process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini'

const INSUFFICIENT_CONTENT_MESSAGE =
  'Not enough meeting content was captured to generate a detailed summary.'

/**
 * Pre-check: if the transcript is too short or nearly content-free,
 * return the fallback message without calling the LLM.
 */
function hasInsufficientContent(transcript: string): boolean {
  const trimmed = (transcript || '').trim()
  if (trimmed.length < 120) return true
  // Count meaningful words (length > 2 to skip "hi", "ok", etc.)
  const words = trimmed.split(/\s+/).filter((w) => w.replace(/[^A-Za-z0-9]/g, '').length > 2)
  if (words.length < 25) return true
  return false
}

function emptySummary(): StructuredSummary {
  return { overview: '', customerNeeds: [], keyDiscussionPoints: [], decisions: [], followUpItems: [] }
}

export async function summarizeMeetingTranscript(transcript: string): Promise<SummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('openai_api_key_missing')

  // Content-sufficiency pre-check: skip LLM for near-empty transcripts
  if (hasInsufficientContent(transcript)) {
    const structured: StructuredSummary = {
      ...emptySummary(),
      overview: INSUFFICIENT_CONTENT_MESSAGE,
    }
    return { summary: structured.overview, structured }
  }

  const system = `You are a helpful assistant that synthesizes concise office-assistant summaries of business meetings for small service businesses.

YOUR JOB
Synthesize a concise summary from the meeting transcript. Do NOT copy transcript sentences — rephrase and synthesize.

OUTPUT SECTIONS (all optional except overview)
- "overview": 1-3 concise sentences capturing what the meeting was about.
- "customerNeeds": Only when the customer/attendee explicitly requested or stated a need. Do not infer.
- "keyDiscussionPoints": 2-5 useful bullets summarizing actual discussion topics.
- "decisions": Only when real decisions or outcomes were reached.
- "followUpItems": Only when explicit next steps, commitments, or action items were agreed upon.

Return [] for any section that has no content — do not force empty sections.

CONTENT SUFFICIENCY
If the transcript is too short, mostly greetings/filler, or lacks meaningful business content, return:
{ "overview": "${INSUFFICIENT_CONTENT_MESSAGE}", "customerNeeds": [], "keyDiscussionPoints": [], "decisions": [], "followUpItems": [] }

SYNTHESIS RULES
- Synthesize rather than copy transcript sentences.
- Remove greetings, pleasantries, filler, and repetition.
- Consolidate repeated ideas into single bullets.
- Preserve concrete names, dates, times, amounts, locations, and decisions.
- Distinguish discussion (topics talked about) from decisions (outcomes agreed upon).
- Target 80-200 words total for ordinary meetings. Short meetings may be shorter.
- Each bullet should be a single concise sentence.

ANTI-HALLUCINATION
- Only include facts explicitly stated in the transcript.
- Do NOT invent: addresses, measurements, acreage, pricing, dates, names, commitments, next steps.
- If a detail is uncertain, omit it.
- Never "fill in missing information."

EXAMPLES VS REAL DISCUSSION
Distinguish between:
- Real customer discussion
- Examples, demonstrations, testing, hypothetical scenarios, sample data, fake addresses, training conversations

If the transcript indicates speakers are testing, demonstrating, using an example, pretending, simulating, or verifying functionality, those details must NOT become customer needs or follow-up items unless the transcript clearly transitions into a real customer discussion.

CUSTOMER NEEDS
Only include services or needs explicitly requested by the customer.
Do NOT infer: property size, urgency, budget, frequency, service scope unless directly stated.

FOLLOW-UP ITEMS
Only generate follow-up items when the transcript contains an explicit action, request, agreement, or commitment.
Examples: "Call customer tomorrow", "Send estimate", "Schedule service", "Email invoice".
Do NOT create follow-up items from: mentioned addresses, mentioned phone numbers, mentioned services, hypothetical examples, brainstorming, demonstrations, testing, discussion topics.

DECISIONS
Only include actual decisions or outcomes that were explicitly agreed upon during the meeting.
Do not infer decisions from discussion topics. If something was discussed but no conclusion was reached, it belongs in keyDiscussionPoints, not decisions.`

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
        { role: 'user', content: `Return JSON with the following exact shape:\n{\n  "overview": string,\n  "customerNeeds": string[],\n  "keyDiscussionPoints": string[],\n  "decisions": string[],\n  "followUpItems": string[]\n}\n\n${user}` }
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
    parsed = emptySummary()
  }

  // If the model returned the insufficient-content message, ensure arrays are empty
  if (parsed.overview === INSUFFICIENT_CONTENT_MESSAGE) {
    parsed.customerNeeds = []
    parsed.keyDiscussionPoints = []
    parsed.decisions = []
    parsed.followUpItems = []
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
  sect('Follow-Up', parsed.followUpItems)

  return { summary: lines.join('\n'), structured: parsed }
}
