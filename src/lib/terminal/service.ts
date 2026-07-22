import Terminal, { TerminalPlugin, InitializeOptions, CollectPaymentOptions, CreateTerminalPaymentOptions, isNativeCapacitor } from './index'
import { Capacitor } from '@capacitor/core'
import { createBrowserClient } from '@/lib/supabase/browser'

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
    // Comprehensive diagnostics before any plugin operations
    if (process.env.NODE_ENV === 'development') {
      console.log('[TerminalBridgeService] === STARTUP DIAGNOSTICS ===')
      console.log('[TerminalBridgeService] Capacitor.isNativePlatform():', Capacitor.isNativePlatform())
      console.log('[TerminalBridgeService] Capacitor.getPlatform():', Capacitor.getPlatform())
      console.log('[TerminalBridgeService] Capacitor.isPluginAvailable("ReplyflowStripeTerminal"):', Capacitor.isPluginAvailable('ReplyflowStripeTerminal'))
      console.log('[TerminalBridgeService] Plugin instance exists:', this.plugin !== null)
    }

    if (!this.plugin) {
      const error = new Error('Tap to Pay is not available on this device')
      // Log technical error in development
      if (process.env.NODE_ENV === 'development') {
        console.error('[TerminalBridgeService] Plugin not available:', error)
      }
      throw this.mapErrorToFriendlyMessage(error)
    }

    try {
      // Set up token request listener BEFORE initialization
      // Stripe Terminal may request a connection token during initialization
      await this.setupTokenRequestListener()
      if (process.env.NODE_ENV === 'development') {
        console.log('[TerminalBridgeService] Token request listener registered')
      }

      // Diagnostic ping before initialization - critical for verifying registration
      if (process.env.NODE_ENV === 'development') {
        console.log('[TerminalBridgeService] Calling ping() to verify JS→native communication...')
        try {
          const pingResult = await this.plugin.ping()
          console.log('[TerminalBridgeService] ping() result:', pingResult)
          if (pingResult.buildMarker) {
            console.log('[TerminalBridgeService] Build marker:', pingResult.buildMarker)
          }
        } catch (pingError) {
          console.error('[TerminalBridgeService] ping() failed - plugin not registered or not implemented:', pingError)
          // In development, throw the raw error to surface the root cause
          throw pingError
        }
      }

      const result = await this.plugin.initialize(options)

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

      // Log raw error in development for debugging
      if (process.env.NODE_ENV === 'development') {
        console.error('[TerminalBridgeService] Raw error:', error.message)
      }

      // Authentication/session errors (401)
      if (message.includes('unauthorized') || message.includes('401') || message.includes('authentication failed')) {
        return new Error('Your session expired. Please sign in again.')
      }

      // Terminal Location address errors
      if (message.includes('terminal_location_address_required') || message.includes('a valid business address is required')) {
        return new Error('Add a valid business address before using Tap to Pay.')
      }

      if (message.includes('terminal_location_address_invalid') || message.includes('add a valid business address')) {
        return new Error('Add a valid business address before using Tap to Pay.')
      }

      // Debug build restriction
      if (message.includes('debug_build_not_supported') || message.includes('debuggable')) {
        return new Error('Real Tap to Pay requires a non-debuggable release build. Using simulated reader in debug builds.')
      }

      // Stripe setup missing errors
      if (message.includes('stripe connect account not configured') || message.includes('stripe connect account not ready')) {
        return new Error('Finish setting up payments before using Tap to Pay.')
      }

      // Terminal Location server failure (500)
      if (message.includes('internal server error') || message.includes('failed to fetch terminal location')) {
        return new Error('Tap to Pay setup couldn\'t be completed. Please try again.')
      }

      // Plugin not implemented error
      if (message.includes('not implemented') || message.includes('plugin')) {
        return new Error('Tap to Pay is not available. Please reinstall the app or contact support.')
      }

      // Permission errors
      if (message.includes('permission') || message.includes('nfc')) {
        return new Error('Tap to Pay requires NFC permissions. Please enable them in your device settings.')
      }

      // Reader connection failure
      if (message.includes('reader') || message.includes('bluetooth')) {
        return new Error('Tap to Pay couldn\'t connect to this device.')
      }

      // Connection token timeout
      if (message.includes('failed to fetch connection token: timeout')) {
        return new Error('Tap to Pay could not obtain a secure connection token. Please try again.')
      }

      // Network errors - only classify as network if explicitly network-related
      if (message.includes('network error') || message.includes('fetch failed') || message.includes('etimedout') || message.includes('enotfound')) {
        return new Error('Network error. Please check your connection and try again.')
      }

      // Return original error if no mapping (but ensure it's not a raw plugin error)
      if (message.includes('replyflowstripeterminal') || message.includes('capacitor')) {
        return new Error('Tap to Pay is not available. Please reinstall the app or contact support.')
      }

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
    console.log('[TOKEN_TRACE] stage=js_event_received requestId=' + requestId)

    // Track this request to avoid handling stale responses
    this.activeTokenRequest = { requestId, timestamp: Date.now() }

    try {
      console.log('[TOKEN_TRACE] stage=api_request_started requestId=' + requestId)
      // Fetch token from backend
      const token = await this.fetchConnectionTokenFromBackend()
      console.log('[TOKEN_TRACE] stage=api_request_success requestId=' + requestId + ' token_present=true token_length=' + token.secret.length)

      // Verify this is still the active request (not stale)
      if (this.activeTokenRequest?.requestId !== requestId) {
        console.warn('[TOKEN_TRACE] stage=js_stale_request_ignored requestId=' + requestId)
        return
      }

      console.log('[TOKEN_TRACE] stage=js_supply_started requestId=' + requestId)
      // Supply token to native
      await this.plugin!.supplyConnectionToken({ requestId, secret: token.secret })
      console.log('[TOKEN_TRACE] stage=js_supply_completed requestId=' + requestId)
    } catch (error) {
      console.error('[TOKEN_TRACE] stage=js_fetch_failed requestId=' + requestId + ' error=' + (error instanceof Error ? error.message : 'Unknown error'))

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

  private async getAuthHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    // Add Authorization header with Supabase access token for native Capacitor app
    const supabase = createBrowserClient()
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
        if (process.env.NODE_ENV === 'development') {
          console.log('[TERMINAL_AUTH] access_token_available=true')
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log('[TERMINAL_AUTH] access_token_available=false')
        }
      }
    }

    return headers
  }

  private async fetchConnectionTokenFromBackend(): Promise<{ secret: string }> {
    const headers = await this.getAuthHeaders()

    if (process.env.NODE_ENV === 'development') {
      console.log('[TERMINAL_AUTH] endpoint=/api/terminal/connection-token')
      console.log('[TERMINAL_AUTH] credentials_mode=bearer_token')
    }

    const response = await fetch('/api/terminal/connection-token', {
      method: 'POST',
      headers,
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
    const headers = await this.getAuthHeaders()

    if (process.env.NODE_ENV === 'development') {
      console.log('[TERMINAL_AUTH] endpoint=/api/terminal/location')
      console.log('[TERMINAL_AUTH] credentials_mode=bearer_token')
    }

    const response = await fetch('/api/terminal/location', {
      method: 'GET',
      headers,
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

    console.log('[TAP_SESSION_TRACE] stage=connect_start')

    // Fetch location ID from backend
    const { locationId } = await this.fetchTerminalLocation()

    // Reconcile with native SDK state before connecting
    // This prevents stale state from causing first-attempt failures
    try {
      console.log('[TAP_SESSION_TRACE] stage=service_state_snapshot')
      const diagnostics = this.getDiagnostics()
      console.log('[TAP_SESSION_TRACE] diagnostics=' + JSON.stringify(diagnostics))

      // Check if already connected via native SDK
      // Note: getConnectedReader() is not exposed in our plugin interface yet
      // We rely on the native layer to handle reconnection gracefully
      // The key is to clear any stale JS-side state before attempting connection
    } catch (reconcileError) {
      console.warn('[TAP_SESSION_TRACE] reconcile_skipped error=' + (reconcileError instanceof Error ? reconcileError.message : 'Unknown'))
      // Continue with connection attempt even if reconcile fails
    }

    console.log('[TAP_SESSION_TRACE] stage=connect_invoke locationId=' + locationId)

    const result = await this.plugin.connectTapToPay({
      simulated: options?.simulated || false,
      locationId,
    })

    console.log('[TAP_SESSION_TRACE] stage=connect_result status=' + result.status)

    return result
  }

  async createTerminalPayment(options: CreateTerminalPaymentOptions) {
    const headers = await this.getAuthHeaders()

    if (process.env.NODE_ENV === 'development') {
      console.log('[TERMINAL_AUTH] endpoint=/api/terminal/payment-intent')
      console.log('[TERMINAL_AUTH] credentials_mode=bearer_token')
    }

    const response = await fetch('/api/terminal/payment-intent', {
      method: 'POST',
      headers,
      body: JSON.stringify(options),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[TerminalPaymentIntent] Backend error response:', errorText)

      // Parse structured error from backend
      let errorMessage = 'Payment setup could not be completed. Please try again.'
      let errorCode = 'local_payment_record_failed'

      try {
        const errorData = JSON.parse(errorText)
        if (errorData.message) {
          errorMessage = errorData.message
        }
        if (errorData.error) {
          errorCode = errorData.error
        }
      } catch {
        // If not JSON, use generic message
        console.error('[TerminalPaymentIntent] Error response not JSON')
      }

      // Throw structured error with safe message only
      const error = new Error(errorMessage)
      ;(error as any).code = errorCode
      ;(error as any).stage = 'payment_intent_create'
      throw error
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

    console.log('[PAYMENT_TRACE] stage=js_payment_created paymentIntentId=' + paymentIntentId + ' client_secret_present=' + (clientSecret != null) + ' client_secret_length=' + (clientSecret?.length || 0))

    // Collect payment via native Terminal
    console.log('[PAYMENT_TRACE] stage=js_collect_payment_called client_secret_present=' + (clientSecret != null))
    const result = await this.plugin.collectPayment({
      paymentIntentId,
      clientSecret,
    })

    // If payment succeeded, trigger server-side reconciliation
    // This ensures the payment is marked as paid even if webhook is delayed
    if (result.status === 'succeeded') {
      console.log('[PAYMENT_TRACE] stage=payment_succeeded triggering_reconciliation')
      try {
        const headers = await this.getAuthHeaders()
        await fetch('/api/terminal/reconcile-payment', {
          method: 'POST',
          headers,
          body: JSON.stringify({ paymentIntentId }),
        })
        console.log('[PAYMENT_TRACE] stage=reconciliation_complete')
      } catch (reconcileError) {
        console.error('[PAYMENT_TRACE] reconciliation_failed error=' + (reconcileError instanceof Error ? reconcileError.message : 'Unknown'))
        // Don't fail the payment if reconciliation fails - webhook will handle it
      }
    }

    return result
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
