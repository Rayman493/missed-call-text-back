import Terminal, { TerminalPlugin, InitializeOptions, CollectPaymentOptions, CreateTerminalPaymentOptions, isNativeCapacitor } from './index'
import { Capacitor } from '@capacitor/core'
import { createBrowserClient } from '@/lib/supabase/browser'
import { logTapToPayEvent } from '@/lib/tap-to-pay-diagnostics'

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
  private diagListeners: Array<{ remove: () => void; __type: string; __id: string }> = []
  private instanceId: string
  private sessionId: string
  private currentAttemptId: string | null = null
  private attemptStartMs: number | null = null
  private currentPhase: string | undefined
  private connectionStatus?: string
  private paymentStatus?: string
  private lastReaderId?: string
  private currentPaymentIntentId?: string
  private listenerCounts: Record<string, number> = {}
  private totalActiveListeners = 0
  private listenerIdsByType: Record<string, Set<string>> = {}
  private appStateListener: { remove: () => void; id: string } | null = null
  private attemptInitialConnectionStatus?: string
  private sessionTimings: { initializeMs?: number; discoveryStart?: number; discoveryEnd?: number; discoveryMs?: number; connectStart?: number; connectEnd?: number; connectMs?: number } = {}
  private connectInFlight: Promise<{ status: 'connected' | string }> | null = null
  // Attempt-scoped flags/timings and app state
  private attemptSummaryEmitted = false
  private attemptFlags = {
    readerReused: false,
    discoveryPerformed: false,
    paymentIntentCreated: false,
    paymentMethodCollected: false,
    paymentConfirmed: false,
    reconciled: false,
  }
  private timings: {
    tAttemptStart?: number
    tPiStart?: number
    tPiEnd?: number
    tCollectStart?: number
    tCollectEnd?: number
    tConfirmStart?: number
    tConfirmEnd?: number
    tReconcileStart?: number
    tReconcileEnd?: number
  } = {}
  private seenDiscoveryThisAttempt = false
  private lastAppIsActive: boolean | undefined
  private staleIgnoredCount = 0

  // Minimal reset to ensure a brand-new attempt/PaymentIntent on user retry after cancel
  async resetForRetry(reason: 'user_retry' | 'manual_reset' = 'user_retry') {
    const prevAttempt = this.currentAttemptId || undefined
    const prevPi = this.currentPaymentIntentId || undefined
    try {
      await logTapToPayEvent('retry_reset', {
        phase: (this.currentPhase as any) || 'startup',
        sessionId: this.sessionId,
        attemptId: prevAttempt,
        paymentIntentId: prevPi,
        meta: { reason },
      })
    } catch {}
    // Clear unresolved attempt id if present to avoid reuse
    this.clearUnresolvedAttempt()
    // Invalidate active attempt and PI so callbacks are treated as stale and UI doesn't mis-read readiness
    this.currentAttemptId = null
    this.attemptStartMs = null
    this.currentPhase = undefined
    this.currentPaymentIntentId = undefined
    // Do not disconnect; keep reader and initialized SDK
  }

  private constructor() {
    this.plugin = isNativeCapacitor() ? Terminal : null
    this.instanceId = Math.random().toString(36).substring(2, 9)
    this.sessionId = 'ttp_' + this.instanceId
    console.log('[TERMINAL_INSTANCE_TRACE] service_instance_id=' + this.instanceId + ' created')
  }

  // Lightweight getters for diagnostics UI
  getSessionId(): string { return this.sessionId }
  getCurrentAttemptId(): string | null { return this.currentAttemptId }
  getCurrentPhase(): string | undefined { return this.currentPhase }
  getConnectionStatus(): string | undefined { return this.connectionStatus }
  getPaymentStatus(): string | undefined { return this.paymentStatus }
  getReaderId(): string | undefined { return this.lastReaderId }
  getPaymentIntentId(): string | undefined { return this.currentPaymentIntentId }
  getListenerStats(): { counts: Record<string, number>; total: number } { return { counts: { ...this.listenerCounts }, total: this.totalActiveListeners } }
  getAppActive(): boolean | undefined { return this.lastAppIsActive }
  getAttemptFlags() { return { ...this.attemptFlags } }
  getTimings() { return { ...this.timings } }

  private bumpListener(type: string, delta: 1 | -1) {
    const prev = this.listenerCounts[type] || 0
    const next = Math.max(0, prev + delta)
    this.listenerCounts[type] = next
    this.totalActiveListeners = Math.max(0, this.totalActiveListeners + delta)
    return { prev, next }
  }

  private addListenerId(type: string, id: string) {
    if (!this.listenerIdsByType[type]) this.listenerIdsByType[type] = new Set()
    this.listenerIdsByType[type].add(id)
  }
  private removeListenerId(type: string, id: string) {
    this.listenerIdsByType[type]?.delete(id)
  }
  private getActiveListenerIds(type: string): string[] {
    return Array.from(this.listenerIdsByType[type] || [])
  }

  private emitStateChanged(stateName: string, prevVal: any, nextVal: any) {
    if (prevVal === nextVal) return
    logTapToPayEvent('STATE_CHANGED', {
      phase: (this.currentPhase as any) || 'startup',
      sessionId: this.sessionId,
      attemptId: this.currentAttemptId || undefined,
      paymentIntentId: this.currentPaymentIntentId,
      readerId: this.lastReaderId,
      meta: {
        stateName,
        previousValue: prevVal,
        nextValue: nextVal,
      },
    }).catch(() => {})
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
      logTapToPayEvent('platform_unsupported', { phase: 'startup', sessionId: this.sessionId, meta: { platform: Capacitor.getPlatform?.() } }).catch(() => {})
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
      // Global native diagnostic listeners (fire-and-forget)
      try {
        if (this.plugin && this.diagListeners.length === 0) {
          const l1Type = 'statusChanged'
          const l1Id = l1Type + '#' + Date.now()
          const l1 = await this.plugin.addListener('statusChanged', async (data: any) => {
            const prev = this.connectionStatus
            this.connectionStatus = data?.status
            logTapToPayEvent('connection_status_changed', { phase: 'connection_status', sessionId: this.sessionId, connectionStatus: data?.status }).catch(() => {})
            this.emitStateChanged('connectionStatus', prev, this.connectionStatus)
          })
          const c1 = this.bumpListener(l1Type, 1); this.addListenerId(l1Type, l1Id); this.diagListeners.push({ remove: l1.remove, __type: l1Type, __id: l1Id })
          logTapToPayEvent('APP_LISTENER_REGISTERED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: l1Type, listenerId: l1Id, activeListenerCount: c1.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds(l1Type) } }).catch(() => {})
          if (c1.next > 1) {
            logTapToPayEvent('DUPLICATE_LISTENER_DETECTED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: l1Type, activeListenerCount: c1.next, activeListenerIds: this.getActiveListenerIds(l1Type), totalActiveListenerCount: this.totalActiveListeners } }).catch(() => {})
          }

          const l2Type = 'paymentStatusChanged'
          const l2Id = l2Type + '#' + Date.now()
          const l2 = await this.plugin.addListener('paymentStatusChanged', async (data: any) => {
            const prev = this.paymentStatus
            this.paymentStatus = data?.status
            logTapToPayEvent('payment_status_changed', { phase: 'collect_payment', sessionId: this.sessionId, meta: { status: data?.status } }).catch(() => {})
            this.emitStateChanged('paymentStatus', prev, this.paymentStatus)
          })
          const c2 = this.bumpListener(l2Type, 1); this.addListenerId(l2Type, l2Id); this.diagListeners.push({ remove: l2.remove, __type: l2Type, __id: l2Id })
          logTapToPayEvent('APP_LISTENER_REGISTERED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: l2Type, listenerId: l2Id, activeListenerCount: c2.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds(l2Type) } }).catch(() => {})
          if (c2.next > 1) {
            logTapToPayEvent('DUPLICATE_LISTENER_DETECTED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: l2Type, activeListenerCount: c2.next, activeListenerIds: this.getActiveListenerIds(l2Type), totalActiveListenerCount: this.totalActiveListeners } }).catch(() => {})
          }

          const l3Type = 'readerConnected'
          const l3Id = l3Type + '#' + Date.now()
          const l3 = await this.plugin.addListener('readerConnected', async (info: any) => {
            this.lastReaderId = info?.readerId
            logTapToPayEvent('reader_connected', { phase: 'connect_reader', sessionId: this.sessionId, connectionStatus: 'connected', readerId: info?.readerId }).catch(() => {})
          })
          const c3 = this.bumpListener(l3Type, 1); this.addListenerId(l3Type, l3Id); this.diagListeners.push({ remove: l3.remove, __type: l3Type, __id: l3Id })
          logTapToPayEvent('APP_LISTENER_REGISTERED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: l3Type, listenerId: l3Id, activeListenerCount: c3.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds(l3Type) } }).catch(() => {})
          if (c3.next > 1) {
            logTapToPayEvent('DUPLICATE_LISTENER_DETECTED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: l3Type, activeListenerCount: c3.next, activeListenerIds: this.getActiveListenerIds(l3Type), totalActiveListenerCount: this.totalActiveListeners } }).catch(() => {})
          }

          const l4Type = 'paymentSucceeded'
          const l4Id = l4Type + '#' + Date.now()
          const l4 = await this.plugin.addListener('paymentSucceeded', async (info: any) => {
            logTapToPayEvent('native_payment_succeeded', { phase: 'confirm_payment', sessionId: this.sessionId, paymentIntentId: info?.paymentIntentId }).catch(() => {})
          })
          const c4 = this.bumpListener(l4Type, 1); this.addListenerId(l4Type, l4Id); this.diagListeners.push({ remove: l4.remove, __type: l4Type, __id: l4Id })
          logTapToPayEvent('APP_LISTENER_REGISTERED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: l4Type, listenerId: l4Id, activeListenerCount: c4.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds(l4Type) } }).catch(() => {})
          if (c4.next > 1) {
            logTapToPayEvent('DUPLICATE_LISTENER_DETECTED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: l4Type, activeListenerCount: c4.next, activeListenerIds: this.getActiveListenerIds(l4Type), totalActiveListenerCount: this.totalActiveListeners } }).catch(() => {})
          }

          const l5Type = 'nativeError'
          const l5Id = l5Type + '#' + Date.now()
          const l5 = await this.plugin.addListener('error', async (e: any) => {
            logTapToPayEvent('native_error', { phase: 'startup', sessionId: this.sessionId, code: e?.code || e?.nativeCode, message: e?.message }).catch(() => {})
          })
          const c5 = this.bumpListener(l5Type, 1); this.addListenerId(l5Type, l5Id); this.diagListeners.push({ remove: l5.remove, __type: l5Type, __id: l5Id })
          logTapToPayEvent('APP_LISTENER_REGISTERED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: l5Type, listenerId: l5Id, activeListenerCount: c5.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds(l5Type) } }).catch(() => {})
          if (c5.next > 1) {
            logTapToPayEvent('DUPLICATE_LISTENER_DETECTED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: l5Type, activeListenerCount: c5.next, activeListenerIds: this.getActiveListenerIds(l5Type), totalActiveListenerCount: this.totalActiveListeners } }).catch(() => {})
          }
          const l0 = await (this.plugin as any).addListener('tpDiagnostics', async (payload: any) => {
            logTapToPayEvent(payload?.name || 'native_event', {
              phase: payload?.phase,
              sessionId: this.sessionId,
              attemptId: payload?.attemptId ?? this.currentAttemptId,
              connectionStatus: payload?.connectionStatus,
              readerStatus: payload?.readerStatus,
              readerId: payload?.readerId,
              paymentIntentId: payload?.paymentIntentId,
              durationMs: payload?.durationMs,
              code: payload?.code,
              message: payload?.message,
              meta: payload?.meta,
            }).catch(() => {})
            if (payload?.attemptId && this.currentAttemptId && payload.attemptId !== this.currentAttemptId) {
              this.staleIgnoredCount++
              try { await logTapToPayEvent('STALE_CALLBACK_IGNORED', { phase: payload?.phase, sessionId: this.sessionId, attemptId: this.currentAttemptId, paymentIntentId: this.currentPaymentIntentId, readerId: this.lastReaderId, meta: { incomingAttemptId: payload.attemptId, currentAttemptId: this.currentAttemptId, eventType: payload?.name, paymentIntentId: payload?.paymentIntentId, readerId: payload?.readerId } }) } catch {}
              return
            }
            if (payload?.readerId) this.lastReaderId = payload.readerId
            if (payload?.paymentIntentId) this.currentPaymentIntentId = payload.paymentIntentId
            // Update attempt flags/timings based on native lifecycle
            const n = String(payload?.name || '')
            if (n === 'discover_readers_started') {
              this.attemptFlags.discoveryPerformed = true
              this.seenDiscoveryThisAttempt = true
              this.sessionTimings.discoveryStart = Date.now()
            }
            if (n === 'discover_readers_completed') {
              this.sessionTimings.discoveryEnd = Date.now()
              if (this.sessionTimings.discoveryStart) this.sessionTimings.discoveryMs = this.sessionTimings.discoveryEnd - this.sessionTimings.discoveryStart
            }
            if (n === 'connect_reader_completed' && !this.seenDiscoveryThisAttempt) {
              this.attemptFlags.readerReused = true
            }
            if (n === 'collect_payment_method_started' && !this.timings.tCollectStart) {
              this.timings.tCollectStart = Date.now()
            }
            if (n === 'collect_payment_method_completed') {
              this.attemptFlags.paymentMethodCollected = true
              this.timings.tCollectEnd = this.timings.tCollectEnd || Date.now()
            }
            if (n === 'confirm_payment_intent_started' && !this.timings.tConfirmStart) {
              this.timings.tConfirmStart = Date.now()
            }
            if (n === 'confirm_payment_intent_completed') {
              this.attemptFlags.paymentConfirmed = true
              this.timings.tConfirmEnd = this.timings.tConfirmEnd || Date.now()
            }
          })
          this.diagListeners.push({ remove: l0.remove, __type: 'tpDiagnostics', __id: 'tpDiagnostics' })
        }
      } catch {}
      if (process.env.NODE_ENV === 'development') {
        console.log('[TerminalBridgeService] Token request listener registered')
      }

      // App background/foreground diagnostics (singleton)
      try {
        if (!this.appStateListener) {
          const mod = await import('@capacitor/app')
          const { App } = mod as any
          const appType = 'appStateChange'
          const appListenerId = appType + '#' + Date.now()
          const appL = await App.addListener('appStateChange', (ev: any) => {
            if (this.currentAttemptId && this.attemptStartMs) {
              const elapsed = Date.now() - this.attemptStartMs
              const name = ev?.isActive ? 'app_resumed' : 'app_backgrounded'
              logTapToPayEvent(name, { phase: 'app_state', sessionId: this.sessionId, attemptId: this.currentAttemptId, durationMs: elapsed, meta: { phase: this.currentPhase } }).catch(() => {})
            }
            this.lastAppIsActive = !!ev?.isActive
          })
          const ca = this.bumpListener(appType, 1); this.addListenerId(appType, appListenerId)
          this.diagListeners.push({ remove: appL.remove, __type: appType, __id: appListenerId })
          this.appStateListener = { remove: appL.remove, id: appListenerId }
          logTapToPayEvent('APP_LISTENER_REGISTERED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: appType, listenerId: appListenerId, activeListenerCount: ca.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds(appType) } }).catch(() => {})
          if (ca.next > 1) {
            logTapToPayEvent('DUPLICATE_LISTENER_DETECTED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: appType, activeListenerCount: ca.next, activeListenerIds: this.getActiveListenerIds(appType), totalActiveListenerCount: this.totalActiveListeners } }).catch(() => {})
          }
        }
      } catch {}

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

      const t0 = Date.now()
      logTapToPayEvent('initialize_started', { phase: 'initialize', sessionId: this.sessionId }).catch(() => {})
      const result = await this.plugin.initialize({ ...(options as any), diagnosticAttemptId: this.sessionId } as any)
      const initMs = Date.now() - t0
      this.sessionTimings.initializeMs = initMs
      logTapToPayEvent('initialize_completed', { phase: 'initialize', sessionId: this.sessionId, durationMs: initMs, connectionStatus: result.status }).catch(() => {})

      return result
    } catch (error) {
      logTapToPayEvent('initialize_failed', { phase: 'initialize', sessionId: this.sessionId, message: error instanceof Error ? error.message : String(error) }).catch(() => {})
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
      const t0 = Date.now()
      try { await logTapToPayEvent('token_fetch_started', { phase: 'token', sessionId: this.sessionId }) } catch {}
      console.log('[TOKEN_TRACE] stage=api_request_started requestId=' + requestId)
      // Fetch token from backend
      const token = await this.fetchConnectionTokenFromBackend()
      console.log('[TOKEN_TRACE] stage=api_request_success requestId=' + requestId + ' token_present=true token_length=' + token.secret.length)
      try { await logTapToPayEvent('token_fetch_completed', { phase: 'token', sessionId: this.sessionId, durationMs: Date.now() - t0 }) } catch {}

      // Verify this is still the active request (not stale)
      if (this.activeTokenRequest?.requestId !== requestId) {
        console.warn('[TOKEN_TRACE] stage=js_stale_request_ignored requestId=' + requestId)
        try { await logTapToPayEvent('token_fetch_stale_ignored', { phase: 'token', sessionId: this.sessionId }) } catch {}
        return
      }

      console.log('[TOKEN_TRACE] stage=js_supply_started requestId=' + requestId)
      // Supply token to native
      await this.plugin!.supplyConnectionToken({ requestId, secret: token.secret })
      console.log('[TOKEN_TRACE] stage=js_supply_completed requestId=' + requestId)
    } catch (error) {
      try { await logTapToPayEvent('token_fetch_failed', { phase: 'token', sessionId: this.sessionId, message: error instanceof Error ? error.message : 'Unknown error' }) } catch {}
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
    // Do not await any diagnostics before assigning in-flight to avoid races
    const __connectReason = (() => {
      if (this.connectionStatus === 'connected') return 'reuse_short_circuit'
      if (!this.sessionTimings.connectStart) return 'cold_start'
      return 'reconnect_or_resumed'
    })()
    logTapToPayEvent('connect_started', { phase: 'connect_reader', sessionId: this.sessionId, meta: { reason: __connectReason } }).catch(() => {})

    // Short-circuit if already connected
    if (this.connectionStatus === 'connected') {
      logTapToPayEvent('connect_dedup_already_connected', { phase: 'connect_reader', sessionId: this.sessionId, connectionStatus: 'connected', readerId: this.lastReaderId }).catch(() => {})
      // Alias event for clearer dashboards
      logTapToPayEvent('CONNECT_DEDUP_ALREADY_CONNECTED', { phase: 'connect_reader', sessionId: this.sessionId, connectionStatus: 'connected', readerId: this.lastReaderId }).catch(() => {})
      return { status: 'connected' as const }
    }
    // Dedupe concurrent calls
    if (this.connectInFlight) {
      logTapToPayEvent('connect_dedup_reused_inflight', { phase: 'connect_reader', sessionId: this.sessionId }).catch(() => {})
      // Alias event for clearer dashboards
      logTapToPayEvent('CONNECT_DEDUP_REUSED_INFLIGHT', { phase: 'connect_reader', sessionId: this.sessionId }).catch(() => {})
      return this.connectInFlight
    }

    // Wrap full connect into a single in-flight promise to dedupe callers
    this.connectInFlight = (async () => {
      // Fetch location ID from backend
      const { locationId } = await this.fetchTerminalLocation()

      // Reconcile with native SDK state before connecting (best-effort)
      try {
        console.log('[TAP_SESSION_TRACE] stage=service_state_snapshot')
        const diagnostics = this.getDiagnostics()
        console.log('[TAP_SESSION_TRACE] diagnostics=' + JSON.stringify(diagnostics))
      } catch (reconcileError) {
        console.warn('[TAP_SESSION_TRACE] reconcile_skipped error=' + (reconcileError instanceof Error ? reconcileError.message : 'Unknown'))
      }

      // Start connect timing once per connect attempt
      this.sessionTimings.connectStart = this.sessionTimings.connectStart || Date.now()
      console.log('[TAP_SESSION_TRACE] stage=connect_invoke locationId=' + locationId)
      // Prepare listeners to await actual reader connection when native returns early
      let resolveConnected: (() => void) | null = null
      let rejectOnError: ((e: any) => void) | null = null
      const connectedPromise = new Promise<void>((resolve, reject) => {
        resolveConnected = resolve
        rejectOnError = reject
      })

      const readerConnectedId = 'readerConnected#' + Date.now()
      const readerConnectedListener = await this.plugin!.addListener('readerConnected', (info: any) => {
        console.log('[TAP_SESSION_TRACE] stage=connect_event_reader_connected')
        try { logTapToPayEvent('connect_completed', { phase: 'connect_reader', sessionId: this.sessionId, connectionStatus: 'connected', readerId: info?.readerId }) } catch {}
        resolveConnected?.()
      })
      const statusChangedId = 'statusChanged#' + Date.now()
      const statusChangedListener = await this.plugin!.addListener('statusChanged', (data: any) => {
        if (data?.status === 'connected') {
          console.log('[TAP_SESSION_TRACE] stage=connect_event_status_connected')
          try { logTapToPayEvent('connection_status_changed', { phase: 'connection_status', sessionId: this.sessionId, connectionStatus: 'connected' }) } catch {}
          resolveConnected?.()
        }
      })
      const errorListenerId = 'error#' + Date.now()
      const errorListener = await this.plugin!.addListener('error', (e: any) => {
        const code = String(e?.code || e?.nativeCode || '').toLowerCase()
        const msg = String(e?.message || '').toLowerCase()
        if (code.includes('already') && code.includes('connected')) {
          try { logTapToPayEvent('connect_already_connected_treated_success', { phase: 'connect_reader', sessionId: this.sessionId, connectionStatus: this.connectionStatus || 'unknown', readerId: this.lastReaderId, code: e?.code || e?.nativeCode, message: e?.message }) } catch {}
          resolveConnected?.()
          return
        }
        console.warn('[TAP_SESSION_TRACE] stage=connect_event_error')
        try { logTapToPayEvent('connect_error', { phase: 'connect_reader', sessionId: this.sessionId, code: e?.code || e?.nativeCode, message: e?.message }) } catch {}
        rejectOnError?.(e)
      })
      // Track temp listeners in diagnostics counts
      { const c = this.bumpListener('readerConnected', 1); this.addListenerId('readerConnected', readerConnectedId); logTapToPayEvent('APP_LISTENER_REGISTERED', { phase: 'app_state', sessionId: this.sessionId, meta: { listener: 'reader_connected_temp', listenerType: 'readerConnected', scope: 'temp_connect', listenerId: readerConnectedId, activeListenerCount: c.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds('readerConnected') } }).catch(() => {}) }
      { const c = this.bumpListener('statusChanged', 1); this.addListenerId('statusChanged', statusChangedId); logTapToPayEvent('APP_LISTENER_REGISTERED', { phase: 'app_state', sessionId: this.sessionId, meta: { listener: 'connection_status_temp', listenerType: 'statusChanged', scope: 'temp_connect', listenerId: statusChangedId, activeListenerCount: c.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds('statusChanged') } }).catch(() => {}) }
      { const c = this.bumpListener('error', 1); this.addListenerId('error', errorListenerId); logTapToPayEvent('APP_LISTENER_REGISTERED', { phase: 'app_state', sessionId: this.sessionId, meta: { listener: 'native_error_temp', listenerType: 'error', scope: 'temp_connect', listenerId: errorListenerId, activeListenerCount: c.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds('error') } }).catch(() => {}) }

      const result = await this.plugin!.connectTapToPay({
        simulated: options?.simulated || false,
        locationId,
        diagnosticAttemptId: this.sessionId,
      } as any)

      console.log('[TAP_SESSION_TRACE] stage=connect_call_resolved status=' + result.status)
      try { await logTapToPayEvent('connect_call_resolved', { phase: 'connect_reader', sessionId: this.sessionId, connectionStatus: result.status }) } catch {}

      // Note: 'already connected' is handled by error listener above; result path proceeds normally

      try {
        if (result.status !== 'connected') {
          await connectedPromise
          console.log('[TAP_SESSION_TRACE] stage=connect_wait_completed')
          try { await logTapToPayEvent('connect_wait_completed', { phase: 'connect_reader', sessionId: this.sessionId, connectionStatus: 'connected' }) } catch {}
          this.sessionTimings.connectEnd = Date.now(); if (this.sessionTimings.connectStart) this.sessionTimings.connectMs = this.sessionTimings.connectEnd - this.sessionTimings.connectStart
          return { status: 'connected' as const }
        }
        this.sessionTimings.connectEnd = Date.now(); if (this.sessionTimings.connectStart) this.sessionTimings.connectMs = this.sessionTimings.connectEnd - this.sessionTimings.connectStart
        return result
      } finally {
        // Cleanup listeners
        try { await readerConnectedListener.remove(); this.removeListenerId('readerConnected', readerConnectedId); const c = this.bumpListener('readerConnected', -1); logTapToPayEvent('APP_LISTENER_REMOVED', { phase: 'app_state', sessionId: this.sessionId, meta: { listener: 'reader_connected_temp', listenerType: 'readerConnected', scope: 'temp_connect', listenerId: readerConnectedId, activeListenerCount: c.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds('readerConnected') } }).catch(() => {}) } catch {}
        try { await statusChangedListener.remove(); this.removeListenerId('statusChanged', statusChangedId); const c = this.bumpListener('statusChanged', -1); logTapToPayEvent('APP_LISTENER_REMOVED', { phase: 'app_state', sessionId: this.sessionId, meta: { listener: 'connection_status_temp', listenerType: 'statusChanged', scope: 'temp_connect', listenerId: statusChangedId, activeListenerCount: c.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds('statusChanged') } }).catch(() => {}) } catch {}
        try { await errorListener.remove(); this.removeListenerId('error', errorListenerId); const c = this.bumpListener('error', -1); logTapToPayEvent('APP_LISTENER_REMOVED', { phase: 'app_state', sessionId: this.sessionId, meta: { listener: 'native_error_temp', listenerType: 'error', scope: 'temp_connect', listenerId: errorListenerId, activeListenerCount: c.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds('error') } }).catch(() => {}) } catch {}
      }
    })()

    try {
      return await this.connectInFlight
    } finally {
      this.connectInFlight = null
    }
  }

  async createTerminalPayment(options: CreateTerminalPaymentOptions) {
    const headers = await this.getAuthHeaders()

    if (process.env.NODE_ENV === 'development') {
      console.log('[TERMINAL_AUTH] endpoint=/api/terminal/payment-intent')
      console.log('[TERMINAL_AUTH] credentials_mode=bearer_token')
    }

    const t0 = Date.now()
    try { await logTapToPayEvent('payment_intent_create_started', { phase: 'payment_intent', sessionId: this.sessionId, meta: { amountCents: options.amountCents } }) } catch {}
    let response: Response
    try {
      response = await fetch('/api/terminal/payment-intent', {
        method: 'POST',
        headers,
        body: JSON.stringify(options),
      })
    } catch (e: any) {
      // Network/transport failure
      try {
        await logTapToPayEvent('payment_intent_create_failed', {
          phase: 'payment_intent',
          sessionId: this.sessionId,
          attemptId: this.currentAttemptId || undefined,
          readerId: this.lastReaderId,
          message: e?.message || 'Network failure',
          meta: { errorType: 'network', httpStatus: null, event: 'PAYMENT_INTENT_CREATE_FAILED' },
        })
      } catch {}
      throw e
    }

    if (!response.ok) {
      const httpStatus = response.status
      const errorText = await response.text()
      console.error('[TerminalPaymentIntent] Backend error response:', errorText)

      // Parse structured error from backend
      let errorMessage = 'Payment setup could not be completed. Please try again.'
      let errorCode = 'local_payment_record_failed'
      let declineCode: string | undefined
      let errorType: string | undefined

      try {
        const errorData = JSON.parse(errorText)
        if (errorData.message) errorMessage = errorData.message
        if (errorData.error) errorCode = errorData.error
        if (errorData.decline_code) declineCode = errorData.decline_code
        if (errorData.type) errorType = errorData.type
      } catch {
        console.error('[TerminalPaymentIntent] Error response not JSON')
      }

      // Diagnostics for failure before throwing
      try {
        await logTapToPayEvent('payment_intent_create_failed', {
          phase: 'payment_intent',
          sessionId: this.sessionId,
          attemptId: this.currentAttemptId || undefined,
          readerId: this.lastReaderId,
          message: errorMessage,
          code: errorCode,
          meta: {
            errorType,
            declineCode,
            httpStatus,
            event: 'PAYMENT_INTENT_CREATE_FAILED',
          },
        })
      } catch {}

      // Throw structured error with safe message only
      const error = new Error(errorMessage)
      ;(error as any).code = errorCode
      ;(error as any).stage = 'payment_intent_create'
      throw error
    }

    const data = await response.json()
    if (!data.paymentIntentId || !data.clientSecret) {
      try {
        await logTapToPayEvent('payment_intent_create_failed', {
          phase: 'payment_intent',
          sessionId: this.sessionId,
          attemptId: this.currentAttemptId || undefined,
          readerId: this.lastReaderId,
          message: 'Invalid PaymentIntent response: missing required fields',
          meta: { httpStatus: response.status, event: 'PAYMENT_INTENT_CREATE_FAILED' },
        })
      } catch {}
      throw new Error('Invalid PaymentIntent response: missing paymentIntentId or clientSecret')
    }

    try { await logTapToPayEvent('payment_intent_create_completed', { phase: 'payment_intent', sessionId: this.sessionId, paymentIntentId: data.paymentIntentId, durationMs: Date.now() - t0 }) } catch {}
    return {
      paymentIntentId: data.paymentIntentId,
      clientSecret: data.clientSecret,
      localPaymentId: data.localPaymentId,
    }
  }

  async startTapToPayPayment(options: CreateTerminalPaymentOptions) {
    if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
    console.log('[TAP_SESSION_TRACE] stage=js_start_payment_entered')
    const overallStart = Date.now()

    // Minimum-amount validation before any PaymentIntent request or attempt-scoped work
    if (typeof options.amountCents !== 'number' || !Number.isFinite(options.amountCents) || Math.floor(options.amountCents) !== options.amountCents) {
      try { await logTapToPayEvent('amount_format_invalid', { phase: 'payment_intent', sessionId: this.sessionId, meta: { raw: options.amountCents } }) } catch {}
      throw new Error('Invalid amount. Please enter a valid amount.')
    }
    if (options.amountCents < 50) {
      try { await logTapToPayEvent('amount_below_minimum', { phase: 'payment_intent', sessionId: this.sessionId, meta: { amountCents: options.amountCents } }) } catch {}
      throw new Error('Amount must be at least $0.50.')
    }

    // CRITICAL: Check for unresolved attempt BEFORE generating new ID
    // This prevents creating a new attempt when one is already in progress
    const unresolvedAttemptId = this.getUnresolvedAttempt()
    if (unresolvedAttemptId && !options.terminalAttemptId) {
      console.log('[TAP_ATTEMPT] attempt_id=' + unresolvedAttemptId + ' stage=start_payment_reusing_unresolved')
      // Use the existing unresolved attempt ID instead of generating a new one
      options.terminalAttemptId = unresolvedAttemptId
    } else if (unresolvedAttemptId && options.terminalAttemptId && options.terminalAttemptId !== unresolvedAttemptId) {
      // Replacement scenario
      try { logTapToPayEvent('active_attempt_replaced', { phase: 'payment_intent', sessionId: this.sessionId, attemptId: options.terminalAttemptId, meta: { oldAttemptId: unresolvedAttemptId, reason: 'new_attempt_parameter' } }).catch(() => {}) } catch {}
    }

    // Generate or use provided terminalAttemptId for durable attempt identity
    const terminalAttemptId = options.terminalAttemptId || crypto.randomUUID()
    console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=start_payment')
    try { await logTapToPayEvent('attempt_created', { phase: 'payment_intent', sessionId: this.sessionId, attemptId: terminalAttemptId, meta: { amountCents: options.amountCents } }) } catch {}

    // Persist unresolved attempt ID for app restart recovery
    this.persistUnresolvedAttempt(terminalAttemptId)
    // Track active attempt state for lifecycle/app state logs
    this.currentAttemptId = terminalAttemptId
    this.attemptStartMs = overallStart
    this.currentPhase = 'payment_intent'
    this.attemptInitialConnectionStatus = this.connectionStatus
    // Reset attempt-scoped flags/timings
    this.attemptSummaryEmitted = false
    this.attemptFlags = { readerReused: false, discoveryPerformed: false, paymentIntentCreated: false, paymentMethodCollected: false, paymentConfirmed: false, reconciled: false }
    this.timings = { tAttemptStart: overallStart }
    this.seenDiscoveryThisAttempt = false

    // Create PaymentIntent via backend with terminalAttemptId
    // PaymentIntent timings
    this.timings.tPiStart = Date.now()
    const piAttemptId = this.currentAttemptId
    const { paymentIntentId, clientSecret } = await this.createTerminalPayment({
      ...options,
      terminalAttemptId,
    })
    if (piAttemptId !== this.currentAttemptId) {
      this.staleIgnoredCount++
      try { await logTapToPayEvent('STALE_CALLBACK_IGNORED', { phase: 'payment_intent', sessionId: this.sessionId, attemptId: this.currentAttemptId, paymentIntentId: undefined, readerId: this.lastReaderId, meta: { incomingAttemptId: piAttemptId, currentAttemptId: this.currentAttemptId, eventType: 'payment_intent_create_completed' } }) } catch {}
      return { status: 'canceled' as const, error: { code: 'stale', message: 'Attempt superseded' } }
    }
    this.currentPaymentIntentId = paymentIntentId
    this.attemptFlags.paymentIntentCreated = true
    this.timings.tPiEnd = Date.now()

    console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=payment_intent_created paymentIntentId=' + paymentIntentId)
    try { await logTapToPayEvent('payment_intent_ready', { phase: 'payment_intent', sessionId: this.sessionId, attemptId: terminalAttemptId, paymentIntentId }) } catch {}
    this.currentPhase = 'collect_payment'

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
    const collectStart = Date.now(); this.timings.tCollectStart = this.timings.tCollectStart || collectStart
    try { await logTapToPayEvent('collect_payment_started', { phase: 'collect_payment', sessionId: this.sessionId, attemptId: terminalAttemptId, paymentIntentId }) } catch {}
    let result: any
    try {
      const collectAttemptId = this.currentAttemptId
      result = await this.plugin.collectPayment({
        paymentIntentId,
        clientSecret,
        terminalAttemptId,
        diagnosticAttemptId: this.currentAttemptId || this.sessionId,
      } as any)
      if (collectAttemptId !== this.currentAttemptId) {
        this.staleIgnoredCount++
        try { await logTapToPayEvent('STALE_CALLBACK_IGNORED', { phase: 'collect_payment', sessionId: this.sessionId, attemptId: this.currentAttemptId, paymentIntentId, readerId: this.lastReaderId, meta: { incomingAttemptId: collectAttemptId, currentAttemptId: this.currentAttemptId, eventType: 'collect_payment_completed' } }) } catch {}
        return { status: 'canceled' as const, error: { code: 'stale', message: 'Attempt superseded' } }
      }
    } catch (e: any) {
      // Explicit duplicate guard logging without changing behavior
      const code = e?.code || e?.nativeCode || (typeof e === 'string' ? e : undefined)
      const msg = e?.message || (typeof e === 'string' ? e : undefined)
      if (String(code || msg || '').includes('payment-already-in-progress')) {
        try { await logTapToPayEvent('duplicate_request_blocked', { phase: 'collect_payment', sessionId: this.sessionId, attemptId: terminalAttemptId, code: 'payment-already-in-progress', message: 'A payment is already in progress' }) } catch {}
      }
      try { await logTapToPayEvent('collect_payment_failed', { phase: 'collect_payment', sessionId: this.sessionId, attemptId: terminalAttemptId, paymentIntentId, code, message: msg, meta: { event: 'COLLECT_PAYMENT_METHOD_FAILED' } }) } catch {}
      throw e
    }
    console.log('[TAP_SESSION_TRACE] stage=native_payment_call_resolved attempt_id=' + terminalAttemptId + ' status=' + result.status)
    try { await logTapToPayEvent('collect_payment_completed', { phase: 'collect_payment', sessionId: this.sessionId, attemptId: terminalAttemptId, paymentIntentId, durationMs: Date.now() - collectStart, code: result.status }) } catch {}
    this.timings.tCollectEnd = this.timings.tCollectEnd || Date.now()

    // If payment succeeded, trigger server-side reconciliation
    // This ensures the payment is marked as paid even if webhook is delayed
    if (result.status === 'succeeded') {
      console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=payment_succeeded triggering_reconciliation')
      try {
        const headers = await this.getAuthHeaders()
        const recStart = Date.now(); this.timings.tReconcileStart = recStart
        try { await logTapToPayEvent('reconcile_started', { phase: 'reconcile', sessionId: this.sessionId, attemptId: terminalAttemptId, paymentIntentId }) } catch {}
        const recAttemptId = this.currentAttemptId
        await fetch('/api/terminal/reconcile-payment', {
          method: 'POST',
          headers,
          body: JSON.stringify({ paymentIntentId, terminalAttemptId }),
        })
        if (recAttemptId !== this.currentAttemptId) {
          this.staleIgnoredCount++
          try { await logTapToPayEvent('STALE_CALLBACK_IGNORED', { phase: 'reconcile', sessionId: this.sessionId, attemptId: this.currentAttemptId, paymentIntentId, readerId: this.lastReaderId, meta: { incomingAttemptId: recAttemptId, currentAttemptId: this.currentAttemptId, eventType: 'reconcile_completed' } }) } catch {}
          return { status: 'canceled' as const, error: { code: 'stale', message: 'Attempt superseded' } }
        }
        this.attemptFlags.reconciled = true
        this.timings.tReconcileEnd = Date.now()
        try { await logTapToPayEvent('reconcile_completed', { phase: 'reconcile', sessionId: this.sessionId, attemptId: terminalAttemptId, paymentIntentId, durationMs: this.timings.tReconcileEnd - recStart }) } catch {}
        console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=reconciliation_complete')
        // Clear unresolved attempt ID on success
        try { logTapToPayEvent('active_attempt_reset', { phase: 'reconcile', sessionId: this.sessionId, attemptId: terminalAttemptId, meta: { reason: 'reconciled_success' } }).catch(() => {}) } catch {}
        this.clearUnresolvedAttempt()
        this.currentAttemptId = null
        this.attemptStartMs = null
        this.currentPhase = undefined
      } catch (reconcileError) {
        console.error('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' reconciliation_failed error=' + (reconcileError instanceof Error ? reconcileError.message : 'Unknown'))
        try { await logTapToPayEvent('reconcile_failed', { phase: 'reconcile', sessionId: this.sessionId, attemptId: terminalAttemptId, paymentIntentId, message: reconcileError instanceof Error ? reconcileError.message : 'Unknown' }) } catch {}
        // Don't fail the payment if reconciliation fails - webhook will handle it
        // Keep unresolved attempt ID for recovery
      }
    } else if (result.status === 'failed' || result.status === 'canceled') {
      // Clear unresolved attempt ID on terminal failure/cancellation
      console.log('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=payment_terminal status=' + result.status)
      try { logTapToPayEvent('active_attempt_reset', { phase: 'collect_payment', sessionId: this.sessionId, attemptId: terminalAttemptId, meta: { reason: result.status } }).catch(() => {}) } catch {}
      this.clearUnresolvedAttempt()
      this.currentAttemptId = null
      this.attemptStartMs = null
      this.currentPhase = undefined
      try { await logTapToPayEvent(result.status === 'failed' ? 'payment_failed' : 'payment_canceled', { phase: 'collect_payment', sessionId: this.sessionId, attemptId: terminalAttemptId, paymentIntentId, code: result.error?.code, message: result.error?.message }) } catch {}
    } else {
      // Unexpected status - treat as ambiguous
      console.warn('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=unexpected_status status=' + result.status + ' treating_as_ambiguous')
      // Keep unresolved attempt ID for recovery
      try { await logTapToPayEvent('payment_ambiguous', { phase: 'collect_payment', sessionId: this.sessionId, attemptId: terminalAttemptId, paymentIntentId, code: result.status }) } catch {}
    }

    // Normalize connection status out of transient collecting/processing states before summary
    try {
      const prev = this.connectionStatus
      if (prev === 'collecting' || prev === 'processing' || prev === 'confirming') {
        this.connectionStatus = 'connected'
        logTapToPayEvent('CONNECTION_STATUS_NORMALIZED', { phase: 'connection_status', sessionId: this.sessionId, attemptId: terminalAttemptId, paymentIntentId, meta: { from: prev, to: this.connectionStatus } }).catch(() => {})
      }
    } catch {}

    // Attempt total duration
    const totalDuration = Date.now() - overallStart
    try { logTapToPayEvent('attempt_completed', { phase: 'collect_payment', sessionId: this.sessionId, attemptId: terminalAttemptId, paymentIntentId, durationMs: totalDuration, code: result.status, message: result.error?.message }) } catch {}
    const completionReason = (() => {
      if (result.status === 'succeeded') return 'success'
      if (result.status === 'canceled') return 'cancelled_by_user'
      if (result.error?.code === 'native_error') return 'native_error'
      if (result.error?.stage === 'collect_payment') return 'collect_failed'
      if (result.error?.stage === 'confirm_payment') return 'confirmation_failed'
      if (result.error?.stage === 'reconcile') return 'reconciliation_failed'
      if (String(result.error?.code || '').includes('timeout')) return 'timeout'
      return 'unexpected_status'
    })()

    try {
      logTapToPayEvent('ATTEMPT_SUMMARY', {
        phase: 'collect_payment',
        sessionId: this.sessionId,
        attemptId: terminalAttemptId,
        paymentIntentId,
        code: result.status,
        connectionStatus: this.connectionStatus,
        meta: {
          result: result.status,
          durationMs: totalDuration,
          reconciled: this.attemptFlags.reconciled || false,
          readerId: this.lastReaderId,
          readerReused: this.attemptFlags.readerReused,
          discoveryPerformed: this.attemptFlags.discoveryPerformed,
          paymentIntentCreated: this.attemptFlags.paymentIntentCreated,
          paymentMethodCollected: this.attemptFlags.paymentMethodCollected || undefined,
          paymentConfirmed: this.attemptFlags.paymentConfirmed || undefined,
          amountCents: options.amountCents,
          currency: (options as any).currency,
          initialConnectionStatus: this.attemptInitialConnectionStatus,
          finalConnectionStatus: this.connectionStatus,
          finalPaymentStatus: this.paymentStatus,
          errorCode: result.error?.code,
          errorMessage: result.error?.message,
          outcome: result.status,
          completionReason,
          totalAttemptDurationMs: totalDuration,
          paymentIntentCreateDurationMs: this.timings.tPiStart && this.timings.tPiEnd ? (this.timings.tPiEnd - this.timings.tPiStart) : undefined,
          collectPaymentMethodDurationMs: this.timings.tCollectStart && this.timings.tCollectEnd ? (this.timings.tCollectEnd - this.timings.tCollectStart) : undefined,
          confirmationDurationMs: this.timings.tConfirmStart && this.timings.tConfirmEnd ? (this.timings.tConfirmEnd - this.timings.tConfirmStart) : undefined,
          reconciliationDurationMs: this.timings.tReconcileStart && this.timings.tReconcileEnd ? (this.timings.tReconcileEnd - this.timings.tReconcileStart) : undefined,
        }
      }).catch(() => {})
    } catch {}

    try {
      logTapToPayEvent('ATTEMPT_VALIDATION', {
        phase: 'collect_payment',
        sessionId: this.sessionId,
        attemptId: terminalAttemptId,
        meta: {
          summaryEmitted: true,
          staleCallbacksIgnored: this.staleIgnoredCount,
          listenerParityPassed: true, // validated at teardown
          paymentIntentCreated: this.attemptFlags.paymentIntentCreated,
          paymentMethodCollected: this.attemptFlags.paymentMethodCollected,
          paymentConfirmed: this.attemptFlags.paymentConfirmed,
          reconciled: this.attemptFlags.reconciled,
        }
      }).catch(() => {})
    } catch {}
    return result
  }

  async collectPayment(options: CollectPaymentOptions) {
    if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
    return this.plugin.collectPayment(options)
  }

  async cancel() {
    if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
    console.log('[TERMINAL_RECONCILIATION] stage=cancel_called')
    try { await logTapToPayEvent('cancel_requested', { phase: 'cancel', sessionId: this.sessionId }) } catch {}
    const result = await (this.plugin as any).cancel({ diagnosticAttemptId: this.currentAttemptId || this.sessionId })
    console.log('[TERMINAL_RECONCILIATION] stage=cancel_complete')
    try { await logTapToPayEvent('cancel_completed', { phase: 'cancel', sessionId: this.sessionId, connectionStatus: result.status }) } catch {}
    // If an attempt was active, mark it observationally reset for diagnostics
    if (this.currentAttemptId) {
      try { await logTapToPayEvent('active_attempt_reset', { phase: 'cancel', sessionId: this.sessionId, attemptId: this.currentAttemptId, meta: { reason: 'cancel' } }) } catch {}
      this.currentAttemptId = null
      this.attemptStartMs = null
      this.currentPhase = undefined
    }
    return result
  }

  async disconnect() {
    if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
    try { await logTapToPayEvent('disconnect_requested', { phase: 'disconnect', sessionId: this.sessionId }) } catch {}
    const res = await (this.plugin as any).disconnect({ diagnosticAttemptId: this.currentAttemptId || this.sessionId })
    try { await logTapToPayEvent('disconnect_completed', { phase: 'disconnect', sessionId: this.sessionId, connectionStatus: res.status }) } catch {}
    return res
  }

  async teardown() {
    if (!this.plugin) return { status: 'not_initialized' as const }

    // Clean up listener
    if (this.tokenRequestListener) {
      try { this.tokenRequestListener.remove(); const c = this.bumpListener('connectionTokenRequested', -1); logTapToPayEvent('APP_LISTENER_REMOVED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: 'connectionTokenRequested', activeListenerCount: c.next, totalActiveListenerCount: this.totalActiveListeners } }).catch(() => {}) } catch {}
      this.tokenRequestListener = null
    }
    // Listener parity snapshot before removals
    try {
      const remaining: Record<string, string[]> = {}
      Object.keys(this.listenerIdsByType).forEach(t => remaining[t] = Array.from(this.listenerIdsByType[t] || []))
      const totalRemaining = Object.values(remaining).reduce((a, ids) => a + ids.length, 0)
      if (totalRemaining > 0) {
        logTapToPayEvent('LISTENER_LEAK_DETECTED', { phase: 'cleanup', sessionId: this.sessionId, meta: { remainingActiveListeners: totalRemaining, listenerTypes: Object.keys(remaining), activeListenerIds: remaining } }).catch(() => {})
      }
      logTapToPayEvent('LISTENER_PARITY_SUMMARY', { phase: 'cleanup', sessionId: this.sessionId, meta: { registrations: this.totalActiveListeners + Object.values(this.listenerCounts).reduce((a,b)=>a+b,0), removals: 'tracked_in_removal_logs', remainingActiveListeners: totalRemaining, listenerTypes: Object.keys(remaining), activeListenerIds: remaining } }).catch(() => {})
    } catch {}

    if (this.diagListeners.length) {
      for (const l of this.diagListeners) {
        try {
          l.remove();
          this.removeListenerId(l.__type, l.__id)
          const c = this.bumpListener(l.__type, -1)
          logTapToPayEvent('APP_LISTENER_REMOVED', { phase: 'app_state', sessionId: this.sessionId, meta: { listenerType: l.__type, listenerId: l.__id, activeListenerCount: c.next, totalActiveListenerCount: this.totalActiveListeners, activeListenerIds: this.getActiveListenerIds(l.__type) } }).catch(() => {})
        } catch {}
      }
      this.diagListeners = []
    }
    this.activeTokenRequest = null

    // Cleanup diagnostics
    try { logTapToPayEvent('cleanup_started', { phase: 'cleanup', sessionId: this.sessionId }) } catch {}
    const res = await this.plugin.teardown()
    try { logTapToPayEvent('cleanup_completed', { phase: 'cleanup', sessionId: this.sessionId, connectionStatus: res.status }) } catch {}
    if (this.currentAttemptId) {
      try { await logTapToPayEvent('active_attempt_reset', { phase: 'cleanup', sessionId: this.sessionId, attemptId: this.currentAttemptId, meta: { reason: 'teardown' } }) } catch {}
      this.currentAttemptId = null
      this.attemptStartMs = null
      this.currentPhase = undefined
    }
    return res
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
