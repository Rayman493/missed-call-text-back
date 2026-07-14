import { createBrowserClient } from '@/lib/supabase/browser'
import { createClient } from '@supabase/supabase-js'
import { Business } from '@/lib/types'

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
    message: `${data.leadName || data.leadPhone || 'Customer'} requested help${data.serviceRequested ? ` with ${data.serviceRequested}` : ''}`,
    action_url: `/dashboard/leads/${data.leadId}`,
    action_text: 'View Lead'
  }),

  payment_requested: (data: { leadName: string; leadPhone: string; leadId: string; amountCents: number; description?: string }) => ({
    title: 'Payment Request Sent',
    message: `Payment request of $${(data.amountCents / 100).toFixed(2)} sent to ${data.leadName || data.leadPhone}${data.description ? ` for ${data.description}` : ''}`,
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

export class NotificationService {
  private supabase = createBrowserClient()
  private isServerSide: boolean = false

  constructor(serverSideClient?: any) {
    if (serverSideClient) {
      this.supabase = serverSideClient
      this.isServerSide = true
    }
  }

  async getNotifications(businessId: string, limit = 20): Promise<Notification[]> {
    const { data, error } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching notifications:', error)
      return []
    }

    return data || []
  }

  async getNotificationCount(businessId: string): Promise<NotificationCount> {
    const { data, error } = await this.supabase
      .from('notifications')
      .select('read')
      .eq('business_id', businessId)

    if (error) {
      console.error('Error fetching notification count:', error)
      return { unread: 0, total: 0 }
    }

    const notifications = data || []
    const count = {
      unread: notifications.filter((n: any) => !n.read).length,
      total: notifications.length
    }
    return count
  }

  async markAsRead(notificationId: string): Promise<void> {
    // Use server-side API to ensure proper authentication and persistence
    const response = await fetch(`/api/notifications/${notificationId}/mark-read`, {
      method: 'PATCH',
    })

    if (!response.ok) {
      console.error('Error marking notification as read:', response.statusText)
      throw new Error('Failed to mark notification as read')
    }
  }

  async markAllAsRead(businessId: string): Promise<void> {
    // Use server-side API to ensure proper authentication and persistence
    const response = await fetch(`/api/notifications/mark-all-read?businessId=${businessId}`, {
      method: 'PATCH',
    })

    if (!response.ok) {
      console.error('Error marking all notifications as read:', response.statusText)
      throw new Error('Failed to mark all notifications as read')
    }
  }

  async deleteNotification(notificationId: string): Promise<void> {
    // Use server-side API to ensure proper authentication and persistence
    const response = await fetch(`/api/notifications/${notificationId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      console.error('Error deleting notification:', response.statusText)
      throw new Error('Failed to delete notification')
    }
  }

  async clearAllNotifications(businessId: string): Promise<void> {
    // Use server-side API to ensure proper authentication and persistence
    const response = await fetch(`/api/notifications/clear?businessId=${businessId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      console.error('Error clearing notifications:', response.statusText)
      throw new Error('Failed to clear notifications')
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
