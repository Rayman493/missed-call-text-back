import { Capacitor } from '@capacitor/core'
import ReplyflowStripeTerminal from '@/lib/terminal'

export interface TapToPaySupportStatus {
  status: 'supported' | 'unsupported_device' | 'unsupported_ios_version' | 'unavailable' | 'unknown'
  supported: boolean
  platform: string
  unsupportedReason?: string
  deviceInfo?: {
    isSimulator?: boolean
    deviceModel?: string
    deviceIdentifier?: string
    deviceType?: string
    systemVersion?: string
    requiredVersion?: string
    checkMethod?: 'PaymentCardReader.isSupported' | 'SCPTerminal.supportsReaders'
    error?: string
    isiOSAppOnMac?: boolean
  }
}

interface TapToPayCapabilityState {
  status: TapToPaySupportStatus | null
  isLoading: boolean
  error: string | null
  lastChecked: number | null
}

type TapToPayCapabilityListener = (state: TapToPayCapabilityState) => void

function createTimeoutPromise<T>(ms: number, operation: string): Promise<T> {
  return new Promise<T>((_, reject) => {
    const timeoutId = setTimeout(() => {
      const error = new Error(`${operation} timeout after ${ms}ms`)
      error.name = 'TimeoutError'
      reject(error)
    }, ms)
    if (typeof timeoutId.unref === 'function') {
      timeoutId.unref()
    }
  })
}

const CAPABILITY_CHECK_TIMEOUT_MS = 10000 // 10 seconds

class TapToPayCapabilityStore {
  private state: TapToPayCapabilityState = {
    status: null,
    isLoading: false,
    error: null,
    lastChecked: null,
  }

  private inFlightPromise: Promise<TapToPaySupportStatus | null> | null = null
  private listeners: Set<TapToPayCapabilityListener> = new Set()
  private readonly CACHE_DURATION_MS = 10000 // 10 seconds

  getState(): TapToPayCapabilityState {
    return { ...this.state }
  }

  subscribe(listener: TapToPayCapabilityListener): () => void {
    this.listeners.add(listener)
    // Immediately emit current state to new subscribers
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getState()))
  }

  private setState(newState: Partial<TapToPayCapabilityState>) {
    this.state = { ...this.state, ...newState }
    this.notifyListeners()
  }

  async checkCapability(options?: { forceRefresh?: boolean }): Promise<TapToPaySupportStatus | null> {
    // Check if we have a cached result that's still valid
    const now = Date.now()
    const isCacheValid =
      this.state.status !== null &&
      this.state.lastChecked !== null &&
      !options?.forceRefresh &&
      (now - this.state.lastChecked) < this.CACHE_DURATION_MS

    if (isCacheValid && !this.state.isLoading) {
      return this.state.status
    }

    // If there's already an in-flight request, return that promise
    if (this.inFlightPromise && !options?.forceRefresh) {
      return this.inFlightPromise
    }

    // Start a new capability check
    this.setState({ isLoading: true, error: null })

    const previousStatus = this.state.status
    const previousError = this.state.error

    this.inFlightPromise = (async () => {
      try {
        // Early exit for non-iOS platforms
        const isNative = Capacitor.isNativePlatform()
        const platform = Capacitor.getPlatform()
        const isIOS = platform === 'ios'

        if (!isNative || !isIOS) {
          const result: TapToPaySupportStatus = {
            status: 'unavailable',
            supported: false,
            platform,
          }
          this.setState({ status: result, isLoading: false, lastChecked: now })
          return result
        }

        // Call native plugin with timeout
        const result = await Promise.race([
          ReplyflowStripeTerminal.getTapToPaySupportStatus(),
          createTimeoutPromise<TapToPaySupportStatus>(CAPABILITY_CHECK_TIMEOUT_MS, 'Tap to Pay capability check'),
        ]) as TapToPaySupportStatus

        this.setState({
          status: result,
          isLoading: false,
          lastChecked: now,
        })

        return result
      } catch (error) {
        console.error('[TapToPayCapabilityStore] Error checking capability:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        const isTimeout = error instanceof Error && error.name === 'TimeoutError'
        const fallbackStatus = (previousStatus && previousStatus.status !== 'unknown') ? previousStatus : {
          status: 'unknown' as const,
          supported: false,
          platform: Capacitor.getPlatform(),
          unsupportedReason: isTimeout ? 'capability_check_timeout' : 'capability_check_failed',
        }
        this.setState({
          status: fallbackStatus,
          isLoading: false,
          error: isTimeout ? 'Capability check timed out. Try again.' : errorMessage,
          lastChecked: now,
        })
        return fallbackStatus
      } finally {
        this.inFlightPromise = null
      }
    })()

    return this.inFlightPromise
  }

  clearCache(): void {
    this.setState({
      status: null,
      isLoading: false,
      error: null,
      lastChecked: null,
    })
    this.inFlightPromise = null
  }
}

// Singleton instance
const tapToPayCapabilityStore = new TapToPayCapabilityStore()

export default tapToPayCapabilityStore
