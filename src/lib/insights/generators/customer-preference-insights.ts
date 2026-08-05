import { Insight, InsightContext, InsightGenerator } from '../types'
import { memoryService } from '@/lib/business-memory/memory-service'
import { buildCustomerMemory } from '@/lib/business-memory/memory-builder'

export const customerPreferenceInsightsGenerator: InsightGenerator = {
  type: 'customer-preference',
  generate: async (context: InsightContext): Promise<Insight[]> => {
    const insights: Insight[] = []
    const { businessId, supabase, customerId } = context

    // Customer preference insights only for specific customer
    if (!customerId) {
      return insights
    }

    // Fetch Business Memory for customer
    let customerMemory = memoryService.getCustomerMemory(businessId, customerId)
    
    // If not cached, build it
    if (!customerMemory) {
      try {
        const { data: messages } = await supabase
          .from('messages')
          .select('created_at, direction, type')
          .eq('lead_id', customerId)
          .eq('business_id', businessId)
        
        const { data: jobs } = await supabase
          .from('jobs')
          .select('created_at, status, amount, service, scheduled_date')
          .eq('lead_id', customerId)
          .eq('business_id', businessId)
        
        const { data: payments } = await supabase
          .from('payment_requests')
          .select('created_at, amount_cents, status')
          .eq('lead_id', customerId)
          .eq('business_id', businessId)
        
        customerMemory = buildCustomerMemory(customerId, businessId, {
          messages: messages || [],
          jobs: jobs || [],
          payments: payments?.map((p: any) => ({
            created_at: p.created_at,
            amount: p.amount_cents / 100,
            status: p.status
          })) || []
        })
        
        memoryService.setCustomerMemory(businessId, customerId, customerMemory)
      } catch (error) {
        console.error('[CustomerPreferenceInsights] Error building customer memory:', error)
      }
    }

    // Use Business Memory to generate preference insights
    // Only show insights when confidence is high (>= 70)
    
    if (customerMemory?.repeatCustomer && customerMemory.repeatCustomerProvenance?.confidence && customerMemory.repeatCustomerProvenance.confidence >= 70) {
      insights.push({
        id: 'repeat-customer',
        type: 'customer-preference',
        category: 'customers',
        priority: 'low',
        title: 'Repeat customer',
        description: `Has completed ${customerMemory.jobCount} jobs`,
        actionable: false,
        customerId,
        confidence: customerMemory.repeatCustomerProvenance.confidence,
        reason: customerMemory.repeatCustomerProvenance.explanation || 'Customer has completed multiple jobs',
        metadata: { 
          source: 'business_memory',
          memoryField: 'repeatCustomer',
          jobCount: customerMemory.jobCount
        },
        createdAt: customerMemory.updatedAt
      })
    }

    if (customerMemory?.preferredContactMethod && customerMemory.preferredContactMethod !== 'any' && customerMemory.preferredContactMethodProvenance?.confidence && customerMemory.preferredContactMethodProvenance.confidence >= 70) {
      const methodMap: Record<string, string> = {
        sms: 'SMS',
        call: 'Call',
        email: 'Email',
        any: 'Any'
      }
      insights.push({
        id: 'preferred-contact-method',
        type: 'customer-preference',
        category: 'customers',
        priority: 'low',
        title: `Prefers ${methodMap[customerMemory.preferredContactMethod]}`,
        description: `Based on ${customerMemory.preferredContactMethodProvenance.sampleSize} communications`,
        actionable: false,
        customerId,
        confidence: customerMemory.preferredContactMethodProvenance.confidence,
        reason: customerMemory.preferredContactMethodProvenance.explanation || `Customer shows preference for ${customerMemory.preferredContactMethod}`,
        metadata: { 
          source: 'business_memory',
          memoryField: 'preferredContactMethod',
          preferredMethod: customerMemory.preferredContactMethod
        },
        createdAt: customerMemory.updatedAt
      })
    }

    if (customerMemory?.favoriteService && customerMemory.favoriteServiceProvenance?.confidence && customerMemory.favoriteServiceProvenance.confidence >= 70) {
      insights.push({
        id: 'favorite-service',
        type: 'customer-preference',
        category: 'customers',
        priority: 'low',
        title: `Frequently requests ${customerMemory.favoriteService}`,
        description: `Most requested service`,
        actionable: false,
        customerId,
        confidence: customerMemory.favoriteServiceProvenance.confidence,
        reason: customerMemory.favoriteServiceProvenance.explanation || `Customer frequently requests ${customerMemory.favoriteService}`,
        metadata: { 
          source: 'business_memory',
          memoryField: 'favoriteService',
          service: customerMemory.favoriteService
        },
        createdAt: customerMemory.updatedAt
      })
    }

    if (customerMemory?.lifetimeRevenue && customerMemory.lifetimeRevenueProvenance?.confidence && customerMemory.lifetimeRevenueProvenance.confidence >= 70) {
      const revenue = customerMemory.lifetimeRevenue.toFixed(2)
      insights.push({
        id: 'lifetime-value',
        type: 'customer-preference',
        category: 'customers',
        priority: 'low',
        title: `Lifetime value: $${revenue}`,
        description: 'Total revenue from this customer',
        actionable: false,
        customerId,
        confidence: customerMemory.lifetimeRevenueProvenance.confidence,
        reason: customerMemory.lifetimeRevenueProvenance.explanation || `Customer has generated $${revenue} in lifetime revenue`,
        metadata: { 
          source: 'business_memory',
          memoryField: 'lifetimeRevenue',
          lifetimeRevenue: customerMemory.lifetimeRevenue
        },
        createdAt: customerMemory.updatedAt
      })
    }

    return insights
  }
}
