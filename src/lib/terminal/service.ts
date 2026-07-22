import Terminal, { TerminalPlugin, InitializeOptions, CollectPaymentOptions, isNativeCapacitor } from './index'

export class TerminalBridgeService {
  private plugin: TerminalPlugin | null

  constructor() {
    this.plugin = isNativeCapacitor() ? Terminal : null
  }

  async isSupported() {
    if (!this.plugin) return { supported: false, platform: 'web' as const }
    return this.plugin.isSupported()
  }

  async initialize(options?: InitializeOptions) {
    if (!this.plugin) return { status: 'not_initialized' as const }
    return this.plugin.initialize(options)
  }

  async connectTapToPay() {
    if (!this.plugin) throw new Error('Stripe Terminal is not available on web')
    return this.plugin.connectTapToPay({})
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
    return this.plugin.teardown()
  }
}

export const terminalBridge = new TerminalBridgeService()
