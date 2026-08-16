'use client'

import { useState, useEffect, useRef } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { notificationService, Notification, NotificationCount } from '@/lib/notifications'
import { Bell, Check, CheckCircle, AlertTriangle, User, MessageSquare, Clock, Settings, CreditCard, ExternalLink, PhoneMissed, Trash2, X } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import Navigation from '@/components/Navigation'
import AppBackButton from '@/components/AppBackButton'

export default function NotificationsPage() {
  const { business } = useBusiness()
  const { notifications: contextNotifications, notificationCount: contextCount, displayedUnreadCount, loading: contextLoading, error: contextError, refreshNotifications, markAsRead: contextMarkAsRead, markAllAsRead: contextMarkAllAsRead, deleteNotification: contextDeleteNotification, initializeForBusiness } = useNotifications()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationCount, setNotificationCount] = useState<NotificationCount>({ total: 0, unread: 0 })
  const [loading, setLoading] = useState(true)
  
  // Track press state per notification to prevent visual feedback during scroll
  const [pressedNotificationId, setPressedNotificationId] = useState<string | null>(null)
  
  // Track pointer movement to distinguish taps from scrolls
  const pointerStateRef = useRef<{
    x: number
    y: number
    pointerId: number
    isTap: boolean
  } | null>(null)
  const MOVE_THRESHOLD = 10 // pixels (increased for better scroll detection)

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
    // Use context's markAsRead which has optimistic updates
    await contextMarkAsRead(notificationId)
    // Update local state to match
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    )
  }

  const handleMarkAllAsRead = async () => {
    // Use context's markAllAsRead which has optimistic updates for bell badge
    await contextMarkAllAsRead()
    // Update local state to match
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setNotificationCount(prev => ({
      unread: 0,
      total: prev.total
    }))
  }

  const handleDeleteNotification = async (notificationId: string) => {
    // Use context's deleteNotification which has optimistic updates
    await contextDeleteNotification(notificationId)
    // Update local state to match
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
  }

  const handleClearAll = async () => {
    if (!business?.id || notifications.length === 0) return

    // Optimistically clear all from local UI
    const previousNotifications = [...notifications]
    setNotifications([])
    setNotificationCount({ unread: 0, total: 0 })

    try {
      await notificationService.clearAllNotifications(business.id)
      // Refresh context to update bell badge
      refreshNotifications()
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
        return <User className="w-5 h-5 text-blue-500" />
      case 'customer_reply':
        return <MessageSquare className="w-5 h-5 text-green-500" />
      case 'followup_completed':
        return <CheckCircle className="w-5 h-5 text-purple-500" />
      case 'forwarding_disconnected':
        return <AlertTriangle className="w-5 h-5 text-red-500" />
      case 'sms_failed':
        return <AlertTriangle className="w-5 h-5 text-red-500" />
      case 'trial_ending':
        return <Clock className="w-5 h-5 text-amber-500" />
      case 'subscription_issue':
        return <CreditCard className="w-5 h-5 text-amber-500" />
      case 'voicemail_received':
        return <PhoneMissed className="w-5 h-5 text-blue-500" />
      default:
        return <Bell className="w-5 h-5 text-slate-400" />
    }
  }

  const getNotificationColor = (type: Notification['type']) => {
    switch (type) {
      case 'new_lead':
        return 'bg-blue-500/10 text-blue-500'
      case 'customer_reply':
        return 'bg-green-500/10 text-green-500'
      case 'followup_completed':
        return 'bg-purple-500/10 text-purple-500'
      case 'forwarding_disconnected':
      case 'sms_failed':
        return 'bg-red-500/10 text-red-500'
      case 'trial_ending':
      case 'subscription_issue':
        return 'bg-amber-500/10 text-amber-500'
      case 'voicemail_received':
        return 'bg-blue-500/10 text-blue-500'
      default:
        return 'bg-slate-500/10 text-slate-400'
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

  // Check if pointer moved beyond threshold (distinguishes tap from scroll)
  const isTapGesture = (clientX: number, clientY: number): boolean => {
    if (!pointerStateRef.current) return false
    const dx = Math.abs(clientX - pointerStateRef.current.x)
    const dy = Math.abs(clientY - pointerStateRef.current.y)
    return dx <= MOVE_THRESHOLD && dy <= MOVE_THRESHOLD
  }

  // Handle pointer down to track start position and show press state
  const handlePointerDown = (e: React.PointerEvent, notificationId: string) => {
    pointerStateRef.current = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      isTap: true
    }
    setPressedNotificationId(notificationId)
  }

  // Handle pointer move to detect scrolling and cancel press state
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerStateRef.current) return
    if (pointerStateRef.current.pointerId !== e.pointerId) return
    
    const dx = Math.abs(e.clientX - pointerStateRef.current.x)
    const dy = Math.abs(e.clientY - pointerStateRef.current.y)
    
    // Cancel press state immediately on vertical movement (scroll)
    if (dy > MOVE_THRESHOLD) {
      pointerStateRef.current.isTap = false
      setPressedNotificationId(null)
    }
    // Also cancel on significant horizontal movement
    else if (dx > MOVE_THRESHOLD) {
      pointerStateRef.current.isTap = false
      setPressedNotificationId(null)
    }
  }

  // Handle pointer up to check if it was a tap
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStateRef.current) return
    if (pointerStateRef.current.pointerId !== e.pointerId) return
    
    const dx = Math.abs(e.clientX - pointerStateRef.current.x)
    const dy = Math.abs(e.clientY - pointerStateRef.current.y)
    
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      pointerStateRef.current.isTap = false
    }
    
    // Clear press state after a short delay to allow click processing
    setTimeout(() => setPressedNotificationId(null), 50)
  }

  // Handle pointer cancel to treat as scroll
  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!pointerStateRef.current) return
    if (pointerStateRef.current.pointerId !== e.pointerId) return
    
    pointerStateRef.current.isTap = false
    setPressedNotificationId(null)
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
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <AppBackButton fallbackHref="/dashboard" label="Back" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Stay updated on your ReplyFlow activity.
              </p>
            </div>
          </div>

          {/* Actions - secondary utility */}
          {notifications.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              {notificationCount.unread > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                >
                  Mark all as read
                </button>
              )}
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors shrink-0"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Notifications List */}
        <div
          className="space-y-3 pb-[env(safe-area-inset-bottom)]"
          onPointerMove={handlePointerMove}
        >
          {notifications.length > 0 ? (
            notifications.map(notification => (
              <div
                key={notification.id}
                role="button"
                tabIndex={0}
                onPointerDown={(e) => handlePointerDown(e, notification.id)}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (!notification.read) {
                      handleMarkAsRead(notification.id)
                    }
                  }
                }}
                onClick={(e) => {
                  // Only handle click if it was a tap gesture (not a scroll)
                  if (pointerStateRef.current?.isTap) {
                    if (!notification.read) {
                      handleMarkAsRead(notification.id)
                    }
                  }
                  // Clear the ref after processing
                  pointerStateRef.current = null
                }}
                className={`group relative bg-card border border-border rounded-xl p-4 transition-all duration-200 hover:shadow-md focus:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 select-none touch-pan-y cursor-pointer ${
                  notification.read
                    ? 'hover:bg-muted/30'
                    : 'bg-blue-500/5 hover:bg-blue-500/10'
                } ${pressedNotificationId === notification.id ? 'bg-muted/50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${getNotificationColor(notification.type)} flex items-center justify-center ring-1 ring-white/5 group-hover:ring-white/10 transition-all`}>
                    {getNotificationIcon(notification.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    {/* Title with timestamp */}
                    <div className="flex items-start justify-between mb-1">
                      <h3 className={`font-semibold text-foreground leading-tight tracking-tight ${notification.read ? 'text-muted-foreground' : ''}`}>
                        {notification.title || 'Notification'}
                      </h3>
                      <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                        {formatTime(notification.created_at)}
                      </span>
                    </div>

                    {/* Customer context */}
                    {getLeadContext(notification) && (
                      <p className="text-sm text-muted-foreground mb-1">
                        Customer: {getLeadContext(notification)}
                      </p>
                    )}

                    {/* Message */}
                    <p className="text-sm text-muted-foreground">
                      {notification.message}
                    </p>
                  </div>
                </div>

                {/* Hover actions */}
                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!notification.read && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMarkAsRead(notification.id)
                      }}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors bg-card rounded shadow-sm"
                      title="Mark as read"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteNotification(notification.id)
                    }}
                    className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors bg-card rounded shadow-sm"
                    title="Delete notification"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-border">
                <Bell className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">You're all caught up</h3>
              <p className="text-sm text-muted-foreground">
                New ReplyFlow activity will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
