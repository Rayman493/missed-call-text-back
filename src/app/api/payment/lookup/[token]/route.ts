import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * Server-only payment request lookup endpoint
 * 
 * This endpoint uses the service role key to bypass RLS and look up
 * payment requests by their public token. This is necessary because:
 * 1. Payment links are public (no authentication)
 * 2. RLS policies require authentication for payment_requests table
 * 3. The service role key is never exposed to the client
 * 
 * Security considerations:
 * - Only allows SELECT operations (no INSERT/UPDATE/DELETE)
 * - Returns only necessary fields (excludes sensitive business data)
 * - Token is cryptographically random (32 hex chars = 128 bits)
 * - Token has unique constraint preventing enumeration
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Validate token format (32 hex characters)
  if (!token || !/^[a-f0-9]{32}$/.test(token)) {
    return NextResponse.json(
      { error: 'Invalid token format' },
      { status: 400 }
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[PAYMENT LOOKUP] Missing Supabase configuration')
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    )
  }

  // Create Supabase client with service role key (server-only)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Look up payment request by token with only necessary fields
  const { data: paymentRequest, error } = await supabase
    .from('payment_requests')
    .select('id, status, checkout_url, expires_at, amount_cents, description, payment_provider, cancelled_at, businesses!inner(name)')
    .eq('token', token)
    .single()

  if (error) {
    console.error('[PAYMENT LOOKUP] Database error:', error)
    return NextResponse.json(
      { error: 'Payment request not found' },
      { status: 404 }
    )
  }

  if (!paymentRequest) {
    return NextResponse.json(
      { error: 'Payment request not found' },
      { status: 404 }
    )
  }

  // Return payment request data
  return NextResponse.json(paymentRequest)
}
