/**
 * Smart Workflow Service
 * 
 * Helps business owners complete multi-step workflows by understanding
 * customer state and recommending the next logical business step.
 */

import { createBrowserClient } from '@/lib/supabase/browser'
import type {
  Workflow,
  WorkflowStep,
  WorkflowSummary,
  WorkflowContext,
  WorkflowServiceInterface,
  WorkflowType,
  WorkflowStepStatus
} from './smart-workflow-types'

const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

class WorkflowService implements WorkflowServiceInterface {
  private cache: Map<string, { workflow: Workflow | null; timestamp: number }> = new Map()
  private summaryCache: Map<string, { summaries: WorkflowSummary[]; timestamp: number }> = new Map()

  /**
   * Get workflow for a specific customer
   */
  async getWorkflow(context: WorkflowContext): Promise<Workflow | null> {
    const cacheKey = this.getCacheKey(context)
    const cached = this.cache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.workflow
    }

    const supabase = createBrowserClient()

    // Fetch customer state data
    const [leadData, jobsData, paymentsData] = await Promise.all([
      this.fetchLeadData(context.businessId, context.customerId, supabase),
      this.fetchJobsData(context.businessId, context.customerId, supabase),
      this.fetchPaymentsData(context.businessId, context.customerId, supabase)
    ])

    if (!leadData) {
      this.cache.set(cacheKey, { workflow: null, timestamp: Date.now() })
      return null
    }

    // Determine workflow type based on customer state
    const workflowType = this.determineWorkflowType(leadData, jobsData, paymentsData)
    
    // Build workflow steps based on type and state
    const workflow = this.buildWorkflow(context.customerId, workflowType, leadData, jobsData, paymentsData)

    this.cache.set(cacheKey, { workflow, timestamp: Date.now() })
    return workflow
  }

  /**
   * Get workflow summaries for a business
   */
  async getWorkflowSummaries(businessId: string): Promise<WorkflowSummary[]> {
    const cacheKey = `summaries:${businessId}`
    const cached = this.summaryCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return cached.summaries
    }

    const supabase = createBrowserClient()
    const summaries: WorkflowSummary[] = []

    // Count customers awaiting estimates (AI intake complete, no estimate/job)
    const { count: awaitingEstimates } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .not('ai_intake', 'is', null)

    if (awaitingEstimates && awaitingEstimates > 0) {
      summaries.push({
        type: 'new_lead',
        title: 'Awaiting Estimates',
        count: awaitingEstimates,
        route: '/dashboard/leads'
      })
    }

    // Count jobs ready for payment (completed, no payment requested)
    const { data: completedJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('business_id', businessId)
      .eq('status', 'completed')

    if (completedJobs && completedJobs.length > 0) {
      const jobIds = completedJobs.map((j: any) => j.id)
      const { data: payments } = await supabase
        .from('payment_requests')
        .select('job_id')
        .eq('business_id', businessId)
        .in('job_id', jobIds)

      const jobsWithPayments = new Set((payments || []).map((p: any) => p.job_id))
      const jobsWithoutPayment = completedJobs.filter((j: any) => !jobsWithPayments.has(j.id))

      if (jobsWithoutPayment.length > 0) {
        summaries.push({
          type: 'payment_collection',
          title: 'Ready for Payment',
          count: jobsWithoutPayment.length,
          route: '/dashboard/payments'
        })
      }
    }

    this.summaryCache.set(cacheKey, { summaries, timestamp: Date.now() })
    return summaries
  }

  /**
   * Invalidate cached workflows for a business
   */
  invalidateCache(businessId: string): void {
    for (const [key] of this.cache.entries()) {
      if (key.includes(businessId)) {
        this.cache.delete(key)
      }
    }
    this.summaryCache.delete(`summaries:${businessId}`)
  }

  /**
   * Fetch lead data
   */
  private async fetchLeadData(businessId: string, customerId: string, supabase: any): Promise<any> {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .eq('id', customerId)
      .single()
    return data
  }

  /**
   * Fetch jobs data
   */
  private async fetchJobsData(businessId: string, customerId: string, supabase: any): Promise<any[]> {
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('business_id', businessId)
      .eq('lead_id', customerId)
      .order('created_at', { ascending: false })
    return data || []
  }

  /**
   * Fetch payments data
   */
  private async fetchPaymentsData(businessId: string, customerId: string, supabase: any): Promise<any[]> {
    const { data } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
    return data || []
  }

  /**
   * Determine workflow type based on customer state
   */
  private determineWorkflowType(leadData: any, jobsData: any[], paymentsData: any[]): WorkflowType {
    const hasAiIntake = leadData?.ai_intake !== null
    const hasJobs = jobsData.length > 0
    const hasCompletedJob = jobsData.some(j => j.status === 'completed')
    const hasPayment = paymentsData.length > 0

    if (!hasAiIntake) {
      return 'new_lead'
    }

    if (!hasJobs) {
      return 'new_lead'
    }

    if (hasCompletedJob && !hasPayment) {
      return 'payment_collection'
    }

    if (hasJobs && hasCompletedJob) {
      return 'existing_customer'
    }

    return 'new_lead'
  }

  /**
   * Build workflow steps based on type and state
   */
  private buildWorkflow(customerId: string, type: WorkflowType, leadData: any, jobsData: any[], paymentsData: any[]): Workflow | null {
    let steps: WorkflowStep[] = []
    let title = ''

    switch (type) {
      case 'new_lead':
        title = 'New Lead Workflow'
        steps = this.buildNewLeadSteps(leadData, jobsData, paymentsData)
        break
      case 'existing_customer':
        title = 'Customer Journey'
        steps = this.buildExistingCustomerSteps(leadData, jobsData, paymentsData)
        break
      case 'payment_collection':
        title = 'Payment Collection'
        steps = this.buildPaymentCollectionSteps(leadData, jobsData, paymentsData)
        break
      case 'customer_recovery':
        title = 'Customer Recovery'
        steps = this.buildCustomerRecoverySteps(leadData, jobsData, paymentsData)
        break
    }

    if (steps.length === 0) return null

    // Calculate current step index and progress
    const currentStepIndex = steps.findIndex(s => s.status === 'current')
    const completedSteps = steps.filter(s => s.status === 'completed').length
    const progress = Math.round((completedSteps / steps.length) * 100)

    return {
      id: `workflow-${customerId}-${type}`,
      type,
      customerId,
      title,
      steps,
      currentStepIndex: currentStepIndex >= 0 ? currentStepIndex : steps.length - 1,
      completedSteps,
      totalSteps: steps.length,
      progress
    }
  }

  /**
   * Build new lead workflow steps
   */
  private buildNewLeadSteps(leadData: any, jobsData: any[], paymentsData: any[]): WorkflowStep[] {
    const steps: WorkflowStep[] = []
    const hasAiIntake = leadData?.ai_intake !== null
    const hasEstimate = jobsData.some(j => j.status === 'estimate')
    const hasJob = jobsData.some(j => ['scheduled', 'in_progress', 'completed'].includes(j.status))
    const hasCompletedJob = jobsData.some(j => j.status === 'completed')
    const hasPayment = paymentsData.length > 0

    // AI Intake
    steps.push({
      id: 'ai_intake',
      title: 'AI Intake',
      description: 'Customer completed intake',
      status: hasAiIntake ? 'completed' : 'current',
      completedAt: hasAiIntake ? leadData.created_at : undefined
    })

    // Review Customer
    steps.push({
      id: 'review_customer',
      title: 'Review Customer',
      description: 'Review customer information',
      status: hasAiIntake ? 'current' : 'future',
      action: {
        type: 'navigate',
        label: 'Review',
        route: `/dashboard/leads/${leadData.id}`
      }
    })

    // Send Estimate
    steps.push({
      id: 'send_estimate',
      title: 'Send Estimate',
      description: 'Create and send estimate',
      status: hasEstimate ? 'completed' : hasAiIntake ? 'future' : 'skipped',
      completedAt: hasEstimate ? jobsData.find(j => j.status === 'estimate')?.created_at : undefined
    })

    // Schedule Appointment
    steps.push({
      id: 'schedule_appointment',
      title: 'Schedule Appointment',
      description: 'Schedule the job',
      status: hasJob ? 'completed' : hasEstimate ? 'future' : 'skipped',
      completedAt: hasJob ? jobsData.find(j => ['scheduled', 'in_progress', 'completed'].includes(j.status))?.created_at : undefined
    })

    // Complete Job
    steps.push({
      id: 'complete_job',
      title: 'Complete Job',
      description: 'Mark job as completed',
      status: hasCompletedJob ? 'completed' : hasJob ? 'current' : 'future',
      completedAt: hasCompletedJob ? jobsData.find(j => j.status === 'completed')?.completed_at : undefined
    })

    // Request Payment
    steps.push({
      id: 'request_payment',
      title: 'Request Payment',
      description: 'Send payment request',
      status: hasPayment ? 'completed' : hasCompletedJob ? 'current' : 'future',
      completedAt: hasPayment ? paymentsData[0]?.created_at : undefined
    })

    // Request Review
    steps.push({
      id: 'request_review',
      title: 'Request Review',
      description: 'Ask for customer review',
      status: hasPayment ? 'future' : 'skipped'
    })

    return steps
  }

  /**
   * Build existing customer workflow steps
   */
  private buildExistingCustomerSteps(leadData: any, jobsData: any[], paymentsData: any[]): WorkflowStep[] {
    const steps: WorkflowStep[] = []
    const lastJob = jobsData[0]
    const hasCompletedJob = jobsData.some(j => j.status === 'completed')
    const hasPayment = paymentsData.length > 0

    // Customer Returns
    steps.push({
      id: 'customer_returns',
      title: 'Customer Returns',
      description: 'Customer has returned',
      status: 'completed',
      completedAt: lastJob?.created_at
    })

    // Review Previous Service
    steps.push({
      id: 'review_previous',
      title: 'Review Previous Service',
      description: 'Review past work history',
      status: 'current',
      action: {
        type: 'navigate',
        label: 'Review',
        route: `/dashboard/leads/${leadData.id}`
      }
    })

    // Schedule Service
    steps.push({
      id: 'schedule_service',
      title: 'Schedule Service',
      description: 'Schedule next service',
      status: lastJob?.status === 'scheduled' || lastJob?.status === 'in_progress' ? 'completed' : 'future',
      completedAt: lastJob?.scheduled_date
    })

    // Complete Job
    steps.push({
      id: 'complete_job',
      title: 'Complete Job',
      description: 'Mark job as completed',
      status: hasCompletedJob ? 'completed' : 'future',
      completedAt: jobsData.find(j => j.status === 'completed')?.completed_at
    })

    // Request Payment
    steps.push({
      id: 'request_payment',
      title: 'Request Payment',
      description: 'Send payment request',
      status: hasPayment ? 'completed' : hasCompletedJob ? 'current' : 'future',
      completedAt: hasPayment ? paymentsData[0]?.created_at : undefined
    })

    // Suggest Recurring Service
    steps.push({
      id: 'suggest_recurring',
      title: 'Suggest Recurring Service',
      description: 'Offer recurring service',
      status: hasPayment ? 'future' : 'skipped'
    })

    return steps
  }

  /**
   * Build payment collection workflow steps
   */
  private buildPaymentCollectionSteps(leadData: any, jobsData: any[], paymentsData: any[]): WorkflowStep[] {
    const steps: WorkflowStep[] = []
    const completedJob = jobsData.find(j => j.status === 'completed')
    const hasPayment = paymentsData.length > 0

    // Job Complete
    steps.push({
      id: 'job_complete',
      title: 'Job Complete',
      description: 'Work completed',
      status: 'completed',
      completedAt: completedJob?.completed_at
    })

    // Request Payment
    steps.push({
      id: 'request_payment',
      title: 'Request Payment',
      description: 'Send payment request',
      status: hasPayment ? 'completed' : 'current',
      completedAt: hasPayment ? paymentsData[0]?.created_at : undefined,
      action: {
        type: 'navigate',
        label: 'Request',
        route: `/dashboard/leads/${leadData.id}`
      }
    })

    // Follow Up
    steps.push({
      id: 'follow_up',
      title: 'Follow Up',
      description: 'Send follow-up message',
      status: hasPayment ? 'current' : 'future'
    })

    // Payment Received
    steps.push({
      id: 'payment_received',
      title: 'Payment Received',
      description: 'Payment collected',
      status: paymentsData.some(p => p.status === 'paid') ? 'completed' : 'future',
      completedAt: paymentsData.find(p => p.status === 'paid')?.updated_at
    })

    // Thank Customer
    steps.push({
      id: 'thank_customer',
      title: 'Thank Customer',
      description: 'Send thank you message',
      status: paymentsData.some(p => p.status === 'paid') ? 'future' : 'skipped'
    })

    return steps
  }

  /**
   * Build customer recovery workflow steps
   */
  private buildCustomerRecoverySteps(leadData: any, jobsData: any[], paymentsData: any[]): WorkflowStep[] {
    const steps: WorkflowStep[] = []

    // Customer Inactive
    steps.push({
      id: 'customer_inactive',
      title: 'Customer Inactive',
      description: 'No recent activity',
      status: 'completed'
    })

    // Reach Out
    steps.push({
      id: 'reach_out',
      title: 'Reach Out',
      description: 'Send re-engagement message',
      status: 'current',
      action: {
        type: 'navigate',
        label: 'Message',
        route: `/dashboard/leads/${leadData.id}`
      }
    })

    // Schedule Job
    steps.push({
      id: 'schedule_job',
      title: 'Schedule Job',
      description: 'Schedule new appointment',
      status: 'future'
    })

    // Complete Job
    steps.push({
      id: 'complete_job',
      title: 'Complete Job',
      description: 'Mark job as completed',
      status: 'future'
    })

    // Request Review
    steps.push({
      id: 'request_review',
      title: 'Request Review',
      description: 'Ask for customer review',
      status: 'future'
    })

    return steps
  }

  /**
   * Generate cache key from context
   */
  private getCacheKey(context: WorkflowContext): string {
    return `${context.businessId}:${context.customerId}`
  }
}

// Singleton instance
export const workflowService = new WorkflowService()
