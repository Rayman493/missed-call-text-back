import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('DatePicker', () => {
  const content = readFileSync('src/components/ui/DatePicker.tsx', 'utf8')

  it('associates label with input via htmlFor and id', () => {
    expect(content).toContain('htmlFor={inputId}')
    expect(content).toContain('id={inputId}')
  })

  it('shows CalendarDays icon when empty and not disabled', () => {
    expect(content).toContain('CalendarDays')
    expect(content).toContain('pointer-events-none')
    expect(content).toContain('!disabled')
  })

  it('shows clear button only when a date is selected and not disabled', () => {
    expect(content).toContain('{value ?')
    expect(content).toContain('aria-label="Clear date"')
    expect(content).toContain('!disabled')
  })

  it('uses native date input to preserve platform picker', () => {
    expect(content).toContain('type="date"')
  })

  it('hides default native calendar indicator to prevent bleed', () => {
    expect(content).toContain('appearance-none')
  })

  it('reserves trailing space for the control and clear button', () => {
    expect(content).toContain("value ? 'pr-16' : 'pr-10'")
  })

  it('positions clear button at the right edge in place of the decorative icon', () => {
    expect(content).toContain('right-3')
  })

  it('prevents clear button click from opening the native date picker', () => {
    expect(content).toContain('stopPropagation')
    expect(content).toContain('preventDefault')
  })

  it('centers trailing icons vertically', () => {
    expect(content).toContain('top-1/2 -translate-y-1/2')
  })

  it('allows the field to shrink in narrow grid columns', () => {
    expect(content).toContain('relative min-w-0')
    expect(content).toContain('min-w-0')
  })
})
