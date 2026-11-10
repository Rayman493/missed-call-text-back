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

describe('generateCanonicalRequestTitle — verbatim-first', () => {
  // The title is a short, nearly-verbatim rendering of the caller's reason —
  // scaffolding is removed, but the caller's own words and uncertainty are
  // kept. Category labels only apply when the answer is too thin to title.
  it.each([
    ['I was looking to get a Brazilian wax', 'Brazilian wax'],
    ['I need someone to mow my lawn', 'Mow lawn'],
    ['My AC is not cooling', 'AC is not cooling'],
    ['Can you clean my gutters?', 'Clean gutters'],
    ['I would like piano lessons', 'Piano lessons'],
    ['I need a water heater installed', 'Water heater installed'],
    ['Can someone give me a quote to paint my house?', 'Give a quote to paint house'],
    ['My sink is leaking', 'Sink is leaking'],
    ['I need my driveway pressure washed', 'Driveway pressure washed'],
    ['I need my grass cut', 'Grass cut'],
    ['I need beginner piano lessons', 'Beginner piano lessons'],
    ['My AC is blowing warm air upstairs', 'AC is blowing warm air upstairs'],
    ['Need a new fence installed', 'New fence installed'],
    ['Kitchen sink is leaking', 'Kitchen sink is leaking'],
    ['I need lawn mowing tomorrow', 'Lawn mowing'],
    ['Can you fix my AC this afternoon', 'Fix AC'],
    ['I need lawn mowing for a quarter acre', 'Lawn mowing'],
    ['Clean my two-story house with 3 bathrooms', 'Clean two-story house'],
    ['remove the tree and repair the fence', 'Remove the tree and repair the fence'],
    ['tree removal and fence repair', 'Tree removal and fence repair'],
    ['my kitchen faucet is leaking and dripping constantly from the handle', 'Kitchen faucet is leaking and dripping constantly from the handle'],
    ['get a new shower installed for my bathroom', 'New shower installed for bathroom'],
    ['get a fence installed for my house for the backyard', 'Fence installed for house for the backyard'],
    ['I need a toilet installed', 'Toilet installed'],
    ['I was just looking for some landscaping help with my backyard', 'Some landscaping help with backyard'],
    ['I need some help around the house', 'Some help around the house'],
  ])('titles "%s" faithfully as "%s"', (input, expected) => {
    expect(generateCanonicalRequestTitle(input)).toBe(expected)
  })

  it('returns "General Service" for empty input', () => {
    expect(generateCanonicalRequestTitle('')).toBe('General Service')
  })

  it('returns "General Service" for null input', () => {
    expect(generateCanonicalRequestTitle(null)).toBe('General Service')
  })

  it('returns "General Service" for undefined input', () => {
    expect(generateCanonicalRequestTitle(undefined)).toBe('General Service')
  })

  it('passes already-canonical titles through unchanged', () => {
    expect(generateCanonicalRequestTitle('Lawn Mowing')).toBe('Lawn Mowing')
    expect(generateCanonicalRequestTitle('Plumbing Repair')).toBe('Plumbing Repair')
  })

  // Verbose production-style input: the first sentence is the caller's
  // reason; referral/timing/address commentary must not enter the title.
  it('titles a verbose construction request by its first stated sentence', () => {
    const input = 'I was looking to get some new pipes installed in my new house. It\'s getting built right now, and I\'m trying to get the the piping all set up. And I was recommended to you guys by a friend. So I\'d like you guys to come do it for my house.'
    expect(generateCanonicalRequestTitle(input)).toBe('Some new pipes installed in new house')
  })

  it('keeps spelled-out property age in the caller\'s words', () => {
    expect(generateCanonicalRequestTitle('I need new pipes installed in my 30-year-old house')).toBe('New pipes installed in 30-year-old house')
  })

  it('keeps the caller\'s construction description verbatim', () => {
    expect(generateCanonicalRequestTitle('We are building a new house and need the plumbing installed')).toBe('We are building a new house and need the plumbing installed')
  })

  it('keeps "new house" and the leak in the caller\'s words', () => {
    expect(generateCanonicalRequestTitle('My new house has a leaking pipe')).toBe('New house has a leaking pipe')
  })

  it('keeps the caller\'s burst-pipe statement verbatim', () => {
    expect(generateCanonicalRequestTitle('The house is under construction and a pipe burst')).toBe('House is under construction and a pipe burst')
  })

  it('referral preamble does not enter the title', () => {
    const input = 'I was recommended by a friend to get some new pipes installed in my new house. It\'s getting built right now.'
    const result = generateCanonicalRequestTitle(input)
    expect(result).toBe('Some new pipes installed in new house')
    expect(result).not.toContain('recommended')
  })

  it('timing commentary stays out of the title', () => {
    const input = 'I need new pipes installed in my new house. It\'s getting built right now. I need it done next month.'
    expect(generateCanonicalRequestTitle(input)).toBe('New pipes installed in new house')
  })

  it('callback commentary stays out of the title', () => {
    const input = 'I need new pipes installed in my new house. It\'s getting built right now. Call me in the afternoon.'
    expect(generateCanonicalRequestTitle(input)).toBe('New pipes installed in new house')
  })

  it('street address stays out of the title', () => {
    const input = 'I need new pipes installed in my new house at 123 Main Street. It\'s getting built right now.'
    const result = generateCanonicalRequestTitle(input)
    expect(result).toBe('New pipes installed in new house')
    expect(result).not.toContain('123')
    expect(result).not.toContain('Main')
  })
})
