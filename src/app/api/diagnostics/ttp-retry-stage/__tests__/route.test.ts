import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'

describe('TTP retry diagnostic endpoint', () => {
  it('accepts a native telemetry payload and logs it', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const body = {
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      stage: 'TTP_NATIVE_ANDROID_COLLECT_ENTRY',
      paymentState: 'collecting',
      timestamp: 123456789,
      platform: 'android',
      native: {
        name: 'TTP_NATIVE_ANDROID_COLLECT_ENTRY',
        attemptId: 'attempt-1',
        phase: 'collect_payment',
        platform: 'android',
        collectingPayment: false,
        canceling: false,
        hasPaymentCancelable: false,
        hasPaymentOperationId: false,
      },
    }

    const request = new NextRequest(
      'http://localhost/api/diagnostics/ttp-retry-stage',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    )

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(logSpy).toHaveBeenCalledWith(
      '[TTP_RETRY_DIAGNOSTIC]',
      expect.objectContaining({
        stage: 'TTP_NATIVE_ANDROID_COLLECT_ENTRY',
        attemptId: 'attempt-1',
        platform: 'android',
        native: expect.objectContaining({ collectingPayment: false }),
      })
    )

    logSpy.mockRestore()
  })

  it('returns 400 for malformed JSON', async () => {
    const request = new NextRequest(
      'http://localhost/api/diagnostics/ttp-retry-stage',
      {
        method: 'POST',
        body: 'not-json',
      }
    )

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ success: false, error: 'Invalid request' })
  })
})
