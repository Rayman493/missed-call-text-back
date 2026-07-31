'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { Notification } from '@/lib/notifications'
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
    markAsRead,
    markAllAsRead,
    deleteNotification,
    initializeForBusiness,
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
        top: rect.bottom,
        right: window.innerWidth - rect.right
      })
    } else {
      setButtonPosition(null)
    }
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
      case 'sms':
        return <MessageCircle className="w-4 h-4" />
      case 'call':
        return <PhoneMissed className="w-4 h-4" />
      case 'payment':
        return <CreditCard className="w-4 h-4" />
      case 'appointment':
        return <Calendar className="w-4 h-4" />
      case 'info':
        return <Info className="w-4 h-4" />
      case 'success':
        return <CheckCircle className="w-4 h-4" />
      case 'warning':
        return <AlertTriangle className="w-4 h-4" />
      case 'user':
        return <User className="w-4 h-4" />
      default:
        return <Bell className="w-4 h-4" />
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'sms':
        return 'bg-blue-500/20 text-blue-400'
      case 'call':
        return 'bg-red-500/20 text-red-400'
      case 'payment':
        return 'bg-green-500/20 text-green-400'
      case 'appointment':
        return 'bg-purple-500/20 text-purple-400'
      case 'info':
        return 'bg-slate-500/20 text-slate-400'
      case 'success':
        return 'bg-emerald-500/20 text-emerald-400'
      case 'warning':
        return 'bg-amber-500/20 text-amber-400'
      case 'user':
        return 'bg-cyan-500/20 text-cyan-400'
      default:
        return 'bg-slate-500/20 text-slate-400'
    }
  }

  const getNotificationDotColor = (type: string) => {
    switch (type) {
      case 'sms':
        return 'bg-blue-400'
      case 'call':
        return 'bg-red-400'
      case 'payment':
        return 'bg-green-400'
      case 'appointment':
        return 'bg-purple-400'
      case 'info':
        return 'bg-slate-400'
      case 'success':
        return 'bg-emerald-400'
      case 'warning':
        return 'bg-amber-400'
      case 'user':
        return 'bg-cyan-400'
      default:
        return 'bg-slate-400'
    }
  }

  const formatNotificationTime = (timestamp: string) => {
    const date = new Date(timestamp)
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
  }

  const groupNotificationsByRecency = (notifications: Notification[]) => {
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
            className="fixed z-50 w-[calc(100vw-2rem)] sm:w-96 max-h-[80vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
            style={{
              top: isMobile ? 'auto' : `${buttonPosition?.top || 0}px`,
              bottom: isMobile ? '0' : 'auto',
              right: isMobile ? '1rem' : `${buttonPosition?.right || 0}px`,
              maxHeight: isMobile ? '80vh' : '600px'
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

            {/* Notifications List - Improved mobile spacing */}
            <div className="max-h-96 overflow-y-auto p-2 sm:p-3">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-600"></div>
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Bell className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1">Everything looks good. No new notifications.</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">New activity will appear here when available.</p>
                </div>
              ) : (
                <>
                  {(() => {
                    const groupedNotifications = groupNotificationsByRecency(notifications)
                    const groupOrder = ['Today', 'Yesterday', 'Earlier This Week', 'Older']
                    
                    return groupOrder.map(groupName => {
                      const groupNotifications = groupedNotifications[groupName]
                      if (groupNotifications.length === 0) return null
                      
                      return (
                        <div key={groupName} className="mb-4 last:mb-0">
                          <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            {groupName}
                          </div>
                          <div className="space-y-1">
                            {groupNotifications.map((notification) => {
                              const displayName = notification.data?.leadName || notification.data?.lead_phone || null
                              
                              return (
                                <div
                                  key={notification.id}
                                  onClick={() => handleNotificationClick(notification)}
                                  className="group relative flex items-start gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors cursor-pointer"
                                >
                                  {/* Icon */}
                                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${getNotificationColor(notification.type)} flex items-center justify-center`}>
                                    {getNotificationIcon(notification.type)}
                                  </div>
                                  
                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    {/* Title */}
                                    <p className="text-sm font-medium text-slate-200 mb-0.5">
                                      {notification.title}
                                    </p>
                                    
                                    {/* Customer name or phone number */}
                                    {displayName && (
                                      <p className="text-xs sm:text-sm font-medium text-slate-300 mb-1">
                                        {displayName}
                                      </p>
                                    )}
                                    
                                    {/* Message preview - single line truncated */}
                                    <p className="text-xs sm:text-sm text-slate-400 truncate">
                                      {notification.message}
                                    </p>
                                    
                                    {/* Time */}
                                    <p className="text-[10px] sm:text-xs text-slate-500 mt-1">
                                      {formatNotificationTime(notification.created_at)}
                                    </p>
                                  </div>
                                  
                                  {/* Unread indicator dot */}
                                  {!notification.read && (
                                    <div className="flex-shrink-0 mt-1">
                                      <div className={`w-2 h-2 rounded-full ${getNotificationDotColor(notification.type)}`}></div>
                                    </div>
                                  )}
                                  
                                  {/* Hover actions */}
                                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!notification.read && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleMarkAsRead(notification.id)
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
                                        title="Mark as read"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => handleDeleteNotification(notification.id, e)}
                                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-md transition-colors"
                                      title="Delete notification"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  })}
                </>
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