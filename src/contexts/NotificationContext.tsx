'use client'

import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { notificationService, Notification, NotificationCount } from '@/lib/notifications'
import { createBrowserClient } from '@/lib/supabase/browser'

interface NotificationContextType {
  notifications: Notification[]
  notificationCount: NotificationCount
  displayedUnreadCount: number
  loading: boolean
  refreshNotifications: () => Promise<void>
  markAsRead: (notificationId: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  deleteNotification: (notificationId: string) => Promise<void>
  initializeForBusiness: (businessId: string) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}

interface NotificationProviderProps {
  children: React.ReactNode
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationCount, setNotificationCount] = useState<NotificationCount>({ unread: 0, total: 0 })
  const [displayedUnreadCount, setDisplayedUnreadCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserClient()
  const subscriptionRef = useRef<any>(null)
  const currentBusinessIdRef = useRef<string | null>(null)

  const fetchNotifications = async (businessId: string) => {
    try {
      setLoading(true)
      // Fetch notifications for the preview list (increased limit to ensure unread notifications are included)
      const notificationsData = await notificationService.getNotifications(businessId, 50)
      
      // Fetch the actual count from all notifications (no limit)
      const countData = await notificationService.getNotificationCount(businessId)
      
      setNotifications(notificationsData)
      setNotificationCount(countData)
      setDisplayedUnreadCount(countData.unread)
      
      // Consistency check: if count says unread > 0 but no notifications in preview, this is expected
      // (there may be more unread notifications beyond the first 50)
      if (countData.unread > 0 && notificationsData.length === 0) {
        console.log('[NotificationContext] Unread count > 0 but no notifications in preview (may be beyond first 50)', {
          unreadCount: countData.unread,
          totalCount: countData.total,
          previewCount: notificationsData.length
        })
      }
    } catch (error) {
      console.error('[NotificationContext] Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const setupRealtimeSubscription = (businessId: string) => {
    // Clean up existing subscription
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current)
      subscriptionRef.current = null
    }

    const channel = supabase
      .channel('notifications-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `business_id=eq.${businessId}`
        },
        async (payload: any) => {
          // Optimistically add new notification to state
          setNotifications(prev => [payload.new, ...prev].slice(0, 50))
          setNotificationCount(prev => ({ 
            unread: prev.unread + 1, 
            total: prev.total + 1 
          }))
          setDisplayedUnreadCount(prev => prev + 1)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `business_id=eq.${businessId}`
        },
        async (payload: any) => {
          // Update existing notification in state
          setNotifications(prev => 
            prev.map(n => n.id === payload.new.id ? payload.new : n)
          )
          if (payload.new.read && !payload.old.read) {
            setNotificationCount(prev => ({ 
              ...prev, 
              unread: Math.max(0, prev.unread - 1) 
            }))
            setDisplayedUnreadCount(prev => Math.max(0, prev - 1))
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `business_id=eq.${businessId}`
        },
        async (payload: any) => {
          // Remove deleted notification from state
          const deletedNotification = notifications.find(n => n.id === payload.old.id)
          setNotifications(prev => prev.filter(n => n.id !== payload.old.id))
          setNotificationCount(prev => ({
            unread: deletedNotification && !deletedNotification.read ? Math.max(0, prev.unread - 1) : prev.unread,
            total: Math.max(0, prev.total - 1)
          }))
          if (deletedNotification && !deletedNotification.read) {
            setDisplayedUnreadCount(prev => Math.max(0, prev - 1))
          }
        }
      )
      .subscribe()

    subscriptionRef.current = channel
  }

  // This will be called by the child component when business is available
  // We use a ref to track the current business ID
  const initializeForBusiness = (businessId: string) => {
    if (currentBusinessIdRef.current === businessId) {
      // Same business, don't reinitialize
      return
    }

    currentBusinessIdRef.current = businessId

    // Reset state for new business
    setNotifications([])
    setNotificationCount({ unread: 0, total: 0 })
    setDisplayedUnreadCount(0)
    setLoading(true)

    fetchNotifications(businessId)
    setupRealtimeSubscription(businessId)
  }

  // Expose a method for child components to initialize
  useEffect(() => {
    // This effect is a no-op - the actual initialization happens via
    // a method that will be called by NavbarNotifications when business is available
    return () => {
      // Clean up subscription on unmount
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current)
      }
    }
  }, [])

  const refreshNotifications = async () => {
    if (!currentBusinessIdRef.current) return
    await fetchNotifications(currentBusinessIdRef.current)
  }

  const markAsRead = async (notificationId: string) => {
    await notificationService.markAsRead(notificationId)
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    )
    setNotificationCount(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }))
    setDisplayedUnreadCount(prev => Math.max(0, prev - 1))
  }

  const markAllAsRead = async () => {
    if (!currentBusinessIdRef.current) return
    
    // Optimistically update UI before API call
    const previousNotifications = [...notifications]
    const previousCount = { ...notificationCount }
    const previousDisplayed = displayedUnreadCount
    
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setNotificationCount({ unread: 0, total: notifications.length })
    setDisplayedUnreadCount(0)

    try {
      await notificationService.markAllAsRead(currentBusinessIdRef.current)
    } catch (error) {
      console.error('[NOTIFICATION MARK ALL READ] Failed to mark all as read:', error)
      // Revert to previous state if API call failed
      setNotifications(previousNotifications)
      setNotificationCount(previousCount)
      setDisplayedUnreadCount(previousDisplayed)
    }
  }

  const deleteNotification = async (notificationId: string) => {
    // Optimistically remove from UI
    const deletedNotification = notifications.find(n => n.id === notificationId)
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
    setNotificationCount(prev => ({
      unread: deletedNotification && !deletedNotification.read ? Math.max(0, prev.unread - 1) : prev.unread,
      total: Math.max(0, prev.total - 1)
    }))
    if (deletedNotification && !deletedNotification.read) {
      setDisplayedUnreadCount(prev => Math.max(0, prev - 1))
    }

    try {
      await notificationService.deleteNotification(notificationId)
    } catch (error) {
      console.error('[NOTIFICATION DELETE] Failed to delete notification:', error)
      // Could revert here if needed
    }
  }

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        notificationCount,
        displayedUnreadCount,
        loading,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        initializeForBusiness,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}