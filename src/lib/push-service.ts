/**
 * Native Push Notification Service
 * 
 * This service provides a client-side abstraction for native push notifications
 * using Capacitor's Push Notifications plugin. It handles:
 * - Permission requests
 * - Device token registration
 * - Notification receipt
 * - Notification tap handling
 * 
 * All native functionality is gated behind Capacitor.isNativePlatform() to ensure
 * web/PWA behavior remains unchanged.
 */

import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

export interface PushNotificationData {
  notificationId?: string
  type?: string
  actionUrl?: string
  leadId?: string
  [key: string]: any
}

export interface PushNotification {
  id?: string
  title?: string
  body?: string
  data?: PushNotificationData
}

class PushService {
  private isInitialized = false
  private currentToken: string | null = null
  private currentPlatform: 'android' | 'ios' | null = null

  /**
   * Initialize the push notification service
   * This should be called once during app initialization
   */
  async initialize(): Promise<void> {
    console.log('[PUSH SERVICE] initialize() called')
    console.log('[PUSH SERVICE] Capacitor.isNativePlatform():', Capacitor.isNativePlatform())
    console.log('[PUSH SERVICE] Capacitor.getPlatform():', Capacitor.getPlatform())
    
    // Only initialize on native platforms
    if (!Capacitor.isNativePlatform()) {
      console.log('[PUSH SERVICE] Web platform detected, skipping native push initialization')
      return
    }

    if (this.isInitialized) {
      console.log('[PUSH SERVICE] Already initialized, skipping')
      return
    }

    try {
      console.log('[PUSH SERVICE] Starting native push notification initialization')

      // Determine platform
      this.currentPlatform = Capacitor.getPlatform() === 'android' ? 'android' : 'ios'
      console.log('[PUSH SERVICE] Platform determined:', this.currentPlatform)

      // Set up listeners FIRST (before registration to catch the token event)
      console.log('[PUSH SERVICE] Setting up listeners')
      this.setupListeners()
      console.log('[PUSH SERVICE] Listeners set up')

      // Request permission
      console.log('[PUSH SERVICE] Requesting permission')
      await this.requestPermission()
      console.log('[PUSH SERVICE] Permission request completed')

      // Register for push notifications
      console.log('[PUSH SERVICE] Registering for push notifications')
      await this.register()
      console.log('[PUSH SERVICE] Registration completed')

      this.isInitialized = true
      console.log('[PUSH SERVICE] Initialization complete')
    } catch (error) {
      console.error('[PUSH SERVICE] Initialization failed:', error)
    }
  }

  /**
   * Request push notification permission from the user
   */
  async requestPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      console.log('[PUSH SERVICE] Web platform, permission request skipped')
      return false
    }

    try {
      console.log('[PUSH SERVICE] Checking current permission state')
      const currentPermissions = await PushNotifications.checkPermissions()
      console.log('[PUSH SERVICE] Current permission state:', currentPermissions)

      console.log('[PUSH SERVICE] Requesting push permission')
      const result = await PushNotifications.requestPermissions()
      console.log('[PUSH SERVICE] Permission request result:', result)
      
      if (result.receive === 'granted') {
        console.log('[PUSH SERVICE] Permission granted')
        return true
      } else {
        console.log('[PUSH SERVICE] Permission denied or not granted, state:', result.receive)
        return false
      }
    } catch (error) {
      console.error('[PUSH SERVICE] Permission request failed:', error)
      return false
    }
  }

  /**
   * Register for push notifications and receive token
   */
  async register(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      console.log('[PUSH SERVICE] Web platform, registration skipped')
      return
    }

    try {
      console.log('[PUSH SERVICE] Registering for push notifications')
      await PushNotifications.register()
      console.log('[PUSH SERVICE] Registration successful')
    } catch (error) {
      console.error('[PUSH SERVICE] Registration failed:', error)
    }
  }

  /**
   * Set up push notification event listeners
   */
  private setupListeners(): void {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    // Listen for token registration
    PushNotifications.addListener('registration', (token) => {
      console.log('[PUSH SERVICE] Push registration success, token:', token.value)
      this.currentToken = token.value
      this.registerDeviceWithServer(token.value)
    })

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('[PUSH SERVICE] Push registration error:', error.error)
    })

    // Listen for incoming push notifications (app in foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[PUSH SERVICE] Push notification received:', notification)
      this.handleNotificationReceived(notification)
    })

    // Listen for push notification tap (app in background or terminated)
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('[PUSH SERVICE] Push notification action performed:', notification)
      this.handleNotificationActionPerformed(notification)
    })

    // Handle app state changes to manage token refresh
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && this.isInitialized) {
        console.log('[PUSH SERVICE] App became active, refreshing token')
        this.register()
      }
    })
  }

  /**
   * Register the device token with the server
   */
  private async registerDeviceWithServer(token: string): Promise<void> {
    if (!this.currentPlatform) {
      console.error('[PUSH SERVICE] Cannot register device: platform not determined')
      return
    }

    try {
      console.log('[PUSH SERVICE] Registering device with server', {
        platform: this.currentPlatform,
        token: token.substring(0, 20) + '...'
      })

      const response = await fetch('/api/push/register-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pushToken: token,
          platform: this.currentPlatform,
          deviceIdentifier: this.getDeviceIdentifier()
        })
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('[PUSH SERVICE] Device registration failed:', error)
        // If unauthorized, the user is not authenticated - we'll retry when they sign in
        if (response.status === 401) {
          console.log('[PUSH SERVICE] User not authenticated, will retry on sign-in')
          this.currentToken = token // Store token for retry
        }
      } else {
        console.log('[PUSH SERVICE] Device registered successfully')
      }
    } catch (error) {
      console.error('[PUSH SERVICE] Device registration error:', error)
    }
  }

  /**
   * Retry device registration after authentication
   * This should be called when the user signs in
   */
  async retryRegistration(): Promise<void> {
    if (!this.currentToken || !this.currentPlatform) {
      console.log('[PUSH SERVICE] No token available for retry')
      return
    }

    console.log('[PUSH SERVICE] Retrying device registration after authentication')
    await this.registerDeviceWithServer(this.currentToken)
  }

  /**
   * Unregister the device from the server (called on sign-out)
   */
  async unregisterDevice(): Promise<void> {
    if (!Capacitor.isNativePlatform() || !this.currentToken || !this.currentPlatform) {
      console.log('[PUSH SERVICE] Web platform or no token, unregister skipped')
      return
    }

    try {
      console.log('[PUSH SERVICE] Unregistering device from server')

      const response = await fetch('/api/push/unregister-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pushToken: this.currentToken,
          platform: this.currentPlatform
        })
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('[PUSH SERVICE] Device unregistration failed:', error)
      } else {
        console.log('[PUSH SERVICE] Device unregistered successfully')
        this.currentToken = null
      }
    } catch (error) {
      console.error('[PUSH SERVICE] Device unregistration error:', error)
    }
  }

  /**
   * Handle incoming push notification (app in foreground)
   */
  private handleNotificationReceived(notification: PushNotification): void {
    // For now, just log. In the future, this could:
    // - Update in-app notification bell
    // - Show an in-app toast/banner
    // - Update unread count
    console.log('[PUSH SERVICE] Notification received in foreground:', {
      title: notification.title,
      body: notification.body,
      data: notification.data
    })
  }

  /**
   * Handle push notification tap (app in background or terminated)
   */
  private handleNotificationActionPerformed(notification: any): void {
    const actionId = notification.actionId
    const data = notification.notification.data as PushNotificationData

    console.log('[PUSH SERVICE] Notification tapped:', {
      actionId,
      data
    })

    // Navigate to the appropriate screen based on actionUrl
    if (data?.actionUrl) {
      console.log('[PUSH SERVICE] Navigating to:', data.actionUrl)
      window.location.href = data.actionUrl
    }
  }

  /**
   * Get a device identifier for debugging/deduplication
   * This is optional and used for debugging purposes
   */
  private getDeviceIdentifier(): string | null {
    // In the future, this could use Device plugin to get a unique device ID
    // For now, return null as it's optional
    return null
  }

  /**
   * Check if push notifications are supported
   */
  isSupported(): boolean {
    return Capacitor.isNativePlatform()
  }

  /**
   * Check if the service is initialized
   */
  isActive(): boolean {
    return this.isInitialized
  }

  /**
   * Get the current push token (if registered)
   */
  getToken(): string | null {
    return this.currentToken
  }
}

// Export singleton instance
export const pushService = new PushService()
