/**
 * Shared notification icon and color mapping
 * Used by both NavbarNotifications dropdown and dedicated Notifications page
 */

import { Bell, User, MessageSquare, CheckCircle, PhoneMissed, MessageCircle, Clock, AlertTriangle, Calendar, CreditCard } from 'lucide-react'
import { ReactElement } from 'react'

export interface NotificationIconConfig {
  icon: ReactElement
  colorClass: string
  dotColorClass: string
}

/**
 * Get semantic icon for notification type
 * Falls back to Bell for unknown types
 */
export function getNotificationIcon(type: string): ReactElement {
  switch (type) {
    case 'new_lead':
      return <User className="w-4 h-4" />
    case 'customer_reply':
      return <MessageSquare className="w-4 h-4" />
    case 'followup_completed':
      return <CheckCircle className="w-4 h-4" />
    case 'forwarding_disconnected':
      return <PhoneMissed className="w-4 h-4" />
    case 'sms_failed':
      return <MessageCircle className="w-4 h-4" />
    case 'trial_ending':
      return <Clock className="w-4 h-4" />
    case 'subscription_issue':
      return <AlertTriangle className="w-4 h-4" />
    case 'voicemail_received':
      return <PhoneMissed className="w-4 h-4" />
    case 'ai_intake_completed':
      return <User className="w-4 h-4" />
    case 'payment_requested':
      return <CreditCard className="w-4 h-4" />
    case 'payment_created':
      return <CreditCard className="w-4 h-4" />
    case 'payment_completed':
      return <CreditCard className="w-4 h-4" />
    case 'calendar_connected':
      return <Calendar className="w-4 h-4" />
    case 'calendar_disconnected':
      return <Calendar className="w-4 h-4" />
    case 'appointment_created':
      return <Calendar className="w-4 h-4" />
    case 'appointment_deleted':
      return <Calendar className="w-4 h-4" />
    case 'personal_voicemail':
      return <PhoneMissed className="w-4 h-4" />
    default:
      return <Bell className="w-4 h-4" />
  }
}

/**
 * Get color class for notification icon background
 * Provides semantic color that works in both Light and Dark modes
 */
export function getNotificationColor(type: string): string {
  switch (type) {
    case 'new_lead':
      return 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
    case 'customer_reply':
      return 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400'
    case 'followup_completed':
      return 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
    case 'forwarding_disconnected':
      return 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400'
    case 'sms_failed':
      return 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400'
    case 'trial_ending':
      return 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
    case 'subscription_issue':
      return 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
    case 'voicemail_received':
      return 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400'
    case 'ai_intake_completed':
      return 'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400'
    case 'payment_requested':
      return 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400'
    case 'payment_created':
      return 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400'
    case 'payment_completed':
      return 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
    case 'calendar_connected':
      return 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400'
    case 'calendar_disconnected':
      return 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400'
    case 'appointment_created':
      return 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400'
    case 'appointment_deleted':
      return 'bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400'
    case 'personal_voicemail':
      return 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400'
    default:
      return 'bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400'
  }
}

/**
 * Get color class for notification unread dot
 */
export function getNotificationDotColor(type: string): string {
  switch (type) {
    case 'new_lead':
      return 'bg-blue-400'
    case 'customer_reply':
      return 'bg-green-400'
    case 'followup_completed':
      return 'bg-emerald-400'
    case 'forwarding_disconnected':
      return 'bg-red-400'
    case 'sms_failed':
      return 'bg-red-400'
    case 'trial_ending':
      return 'bg-amber-400'
    case 'subscription_issue':
      return 'bg-amber-400'
    case 'voicemail_received':
      return 'bg-purple-400'
    case 'ai_intake_completed':
      return 'bg-cyan-400'
    case 'payment_requested':
      return 'bg-green-400'
    case 'payment_created':
      return 'bg-green-400'
    case 'payment_completed':
      return 'bg-emerald-400'
    case 'calendar_connected':
      return 'bg-purple-400'
    case 'calendar_disconnected':
      return 'bg-red-400'
    case 'appointment_created':
      return 'bg-purple-400'
    case 'appointment_deleted':
      return 'bg-slate-400'
    case 'personal_voicemail':
      return 'bg-purple-400'
    default:
      return 'bg-slate-400'
  }
}