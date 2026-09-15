import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) =>
  readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const leadsPageSrc = readSrc('src/app/dashboard/leads/page.tsx')
const conversationSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

describe('Batch 5B — customer filter active state and conversation header', () => {
  it('filter button uses neutral background when inactive', () => {
    expect(leadsPageSrc).toMatch(/bg-background.*text-muted-foreground/)
  })

  it('filter button uses intentional active styling when a real filter is selected', () => {
    expect(leadsPageSrc).toMatch(/bg-primary\/10.*text-primary/)
    expect(leadsPageSrc).toMatch(/quickFilter !== 'all' \|\| statusFilter !== 'all'/)
  })

  it('filter button keeps menu-open state visually distinct from active-filter state', () => {
    expect(leadsPageSrc).toMatch(/data-\[state=open\]:bg-muted\/50/)
    expect(leadsPageSrc).toMatch(/data-\[state=open\]:text-foreground/)
  })

  it('filter button preserves focus-visible for keyboard users', () => {
    expect(leadsPageSrc).toMatch(/focus-visible:ring-2 focus-visible:ring-primary\/20/)
  })

  it('filter dropdown uses shared markDropdownDismissed to consume outside taps', () => {
    expect(leadsPageSrc).toMatch(/markDropdownDismissed\(\)/)
    expect(leadsPageSrc).not.toMatch(/filterDismissedAtRef/)
  })

  it('conversation title uses a line-height that can share a centerline with the expand icon', () => {
    expect(conversationSrc).toMatch(/<h2[^>]*className="[^"]*leading-tight[^"]*">Conversation<\/h2>/)
  })

  it('conversation expand icon is a fixed size with no hover color on the svg', () => {
    expect(conversationSrc).toMatch(/<Maximize2[^>]*className="[^"]*w-4 h-4 text-foreground\/70[^"]*" \/>/)
  })
})
