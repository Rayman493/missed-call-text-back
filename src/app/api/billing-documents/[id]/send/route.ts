import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import { createSnapshot, generatePublicToken } from '@/lib/billing/document-builder'
import { prepareInvoicePayment } from '@/lib/billing/prepare-payment'
import { sendSms } from '@/lib/twilio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/billing-documents/[id]/send
 * Send a billing document to the customer via SMS.
 *
 * Token lifecycle (durable before SMS):
 *   A. Generate or reuse public_token
 *   B. Persist token + snapshot data while document is still Draft
 *   C. Build hosted URL from the persisted token
 *   D. Send SMS with that URL
 *   E. Only after confirmed SMS success: status = sent, sent_at = timestamp
 *
 * If SMS fails:
 *   - Document remains Draft
 *   - Token stays persisted (so the link is already resolvable)
 *   - Retry reuses the same token (no duplicate token, no duplicate SMS)
 *
 * If the final status update fails after SMS success:
 *   - The link is already resolvable (token was persisted in step B)
 *   - The customer received the link
 *   - Retry reuses the same token and re-sends (idempotent resend path)
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
    const guardBusiness = authResult.business

    // Fetch the FULL business row with canonical Twilio messaging fields.
    // The subscription guard only selects subscription-related columns;
    // sendSms requires twilio_phone_number, twilio_phone_number_sid,
    // and twilio_messaging_service_sid.
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select(`
        id,
        name,
        twilio_phone_number,
        twilio_phone_number_sid,
        twilio_messaging_service_sid,
        provisioning_status
      `)
      .eq('id', guardBusiness.id)
      .single()
    if (businessError || !business) {
      console.error('[BILLING SEND] Business lookup error:', businessError)
      return NextResponse.json({ error: 'Business not found' }, { status: 500 })
    }

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

    const isQuote = doc.document_type === 'quote'
    const totalDollars = (doc.total_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    // ── Token invariant: persist BEFORE sending SMS ──────────────────
    // The public hosted link must be resolvable BEFORE the SMS goes out.
    // If the customer opens the link between SMS delivery and a later DB
    // write, the token must already be in the database.
    //
    // Reuse an existing token if one was prepared on a previous attempt;
    // otherwise generate a new one and persist it (with snapshot) while
    // the document is still in Draft status.
    let publicToken = doc.public_token
    let snapshot: Record<string, any> | null = null

    if (!publicToken) {
      // First-time send: generate token + snapshot and persist them NOW.
      publicToken = generatePublicToken()
      snapshot = await createSnapshot(supabase, doc)

      const { error: persistError } = await supabase
        .from('billing_documents')
        .update({
          public_token: publicToken,
          ...snapshot,
        })
        .eq('id', id)
        .eq('business_id', business.id)
      if (persistError) {
        console.error('[BILLING SEND] Token persist error:', persistError)
        return NextResponse.json({
          error: 'Failed to prepare document for sending',
        }, { status: 500 })
      }
    }

    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/document/${publicToken}`
    const message = `${business.name} sent you ${isQuote ? 'Quote' : 'Invoice'} ${doc.document_number} for $${totalDollars}:\n${publicUrl}`

    // ── For invoices: prepare payment BEFORE sending SMS ────────────
    // A customer receiving an invoice SMS must be able to pay immediately.
    // If payment preparation fails, do NOT send the SMS — an invoice link
    // that cannot be paid is worse than no link at all.
    if (!isQuote) {
      const payResult = await prepareInvoicePayment(supabase, business.id, {
        id: doc.id,
        document_number: doc.document_number,
        total_cents: doc.total_cents,
        customer_id: doc.customer_id,
        status: doc.status,
        payment_request_id: doc.payment_request_id,
      }, user.id)
      if (!payResult.ok) {
        console.error('[BILLING SEND] Payment preparation failed:', payResult.error)
        return NextResponse.json({
          error: `Failed to prepare payment: ${payResult.error || 'unknown error'}`,
        }, { status: payResult.status || 500 })
      }
      // Payment is ready (or already paid). Refresh doc so the persisted
      // payment_request_id is available for the response.
      if (!payResult.alreadyPaid) {
        console.log('[BILLING SEND] Payment prepared for invoice', doc.document_number, '— session:', payResult.idempotent ? 'reused' : 'created')
      }
    }

    // ── Send SMS ──────────────────────────────────────────────────────
    const smsResult = await sendSms(business, customerPhone, message, {
      lead_id: doc.customer_id,
      isManual: true,
      source: 'billing_document',
    })

    // Check SMS failure BEFORE marking document as sent
    if (smsResult.reason === 'NO_TWILIO_NUMBER') {
      console.error('[BILLING SEND] SMS failed: NO_TWILIO_NUMBER', { business_id: business.id })
      return NextResponse.json({
        error: "ReplyFlow couldn't send this document because your business phone number isn't ready.",
      }, { status: 503 })
    }
    if (smsResult.reason === 'NUMBER_NOT_READY') {
      console.error('[BILLING SEND] SMS failed: NUMBER_NOT_READY', { business_id: business.id })
      return NextResponse.json({
        error: "ReplyFlow couldn't send this document because your business phone number isn't ready.",
      }, { status: 503 })
    }
    if (!smsResult.sid && smsResult.reason) {
      console.error('[BILLING SEND] SMS failed:', smsResult.reason)
      return NextResponse.json({
        error: `Failed to send SMS: ${smsResult.reason}`,
      }, { status: 502 })
    }

    // ── SMS succeeded — NOW mark the document as sent ────────────────
    // The token was already persisted above, so even if this update fails
    // the hosted link remains resolvable. On retry, the resend path
    // reuses the same token (no duplicate SMS from this path; the resend
    // path below handles already-sent documents).
    const updatePayload: Record<string, any> = {
      status: 'sent',
      sent_at: new Date().toISOString(),
    }
    // Only write the snapshot once (first send); on a retry after a
    // failed status update, the snapshot is already persisted.
    if (snapshot) {
      Object.assign(updatePayload, snapshot)
    }

    const { error: updateError } = await supabase
      .from('billing_documents')
      .update(updatePayload)
      .eq('id', id)
      .eq('business_id', business.id)
    if (updateError) {
      console.error('[BILLING SEND] Update error after SMS success:', updateError)
      // SMS was sent and the token was already persisted, so the hosted
      // link is resolvable. The document is still Draft in DB, but the
      // customer received a working link. Return success with a warning;
      // a retry will hit the resend path (status === 'sent' check is
      // false, but public_token is set, so the token is reused).
      return NextResponse.json({
        success: true,
        document: doc,
        public_url: publicUrl,
        warning: 'SMS sent but document status update failed',
      })
    }

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
