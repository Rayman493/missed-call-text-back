import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/public/document/[token]/respond
 * Public endpoint: customer accepts or declines a quote.
 *
 * Body: { action: 'accept' | 'decline' }
 *
 * - Only works for quotes
 * - Only works when status is 'sent' (or already accepted/declined for idempotency)
 * - Cancelled/expired quotes cannot be accepted
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token || token.length < 16) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    const body = await request.json()
    const action = body.action
    if (action !== 'accept' && action !== 'decline') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
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

    // Fetch by public token
    const { data: doc, error } = await supabase
      .from('billing_documents')
      .select('id, document_type, status, public_token')
      .eq('public_token', token)
      .single()
    if (error || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Only quotes can be accepted/declined
    if (doc.document_type !== 'quote') {
      return NextResponse.json({ error: 'Only quotes can be accepted or declined' }, { status: 400 })
    }

    // Idempotent: if already accepted/declined, return current status
    if (doc.status === 'accepted' || doc.status === 'declined') {
      return NextResponse.json({
        success: true,
        status: doc.status,
        idempotent: true,
      })
    }

    // Only sent quotes can be responded to
    if (doc.status !== 'sent') {
      return NextResponse.json({ error: `Cannot respond to a ${doc.status} quote` }, { status: 409 })
    }

    const newStatus = action === 'accept' ? 'accepted' : 'declined'
    const { error: updateError } = await supabase
      .from('billing_documents')
      .update({ status: newStatus })
      .eq('id', doc.id)
      .eq('public_token', token)
    if (updateError) {
      console.error('[QUOTE RESPOND] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update quote status' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      status: newStatus,
    })
  } catch (err) {
    console.error('[QUOTE RESPOND] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
