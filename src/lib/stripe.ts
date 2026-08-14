import Stripe from 'stripe'

let stripeInstance: Stripe | null = null

export default function getStripe() {
  if (!stripeInstance) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY

    if (!stripeSecretKey) {
      console.error('[Stripe] STRIPE_SECRET_KEY environment variable is not set')
      return null
    }

    if (!stripeSecretKey.startsWith('sk_')) {
      console.error('[Stripe] STRIPE_SECRET_KEY does not appear to be a valid Stripe secret key')
      return null
    }

    // Validate production mode: ensure sk_live_ in production builds
    const isDev = process.env.NODE_ENV === 'development'
    if (!isDev && !stripeSecretKey.startsWith('sk_live_')) {
      console.error('[Stripe] Production build requires live Stripe secret key (sk_live_)')
      console.error('[Stripe] Current key prefix:', stripeSecretKey.substring(0, 8))
      throw new Error('Production build requires live Stripe secret key (sk_live_)')
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
