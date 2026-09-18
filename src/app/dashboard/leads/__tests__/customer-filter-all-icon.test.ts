import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8')

describe('Customer filter "All" icon and alignment', () => {
  it('imports a neutral Users-style icon', () => {
    expect(content).toMatch(/import\s+\{[^}]*Users[^}]*\}\s+from\s+['"]lucide-react['"]/)
  })

  it('renders a neutral icon for the All filter option', () => {
    expect(content).toContain("filter === 'all'")
    expect(content).toContain('<Users')
  })

  it('does not use a status checkmark for All', () => {
    const allIconBlock = content.slice(
      content.indexOf("if (filter === 'all')"),
      content.indexOf('const Icon = getCustomerStatusIcon')
    )
    expect(allIconBlock).not.toContain('Check')
    expect(allIconBlock).not.toContain('CheckCircle')
  })

  it('uses the same icon container size as status options', () => {
    // All icon should be w-4 h-4 like the status icons
    expect(content).toContain('<Users className="w-4 h-4')
  })

  it('displays All label in the trigger with the same icon+label layout', () => {
    expect(content).toContain('getStatusFilterIcon(statusFilter)')
    expect(content).toContain('getStatusFilterLabel(statusFilter)')
  })
})
