import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/app/dashboard/DashboardContent.tsx', 'utf8')

describe('Dashboard feedback card bottom spacing', () => {
  it('adds extra bottom margin to keep the feedback card clear of the floating bottom nav', () => {
    const block = content.match(/Beta Feedback Card[\s\S]*?hover:shadow-md[^>]*/)?.[0] || ''
    expect(block).toContain('mb-5')
  })
})
