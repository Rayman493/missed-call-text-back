import { registerPlugin, Capacitor } from '@capacitor/core'

export type InitializeOptions = {
  environment?: 'test' | 'live'
}

export type ConnectTapToPayOptions = {
  simulated?: boolean
  locationId?: string
}

export type IsTapToPayAccountLinkedOptions = {
  onBehalfOf?: string
}

export type ConnectOptions = {
  // For Tap to Pay mobile reader
  // Additional options can be added in Phase 3
}

export type CollectPaymentOptions = {
  paymentIntentId: string
  clientSecret: string
  terminalAttemptId?: string // For correlation and diagnostics
}

export type CreateTerminalPaymentOptions = {
  amountCents: number
  currency?: string
  leadId?: string
  jobId?: string
  description?: string
  terminalAttemptId?: string // Durable attempt ID for idempotency
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

export interface TerminalError {
  code: string
  message: string
  stage: string
  nativeCode?: string
  localizedMessage?: string
  timestamp: number
  deviceState?: DeviceState
}

export interface DeviceState {
  buildMarker: string
  isDebuggable: boolean
  androidSdk: number
  manufacturer: string
  model: string
  nfcAvailable: boolean
  nfcEnabled: boolean
  terminalInitialized: boolean
  connectionStatus: string
  readerConnected: boolean
  operationState?: string
}

export interface ConnectionToken {
  secret: string
}

export interface TerminalPlugin {
  ping(): Promise<{ available: boolean; platform: string; buildMarker?: string }>
  initialize(options?: InitializeOptions): Promise<{ status: TerminalStatus }>
  isSupported(): Promise<{ supported: boolean; platform: 'ios' | 'android' | 'web'; unsupportedReason?: string }>
  checkLocationPermission(): Promise<{ granted: boolean; precise: boolean; canAskAgain: boolean; locationEnabled: boolean }>
  requestLocationPermission(): Promise<{ granted: boolean; precise: boolean; canAskAgain: boolean; locationEnabled: boolean }>
  openLocationSettings(): Promise<{ opened: boolean }>
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
  isTapToPayAccountLinked(options?: IsTapToPayAccountLinkedOptions): Promise<{ isLinked: boolean }>
  addListener(
    eventName: 'statusChanged' | 'paymentSucceeded' | 'paymentFailed' | 'error' | 'connectionTokenRequested' | 'readerConnected' | 'paymentStatusChanged' | 'locationPermissionResult',
    listenerFunc: (data: any) => void,
  ): Promise<{ remove: () => void }>
  removeAllListeners(): Promise<void>
}

const ReplyflowStripeTerminal = registerPlugin<TerminalPlugin>('ReplyflowStripeTerminal', {
  web: () => import('./web').then(m => new m.TerminalWeb()),
})

export function isNativeCapacitor(): boolean {
  const isNative = Capacitor.isNativePlatform()
  const platform = Capacitor.getPlatform()

  // Development logging for platform detection diagnostics
  console.log('[TTP NATIVE] Platform detection:', {
    isNativePlatform: isNative,
    getPlatform: platform,
    isWeb: platform === 'web',
    isIOS: platform === 'ios',
    isAndroid: platform === 'android',
    pluginAvailable: Capacitor.isPluginAvailable('ReplyflowStripeTerminal'),
    finalResult: isNative || platform === 'ios' || platform === 'android',
  })

  // Robust check: consider native if isNativePlatform is true OR platform is ios/android
  // This handles edge cases where isNativePlatform might return false in TestFlight
  // but getPlatform correctly identifies the platform
  return isNative || platform === 'ios' || platform === 'android'
}

export default ReplyflowStripeTerminal
