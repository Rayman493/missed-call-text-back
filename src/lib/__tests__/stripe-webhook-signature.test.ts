import { describe, expect, it, vi } from 'vitest'
import {
  StripeWebhookConfigurationError,
  verifyStripeWebhookEvent,
} from '@/lib/stripe/webhook-signature'

const platformEvent = { id: 'evt_platform', type: 'invoice.paid' }
const connectedEvent = { id: 'evt_connected', type: 'checkout.session.completed', account: 'acct_connected' }

describe('Stripe webhook signature verification', () => {
  it('accepts a valid platform destination signature first', () => {
    const constructEvent = vi.fn(() => platformEvent)
    const result = verifyStripeWebhookEvent(
      { constructEvent } as any,
      '{"id":"evt_platform"}',
      'platform-signature',
      'whsec_platform',
      'whsec_connected',
    )

    expect(result).toEqual({ event: platformEvent, destination: 'platform' })
    expect(constructEvent).toHaveBeenCalledOnce()
    expect(constructEvent).toHaveBeenCalledWith('{"id":"evt_platform"}', 'platform-signature', 'whsec_platform')
  })

  it('accepts a valid connected destination signature after the platform secret rejects it', () => {
    const constructEvent = vi.fn()
      .mockImplementationOnce(() => { throw new Error('platform mismatch') })
      .mockReturnValueOnce(connectedEvent)
    const rawBody = '{"id":"evt_connected","account":"acct_connected"}'
    const result = verifyStripeWebhookEvent(
      { constructEvent } as any,
      rawBody,
      'connected-signature',
      'whsec_platform',
      'whsec_connected',
    )

    expect(result).toEqual({ event: connectedEvent, destination: 'connected' })
    expect(result.event.account).toBe('acct_connected')
    expect(constructEvent).toHaveBeenNthCalledWith(1, rawBody, 'connected-signature', 'whsec_platform')
    expect(constructEvent).toHaveBeenNthCalledWith(2, rawBody, 'connected-signature', 'whsec_connected')
  })

  it('rejects a signature that matches neither configured destination', () => {
    const constructEvent = vi.fn(() => { throw new Error('signature mismatch') })

    expect(() => verifyStripeWebhookEvent(
      { constructEvent } as any,
      'raw-body',
      'invalid-signature',
      'whsec_platform',
      'whsec_connected',
    )).toThrow('signature mismatch')
    expect(constructEvent).toHaveBeenCalledTimes(2)
  })

  it('continues accepting platform events when the connected secret is missing', () => {
    const constructEvent = vi.fn(() => platformEvent)
    const result = verifyStripeWebhookEvent(
      { constructEvent } as any,
      'raw-body',
      'platform-signature',
      'whsec_platform',
      undefined,
    )

    expect(result.destination).toBe('platform')
    expect(constructEvent).toHaveBeenCalledOnce()
  })

  it('fails closed when the required platform secret is missing', () => {
    const constructEvent = vi.fn()

    expect(() => verifyStripeWebhookEvent(
      { constructEvent } as any,
      'raw-body',
      'connected-signature',
      undefined,
      'whsec_connected',
    )).toThrow(StripeWebhookConfigurationError)
    expect(constructEvent).not.toHaveBeenCalled()
  })

  it('does not retry the same secret twice when both variables match', () => {
    const constructEvent = vi.fn(() => { throw new Error('signature mismatch') })

    expect(() => verifyStripeWebhookEvent(
      { constructEvent } as any,
      'raw-body',
      'invalid-signature',
      'whsec_same',
      'whsec_same',
    )).toThrow('signature mismatch')
    expect(constructEvent).toHaveBeenCalledOnce()
  })
})
