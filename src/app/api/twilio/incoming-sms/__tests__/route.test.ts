import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'
import { processInboundSms } from '@/lib/sms-processing'

vi.mock('@/lib/twilio/webhook', () => ({
  requireTwilioAuth: vi.fn().mockReturnValue(true)
}))

vi.mock('@/lib/rate-limit', () => ({
  checkIncomingSmsRateLimit: vi.fn().mockResolvedValue({
    success: true,
    limit: 100,
    remaining: 99,
    reset: 0
  })
}))

vi.mock('@/lib/sms-processing', () => ({
  processInboundSms: vi.fn()
}))

function makeIncomingSmsRequest(form: Record<string, string>) {
  const body = new URLSearchParams(form).toString()
  return new Request('http://localhost/api/twilio/incoming-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
}

describe('POST /api/twilio/incoming-sms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 TwiML when the inbound message is durably persisted', async () => {
    vi.mocked(processInboundSms).mockResolvedValue({
      success: true,
      message: { id: 'msg-1', business_id: 'biz-1' },
      twiml: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    })

    const response = await POST(makeIncomingSmsRequest({
      From: '+15551234567',
      To: '+15559876543',
      Body: 'Hello',
      MessageSid: 'SM123',
      NumMedia: '0'
    }))

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toContain('<Response>')
  })

  it('returns 500 when durable persistence fails so Twilio does not treat it as success', async () => {
    vi.mocked(processInboundSms).mockResolvedValue({
      success: false,
      error: 'Failed to persist inbound message',
      twiml: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    })

    const response = await POST(makeIncomingSmsRequest({
      From: '+15551234567',
      To: '+15559876543',
      Body: 'Hello',
      MessageSid: 'SM123',
      NumMedia: '0'
    }))

    expect(response.status).toBe(500)
  })
})
