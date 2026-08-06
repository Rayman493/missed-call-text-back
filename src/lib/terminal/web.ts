import { WebPlugin } from '@capacitor/core'
import type { TerminalPlugin, InitializeOptions, ConnectOptions, CollectPaymentOptions, CreateTerminalPaymentOptions, TerminalStatus, TerminalPaymentResult, IsTapToPayAccountLinkedOptions } from './index'

export class TerminalWeb extends WebPlugin implements TerminalPlugin {
  private status: TerminalStatus = 'not_initialized'

  async ping(): Promise<{ available: boolean; platform: string; buildMarker?: string }> {
    return { available: false, platform: 'web' }
  }

  async initialize(_options?: InitializeOptions): Promise<{ status: TerminalStatus }> {
    this.status = 'ready'
    return { status: this.status }
  }

  async isSupported(): Promise<{ supported: boolean; platform: 'ios' | 'android' | 'web' }> {
    return { supported: false, platform: 'web' }
  }

  async getTapToPaySupportStatus(): Promise<{
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
  }> {
    return {
      status: 'unavailable',
      supported: false,
      platform: 'web',
      unsupportedReason: 'web_not_supported',
    }
  }

  async checkLocationPermission(): Promise<{ granted: boolean; precise: boolean; canAskAgain: boolean; locationEnabled: boolean }> {
    // Web doesn't require location permission for Tap to Pay
    return { granted: true, precise: false, canAskAgain: true, locationEnabled: true }
  }

  async requestLocationPermission(): Promise<{ granted: boolean; precise: boolean; canAskAgain: boolean; locationEnabled: boolean }> {
    // Web doesn't require location permission for Tap to Pay
    return { granted: true, precise: false, canAskAgain: true, locationEnabled: true }
  }

  async openLocationSettings(): Promise<{ opened: boolean }> {
    // Web doesn't have location settings
    return { opened: false }
  }

  async requestConnectionToken(): Promise<{ secret: string }> {
    throw this.unavailable('Stripe Terminal is not supported on web')
  }

  async supplyConnectionToken(_params: { requestId: string; secret: string }): Promise<void> {
    throw this.unavailable('Stripe Terminal is not supported on web')
  }

  async supplyConnectionTokenError(_params: { requestId: string; message: string }): Promise<void> {
    throw this.unavailable('Stripe Terminal is not supported on web')
  }

  async connectTapToPay(_options?: ConnectOptions): Promise<{ status: TerminalStatus }> {
    throw this.unavailable('Stripe Terminal is not supported on web')
  }

  async createTerminalPayment(_options: CreateTerminalPaymentOptions): Promise<{ paymentIntentId: string; clientSecret: string; localPaymentId: string }> {
    throw this.unavailable('Stripe Terminal is not supported on web')
  }

  async collectPayment(_options: CollectPaymentOptions): Promise<TerminalPaymentResult> {
    throw this.unavailable('Stripe Terminal is not supported on web')
  }

  async cancel(): Promise<{ status: TerminalStatus }> {
    throw this.unavailable('Stripe Terminal is not supported on web')
  }

  async disconnect(): Promise<{ status: TerminalStatus }> {
    throw this.unavailable('Stripe Terminal is not supported on web')
  }

  async teardown(): Promise<{ status: TerminalStatus }> {
    this.status = 'not_initialized'
    return { status: this.status }
  }

  async isTapToPayAccountLinked(_options?: IsTapToPayAccountLinkedOptions): Promise<{ isLinked: boolean }> {
    throw this.unavailable('Stripe Terminal is not supported on web')
  }

  async presentMerchantEducation(): Promise<{
    presented: boolean
    method: 'native_ios18' | 'fallback'
    reason?: string
    requiredVersion?: string
    completionStatus?: 'presented_awaiting_confirmation' | 'completed' | 'dismissed' | 'failed'
    requiresConfirmation?: boolean
  }> {
    return {
      presented: false,
      method: 'fallback',
      reason: 'platform_not_ios',
      requiresConfirmation: false
    }
  }

  async addListener(
    _eventName: string,
    _listenerFunc: (data: any) => void,
  ): Promise<{ remove: () => Promise<void> }> {
    // Web doesn't support native events, return no-op remover
    return { remove: async () => {} }
  }

  async removeAllListeners(): Promise<void> {
    // Web doesn't support native events, no-op
  }
}
