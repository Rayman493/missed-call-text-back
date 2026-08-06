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

        // Call native plugin
        const result = await ReplyflowStripeTerminal.getTapToPaySupportStatus()
        const supportStatus = result as TapToPaySupportStatus

        this.setState({
          status: supportStatus,
          isLoading: false,
          lastChecked: now,
        })

        return supportStatus
      } catch (error) {
        console.error('[TapToPayCapabilityStore] Error checking capability:', error)
        const errorResult: TapToPaySupportStatus = {
          status: 'unknown',
          supported: false,
          platform: Capacitor.getPlatform(),
          unsupportedReason: 'capability_check_failed',
        }
        this.setState({
          status: errorResult,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to check capability',
          lastChecked: now,
        })
        return errorResult
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
