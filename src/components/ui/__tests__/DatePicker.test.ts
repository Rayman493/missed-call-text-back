import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('DatePicker', () => {
  const content = readFileSync('src/components/ui/DatePicker.tsx', 'utf8')

  it('associates label with input via htmlFor and id', () => {
    expect(content).toContain('htmlFor={inputId}')
    expect(content).toContain('id={inputId}')
  })

  it('positions clear button left of native calendar indicator', () => {
    expect(content).toContain("right-12")
    expect(content).toContain("pr-16")
  })

  it('only shows clear button when a date is selected', () => {
    expect(content).toContain('{value && !disabled && (')
  })

  it('uses native date input to preserve platform picker', () => {
    expect(content).toContain('type="date"')
  })
})
