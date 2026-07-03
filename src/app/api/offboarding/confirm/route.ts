import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return new NextResponse(getInvalidTokenHtml(), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    // Log token lookup for debugging
    console.log('[Offboarding Confirm] Looking up tracking record', {
      tokenPrefix: token.substring(0, 8),
      tokenSuffix: token.substring(token.length - 8),
      tokenLength: token.length,
    })

    // Find tracking record by token
    const { data: trackingRecord, error: trackingError } = await supabaseAdmin
      .from('offboarding_tracking')
      .select('*')
      .eq('confirmation_token', token)
      .single()

    if (trackingError || !trackingRecord) {
      console.error('[Offboarding Confirm] Tracking record not found:', {
        error: trackingError,
        tokenPrefix: token.substring(0, 8),
        tokenLength: token.length,
      })
      return new NextResponse(getInvalidTokenHtml(), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    // Debug logging: log all confirmation-related fields before deciding which page to render
    console.log('[Offboarding Confirm] Tracking record fields before confirmation decision:', {
      id: trackingRecord.id,
      forwarding_confirmed: trackingRecord.forwarding_confirmed,
      forwarding_confirmed_at: trackingRecord.forwarding_confirmed_at,
      reminders_cancelled_at: trackingRecord.reminders_cancelled_at,
      confirmed_at: trackingRecord.confirmed_at,
      tokenPrefix: token.substring(0, 8),
      tokenSuffix: token.substring(token.length - 8),
      tokenLength: token.length,
      created_at: trackingRecord.created_at,
      updated_at: trackingRecord.updated_at,
    })

    // Check if already confirmed
    if (trackingRecord.forwarding_confirmed) {
      console.log('[Offboarding Confirm] Already confirmed (forwarding_confirmed=true):', trackingRecord.id)
      return new NextResponse(getAlreadyConfirmedHtml(), {
        headers: { 'Content-Type': 'text/html' },
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
      return new NextResponse(getErrorHtml('Failed to confirm forwarding'), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    console.log('[Offboarding Confirm] Forwarding confirmed:', {
      id: trackingRecord.id,
      businessPhone: trackingRecord.business_phone_number,
      businessEmail: trackingRecord.business_email,
    })

    // DO NOT delete the tracking record after confirmation - keep it for idempotency
    // This allows users to click the link multiple times without errors

    // Return HTML success page
    return new NextResponse(getSuccessHtml(), {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (error) {
    console.error('[Offboarding Confirm] Error:', error)
    return new NextResponse(getErrorHtml('Failed to confirm forwarding'), {
      headers: { 'Content-Type': 'text/html' },
    })
  }
}

function getSuccessHtml(): string {
  return `
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
}

function getAlreadyConfirmedHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Already Confirmed - ReplyFlow</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .container { text-align: center; }
    .info-icon { width: 80px; height: 80px; background: #3b82f6; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; }
    .info-icon svg { width: 40px; height: 40px; color: white; }
    h1 { color: #1e293b; margin-bottom: 16px; }
    p { color: #64748b; font-size: 18px; margin-bottom: 30px; }
    .message { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="info-icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
    <h1>Already Confirmed</h1>
    <p>You've already confirmed that you've disabled call forwarding. We've stopped all reminder emails and text messages.</p>
    <div class="footer">
      <p>Thank you for using ReplyFlow. We wish you the very best.</p>
      <p style="margin-top: 10px;">ReplyFlow Support Team</p>
    </div>
  </div>
</body>
</html>
  `
}

function getInvalidTokenHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invalid Link - ReplyFlow</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .container { text-align: center; }
    .error-icon { width: 80px; height: 80px; background: #ef4444; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; }
    .error-icon svg { width: 40px; height: 40px; color: white; }
    h1 { color: #1e293b; margin-bottom: 16px; }
    p { color: #64748b; font-size: 18px; margin-bottom: 30px; }
    .message { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
    <h1>Invalid Confirmation Link</h1>
    <p>This confirmation link is invalid or has expired. If you recently deleted your ReplyFlow account, please contact support for assistance.</p>
    <div class="footer">
      <p>ReplyFlow Support Team</p>
    </div>
  </div>
</body>
</html>
  `
}

function getErrorHtml(message: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - ReplyFlow</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .container { text-align: center; }
    .error-icon { width: 80px; height: 80px; background: #ef4444; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; }
    .error-icon svg { width: 40px; height: 40px; color: white; }
    h1 { color: #1e293b; margin-bottom: 16px; }
    p { color: #64748b; font-size: 18px; margin-bottom: 30px; }
    .message { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    </div>
    <h1>Something went wrong</h1>
    <p>${message}. Please contact support if this issue persists.</p>
    <div class="footer">
      <p>ReplyFlow Support Team</p>
    </div>
  </div>
</body>
</html>
  `
}
