import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('JobComposer duplicate Customer Name', () => {
  const content = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')

  it('uses the shared DatePicker and TimePicker components', () => {
    expect(content).toContain("import DatePicker from '@/components/ui/DatePicker'")
    expect(content).toContain("import TimePicker from '@/components/ui/TimePicker'")
    expect(content).toContain('<DatePicker')
    expect(content).toContain('<TimePicker')
  })

  it('hides the redundant read-only Customer Name field when a linked customer is selected', () => {
    // The old block rendered a "Customer Name" label + read-only input when leadId was set.
    // It should be removed so the SearchableCustomerSelect is the single source of the name.
    expect(content).not.toContain("Customer Name")
  })

  it('preserves the read-only Phone field for linked customers', () => {
    expect(content).toContain('customerPhone')
    expect(content).toContain('readOnly')
  })

  it('still sends customer_name in the save payload', () => {
    expect(content).toContain('customer_name: customerName.trim()')
  })
})
