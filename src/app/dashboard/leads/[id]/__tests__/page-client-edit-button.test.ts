import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

describe('Customer page local edit button removal', () => {
  it('no longer renders a local pencil edit button in the conversation header', () => {
    expect(content).not.toMatch(/aria-label="Edit customer"/)
    expect(content).not.toContain('title="Edit customer"')
    expect(content).not.toContain('<Pencil className="w-4 h-4" />')
  })

  it('does not import the Pencil icon for the removed button', () => {
    expect(content).not.toContain('Pencil,')
  })

  it('keeps the EditCustomerModal wired to the shared state', () => {
    expect(content).toContain('showEditCustomer')
    expect(content).toContain('<EditCustomerModal')
  })
})
