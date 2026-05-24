'use client'

import { useState, useEffect } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { notificationService, Notification, NotificationCount } from '@/lib/notifications'
import { Bell, Check, CheckCircle, AlertTriangle, User, MessageSquare, Clock, Settings, CreditCard, ExternalLink, PhoneMissed } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'

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
    await notificationService.markAsRead(notificationId)
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    )
  }

  const handleMarkAllAsRead = async () => {
    if (!business?.id) return
    // Mark each notification as read individually
    for (const notification of notifications.filter(n => !n.read)) {
      await notificationService.markAsRead(notification.id)
    }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'new_lead':
        return <User className="w-5 h-5 text-blue-600" />
      case 'customer_reply':
        return <MessageSquare className="w-5 h-5 text-purple-600" />
      case 'followup_completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'forwarding_disconnected':
        return <AlertTriangle className="w-5 h-5 text-red-600" />
      case 'sms_failed':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />
      case 'trial_ending':
        return <Clock className="w-5 h-5 text-indigo-600" />
      case 'subscription_issue':
        return <CreditCard className="w-5 h-5 text-amber-600" />
      default:
        return <Bell className="w-5 h-5 text-gray-600" />
    }
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
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader showNavigation={true} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Notifications</h1>
          <p className="text-muted-foreground mt-2">
            Stay updated on your ReplyFlow activity and important events.
          </p>
        </div>

        {/* Actions */}
        {notificationCount.unread > 0 && (
          <div className="mb-6">
            <button
              onClick={handleMarkAllAsRead}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Mark all as read
            </button>
          </div>
        )}

        {/* Notifications List */}
        <div className="space-y-4">
          {notifications.length > 0 ? (
            notifications.map(notification => (
              <div
                key={notification.id}
                className={`bg-card border rounded-lg p-4 transition-colors ${
                  notification.read 
                    ? 'border-border' 
                    : 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className={`font-medium ${notification.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {notification.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(notification.created_at).toLocaleString()}
                        </p>
                      </div>
                      {!notification.read && (
                        <button
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="ml-4 p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Mark as read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <Bell className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No notifications</h3>
              <p className="text-muted-foreground">
                We'll notify you when something important happens.
              </p>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  )
}
