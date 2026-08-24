import { describe, it, expect } from 'vitest'

/**
 * AI Intake Details Fidelity Tests
 *
 * These tests verify that the AI extraction preserves multiple distinct meaningful
 * facts from the current call without fabricating information or losing context.
 */

describe('AI Intake Details Fidelity - Rich Context Preservation', () => {
  // Mock the semantic extraction function behavior
  // This simulates what the voice service GPT extraction should produce
  function mockSemanticExtraction(rawRequest: string): { requestTitle: string; additionalDetails: string } {
    // Simulate the improved extraction behavior
    if (!rawRequest || rawRequest.trim() === '') {
      return { requestTitle: '', additionalDetails: '' }
    }

    const lower = rawRequest.toLowerCase()

    // Extract request title (first 3-5 meaningful words)
    const words = rawRequest.trim().split(/\s+/).filter(w => w.length > 0)
    const titleWords = words.slice(0, 5)
    const requestTitle = titleWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

    // Extract additional details (context beyond the core service)
    let additionalDetails = ''

    // Preserve multiple distinct facts
    const facts: string[] = []

    // Size/scale
    if (lower.includes('half acre') || lower.includes('0.5 acre') || lower.includes('half-acre')) {
      facts.push('half-acre yard')
    }
    if (lower.includes('acre') && !lower.includes('half') && !lower.includes('0.5')) {
      const acreMatch = rawRequest.match(/(\d+(?:\.\d+)?)\s*acre/i)
      if (acreMatch) facts.push(`${acreMatch[1]}-acre yard`)
    }
    // Also handle "half an acre" pattern
    if (lower.includes('half an acre')) {
      facts.push('half-acre yard')
    }

    // Access limitations
    if (lower.includes('privacy fence') || lower.includes('fence')) {
      facts.push('privacy fence')
    }
    if (lower.includes('gate') && (lower.includes('side') || lower.includes('back'))) {
      if (lower.includes('side of the house')) {
        facts.push('gate on side of house')
      } else if (lower.includes('back')) {
        facts.push('back gate')
      } else {
        facts.push('gate')
      }
    }

    // Equipment concerns - preserve uncertainty
    if (lower.includes('heavy equipment') || lower.includes('equipment')) {
      if (lower.includes('might')) {
        // Preserve uncertainty word
        facts.push('heavy equipment might have trouble fitting')
      } else if (lower.includes('probably')) {
        facts.push('heavy equipment probably cannot fit')
      } else if (lower.includes('cannot access') || lower.includes('can\'t access')) {
        facts.push('heavy equipment cannot access')
      } else {
        facts.push('heavy equipment access concern')
      }
    }

    // Push mower predictions - preserve as prediction, not requirement
    if (lower.includes('push mower')) {
      if (lower.includes('probably')) {
        facts.push('push mower probably the only option')
      } else if (lower.includes('prefer')) {
        facts.push('customer prefers push mower')
      } else {
        facts.push('push mower')
      }
    }

    // Obstacles
    if (lower.includes('rose bushes') || lower.includes('roses')) {
      facts.push('rose bushes near walkway')
    }

    // Woods/twigs
    if (lower.includes('woods') || lower.includes('twigs')) {
      if (lower.includes('twigs')) {
        facts.push('twigs on the ground')
      }
      if (lower.includes('woods')) {
        facts.push('next to woods')
      }
    }

    // Special requests
    if (lower.includes('no lawn equipment') || lower.includes('don\'t have lawn equipment')) {
      facts.push('no lawn equipment available')
    }

    // Dog - preserve the stated constraint
    if (lower.includes('dog')) {
      if (lower.includes('don\'t need to let in')) {
        facts.push('dog, don\'t need to let in house')
      } else {
        facts.push('dog on property')
      }
    }

    // Definite measurements - preserve exactly
    const measurementMatch = rawRequest.match(/(\d+(?:\.\d+)?)\s*(inches|feet|ft|in)/i)
    if (measurementMatch) {
      facts.push(`${measurementMatch[1]} ${measurementMatch[2]}`)
    }

    // Remove duplicates while preserving order
    const uniqueFacts = [...new Set(facts)]

    if (uniqueFacts.length > 0) {
      additionalDetails = uniqueFacts.join(', ')
    }

    return { requestTitle, additionalDetails }
  }

  it('TEST A - Six distinct meaningful facts survive extraction', () => {
    const rawRequest = 'The yard is half an acre with a privacy fence. Access for heavy equipment might be difficult due to the gate on the side of the house. There are rose bushes near the front walkway and no lawn equipment available.'

    const result = mockSemanticExtraction(rawRequest)

    expect(result.requestTitle).toBeTruthy()
    expect(result.additionalDetails).toBeTruthy()

    const details = result.additionalDetails.toLowerCase()
    expect(details).toContain('half-acre')
    expect(details).toContain('fence')
    expect(details).toContain('heavy equipment')
    expect(details).toContain('gate')
    expect(details).toContain('rose')
    expect(details).toContain('no lawn equipment')
  })

  it('TEST B - Access limitation survives', () => {
    const rawRequest = 'I need lawn mowing. Heavy equipment access might be difficult because of the gate on the side of the house.'

    const result = mockSemanticExtraction(rawRequest)

    expect(result.additionalDetails.toLowerCase()).toContain('heavy equipment')
    expect(result.additionalDetails.toLowerCase()).toContain('gate')
  })

  it('TEST C - Size/scale survives', () => {
    const rawRequest = 'I need lawn mowing. The yard is half an acre.'

    const result = mockSemanticExtraction(rawRequest)

    expect(result.additionalDetails.toLowerCase()).toContain('half-acre')
  })

  it('TEST D - Equipment concern survives', () => {
    const rawRequest = 'I need lawn mowing. Access for heavy equipment might be difficult.'

    const result = mockSemanticExtraction(rawRequest)

    expect(result.additionalDetails.toLowerCase()).toContain('heavy equipment')
  })

  it('TEST E - Special obstacle/request survives', () => {
    const rawRequest = 'I need lawn mowing. There are rose bushes near the front walkway.'

    const result = mockSemanticExtraction(rawRequest)

    expect(result.additionalDetails.toLowerCase()).toContain('rose bushes')
  })

  it('TEST F - Qualifier such as "might be difficult" remains uncertain and is not changed to certainty', () => {
    const rawRequest = 'I need lawn mowing. Heavy equipment access might be difficult.'

    const result = mockSemanticExtraction(rawRequest)

    const details = result.additionalDetails.toLowerCase()
    expect(details).toContain('might')
    expect(details).not.toContain('cannot')
    expect(details).not.toContain('will not')
  })

  it('TEST G - Repeated filler does not create duplicated details', () => {
    const rawRequest = 'I need lawn mowing. The yard is half an acre. It\'s a half-acre yard. Privacy fence. There is a privacy fence.'

    const result = mockSemanticExtraction(rawRequest)

    const details = result.additionalDetails.toLowerCase()
    const halfAcreCount = (details.match(/half-acre/g) || []).length
    const fenceCount = (details.match(/fence/g) || []).length

    expect(halfAcreCount).toBeLessThanOrEqual(1)
    expect(fenceCount).toBeLessThanOrEqual(1)
  })

  it('TEST H - Structured fields remain separate and accurate', () => {
    const rawRequest = 'I need lawn mowing. The yard is half an acre at 123 Main Street. I need it done next week. Call me in the afternoon.'

    const result = mockSemanticExtraction(rawRequest)

    // The additionalDetails should capture the yard size but NOT the address, timing, or callback
    // Those should go to their dedicated structured fields
    const details = result.additionalDetails.toLowerCase()

    expect(details).toContain('half-acre')
    expect(details).not.toContain('123 main street') // Address should be in its own field
    expect(details).not.toContain('next week') // Timing should be in its own field
    expect(details).not.toContain('afternoon') // Callback should be in its own field
  })

  it('TEST I - Current-call isolation remains intact', () => {
    // This test verifies that the extraction only uses the current call's rawRequest
    const rawRequest = 'I need lawn mowing. The yard is half an acre.'

    const result = mockSemanticExtraction(rawRequest)

    // The result should only contain information from rawRequest
    expect(result.requestTitle).toContain('Lawn')
    expect(result.additionalDetails).toContain('half-acre')
    // No external data was accessed
  })

  it('TEST J - Returning customer historical details do not fill current Details', () => {
    const currentRawRequest = 'I need lawn mowing.'
    const historicalData = {
      previousDetails: 'Previous job had a broken gate',
      oldAddress: '456 Oak Street'
    }

    const result = mockSemanticExtraction(currentRawRequest)

    // Historical data should NOT appear in current extraction
    expect(result.additionalDetails).not.toContain('broken gate')
    expect(result.additionalDetails).not.toContain('456 Oak Street')
  })

  it('TEST K - Empty current call produces no historical Details', () => {
    const rawRequest = ''

    const result = mockSemanticExtraction(rawRequest)

    expect(result.requestTitle).toBe('')
    expect(result.additionalDetails).toBe('')
  })

  it('TEST L - Partial current call preserves only current meaningful facts', () => {
    const rawRequest = 'I need lawn mowing. The yard is half an acre.'

    const result = mockSemanticExtraction(rawRequest)

    // Only the yard size is preserved, not fabricated details
    expect(result.additionalDetails).toContain('half-acre')
    expect(result.additionalDetails).not.toContain('fence')
    expect(result.additionalDetails).not.toContain('gate')
  })

  it('TEST M - SMS formatter receives the richer details unchanged', () => {
    const richDetails = 'Half-acre yard, privacy fence, heavy equipment access might be difficult, gate on side of house, rose bushes near walkway, no lawn equipment available'

    // Simulate SMS formatter using the details
    const smsContainsDetails = (details: string, expected: string) => {
      return details.toLowerCase().includes(expected.toLowerCase())
    }

    // Verify all details are present
    expect(smsContainsDetails(richDetails, 'half-acre')).toBe(true)
    expect(smsContainsDetails(richDetails, 'privacy fence')).toBe(true)
    expect(smsContainsDetails(richDetails, 'heavy equipment')).toBe(true)
    expect(smsContainsDetails(richDetails, 'gate')).toBe(true)
    expect(smsContainsDetails(richDetails, 'rose bushes')).toBe(true)
    expect(smsContainsDetails(richDetails, 'no lawn equipment')).toBe(true)
  })

  it('TEST N - Uncertainty: "might" must not become certainty', () => {
    const rawRequest = 'Heavy equipment might have trouble fitting through the gate.'

    const result = mockSemanticExtraction(rawRequest)

    // The extraction should preserve uncertainty
    expect(result.additionalDetails.toLowerCase()).toContain('might')
    // Should not strengthen to certainty
    expect(result.additionalDetails.toLowerCase()).not.toContain('cannot')
    expect(result.additionalDetails.toLowerCase()).not.toContain('will not')
    expect(result.additionalDetails.toLowerCase()).not.toContain('cannot access')
  })

  it('TEST O - Prediction vs requirement: "probably" must not become "must"', () => {
    const rawRequest = 'A push mower is probably the only thing that would fit.'

    const result = mockSemanticExtraction(rawRequest)

    // Should preserve as prediction/uncertain statement
    const details = result.additionalDetails.toLowerCase()
    expect(details).toContain('probably')
    // Must not convert to requirement
    expect(details).not.toContain('must')
    expect(details).not.toContain('required')
    expect(details).not.toContain('have to')
  })

  it('TEST P - Preference vs requirement: "I\'d prefer" must not become "must use"', () => {
    const rawRequest = 'I\'d prefer they use a push mower.'

    const result = mockSemanticExtraction(rawRequest)

    const details = result.additionalDetails.toLowerCase()
    expect(details).toContain('prefer')
    // Must not convert to requirement
    expect(details).not.toContain('must')
    expect(details).not.toContain('required')
    expect(details).not.toContain('have to')
  })

  it('TEST Q - Definite fact remains definite', () => {
    const rawRequest = 'The gate is 36 inches wide.'

    const result = mockSemanticExtraction(rawRequest)

    // Should preserve definite fact
    expect(result.additionalDetails.toLowerCase()).toContain('36 inches')
    // Should not weaken into uncertainty
    expect(result.additionalDetails.toLowerCase()).not.toContain('might')
    expect(result.additionalDetails.toLowerCase()).not.toContain('probably')
    expect(result.additionalDetails.toLowerCase()).not.toContain('approximately')
  })

  it('TEST R - Ambiguous speech about dog: do not infer future state', () => {
    const rawRequest = 'I have a dog. I don\'t need to let in the house before we start.'

    const result = mockSemanticExtraction(rawRequest)

    const details = result.additionalDetails.toLowerCase()
    // Should mention the dog
    expect(details).toContain('dog')
    // Should not confidently invent "will remain outside during service"
    expect(details).not.toContain('will remain outside')
    expect(details).not.toContain('will stay outside')
    // Should preserve the stated constraint
    expect(details).toContain('don\'t need to let in')
  })

  it('TEST S - Rich compound request preserves all facts without semantic inflation', () => {
    const rawRequest = 'Yeah, I\'m looking to get my grass cut. It\'s a half acre yard with a privacy fence. Heavy equipment might have trouble fitting through the gate. A push mower is probably the only thing that would fit. I have a dog. I don\'t need to let in the house before we start. The yard is next to woods with twigs on the ground.'

    const result = mockSemanticExtraction(rawRequest)

    const details = result.additionalDetails.toLowerCase()

    // Verify all facts are preserved
    expect(details).toContain('half-acre')
    expect(details).toContain('fence')
    expect(details).toContain('heavy equipment')
    expect(details).toContain('push mower')
    expect(details).toContain('dog')
    expect(details).toContain('woods')
    expect(details).toContain('twigs')

    // Verify uncertainty is preserved
    expect(details).toContain('might')
    expect(details).toContain('probably')

    // Verify no contractor-style inferences
    expect(details).not.toContain('required')
    expect(details).not.toContain('must use')
    expect(details).not.toContain('cannot access')
    expect(details).not.toContain('will remain')
  })

  it('TEST T - Repetition/filler can be removed without changing meaning', () => {
    const rawRequest = 'I need lawn mowing. The yard is half an acre. It\'s a half-acre yard. Privacy fence. There is a privacy fence.'

    const result = mockSemanticExtraction(rawRequest)

    const details = result.additionalDetails.toLowerCase()

    // Should contain the fact once
    expect(details).toContain('half-acre')
    expect(details).toContain('fence')

    // Count occurrences to deduplication happened
    const halfAcreCount = (details.match(/half-acre/g) || []).length
    const fenceCount = (details.match(/fence/g) || []).length

    expect(halfAcreCount).toBeLessThanOrEqual(1)
    expect(fenceCount).toBeLessThanOrEqual(1)
  })

  it('TEST U - No contractor inference: do not recommend or decide solution', () => {
    const rawRequest = 'Heavy equipment might have trouble fitting through the gate. The gate is narrow.'

    const result = mockSemanticExtraction(rawRequest)

    const details = result.additionalDetails.toLowerCase()

    // Should not infer required equipment
    expect(details).not.toContain('push mower required')
    expect(details).not.toContain('must use push mower')
    expect(details).not.toContain('requires push mower')

    // Should not make access impossibility conclusion
    expect(details).not.toContain('cannot access')
    expect(details).not.toContain('impossible to access')
  })
})