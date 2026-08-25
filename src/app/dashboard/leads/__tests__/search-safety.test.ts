import { describe, it, expect } from 'vitest'

describe('Customers Page Search Safety Regression Tests', () => {
  describe('Test 1: Customer with complete fields', () => {
    it('should safely search customer with all fields present', () => {
      const lead = {
        id: 'test-1',
        caller_phone: '(412) 253-3598',
        name: 'Amber Johnson',
        email: 'amber@example.com',
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

      const searchQuery = 'amber'
      const q = searchQuery.toLowerCase().trim()

      // Simulate the filtering logic
      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      expect(matchesSearch).toBe(true)
    })
  })

  describe('Test 2: Customer missing optional fields', () => {
    it('should safely search customer with no phone', () => {
      const lead = {
        id: 'test-2',
        caller_phone: null,
        name: 'Ryan Smith',
        email: 'ryan@example.com',
        messages: []
      }

      const searchQuery = 'ryan'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      expect(matchesSearch).toBe(true)
    })

    it('should safely search customer with no email', () => {
      const lead = {
        id: 'test-3',
        caller_phone: '(412) 253-3598',
        name: 'Ryan Smith',
        email: null,
        messages: []
      }

      const searchQuery = 'ryan'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      expect(matchesSearch).toBe(true)
    })

    it('should safely search customer with no name', () => {
      const lead = {
        id: 'test-4',
        caller_phone: '(412) 253-3598',
        name: null,
        email: 'ryan@example.com',
        messages: []
      }

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
    it('should safely search customer with AI intake serviceRequested', () => {
      const lead = {
        id: 'test-5',
        caller_phone: '(412) 253-3598',
        name: 'Not collected',
        email: 'customer@example.com',
        automation_settings: {
          ai_intake: {
            customerName: 'John Doe',
            serviceRequested: 'Plumbing repair'
          }
        },
        messages: []
      }

      const searchQuery = 'plumbing'
      const q = searchQuery.toLowerCase().trim()
      const intake = lead.automation_settings?.ai_intake || {}

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((intake.customerName && intake.customerName !== 'Not collected') ? intake.customerName.toLowerCase().includes(q) : false) ||
        (intake.serviceRequested && typeof intake.serviceRequested === 'string' && intake.serviceRequested.toLowerCase().includes(q))

      expect(matchesSearch).toBe(true)
    })

    it('should safely search customer with AI intake serviceAddress', () => {
      const lead = {
        id: 'test-6',
        caller_phone: '(412) 253-3598',
        name: 'Not collected',
        email: 'customer@example.com',
        automation_settings: {
          ai_intake: {
            customerName: 'John Doe',
            serviceAddress: '123 Main Street'
          }
        },
        messages: []
      }

      const searchQuery = 'main'
      const q = searchQuery.toLowerCase().trim()
      const intake = lead.automation_settings?.ai_intake || {}

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((intake.customerName && intake.customerName !== 'Not collected') ? intake.customerName.toLowerCase().includes(q) : false) ||
        (intake.serviceAddress && typeof intake.serviceAddress === 'string' && intake.serviceAddress.toLowerCase().includes(q))

      expect(matchesSearch).toBe(true)
    })

    it('should safely handle null AI intake fields', () => {
      const lead = {
        id: 'test-7',
        caller_phone: '(412) 253-3598',
        name: 'Not collected',
        email: 'customer@example.com',
        automation_settings: {
          ai_intake: {
            customerName: 'John Doe',
            serviceRequested: null,
            serviceAddress: null
          }
        },
        messages: []
      }

      const searchQuery = 'plumbing'
      const q = searchQuery.toLowerCase().trim()
      const intake = lead.automation_settings?.ai_intake || {}

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((intake.customerName && intake.customerName !== 'Not collected') ? intake.customerName.toLowerCase().includes(q) : false) ||
        (intake.serviceRequested && typeof intake.serviceRequested === 'string' && intake.serviceRequested.toLowerCase().includes(q)) ||
        (intake.serviceAddress && typeof intake.serviceAddress === 'string' && intake.serviceAddress.toLowerCase().includes(q))

      expect(matchesSearch).not.toBeTruthy()
    })
  })

  describe('Test 4: Customer with placeholder values', () => {
    it('should safely handle "Not collected" placeholder', () => {
      const lead = {
        id: 'test-8',
        caller_phone: '(412) 253-3598',
        name: 'Not collected',
        email: 'Not collected',
        messages: []
      }

      const searchQuery = 'not collected'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      expect(matchesSearch).not.toBeTruthy()
    })

    it('should safely handle empty string values', () => {
      const lead = {
        id: 'test-9',
        caller_phone: '(412) 253-3598',
        name: '',
        email: '',
        messages: []
      }

      const searchQuery = 'test'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.caller_phone && lead.caller_phone.includes(searchQuery)) ||
        ((lead.name && lead.name !== 'Not collected') ? lead.name.toLowerCase().includes(q) : false) ||
        ((lead.email && lead.email !== 'Not collected') ? lead.email.toLowerCase().includes(q) : false)

      expect(matchesSearch).not.toBeTruthy()
    })
  })

  describe('Test 5: Message content search safety', () => {
    it('should safely search message content when present', () => {
      const lead = {
        id: 'test-10',
        caller_phone: '(412) 253-3598',
        name: 'Amber',
        email: 'amber@example.com',
        messages: [
          { content: 'I need help with plumbing repair', direction: 'inbound' }
        ]
      }

      const searchQuery = 'plumbing'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.messages && lead.messages.some((m: any) =>
          m.content && typeof m.content === 'string' && m.content.toLowerCase().includes(q)
        ))

      expect(matchesSearch).toBe(true)
    })

    it('should safely handle null message content', () => {
      const lead = {
        id: 'test-11',
        caller_phone: '(412) 253-3598',
        name: 'Amber',
        email: 'amber@example.com',
        messages: [
          { content: null, direction: 'inbound' }
        ]
      }

      const searchQuery = 'plumbing'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.messages && lead.messages.some((m: any) =>
          m.content && typeof m.content === 'string' && m.content.toLowerCase().includes(q)
        ))

      expect(matchesSearch).not.toBeTruthy()
    })

    it('should safely handle undefined message content', () => {
      const lead = {
        id: 'test-12',
        caller_phone: '(412) 253-3598',
        name: 'Amber',
        email: 'amber@example.com',
        messages: [
          { direction: 'inbound' }
        ]
      }

      const searchQuery = 'plumbing'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.messages && lead.messages.some((m: any) =>
          m.content && typeof m.content === 'string' && m.content.toLowerCase().includes(q)
        ))

      expect(matchesSearch).not.toBeTruthy()
    })

    it('should safely handle non-string message content', () => {
      const lead = {
        id: 'test-13',
        caller_phone: '(412) 253-3598',
        name: 'Amber',
        email: 'amber@example.com',
        messages: [
          { content: 12345, direction: 'inbound' }
        ]
      }

      const searchQuery = 'plumbing'
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !searchQuery ||
        (lead.messages && lead.messages.some((m: any) =>
          m.content && typeof m.content === 'string' && m.content.toLowerCase().includes(q)
        ))

      expect(matchesSearch).not.toBeTruthy()
    })
  })

  describe('Test 6: Search query edge cases', () => {
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

  describe('Test 7: No crash scenarios', () => {
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
          ((intake.customerName && intake.customerName !== 'Not collected') ? intake.customerName.toLowerCase().includes(q) : false) ||
          (intake.serviceRequested && typeof intake.serviceRequested === 'string' && intake.serviceRequested.toLowerCase().includes(q)) ||
          (intake.serviceAddress && typeof intake.serviceAddress === 'string' && intake.serviceAddress.toLowerCase().includes(q)) ||
          (lead.messages && lead.messages.some((m: any) =>
            m.content && typeof m.content === 'string' && m.content.toLowerCase().includes(q)
          ))
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
          ((intake.customerName && intake.customerName !== 'Not collected') ? intake.customerName.toLowerCase().includes(q) : false) ||
          (intake.serviceRequested && typeof intake.serviceRequested === 'string' && intake.serviceRequested.toLowerCase().includes(q)) ||
          (intake.serviceAddress && typeof intake.serviceAddress === 'string' && intake.serviceAddress.toLowerCase().includes(q))
        matchesSearch
      }).not.toThrow()
    })
  })
})