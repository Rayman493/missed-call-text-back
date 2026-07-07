import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client for event logging
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface TimelineEvent {
  business_id?: string
  conversation_id?: string
  lead_id?: string
  message_id?: string
  message_sid?: string
  event_type: 'call_received' | 'lead_created' | 'auto_reply_queued' | 'message_sent' | 'message_delivered' | 'message_failed' | 'conversation_created' | 'payment_requested' | 'payment_completed' | 'payment_expired' | 'payment_canceled' | 'calendar_connected' | 'calendar_disconnected' | 'appointment_created' | 'appointment_deleted' | 'job_created'
  event_data?: Record<string, any>
  created_at?: string
}

/**
 * Log an event to the timeline for debugging and visibility
 * Lightweight implementation - only logs to console for now, can be extended to DB later
 */
export async function logTimelineEvent(event: TimelineEvent): Promise<void> {
  try {
    const timestamp = event.created_at || new Date().toISOString()
    
    console.log('[timeline] event logged:', {
      event_type: event.event_type,
      business_id: event.business_id,
      conversation_id: event.conversation_id,
      lead_id: event.lead_id,
      message_id: event.message_id,
      message_sid: event.message_sid,
      event_data: event.event_data,
      timestamp
    })
    
    // Future: Could store in database for persistent timeline view
    // For now, just console logging for debugging
    
  } catch (error) {
    console.error('[timeline] failed to log event:', error)
  }
}

/**
 * Convenience functions for common events
 */
export const timelineEvents = {
  callReceived: (businessId: string, leadId: string, conversationId: string, from: string, to: string) => 
    logTimelineEvent({
      business_id: businessId,
      lead_id: leadId,
      conversation_id: conversationId,
      event_type: 'call_received',
      event_data: { from, to }
    }),
    
  leadCreated: (businessId: string, leadId: string, conversationId: string, phoneNumber: string) =>
    logTimelineEvent({
      business_id: businessId,
      lead_id: leadId,
      conversation_id: conversationId,
      event_type: 'lead_created',
      event_data: { phone_number: phoneNumber }
    }),
    
  conversationCreated: (businessId: string, leadId: string, conversationId: string) =>
    logTimelineEvent({
      business_id: businessId,
      lead_id: leadId,
      conversation_id: conversationId,
      event_type: 'conversation_created',
      event_data: {}
    }),
    
  autoReplyQueued: (businessId: string, leadId: string, conversationId: string, messageId: string, messageBody: string) =>
    logTimelineEvent({
      business_id: businessId,
      lead_id: leadId,
      conversation_id: conversationId,
      message_id: messageId,
      event_type: 'auto_reply_queued',
      event_data: { message_body: messageBody.substring(0, 100) + '...' }
    }),
    
  messageSent: (businessId: string, leadId: string, conversationId: string, messageId: string, messageSid: string) =>
    logTimelineEvent({
      business_id: businessId,
      lead_id: leadId,
      conversation_id: conversationId,
      message_id: messageId,
      message_sid: messageSid,
      event_type: 'message_sent',
      event_data: {}
    }),
    
  messageDelivered: (businessId: string, leadId: string, conversationId: string, messageId: string, messageSid: string) =>
    logTimelineEvent({
      business_id: businessId,
      lead_id: leadId,
      conversation_id: conversationId,
      message_id: messageId,
      message_sid: messageSid,
      event_type: 'message_delivered',
      event_data: {}
    }),
    
  messageFailed: (businessId: string, leadId: string, conversationId: string, messageId: string, messageSid?: string, errorCode?: string, errorMessage?: string) =>
    logTimelineEvent({
      business_id: businessId,
      lead_id: leadId,
      conversation_id: conversationId,
      message_id: messageId,
      message_sid: messageSid,
      event_type: 'message_failed',
      event_data: { error_code: errorCode, error_message: errorMessage }
    }),

  paymentRequestCreated: (businessId: string, leadId: string, paymentRequestId: string, amountCents: number, description: string) =>
    logTimelineEvent({
      business_id: businessId,
      lead_id: leadId,
      event_type: 'payment_requested',
      event_data: { payment_request_id: paymentRequestId, amount_cents: amountCents, description }
    }),

  paymentCompleted: (businessId: string, leadId: string, paymentRequestId: string, amountCents: number) =>
    logTimelineEvent({
      business_id: businessId,
      lead_id: leadId,
      event_type: 'payment_completed',
      event_data: { payment_request_id: paymentRequestId, amount_cents: amountCents }
    }),

  paymentExpired: (businessId: string, leadId: string, paymentRequestId: string) =>
    logTimelineEvent({
      business_id: businessId,
      lead_id: leadId,
      event_type: 'payment_expired',
      event_data: { payment_request_id: paymentRequestId }
    }),

  paymentRequestCanceled: (businessId: string, leadId: string, paymentRequestId: string, amountCents: number, description: string) =>
    logTimelineEvent({
      business_id: businessId,
      lead_id: leadId,
      event_type: 'payment_canceled',
      event_data: { payment_request_id: paymentRequestId, amount_cents: amountCents, description }
    }),

  calendarConnected: (businessId: string, calendarEmail?: string) =>
    logTimelineEvent({
      business_id: businessId,
      event_type: 'calendar_connected',
      event_data: { calendar_email: calendarEmail }
    }),

  calendarDisconnected: (businessId: string) =>
    logTimelineEvent({
      business_id: businessId,
      event_type: 'calendar_disconnected',
      event_data: {}
    }),

  appointmentCreated: (businessId: string, eventId: string, title: string, start: string, end: string) =>
    logTimelineEvent({
      business_id: businessId,
      event_type: 'appointment_created',
      event_data: { event_id: eventId, title, start, end }
    }),

  appointmentDeleted: (businessId: string, eventId: string, title: string) =>
    logTimelineEvent({
      business_id: businessId,
      event_type: 'appointment_deleted',
      event_data: { event_id: eventId, title }
    }),

  jobCreated: (businessId: string, leadId: string, jobId: string, step: number, scheduledFor: string) =>
    logTimelineEvent({
      business_id: businessId,
      lead_id: leadId,
      event_type: 'job_created',
      event_data: { job_id: jobId, step, scheduled_for: scheduledFor }
    })
}
