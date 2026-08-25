/**
 * Customer Association Resolution Tests
 *
 * Tests the canonical customer association logic used by ScheduleMap.
 * These are pure data logic tests that don't require Google Maps.
 */

import { describe, it, expect } from 'vitest'

describe('Customer Association Resolution', () => {
  describe('getCustomerNameFromLead', () => {
    it('should extract customerName from raw_metadata', () => {
      const lead = {
        id: 'lead-1',
        caller_phone: '+1234567890',
        raw_metadata: {
          customerName: 'Amber Smith'
        }
      }

      const result = extractCustomerName(lead)
      expect(result).toBe('Amber Smith')
    })

    it('should fall back to callerName if customerName is missing', () => {
      const lead = {
        id: 'lead-1',
        caller_phone: '+1234567890',
        raw_metadata: {
          callerName: 'Amber Smith'
        }
      }

      const result = extractCustomerName(lead)
      expect(result).toBe('Amber Smith')
    })

    it('should fall back to name if customerName and callerName are missing', () => {
      const lead = {
        id: 'lead-1',
        caller_phone: '+1234567890',
        raw_metadata: {
          name: 'Amber Smith'
        }
      }

      const result = extractCustomerName(lead)
      expect(result).toBe('Amber Smith')
    })

    it('should return null if no name fields exist', () => {
      const lead = {
        id: 'lead-1',
        caller_phone: '+1234567890',
        raw_metadata: {
          address: '123 Main St'
        }
      }

      const result = extractCustomerName(lead)
      expect(result).toBeNull()
    })

    it('should return null if raw_metadata is missing', () => {
      const lead = {
        id: 'lead-1',
        caller_phone: '+1234567890'
      }

      const result = extractCustomerName(lead)
      expect(result).toBeNull()
    })

    it('should return null if lead is null', () => {
      const result = extractCustomerName(null)
      expect(result).toBeNull()
    })
  })

  describe('customer resolution precedence', () => {
    it('should prefer job.customer_name over lead metadata', () => {
      const job = {
        id: 'job-1',
        customer_name: 'Job Customer Name',
        lead_id: 'lead-1',
        leads: {
          raw_metadata: {
            customerName: 'Lead Customer Name'
          }
        }
      }

      const result = resolveJobCustomerName(job, new Map())
      expect(result).toBe('Job Customer Name')
    })

    it('should use lead metadata if job.customer_name is null', () => {
      const job = {
        id: 'job-1',
        customer_name: null,
        lead_id: 'lead-1',
        leads: {
          raw_metadata: {
            customerName: 'Lead Customer Name'
          }
        }
      }

      const result = resolveJobCustomerName(job, new Map())
      expect(result).toBe('Lead Customer Name')
    })

    it('should use lead cache if job.customer_name and leads are null', () => {
      const job = {
        id: 'job-1',
        customer_name: null,
        lead_id: 'lead-1',
        leads: null
      }

      const leadCache = new Map([['lead-1', { name: 'Cached Customer Name', phone: '+1234567890' }]])

      const result = resolveJobCustomerName(job, leadCache)
      expect(result).toBe('Cached Customer Name')
    })

    it('should return null if all sources are null', () => {
      const job = {
        id: 'job-1',
        customer_name: null,
        lead_id: 'lead-1',
        leads: null
      }

      const leadCache = new Map()

      const result = resolveJobCustomerName(job, leadCache)
      expect(result).toBeNull()
    })
  })

  describe('event customer resolution', () => {
    it('should use linked job customer_name', () => {
      const event = {
        id: 'event-1',
        summary: 'Appointment',
        extendedProperties: {
          private: {
            replyflow_lead_id: 'lead-1'
          }
        }
      }

      const jobs = [
        {
          id: 'job-1',
          google_calendar_event_id: 'event-1',
          customer_name: 'Job Customer',
          lead_id: 'lead-1'
        }
      ]

      const result = resolveEventCustomer(event, jobs, new Map())
      expect(result.customerName).toBe('Job Customer')
      expect(result.leadId).toBe('lead-1')
    })

    it('should use replyflow_lead_id from extendedProperties when no linked job', () => {
      const event = {
        id: 'event-1',
        summary: 'Appointment',
        extendedProperties: {
          private: {
            replyflow_lead_id: 'lead-1'
          }
        }
      }

      const jobs = []
      const leadCache = new Map([['lead-1', { name: 'Amber', phone: '+1234567890' }]])

      const result = resolveEventCustomer(event, jobs, leadCache)
      expect(result.customerName).toBe('Amber')
      expect(result.leadId).toBe('lead-1')
    })

    it('should use job with matching lead_id when no linked job by event_id', () => {
      const event = {
        id: 'event-1',
        summary: 'Appointment',
        extendedProperties: {
          private: {
            replyflow_lead_id: 'lead-1'
          }
        }
      }

      const jobs = [
        {
          id: 'job-1',
          google_calendar_event_id: 'different-event',
          customer_name: 'Job Customer',
          lead_id: 'lead-1'
        }
      ]

      const result = resolveEventCustomer(event, jobs, new Map())
      expect(result.customerName).toBe('Job Customer')
      expect(result.leadId).toBe('lead-1')
    })

    it('should return null for external event with no association', () => {
      const event = {
        id: 'event-1',
        summary: 'External Meeting',
        extendedProperties: {}
      }

      const jobs = []
      const leadCache = new Map()

      const result = resolveEventCustomer(event, jobs, leadCache)
      expect(result.customerName).toBeNull()
      expect(result.leadId).toBeNull()
    })

    it('should return leadId even if customer name is not yet cached', () => {
      const event = {
        id: 'event-1',
        summary: 'Appointment',
        extendedProperties: {
          private: {
            replyflow_lead_id: 'lead-1'
          }
        }
      }

      const jobs = []
      const leadCache = new Map() // Not cached yet

      const result = resolveEventCustomer(event, jobs, leadCache)
      expect(result.customerName).toBeNull()
      expect(result.leadId).toBe('lead-1')
    })
  })

  describe('genuinely unassociated items', () => {
    it('should resolve null for job with no customer', () => {
      const job = {
        id: 'job-1',
        customer_name: null,
        lead_id: null,
        leads: null
      }

      const result = resolveJobCustomerName(job, new Map())
      expect(result).toBeNull()
    })

    it('should resolve null for task with no customer', () => {
      const task = {
        id: 'task-1',
        lead_id: null
      }

      const result = resolveTaskCustomerName(task, new Map())
      expect(result).toBeNull()
    })

    it('should resolve null for external Google event', () => {
      const event = {
        id: 'event-1',
        summary: 'External Meeting',
        extendedProperties: {}
      }

      const result = resolveEventCustomer(event, [], new Map())
      expect(result.customerName).toBeNull()
      expect(result.leadId).toBeNull()
    })
  })
})

// Helper functions extracted from ScheduleMap for testing
function extractCustomerName(lead: any): string | null {
  if (!lead) return null
  const meta = lead.raw_metadata || {}
  return meta.customerName || meta.callerName || meta.name || null
}

function resolveJobCustomerName(job: any, leadCache: Map<string, { name: string | null; phone: string | null }>): string | null {
  let customerName = job.customer_name
  if (!customerName && job.leads?.raw_metadata) {
    customerName = extractCustomerName(job.leads)
  }
  if (!customerName && job.lead_id && leadCache.has(job.lead_id)) {
    customerName = leadCache.get(job.lead_id)?.name || null
  }
  return customerName
}

function resolveEventCustomer(event: any, jobs: any[], leadCache: Map<string, { name: string | null; phone: string | null }>): { customerName: string | null; customerPhone: string | null; leadId: string | null } {
  const linkedJob = jobs.find(job => job.google_calendar_event_id === event.id)
  if (linkedJob) {
    let customerName = linkedJob.customer_name
    if (!customerName && linkedJob.lead_id && leadCache.has(linkedJob.lead_id)) {
      customerName = leadCache.get(linkedJob.lead_id)?.name || null
    }
    return {
      customerName,
      customerPhone: linkedJob.customer_phone,
      leadId: linkedJob.lead_id
    }
  }

  const replyLeadId = event?.extendedProperties?.private?.replyflow_lead_id as string | undefined
  if (replyLeadId) {
    const jobWithLead = jobs.find(job => job.lead_id === replyLeadId)
    if (jobWithLead) {
      let customerName = jobWithLead.customer_name
      if (!customerName && leadCache.has(replyLeadId)) {
        customerName = leadCache.get(replyLeadId)?.name || null
      }
      return {
        customerName,
        customerPhone: jobWithLead.customer_phone,
        leadId: replyLeadId
      }
    }
    if (leadCache.has(replyLeadId)) {
      const leadData = leadCache.get(replyLeadId)!
      return {
        customerName: leadData.name,
        customerPhone: leadData.phone,
        leadId: replyLeadId
      }
    }
    return {
      customerName: null,
      customerPhone: null,
      leadId: replyLeadId
    }
  }

  return {
    customerName: null,
    customerPhone: null,
    leadId: null
  }
}

function resolveTaskCustomerName(task: any, leadCache: Map<string, { name: string | null; phone: string | null }>): string | null {
  // Tasks currently don't have customer association in the schema
  // This function is a placeholder for future enhancement
  if (task.lead_id && leadCache.has(task.lead_id)) {
    return leadCache.get(task.lead_id)?.name || null
  }
  return null
}