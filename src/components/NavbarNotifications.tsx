'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { notificationService, Notification, NotificationCount } from '@/lib/notifications'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Phone } from 'lucide-react'
import { Bell, Check, CheckCircle, AlertTriangle, User, MessageSquare, Clock, Settings, CreditCard, Trash2, X } from 'lucide-react'

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

    // Subscribe to realtime notification updates
    const channel = supabase
      .channel('notifications-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `business_id=eq.${business.id}`
        },
        async () => {
          // Refresh notifications when changes occur
          await fetchNotifications()
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

  const handleDeleteNotification = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
    // Optimistically remove from UI
    const deletedNotification = notifications.find(n => n.id === notificationId)
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
    setNotificationCount(prev => ({
      unread: deletedNotification && !deletedNotification.read ? Math.max(0, prev.unread - 1) : prev.unread,
      total: Math.max(0, prev.total - 1)
    }))

    try {
      await notificationService.deleteNotification(notificationId)
    } catch (error) {
      console.error('[NOTIFICATION DELETE] Failed to delete notification:', error)
      // Restore notification if delete failed
      if (deletedNotification) {
        setNotifications(prev => [...prev, deletedNotification])
        setNotificationCount(prev => ({
          unread: deletedNotification && !deletedNotification.read ? prev.unread + 1 : prev.unread,
          total: prev.total + 1
        }))
      }
    }
  }

  const handleClearAll = async (e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!business || notifications.length === 0) return

    // Optimistically clear all from UI
    const previousNotifications = [...notifications]
    setNotifications([])
    setNotificationCount({ unread: 0, total: 0 })

    try {
      await notificationService.clearAllNotifications(business.id)
    } catch (error) {
      console.error('[NOTIFICATION CLEAR ALL] Failed to clear notifications:', error)
      // Restore notifications if clear failed
      setNotifications(previousNotifications)
      setNotificationCount({
        unread: previousNotifications.filter(n => !n.read).length,
        total: previousNotifications.length
      })
    }
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
    if (read) return 'bg-white dark:bg-card'
    
    switch (type) {
      case 'new_lead':
        return 'bg-blue-50/50 dark:bg-blue-900/10'
      case 'customer_reply':
        return 'bg-green-50/50 dark:bg-green-900/10'
      case 'followup_completed':
        return 'bg-purple-50/50 dark:bg-purple-900/10'
      case 'forwarding_disconnected':
      case 'sms_failed':
        return 'bg-red-50/50 dark:bg-red-900/10'
      case 'trial_ending':
      case 'subscription_issue':
        return 'bg-amber-50/50 dark:bg-amber-900/10'
      case 'voicemail_received':
        return 'bg-blue-50/50 dark:bg-blue-900/10'
      default:
        return 'bg-white dark:bg-card'
    }
  }

  const getNotificationAccent = (type: Notification['type']) => {
    switch (type) {
      case 'new_lead':
        return 'border-l-4 border-l-blue-500'
      case 'customer_reply':
        return 'border-l-4 border-l-green-500'
      case 'followup_completed':
        return 'border-l-4 border-l-purple-500'
      case 'forwarding_disconnected':
      case 'sms_failed':
        return 'border-l-4 border-l-red-500'
      case 'trial_ending':
      case 'subscription_issue':
        return 'border-l-4 border-l-amber-500'
      case 'voicemail_received':
        return 'border-l-4 border-l-blue-500'
      default:
        return 'border-l-4 border-l-slate-300 dark:border-l-slate-600'
    }
  }

  const getLeadContext = (notification: Notification) => {
    if (notification.data?.leadName) return notification.data.leadName
    if (notification.data?.leadPhone) return notification.data.leadPhone
    return null
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
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-xs font-medium rounded-full flex items-center justify-center animate-pulse">
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
            
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  title="Clear all notifications"
                >
                  Clear all
                </button>
              )}
              {notificationCount.unread > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Mark all as read
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-600"></div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 px-4">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-foreground mb-1">You're all caught up</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">New leads and customer replies will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`group relative p-3 ${getNotificationColor(notification.type, notification.read)} ${getNotificationAccent(notification.type)} hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer`}
                    onClick={() => notification.action_url && router.push(notification.action_url)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Title with timestamp */}
                        <div className="flex items-start justify-between mb-1">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-foreground">
                            {notification.title}
                          </h4>
                          <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 ml-2">
                            {formatTime(notification.created_at)}
                          </span>
                        </div>
                        
                        {/* Lead context */}
                        {getLeadContext(notification) && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                            Lead: {getLeadContext(notification)}
                          </p>
                        )}
                        
                        {/* Message */}
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                    </div>
                    
                    {/* Hover actions */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!notification.read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMarkAsRead(notification.id)
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          title="Mark as read"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDeleteNotification(notification.id, e)}
                        className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        title="Delete notification"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <Link
                href="/dashboard/notifications"
                onClick={() => setIsOpen(false)}
                className="block text-center text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground transition-colors"
              >
                View all notifications →
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
