/**
 * Tests for AI Intake Request Title Validation and Canonical Generation
 */

import { describe, it, expect } from 'vitest'
import { validateRequestTitle, generateCanonicalRequestTitle } from '../ai-intake-formatter'

describe('validateRequestTitle', () => {
  // Test rejection of bad conversational filler
  it('rejects "Was Looking"', () => {
    expect(validateRequestTitle('Was Looking')).toBeNull()
  })

  it('rejects "Looking For"', () => {
    expect(validateRequestTitle('Looking For')).toBeNull()
  })

  it('rejects "I Need"', () => {
    expect(validateRequestTitle('I Need')).toBeNull()
  })

  it('rejects "I Want"', () => {
    expect(validateRequestTitle('I Want')).toBeNull()
  })

  it('rejects "Can You"', () => {
    expect(validateRequestTitle('Can You')).toBeNull()
  })

  it('rejects "Could You"', () => {
    expect(validateRequestTitle('Could You')).toBeNull()
  })

  it('rejects "I Was Wondering"', () => {
    expect(validateRequestTitle('I Was Wondering')).toBeNull()
  })

  it('rejects "We Need"', () => {
    expect(validateRequestTitle('We Need')).toBeNull()
  })

  it('rejects "Looking"', () => {
    expect(validateRequestTitle('Looking')).toBeNull()
  })

  it('rejects "Get My"', () => {
    expect(validateRequestTitle('Get My')).toBeNull()
  })

  it('rejects "Service Request"', () => {
    expect(validateRequestTitle('Service Request')).toBeNull()
  })

  it('rejects "General Inquiry"', () => {
    expect(validateRequestTitle('General Inquiry')).toBeNull()
  })

  it('rejects "Request"', () => {
    expect(validateRequestTitle('Request')).toBeNull()
  })

  it('rejects "Inquiry"', () => {
    expect(validateRequestTitle('Inquiry')).toBeNull()
  })

  // Test rejection of placeholder values
  it('rejects "Not Collected"', () => {
    expect(validateRequestTitle('Not Collected')).toBeNull()
  })

  it('rejects "Not Provided"', () => {
    expect(validateRequestTitle('Not Provided')).toBeNull()
  })

  it('rejects "Unknown"', () => {
    expect(validateRequestTitle('Unknown')).toBeNull()
  })

  it('rejects "N/A"', () => {
    expect(validateRequestTitle('N/A')).toBeNull()
  })

  it('rejects "None"', () => {
    expect(validateRequestTitle('None')).toBeNull()
  })

  it('rejects "General Request"', () => {
    expect(validateRequestTitle('General Request')).toBeNull()
  })

  // Test rejection of pronouns
  it('rejects titles starting with "I "', () => {
    expect(validateRequestTitle('I need help')).toBeNull()
  })

  it('rejects titles starting with "We "', () => {
    expect(validateRequestTitle('We need service')).toBeNull()
  })

  it('rejects titles starting with "You "', () => {
    expect(validateRequestTitle('You should fix this')).toBeNull()
  })

  it('rejects titles starting with "My "', () => {
    expect(validateRequestTitle('My car needs repair')).toBeNull()
  })

  it('rejects titles starting with "Your "', () => {
    expect(validateRequestTitle('Your service is good')).toBeNull()
  })

  it('rejects titles starting with "Our "', () => {
    expect(validateRequestTitle('Our house needs work')).toBeNull()
  })

  // Test rejection of vague 1-2 word phrases
  it('rejects "Was"', () => {
    expect(validateRequestTitle('Was')).toBeNull()
  })

  it('rejects "Looking"', () => {
    expect(validateRequestTitle('Looking')).toBeNull()
  })

  it('rejects "Need"', () => {
    expect(validateRequestTitle('Need')).toBeNull()
  })

  it('rejects "Want"', () => {
    expect(validateRequestTitle('Want')).toBeNull()
  })

  it('rejects "Call"', () => {
    expect(validateRequestTitle('Call')).toBeNull()
  })

  it('rejects "Get"', () => {
    expect(validateRequestTitle('Get')).toBeNull()
  })

  it('rejects "Have"', () => {
    expect(validateRequestTitle('Have')).toBeNull()
  })

  it('rejects "Ask"', () => {
    expect(validateRequestTitle('Ask')).toBeNull()
  })

  // Test acceptance of valid service titles
  it('accepts "Brazilian Wax"', () => {
    expect(validateRequestTitle('Brazilian Wax')).toBe('Brazilian Wax')
  })

  it('accepts "Lawn Mowing"', () => {
    expect(validateRequestTitle('Lawn Mowing')).toBe('Lawn Mowing')
  })

  it('accepts "AC Repair"', () => {
    expect(validateRequestTitle('AC Repair')).toBe('AC Repair')
  })

  it('accepts "Piano Lessons"', () => {
    expect(validateRequestTitle('Piano Lessons')).toBe('Piano Lessons')
  })

  it('accepts "Plumbing Repair"', () => {
    expect(validateRequestTitle('Plumbing Repair')).toBe('Plumbing Repair')
  })

  it('accepts "House Painting"', () => {
    expect(validateRequestTitle('House Painting')).toBe('House Painting')
  })

  it('accepts "Pressure Washing"', () => {
    expect(validateRequestTitle('Pressure Washing')).toBe('Pressure Washing')
  })

  it('accepts "Fence Installation"', () => {
    expect(validateRequestTitle('Fence Installation')).toBe('Fence Installation')
  })

  it('accepts "Kitchen Sink Repair"', () => {
    expect(validateRequestTitle('Kitchen Sink Repair')).toBe('Kitchen Sink Repair')
  })

  it('accepts "Driveway Pressure Washing"', () => {
    expect(validateRequestTitle('Driveway Pressure Washing')).toBe('Driveway Pressure Washing')
  })

  // Test edge cases
  it('returns null for empty string', () => {
    expect(validateRequestTitle('')).toBeNull()
  })

  it('returns null for null', () => {
    expect(validateRequestTitle(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(validateRequestTitle(undefined)).toBeNull()
  })

  it('trims whitespace', () => {
    expect(validateRequestTitle('  Lawn Mowing  ')).toBe('Lawn Mowing')
  })

  it('case insensitive pattern matching', () => {
    expect(validateRequestTitle('was looking')).toBeNull()
    expect(validateRequestTitle('WAS LOOKING')).toBeNull()
    expect(validateRequestTitle('Was Looking')).toBeNull()
  })
})

describe('generateCanonicalRequestTitle', () => {
  // Test the main examples from the user requirements
  it('converts "I was looking to get a Brazilian wax" to "Brazilian Wax"', () => {
    expect(generateCanonicalRequestTitle('I was looking to get a Brazilian wax')).toBe('Brazilian Wax')
  })

  it('converts "I need someone to mow my lawn" to "Lawn Service"', () => {
    expect(generateCanonicalRequestTitle('I need someone to mow my lawn')).toBe('Lawn Service')
  })

  it('converts "My AC is not cooling" to "Ac Repair"', () => {
    expect(generateCanonicalRequestTitle('My AC is not cooling')).toBe('Ac Repair')
  })

  it('converts "Can you clean my gutters?" to "Clean Gutters"', () => {
    expect(generateCanonicalRequestTitle('Can you clean my gutters?')).toBe('Clean Gutters')
  })

  it('converts "I would like piano lessons" to "Piano Lessons"', () => {
    expect(generateCanonicalRequestTitle('I would like piano lessons')).toBe('Piano Lessons')
  })

  it('converts "I need a water heater installed" to "Heater Repair"', () => {
    expect(generateCanonicalRequestTitle('I need a water heater installed')).toBe('Heater Repair')
  })

  it('converts "Can someone give me a quote to paint my house?" to "Paint Service"', () => {
    expect(generateCanonicalRequestTitle('Can someone give me a quote to paint my house?')).toBe('Paint Service')
  })

  it('converts "My sink is leaking" to "Sink Repair"', () => {
    expect(generateCanonicalRequestTitle('My sink is leaking')).toBe('Sink Repair')
  })

  it('converts "I need my driveway pressure washed" to "Pressure Washing"', () => {
    expect(generateCanonicalRequestTitle('I need my driveway pressure washed')).toBe('Pressure Washing')
  })

  // Test additional service mappings
  it('converts "I need my grass cut" to "Lawn Mowing"', () => {
    expect(generateCanonicalRequestTitle('I need my grass cut')).toBe('Lawn Mowing')
  })

  it('converts "I need beginner piano lessons" to "Piano Lessons"', () => {
    expect(generateCanonicalRequestTitle('I need beginner piano lessons')).toBe('Piano Lessons')
  })

  it('converts "My AC is blowing warm air upstairs" to "Ac Air"', () => {
    expect(generateCanonicalRequestTitle('My AC is blowing warm air upstairs')).toBe('Ac Air')
  })

  it('converts "Need a new fence installed" to "Fence Installation"', () => {
    expect(generateCanonicalRequestTitle('Need a new fence installed')).toBe('Fence Installation')
  })

  it('converts "Need my driveway pressure washed" to "Pressure Washing"', () => {
    expect(generateCanonicalRequestTitle('Need my driveway pressure washed')).toBe('Pressure Washing')
  })

  it('converts "Kitchen sink is leaking" to "Kitchen Sink"', () => {
    expect(generateCanonicalRequestTitle('Kitchen sink is leaking')).toBe('Kitchen Sink')
  })

  // Test edge cases
  it('returns "General Service" for empty input', () => {
    expect(generateCanonicalRequestTitle('')).toBe('General Service')
  })

  it('returns "General Service" for null input', () => {
    expect(generateCanonicalRequestTitle(null)).toBe('General Service')
  })

  it('returns "General Service" for undefined input', () => {
    expect(generateCanonicalRequestTitle(undefined)).toBe('General Service')
  })

  it('handles already-canonical titles', () => {
    expect(generateCanonicalRequestTitle('Lawn Mowing')).toBe('Lawn Mowing')
    expect(generateCanonicalRequestTitle('Plumbing Repair')).toBe('Plumbing Repair')
  })

  // Test removal of timing and scheduling info
  it('removes timing information', () => {
    expect(generateCanonicalRequestTitle('I need lawn mowing tomorrow')).toBe('Lawn Mowing')
    expect(generateCanonicalRequestTitle('Can you fix my AC this afternoon')).toBe('Ac Repair')
  })

  // Test removal of property descriptions
  it('removes property size descriptions', () => {
    expect(generateCanonicalRequestTitle('I need lawn mowing for a quarter acre')).toBe('Lawn Mowing')
    expect(generateCanonicalRequestTitle('Clean my two-story house with 3 bathrooms')).toBe('Clean Two-story House')
  })

  // Regression tests for the "Not Collected" issue
  it('handles "Was Looking" with useful details', () => {
    expect(generateCanonicalRequestTitle('I was looking to get a Brazilian wax')).toBe('Brazilian Wax')
  })

  it('handles empty input gracefully', () => {
    expect(generateCanonicalRequestTitle('')).toBe('General Service')
  })

  it('handles already-canonical titles', () => {
    expect(generateCanonicalRequestTitle('Lawn Mowing')).toBe('Lawn Mowing')
    expect(generateCanonicalRequestTitle('Plumbing Repair')).toBe('Plumbing Repair')
  })

  // Critical test for demonstrated new-construction plumbing case - exact verbatim production input
  it('recognizes new-construction plumbing installation from exact production input', () => {
    const input = 'I was looking to get some new pipes installed in my new house. It\'s getting built right now, and I\'m trying to get the the piping all set up. And I was recommended to you guys by a friend. So I\'d like you guys to come do it for my house.'
    const result = generateCanonicalRequestTitle(input)
    expect(result).toBe('New-Construction Plumbing Installation')
  })

  // Multi-signal rule tests
  it('new pipes in existing house does not trigger new-construction', () => {
    expect(generateCanonicalRequestTitle('I need new pipes installed in my 30-year-old house')).toBe('Pipe Installation')
  })

  it('explicit construction context triggers new-construction', () => {
    expect(generateCanonicalRequestTitle('We are building a new house and need the plumbing installed')).toBe('New-Construction Plumbing Installation')
  })

  it('new house with leak is repair, not new-construction', () => {
    expect(generateCanonicalRequestTitle('My new house has a leaking pipe')).toBe('Pipe Repair')
  })

  it('construction context with burst pipe retains burst priority', () => {
    expect(generateCanonicalRequestTitle('The house is under construction and a pipe burst')).toBe('Burst Pipe Repair')
  })

  it('referral commentary does not affect classification', () => {
    const input = 'I was recommended by a friend to get some new pipes installed in my new house. It\'s getting built right now.'
    expect(generateCanonicalRequestTitle(input)).toBe('New-Construction Plumbing Installation')
  })

  it('timing commentary does not affect classification', () => {
    const input = 'I need new pipes installed in my new house. It\'s getting built right now. I need it done next month.'
    expect(generateCanonicalRequestTitle(input)).toBe('New-Construction Plumbing Installation')
  })

  it('callback commentary does not affect classification', () => {
    const input = 'I need new pipes installed in my new house. It\'s getting built right now. Call me in the afternoon.'
    expect(generateCanonicalRequestTitle(input)).toBe('New-Construction Plumbing Installation')
  })

  it('address commentary does not affect classification', () => {
    const input = 'I need new pipes installed in my new house at 123 Main Street. It\'s getting built right now.'
    expect(generateCanonicalRequestTitle(input)).toBe('New-Construction Plumbing Installation')
  })
})
