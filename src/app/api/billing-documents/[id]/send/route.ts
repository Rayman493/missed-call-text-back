import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import { createSnapshot, generatePublicToken } from '@/lib/billing/document-builder'
import { sendSms } from '@/lib/twilio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/billing-documents/[id]/send
 * Send a billing document to the customer via SMS.
 *
 * - Requires a customer with a phone number
 * - Creates snapshot of business + customer data
 * - Generates a public token for the hosted page
 * - Sends SMS FIRST, then marks status sent on success
 * - Idempotent: if already sent, resends the same link
 * - Does NOT mark sent on SMS failure
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

    // Idempotent: if already sent, resend the same link
    if (doc.status === 'sent' && doc.public_token) {
      const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/document/${doc.public_token}`
      const isQuote = doc.document_type === 'quote'
      const totalDollars = (doc.total_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const message = `${business.name} sent you ${isQuote ? 'Quote' : 'Invoice'} ${doc.document_number} for $${totalDollars}:\n${publicUrl}`

      const smsResult = await sendSms(business, customerPhone, message, {
        lead_id: doc.customer_id,
        isManual: true,
        source: 'billing_document',
      })

      if (smsResult.reason === 'NO_TWILIO_NUMBER') {
        return NextResponse.json({
          error: "ReplyFlow couldn't send this document because your business phone number isn't ready.",
        }, { status: 503 })
      }
      if (smsResult.reason === 'NUMBER_NOT_READY') {
        return NextResponse.json({
          error: "ReplyFlow couldn't send this document because your business phone number isn't ready.",
        }, { status: 503 })
      }
      if (!smsResult.sid && smsResult.reason) {
        return NextResponse.json({
          error: `Failed to send SMS: ${smsResult.reason}`,
        }, { status: 502 })
      }

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

    // Send SMS FIRST — do NOT mark the document as sent until SMS succeeds.
    const isQuote = doc.document_type === 'quote'
    const totalDollars = (doc.total_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const message = `${business.name} sent you ${isQuote ? 'Quote' : 'Invoice'} ${doc.document_number} for $${totalDollars}:\n${publicUrl}`

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

    // SMS succeeded — NOW mark the document as sent
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
      console.error('[BILLING SEND] Update error after SMS success:', updateError)
      // SMS was sent but we failed to persist the status.
      // The customer received the link; the document is still draft in DB.
      // Return success since the SMS went through, but log the issue.
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
