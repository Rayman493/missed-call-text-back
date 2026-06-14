'use client'

import { useState, useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { notificationService, Notification, NotificationCount } from '@/lib/notifications'
import { Bell, Check, CheckCircle, AlertTriangle, User, MessageSquare, Clock, Settings, CreditCard, ExternalLink, PhoneMissed, Trash2, X } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import Navigation from '@/components/Navigation'

export default function NotificationsPage() {
  const { business } = useBusiness()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationCount, setNotificationCount] = useState<NotificationCount>({ total: 0, unread: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business?.id) return

    const fetchNotifications = async () => {
      try {
        const fetchedNotifications = await notificationService.getNotifications(business.id)
        setNotifications(fetchedNotifications)
        const count = await notificationService.getNotificationCount(business.id)
        setNotificationCount(count)
      } catch (error) {
        console.error('Error fetching notifications:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchNotifications()
  }, [business?.id])

  const handleMarkAsRead = async (notificationId: string) => {
    // Optimistically update UI
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    )
    setNotificationCount(prev => ({
      unread: Math.max(0, prev.unread - 1),
      total: prev.total
    }))

    try {
      await notificationService.markAsRead(notificationId)
    } catch (error) {
      console.error('[NOTIFICATION MARK READ] Failed to mark as read:', error)
      // Revert on error
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: false } : n)
      )
      setNotificationCount(prev => ({
        unread: prev.unread + 1,
        total: prev.total
      }))
    }
  }

  const handleMarkAllAsRead = async () => {
    if (!business?.id) return

    // Optimistically update UI
    const unreadCount = notifications.filter(n => !n.read).length
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setNotificationCount(prev => ({
      unread: Math.max(0, prev.unread - unreadCount),
      total: prev.total
    }))

    try {
      // Mark each notification as read individually
      for (const notification of notifications.filter(n => !n.read)) {
        await notificationService.markAsRead(notification.id)
      }
    } catch (error) {
      console.error('[NOTIFICATION MARK ALL READ] Failed to mark all as read:', error)
      // Revert on error - refetch to get accurate state
      const fetchedNotifications = await notificationService.getNotifications(business.id)
      setNotifications(fetchedNotifications)
      const count = await notificationService.getNotificationCount(business.id)
      setNotificationCount(count)
    }
  }

  const handleDeleteNotification = async (notificationId: string) => {
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

  const handleClearAll = async () => {
    if (!business?.id || notifications.length === 0) return

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
        return <User className="w-5 h-5 text-blue-600" />
      case 'customer_reply':
        return <MessageSquare className="w-5 h-5 text-green-600" />
      case 'followup_completed':
        return <CheckCircle className="w-5 h-5 text-purple-600" />
      case 'forwarding_disconnected':
        return <AlertTriangle className="w-5 h-5 text-red-600" />
      case 'sms_failed':
        return <AlertTriangle className="w-5 h-5 text-red-600" />
      case 'trial_ending':
        return <Clock className="w-5 h-5 text-amber-600" />
      case 'subscription_issue':
        return <CreditCard className="w-5 h-5 text-amber-600" />
      case 'voicemail_received':
        return <PhoneMissed className="w-5 h-5 text-blue-600" />
      default:
        return <Bell className="w-5 h-5 text-slate-600" />
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader showNavigation={true} />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-8"></div>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="h-6 bg-gray-200 rounded w-1/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader showNavigation={true} />
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            Stay updated on your ReplyFlow activity.
          </p>
        </div>

        {/* Actions */}
        {notifications.length > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={handleClearAll}
              className="px-4 py-2 bg-white dark:bg-card border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Clear all
            </button>
            {notificationCount.unread > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-white transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>
        )}

        {/* Notifications List */}
        <div className="space-y-3">
          {notifications.length > 0 ? (
            notifications.map(notification => (
              <div
                key={notification.id}
                className={`group relative bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-lg p-4 transition-colors hover:shadow-sm ${getNotificationAccent(notification.type)} ${
                  notification.read 
                    ? '' 
                    : 'bg-slate-50/50 dark:bg-slate-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="shrink-0">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Title with timestamp */}
                    <div className="flex items-start justify-between mb-2 pr-16">
                      <h3 className={`font-semibold text-slate-900 dark:text-foreground ${notification.read ? 'text-slate-600 dark:text-slate-400' : ''}`}>
                        {notification.title}
                      </h3>
                      <span className="text-sm text-slate-500 dark:text-slate-400 flex-shrink-0 ml-2">
                        {formatTime(notification.created_at)}
                      </span>
                    </div>
                    
                    {/* Lead context */}
                    {getLeadContext(notification) && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                        Lead: {getLeadContext(notification)}
                      </p>
                    )}
                    
                    {/* Message */}
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {notification.message}
                    </p>
                  </div>
                </div>
                
                {/* Hover actions */}
                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!notification.read && (
                    <button
                      onClick={() => handleMarkAsRead(notification.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors bg-white dark:bg-card rounded shadow-sm"
                      title="Mark as read"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteNotification(notification.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors bg-white dark:bg-card rounded shadow-sm"
                    title="Delete notification"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Bell className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground mb-2">You're all caught up</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                New leads and customer replies will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
