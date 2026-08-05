'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { Notification } from '@/lib/notifications'
import { generateCanonicalRequestTitle } from '@/lib/ai-intake-formatter'
import { Bell, Check, MessageCircle, PhoneMissed, Send, Calendar, Info, CheckCircle, AlertTriangle, User, MessageSquare, Clock, CreditCard, Trash2, X } from 'lucide-react'

// Hook to detect mobile breakpoint
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768) // md breakpoint
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return isMobile
}

// Hook to lock body scroll when modal is open
const useBodyScrollLock = (isOpen: boolean) => {
  useEffect(() => {
    if (!isOpen) return

    // Save current scroll position
    const scrollY = window.scrollY
    const scrollX = window.scrollX

    // Lock scroll
    const originalStyle = window.getComputedStyle(document.body)
    const originalOverflow = originalStyle.overflow
    const originalPosition = originalStyle.position

    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = `-${scrollX}px`
    document.body.style.width = '100%'
    document.body.style.right = '0'

    // Also lock html element for some browsers
    document.documentElement.style.overflow = 'hidden'

    return () => {
      // Restore scroll position
      document.body.style.overflow = originalOverflow
      document.body.style.position = originalPosition
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.width = ''
      document.body.style.right = ''
      document.documentElement.style.overflow = ''

      window.scrollTo(scrollX, scrollY)
    }
  }, [isOpen])
}

export default function NavbarNotifications() {
  const { business } = useBusiness()
  const router = useRouter()
  const {
    notifications,
    notificationCount,
    displayedUnreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    initializeForBusiness,
    refreshNotifications,
  } = useNotifications()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [buttonPosition, setButtonPosition] = useState<{ top: number; right: number } | null>(null)
  const isMobile = useIsMobile()

  // Lock body scroll when notifications panel is open
  useBodyScrollLock(isOpen)

  // Calculate button position when dropdown opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setButtonPosition({
        top: rect.bottom + 8, // 8px gap
        right: window.innerWidth - rect.right
      })
    } else {
      setButtonPosition(null)
    }
  }, [isOpen])

  // Recalculate position on resize
  useEffect(() => {
    if (!isOpen || !buttonRef.current) return

    const handleResize = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) {
        setButtonPosition({
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right
        })
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Initialize notifications when business is available
  useEffect(() => {
    if (!business) return

    initializeForBusiness(business.id)
  }, [business, initializeForBusiness])

  const handleMarkAsRead = async (notificationId: string) => {
    await markAsRead(notificationId)
  }

  const handleMarkAllAsRead = async () => {
    await markAllAsRead()
  }

  const handleDeleteNotification = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteNotification(notificationId)
  }

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read when clicking
    if (!notification.read) {
      handleMarkAsRead(notification.id)
    }

    // Navigate if there's a link
    if (notification.action_url) {
      router.push(notification.action_url)
      setIsOpen(false)
    }
  }

  const getNotificationIcon = (type: string) => {
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
        console.warn(`[NavbarNotifications] Unknown notification type: ${type}, using default icon`)
        return <Bell className="w-4 h-4" />
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'new_lead':
        return 'bg-blue-500/20 text-blue-400'
      case 'customer_reply':
        return 'bg-green-500/20 text-green-400'
      case 'followup_completed':
        return 'bg-emerald-500/20 text-emerald-400'
      case 'forwarding_disconnected':
        return 'bg-red-500/20 text-red-400'
      case 'sms_failed':
        return 'bg-red-500/20 text-red-400'
      case 'trial_ending':
        return 'bg-amber-500/20 text-amber-400'
      case 'subscription_issue':
        return 'bg-amber-500/20 text-amber-400'
      case 'voicemail_received':
        return 'bg-purple-500/20 text-purple-400'
      case 'ai_intake_completed':
        return 'bg-cyan-500/20 text-cyan-400'
      case 'payment_requested':
        return 'bg-green-500/20 text-green-400'
      case 'payment_created':
        return 'bg-green-500/20 text-green-400'
      case 'payment_completed':
        return 'bg-emerald-500/20 text-emerald-400'
      case 'calendar_connected':
        return 'bg-purple-500/20 text-purple-400'
      case 'calendar_disconnected':
        return 'bg-red-500/20 text-red-400'
      case 'appointment_created':
        return 'bg-purple-500/20 text-purple-400'
      case 'appointment_deleted':
        return 'bg-slate-500/20 text-slate-400'
      case 'personal_voicemail':
        return 'bg-purple-500/20 text-purple-400'
      default:
        return 'bg-slate-500/20 text-slate-400'
    }
  }

  const getNotificationDotColor = (type: string) => {
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

  const formatNotificationTime = (timestamp: string) => {
  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return 'Unknown time'
    
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  } catch (error) {
    console.error('[NavbarNotifications] Error formatting notification time:', error, timestamp)
    return 'Unknown time'
  }
}

  // UI polish: Mask phone numbers for privacy
  const maskPhoneNumber = (phone: string): string => {
    if (!phone) return ''
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 4) return phone
    const last4 = digits.slice(-4)
    return `••••••${last4}`
  }

  // UI polish: Get display message with canonical title for AI intake
  const getDisplayMessage = (notification: Notification): string => {
    if (notification.type === 'ai_intake_completed') {
      // Extract the service request from notification data, not the full message
      const serviceRequested = notification.data?.serviceRequested || 
                              notification.data?.request || 
                              notification.data?.reasonForCalling ||
                              null
      
      if (serviceRequested) {
        const canonicalTitle = generateCanonicalRequestTitle(serviceRequested)
        return canonicalTitle
      }
      
      // Fallback to message if no service request in data
      return notification.message || 'No message'
    }
    return notification.message || 'No message'
  }

  // UI polish: Get display name with phone masking for SMS failures
  const getDisplayName = (notification: Notification): string | null => {
    const name = notification.data?.leadName || notification.data?.lead_phone || null
    if (!name) return null
    
    // Mask phone numbers for SMS failure notifications
    if (notification.type === 'sms_failed' && notification.data?.lead_phone) {
      return maskPhoneNumber(notification.data.lead_phone)
    }
    
    return name
  }

  const groupNotificationsByRecency = (notifications: Notification[]) => {
  try {
    const groups: { [key: string]: Notification[] } = {
      'Today': [],
      'Yesterday': [],
      'Earlier This Week': [],
      'Older': []
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const thisWeek = new Date(today)
    thisWeek.setDate(thisWeek.getDate() - 7)

    notifications.forEach(notification => {
      const notificationDate = new Date(notification.created_at)
      
      if (notificationDate >= today) {
        groups['Today'].push(notification)
      } else if (notificationDate >= yesterday) {
        groups['Yesterday'].push(notification)
      } else if (notificationDate >= thisWeek) {
        groups['Earlier This Week'].push(notification)
      } else {
        groups['Older'].push(notification)
      }
    })

    return groups
  } catch (error) {
    console.error('[NavbarNotifications] Error grouping notifications:', error)
    // Fallback: return all notifications in 'Today' group if grouping fails
    return { 'Today': notifications, 'Yesterday': [], 'Earlier This Week': [], 'Older': [] }
  }
}

  return (
    <>
      {/* Notification Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-10 w-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        
        {/* Unread Badge - Only show when displayedUnreadCount > 0 */}
        {displayedUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] px-1 flex items-center justify-center bg-blue-600 text-white text-[10px] font-bold rounded-full">
            {displayedUnreadCount > 99 ? '99+' : displayedUnreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      {isOpen && typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-50 w-[min(400px,calc(100vw-2rem))] sm:w-96 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
            style={{
              top: `${buttonPosition?.top || 0}px`,
              right: `${buttonPosition?.right || 0}px`,
              maxHeight: isMobile ? 'calc(100vh - 120px)' : '600px',
            }}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">Notifications</h3>
                {displayedUnreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-xs font-medium rounded-full">
                    {displayedUnreadCount} unread
                  </span>
                )}
              </div>
              {displayedUnreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="px-2.5 py-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Mark all as read
                </button>
              )}
            </div>

            {/* Notifications List - Phase 4: Restore grouping with audit logging */}
            <div className="max-h-96 overflow-y-auto p-2 sm:p-3">
              {notifications.length > 0 ? (
                (() => {
                  const groupedNotifications = groupNotificationsByRecency(notifications)
                  const groupOrder = ['Today', 'Yesterday', 'Earlier This Week', 'Older']
                  
                  return groupOrder.map(groupName => {
                    const groupNotifications = groupedNotifications[groupName]
                    if (groupNotifications.length === 0) return null
                    
                    return (
                      <div key={groupName} className="mb-5 last:mb-0">
                        <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          {groupName}
                        </div>
                        <div className="divide-y divide-slate-700/30">
                          {groupNotifications.map((notification, index) => {
                            const displayName = getDisplayName(notification)
                            const displayMessage = getDisplayMessage(notification)
                            const isLast = index === groupNotifications.length - 1

                            return (
                              <div
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification)}
                                className={`flex items-start gap-3 py-3 px-4 hover:bg-slate-800/20 transition-colors duration-150 cursor-pointer ${isLast ? '' : 'border-b border-slate-700/30'}`}
                              >
                                {/* Icon */}
                                <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${getNotificationColor(notification.type)} flex items-center justify-center`}>
                                  {getNotificationIcon(notification.type)}
                                </div>
                                
                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  {/* Title */}
                                  <p className="text-sm font-semibold text-slate-100 mb-0.5">
                                    {notification.title || 'Notification'}
                                  </p>
                                  
                                  {/* Customer name or phone number (masked for SMS failures) */}
                                  {displayName && (
                                    <p className="text-xs sm:text-sm font-medium text-slate-300 mb-1">
                                      {displayName}
                                    </p>
                                  )}
                                  
                                  {/* Message preview - canonical title for AI intake */}
                                  <p className="text-xs sm:text-sm text-slate-400 truncate">
                                    {displayMessage}
                                  </p>
                                  
                                  {/* Time */}
                                  <p className="text-[10px] sm:text-xs text-slate-500 mt-1.5">
                                    {formatNotificationTime(notification.created_at)}
                                  </p>
                                </div>
                                
                                {/* Unread indicator dot */}
                                {!notification.read && (
                                  <div className="flex-shrink-0 mt-1.5">
                                    <div className={`w-2.5 h-2.5 rounded-full ${getNotificationDotColor(notification.type)}`}></div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                })()
              ) : loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-600"></div>
                </div>
              ) : error ? (
                <div className="text-center py-12 px-4">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1">Failed to load notifications</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Please try again</p>
                  <button
                    onClick={refreshNotifications}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 px-4">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bell className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1">You're all caught up</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Notifications will appear here as your business becomes active.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-700">
                <Link
                  href="/dashboard/notifications"
                  onClick={() => setIsOpen(false)}
                  className="block w-full text-center text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View all notifications
                </Link>
              </div>
            )}
          </div>,
          document.body
        )
      }
    </>
  )
}