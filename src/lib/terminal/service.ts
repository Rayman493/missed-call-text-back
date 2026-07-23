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

// Singleton instance to prevent multiple service instances causing duplicate listeners
let singletonInstance: TerminalBridgeService | null = null

export class TerminalBridgeService {
  private plugin: TerminalPlugin | null
  private activeTokenRequest: TokenRequest | null = null
  private tokenRequestListener: { remove: () => void } | null = null
  private instanceId: string

  private constructor() {
    this.plugin = isNativeCapacitor() ? Terminal : null
    this.instanceId = Math.random().toString(36).substring(2, 9)
    console.log('[TERMINAL_INSTANCE_TRACE] service_instance_id=' + this.instanceId + ' created')
  }

  // Use singleton pattern to prevent multiple instances
  static getInstance(): TerminalBridgeService {
    if (!singletonInstance) {
      singletonInstance = new TerminalBridgeService()
    }
    return singletonInstance
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

  async getAuthHeaders(): Promise<HeadersInit> {
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

    console.log('[TAP_SESSION_TRACE] stage=connect_call_start')

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

    // Prepare listeners to await actual reader connection when native returns early
    let resolveConnected: (() => void) | null = null
    let rejectOnError: ((e: any) => void) | null = null
    const connectedPromise = new Promise<void>((resolve, reject) => {
      resolveConnected = resolve
      rejectOnError = reject
    })

    const readerConnectedListener = await this.plugin.addListener('readerConnected', () => {
      console.log('[TAP_SESSION_TRACE] stage=connect_event_reader_connected')
      resolveConnected?.()
    })
    const statusChangedListener = await this.plugin.addListener('statusChanged', (data: any) => {
      if (data?.status === 'connected') {
        console.log('[TAP_SESSION_TRACE] stage=connect_event_status_connected')
        resolveConnected?.()
      }
    })
    const errorListener = await this.plugin.addListener('error', (e: any) => {
      console.warn('[TAP_SESSION_TRACE] stage=connect_event_error')
      rejectOnError?.(e)
    })

    const result = await this.plugin.connectTapToPay({
      simulated: options?.simulated || false,
      locationId,
    })

    console.log('[TAP_SESSION_TRACE] stage=connect_call_resolved status=' + result.status)

    try {
      if (result.status !== 'connected') {
        await connectedPromise
        console.log('[TAP_SESSION_TRACE] stage=connect_wait_completed')
        return { status: 'connected' as const }
      }
      return result
    } finally {
      // Cleanup listeners
      try { await readerConnectedListener.remove() } catch {}
      try { await statusChangedListener.remove() } catch {}
      try { await errorListener.remove() } catch {}
    }
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
    console.log('[TAP_SESSION_TRACE] stage=js_start_payment_entered')

    // CRITICAL: Check for unresolved attempt BEFORE generating new ID
    // This prevents creating a new attempt when one is already in progress
    const unresolvedAttemptId = this.getUnresolvedAttempt()
    if (unresolvedAttemptId && !options.terminalAttemptId) {
      console.log('[TAP_ATTEMPT] attempt_id=' + unresolvedAttemptId + ' stage=start_payment_reusing_unresolved')
      // Use the existing unresolved attempt ID instead of generating a new one
      options.terminalAttemptId = unresolvedAttemptId
    }

    // Generate or use provided terminalAttemptId for durable attempt identity
    const terminalAttemptId = options.terminalAttemptId || crypto.randomUUID()
    console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=start_payment')

    // Persist unresolved attempt ID for app restart recovery
    this.persistUnresolvedAttempt(terminalAttemptId)

    // Create PaymentIntent via backend with terminalAttemptId
    const { paymentIntentId, clientSecret } = await this.createTerminalPayment({
      ...options,
      terminalAttemptId,
    })

    console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=payment_intent_created paymentIntentId=' + paymentIntentId)

    // Validate native bridge parameters before passing to native layer
    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      throw new Error('Invalid paymentIntentId: must be non-empty string')
    }
    if (!clientSecret || typeof clientSecret !== 'string') {
      throw new Error('Invalid clientSecret: must be non-empty string')
    }
    if (!terminalAttemptId || typeof terminalAttemptId !== 'string') {
      throw new Error('Invalid terminalAttemptId: must be non-empty string')
    }

    // Collect payment via native Terminal with correlation ID
    console.log('[TAP_SESSION_TRACE] stage=native_payment_call_start attempt_id=' + terminalAttemptId)
    console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=collect_payment')
    const result = await this.plugin.collectPayment({
      paymentIntentId,
      clientSecret,
      terminalAttemptId,
    })
    console.log('[TAP_SESSION_TRACE] stage=native_payment_call_resolved attempt_id=' + terminalAttemptId + ' status=' + result.status)

    // If payment succeeded, trigger server-side reconciliation
    // This ensures the payment is marked as paid even if webhook is delayed
    if (result.status === 'succeeded') {
      console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=payment_succeeded triggering_reconciliation')
      try {
        const headers = await this.getAuthHeaders()
        await fetch('/api/terminal/reconcile-payment', {
          method: 'POST',
          headers,
          body: JSON.stringify({ paymentIntentId, terminalAttemptId }),
        })
        console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=reconciliation_complete')
        // Clear unresolved attempt ID on success
        this.clearUnresolvedAttempt()
      } catch (reconcileError) {
        console.error('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' reconciliation_failed error=' + (reconcileError instanceof Error ? reconcileError.message : 'Unknown'))
        // Don't fail the payment if reconciliation fails - webhook will handle it
        // Keep unresolved attempt ID for recovery
      }
    } else if (result.status === 'failed' || result.status === 'canceled') {
      // Clear unresolved attempt ID on terminal failure/cancellation
      console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=payment_terminal status=' + result.status)
      this.clearUnresolvedAttempt()
    } else {
      // Unexpected status - treat as ambiguous
      console.warn('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=unexpected_status status=' + result.status + ' treating_as_ambiguous')
      // Keep unresolved attempt ID for recovery
    }

    return result
  }

  async collectPayment(options: CollectPaymentOptions) {
    if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
    return this.plugin.collectPayment(options)
  }

  async cancel() {
    if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
    console.log('[TERMINAL_RECONCILIATION] stage=cancel_called')
    const result = await this.plugin.cancel()
    console.log('[TERMINAL_RECONCILIATION] stage=cancel_complete')
    return result
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

  // Persist unresolved attempt ID for app restart recovery
  private persistUnresolvedAttempt(terminalAttemptId: string) {
    try {
      localStorage.setItem('terminal_unresolved_attempt_id', terminalAttemptId)
      console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=persisted')
    } catch (error) {
      console.error('[TAP_ATTEMPT] failed to persist attempt ID:', error)
    }
  }

  // Clear unresolved attempt ID when attempt is terminal
  clearUnresolvedAttempt() {
    try {
      localStorage.removeItem('terminal_unresolved_attempt_id')
      console.log('[TAP_ATTEMPT] stage=unresolved_attempt_cleared')
    } catch (error) {
      console.error('[TAP_ATTEMPT] failed to clear attempt ID:', error)
    }
  }

  // Get unresolved attempt ID for recovery
  getUnresolvedAttempt(): string | null {
    try {
      const attemptId = localStorage.getItem('terminal_unresolved_attempt_id')
      if (attemptId) {
        console.log('[TAP_ATTEMPT] attempt_id=' + attemptId + ' stage=recovered')
      }
      return attemptId
    } catch (error) {
      console.error('[TAP_ATTEMPT] failed to recover attempt ID:', error)
      return null
    }
  }
}

// Export singleton instance for backward compatibility
export const terminalBridge = TerminalBridgeService.getInstance()
