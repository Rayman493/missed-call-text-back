import { NextRequest, NextResponse } from 'next/server'

// Simple diagnostic endpoint for TTP retry stages
// Only receives non-sensitive stage information
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      sessionId,
      attemptId,
      stage,
      paymentState,
      timestamp,
      platform,
      // Guards
      isPaymentInProgress,
      isNativeSupported,
      currentPaymentIntentId,
      currentAttemptId,
      lastAttemptOutcome,
      connectionStatus,
      paymentStatus,
      // Flags
      paymentIntentCreated,
      paymentMethodCollected,
      paymentConfirmed,
      reconciled,
    } = body

    // Log to server for analysis (this is non-sensitive data)
    console.log('[TTP_RETRY_DIAGNOSTIC]', {
      sessionId,
      attemptId,
      stage,
      paymentState,
      timestamp,
      platform,
      guards: {
        isPaymentInProgress,
        isNativeSupported,
        hasPaymentIntentId: !!currentPaymentIntentId,
        hasAttemptId: !!currentAttemptId,
        lastAttemptOutcome,
        connectionStatus,
        paymentStatus,
      },
      flags: {
        paymentIntentCreated,
        paymentMethodCollected,
        paymentConfirmed,
        reconciled,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[TTP_RETRY_DIAGNOSTIC] Error:', error)
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
  }
}