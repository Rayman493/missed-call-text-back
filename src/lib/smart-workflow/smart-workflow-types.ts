/**
 * Smart Workflow Type Definitions
 * 
 * Helps business owners complete multi-step workflows by understanding
 * customer state and recommending the next logical business step.
 */

export type WorkflowType = 
  | 'new_lead'
  | 'existing_customer'
  | 'payment_collection'
  | 'customer_recovery'

export type WorkflowStepStatus = 
  | 'completed'
  | 'current'
  | 'future'
  | 'skipped'

export interface WorkflowStep {
  id: string
  title: string
  description: string
  status: WorkflowStepStatus
  completedAt?: string
  action?: {
    type: string
    label: string
    route?: string
  }
}

export interface Workflow {
  id: string
  type: WorkflowType
  customerId: string
  title: string
  steps: WorkflowStep[]
  currentStepIndex: number
  completedSteps: number
  totalSteps: number
  progress: number // 0-100
}

export interface WorkflowSummary {
  type: WorkflowType
  title: string
  count: number
  route: string
}

export interface WorkflowContext {
  businessId: string
  customerId: string
}

export interface WorkflowServiceInterface {
  getWorkflow(context: WorkflowContext): Promise<Workflow | null>
  getWorkflowSummaries(businessId: string): Promise<WorkflowSummary[]>
  invalidateCache(businessId: string): void
}
