import { Insight, InsightContext, InsightGenerator, InsightPriority } from '../types'

export const followUpInsightsGenerator: InsightGenerator = {
  type: 'follow-up',
  generate: async (context: InsightContext): Promise<Insight[]> => {
    const insights: Insight[] = []
    const { businessId, supabase, customerId } = context

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // No follow-ups sent today (for dashboard)
    if (!customerId) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayIso = today.toISOString()

      const { data: followUpsToday } = await supabase
        .from('follow_up_jobs')
        .select('id')
        .eq('business_id', businessId)
        .gte('created_at', todayIso)
        .limit(1)

      if (!followUpsToday || followUpsToday.length === 0) {
        insights.push({
          id: 'no-follow-ups-today',
          type: 'follow-up',
          category: 'operations',
          priority: 'low',
          title: 'No follow-ups sent today',
          description: 'Consider checking for customers needing attention',
          actionable: true,
          confidence: 70,
          reason: 'No follow-up jobs have been created or sent today',
          primaryAction: {
            label: 'View Customers',
            href: '/dashboard/leads',
            type: 'navigate'
          },
          createdAt: todayIso
        })
      }
    }

    // Follow-up overdue for specific customer
    if (customerId) {
      const { data: followUpJobs } = await supabase
        .from('follow_up_jobs')
        .select('id, scheduled_for, status')
        .eq('business_id', businessId)
        .eq('lead_id', customerId)
        .in('status', ['pending', 'scheduled'])
        .limit(1)

      followUpJobs?.forEach((job: any) => {
        const isOverdue = new Date(job.scheduled_for) < new Date()
        let priority: InsightPriority = 'medium'
        if (isOverdue) priority = 'critical'
        else priority = 'medium'

        insights.push({
          id: `follow-up-scheduled-${job.id}`,
          type: 'follow-up',
          category: 'operations',
          priority,
          title: isOverdue ? 'Follow-up overdue' : 'Follow-up scheduled',
          description: isOverdue ? 'Follow-up was scheduled for a past date' : 'Follow-up is scheduled for the future',
          actionable: true,
          customerId,
          confidence: 85,
          reason: isOverdue ? `Follow-up was scheduled for ${job.scheduled_for} but not completed` : 'Follow-up is pending',
          primaryAction: {
            label: 'Send Message',
            href: `/dashboard/leads/${customerId}`,
            type: 'navigate'
          },
          metadata: { jobId: job.id, isOverdue },
          createdAt: job.scheduled_for
        })
      })
    }

    return insights
  }
}
