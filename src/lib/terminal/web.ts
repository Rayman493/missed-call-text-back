import { WebPlugin } from '@capacitor/core'
import type { TerminalPlugin, InitializeOptions, ConnectOptions, CollectPaymentOptions, TerminalStatus, TerminalPaymentResult } from './index'

export class TerminalWeb extends WebPlugin implements TerminalPlugin {
  private status: TerminalStatus = 'not_initialized'

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

  async connectTapToPay(_options?: ConnectOptions): Promise<{ status: TerminalStatus }> {
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
}
