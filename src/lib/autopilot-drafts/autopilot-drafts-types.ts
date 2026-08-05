/**
 * Autopilot Drafts Type Definitions
 * 
 * Prepares high-quality message drafts before the owner needs them.
 * Owner reviews, edits, and approves - nothing is sent automatically.
 */

export type DraftType = 
  | 'payment_reminder'
  | 'appointment_confirmation'
  | 'estimate_follow_up'
  | 'customer_reactivation'
  | 'review_request'
  | 'job_completion'
  | 'missed_call_follow_up'
  | 'general_follow_up'

export type DraftStatus = 
  | 'pending'
  | 'approved'
  | 'edited'
  | 'discarded'

export interface MessageDraft {
  id: string
  customerId: string
  customerName: string
  type: DraftType
  status: DraftStatus
  content: string
  confidence: number // 0-100
  reason: string
  createdAt: string
  approvedAt?: string
  editedAt?: string
  discardedAt?: string
  metadata: {
    relatedJobId?: string
    relatedPaymentId?: string
    relatedAppointmentId?: string
    workflowStepId?: string
  }
}

export interface DraftContext {
  businessId: string
  customerId?: string
}

export interface DraftServiceInterface {
  getDraft(context: DraftContext): Promise<MessageDraft | null>
  getDrafts(businessId: string): Promise<MessageDraft[]>
  approveDraft(draftId: string): Promise<void>
  editDraft(draftId: string, content: string): Promise<void>
  discardDraft(draftId: string): Promise<void>
  generateDraft(customerId: string, type: DraftType, context: any): Promise<MessageDraft | null>
  invalidateCache(businessId: string): void
}
