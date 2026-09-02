import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('TimePicker', () => {
  const content = readFileSync('src/components/ui/TimePicker.tsx', 'utf8')

  it('associates label with input via htmlFor and id', () => {
    expect(content).toContain('htmlFor={inputId}')
    expect(content).toContain('id={inputId}')
  })

  it('shows clock icon when no value, clear button when value exists', () => {
    expect(content).toContain('Clock')
    expect(content).toContain('!value && !disabled')
    expect(content).toContain('value && !disabled')
  })

  it('only shows clear button when a time is selected', () => {
    expect(content).toContain('{value && !disabled && (')
  })

  it('uses native time input to preserve platform picker', () => {
    expect(content).toContain('type="time"')
  })
})
