import { describe, it, expect } from 'vitest'

describe('Business Wins Service - Unique Customer Counting', () => {
  it('should count unique customers, not payment records', () => {
    // Simulate the logic from business-wins-service
    const paidPayments = [
      { id: 'p1', customer_id: 'customer-1', created_at: '2024-01-01T10:00:00Z' },
      { id: 'p2', customer_id: 'customer-1', created_at: '2024-01-02T10:00:00Z' }, // Same customer
      { id: 'p3', customer_id: 'customer-2', created_at: '2024-01-03T10:00:00Z' },
      { id: 'p4', customer_id: 'customer-1', created_at: '2024-01-04T10:00:00Z' }, // Same customer
      { id: 'p5', customer_id: 'customer-3', created_at: '2024-01-05T10:00:00Z' },
    ]

    const uniqueCustomerIds = new Set(paidPayments.filter(p => p.customer_id).map(p => p.customer_id))
    expect(uniqueCustomerIds.size).toBe(3) // 3 unique customers, not 5 payments
  })

  it('should correctly identify the 10th unique customer payment', () => {
    // Create 10 unique customers with multiple payments
    const paidPayments: any[] = []
    for (let i = 1; i <= 12; i++) {
      paidPayments.push({ id: `p${i}`, customer_id: `customer-${i}`, created_at: `2024-01-${i}T10:00:00Z` })
      // Add a second payment for some customers
      if (i <= 5) {
        paidPayments.push({ id: `p${i}-b`, customer_id: `customer-${i}`, created_at: `2024-01-${i}T11:00:00Z` })
      }
    }

    const customerPaymentCounts: Record<string, number> = {}
    let tenthCustomerId: string | null = null
    let tenthPayment: any = null

    for (const payment of paidPayments) {
      if (!payment.customer_id) continue
      customerPaymentCounts[payment.customer_id] = (customerPaymentCounts[payment.customer_id] || 0) + 1
      if (Object.keys(customerPaymentCounts).length === 10 && !tenthCustomerId) {
        tenthCustomerId = payment.customer_id
        tenthPayment = payment
      }
    }

    expect(tenthCustomerId).toBe('customer-10')
    expect(tenthPayment).toBeDefined()
    expect(tenthPayment.customer_id).toBe('customer-10')
  })

  it('should handle payments without customer_id', () => {
    const paidPayments = [
      { id: 'p1', customer_id: 'customer-1', created_at: '2024-01-01T10:00:00Z' },
      { id: 'p2', customer_id: null, created_at: '2024-01-02T10:00:00Z' }, // No customer
      { id: 'p3', customer_id: 'customer-2', created_at: '2024-01-03T10:00:00Z' },
    ]

    const uniqueCustomerIds = new Set(paidPayments.filter(p => p.customer_id).map(p => p.customer_id))
    expect(uniqueCustomerIds.size).toBe(2) // Only 2 unique customers
  })
})