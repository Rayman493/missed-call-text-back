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
  private isInitializing = false
  private listenersSetup = false
  private currentToken: string | null = null
  private currentPlatform: 'android' | 'ios' | null = null
  private accessToken: string | null = null
  private registrationStatus: 'none' | 'in-flight' | 'succeeded' | 'failed' = 'none'

  /**
   * Check if registration should be attempted
   */
  private shouldAttemptRegistration(): boolean {
    const hasFCMToken = !!this.currentToken
    const hasAccessToken = !!this.accessToken
    const hasPlatform = !!this.currentPlatform
    const canAttempt = this.registrationStatus === 'none' || this.registrationStatus === 'failed'

    console.log('[PUSH SERVICE] Registration check:', {
      hasFCMToken,
      hasAccessToken,
      hasPlatform,
      registrationStatus: this.registrationStatus,
      canAttempt
    })

    return hasFCMToken && hasAccessToken && hasPlatform && canAttempt
  }

  /**
   * Attempt registration if conditions are met
   */
  private maybeRegisterDevice(): void {
    if (this.shouldAttemptRegistration()) {
      console.log('[PUSH SERVICE] Conditions met, attempting registration')
      this.registerDeviceWithServer(this.currentToken!)
    } else {
      console.log('[PUSH SERVICE] Conditions not met for registration')
    }
  }

  /**
   * Set the authenticated access token from AuthContext
   * This should be called when the user signs in
   */
  setAccessToken(token: string): void {
    console.log('[PUSH SERVICE] setAccessToken called, token present:', token ? 'yes' : 'no')
    console.log('[PUSH SERVICE] FCM token cached:', this.currentToken ? 'yes' : 'no')
    console.log('[PUSH SERVICE] Current registration status:', this.registrationStatus)
    
    this.accessToken = token
    
    // Attempt registration if conditions are met
    this.maybeRegisterDevice()
  }

  /**
   * Initialize the push notification service
   * This should be called once during app initialization
   */
  async initialize(): Promise<void> {
    // Prevent concurrent initialization
    if (this.isInitializing) {
      console.log('[PUSH SERVICE] Already initializing, skipping')
      return
    }

    // Prevent re-initialization
    if (this.isInitialized) {
      console.log('[PUSH SERVICE] Already initialized, skipping')
      return
    }

    // Only initialize on native platforms
    if (!Capacitor.isNativePlatform()) {
      console.log('[PUSH SERVICE] Web platform, skipping')
      return
    }

    this.isInitializing = true

    try {
      console.log('[PUSH SERVICE] Starting initialization')
      this.currentPlatform = Capacitor.getPlatform() === 'android' ? 'android' : 'ios'
      console.log('[PUSH SERVICE] Platform:', this.currentPlatform)

      // Set up listeners only once
      if (!this.listenersSetup) {
        console.log('[PUSH SERVICE] Setting up listeners')
        this.setupListeners()
        this.listenersSetup = true
      }

      // Request permission
      console.log('[PUSH SERVICE] Requesting permission')
      await this.requestPermission()

      // Register for push notifications
      console.log('[PUSH SERVICE] Registering')
      await this.register()

      this.isInitialized = true
      console.log('[PUSH SERVICE] Initialization complete')
    } catch (error) {
      console.error('[PUSH SERVICE] Initialization failed:', error)
    } finally {
      this.isInitializing = false
    }
  }

  /**
   * Request push notification permission from the user
   */
  async requestPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      console.log('[PUSH SERVICE] Web platform, skipping permission')
      return false
    }

    try {
      console.log('[PUSH SERVICE] Checking permission state')
      const currentPermissions = await PushNotifications.checkPermissions()
      console.log('[PUSH SERVICE] Current state:', currentPermissions.receive)

      console.log('[PUSH SERVICE] Requesting permission')
      const result = await PushNotifications.requestPermissions()
      console.log('[PUSH SERVICE] Result:', result.receive)
      
      if (result.receive === 'granted') {
        console.log('[PUSH SERVICE] Permission granted')
        return true
      } else {
        console.log('[PUSH SERVICE] Permission denied')
        return false
      }
    } catch (error) {
      console.error('[PUSH SERVICE] Permission failed:', error)
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
      console.log('[PUSH SERVICE] FCM registration event received', {
        tokenPrefix: token.value.substring(0, 8) + '...'
      })
      this.currentToken = token.value
      console.log('[PUSH SERVICE] Access token cached:', this.accessToken ? 'yes' : 'no')
      console.log('[PUSH SERVICE] Current registration status:', this.registrationStatus)
      
      // Attempt registration if conditions are met
      this.maybeRegisterDevice()
    })

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('[PUSH SERVICE] FCM registration error:', error.error)
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

    // Prevent duplicate registration attempts
    if (this.registrationStatus === 'in-flight') {
      console.log('[PUSH SERVICE] Registration already in-flight, skipping duplicate')
      return
    }

    this.registrationStatus = 'in-flight'

    try {
      console.log('[PUSH SERVICE] Server registration started', {
        platform: this.currentPlatform,
        tokenPrefix: token.substring(0, 8) + '...'
      })

      // Use cached access token from AuthContext
      const accessToken = this.accessToken
      console.log('[PUSH SERVICE] Access token from cache:', accessToken ? 'present' : 'missing')

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`
      }

      console.log('[PUSH SERVICE] Request headers:', {
        hasAuth: !!accessToken,
        hasContentType: !!headers['Content-Type']
      })

      const response = await fetch('/api/push/register-device', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pushToken: token,
          platform: this.currentPlatform,
          deviceIdentifier: this.getDeviceIdentifier()
        })
      })

      console.log('[PUSH SERVICE] Server response status:', response.status)

      if (!response.ok) {
        const error = await response.json()
        console.error('[PUSH SERVICE] Server registration failed:', {
          status: response.status,
          error: error.error || 'Unknown error'
        })
        // If unauthorized, the user is not authenticated - we'll retry when they sign in
        if (response.status === 401) {
          console.log('[PUSH SERVICE] User not authenticated, caching token for retry')
          this.currentToken = token // Store token for retry
          this.registrationStatus = 'failed' // Allow retry
        } else {
          this.registrationStatus = 'failed' // Allow retry for other errors
        }
      } else {
        const result = await response.json()
        console.log('[PUSH SERVICE] Server registration success:', {
          deviceId: result.device?.id
        })
        this.registrationStatus = 'succeeded'
      }
    } catch (error) {
      console.error('[PUSH SERVICE] Server registration error:', error)
      this.registrationStatus = 'failed' // Allow retry on error
    }
  }

  /**
   * Retry device registration after authentication
   * This should be called when the user signs in
   * Only retries server registration, not the full permission/FCM flow
   */
  async retryRegistration(): Promise<void> {
    if (!this.currentToken || !this.currentPlatform) {
      console.log('[PUSH SERVICE] No token for retry')
      return
    }

    console.log('[PUSH SERVICE] Retrying server registration')
    await this.registerDeviceWithServer(this.currentToken)
  }

  /**
   * Clear registration state (called on sign-out)
   */
  clearRegistrationState(): void {
    console.log('[PUSH SERVICE] Clearing registration state')
    this.registrationStatus = 'none'
    this.currentToken = null
    this.accessToken = null
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
