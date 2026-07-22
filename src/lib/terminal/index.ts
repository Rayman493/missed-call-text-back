import { registerPlugin, Capacitor } from '@capacitor/core'

export type InitializeOptions = {
  environment?: 'test' | 'live'
}

export type ConnectOptions = {
  // For Tap to Pay mobile reader
  // Additional options can be added in Phase 3
}

export type CollectPaymentOptions = {
  paymentIntentId: string
}

export type TerminalStatus =
  | 'not_initialized'
  | 'initializing'
  | 'ready'
  | 'connecting'
  | 'connected'
  | 'collecting'
  | 'completed'
  | 'canceled'
  | 'error'

export interface TerminalPaymentResult {
  status: 'succeeded' | 'failed' | 'canceled'
  paymentIntentId?: string
  error?: { code?: string; message: string }
}

export interface ConnectionToken {
  secret: string
}

export interface TerminalPlugin {
  initialize(options?: InitializeOptions): Promise<{ status: TerminalStatus }>
  isSupported(): Promise<{ supported: boolean; platform: 'ios' | 'android' | 'web' }>
  // Native will request a connection token via this callback when needed
  // JS should supply a token by resolving the returned promise
  requestConnectionToken(): Promise<ConnectionToken>
  connectTapToPay(options?: ConnectOptions): Promise<{ status: TerminalStatus }>
  collectPayment(options: CollectPaymentOptions): Promise<TerminalPaymentResult>
  cancel(): Promise<{ status: TerminalStatus }>
  disconnect(): Promise<{ status: TerminalStatus }>
  teardown(): Promise<{ status: TerminalStatus }>
  addListener(
    eventName: 'statusChanged' | 'paymentSucceeded' | 'paymentFailed' | 'error',
    listenerFunc: (data: any) => void,
  ): Promise<{ remove: () => void }>
  removeAllListeners(): Promise<void>
}

const ReplyflowStripeTerminal = registerPlugin<TerminalPlugin>('ReplyflowStripeTerminal', {
  web: () => import('./web').then(m => new m.TerminalWeb()),
})

export function isNativeCapacitor(): boolean {
  return Capacitor.isNativePlatform()
}

export default ReplyflowStripeTerminal
