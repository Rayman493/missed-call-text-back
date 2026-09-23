import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildDocumentPresentation } from '@/lib/billing/document-builder'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/document/[token]
 * Public endpoint: fetch a billing document by its public token.
 * No authentication required. Only returns the document matching the token.
 *
 * Uses the service role key because RLS blocks anon reads of billing_documents.
 * The route only exposes data for the specific token and only for post-send
 * statuses, so this is safe — the service role key never reaches the client.
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
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

    // Public visibility: only expose external-appropriate states.
    // A Draft with a prepared token (e.g. token persisted before SMS)
    // must NOT be publicly visible. Only documents that have been
    // sent (or have transitioned to a post-send state) are accessible.
    // This enforces the invariant: a prepared token does not make a
    // Draft publicly visible.
    const PUBLICLY_VISIBLE_STATUSES = ['sent', 'accepted', 'declined', 'overdue', 'paid', 'expired', 'viewed']
    if (!PUBLICLY_VISIBLE_STATUSES.includes(doc.status)) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const presentation = await buildDocumentPresentation(supabase, doc)

    // For invoices, include payment URL if linked
    let paymentUrl: string | null = null
    if (doc.document_type === 'invoice' && doc.payment_request_id) {
      const { data: paymentRequest } = await supabase
        .from('payment_requests')
        .select('checkout_url, status, stripe_connect_account_id')
        .eq('id', doc.payment_request_id)
        .maybeSingle()
      if (paymentRequest?.checkout_url && paymentRequest.status === 'pending' && paymentRequest.stripe_connect_account_id) {
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
