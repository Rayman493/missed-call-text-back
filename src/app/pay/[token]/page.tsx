import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import PaymentHandoff from '@/components/PaymentHandoff'

interface PayPageProps {
  params: Promise<{
    token: string
  }>
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PayPage({ params }: PayPageProps) {
  const { token } = await params

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
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

    // For Venmo, extract username from checkout_url for display
    let venmoUsername = ''
    if (paymentRequest.payment_provider === 'venmo' && paymentRequest.checkout_url) {
      try {
        const url = new URL(paymentRequest.checkout_url)
        venmoUsername = url.pathname.split('/').pop() || ''
      } catch (e) {
        // Fallback: try to extract from the URL string directly
        const match = paymentRequest.checkout_url.match(/venmo\.com\/u\/([^/?]+)/)
        if (match) {
          venmoUsername = match[1]
        }
      }
    }

    return (
      <PaymentHandoff
        provider={paymentRequest.payment_provider === 'venmo' ? 'venmo' : 'paypal'}
        businessName={businessName}
        amount={amount}
        description={paymentRequest.description}
        checkoutUrl={paymentRequest.checkout_url}
        venmoUsername={venmoUsername}
      />
    )
  }

  // Redirect to Stripe Checkout Session (fallback)
  if (paymentRequest.checkout_url) {
    console.log('[PAY TOKEN] redirect=true, reason=pending-fallback, url=', paymentRequest.checkout_url)
    redirect(paymentRequest.checkout_url)
  }

  // Fallback if no checkout URL exists
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
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
