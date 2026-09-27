import Stripe from 'stripe'
import { getReplyFlowEnv } from './runtime-env'

let stripeInstance: Stripe | null = null

export default function getStripe() {
  if (!stripeInstance) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY
    const env = getReplyFlowEnv()

    if (!stripeSecretKey) {
      console.error('[Stripe] STRIPE_SECRET_KEY environment variable is not set')
      return null
    }

    if (env === 'qa') {
      // QA must never touch live Stripe. Live keys are a loud config error;
      // anything that is not an explicit test-mode key fails closed.
      if (/^(sk|rk)_live_/.test(stripeSecretKey)) {
        console.error('[Stripe] Live Stripe secret key configured while REPLYFLOW_ENV=qa — refusing')
        throw new Error('REPLYFLOW_ENV=qa forbids live Stripe secret keys')
      }
      if (!/^(sk|rk)_test_/.test(stripeSecretKey)) {
        console.error('[Stripe] STRIPE_SECRET_KEY is not a test-mode key (sk_test_/rk_test_ required in qa)')
        return null
      }
    } else {
      if (!stripeSecretKey.startsWith('sk_')) {
        console.error('[Stripe] STRIPE_SECRET_KEY does not appear to be a valid Stripe secret key')
        return null
      }

      // Validate production mode: ensure sk_live_ in production builds
      const isDev = process.env.NODE_ENV === 'development'
      if (!isDev && !stripeSecretKey.startsWith('sk_live_')) {
        console.error('[Stripe] Production build requires live Stripe secret key (sk_live_)')
        throw new Error('Production build requires live Stripe secret key (sk_live_)')
      }
    }

    try {
      stripeInstance = new Stripe(stripeSecretKey)
      console.log('[Stripe] Successfully initialized Stripe client')
      console.log('[Stripe] Mode:', stripeSecretKey.startsWith('sk_live_') ? 'live' : 'test')
    } catch (error) {
      console.error('[Stripe] Failed to initialize Stripe client:', error)
      return null
    }
  }
  return stripeInstance
}
