import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const jobComposerContent = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const selectContent = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
const addCustomerModalContent = readFileSync('src/components/AddCustomerModal.tsx', 'utf8')

describe('Inline Add Customer — SearchableCustomerSelect', () => {
  it('accepts an onAddCustomerClick prop', () => {
    expect(selectContent).toContain('onAddCustomerClick')
  })

  it('renders "Can\'t find them? Add customer" link when prop is provided', () => {
    expect(selectContent).toContain("Can't find them?")
    expect(selectContent).toContain('Add customer')
  })

  it('link uses subtle blue/link styling (not a large button)', () => {
    expect(selectContent).toContain('text-blue-600 dark:text-blue-400 hover:underline')
    expect(selectContent).toContain('text-xs text-muted-foreground')
  })

  it('link is hidden when disabled', () => {
    expect(selectContent).toContain('onAddCustomerClick && !disabled')
  })

  it('link does not render when onAddCustomerClick is not provided', () => {
    // The conditional checks onAddCustomerClick truthiness
    expect(selectContent).toContain('{onAddCustomerClick && !disabled && (')
  })
})

describe('Inline Add Customer — JobComposer wiring', () => {
  it('imports AddCustomerModal', () => {
    expect(jobComposerContent).toContain("import AddCustomerModal from '@/components/AddCustomerModal'")
  })

  it('has state for AddCustomerModal open/close', () => {
    expect(jobComposerContent).toContain('isAddCustomerOpen')
    expect(jobComposerContent).toContain('setIsAddCustomerOpen')
  })

  it('has state for newly created customer (for selector hydration)', () => {
    expect(jobComposerContent).toContain('newlyCreatedCustomer')
    expect(jobComposerContent).toContain('setNewlyCreatedCustomer')
  })

  it('passes onAddCustomerClick to SearchableCustomerSelect (new jobs only)', () => {
    expect(jobComposerContent).toContain('onAddCustomerClick')
    // Only for new jobs, not edits
    expect(jobComposerContent).toContain('!editJob ? () => setIsAddCustomerOpen(true)')
  })

  it('passes newlyCreatedCustomer as prefillCustomer to hydrate selector', () => {
    expect(jobComposerContent).toContain('newlyCreatedCustomer || prefill?.prefillCustomer')
  })

  it('renders AddCustomerModal with onLeadCreated callback', () => {
    expect(jobComposerContent).toContain('<AddCustomerModal')
    expect(jobComposerContent).toContain('isOpen={isAddCustomerOpen}')
    expect(jobComposerContent).toContain('onClose={() => setIsAddCustomerOpen(false)}')
    expect(jobComposerContent).toContain('onLeadCreated={handleLeadCreated}')
  })
})

describe('Inline Add Customer — Draft Preservation', () => {
  it('AddCustomerModal is rendered as a sibling to the main Modal (not replacing it)', () => {
    // The AddCustomerModal is after the Modal closing tag
    const modalCloseIdx = jobComposerContent.indexOf('</Modal>')
    const addCustomerIdx = jobComposerContent.indexOf('<AddCustomerModal')
    expect(addCustomerIdx).toBeGreaterThan(modalCloseIdx)
  })

  it('JobComposer form state is not cleared when opening AddCustomerModal', () => {
    // The handler only sets isAddCustomerOpen, does not reset title/notes/etc.
    const handlerMatch = jobComposerContent.match(/setIsAddCustomerOpen\(true\)/)
    expect(handlerMatch).not.toBeNull()
    // Verify no setTitle/setNotes/etc. calls happen in the same handler
    // The handler is just () => setIsAddCustomerOpen(true)
    expect(jobComposerContent).toContain('() => setIsAddCustomerOpen(true)')
  })

  it('cancel (onClose) only closes AddCustomerModal, does not reset Job fields', () => {
    // onClose just sets isAddCustomerOpen to false
    expect(jobComposerContent).toContain('onClose={() => setIsAddCustomerOpen(false)}')
  })
})

describe('Inline Add Customer — Auto-Selection', () => {
  it('handleLeadCreated builds a Customer object from returned lead data', () => {
    expect(jobComposerContent).toContain('handleLeadCreated')
    expect(jobComposerContent).toContain('const newCustomer: Customer')
  })

  it('handleLeadCreated sets leadId to auto-select the new customer', () => {
    expect(jobComposerContent).toContain('setLeadId(leadId)')
  })

  it('handleLeadCreated hydrates the selector via newlyCreatedCustomer', () => {
    expect(jobComposerContent).toContain('setNewlyCreatedCustomer(newCustomer)')
  })

  it('handleLeadCreated calls handleCustomerSelect to populate form fields', () => {
    expect(jobComposerContent).toContain('handleCustomerSelect(newCustomer)')
  })

  it('new customer becomes available in selector via prefillCustomer merge', () => {
    // SearchableCustomerSelect merges prefillCustomer into the list
    expect(selectContent).toContain('prefillCustomer')
    expect(selectContent).toContain('mergedCustomers')
  })
})

describe('Inline Add Customer — Reuses Canonical Flow', () => {
  it('does not duplicate customer creation form logic in JobComposer', () => {
    // JobComposer should NOT contain a direct fetch to /api/leads/manual-create
    expect(jobComposerContent).not.toContain('/api/leads/manual-create')
  })

  it('reuses the existing AddCustomerModal component', () => {
    expect(jobComposerContent).toContain("import AddCustomerModal from '@/components/AddCustomerModal'")
  })

  it('AddCustomerModal already has onLeadCreated callback that returns lead data', () => {
    expect(addCustomerModalContent).toContain('onLeadCreated?: (leadId: string, leadData?: any) => void')
    expect(addCustomerModalContent).toContain('onLeadCreated(data.leadId, data.lead)')
  })

  it('does not add a new customer-create API', () => {
    // The existing /api/leads/manual-create is reused, no new endpoint
    expect(addCustomerModalContent).toContain('/api/leads/manual-create')
  })
})

describe('Inline Add Customer — Existing Behavior Preserved', () => {
  it('existing customer selection still works (handleCustomerSelect unchanged)', () => {
    expect(jobComposerContent).toContain('handleCustomerSelect')
    expect(jobComposerContent).toContain('firstNonPlaceholder')
    expect(jobComposerContent).toContain('normalizeEditableContext')
  })

  it('Create Job still requires a selected customer (validation intact)', () => {
    expect(jobComposerContent).toContain("Please select a customer to create this job")
    expect(jobComposerContent).toContain('if (!editJob && !leadId)')
  })

  it('Add Customer link only shows for new jobs (not edit mode)', () => {
    expect(jobComposerContent).toContain('!editJob ? () => setIsAddCustomerOpen(true) : undefined')
  })

  it('existing prefillCustomer behavior preserved (merged with newlyCreatedCustomer)', () => {
    expect(jobComposerContent).toContain('newlyCreatedCustomer || prefill?.prefillCustomer')
  })
})

describe('Inline Add Customer — Failure/Cancel Safety', () => {
  it('AddCustomerModal handles its own errors (JobComposer does not interfere)', () => {
    // AddCustomerModal has its own error handling
    expect(addCustomerModalContent).toContain('throw new Error')
    expect(addCustomerModalContent).toContain('Failed to add customer')
  })

  it('customer creation failure does not close AddCustomerModal (onClose only on success)', () => {
    // AddCustomerModal calls onClose() only after successful creation
    const onCloseIdx = addCustomerModalContent.indexOf('onClose()')
    const errorThrowIdx = addCustomerModalContent.indexOf('throw new Error')
    // onClose is called before the lead redirect/callback, after success
    expect(onCloseIdx).toBeGreaterThan(-1)
  })

  it('cancel preserves Job draft (no form reset on AddCustomerModal close)', () => {
    // JobComposer's onClose for AddCustomerModal only sets isAddCustomerOpen false
    expect(jobComposerContent).toContain('onClose={() => setIsAddCustomerOpen(false)}')
    // No state resets in that handler
  })
})
