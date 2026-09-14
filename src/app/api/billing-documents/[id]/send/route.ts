import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import { buildDocumentPresentation, createSnapshot, generatePublicToken } from '@/lib/billing/document-builder'
import { sendSms } from '@/lib/twilio'
import { formatPhoneNumber } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/billing-documents/[id]/send
 * Send a billing document to the customer via SMS.
 *
 * - Requires a customer with a phone number
 * - Creates snapshot of business + customer data
 * - Generates a public token for the hosted page
 * - Sets status to 'sent', sets sent_at
 * - Sends SMS with secure link
 * - Idempotent: if already sent, resends the same link
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json({ error: (authResult as any).error || 'Access denied' }, { status: (authResult as any).statusCode || 403 })
    }
    const business = authResult.business

    // Fetch document with ownership check
    const { data: doc, error: fetchError } = await supabase
      .from('billing_documents')
      .select(`
        *,
        billing_document_items (*),
        leads ( id, contact_name, caller_phone )
      `)
      .eq('id', id)
      .eq('business_id', business.id)
      .single()
    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Validate customer + phone
    if (!doc.customer_id) {
      return NextResponse.json({ error: 'A customer must be selected before sending' }, { status: 400 })
    }
    const customerPhone = doc.leads?.caller_phone
    if (!customerPhone) {
      return NextResponse.json({ error: 'Customer has no phone number. Add a phone number before sending.' }, { status: 400 })
    }

    // Idempotent: if already sent, resend the same link
    if (doc.status === 'sent' && doc.public_token) {
      const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/document/${doc.public_token}`
      const customerName = doc.leads?.contact_name || 'there'
      const isQuote = doc.document_type === 'quote'
      const totalDollars = (doc.total_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const message = `${business.name} sent you ${isQuote ? 'Quote' : 'Invoice'} ${doc.document_number} for $${totalDollars}:\n${publicUrl}`

      const smsResult = await sendSms(business, customerPhone, message, {
        lead_id: doc.customer_id,
        isManual: true,
        source: 'billing_document',
      })

      return NextResponse.json({
        success: true,
        document: doc,
        public_url: publicUrl,
        resend: true,
      })
    }

    // First send: create snapshot + generate token
    const snapshot = await createSnapshot(supabase, doc)
    const publicToken = generatePublicToken()
    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/document/${publicToken}`

    // Update document: status sent, snapshot, token, sent_at
    const { error: updateError } = await supabase
      .from('billing_documents')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        public_token: publicToken,
        ...snapshot,
      })
      .eq('id', id)
      .eq('business_id', business.id)
    if (updateError) {
      console.error('[BILLING SEND] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to send document' }, { status: 500 })
    }

    // Send SMS
    const customerName = doc.leads?.contact_name || 'there'
    const isQuote = doc.document_type === 'quote'
    const totalDollars = (doc.total_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const message = `${business.name} sent you ${isQuote ? 'Quote' : 'Invoice'} ${doc.document_number} for $${totalDollars}:\n${publicUrl}`

    const smsResult = await sendSms(business, customerPhone, message, {
      lead_id: doc.customer_id,
      isManual: true,
      source: 'billing_document',
    })

    // Fetch updated doc
    const { data: updatedDoc } = await supabase
      .from('billing_documents')
      .select(`
        *,
        billing_document_items (*),
        leads ( id, contact_name, caller_phone )
      `)
      .eq('id', id)
      .single()

    return NextResponse.json({
      success: true,
      document: updatedDoc,
      public_url: publicUrl,
    })
  } catch (err) {
    console.error('[BILLING SEND] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
