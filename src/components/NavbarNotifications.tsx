'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { notificationService, Notification, NotificationCount } from '@/lib/notifications'
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
  const isMobile = useIsMobile()

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
    <div className="relative" ref={dropdownRef}>
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors md:h-9 md:w-9 h-10 w-10 md:h-auto md:w-auto"
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

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          {isMobile && (
            <div 
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
              onClick={() => setIsOpen(false)}
            />
          )}
          <div className={`${
            isMobile 
              ? 'fixed left-4 right-4 top-16 max-w-sm mx-auto bg-card dark:bg-slate-900 border border-border rounded-lg shadow-xl z-50 max-h-[calc(100vh-120px)] overflow-hidden'
              : 'absolute right-0 mt-2 w-80 bg-card dark:bg-slate-900 border border-border rounded-lg shadow-lg z-50'
          }`}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
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
              <div className="text-center py-8">
                <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No notifications</p>
                <p className="text-xs text-muted-foreground mt-1">
                  We'll notify you when something important happens
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 ${getNotificationColor(notification.type, notification.read)} hover:bg-muted/50 transition-colors`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="mt-1">
                        {getNotificationIcon(notification.type)}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-sm font-medium text-foreground truncate">
                            {notification.title}
                          </h4>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatTime(notification.created_at)}
                            </span>
                            {!notification.read && (
                              <button
                                onClick={() => handleMarkAsRead(notification.id)}
                                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                title="Mark as read"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-2">
                          {notification.message}
                        </p>
                        
                        {/* Action Button */}
                        {notification.action_url && notification.action_text && (
                          <Link
                            href={notification.action_url}
                            onClick={() => {
                              setIsOpen(false)
                              handleMarkAsRead(notification.id)
                            }}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
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
            <div className="p-4 border-t border-border">
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
        </>
      )}
    </div>
  )
}
