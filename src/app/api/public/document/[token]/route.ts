import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { buildDocumentPresentation } from '@/lib/billing/document-builder'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/document/[token]
 * Public endpoint: fetch a billing document by its public token.
 * No authentication required. Only returns the document matching the token.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token || token.length < 16) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      }
    )

    // Fetch by public token only — no business_id filter (public route)
    const { data: doc, error } = await supabase
      .from('billing_documents')
      .select(`
        *,
        billing_document_items (*)
      `)
      .eq('public_token', token)
      .single()
    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const presentation = await buildDocumentPresentation(supabase, doc)

    // For invoices, include payment URL if linked
    let paymentUrl: string | null = null
    if (doc.document_type === 'invoice' && doc.payment_request_id) {
      const { data: paymentRequest } = await supabase
        .from('payment_requests')
        .select('checkout_url, status')
        .eq('id', doc.payment_request_id)
        .maybeSingle()
      if (paymentRequest?.checkout_url && paymentRequest.status === 'pending') {
        paymentUrl = paymentRequest.checkout_url
      }
    }

    return NextResponse.json({
      document: presentation,
      payment_url: paymentUrl,
    })
  } catch (err) {
    console.error('[PUBLIC DOCUMENT] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
