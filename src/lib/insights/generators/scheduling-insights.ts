import { Insight, InsightContext, InsightGenerator, InsightPriority } from '../types'
import { memoryService } from '@/lib/business-memory/memory-service'
import { buildCustomerMemory } from '@/lib/business-memory/memory-builder'

export const schedulingInsightsGenerator: InsightGenerator = {
  type: 'scheduling',
  generate: async (context: InsightContext): Promise<Insight[]> => {
    const insights: Insight[] = []
    const { businessId, supabase, customerId } = context

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toLocaleDateString('en-CA') // YYYY-MM-DD
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toLocaleDateString('en-CA')

    // Jobs tomorrow (for dashboard)
    if (!customerId) {
      const { data: jobsTomorrow } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, leads!inner(name, caller_phone)')
        .eq('business_id', businessId)
        .eq('scheduled_date', tomorrowStr)
        .neq('status', 'cancelled')
        .limit(5)

      if (jobsTomorrow && jobsTomorrow.length > 0) {
        const count = jobsTomorrow.length
        insights.push({
          id: 'jobs-tomorrow',
          type: 'scheduling',
          category: 'scheduling',
          priority: 'high',
          title: `${count} appointment${count > 1 ? 's' : ''} tomorrow`,
          description: 'Review scheduled appointments',
          actionable: true,
          confidence: 95,
          reason: `${count} job${count > 1 ? 's are' : ' is'} scheduled for tomorrow`,
          primaryAction: {
            label: 'View Calendar',
            href: '/dashboard/calendar',
            type: 'navigate'
          },
          metadata: { count },
          createdAt: today.toISOString()
        })
      }

      // Jobs today
      const { data: jobsToday } = await supabase
        .from('jobs')
        .select('id')
        .eq('business_id', businessId)
        .eq('scheduled_date', todayStr)
        .neq('status', 'cancelled')
        .limit(1)

      if (jobsToday && jobsToday.length > 0) {
        const count = jobsToday.length
        insights.push({
          id: 'jobs-today',
          type: 'scheduling',
          category: 'scheduling',
          priority: 'critical',
          title: `${count} appointment${count > 1 ? 's' : ''} today`,
          description: 'You have scheduled work today',
          actionable: true,
          confidence: 95,
          reason: `${count} job${count > 1 ? 's are' : ' is'} scheduled for today`,
          primaryAction: {
            label: 'View Calendar',
            href: '/dashboard/calendar',
            type: 'navigate'
          },
          metadata: { count },
          createdAt: today.toISOString()
        })
      }
    }

    // No appointment scheduled for specific customer
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
          console.error('[SchedulingInsights] Error building customer memory:', error)
        }
      }

      const { data: customerJobs } = await supabase
        .from('jobs')
        .select('id, scheduled_date, status')
        .eq('business_id', businessId)
        .eq('lead_id', customerId)
        .neq('status', 'cancelled')
        .gte('scheduled_date', todayStr)
        .limit(1)

      if (!customerJobs || customerJobs.length === 0) {
        let description = 'Consider scheduling a follow-up'
        let reason = 'No future appointments found for this customer'
        let source = 'raw_data'

        // Use Business Memory to provide contextual scheduling hints
        if (customerMemory?.preferredAppointmentTime && customerMemory.preferredAppointmentTime !== 'any') {
          const timeMap: Record<string, string> = {
            morning: 'morning',
            afternoon: 'afternoon',
            evening: 'evening'
          }
          const timeHint = timeMap[customerMemory.preferredAppointmentTime] || customerMemory.preferredAppointmentTime
          description = `Schedule for ${timeHint} (customer preference)`
          reason = `Customer prefers ${timeHint} appointments based on ${customerMemory.preferredAppointmentTimeProvenance?.sampleSize || 0} past appointments`
          source = 'business_memory'
        }

        if (customerMemory?.preferredDay && customerMemory.preferredDay !== 'any') {
          const dayMap: Record<string, string> = {
            monday: 'Mondays',
            tuesday: 'Tuesdays',
            wednesday: 'Wednesdays',
            thursday: 'Thursdays',
            friday: 'Fridays',
            saturday: 'Saturdays',
            sunday: 'Sundays'
          }
          const dayHint = dayMap[customerMemory.preferredDay] || customerMemory.preferredDay
          if (source === 'business_memory') {
            description = `${description} on ${dayHint}`
            reason = `${reason}. Prefers ${dayHint} based on ${customerMemory.preferredDayProvenance?.sampleSize || 0} past appointments`
          } else {
            description = `Schedule on ${dayHint} (customer preference)`
            reason = `Customer prefers ${dayHint} based on ${customerMemory.preferredDayProvenance?.sampleSize || 0} past appointments`
            source = 'business_memory'
          }
        }

        insights.push({
          id: 'no-appointment-scheduled',
          type: 'scheduling',
          category: 'scheduling',
          priority: 'medium',
          title: 'No appointment scheduled',
          description,
          actionable: true,
          customerId,
          confidence: customerMemory?.preferredAppointmentTimeProvenance?.confidence || 75,
          reason,
          primaryAction: {
            label: 'Schedule Appointment',
            href: `/dashboard/leads/${customerId}#jobs`,
            type: 'navigate'
          },
          metadata: { 
            source,
            memoryField: customerMemory?.preferredAppointmentTime ? 'preferredAppointmentTime' : 'preferredDay'
          },
          createdAt: today.toISOString()
        })
      }
    }

    return insights
  }
}
