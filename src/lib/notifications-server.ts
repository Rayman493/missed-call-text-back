import { supabaseAdmin } from '@/lib/supabase/admin'

export interface Notification {
  id: string
  business_id: string
  type: 'new_lead' | 'customer_reply' | 'followup_completed' | 'forwarding_disconnected' | 'sms_failed' | 'trial_ending' | 'subscription_issue' | 'voicemail_received' | 'ai_intake_completed'
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
  
  customer_reply: (data: { leadName: string; message: string; leadId: string }) => ({
    title: 'Customer Replied',
    message: `${data.leadName}: "${data.message.substring(0, 60)}${data.message.length > 60 ? '...' : ''}"`,
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
    message: `${data.leadName || data.leadPhone || 'Customer'} requested help${data.serviceRequested ? ` with ${data.serviceRequested}` : ''}`,
    action_url: `/dashboard/leads/${data.leadId}`,
    action_text: 'View Lead'
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
  ): Promise<void> {
    const template = NOTIFICATION_TEMPLATES[type]
    let notificationData: any = template
    
    if (typeof template === 'function') {
      notificationData = template(data || {})
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
    } else {
      console.log('[NOTIFICATIONS INSERT SUCCESS]', { businessId, type })
    }
  }

  // Helper methods for common notification scenarios
  async notifyNewLead(businessId: string, leadName: string, leadPhone: string, leadId: string): Promise<void> {
    await this.createNotification(
      businessId,
      'new_lead',
      '',
      { leadName, leadPhone, leadId }
    )
  }

  async notifyCustomerReply(businessId: string, leadName: string, message: string, leadId: string): Promise<void> {
    await this.createNotification(
      businessId,
      'customer_reply',
      '',
      { leadName, message, leadId }
    )
  }

  async notifyFollowupCompleted(businessId: string, leadName: string, leadId: string): Promise<void> {
    await this.createNotification(
      businessId,
      'followup_completed',
      '',
      { leadName, leadId }
    )
  }

  async notifyVoicemailReceived(businessId: string, leadName: string, leadPhone: string, leadId: string): Promise<void> {
    await this.createNotification(
      businessId,
      'voicemail_received',
      '',
      { leadName, leadPhone, leadId }
    )
  }

  async notifyTrialEnding(businessId: string, daysLeft: number): Promise<void> {
    await this.createNotification(
      businessId,
      'trial_ending',
      '',
      { daysLeft }
    )
  }

  async notifySubscriptionIssue(businessId: string, issue: string): Promise<void> {
    await this.createNotification(
      businessId,
      'subscription_issue',
      '',
      { issue }
    )
  }

  async notifyAiIntakeCompleted(businessId: string, leadName: string, leadPhone: string, leadId: string, serviceRequested?: string): Promise<void> {
    await this.createNotification(
      businessId,
      'ai_intake_completed',
      '',
      { leadName, leadPhone, leadId, serviceRequested }
    )
  }
}

export const notificationServiceServer = new NotificationServiceServer()
