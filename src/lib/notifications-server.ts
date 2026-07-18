import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendPushForNotification } from '@/lib/fcm-sender'
import { normalizePunctuation } from '@/lib/utils'

export interface Notification {
  id: string
  business_id: string
  type: 'new_lead' | 'customer_reply' | 'followup_completed' | 'forwarding_disconnected' | 'sms_failed' | 'trial_ending' | 'subscription_issue' | 'voicemail_received' | 'ai_intake_completed' | 'payment_requested' | 'payment_completed' | 'calendar_connected' | 'calendar_disconnected' | 'appointment_created' | 'appointment_deleted' | 'personal_voicemail'
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
  new_lead: (data: { leadName: string; leadPhone: string; leadId: string }) => ({
    title: 'New Lead Captured',
    message: `${data.leadName} (${data.leadPhone}) is waiting for your response`,
    action_url: `/dashboard/leads/${data.leadId}`,
    action_text: 'View Lead'
  }),
  
  customer_reply: (data: { leadName: string; message: string; leadId: string; hasPhoto?: boolean }) => ({
    title: data.hasPhoto ? 'Customer Sent Photo' : 'Customer Replied',
    message: data.message.substring(0, 80) + (data.message.length > 80 ? '...' : ''),
    action_url: `/dashboard/leads/${data.leadId}`,
    action_text: 'Reply'
  }),
  
  followup_completed: (data: { leadName: string; leadId: string }) => ({
    title: 'Follow-up Sequence Completed',
    message: `All follow-ups sent to ${data.leadName}`,
    action_url: `/dashboard/leads/${data.leadId}`,
    action_text: 'View Lead'
  }),
  
  forwarding_disconnected: () => ({
    title: 'Call Forwarding Issue',
    message: 'Call forwarding may be disconnected. Check your setup.',
    action_url: '/setup/phone-forwarding',
    action_text: 'Fix Setup'
  }),
  
  sms_failed: (data: { leadName: string; leadId: string }) => ({
    title: 'SMS Delivery Failed',
    message: `Failed to send message to ${data.leadName}`,
    action_url: `/dashboard/leads/${data.leadId}`,
    action_text: 'Retry'
  }),
  
  trial_ending: (data: { daysLeft: number }) => ({
    title: 'Trial Ending Soon',
    message: `Your trial ends in ${data.daysLeft} days`,
    action_url: '/pricing',
    action_text: 'Upgrade'
  }),
  
  subscription_issue: (data: { issue: string }) => ({
    title: 'Subscription Issue',
    message: data.issue,
    action_url: '/dashboard/settings',
    action_text: 'Fix Issue'
  }),

  voicemail_received: (data: { leadName: string; leadPhone: string; leadId: string }) => ({
    title: 'New Voicemail',
    message: `${data.leadName} (${data.leadPhone}) left a voicemail`,
    action_url: `/dashboard/leads/${data.leadId}`,
    action_text: 'Listen'
  }),

  ai_intake_completed: (data: { leadName: string; leadPhone: string; leadId: string; serviceRequested?: string }) => ({
    title: 'New AI Intake Lead',
    message: `${data.leadName || data.leadPhone || 'Customer'} requested help${data.serviceRequested ? ` with ${normalizePunctuation(data.serviceRequested)}` : ''}`,
    action_url: `/dashboard/leads/${data.leadId}`,
    action_text: 'View Lead'
  }),

  payment_requested: (data: { leadName: string; leadPhone: string; leadId: string; amountCents: number; description?: string }) => ({
    title: 'Payment Request Sent',
    message: `Payment request of $${(data.amountCents / 100).toFixed(2)} sent to ${data.leadName || data.leadPhone}${data.description ? ` for ${normalizePunctuation(data.description)}` : ''}`,
    action_url: `/dashboard/leads/${data.leadId}`,
    action_text: 'View Lead'
  }),

  payment_completed: (data: { leadName: string; leadPhone: string; leadId: string; amountCents: number }) => ({
    title: 'Payment Received',
    message: `$${(data.amountCents / 100).toFixed(2)} payment received from ${data.leadName || data.leadPhone}`,
    action_url: `/dashboard/leads/${data.leadId}`,
    action_text: 'View Lead'
  }),

  calendar_connected: (data: { calendarEmail?: string }) => ({
    title: 'Google Calendar Connected',
    message: data.calendarEmail ? `Connected to ${data.calendarEmail}` : 'Google Calendar connected successfully',
    action_url: '/dashboard/calendar',
    action_text: 'View Calendar'
  }),

  calendar_disconnected: () => ({
    title: 'Google Calendar Disconnected',
    message: 'Google Calendar has been disconnected',
    action_url: '/dashboard/calendar',
    action_text: 'View Calendar'
  }),

  appointment_created: (data: { title: string, date: string }) => ({
    title: 'Appointment Created',
    message: `${data.title} scheduled for ${new Date(data.date).toLocaleDateString()}`,
    action_url: '/dashboard/calendar',
    action_text: 'View Calendar'
  }),

  appointment_deleted: (data: { title: string }) => ({
    title: 'Appointment Deleted',
    message: `${data.title} has been deleted`,
    action_url: '/dashboard/calendar',
    action_text: 'View Calendar'
  }),

  personal_voicemail: (data: { callerPhone: string; voicemailId: string }) => ({
    title: 'New Personal Voicemail',
    message: `Voicemail from ${data.callerPhone}`,
    action_url: '/dashboard/personal-voicemail',
    action_text: 'Listen'
  })
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

    // Idempotency check: prevent duplicate notifications for the same context
    // Check for customer_reply by messageId
    if (data && data.messageId && type === 'customer_reply') {
      const { data: existingNotification } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('business_id', businessId)
        .eq('type', type)
        .eq('data->>leadId', data.leadId)
        .eq('data->>messageId', data.messageId)
        .maybeSingle()

      if (existingNotification) {
        console.log('[NOTIFICATIONS IDEMPOTENT SKIP]', { 
          businessId, 
          type, 
          leadId: data.leadId,
          messageId: data.messageId 
        })
        return true // Return true to indicate success (notification already exists)
      }
    }

    // Idempotency check for voicemail_received by recordingSid
    if (data && data.recordingSid && type === 'voicemail_received') {
      const { data: existingNotification } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('business_id', businessId)
        .eq('type', type)
        .eq('data->>leadId', data.leadId)
        .eq('data->>recordingSid', data.recordingSid)
        .maybeSingle()

      if (existingNotification) {
        console.log('[NOTIFICATIONS IDEMPOTENT SKIP]', { 
          businessId, 
          type, 
          leadId: data.leadId,
          recordingSid: data.recordingSid 
        })
        return true
      }
    }

    // Idempotency check for new_lead by leadId
    if (data && data.leadId && type === 'new_lead') {
      const { data: existingNotification } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('business_id', businessId)
        .eq('type', type)
        .eq('data->>leadId', data.leadId)
        .maybeSingle()

      if (existingNotification) {
        console.log('[NOTIFICATIONS IDEMPOTENT SKIP]', { 
          businessId, 
          type, 
          leadId: data.leadId 
        })
        return true
      }
    }

    // Idempotency check for ai_intake_completed by leadId
    if (data && data.leadId && type === 'ai_intake_completed') {
      const { data: existingNotification } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('business_id', businessId)
        .eq('type', type)
        .eq('data->>leadId', data.leadId)
        .maybeSingle()

      if (existingNotification) {
        console.log('[NOTIFICATIONS IDEMPOTENT SKIP]', { 
          businessId, 
          type, 
          leadId: data.leadId 
        })
        return true
      }
    }

    console.log('[NOTIFICATIONS INSERT PAYLOAD]', { 
      businessId, 
      type, 
      title: notificationData.title,
      message: message || notificationData.message,
      data,
      actionUrl: actionUrl || notificationData.action_url,
      actionText: actionText || notificationData.action_text
    })

    const { error } = await supabaseAdmin
      .from('notifications')
      .insert({
        business_id: businessId,
        type,
        title: notificationData.title,
        message: message || notificationData.message,
        data,
        action_url: actionUrl || notificationData.action_url,
        action_text: actionText || notificationData.action_text,
        read: false,
        created_at: new Date().toISOString()
      })

    if (error) {
      console.error('[NOTIFICATIONS INSERT ERROR]', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      })
      return false
    } else {
      console.log('[NOTIFICATIONS INSERT SUCCESS]', { businessId, type })

      // Send push notification asynchronously (best-effort, does not block)
      // This is fire-and-forget - failures are logged but don't affect the business event
      setImmediate(async () => {
        try {
          console.log('[PUSH] delivery triggered');
          const notification = {
            id: '', // We don't have the ID from the insert, but FCM doesn't need it
            business_id: businessId,
            type,
            title: notificationData.title,
            message: message || notificationData.message,
            action_url: actionUrl || notificationData.action_url,
            data,
          }
          await sendPushForNotification(notification)
        } catch (pushError) {
          console.error('[NOTIFICATIONS PUSH ERROR]', pushError)
          // Push failures are logged but do not affect the notification creation success
        }
      })

      return true
    }
  }

  // Helper methods for common notification scenarios
  async notifyNewLead(businessId: string, leadName: string, leadPhone: string, leadId: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'new_lead',
      '',
      { leadName, leadPhone, leadId }
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

  async notifyAiIntakeCompleted(businessId: string, leadName: string, leadPhone: string, leadId: string, serviceRequested?: string): Promise<boolean> {
    return await this.createNotification(
      businessId,
      'ai_intake_completed',
      '',
      { leadName, leadPhone, leadId, serviceRequested }
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
