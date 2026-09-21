import { describe, it, expect } from 'vitest'
import { capitalizeFirstAlpha } from '../utils'

describe('capitalizeFirstAlpha', () => {
  it('capitalizes the first alphabetic character', () => {
    expect(capitalizeFirstAlpha('the handle feels loose')).toBe('The handle feels loose')
    expect(capitalizeFirstAlpha('tomorrow after 2 p.m.')).toBe('Tomorrow after 2 p.m.')
    expect(capitalizeFirstAlpha('whenever available')).toBe('Whenever available')
    expect(capitalizeFirstAlpha('urgent')).toBe('Urgent')
  })

  it('preserves acronyms and all-caps values', () => {
    expect(capitalizeFirstAlpha('ASAP if possible')).toBe('ASAP if possible')
    expect(capitalizeFirstAlpha('NASA repair')).toBe('NASA repair')
  })

  it('preserves intentional brand/proper casing', () => {
    expect(capitalizeFirstAlpha('iPhone repair')).toBe('iPhone repair')
    expect(capitalizeFirstAlpha('eBay listing')).toBe('eBay listing')
  })

  it('leaves empty or non-string values empty', () => {
    expect(capitalizeFirstAlpha('')).toBe('')
    expect(capitalizeFirstAlpha(null as any)).toBe('')
    expect(capitalizeFirstAlpha(undefined as any)).toBe('')
  })

  it('does not lowercase the rest of the string', () => {
    expect(capitalizeFirstAlpha('the Handle feels Loose')).toBe('The Handle feels Loose')
  })
})
