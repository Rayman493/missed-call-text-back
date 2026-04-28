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
    
    try {
      stripeInstance = new Stripe(stripeSecretKey)
      console.log('[Stripe] Successfully initialized Stripe client')
    } catch (error) {
      console.error('[Stripe] Failed to initialize Stripe client:', error)
      return null
    }
  }
  return stripeInstance
}
