import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'

// Carrier-specific disable forwarding instructions for email
const CARRIER_DISABLE_INSTRUCTIONS: Record<string, { code: string; name: string; instructions: string }> = {
  verizon: {
    code: '*73',
    name: 'Verizon',
    instructions: 'Dial *73 from your business phone to disable call forwarding.'
  },
  att: {
    code: '##004#',
    name: 'AT&T',
    instructions: 'Dial ##004# from your business phone to disable call forwarding.'
  },
  tmobile: {
    code: '##004#',
    name: 'T-Mobile',
    instructions: 'Dial ##004# from your business phone to disable call forwarding.'
  },
  sprint: {
    code: '*720',
    name: 'Sprint',
    instructions: 'Dial *720 from your business phone to disable call forwarding.'
  },
  comcast: {
    code: '*73',
    name: 'Comcast/Xfinity',
    instructions: 'Dial *73 from your business phone to disable call forwarding.'
  },
  spectrum: {
    code: '*73',
    name: 'Spectrum',
    instructions: 'Dial *73 from your business phone to disable call forwarding.'
  },
  cox: {
    code: '*73',
    name: 'Cox',
    instructions: 'Dial *73 from your business phone to disable call forwarding.'
  },
  frontier: {
    code: '*73',
    name: 'Frontier',
    instructions: 'Dial *73 from your business phone to disable call forwarding.'
  },
  vonage: {
    code: '*73',
    name: 'Vonage',
    instructions: 'Dial *73 from your business phone to disable call forwarding.'
  },
  ooma: {
    code: '*73',
    name: 'Ooma',
    instructions: 'Dial *73 from your business phone to disable call forwarding.'
  },
  ringcentral: {
    code: '',
    name: 'RingCentral',
    instructions: 'Log into your RingCentral account, go to Settings > Phone > Call Forwarding, and disable forwarding.'
  },
  grasshopper: {
    code: '',
    name: 'Grasshopper',
    instructions: 'Log into your Grasshopper account, go to Extensions > Call Forwarding, and disable forwarding.'
  },
  nextiva: {
    code: '',
    name: 'Nextiva',
    instructions: 'Log into your Nextiva account, go to Features > Call Forwarding, and disable forwarding.'
  },
  '8x8': {
    code: '',
    name: '8x8',
    instructions: 'Log into your 8x8 account, go to Account Manager > Call Forwarding, and disable forwarding.'
  },
  google_voice: {
    code: '',
    name: 'Google Voice',
    instructions: 'In Google Voice settings, go to Calls > Call Forwarding and disable forwarding to your ReplyFlow number.'
  },
  other: {
    code: '',
    name: 'your carrier',
    instructions: 'Contact your phone carrier or check your phone settings to disable no-answer/busy call forwarding.'
  }
}

export async function POST(request: NextRequest) {
  try {
    const { businessId, userEmail, carrier } = await request.json()

    if (!businessId || !userEmail) {
      return NextResponse.json(
        { error: 'Business ID and user email are required' },
        { status: 400 }
      )
    }

    // Get carrier instructions
    const carrierKey = carrier || 'other'
    const carrierInfo = CARRIER_DISABLE_INSTRUCTIONS[carrierKey] || CARRIER_DISABLE_INSTRUCTIONS.other

    // Build email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ReplyFlow Cancellation - Important: Disable Call Forwarding</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1e293b; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
    .warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .warning h3 { color: #b45309; margin-top: 0; }
    .code-box { background: #1e293b; color: #22d3ee; padding: 20px; border-radius: 8px; text-align: center; font-family: monospace; font-size: 24px; font-weight: bold; margin: 20px 0; }
    .instructions { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0; }
    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .help-section { background: #eff6ff; padding: 20px; border-radius: 8px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>👋 Your ReplyFlow subscription has ended</h1>
    <p>We're sorry to see you go!</p>
  </div>
  
  <div class="content">
    <div class="warning">
      <h3>⚠️ Important Action Required</h3>
      <p><strong>Your business phone may still be forwarding missed calls to ReplyFlow.</strong></p>
      <p>To ensure your missed calls go to your own voicemail (not ReplyFlow), please disable call forwarding from your business phone.</p>
    </div>

    <div class="instructions">
      <h3>How to Disable Call Forwarding (${carrierInfo.name})</h3>
      ${carrierInfo.code ? `
      <div class="code-box">${carrierInfo.code}</div>
      <p style="text-align: center; font-weight: 600;">Dial this code from your business phone</p>
      ` : ''}
      <p><strong>Instructions:</strong> ${carrierInfo.instructions}</p>
    </div>

    <div class="help-section">
      <h3>Need Help?</h3>
      <p>If you have trouble disabling call forwarding:</p>
      <ul>
        <li>Contact your phone carrier directly</li>
        <li>Reply to this email for assistance</li>
        <li>Visit your <a href="https://replyflowhq.com/dashboard/settings">ReplyFlow settings page</a> for more instructions</li>
      </ul>
    </div>

    <div class="footer">
      <p>Thank you for trying ReplyFlow. We hope to serve you again in the future!</p>
      <p style="margin-top: 10px;">
        <strong>ReplyFlow Support Team</strong><br>
        <a href="mailto:support@replyflowhq.com">support@replyflowhq.com</a>
      </p>
    </div>
  </div>
</body>
</html>
    `

    // Send email using Supabase's built-in email service or external service
    // For now, we'll log the email content (in production, integrate with SendGrid, Postmark, etc.)
    console.log('[Offboarding Email] Would send email to:', userEmail)
    console.log('[Offboarding Email] Business ID:', businessId)
    console.log('[Offboarding Email] Carrier:', carrierInfo.name)
    
    // You can integrate with your email provider here
    // Example with SendGrid:
    // await sendgrid.send({ to: userEmail, subject: 'Important: Disable Call Forwarding - ReplyFlow Cancellation', html: emailHtml })

    return NextResponse.json({ 
      success: true, 
      message: 'Offboarding email prepared successfully',
      emailPreview: {
        to: userEmail,
        subject: 'Important: Disable Call Forwarding - ReplyFlow Cancellation',
        carrier: carrierInfo.name,
        hasDisableCode: !!carrierInfo.code
      }
    })

  } catch (error) {
    console.error('[Offboarding Email] Error:', error)
    return NextResponse.json(
      { error: 'Failed to send offboarding email' },
      { status: 500 }
    )
  }
}
