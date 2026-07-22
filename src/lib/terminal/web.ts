import { WebPlugin } from '@capacitor/core'
import type { TerminalPlugin, InitializeOptions, ConnectOptions, CollectPaymentOptions, CreateTerminalPaymentOptions, TerminalStatus, TerminalPaymentResult } from './index'

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
