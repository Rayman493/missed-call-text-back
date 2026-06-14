import { Resend } from 'resend'

// Initialize Resend client if API key is available
let resendClient: Resend | null = null
if (process.env.RESEND_API_KEY) {
  resendClient = new Resend(process.env.RESEND_API_KEY)
}

interface OffboardingEmailParams {
  businessName: string
  businessPhone?: string
  replyFlowNumber?: string
  userEmail: string
}

interface AccountDeletionConfirmationParams {
  userEmail: string
  businessName?: string
  twilioNumberReserved?: boolean
  twilioNumber?: string
}

/**
 * Generate offboarding email HTML content
 */
function generateOffboardingEmailHTML(params: OffboardingEmailParams): string {
  const { businessName, businessPhone, replyFlowNumber } = params

  const businessPhoneSection = businessPhone 
    ? `<p><strong>Your business number:</strong><br>${businessPhone}</p>`
    : ''

  const replyFlowNumberSection = replyFlowNumber
    ? `<p><strong>Your ReplyFlow number:</strong><br>${replyFlowNumber}</p>`
    : ''

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>How to turn off ReplyFlow call forwarding</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e5e7eb; }
          .carrier { margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e5e7eb; }
          .carrier:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
          .carrier-name { font-weight: 600; color: #1f2937; margin-bottom: 5px; }
          .carrier-code { background: #f3f4f6; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 14px; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">ReplyFlowHQ</h1>
          </div>
          <div class="content">
            <p>Hi ${businessName},</p>
            
            <p>Your ReplyFlow account has been scheduled for cancellation/deletion.</p>
            
            <p>To make sure missed calls no longer forward to ReplyFlow, please disable call forwarding on your business phone.</p>
            
            <div class="section">
              ${businessPhoneSection}
              ${replyFlowNumberSection}
            </div>
            
            <div class="section">
              <h2 style="margin-top: 0; color: #1f2937;">Turn off call forwarding:</h2>
              
              <div class="carrier">
                <div class="carrier-name">Verizon</div>
                <p>Dial <span class="carrier-code">*73</span> from your business phone, then press Call/Send.</p>
              </div>
              
              <div class="carrier">
                <div class="carrier-name">AT&T</div>
                <p>Dial <span class="carrier-code">##004#</span> or <span class="carrier-code">#21#</span> from your business phone, then press Call/Send.</p>
              </div>
              
              <div class="carrier">
                <div class="carrier-name">T-Mobile</div>
                <p>Dial <span class="carrier-code">##004#</span> from your business phone, then press Call/Send.</p>
              </div>
              
              <div class="carrier">
                <div class="carrier-name">Other carriers</div>
                <p>Check your carrier's call forwarding settings or contact your carrier and ask them to disable conditional call forwarding.</p>
              </div>
            </div>
            
            <p>After dialing the code, wait for the carrier confirmation tone or message. If forwarding still appears active, restart your phone and try again.</p>
            
            <p>If you need help, contact <a href="mailto:support@replyflowhq.com" style="color: #2563eb;">support@replyflowhq.com</a>.</p>
            
            <p>Thanks,<br>ReplyFlowHQ</p>
          </div>
          <div class="footer">
            <p>You're receiving this email because you requested to cancel or delete your ReplyFlow account.</p>
          </div>
        </div>
      </body>
    </html>
  `
}

/**
 * Send offboarding email to a business owner
 * @returns { success: boolean, error?: string, messageId?: string }
 */
export async function sendOffboardingEmail(params: OffboardingEmailParams): Promise<{
  success: boolean
  error?: string
  messageId?: string
}> {
  if (!resendClient) {
    console.warn('[email] Resend client not initialized - RESEND_API_KEY not set')
    return { success: false, error: 'Email service not configured' }
  }

  const { businessName, userEmail } = params

  try {
    const html = generateOffboardingEmailHTML(params)

    const result = await resendClient.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'ReplyFlowHQ <noreply@replyflowhq.com>',
      to: userEmail,
      subject: 'How to turn off ReplyFlow call forwarding',
      html,
    })

    console.log('[email] Offboarding email sent successfully', {
      to: userEmail,
      messageId: result.data?.id,
    })

    return { success: true, messageId: result.data?.id }
  } catch (error: any) {
    console.error('[email] Failed to send offboarding email', {
      to: userEmail,
      error: error?.message || String(error),
    })
    return { success: false, error: error?.message || 'Failed to send email' }
  }
}

/**
 * Check if email service is available
 */
export function isEmailServiceAvailable(): boolean {
  return resendClient !== null
}

/**
 * Generate account deletion confirmation email HTML content
 */
function generateAccountDeletionConfirmationHTML(params: AccountDeletionConfirmationParams): string {
  const { businessName, twilioNumberReserved, twilioNumber } = params

  const businessNameSection = businessName 
    ? `<p><strong>Business name:</strong><br>${businessName}</p>`
    : ''

  const twilioNumberSection = twilioNumber
    ? `<p><strong>ReplyFlow number:</strong><br>${twilioNumber}</p>`
    : ''

  const twilioReservationSection = twilioNumberReserved && twilioNumber
    ? `<p><strong>Number status:</strong><br>Your ReplyFlow number has been reserved for 30 days according to our retention policy. If you wish to reclaim it, please contact support within 30 days of deletion.</p>`
    : twilioNumberReserved
    ? `<p><strong>Number status:</strong><br>Your ReplyFlow number has been reserved for 30 days according to our retention policy.</p>`
    : ''

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your ReplyFlow account has been deleted</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e5e7eb; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">ReplyFlowHQ</h1>
          </div>
          <div class="content">
            <p>Hi,</p>
            
            <p>This email confirms that your ReplyFlow account has been successfully deleted.</p>
            
            <div class="section">
              <h2 style="margin-top: 0; color: #1f2937;">What happened to your data:</h2>
              
              <p><strong>Account status:</strong><br>Your ReplyFlow account has been permanently deleted.</p>
              
              <p><strong>Business data:</strong><br>All your business data, including leads, conversations, messages, and settings have been removed.</p>
              
              ${businessNameSection}
              ${twilioNumberSection}
              ${twilioReservationSection}
            </div>
            
            <p>If you did not request this deletion or if you believe this was done in error, please contact our support team immediately at <a href="mailto:support@replyflowhq.com" style="color: #2563eb;">support@replyflowhq.com</a>.</p>
            
            <p>Thank you for using ReplyFlow.<br>ReplyFlowHQ</p>
          </div>
          <div class="footer">
            <p>You're receiving this email because your ReplyFlow account was deleted.</p>
          </div>
        </div>
      </body>
    </html>
  `
}

/**
 * Send account deletion confirmation email
 * @returns { success: boolean, error?: string, messageId?: string }
 */
export async function sendAccountDeletionConfirmationEmail(params: AccountDeletionConfirmationParams): Promise<{
  success: boolean
  error?: string
  messageId?: string
}> {
  if (!resendClient) {
    console.warn('[email] Resend client not initialized - RESEND_API_KEY not set')
    return { success: false, error: 'Email service not configured' }
  }

  const { userEmail } = params

  try {
    const html = generateAccountDeletionConfirmationHTML(params)

    const result = await resendClient.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'ReplyFlowHQ <noreply@replyflowhq.com>',
      to: userEmail,
      subject: 'Your ReplyFlow account has been deleted',
      html,
    })

    console.log('[email] Account deletion confirmation email sent successfully', {
      to: userEmail,
      messageId: result.data?.id,
    })

    return { success: true, messageId: result.data?.id }
  } catch (error: any) {
    console.error('[email] Failed to send account deletion confirmation email', {
      to: userEmail,
      error: error?.message || String(error),
    })
    return { success: false, error: error?.message || 'Failed to send email' }
  }
}
