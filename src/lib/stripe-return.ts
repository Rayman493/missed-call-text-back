/**
 * Stripe return detection helpers.
 *
 * After Stripe Checkout or the Billing Portal redirects back to ReplyFlow,
 * the dashboard may briefly flash onboarding/setup while the business state
 * rehydrates. These helpers let guards show a neutral loading state until
 * the final resolved state is known.
 */

const STRIPE_RETURN_PARAMS = ['checkout', 'session_id', 'billing_return', 'setup', 'billing', 'stripe_onboarding']
const STRIPE_RETURN_PATHS = ['/dashboard', '/setup/forwarding', '/billing/success']

export function isStripeReturnUrl(url: string | URL): boolean {
  const parsed = typeof url === 'string' ? new URL(url) : url
  const pathname = parsed.pathname

  const isReturnPath = STRIPE_RETURN_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
  if (!isReturnPath) return false

  const search = parsed.searchParams

  // Checkout success redirect
  if (search.get('checkout') === 'success') return true
  if (search.get('session_id')?.startsWith('cs_')) return true

  // Billing portal return (legacy and current param names)
  if (search.get('billing_return') === 'success') return true
  if (search.get('billing') === 'returned') return true

  // Setup return after checkout (triggers provisioning/onboarding gate)
  if (search.get('setup') === '1') return true

  // Stripe Connect onboarding return
  if (search.get('stripe_onboarding') === 'complete') return true

  return false
}

export function isStripeReturnPathname(pathname: string): boolean {
  return STRIPE_RETURN_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
}
