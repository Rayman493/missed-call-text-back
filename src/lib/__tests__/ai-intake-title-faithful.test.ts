/**
 * Batch B — Caller-Faithful Customer Titles
 *
 * The customer/lead title must be a short, nearly verbatim rendering of the
 * caller's stated reason. No category labels, diagnoses, services, locations,
 * urgency, or commitments may be invented. Every content word in the title
 * must come from the caller's own utterance.
 */
import { describe, it, expect } from 'vitest'
import { generateCanonicalRequestTitle } from '../ai-intake-formatter'
import { generateConciseRequestTitle, getLeadRequestTitle } from '../ai-field-mapping'

/** Every content word (len>2, not a pure article/prep) in the title must
 * appear in the caller's utterance — nothing may be invented. */
const CONTENT_WORDS = /^(?:the|a|an|and|or|but|for|to|of|in|on|at|by|is|it|its|my|we|you)$/i
function expectCallerWordsOnly(title: string, callerUtterance: string) {
  const utterance = callerUtterance.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ')
  for (const word of title.toLowerCase().split(/\s+/)) {
    const bare = word.replace(/[^a-z0-9']/g, '')
    if (!bare || CONTENT_WORDS.test(bare)) continue
    // Contractions: "isn't" caller-side may appear as "is not" / "isn't"
    const stem = bare.replace(/'(t|s|re|ll|d|ve|m)$/, '')
    expect(
      utterance.includes(bare) || (stem !== bare && utterance.includes(stem)),
      `title word "${bare}" not found in caller utterance: "${callerUtterance}"`
    ).toBe(true)
  }
}

describe('Batch B — caller-faithful titles (generateCanonicalRequestTitle)', () => {
  describe('spec table — simple requests stay nearly verbatim', () => {
    it.each([
      ['Hi, my kitchen sink is leaking.', 'Kitchen sink is leaking'],
      ["My AC isn't cooling the house.", "AC isn't cooling the house"],
      ['My toilet keeps running.', 'Toilet keeps running'],
      ["There's water coming through the ceiling.", 'Water coming through the ceiling'],
      ['I need an estimate for a new deck.', 'Estimate for a new deck'],
      ['I think my AC might be leaking.', 'AC might be leaking'],
      ['My toilet keeps running.', 'Toilet keeps running'],
    ])('"%s" → "%s"', (input, expected) => {
      const title = generateCanonicalRequestTitle(input)
      expect(title).toBe(expected)
      expectCallerWordsOnly(title, input)
    })
  })

  describe('multiple issues — both issues are preserved', () => {
    it('keeps sink AND toilet in one title', () => {
      const title = generateCanonicalRequestTitle("My sink leaks and my toilet won't flush.")
      expect(title.toLowerCase()).toContain('sink')
      expect(title.toLowerCase()).toContain('toilet')
      expect(title.toLowerCase()).toContain("won't flush")
      expectCallerWordsOnly(title, "My sink leaks and my toilet won't flush.")
    })

    it('keeps tree removal AND fence repair', () => {
      const title = generateCanonicalRequestTitle('remove the tree and repair the fence')
      expect(title.toLowerCase()).toContain('tree')
      expect(title.toLowerCase()).toContain('fence')
    })
  })

  describe('explicit corrections — latest stated issue wins, rejected issue dropped', () => {
    it('shower-not-sink correction keeps shower only', () => {
      const title = generateCanonicalRequestTitle("Actually, it's the shower leaking, not the sink.")
      expect(title.toLowerCase()).toContain('shower')
      expect(title.toLowerCase()).not.toContain('sink')
    })

    it('does not concatenate contradictory issues', () => {
      const title = generateCanonicalRequestTitle('Actually not the faucet, the drain is clogged')
      expect(title.toLowerCase()).toContain('drain')
      expect(title.toLowerCase()).not.toContain('faucet')
    })
  })

  describe('negation and uncertainty are never upgraded to certainty', () => {
    it('preserves "isn\'t"', () => {
      const title = generateCanonicalRequestTitle("My AC isn't cooling")
      expect(title.toLowerCase()).toContain("isn't")
    })

    it('preserves "won\'t"', () => {
      const title = generateCanonicalRequestTitle("My garage door won't open")
      expect(title.toLowerCase()).toContain("won't")
    })

    it('preserves "might"', () => {
      const title = generateCanonicalRequestTitle('I think the pipe might be cracked')
      expect(title.toLowerCase()).toContain('might')
    })

    it('preserves "maybe"', () => {
      const title = generateCanonicalRequestTitle('Maybe the drain is clogged')
      expect(title.toLowerCase()).toContain('maybe')
    })

    it('an undecided answer is not titled as a request', () => {
      const title = generateCanonicalRequestTitle("I'm not sure")
      // Any neutral label is acceptable — what matters is no invented service
      expect(['General Service', 'Not collected', 'Service Request']).toContain(title)
      expect(title.toLowerCase()).not.toContain('plumbing')
      expect(title.toLowerCase()).not.toContain('repair')
    })
  })

  describe('filler and scaffolding removal — meaning kept', () => {
    it('drops greeting and "I\'m calling because"', () => {
      const title = generateCanonicalRequestTitle("Hi, I'm calling because my water heater is leaking")
      expect(title.toLowerCase()).toContain('water heater')
      expect(title.toLowerCase()).toContain('leaking')
      expect(title.toLowerCase()).not.toContain('calling')
    })

    it('drops "I was wondering if you could"', () => {
      const title = generateCanonicalRequestTitle('I was wondering if you could fix my fence')
      expect(title.toLowerCase()).toContain('fence')
      expect(title.toLowerCase()).not.toContain('wondering')
    })

    it('drops leading hedges without dropping the request', () => {
      const title = generateCanonicalRequestTitle('Well, actually I need someone to look at my roof')
      expect(title.toLowerCase()).toContain('roof')
      expect(title.toLowerCase()).not.toContain('actually')
    })
  })

  describe('caller terminology is never replaced with technical language', () => {
    it('"AC" stays "AC", not "HVAC"', () => {
      const title = generateCanonicalRequestTitle('My AC is not cooling')
      expect(title).not.toBe('HVAC Repair')
      expect(title.toUpperCase()).toContain('AC')
    })

    it('"sink is leaking" is not renamed a plumbing category', () => {
      const title = generateCanonicalRequestTitle('My sink is leaking')
      expect(title).not.toBe('Plumbing Repair')
      expect(title.toLowerCase()).toContain('sink')
    })

    it('"grass cut" is not renamed "Lawn Mowing"', () => {
      const title = generateCanonicalRequestTitle('I need my grass cut')
      expect(title).not.toBe('Lawn Mowing')
      expect(title.toLowerCase()).toContain('grass')
    })
  })

  describe('location, timing, and commentary stay out of the reason', () => {
    it('street address tail is not part of the title', () => {
      const title = generateCanonicalRequestTitle('I need new pipes installed in my house at 123 Main Street')
      expect(title).not.toContain('123')
      expect(title.toLowerCase()).not.toContain('main street')
    })

    it('callback commentary in a later sentence is ignored', () => {
      const title = generateCanonicalRequestTitle('I need my grass cut. Please call me back after 4.')
      expect(title.toLowerCase()).not.toContain('call me')
      expect(title.toLowerCase()).toContain('grass')
    })

    it('weekday scheduling is not part of the title', () => {
      const title = generateCanonicalRequestTitle('I need my grass cut next Tuesday')
      expect(title.toLowerCase()).not.toContain('tuesday')
      expect(title.toLowerCase()).not.toContain('next')
    })
  })

  describe('thin or meaningless reasons — safe neutral outcome', () => {
    it('vague request keeps a faithful thin title', () => {
      const title = generateCanonicalRequestTitle('I need someone to come out')
      // Caller-faithful residue ("come out") or a neutral fallback — never an invented service
      expect(title.toLowerCase()).not.toContain('repair')
      expect(title.toLowerCase()).not.toContain('installation')
      expect(title.toLowerCase()).not.toContain('service')
    })

    it('empty input yields the neutral label', () => {
      expect(generateCanonicalRequestTitle('')).toBe('General Service')
      expect(generateCanonicalRequestTitle(null)).toBe('General Service')
    })

    it('vague requests can never become an unsupported service category', () => {
      for (const [input, forbidden] of [
        ['I need some help outside', 'landscap'],
        ["Something isn't working", 'electrical'],
        ["I'm calling about a problem", 'repair'],
        ['something is wrong', 'repair'],
        ['can you help me', 'service'],
      ] as const) {
        const title = generateCanonicalRequestTitle(input)
        if (title !== 'General Service' && title !== 'Service Request' && title !== 'Not collected') {
          expect(title.toLowerCase()).not.toContain(forbidden)
          expectCallerWordsOnly(title, input)
        }
      }
      expect(generateCanonicalRequestTitle('can you help me')).toBe('General Service')
    })

    it('phrasal verbs are not truncated by trailing-word cleanup', () => {
      const title = generateCanonicalRequestTitle("my heater won't turn on")
      expect(title.toLowerCase()).toContain("won't turn on")
      expect(title.toLowerCase()).not.toBe("heater won't turn")
    })

    it('stored canonical labels pass through unchanged', () => {
      for (const label of ['Lawn Mowing', 'Plumbing Repair', 'HVAC Repair', 'Kitchen Leak Repair', 'New-Construction Plumbing Installation', 'Fence Installation']) {
        expect(generateCanonicalRequestTitle(label)).toBe(label)
      }
    })
  })
})

describe('Batch B — lead title pipeline (getLeadRequestTitle)', () => {
  const leadWith = (extracted: Record<string, unknown>, historicalReason?: string) => ({
    id: 'lead-1',
    name: 'Test Caller',
    raw_metadata: historicalReason
      ? { extracted_info: { reasonForCalling: historicalReason } }
      : {},
    aiCallRecords: [{
      id: 'call-1',
      call_sid: 'CA123',
      outcome: 'completed',
      created_at: '2024-01-01T10:00:00Z',
      extracted_info: extracted
    }]
  })

  it('caller-faithful title flows through the card seam', () => {
    const lead = leadWith({ reasonForCalling: 'My kitchen sink is leaking' })
    const title = getLeadRequestTitle(lead)
    expect(title.toLowerCase()).toContain('sink')
    expect(title.toLowerCase()).toContain('leaking')
    expect(title).not.toBe('Plumbing Repair')
  })

  it('prior-call reason never becomes the current title', () => {
    const lead = leadWith(
      { reasonForCalling: 'My AC is not cooling' },
      'Historical Plumbing'
    )
    const title = getLeadRequestTitle(lead)
    expect(title.toLowerCase()).toContain('ac')
    expect(title.toLowerCase()).not.toContain('plumbing')
  })

  it('empty current call + historical reason → no title (no stale facts)', () => {
    const lead = leadWith({}, 'Historical Plumbing')
    expect(getLeadRequestTitle(lead)).toBe('')
  })

  it('assistant-only "reason" (no caller request captured) → no invented title', () => {
    const lead = leadWith({ reasonForCalling: "I'm not sure, I need to check with my husband" })
    const title = getLeadRequestTitle(lead)
    expect(title).not.toBe('Plumbing Repair')
    expect(title).not.toBe('HVAC Repair')
    if (title) {
      // Whatever survives must be the caller's own words
      expectCallerWordsOnly(title, "I'm not sure, I need to check with my husband")
    }
  })

  it('uncertainty survives the full pipeline un-upgraded', () => {
    const lead = leadWith({ reasonForCalling: 'I think my AC might be leaking' })
    const title = getLeadRequestTitle(lead)
    expect(title.toLowerCase()).toContain('might')
  })

  it('concise and card titles agree on the same reason', () => {
    const reason = "My sink leaks and my toilet won't flush"
    const concise = generateConciseRequestTitle(reason)
    const card = getLeadRequestTitle(leadWith({ reasonForCalling: reason }))
    expect(concise).toBe(card)
    expect(concise.toLowerCase()).toContain('sink')
    expect(concise.toLowerCase()).toContain('toilet')
  })
})
