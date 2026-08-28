import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushForNotification } from '@/lib/push-delivery'
import { normalizePunctuation } from '@/lib/utils'
import { shouldSuppressNotification } from '@/lib/notification-preferences'

/**
 * Resolve customer display name with fallback priority
 * Priority: meaningful name > formatted phone > "Customer"
 *
 * @param leadName - Customer name from lead record
 * @param leadPhone - Customer phone number
 * @returns Display name for notifications
 */
export function resolveCustomerDisplayName(leadName?: string | null, leadPhone?: string | null): string {
  // Placeholder values that should be treated as missing names
  const placeholderNames = ['Customer', 'Unknown', 'Unknown Customer', 'Caller', 'Anonymous']
  const trimmedName = leadName?.trim()
  const isPlaceholder = trimmedName && placeholderNames.includes(trimmedName)
  const isMeaningfulName = trimmedName && !isPlaceholder && trimmedName.length > 0

  // Fallback priority: meaningful name > formatted phone > "Customer"
  if (isMeaningfulName) {
    return trimmedName
  }

  if (leadPhone) {
    // Format phone number to US format if possible, otherwise use as-is
    const formattedPhone = formatPhoneNumber(leadPhone)
    return formattedPhone
  }

  return 'Customer'
}

/**
 * Format phone number to US format (xxx) xxx-xxxx
 * Falls back to original if not a valid US number
 */
function formatPhoneNumber(phone: string): string {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '')

  // Check if it's a valid US number (10 digits)
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }

  // Check if it has country code (11 digits starting with 1)
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }

  // Return original if not a standard US number
  return phone
}

/**
 * Truncate message to max length while preserving word boundaries
 */
function truncateMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) {
    return message
  }
  const lastSpace = message.lastIndexOf(' ', maxLength - 3) // Leave room for '...'
  if (lastSpace > maxLength * 0.7 && lastSpace > 0) {
    return message.substring(0, lastSpace) + '...'
  }
  return message.substring(0, maxLength - 3) + '...'
}

export interface Notification {
  id: string
  business_id: string
  type: 'new_lead' | 'customer_reply' | 'followup_completed' | 'followup_sent' | 'forwarding_disconnected' | 'sms_failed' | 'trial_ending' | 'subscription_issue' | 'voicemail_received' | 'missed_call' | 'ai_intake_completed' | 'payment_requested' | 'payment_created' | 'payment_completed' | 'calendar_connected' | 'calendar_disconnected' | 'appointment_created' | 'appointment_deleted' | 'personal_voicemail'
  title: string
  message: string
  data?: any
  read: boolean
  action_url?: string
  action_text?: string
  created_at: string
}

export interface NotificationCount {
  unread: number
  total: number
}

// Notification templates
export const NOTIFICATION_TEMPLATES = {
  new_lead: (data: { leadName: string; leadPhone: string; leadId: string; callSid?: string }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, data.leadPhone)
    return {
      title: displayName === 'Customer' ? 'New Customer' : `${displayName}`,
      message: 'New customer request',
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'View Lead'
    }
  },

  customer_reply: (data: { leadName: string; message: string; leadId: string; hasPhoto?: boolean }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, null)
    const truncatedMessage = truncateMessage(data.message, 120)
    return {
      title: data.hasPhoto ? 'Photo sent' : 'New Reply',
      message: displayName === 'Customer' ? truncatedMessage : `${displayName}: ${truncatedMessage}`,
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'Reply'
    }
  },

  followup_completed: (data: { leadName: string; leadId: string }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, null)
    return {
      title: displayName === 'Customer' ? 'Follow-Up Sent' : `${displayName}`,
      message: 'All follow-up messages sent',
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'View Lead'
    }
  },

  forwarding_disconnected: () => ({
    title: 'Call Forwarding Disconnected',
    message: 'Tap to fix setup',
    action_url: '/setup/phone-forwarding',
    action_text: 'Fix Setup'
  }),

  sms_failed: (data: { leadName: string; leadId: string }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, null)
    return {
      title: 'Message Failed',
      message: `Not delivered to ${displayName}`,
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'Retry'
    }
  },

  trial_ending: (data: { daysLeft: number }) => ({
    title: 'Trial Ending Soon',
    message: `${data.daysLeft} day${data.daysLeft !== 1 ? 's' : ''} remaining`,
    action_url: '/pricing',
    action_text: 'Upgrade'
  }),

  subscription_issue: (data: { issue: string }) => ({
    title: 'Subscription Issue',
    message: data.issue,
    action_url: '/dashboard/settings',
    action_text: 'Fix Issue'
  }),

  voicemail_received: (data: { leadName: string; leadPhone: string; leadId: string }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, data.leadPhone)
    return {
      title: 'New Voicemail',
      message: displayName === 'Customer' ? 'Tap to listen' : `From ${displayName}`,
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'Listen'
    }
  },

  ai_intake_completed: (data: { leadName: string; leadPhone: string; leadId: string; serviceRequested?: string; aiCallRecordId?: string }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, data.leadPhone)
    const service = data.serviceRequested ? normalizePunctuation(data.serviceRequested) : ''
    return {
      title: displayName === 'Customer' ? 'New Request' : `${displayName}`,
      message: service ? `${service}` : 'New customer request',
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'View Lead'
    }
  },

  payment_requested: (data: { leadName: string; leadPhone: string; leadId: string; amountCents: number; description?: string }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, data.leadPhone)
    const amount = `$${(data.amountCents / 100).toFixed(2)}`
    return {
      title: 'Payment Requested',
      message: `${amount} sent to ${displayName}`,
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'View Lead'
    }
  },

  payment_created: (data: { leadName: string; leadPhone: string; leadId: string; amountCents: number; description?: string }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, data.leadPhone)
    const amount = `$${(data.amountCents / 100).toFixed(2)}`
    return {
      title: 'Payment Request Ready',
      message: `${amount} for ${displayName}`,
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'View Lead'
    }
  },

  payment_completed: (data: { leadName: string; leadPhone: string; leadId: string; amountCents: number }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, data.leadPhone)
    const amount = `$${(data.amountCents / 100).toFixed(2)}`
    return {
      title: 'Payment Received',
      message: `${amount} from ${displayName}`,
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'View Lead'
    }
  },

  calendar_connected: (data: { calendarEmail?: string }) => ({
    title: 'Calendar Connected',
    message: data.calendarEmail ? `Linked to ${data.calendarEmail}` : 'Google Calendar synced',
    action_url: '/dashboard/calendar',
    action_text: 'View Calendar'
  }),

  calendar_disconnected: () => ({
    title: 'Calendar Disconnected',
    message: 'Google Calendar link removed',
    action_url: '/dashboard/calendar',
    action_text: 'View Calendar'
  }),

  appointment_created: (data: { title: string, date: string }) => ({
    title: 'Appointment Scheduled',
    message: `${data.title} · ${new Date(data.date).toLocaleDateString()}`,
    action_url: '/dashboard/calendar',
    action_text: 'View Calendar'
  }),

  appointment_deleted: (data: { title: string }) => ({
    title: 'Appointment Cancelled',
    message: data.title,
    action_url: '/dashboard/calendar',
    action_text: 'View Calendar'
  }),

  personal_voicemail: (data: { callerPhone: string; voicemailId: string }) => {
    const formattedPhone = formatPhoneNumber(data.callerPhone)
    return {
      title: 'Personal Voicemail',
      message: `From ${formattedPhone}`,
      action_url: '/dashboard/personal-voicemail',
      action_text: 'Listen'
    }
  },

  // Legacy notification types for backward compatibility
  followup_sent: (data: { leadName: string; leadId: string }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, null)
    return {
      title: displayName === 'Customer' ? 'Follow-Up Sent' : `${displayName}`,
      message: 'Follow-up message sent',
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'View Lead'
    }
  },

  missed_call: (data: { leadName: string; leadPhone: string; leadId: string }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, data.leadPhone)
    return {
      title: displayName === 'Customer' ? 'Missed Call' : `${displayName}`,
      message: 'Missed call',
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'View Lead'
    }
  }
}

export class NotificationServiceServer {
  async getNotifications(businessId: string, limit = 20): Promise<Notification[]> {
    console.log('[NOTIFICATIONS] Fetching notifications for business:', businessId, 'limit:', limit)
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[NOTIFICATIONS] Error fetching notifications:', error)
      return []
    }

    console.log('[NOTIFICATIONS] Fetched count:', data?.length || 0, 'payload:', data)
    return data || []
  }

  async getNotificationCount(businessId: string): Promise<NotificationCount> {
    console.log('[NOTIFICATIONS] Fetching notification count for business:', businessId)
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('read')
      .eq('business_id', businessId)

    if (error) {
      console.error('[NOTIFICATIONS] Error fetching notification count:', error)
      return { unread: 0, total: 0 }
    }

    const notifications = data || []
    const count = {
      unread: notifications.filter((n: any) => !n.read).length,
      total: notifications.length
    }
    console.log('[NOTIFICATIONS] Count result:', count)
    return count
  }

  async markAsRead(notificationId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)

    if (error) {
      console.error('[NOTIFICATIONS] Error marking notification as read:', error)
    }
  }

  async markAllAsRead(businessId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('business_id', businessId)
      .eq('read', false)

    if (error) {
      console.error('[NOTIFICATIONS] Error marking all notifications as read:', error)
    }
  }

  async createNotification(
    businessId: string,
    type: Notification['type'],
    message: string,
    data?: any,
    actionUrl?: string,
    actionText?: string
  ): Promise<boolean> {
    const template = NOTIFICATION_TEMPLATES[type]
    let notificationData: any = template

    if (typeof template === 'function') {
      notificationData = template(data || {})
    }

    // Note: Core operational notifications are no longer suppressible via user preferences
    // OS-level Android/iOS notification permission remains authoritative for push display
    // This check is retained for future extensibility but currently always returns false
    if (shouldSuppressNotification(null, type)) {
      console.log('[NOTIFICATIONS SUPPRESSED]', {
        businessId,
        type
      })
      return true
    }

    // Atomic idempotency for ai_intake_completed only
    // Uses INSERT + unique constraint (23505 error) to prevent race conditions
    let idempotencyKey: string | null = null
    let useAtomicIdempotency = false

    if (data && data.aiCallRecordId && type === 'ai_intake_completed') {
      // Use aiCallRecordId as the stable per-event identifier
      // Do NOT use leadId as fallback to avoid suppressing legitimate subsequent AI calls
      idempotencyKey = `ai_${data.aiCallRecordId}`
      useAtomicIdempotency = true
    }

    console.log('[NOTIFICATIONS INSERT PAYLOAD]', {
      businessId,
      type,
      idempotencyKey,
      useAtomicIdempotency,
      title: notificationData.title,
      message: message || notificationData.message,
      data,
      actionUrl: actionUrl || notificationData.action_url,
      actionText: actionText || notificationData.action_text
    })

    const insertPayload = {
      business_id: businessId,
      type,
      title: notificationData.title,
      message: message || notificationData.message,
      data,
      action_url: actionUrl || notificationData.action_url,
      action_text: actionText || notificationData.action_text,
      read: false,
      created_at: new Date().toISOString()
    }

    let insertedData: any
    let error: any
    let isNewInsert = false

    if (useAtomicIdempotency && idempotencyKey) {
      // Attempt INSERT with idempotency_key
      // Unique database constraint (business_id, type, idempotency_key) arbitrates concurrent inserts
      const { data: insertData, error: insertError } = await supabaseAdmin
        .from('notifications')
        .insert({
          ...insertPayload,
          idempotency_key: idempotencyKey
        })
        .select('id, created_at')
        .single()

      if (insertError) {
        // Check for unique constraint violation (duplicate notification)
        if (insertError.code === '23505') {
          console.log('[NOTIFICATIONS IDEMPOTENT SKIP - UNIQUE CONSTRAINT]', {
            businessId,
            type,
            idempotencyKey
          })

          // Fetch existing notification by idempotency key
          const { data: existingNotification } = await supabaseAdmin
            .from('notifications')
            .select('id, created_at')
            .eq('business_id', businessId)
            .eq('type', type)
            .eq('idempotency_key', idempotencyKey)
            .single()

          insertedData = existingNotification
          error = null
          isNewInsert = false // Existing row, do NOT trigger push

          console.log('[NOTIFICATIONS REUSED EXISTING]', {
            notificationId: insertedData?.id,
            createdAt: insertedData?.created_at
          })
        } else {
          // Real error - preserve existing error handling
          console.error('[NOTIFICATIONS INSERT ERROR]', {
            code: insertError.code,
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint
          })
          return false
        }
      } else {
        // INSERT succeeded - this invocation created the row
        insertedData = insertData
        error = null
        isNewInsert = true // New row, trigger push

        console.log('[NOTIFICATIONS INSERT SUCCESS]', {
          notificationId: insertedData?.id,
          createdAt: insertedData?.created_at
        })
      }
    } else {
      // Regular insert for non-idempotent notification types
      const result = await supabaseAdmin
        .from('notifications')
        .insert(insertPayload)
        .select('id')
        .single()

      insertedData = result.data
      error = result.error
      isNewInsert = true

      if (error) {
        console.error('[NOTIFICATIONS INSERT ERROR]', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        })
        return false
      }

      console.log('[NOTIFICATIONS INSERT SUCCESS]', {
        notificationId: insertedData?.id
      })
    }

    if (error) {
      console.error('[NOTIFICATIONS INSERT ERROR]', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      })
      return false
    } else {
      const notificationId = insertedData.id
      console.log('[NOTIFICATIONS FINAL RESULT]', {
        businessId,
        type,
        notificationId,
        idempotencyKey,
        isNewInsert,
        createdAt: insertedData.created_at
      })

      // Send push notification asynchronously ONLY for new inserts
      // Existing rows (from 23505 conflict) do NOT trigger push again
      // This ensures only the invocation that actually created the notification row triggers push
      if (isNewInsert) {
        setImmediate(async () => {
          try {
            console.log('[PUSH] delivery triggered', { notificationId })
            const notification = {
              id: notificationId,
              business_id: businessId,
              type,
              title: notificationData.title,
              message: message || notificationData.message,
              action_url: actionUrl || notificationData.action_url,
              data,
            }
            await sendPushForNotification(notification)
          } catch (pushError) {
            console.error('[NOTIFICATIONS PUSH ERROR]', {
              notificationId,
              error: pushError instanceof Error ? pushError.message : String(pushError)
            })
            // Push failures are logged but do not affect the notification creation success
          }
        })
      } else {
        console.log('[PUSH] delivery skipped - existing notification reused', {
          notificationId,
          originalCreatedAt: insertedData.created_at
        })
      }

      return true
    }
  }

  // Helper methods for common notification scenarios
  async notifyNewLead(businessId: string, leadName: string, leadPhone: string, leadId: string, callSid?: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'new_lead',
      '',
      { leadName, leadPhone, leadId, callSid }
    )
  }

  async notifyCustomerReply(businessId: string, leadName: string, message: string, leadId: string, messageId?: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'customer_reply',
      '',
      { leadName, message, leadId, messageId }
    )
  }

  async notifyFollowupCompleted(businessId: string, leadName: string, leadId: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'followup_completed',
      '',
      { leadName, leadId }
    )
  }

  async notifyVoicemailReceived(businessId: string, leadName: string, leadPhone: string, leadId: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'voicemail_received',
      '',
      { leadName, leadPhone, leadId }
    )
  }

  async notifyTrialEnding(businessId: string, daysLeft: number): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'trial_ending',
      '',
      { daysLeft }
    )
  }

  async notifySubscriptionIssue(businessId: string, issue: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'subscription_issue',
      '',
      { issue }
    )
  }

  async notifySmsFailed(businessId: string, leadName: string, leadId: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'sms_failed',
      '',
      { leadName, leadId }
    )
  }

  async notifyAiIntakeCompleted(businessId: string, leadName: string, leadPhone: string, leadId: string, serviceRequested?: string, aiCallRecordId?: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'ai_intake_completed',
      '',
      { leadName, leadPhone, leadId, serviceRequested, aiCallRecordId }
    )
  }

  async notifyPaymentRequested(businessId: string, leadId: string, leadPhone: string, amountCents: number, description?: string, leadName?: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'payment_requested',
      '',
      { leadName: leadName || leadPhone, leadPhone, leadId, amountCents, description }
    )
  }

  async notifyPaymentCreated(businessId: string, leadId: string, leadPhone: string, amountCents: number, description?: string, leadName?: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'payment_created',
      '',
      { leadName: leadName || leadPhone, leadPhone, leadId, amountCents, description }
    )
  }

  async notifyPaymentCompleted(businessId: string, leadId: string, leadPhone: string, amountCents: number): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'payment_completed',
      '',
      { leadName: leadPhone, leadPhone, leadId, amountCents }
    )
  }

  async notifyCalendarConnected(businessId: string, calendarEmail?: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'calendar_connected',
      '',
      { calendarEmail }
    )
  }

  async notifyCalendarDisconnected(businessId: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'calendar_disconnected',
      '',
      {}
    )
  }

  async notifyAppointmentCreated(businessId: string, title: string, date: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'appointment_created',
      '',
      { title, date }
    )
  }

  async notifyAppointmentDeleted(businessId: string, title: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'appointment_deleted',
      '',
      { title }
    )
  }
}

export const notificationServiceServer = new NotificationServiceServer()
