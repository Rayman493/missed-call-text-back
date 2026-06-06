import { createBrowserClient } from '@/lib/supabase/browser'
import { Business } from '@/lib/types'

export interface Notification {
  id: string
  business_id: string
  type: 'new_lead' | 'customer_reply' | 'followup_completed' | 'followup_sent' | 'forwarding_disconnected' | 'sms_failed' | 'trial_ending' | 'subscription_issue' | 'voicemail_received'
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

  followup_sent: (data: { leadName: string; leadId: string }) => ({
    title: 'Follow-up Sent',
    message: `Message sent to ${data.leadName}`,
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
  })
}

export class NotificationService {
  private supabase = createBrowserClient()

  async getNotifications(businessId: string, limit = 20): Promise<Notification[]> {
    console.log('[NOTIFICATIONS UI FETCH START]', { businessId, limit })
    const { data, error } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.log('[NOTIFICATIONS UI FETCH ERROR]', { error, businessId })
      return []
    }

    console.log('[NOTIFICATIONS UI FETCH RESULT]', { count: data?.length || 0, businessId, payload: data })
    return data || []
  }

  async getNotificationCount(businessId: string): Promise<NotificationCount> {
    console.log('[NOTIFICATIONS UI FETCH START]', { businessId, operation: 'count' })
    const { data, error } = await this.supabase
      .from('notifications')
      .select('read')
      .eq('business_id', businessId)

    if (error) {
      console.log('[NOTIFICATIONS UI FETCH ERROR]', { error, businessId, operation: 'count' })
      return { unread: 0, total: 0 }
    }

    const notifications = data || []
    const count = {
      unread: notifications.filter((n: any) => !n.read).length,
      total: notifications.length
    }
    console.log('[NOTIFICATIONS UI FETCH RESULT]', { count, businessId })
    return count
  }

  async markAsRead(notificationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)

    if (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  async markAllAsRead(businessId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({ read: true })
      .eq('business_id', businessId)
      .eq('read', false)

    if (error) {
      console.error('Error marking all notifications as read:', error)
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

    const { error } = await this.supabase
      .from('notifications')
      .insert({
        business_id: businessId,
        type,
        title: notificationData.title,
        message: message || notificationData.message,
        data,
        read: false,
        action_url: actionUrl || notificationData.action_url,
        action_text: actionText || notificationData.action_text,
        created_at: new Date().toISOString()
      })

    if (error) {
      console.error('Error creating notification:', error)
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

  async notifyFollowupSent(businessId: string, leadName: string, leadId: string): Promise<void> {
    await this.createNotification(
      businessId,
      'followup_sent',
      '',
      { leadName, leadId }
    )
  }

  async notifySmsFailed(businessId: string, leadName: string, leadId: string): Promise<void> {
    await this.createNotification(
      businessId,
      'sms_failed',
      '',
      { leadName, leadId }
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
}

export const notificationService = new NotificationService()
