// Client-side API for smart filtering operations
// This avoids server-only import issues in client components

interface NumberEntry {
  id: string
  phone_number: string
  name?: string
  notes?: string
  created_at: string
}

interface FilteringLog {
  id: string
  caller_phone: string
  call_sid?: string
  decision: string
  reason: string
  filter_details?: any
  created_at: string
}

class SmartFilteringAPI {
  private baseUrl = '/api/smart-filtering'

  async getAllowedNumbers(businessId: string): Promise<NumberEntry[]> {
    const response = await fetch(`${this.baseUrl}?businessId=${businessId}&action=allowed-numbers`)
    if (!response.ok) {
      throw new Error('Failed to fetch allowed numbers')
    }
    const result = await response.json()
    return result.data || []
  }

  async getBlockedNumbers(businessId: string): Promise<NumberEntry[]> {
    const response = await fetch(`${this.baseUrl}?businessId=${businessId}&action=blocked-numbers`)
    if (!response.ok) {
      throw new Error('Failed to fetch blocked numbers')
    }
    const result = await response.json()
    return result.data || []
  }

  async getPersonalContactNumbers(businessId: string): Promise<NumberEntry[]> {
    const response = await fetch(`${this.baseUrl}?businessId=${businessId}&action=personal-contacts`)
    if (!response.ok) {
      throw new Error('Failed to fetch personal contacts')
    }
    const result = await response.json()
    return result.data || []
  }

  async getFilteringDecisionLogs(businessId: string, limit: number = 50): Promise<FilteringLog[]> {
    const response = await fetch(`${this.baseUrl}?businessId=${businessId}&action=decision-logs&limit=${limit}`)
    if (!response.ok) {
      throw new Error('Failed to fetch decision logs')
    }
    const result = await response.json()
    return result.data || []
  }

  async createAllowedNumber(businessId: string, phoneNumber: string, notes?: string): Promise<NumberEntry> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        businessId,
        action: 'add-allowed',
        data: { phoneNumber, notes }
      })
    })
    
    if (!response.ok) {
      throw new Error('Failed to create allowed number')
    }
    
    const result = await response.json()
    return result.data
  }

  async createBlockedNumber(businessId: string, phoneNumber: string, notes?: string): Promise<NumberEntry> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        businessId,
        action: 'add-blocked',
        data: { phoneNumber, notes }
      })
    })
    
    if (!response.ok) {
      throw new Error('Failed to create blocked number')
    }
    
    const result = await response.json()
    return result.data
  }

  async createPersonalContactNumber(
    businessId: string, 
    phoneNumber: string, 
    name?: string, 
    notes?: string
  ): Promise<NumberEntry> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        businessId,
        action: 'add-personal',
        data: { phoneNumber, name, notes }
      })
    })
    
    if (!response.ok) {
      throw new Error('Failed to create personal contact')
    }
    
    const result = await response.json()
    return result.data
  }

  async deleteAllowedNumber(businessId: string, phoneNumber: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}?businessId=${businessId}&action=allowed&phoneNumber=${encodeURIComponent(phoneNumber)}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      throw new Error('Failed to delete allowed number')
    }
    
    const result = await response.json()
    return result.success
  }

  async deleteBlockedNumber(businessId: string, phoneNumber: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}?businessId=${businessId}&action=blocked&phoneNumber=${encodeURIComponent(phoneNumber)}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      throw new Error('Failed to delete blocked number')
    }
    
    const result = await response.json()
    return result.success
  }

  async deletePersonalContactNumber(businessId: string, phoneNumber: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}?businessId=${businessId}&action=personal&phoneNumber=${encodeURIComponent(phoneNumber)}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      throw new Error('Failed to delete personal contact')
    }
    
    const result = await response.json()
    return result.success
  }
}

export const smartFilteringAPI = new SmartFilteringAPI()
export type { NumberEntry, FilteringLog }
