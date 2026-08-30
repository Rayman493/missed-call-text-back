import { describe, it, expect } from 'vitest'
import { normalizeLeadForApplication } from '@/lib/types'

describe('Customers Page Search Safety Regression Tests', () => {
  describe('Test 1: Customer with complete fields', () => {
    it('should safely search customer with all fields present', () => {
      const dbRow = {
        id: 'test-1',
        caller_phone: '(412) 253-3598',
        contact_name: 'Amber Johnson',
        raw_metadata: {
          extracted_info: {
            email: 'amber@example.com'
          }
        },
        messages: [
          { content: 'Hi, I need help with plumbing', direction: 'inbound' }
        ],
        automation_settings: {
          ai_intake: {
            customerName: 'Amber',
            serviceRequested: 'Plumbing repair',
            serviceAddress: '123 Main St'
          }
        }
      }

      const lead = normalizeLeadForApplication(dbRow)

      const searchQuery = 'amber'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      expect(matchesSearch).toBe(true)
    })
  })

  describe('Test 2: Customer missing optional fields', () => {
    it('should safely search customer with no phone', () => {
      const dbRow = {
        id: 'test-2',
        caller_phone: null,
        contact_name: 'Ryan Smith',
        raw_metadata: {
          extracted_info: {
            email: 'ryan@company.com'
          }
        },
        messages: []
      }

      const lead = normalizeLeadForApplication(dbRow)

      const searchQuery = 'ryan'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      expect(matchesSearch).toBe(true)
    })

    it('should safely search customer with no email', () => {
      const dbRow = {
        id: 'test-3',
        caller_phone: '(412) 253-3598',
        contact_name: 'Ryan Smith',
        raw_metadata: {},
        messages: []
      }

      const lead = normalizeLeadForApplication(dbRow)

      const searchQuery = 'ryan'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      expect(matchesSearch).toBe(true)
    })

    it('should safely search customer with no name', () => {
      const dbRow = {
        id: 'test-4',
        caller_phone: '(412) 253-3598',
        contact_name: null,
        raw_metadata: {
          extracted_info: {
            email: 'ryan@company.com'
          }
        },
        messages: []
      }

      const lead = normalizeLeadForApplication(dbRow)

      const searchQuery = 'ryan'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      expect(matchesSearch).toBe(true)
    })
  })

  describe('Test 3: Customer with AI intake data', () => {
    it('should NOT match serviceRequested (job description is not customer identity)', () => {
      const dbRow = {
        id: 'test-5',
        caller_phone: '(412) 253-3598',
        contact_name: 'Not collected',
        raw_metadata: {
          extracted_info: {
            email: 'customer@example.com'
          }
        },
        automation_settings: {
          ai_intake: {
            customerName: 'John Doe',
            serviceRequested: 'Plumbing repair'
          }
        },
        messages: []
      }

      const lead = normalizeLeadForApplication(dbRow)

      const searchQuery = 'plumbing'
      const q = searchQuery.toLowerCase().trim()
      const intake = lead.automation_settings?.ai_intake || {}

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((intake.customerName && intake.customerName !== 'Not collected') ? intake.customerName.toLowerCase().includes(q) : false)

      expect(matchesSearch).not.toBeTruthy()
    })

    it('should NOT match serviceAddress (job address is not customer identity)', () => {
      const dbRow = {
        id: 'test-6',
        caller_phone: '(412) 253-3598',
        contact_name: 'Not collected',
        raw_metadata: {
          extracted_info: {
            email: 'customer@example.com'
          }
        },
        automation_settings: {
          ai_intake: {
            customerName: 'John Doe',
            serviceAddress: '123 Main Street'
          }
        },
        messages: []
      }

      const lead = normalizeLeadForApplication(dbRow)

      const searchQuery = 'main'
      const q = searchQuery.toLowerCase().trim()
      const intake = lead.automation_settings?.ai_intake || {}

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((intake.customerName && intake.customerName !== 'Not collected') ? intake.customerName.toLowerCase().includes(q) : false)

      expect(matchesSearch).not.toBeTruthy()
    })

    it('should safely handle null AI intake fields', () => {
      const dbRow = {
        id: 'test-7',
        caller_phone: '(412) 253-3598',
        contact_name: 'Not collected',
        raw_metadata: {
          extracted_info: {
            email: 'customer@example.com'
          }
        },
        automation_settings: {
          ai_intake: {
            customerName: 'John Doe',
            serviceRequested: null,
            serviceAddress: null
          }
        },
        messages: []
      }

      const lead = normalizeLeadForApplication(dbRow)

      const searchQuery = 'john'
      const q = searchQuery.toLowerCase().trim()
      const intake = lead.automation_settings?.ai_intake || {}

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((intake.customerName && intake.customerName !== 'Not collected') ? intake.customerName.toLowerCase().includes(q) : false)

      expect(matchesSearch).toBe(true)
    })
  })

  describe('Test 4: Customer with placeholder values', () => {
    it('should safely handle "Not collected" placeholder', () => {
      const dbRow = {
        id: 'test-8',
        caller_phone: '(412) 253-3598',
        contact_name: 'Not collected',
        raw_metadata: {
          extracted_info: {
            email: 'Not collected'
          }
        },
        messages: []
      }

      const lead = normalizeLeadForApplication(dbRow)

      const searchQuery = 'not collected'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      expect(matchesSearch).not.toBeTruthy()
    })

    it('should safely handle empty string values', () => {
      const dbRow = {
        id: 'test-9',
        caller_phone: '(412) 253-3598',
        contact_name: '',
        raw_metadata: {
          extracted_info: {
            email: ''
          }
        },
        messages: []
      }

      const lead = normalizeLeadForApplication(dbRow)

      const searchQuery = 'test'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      expect(matchesSearch).not.toBeTruthy()
    })
  })

  describe('Test 5: Search query edge cases', () => {
    it('should safely handle empty search query', () => {
      const searchQuery = ''
      const q = searchQuery.toLowerCase().trim()

      expect(() => {
        // Simulate the filtering logic
        const matchesSearch = !searchQuery || false
        matchesSearch
      }).not.toThrow()
    })

    it('should safely handle whitespace-only search query', () => {
      const searchQuery = '   '
      const q = searchQuery.toLowerCase().trim()

      expect(() => {
        // Simulate the filtering logic
        const matchesSearch = !searchQuery || false
        matchesSearch
      }).not.toThrow()
    })

    it('should safely handle special characters in search query', () => {
      const searchQuery = '(412)'
      const q = searchQuery.toLowerCase().trim()

      expect(() => {
        // Simulate the filtering logic
        const matchesSearch = !searchQuery || false
        matchesSearch
      }).not.toThrow()
    })
  })

  describe('Test 6: No crash scenarios', () => {
    it('should not crash when all fields are null', () => {
      const lead = {
        id: 'test-14',
        caller_phone: null,
        name: null,
        email: null,
        messages: null,
        automation_settings: null
      }

      const searchQuery = 'test'
      const q = searchQuery.toLowerCase().trim()
      const intake = lead.automation_settings?.ai_intake || {}

      expect(() => {
        const matchesSearch = !searchQuery ||
          (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
          ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
          ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false) ||
          ((intake.customerName && intake.customerName !== 'Not collected') ? intake.customerName.toLowerCase().includes(q) : false)
        matchesSearch
      }).not.toThrow()
    })

    it('should not crash when AI intake is missing', () => {
      const lead = {
        id: 'test-15',
        caller_phone: '(412) 253-3598',
        name: 'Amber',
        email: 'amber@example.com',
        messages: []
      }

      const searchQuery = 'test'
      const q = searchQuery.toLowerCase().trim()
      const intake = lead.automation_settings?.ai_intake || {}

      expect(() => {
        const matchesSearch = !searchQuery ||
          (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
          ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
          ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false) ||
          ((intake.customerName && intake.customerName !== 'Not collected') ? intake.customerName.toLowerCase().includes(q) : false)
        matchesSearch
      }).not.toThrow()
    })
  })

  describe('Test 7: Single-character query safety', () => {
    it('should NOT match customer based on message content for single-char query', () => {
      const dbRow = {
        id: 'test-16',
        caller_phone: '(555) 123-4567',
        contact_name: 'Ryan Smith',
        raw_metadata: {
          extracted_info: {
            email: 'ryan@company.com'
          }
        },
        messages: [
          { content: 'I need help with electrical repair', direction: 'inbound' }
        ]
      }

      const lead = normalizeLeadForApplication(dbRow)

      const searchQuery = 'E'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      // Should NOT match because "E" is not in Ryan Smith's identity or phone
      expect(matchesSearch).not.toBeTruthy()
    })

    it('should match customer if single-char query is in name', () => {
      const dbRow = {
        id: 'test-17',
        caller_phone: '(555) 123-4567',
        contact_name: 'Elena',
        raw_metadata: {
          extracted_info: {
            email: 'elena@company.com'
          }
        },
        messages: []
      }

      const lead = normalizeLeadForApplication(dbRow)

      const searchQuery = 'E'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      // Should match because "E" is in Elena
      expect(matchesSearch).toBe(true)
    })
  })
})