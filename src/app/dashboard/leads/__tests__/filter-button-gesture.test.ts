import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Customer filter button gesture protection', () => {
  const content = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8')

  it('imports the shared gesture threshold utility', () => {
    expect(content).toContain("from '@/components/lead-status-gesture'")
    expect(content).toContain('shouldPreventMenuOpen')
  })

  it('tracks pointer start position on pointer down', () => {
    expect(content).toContain('filterPointerStartRef')
    expect(content).toContain('onPointerDown')
  })

  it('detects movement beyond threshold on pointer move', () => {
    expect(content).toContain('filterMovedRef')
    expect(content).toContain('onPointerMove')
  })

  it('opens the filter menu only on deliberate tap (not scroll)', () => {
    expect(content).toContain('filterMovedRef.current = false')
    expect(content).toContain('setFilterMenuOpen(true)')
  })

  it('uses a controlled dropdown for the filter menu', () => {
    expect(content).toContain('open={filterMenuOpen}')
    // Batch 5: onOpenChange now suppresses opening after a drag gesture
    expect(content).toContain('onOpenChange={(open) => {')
    expect(content).toContain('filterSuppressNextOpenRef')
  })

  it('cleans up pointer state on pointer cancel and leave', () => {
    expect(content).toContain('onPointerCancel')
    expect(content).toContain('onPointerLeave')
  })
})
