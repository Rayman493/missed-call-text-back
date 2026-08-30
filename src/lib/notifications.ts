import { createBrowserClient } from '@/lib/supabase/browser'
import { createClient } from '@supabase/supabase-js'
import { Business } from '@/lib/types'
import { normalizePunctuation, formatCurrency } from '@/lib/utils'

/**
 * Resolve customer display name with fallback priority
 * Priority: meaningful name > formatted phone > "Customer"
 */
export function resolveCustomerDisplayName(leadName?: string | null, leadPhone?: string | null): string {
  const placeholderNames = ['Customer', 'Unknown', 'Unknown Customer', 'Caller', 'Anonymous']
  const trimmedName = leadName?.trim()
  const isPlaceholder = trimmedName && placeholderNames.includes(trimmedName)
  const isMeaningfulName = trimmedName && !isPlaceholder && trimmedName.length > 0

  if (isMeaningfulName) {
    return trimmedName
  }

  if (leadPhone) {
    const formattedPhone = formatPhoneNumber(leadPhone)
    return formattedPhone
  }

  return 'Customer'
}

/**
 * Format phone number to US format
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }
  return phone
}

/**
 * Truncate message while preserving word boundaries
 */
export function truncateMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) {
    return message
  }
  const lastSpace = message.lastIndexOf(' ', maxLength - 3) // Leave room for '...'
  if (lastSpace > maxLength * 0.7 && lastSpace > 0) {
    return message.substring(0, lastSpace) + '...'
  }
  return message.substring(0, maxLength - 3) + '...'
}

/**
 * Resolve notification subject (customer/person) for display
 * Priority: meaningful name > phone number > "Unknown Caller"
 * Used by both dropdown and full notifications page
 */
export function resolveNotificationSubject(notification: Notification): string {
  const data = notification.data || {}

  // Placeholder names to reject
  const placeholderNames = ['Customer', 'Unknown', 'Unknown Customer', 'Caller', 'Anonymous', 'Not collected']

  // Try lead name first
  const leadName = data.leadName || data.lead_name || null
  if (leadName) {
    const trimmedName = leadName.trim()
    const isPlaceholder = placeholderNames.includes(trimmedName)
    const isMeaningfulName = trimmedName && !isPlaceholder && trimmedName.length > 0

    if (isMeaningfulName) {
      return trimmedName
    }
  }

  // Try caller name (for personal voicemail)
  const callerName = data.callerName || data.caller_name || null
  if (callerName) {
    const trimmedName = callerName.trim()
    const isPlaceholder = placeholderNames.includes(trimmedName)
    const isMeaningfulName = trimmedName && !isPlaceholder && trimmedName.length > 0

    if (isMeaningfulName) {
      return trimmedName
    }
  }

  // Fallback to phone number
  const phone = data.leadPhone || data.lead_phone || data.callerPhone || data.caller_phone || null
  if (phone) {
    return formatPhoneNumber(phone)
  }

  // Final fallback
  return 'Unknown Caller'
}

/**
 * Check if a notification already includes customer context in title or message
 * This prevents duplicate customer names in the notification list
 */
export function notificationIncludesCustomerContext(notification: Notification): boolean {
  const subject = resolveNotificationSubject(notification)
  const title = notification.title || ''
  const message = notification.message || ''

  // If subject is "Unknown Caller", don't consider it as customer context
  if (subject === 'Unknown Caller') {
    return false
  }

  // Check if subject is already in title
  if (title.includes(subject)) {
    return true
  }

  // Check if subject is in message (with common prefixes)
  if (message.includes(subject) ||
      message.includes(`From ${subject}`) ||
      message.includes(`to ${subject}`) ||
      message.includes(`for ${subject}`) ||
      message.includes(`${subject}:`)) {
    return true
  }

  return false
}

/**
 * Get customer context for notification display
 * Returns null if context is already included in title/message
 */
export function getNotificationCustomerContext(notification: Notification): string | null {
  // If notification already includes customer context, don't duplicate
  if (notificationIncludesCustomerContext(notification)) {
    return null
  }

  // Otherwise, return the subject
  const subject = resolveNotificationSubject(notification)
  return subject === 'Unknown Caller' ? null : subject
}

export interface Notification {
  id: string
  business_id: string
  type: 'new_lead' | 'customer_reply' | 'followup_completed' | 'followup_sent' | 'forwarding_disconnected' | 'sms_failed' | 'trial_ending' | 'subscription_issue' | 'voicemail_received' | 'missed_call' | 'ai_intake_completed' | 'payment_requested' | 'payment_created' | 'payment_completed' | 'calendar_connected' | 'calendar_disconnected' | 'appointment_created' | 'appointment_deleted' | 'personal_voicemail' | 'reminder'
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
  new_lead: (data: { leadName: string; leadPhone: string; leadId: string }) => {
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

  ai_intake_completed: (data: { leadName: string; leadPhone: string; leadId: string; serviceRequested?: string }) => {
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
    const amount = formatCurrency(data.amountCents, true)
    return {
      title: 'Payment Requested',
      message: `${amount} sent to ${displayName}`,
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'View Lead'
    }
  },

  payment_created: (data: { leadName: string; leadPhone: string; leadId: string; amountCents: number; description?: string }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, data.leadPhone)
    const amount = formatCurrency(data.amountCents, true)
    return {
      title: 'Payment Request Ready',
      message: `${amount} for ${displayName}`,
      action_url: `/dashboard/leads/${data.leadId}`,
      action_text: 'View Lead'
    }
  },

  payment_completed: (data: { leadName: string; leadPhone: string; leadId: string; amountCents: number }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, data.leadPhone)
    const amount = formatCurrency(data.amountCents, true)
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

  appointment_created: (data: { title: string, date: string, leadName?: string, leadPhone?: string }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, data.leadPhone)
    const formattedDate = new Date(data.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return {
      title: 'Appointment Scheduled',
      message: displayName !== 'Customer' ? `${displayName}: ${data.title}` : data.title,
      data: { ...data, leadName: data.leadName, leadPhone: data.leadPhone },
      action_url: '/dashboard/calendar',
      action_text: 'View Calendar'
    }
  },

  appointment_deleted: (data: { title: string, leadName?: string, leadPhone?: string }) => {
    const displayName = resolveCustomerDisplayName(data.leadName, data.leadPhone)
    return {
      title: 'Appointment Cancelled',
      message: displayName !== 'Customer' ? `${displayName}: ${data.title}` : data.title,
      data: { ...data, leadName: data.leadName, leadPhone: data.leadPhone },
      action_url: '/dashboard/calendar',
      action_text: 'View Calendar'
    }
  },

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
  },

  reminder: (data: { title: string }) => {
    return {
      title: 'Reminder',
      message: data.title,
    }
  }
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

  async getNotifications(businessId: string, limit = 20, includeAllUnread = false): Promise<Notification[]> {
    console.log('[NotificationService] Fetching notifications:', { businessId, limit, includeAllUnread })
    
    if (!includeAllUnread) {
      // Simple query for full notifications page (no need for unread guarantee)
      const { data, error } = await this.supabase
        .from('notifications')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('[NotificationService] Simple query failed', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        })
        throw error // Don't swallow - let caller handle
      }

      console.log('[NotificationService] Fetched notifications result (simple):', {
        count: data?.length || 0,
        notifications: data
      })

      return data || []
    }

    // For dropdown: fetch recent + all unread, then merge and deduplicate
    // This guarantees all unread notifications appear regardless of age
    const recentLimit = Math.min(limit, 15) // Cap recent notifications at 15
    
    let recentNotifications: Notification[] = []
    let unreadNotifications: Notification[] = []
    let recentFailed = false
    let unreadFailed = false

    // Fetch recent notifications
    const { data: recentData, error: recentError } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(recentLimit)

    if (recentError) {
      console.error('[NotificationService] Recent query failed', {
        code: recentError.code,
        message: recentError.message,
        details: recentError.details,
        hint: recentError.hint
      })
      recentFailed = true
    } else {
      recentNotifications = recentData || []
      console.log('[NotificationService] Recent query succeeded:', { count: recentNotifications.length })
    }

    const recentIds = new Set(recentNotifications.map((n: any) => n.id))

    // Fetch unread notifications not already in recent set
    const { data: unreadData, error: unreadError } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('business_id', businessId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      // No limit - we need all unread

    if (unreadError) {
      console.error('[NotificationService] Unread query failed', {
        code: unreadError.code,
        message: unreadError.message,
        details: unreadError.details,
        hint: unreadError.hint
      })
      unreadFailed = true
    } else {
      unreadNotifications = (unreadData || []).filter((n: any) => !recentIds.has(n.id))
      console.log('[NotificationService] Unread query succeeded:', { count: unreadNotifications.length })
    }

    // Handle partial failures
    if (recentFailed && unreadFailed) {
      // Both failed - throw error
      throw new Error('Both recent and unread queries failed')
    }

    // Merge and deduplicate
    const merged = [...recentNotifications, ...unreadNotifications]
    
    // Sort by created_at DESC
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    // Apply final limit
    const result = merged.slice(0, limit)

    console.log('[NotificationService] Fetched notifications result (merged):', {
      recentCount: recentNotifications.length,
      unreadCount: unreadNotifications.length,
      mergedCount: merged.length,
      finalCount: result.length,
      recentFailed,
      unreadFailed,
      result
    })

    return result
  }

  async getNotificationCount(businessId: string): Promise<NotificationCount> {
    console.log('[NotificationService] Fetching notification count:', { businessId })
    
    const { data, error } = await this.supabase
      .from('notifications')
      .select('read')
      .eq('business_id', businessId)

    if (error) {
      console.error('[NotificationService] Error fetching notification count:', error)
      return { unread: 0, total: 0 }
    }

    const notifications = data || []
    const count = {
      unread: notifications.filter((n: any) => !n.read).length,
      total: notifications.length
    }
    
    console.log('[NotificationService] Notification count result:', {
      unread: count.unread,
      total: count.total,
      rawNotifications: notifications
    })
    
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
