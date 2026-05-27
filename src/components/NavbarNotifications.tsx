'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { notificationService, Notification, NotificationCount } from '@/lib/notifications'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Phone } from 'lucide-react'
import { Bell, Check, CheckCircle, AlertTriangle, User, MessageSquare, Clock, Settings, CreditCard } from 'lucide-react'

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

export default function NavbarNotifications() {
  const { business } = useBusiness()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationCount, setNotificationCount] = useState<NotificationCount>({ unread: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [buttonPosition, setButtonPosition] = useState<{ top: number; right: number } | null>(null)
  const isMobile = useIsMobile()
  const supabase = createBrowserClient()

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

  // Fetch notifications when business is available
  useEffect(() => {
    if (!business) return

    const fetchNotifications = async () => {
      try {
        setLoading(true)
        const [notificationsData, countData] = await Promise.all([
          notificationService.getNotifications(business.id, 10),
          notificationService.getNotificationCount(business.id)
        ])
        
        setNotifications(notificationsData)
        setNotificationCount(countData)
      } catch (error) {
        console.error('Error fetching notifications:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchNotifications()
  }, [business])

  // Refresh notifications periodically
  useEffect(() => {
    if (!business) return

    const interval = setInterval(() => {
      notificationService.getNotificationCount(business.id).then(setNotificationCount)
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [business])

  // Subscribe to real-time notification updates
  useEffect(() => {
    if (!business) return

    const channel = supabase
      .channel(`notifications:${business.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `business_id=eq.${business.id}`
        },
        async (payload: any) => {
          console.log('[NOTIFICATIONS] Real-time update received:', payload)
          
          // Refresh notifications and count
          const [notificationsData, countData] = await Promise.all([
            notificationService.getNotifications(business.id, 10),
            notificationService.getNotificationCount(business.id)
          ])
          
          setNotifications(notificationsData)
          setNotificationCount(countData)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [business])

  const handleMarkAsRead = async (notificationId: string) => {
    await notificationService.markAsRead(notificationId)
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    )
    setNotificationCount(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }))
  }

  const handleMarkAllAsRead = async () => {
    if (!business) return
    
    await notificationService.markAllAsRead(business.id)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setNotificationCount({ unread: 0, total: notifications.length })
  }

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'new_lead':
        return <User className="w-4 h-4 text-blue-600" />
      case 'customer_reply':
        return <MessageSquare className="w-4 h-4 text-green-600" />
      case 'followup_completed':
        return <CheckCircle className="w-4 h-4 text-purple-600" />
      case 'forwarding_disconnected':
      case 'sms_failed':
        return <AlertTriangle className="w-4 h-4 text-red-600" />
      case 'trial_ending':
      case 'subscription_issue':
        return <CreditCard className="w-4 h-4 text-amber-600" />
      case 'voicemail_received':
        return <Phone className="w-4 h-4 text-blue-600" />
      default:
        return <Bell className="w-4 h-4 text-gray-600" />
    }
  }

  const getNotificationColor = (type: Notification['type'], read: boolean) => {
    if (read) return 'bg-gray-50 dark:bg-gray-800/50'
    
    switch (type) {
      case 'new_lead':
        return 'bg-blue-50 dark:bg-blue-900/20'
      case 'customer_reply':
        return 'bg-green-50 dark:bg-green-900/20'
      case 'followup_completed':
        return 'bg-purple-50 dark:bg-purple-900/20'
      case 'forwarding_disconnected':
      case 'sms_failed':
        return 'bg-red-50 dark:bg-red-900/20'
      case 'trial_ending':
      case 'subscription_issue':
        return 'bg-amber-50 dark:bg-amber-900/20'
      case 'voicemail_received':
        return 'bg-blue-50 dark:bg-blue-900/20'
      default:
        return 'bg-gray-50 dark:bg-gray-800/50'
    }
  }

  const formatTime = (timestamp: string) => {
    const now = new Date()
    const notificationTime = new Date(timestamp)
    const diffInMinutes = Math.floor((now.getTime() - notificationTime.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return `${Math.floor(diffInMinutes / 1440)}d ago`
  }

  return (
    <div className="relative">
      {/* UPDATED HEADER COMPONENT - Notification Bell */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        
        {/* Unread count badge */}
        {notificationCount.unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-xs font-medium rounded-full flex items-center justify-center">
            {notificationCount.unread > 99 ? '99+' : notificationCount.unread}
          </span>
        )}
      </button>

      {/* Dropdown - Rendered via Portal to document.body */}
      {isOpen && buttonPosition && createPortal(
        <>
          {/* Mobile backdrop */}
          {isMobile && (
            <div 
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in duration-200"
              onClick={() => setIsOpen(false)}
            />
          )}
          <div 
            ref={dropdownRef}
            className={`${
            isMobile 
              ? 'fixed left-4 right-4 top-16 max-w-sm mx-auto bg-card dark:bg-slate-900 border border-border rounded-lg shadow-2xl z-[1000] max-h-[calc(100vh-120px)] overflow-hidden animate-in slide-in-from-top-2 duration-200'
              : 'fixed bg-card dark:bg-slate-900 border border-border rounded-lg shadow-xl z-[1000] animate-in fade-in slide-in-from-top-2 duration-200'
          }`}
          style={!isMobile ? { top: `${buttonPosition.top + 4}px`, right: `${buttonPosition.right}px`, width: '280px' } : undefined}
          >
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="font-semibold text-foreground">Notifications</h3>
            
            {notificationCount.unread > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-3">
                <Bell className="w-6 h-6 text-muted-foreground/50 mx-auto mb-1.5" />
                <p className="text-xs font-medium text-muted-foreground mb-0.5">No new notifications</p>
                <p className="text-[10px] text-muted-foreground/70">New leads and replies will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-2.5 sm:p-3 ${getNotificationColor(notification.type, notification.read)} hover:bg-muted/50 transition-colors cursor-pointer`}
                    onClick={() => notification.action_url && router.push(notification.action_url)}
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      {/* Icon */}
                      <div className="mt-0.5 flex-shrink-0">
                        {getNotificationIcon(notification.type)}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <h4 className="text-xs sm:text-sm font-medium text-foreground truncate">
                            {notification.title}
                          </h4>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                              {formatTime(notification.created_at)}
                            </span>
                            {!notification.read && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleMarkAsRead(notification.id)
                                }}
                                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                title="Mark as read"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        <p className="text-[10px] sm:text-xs text-muted-foreground mb-1 line-clamp-2">
                          {notification.message}
                        </p>
                        
                        {/* Action Button */}
                        {notification.action_url && notification.action_text && (
                          <Link
                            href={notification.action_url}
                            onClick={(e) => {
                              e.stopPropagation()
                              setIsOpen(false)
                              handleMarkAsRead(notification.id)
                            }}
                            className="inline-flex items-center gap-1 text-[10px] sm:text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            {notification.action_text}
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-border">
              <Link
                href="/dashboard/notifications"
                onClick={() => setIsOpen(false)}
                className="block text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>
        </>,
        document.body
      )}
    </div>
  )
}
