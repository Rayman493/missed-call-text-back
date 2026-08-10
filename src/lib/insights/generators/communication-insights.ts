import { Insight, InsightContext, InsightGenerator, InsightPriority } from '../types'
import { memoryService } from '@/lib/business-memory/memory-service'
import { buildCustomerMemory } from '@/lib/business-memory/memory-builder'

export const communicationInsightsGenerator: InsightGenerator = {
  type: 'communication',
  generate: async (context: InsightContext): Promise<Insight[]> => {
    const insights: Insight[] = []
    const { businessId, supabase, customerId } = context

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Customers waiting for replies (for dashboard)
    if (!customerId) {
      const { data: leads } = await supabase
        .from('leads')
        .select('id, caller_phone')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .neq('status', 'ignored')
        .gte('created_at', sevenDaysAgo)

      if (leads && leads.length > 0) {
        const leadIds = leads.map((l: any) => l.id)

        const { data: recentMessages } = await supabase
          .from('messages')
          .select('lead_id, direction, created_at')
          .in('lead_id', leadIds)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })

        const leadLatestMessage: Record<string, { direction: string; created_at: string }> = {}
        recentMessages?.forEach((msg: any) => {
          if (!leadLatestMessage[msg.lead_id] || new Date(msg.created_at) > new Date(leadLatestMessage[msg.lead_id].created_at)) {
            leadLatestMessage[msg.lead_id] = { direction: msg.direction, created_at: msg.created_at }
          }
        })

        const waitingForReplyCount = Object.values(leadLatestMessage).filter(
          (msg) => msg.direction === 'inbound'
        ).length

        if (waitingForReplyCount > 0) {
          let priority: InsightPriority = 'medium'
          if (waitingForReplyCount >= 5) priority = 'critical'
          else if (waitingForReplyCount >= 3) priority = 'high'
          else priority = 'medium'

          insights.push({
            id: 'waiting-for-replies',
            type: 'communication',
            category: 'communication',
            priority,
            title: `${waitingForReplyCount} customer${waitingForReplyCount > 1 ? 's are' : ' is'} waiting for a reply`,
            description: 'Review recent messages',
            actionable: true,
            confidence: 85,
            reason: `${waitingForReplyCount} customer${waitingForReplyCount > 1 ? 's have' : ' has'} sent inbound messages without receiving replies`,
            primaryAction: {
              label: 'View Messages',
              href: '/dashboard/leads',
              type: 'navigate'
            },
            metadata: { waitingForReplyCount },
            createdAt: new Date().toISOString()
          })
        }
      }
    }

    // Customer hasn't replied (for customer detail)
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
          console.error('[CommunicationInsights] Error building customer memory:', error)
        }
      }

      const { data: messages } = await supabase
        .from('messages')
        .select('id, direction, created_at')
        .eq('lead_id', customerId)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(10)

      if (messages && messages.length > 0) {
        const latestMessage = messages[0]
        const daysSinceLastMessage = Math.floor(
          (Date.now() - new Date(latestMessage.created_at).getTime()) / (1000 * 60 * 60 * 24)
        )

        if (latestMessage.direction === 'outbound' && daysSinceLastMessage >= 2) {
          let priority: InsightPriority = 'medium'
          if (daysSinceLastMessage >= 5) priority = 'critical'
          else if (daysSinceLastMessage >= 3) priority = 'high'
          else priority = 'medium'

          let description = 'Customer has not responded to recent message'
          let reason = `Last outbound message was sent ${daysSinceLastMessage} days ago with no reply`
          let source = 'raw_data'

          // Use Business Memory to provide context
          if (customerMemory?.averageResponseDelay !== undefined) {
            const avgDelayHours = customerMemory.averageResponseDelay.toFixed(1)
            const avgDelayDays = (customerMemory.averageResponseDelay / 24).toFixed(1)
            if (daysSinceLastMessage > (customerMemory.averageResponseDelay / 24) + 1) {
              description = `No reply in ${daysSinceLastMessage} days (usually responds within ${avgDelayDays} days)`
              reason = `Customer typically responds within ${avgDelayDays} days (${avgDelayHours} hours), but has not replied for ${daysSinceLastMessage} days`
              source = 'business_memory'
            } else if (daysSinceLastMessage <= (customerMemory.averageResponseDelay / 24)) {
              description = `Within normal response window (usually ${avgDelayDays} days)`
              reason = `Customer typically responds within ${avgDelayDays} days, still within expected timeframe`
              source = 'business_memory'
            }
          }

          insights.push({
            id: 'no-recent-reply',
            type: 'communication',
            category: 'communication',
            priority,
            title: `No reply in ${daysSinceLastMessage} days`,
            description,
            actionable: true,
            customerId,
            confidence: customerMemory?.averageResponseDelayProvenance?.confidence || 80,
            reason,
            primaryAction: {
              label: 'Send Message',
              href: `/dashboard/leads/${customerId}`,
              type: 'navigate'
            },
            metadata: { 
              daysSinceLastMessage,
              source,
              memoryField: 'averageResponseDelay'
            },
            createdAt: latestMessage.created_at
          })
        } else if (daysSinceLastMessage <= 1 && latestMessage.direction === 'inbound') {
          insights.push({
            id: 'quick-responder',
            type: 'communication',
            category: 'communication',
            priority: 'low',
            title: 'Responds quickly',
            description: customerMemory?.preferredContactMethod && customerMemory.preferredContactMethod !== 'any'
              ? `Prefers ${customerMemory.preferredContactMethod}`
              : 'Customer typically replies within one day',
            actionable: false,
            customerId,
            confidence: customerMemory?.preferredContactMethodProvenance?.confidence || 70,
            reason: 'Customer replied to the most recent message within one day',
            metadata: { 
              source: customerMemory?.preferredContactMethod ? 'business_memory' : 'raw_data',
              memoryField: customerMemory?.preferredContactMethod ? 'preferredContactMethod' : undefined
            },
            createdAt: latestMessage.created_at
          })
        }
      }
    }

    return insights
  }
}
