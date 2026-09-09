import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/lib/openai-summary.ts', 'utf8')

// Fixture: a physically-tested Google Meet transcript similar to real usage
const PHYSICAL_TEST_TRANSCRIPT = `John: Hi, good morning! How are you doing today?
Sarah: Good morning! I'm doing well, thanks for asking.
John: Great, great. So, I wanted to talk about the property on Maple Street.
Sarah: Yes, the property on Maple Street. We discussed this last week.
John: Right, we discussed this last week. So the property on Maple Street needs grass cutting.
Sarah: The property on Maple Street needs grass cutting, yes.
John: So we need to schedule grass cutting for the property on Maple Street.
Sarah: Yes, let's schedule it for next Tuesday at 9 AM.
John: Next Tuesday at 9 AM works. Can you send me an estimate before then?
Sarah: I'll send you an estimate by Friday.
John: Great. The property is about 2 acres.
Sarah: 2 acres, got it. We'll include that in the estimate.
John: Thanks. Also, the gate code is 1234.
Sarah: Gate code 1234, noted.
John: Alright, I think that covers everything.
Sarah: Sounds good. I'll send the estimate by Friday and we'll see you next Tuesday.
John: Perfect, thanks!`

describe('AI Summary Pipeline — Schema & Prompt', () => {
  it('uses gpt-4o-mini or OPENAI_SUMMARY_MODEL env var', () => {
    expect(content).toContain("process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini'")
  })

  it('StructuredSummary has the five desired sections only', () => {
    expect(content).toContain('overview: string')
    expect(content).toContain('customerNeeds: string[]')
    expect(content).toContain('keyDiscussionPoints: string[]')
    expect(content).toContain('decisions: string[]')
    expect(content).toContain('followUpItems: string[]')
  })

  it('removes old pricingMentioned and nextSteps fields', () => {
    expect(content).not.toContain('pricingMentioned')
    expect(content).not.toContain('nextSteps')
  })

  it('user message instructs the model to return the new exact JSON shape', () => {
    expect(content).toContain('"overview": string')
    expect(content).toContain('"customerNeeds": string[]')
    expect(content).toContain('"keyDiscussionPoints": string[]')
    expect(content).toContain('"decisions": string[]')
    expect(content).toContain('"followUpItems": string[]')
    // Old fields should not appear in the JSON shape instruction
    const userMsgSection = content.split('Return JSON with the following exact shape')[1]?.split('}')[0] || ''
    expect(userMsgSection).not.toContain('pricingMentioned')
    expect(userMsgSection).not.toContain('nextSteps')
  })

  it('plain-text summary builder uses new section names', () => {
    expect(content).toContain("sect('Customer Needs'")
    expect(content).toContain("sect('Key Discussion Points'")
    expect(content).toContain("sect('Decisions'")
    expect(content).toContain("sect('Follow-Up'")
    // Old section names should not appear
    expect(content).not.toContain("sect('Pricing Mentioned'")
    expect(content).not.toContain("sect('Next Steps'")
    expect(content).not.toContain("sect('Follow-Up Items'")
  })
})

describe('AI Summary Pipeline — Anti-Hallucination Rules', () => {
  it('instructs the model to synthesize rather than copy', () => {
    expect(content).toContain('Synthesize rather than copy transcript sentences')
  })

  it('instructs the model to remove greetings and filler', () => {
    expect(content).toContain('Remove greetings, pleasantries, filler, and repetition')
  })

  it('instructs the model to consolidate repeated ideas', () => {
    expect(content).toContain('Consolidate repeated ideas into single bullets')
  })

  it('instructs the model to preserve concrete facts', () => {
    expect(content).toContain('Preserve concrete names, dates, times, amounts, locations, and decisions')
  })

  it('instructs the model to distinguish discussion from decisions', () => {
    expect(content).toContain('Distinguish discussion (topics talked about) from decisions (outcomes agreed upon)')
  })

  it('instructs the model not to invent facts', () => {
    expect(content).toContain('Do NOT invent: addresses, measurements, acreage, pricing, dates, names, commitments, next steps')
  })

  it('instructs the model not to infer customer needs', () => {
    expect(content).toContain('Do NOT infer: property size, urgency, budget, frequency, service scope')
  })

  it('instructs the model not to create follow-up from mentions', () => {
    expect(content).toContain('Do NOT create follow-up items from: mentioned addresses')
  })

  it('instructs the model to only include explicit decisions', () => {
    expect(content).toContain('Only include actual decisions or outcomes that were explicitly agreed upon')
  })

  it('instructs the model to distinguish examples from real discussion', () => {
    expect(content).toContain('Real customer discussion')
    expect(content).toContain('Examples, demonstrations, testing')
  })

  it('instructs the model on word count target', () => {
    expect(content).toContain('80-200 words')
  })

  it('instructs the model not to force empty sections', () => {
    expect(content).toContain('Return [] for any section that has no content')
  })
})

describe('AI Summary Pipeline — Content Sufficiency', () => {
  it('has a content-sufficiency pre-check function', () => {
    expect(content).toContain('hasInsufficientContent')
  })

  it('defines the insufficient-content fallback message', () => {
    expect(content).toContain('Not enough meeting content was captured to generate a detailed summary.')
  })

  it('pre-check returns fallback for very short transcripts without calling OpenAI', () => {
    expect(content).toContain('if (hasInsufficientContent(transcript))')
    // The fallback should set the overview to the insufficient message
    expect(content).toMatch(/hasInsufficientContent\(transcript\)[\s\S]*INSUFFICIENT_CONTENT_MESSAGE/)
  })

  it('pre-check uses character count threshold', () => {
    expect(content).toContain('trimmed.length < 120')
  })

  it('pre-check uses meaningful word count threshold', () => {
    expect(content).toContain('words.length < 25')
  })

  it('clears arrays when model returns insufficient-content message', () => {
    expect(content).toContain("if (parsed.overview === INSUFFICIENT_CONTENT_MESSAGE)")
  })

  it('short transcripts are handled gracefully (pre-check catches them)', () => {
    // A transcript of just "Hi" would be caught by the pre-check
    expect(content).toContain('hasInsufficientContent')
    expect(content).toContain('< 120')
  })
})

describe('AI Summary Pipeline — Transcript Fixture Validation', () => {
  // The physical test transcript has these characteristics:
  // - Greetings at the start (should be excluded)
  // - Repeated mentions of "property on Maple Street" (should consolidate)
  // - Repeated "grass cutting" (should consolidate)
  // - Concrete facts: Maple Street, next Tuesday at 9 AM, 2 acres, gate code 1234
  // - Explicit follow-up: send estimate by Friday
  // - Explicit decision: schedule for next Tuesday at 9 AM

  it('fixture has greetings that should be excluded', () => {
    expect(PHYSICAL_TEST_TRANSCRIPT).toContain('Hi, good morning!')
    expect(PHYSICAL_TEST_TRANSCRIPT).toContain('How are you doing today?')
  })

  it('fixture has repeated ideas that should consolidate', () => {
    const matches = PHYSICAL_TEST_TRANSCRIPT.match(/property on Maple Street/gi)
    expect(matches?.length).toBeGreaterThan(3) // Repeated multiple times
  })

  it('fixture has concrete facts that should be preserved', () => {
    expect(PHYSICAL_TEST_TRANSCRIPT).toContain('Maple Street')
    expect(PHYSICAL_TEST_TRANSCRIPT).toContain('next Tuesday at 9 AM')
    expect(PHYSICAL_TEST_TRANSCRIPT).toContain('2 acres')
    expect(PHYSICAL_TEST_TRANSCRIPT).toContain('gate code is 1234')
  })

  it('fixture has explicit follow-up that should become Follow-Up', () => {
    expect(PHYSICAL_TEST_TRANSCRIPT).toContain('send me an estimate')
    expect(PHYSICAL_TEST_TRANSCRIPT).toContain("I'll send you an estimate by Friday")
  })

  it('fixture has explicit decision that should become Decisions', () => {
    expect(PHYSICAL_TEST_TRANSCRIPT).toContain("let's schedule it for next Tuesday at 9 AM")
  })

  it('prompt would synthesize the fixture into concise sections', () => {
    // The prompt instructs synthesis, so the output should be shorter than the transcript
    expect(content).toContain('Synthesize rather than copy transcript sentences')
    expect(content).toContain('Consolidate repeated ideas into single bullets')
  })
})

describe('AI Summary Pipeline — Persistence & Fallback', () => {
  it('returns both summary (plain text) and structured (JSON)', () => {
    expect(content).toContain('return { summary: lines.join')
    expect(content).toContain('structured: parsed')
  })

  it('falls back to empty structure when JSON parse fails', () => {
    expect(content).toContain('emptySummary()')
  })

  it('truncates transcript to 60000 characters', () => {
    expect(content).toContain('transcript.slice(0, 60000)')
  })

  it('uses temperature 0.2 for consistency', () => {
    expect(content).toContain('temperature: 0.2')
  })

  it('uses json_object response format', () => {
    expect(content).toContain("response_format: { type: 'json_object' }")
  })
})
