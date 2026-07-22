import Terminal, { TerminalPlugin, InitializeOptions, CollectPaymentOptions, CreateTerminalPaymentOptions, isNativeCapacitor } from './index'
import { Capacitor } from '@capacitor/core'

interface TokenRequest {
  requestId: string
  timestamp: number
}

// Development-only diagnostics
export interface TerminalDiagnostics {
  isNativePlatform: boolean
  platform: string
  pluginAvailable: boolean
  pluginName: string
  timestamp: number
}

export class TerminalBridgeService {
  private plugin: TerminalPlugin | null
  private activeTokenRequest: TokenRequest | null = null
  private tokenRequestListener: { remove: () => void } | null = null

  constructor() {
    this.plugin = isNativeCapacitor() ? Terminal : null
  }

  // Development diagnostics
  getDiagnostics(): TerminalDiagnostics {
    const isNative = Capacitor.isNativePlatform()
    const platform = Capacitor.getPlatform()
    const pluginAvailable = this.plugin !== null

    const diagnostics: TerminalDiagnostics = {
      isNativePlatform: isNative,
      platform,
      pluginAvailable,
      pluginName: 'ReplyflowStripeTerminal',
      timestamp: Date.now(),
    }

    // Log diagnostics in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[TerminalBridgeService] Diagnostics:', diagnostics)
    }

    return diagnostics
  }

  async isSupported() {
    if (!this.plugin) return { supported: false, platform: 'web' as const }
    return this.plugin.isSupported()
  }

  async initialize(options?: InitializeOptions) {
    if (!this.plugin) {
      const error = new Error('Tap to Pay is not available on this device')
      // Log technical error in development
      if (process.env.NODE_ENV === 'development') {
        console.error('[TerminalBridgeService] Plugin not available:', error)
      }
      throw this.mapErrorToFriendlyMessage(error)
    }

    try {
      const result = await this.plugin.initialize(options)

      // Set up token request listener after initialization
      await this.setupTokenRequestListener()

      return result
    } catch (error) {
      // Log technical error in development
      if (process.env.NODE_ENV === 'development') {
        console.error('[TerminalBridgeService] Initialize failed:', error)
      }
      throw this.mapErrorToFriendlyMessage(error)
    }
  }

  // Map technical errors to user-friendly messages
  private mapErrorToFriendlyMessage(error: unknown): Error {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()

      // Plugin not implemented error
      if (message.includes('not implemented') || message.includes('plugin')) {
        return new Error('Tap to Pay is not available. Please reinstall the app or contact support.')
      }

      // Network errors
      if (message.includes('network') || message.includes('connection')) {
        return new Error('Unable to connect to payment service. Please check your internet connection.')
      }

      // Permission errors
      if (message.includes('permission') || message.includes('nfc')) {
        return new Error('Tap to Pay requires NFC permissions. Please enable them in your device settings.')
      }

      // Return original error if no mapping
      return error
    }

    // Unknown error type
    return new Error('An unexpected error occurred. Please try again.')
  }

  private async setupTokenRequestListener(): Promise<void> {
    if (!this.plugin || this.tokenRequestListener) {
      return // Already set up or not available
    }

    this.tokenRequestListener = await this.plugin.addListener(
      'connectionTokenRequested',
      async (data: { requestId: string }) => {
        await this.handleTokenRequest(data.requestId)
      }
    )
  }

  private async handleTokenRequest(requestId: string): Promise<void> {
    console.log('[TerminalBridgeService] Token requested:', requestId)
    
    // Track this request to avoid handling stale responses
    this.activeTokenRequest = { requestId, timestamp: Date.now() }

    try {
      // Fetch token from backend
      const token = await this.fetchConnectionTokenFromBackend()
      
      // Verify this is still the active request (not stale)
      if (this.activeTokenRequest?.requestId !== requestId) {
        console.warn('[TerminalBridgeService] Stale token request ignored:', requestId)
        return
      }

      // Supply token to native
      await this.plugin!.supplyConnectionToken({ requestId, secret: token.secret })
      console.log('[TerminalBridgeService] Token supplied successfully:', requestId)
    } catch (error) {
      console.error('[TerminalBridgeService] Token fetch failed:', error)
      
      // Report error to native if still active
      if (this.activeTokenRequest?.requestId === requestId) {
        await this.plugin!.supplyConnectionTokenError({
          requestId,
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    } finally {
      // Clear active request after handling
      if (this.activeTokenRequest?.requestId === requestId) {
        this.activeTokenRequest = null
      }
    }
  }

  private async fetchConnectionTokenFromBackend(): Promise<{ secret: string }> {
    const response = await fetch('/api/terminal/connection-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to fetch connection token: ${error}`)
    }

    const data = await response.json()
    if (!data.secret) {
      throw new Error('Invalid token response: missing secret')
    }

    return { secret: data.secret }
  }

  async fetchTerminalLocation(): Promise<{ locationId: string }> {
    const response = await fetch('/api/terminal/location', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to fetch terminal location: ${error}`)
    }

    const data = await response.json()
    if (!data.locationId) {
      throw new Error('Invalid location response: missing locationId')
    }

    return { locationId: data.locationId }
  }

  async connectTapToPay(options?: { simulated?: boolean }) {
    if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
    
    // Fetch location ID from backend
    const { locationId } = await this.fetchTerminalLocation()
    
    return this.plugin.connectTapToPay({
      simulated: options?.simulated || false,
      locationId,
    })
  }

  async createTerminalPayment(options: CreateTerminalPaymentOptions) {
    const response = await fetch('/api/terminal/payment-intent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to create PaymentIntent: ${error}`)
    }

    const data = await response.json()
    if (!data.paymentIntentId || !data.clientSecret) {
      throw new Error('Invalid PaymentIntent response: missing paymentIntentId or clientSecret')
    }

    return {
      paymentIntentId: data.paymentIntentId,
      clientSecret: data.clientSecret,
      localPaymentId: data.localPaymentId,
    }
  }

  async startTapToPayPayment(options: CreateTerminalPaymentOptions) {
    if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
    
    // Create PaymentIntent via backend
    const { paymentIntentId, clientSecret } = await this.createTerminalPayment(options)
    
    // Collect payment via native Terminal
    return this.plugin.collectPayment({
      paymentIntentId,
    })
  }

  async collectPayment(options: CollectPaymentOptions) {
    if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
    return this.plugin.collectPayment(options)
  }

  async cancel() {
    if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
    return this.plugin.cancel()
  }

  async disconnect() {
    if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
    return this.plugin.disconnect()
  }

  async teardown() {
    if (!this.plugin) return { status: 'not_initialized' as const }
    
    // Clean up listener
    if (this.tokenRequestListener) {
      this.tokenRequestListener.remove()
      this.tokenRequestListener = null
    }
    this.activeTokenRequest = null
    
    return this.plugin.teardown()
  }
}

export const terminalBridge = new TerminalBridgeService()
