import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

interface PayPageProps {
  params: {
    token: string
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PayPage({ params }: PayPageProps) {
  const { token } = params

  // Create Supabase client with service role key for public access
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Look up payment request by token with business name
  const { data: paymentRequest, error } = await supabase
    .from('payment_requests')
    .select('id, status, checkout_url, expires_at, amount_cents, description, payment_provider, cancelled_at, businesses!inner(name)')
    .eq('token', token)
    .single()

  console.log('[PAY TOKEN] ============================================')
  console.log('[PAY TOKEN] Token:', token)
  console.log('[PAY TOKEN] Payment ID:', paymentRequest?.id)
  console.log('[PAY TOKEN] Status:', paymentRequest?.status)
  console.log('[PAY TOKEN] Provider:', paymentRequest?.payment_provider)
  console.log('[PAY TOKEN] Checkout URL:', paymentRequest?.checkout_url)
  console.log('[PAY TOKEN] Cancelled At:', paymentRequest?.cancelled_at)
  console.log('[PAY TOKEN] Expires At:', paymentRequest?.expires_at)
  console.log('[PAY TOKEN] Query Error:', error)
  console.log('[PAY TOKEN] ============================================')

  if (error || !paymentRequest) {
    console.log('[PAY TOKEN] redirect=false, reason=missing')
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Link Not Found</h1>
          <p className="text-gray-600 mb-6">
            This payment link does not exist or has expired. Please contact the business for assistance.
          </p>
        </div>
      </div>
    )
  }

  // Check if payment has expired
  if (paymentRequest.expires_at && new Date(paymentRequest.expires_at) < new Date()) {
    console.log('[PAY TOKEN] redirect=false, reason=expired')
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-yellow-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Link Expired</h1>
          <p className="text-gray-600 mb-6">
            This payment link has expired. Please contact the business to request a new payment link.
          </p>
        </div>
      </div>
    )
  }

  // Check if payment is already paid
  if (paymentRequest.status === 'paid') {
    console.log('[PAY TOKEN] redirect=false, reason=paid')
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-green-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Already Completed</h1>
          <p className="text-gray-600 mb-6">
            This payment has already been completed. Thank you for your payment!
          </p>
          <p className="text-sm text-gray-500">
            If you have any questions, please reply to the original message or contact the business directly.
          </p>
        </div>
      </div>
    )
  }

  // Check if payment is cancelled (defensive: handle both spellings)
  if (paymentRequest.status === 'cancelled' || paymentRequest.status === 'canceled') {
    console.log('[PAY TOKEN] redirect=false, reason=cancelled, status=', paymentRequest.status)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Request Canceled</h1>
          <p className="text-gray-600 mb-6">
            This payment request has been canceled by the business. Please contact the business for assistance.
          </p>
        </div>
      </div>
    )
  }

  // For Stripe, redirect directly to checkout
  if (paymentRequest.payment_provider === 'stripe' && paymentRequest.checkout_url) {
    console.log('[PAY TOKEN] redirect=true, reason=stripe-pending, url=', paymentRequest.checkout_url)
    redirect(paymentRequest.checkout_url)
  }

  // For Venmo/PayPal, show payment handoff page
  if (paymentRequest.payment_provider === 'venmo' || paymentRequest.payment_provider === 'paypal') {
    console.log('[PAY TOKEN] redirect=false, reason=handoff-page, provider=', paymentRequest.payment_provider)
    const amount = (paymentRequest.amount_cents / 100).toFixed(2)
    const businessName = (paymentRequest as any).businesses?.name || 'the business'
    const providerName = paymentRequest.payment_provider === 'venmo' ? 'Venmo' : 'PayPal'
    const providerColor = paymentRequest.payment_provider === 'venmo' ? 'bg-blue-500' : 'bg-blue-600'

    // Generate app-friendly deep link for Venmo
    let appLink = paymentRequest.checkout_url
    if (paymentRequest.payment_provider === 'venmo' && paymentRequest.checkout_url) {
      // Venmo app deep link: venmo://paycharge?recipients=username&amount=1.00&note=description
      try {
        const url = new URL(paymentRequest.checkout_url)
        const username = url.pathname.split('/').pop()
        if (username) {
          const note = paymentRequest.description || ''
          appLink = `venmo://paycharge?recipients=${username}&amount=${amount}&note=${encodeURIComponent(note)}`
        }
      } catch (e) {
        // Fallback to web URL if parsing fails
        appLink = paymentRequest.checkout_url
      }
    }

    // For PayPal, use the checkout_url as-is (PayPal.Me format)
    if (paymentRequest.payment_provider === 'paypal') {
      appLink = paymentRequest.checkout_url
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-6">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${providerColor} mb-4`}>
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                {paymentRequest.payment_provider === 'venmo' ? (
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                ) : (
                  <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z" />
                )}
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Request</h1>
            <p className="text-gray-600">
              {businessName} is requesting a payment via {providerName}
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">Amount</span>
              <span className="text-2xl font-bold text-gray-900">${amount}</span>
            </div>
            {paymentRequest.description && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">Description:</span> {paymentRequest.description}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <a
              href={appLink}
              className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Open in {providerName}
            </a>
            <a
              href={paymentRequest.checkout_url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center text-blue-600 hover:text-blue-700 font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Continue in browser
            </a>
          </div>

          <p className="text-xs text-gray-500 text-center mt-6">
            By clicking above, you'll be redirected to {providerName} to complete your payment securely.
          </p>
        </div>
      </div>
    )
  }

  // Redirect to Stripe Checkout Session (fallback)
  if (paymentRequest.checkout_url) {
    console.log('[PAY TOKEN] redirect=true, reason=pending-fallback, url=', paymentRequest.checkout_url)
    redirect(paymentRequest.checkout_url)
  }

  // Fallback if no checkout URL exists
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <div className="text-red-500 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Link Error</h1>
        <p className="text-gray-600 mb-6">
          This payment link is not available. Please contact the business for assistance.
        </p>
      </div>
    </div>
  )
}
