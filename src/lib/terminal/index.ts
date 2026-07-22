import { registerPlugin, Capacitor } from '@capacitor/core'

export type InitializeOptions = {
  environment?: 'test' | 'live'
}

export type ConnectTapToPayOptions = {
  simulated?: boolean
  locationId?: string
}

export type ConnectOptions = {
  // For Tap to Pay mobile reader
  // Additional options can be added in Phase 3
}

export type CollectPaymentOptions = {
  paymentIntentId: string
}

export type CreateTerminalPaymentOptions = {
  amountCents: number
  currency?: string
  leadId?: string
  jobId?: string
  description?: string
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
  isSupported(): Promise<{ supported: boolean; platform: 'ios' | 'android' | 'web'; unsupportedReason?: string }>
  // Deprecated: use connectionTokenRequested event instead
  requestConnectionToken(): Promise<ConnectionToken>
  // JS supplies the token back to native after fetching from backend, keyed by requestId
  supplyConnectionToken(params: { requestId: string; secret: string }): Promise<void>
  // JS reports a failure for a specific requestId
  supplyConnectionTokenError(params: { requestId: string; message: string }): Promise<void>
  connectTapToPay(options?: ConnectTapToPayOptions): Promise<{ status: TerminalStatus }>
  createTerminalPayment(options: CreateTerminalPaymentOptions): Promise<{ paymentIntentId: string; clientSecret: string; localPaymentId: string }>
  collectPayment(options: CollectPaymentOptions): Promise<TerminalPaymentResult>
  cancel(): Promise<{ status: TerminalStatus }>
  disconnect(): Promise<{ status: TerminalStatus }>
  teardown(): Promise<{ status: TerminalStatus }>
  addListener(
    eventName: 'statusChanged' | 'paymentSucceeded' | 'paymentFailed' | 'error' | 'connectionTokenRequested' | 'readerConnected' | 'paymentStatusChanged',
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
