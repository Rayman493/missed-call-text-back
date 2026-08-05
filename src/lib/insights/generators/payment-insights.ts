import { Insight, InsightContext, InsightGenerator, InsightPriority } from '../types'
import { formatRelativeTime } from '@/lib/utils'
import { memoryService } from '@/lib/business-memory/memory-service'
import { buildCustomerMemory } from '@/lib/business-memory/memory-builder'

export const paymentInsightsGenerator: InsightGenerator = {
  type: 'payment',
  generate: async (context: InsightContext): Promise<Insight[]> => {
    const insights: Insight[] = []
    const { businessId, supabase, customerId } = context

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Payment pending for specific customer (for customer detail)
    if (customerId) {
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
          console.error('[PaymentInsights] Error building customer memory:', error)
        }
      }

      const { data: customerPayments } = await supabase
        .from('payment_requests')
        .select('id, amount_cents, created_at, status')
        .eq('business_id', businessId)
        .eq('lead_id', customerId)
        .eq('status', 'pending')
        .limit(1)

      customerPayments?.forEach((payment: any) => {
        const daysSinceRequest = Math.floor(
          (Date.now() - new Date(payment.created_at).getTime()) / (1000 * 60 * 60 * 24)
        )
        const amount = (payment.amount_cents / 100).toFixed(2)

        let priority: InsightPriority = 'medium'
        if (daysSinceRequest >= 14) priority = 'critical'
        else if (daysSinceRequest >= 7) priority = 'high'
        else priority = 'medium'

        // Use Business Memory to provide context
        let description = `$${amount} awaiting payment`
        let reason = `Payment requested ${daysSinceRequest} days ago has not been received`
        let source = 'raw_data'

        if (customerMemory?.averagePaymentDelay !== undefined) {
          const avgDelay = customerMemory.averagePaymentDelay.toFixed(1)
          const daysLate = daysSinceRequest - Math.round(customerMemory.averagePaymentDelay)
          if (daysSinceRequest > customerMemory.averagePaymentDelay + 2) {
            description = `$${amount} is ${daysLate} days late (usually pays in ${avgDelay} days)`
            reason = `Customer typically pays within ${avgDelay} days, but this payment is ${daysSinceRequest} days overdue`
            source = 'business_memory'
          } else if (daysSinceRequest <= customerMemory.averagePaymentDelay) {
            description = `$${amount} pending (within normal ${avgDelay}-day payment window)`
            reason = `Customer typically pays within ${avgDelay} days, payment is still within expected timeframe`
            source = 'business_memory'
          }
        }

        insights.push({
          id: `payment-pending-${payment.id}`,
          type: 'payment',
          category: 'money',
          priority,
          title: 'Payment request pending',
          description,
          actionable: true,
          customerId,
          confidence: customerMemory?.averagePaymentDelayProvenance?.confidence || 90,
          reason,
          primaryAction: {
            label: 'View Payment',
            href: `/dashboard/leads/${customerId}#payments`,
            type: 'navigate'
          },
          metadata: { 
            paymentId: payment.id, 
            daysSinceRequest,
            source,
            memoryField: 'averagePaymentDelay'
          },
          createdAt: payment.created_at
        })
      })
    }

    // Outstanding payments (for dashboard)
    if (!customerId) {
      const { data: outstandingPayments } = await supabase
        .from('payment_requests')
        .select('id, amount_cents, created_at, leads!inner(name, caller_phone)')
        .eq('business_id', businessId)
        .eq('status', 'pending')
        .gte('created_at', sevenDaysAgo)
        .limit(5)

      // Fetch Business Memory for business context
      let businessMemory = memoryService.getBusinessMemory(businessId)
      
      outstandingPayments?.forEach((payment: any) => {
        const daysSinceRequest = Math.floor(
          (Date.now() - new Date(payment.created_at).getTime()) / (1000 * 60 * 60 * 24)
        )
        const customerName = payment.leads?.name || payment.leads?.caller_phone || 'A customer'
        const amount = (payment.amount_cents / 100).toFixed(2)

        let priority: InsightPriority = 'medium'
        if (daysSinceRequest >= 14) priority = 'critical'
        else if (daysSinceRequest >= 7) priority = 'high'
        else if (daysSinceRequest >= 3) priority = 'medium'
        else priority = 'low'

        // Use Business Memory to provide context
        let description = `Outstanding for ${daysSinceRequest} days ($${amount})`
        let source = 'raw_data'

        if (businessMemory?.averagePaymentDelay !== undefined) {
          const avgDelay = businessMemory.averagePaymentDelay.toFixed(1)
          if (daysSinceRequest > businessMemory.averagePaymentDelay + 3) {
            description = `${daysSinceRequest} days overdue (business avg: ${avgDelay} days)`
            source = 'business_memory'
          }
        }

        if (daysSinceRequest >= 3) {
          insights.push({
            id: `payment-outstanding-${payment.id}`,
            type: 'payment',
            category: 'money',
            priority,
            title: `Payment from ${customerName}`,
            description,
            actionable: true,
            customerId: payment.leads?.id,
            confidence: businessMemory?.averagePaymentDelayProvenance?.confidence || 90,
            reason: `Payment requested ${daysSinceRequest} days ago has not been received`,
            primaryAction: {
              label: 'View Customer',
              href: `/dashboard/leads/${payment.leads?.id}`,
              type: 'navigate'
            },
            metadata: { 
              paymentId: payment.id, 
              daysSinceRequest,
              source,
              memoryField: 'averagePaymentDelay'
            },
            createdAt: payment.created_at
          })
        }
      })
    }

    return insights
  }
}
