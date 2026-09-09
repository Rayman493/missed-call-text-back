import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Google Calendar disconnect affordance', () => {
  const content = readFileSync('src/components/SettingsContent.tsx', 'utf8')

  it('imports the Unlink icon from lucide-react', () => {
    expect(content).toContain('Unlink')
  })

  it('renders the Unlink icon inside the Disconnect button', () => {
    expect(content).toContain('<Unlink className="w-3.5 h-3.5" />')
    expect(content).toContain('Disconnect')
  })

  it('uses destructive red styling for the Disconnect button', () => {
    expect(content).toContain('border-red-300')
    expect(content).toContain('bg-red-50')
    expect(content).toContain('text-red-700')
  })
})
