import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Confirmation token is required' },
        { status: 400 }
      )
    }

    // Find tracking record by token
    const { data: trackingRecord, error: trackingError } = await supabaseAdmin
      .from('offboarding_tracking')
      .select('*')
      .eq('confirmation_token', token)
      .single()

    if (trackingError || !trackingRecord) {
      console.error('[Offboarding Confirm] Tracking record not found:', trackingError)
      return NextResponse.json(
        { error: 'Invalid confirmation token' },
        { status: 404 }
      )
    }

    // Check if already confirmed
    if (trackingRecord.forwarding_confirmed) {
      console.log('[Offboarding Confirm] Already confirmed:', trackingRecord.id)
      return NextResponse.json({
        success: true,
        message: 'Call forwarding already confirmed',
        alreadyConfirmed: true,
      })
    }

    // Mark as confirmed
    const { error: updateError } = await supabaseAdmin
      .from('offboarding_tracking')
      .update({
        forwarding_confirmed: true,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', trackingRecord.id)

    if (updateError) {
      console.error('[Offboarding Confirm] Failed to update tracking record:', updateError)
      return NextResponse.json(
        { error: 'Failed to confirm forwarding', details: updateError.message },
        { status: 500 }
      )
    }

    console.log('[Offboarding Confirm] Forwarding confirmed:', {
      id: trackingRecord.id,
      businessPhone: trackingRecord.business_phone_number,
      businessEmail: trackingRecord.business_email,
    })

    // Delete the tracking record after successful confirmation (as per requirements)
    await supabaseAdmin
      .from('offboarding_tracking')
      .delete()
      .eq('id', trackingRecord.id)

    console.log('[Offboarding Confirm] Deleted tracking record after confirmation:', trackingRecord.id)

    // Return HTML success page
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're all set - ReplyFlow</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .container { text-align: center; }
    .success-icon { width: 80px; height: 80px; background: #10b981; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; }
    .success-icon svg { width: 40px; height: 40px; color: white; }
    h1 { color: #1e293b; margin-bottom: 16px; }
    p { color: #64748b; font-size: 18px; margin-bottom: 30px; }
    .message { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <h1>You're all set</h1>
    <p>Thanks for confirming. We'll stop all future reminder emails and text messages. Your ReplyFlow offboarding is complete.</p>
    <div class="footer">
      <p>Thank you for using ReplyFlow. We wish you the very best.</p>
      <p style="margin-top: 10px;">ReplyFlow Support Team</p>
    </div>
  </div>
</body>
</html>
    `

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (error) {
    console.error('[Offboarding Confirm] Error:', error)
    return NextResponse.json(
      { error: 'Failed to confirm forwarding', details: String(error) },
      { status: 500 }
    )
  }
}
