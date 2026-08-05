import { Insight, InsightContext, InsightGenerator } from './types'
import { paymentInsightsGenerator } from './generators/payment-insights'
import { followUpInsightsGenerator } from './generators/follow-up-insights'
import { schedulingInsightsGenerator } from './generators/scheduling-insights'
import { communicationInsightsGenerator } from './generators/communication-insights'
import { customerPreferenceInsightsGenerator } from './generators/customer-preference-insights'
import { processInsightsPipeline, calculateBusinessHealth } from './scoring-pipeline'

const generators: InsightGenerator[] = [
  paymentInsightsGenerator,
  followUpInsightsGenerator,
  schedulingInsightsGenerator,
  communicationInsightsGenerator,
  customerPreferenceInsightsGenerator
]

export async function generateInsights(context: InsightContext): Promise<Insight[]> {
  const allInsights: Insight[] = []

  for (const generator of generators) {
    try {
      const insights = await generator.generate(context)
      allInsights.push(...insights)
    } catch (error) {
      console.error(`[Insights] Error generating ${generator.type} insights:`, error)
    }
  }

  // Process through scoring pipeline
  const processedInsights = processInsightsPipeline(allInsights)

  return processedInsights
}

export async function generateDashboardInsights(businessId: string, supabase: any): Promise<Insight[]> {
  const insights = await generateInsights({
    businessId,
    supabase,
    timeRange: 'today'
  })

  // Return top 5 insights for dashboard
  return insights.slice(0, 5)
}

export async function generateCustomerInsights(businessId: string, customerId: string, supabase: any): Promise<Insight[]> {
  const insights = await generateInsights({
    businessId,
    supabase,
    customerId,
    timeRange: 'week'
  })

  return insights
}

export async function getBusinessHealthScore(businessId: string, supabase: any): Promise<number> {
  const insights = await generateInsights({
    businessId,
    supabase,
    timeRange: 'today'
  })

  return calculateBusinessHealth(insights)
}
