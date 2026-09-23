import type Stripe from 'stripe'

interface StripeWebhookVerifier {
  constructEvent(payload: string | Buffer, signature: string, secret: string): Stripe.Event
}

export class StripeWebhookConfigurationError extends Error {}

export function verifyStripeWebhookEvent(
  webhooks: StripeWebhookVerifier,
  body: string | Buffer,
  signature: string,
  platformSecret: string | undefined,
  connectedSecret: string | undefined,
): { event: Stripe.Event; destination: 'platform' | 'connected' } {
  if (!platformSecret) {
    throw new StripeWebhookConfigurationError('Platform webhook secret not configured')
  }

  try {
    return {
      event: webhooks.constructEvent(body, signature, platformSecret),
      destination: 'platform',
    }
  } catch (platformError) {
    if (!connectedSecret || connectedSecret === platformSecret) throw platformError
    return {
      event: webhooks.constructEvent(body, signature, connectedSecret),
      destination: 'connected',
    }
  }
}
