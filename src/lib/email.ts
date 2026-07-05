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
  confirmationToken?: string
}

interface AccountDeletionConfirmationParams {
  userEmail: string
  businessName?: string
  twilioNumberReserved?: boolean
  twilioNumber?: string
}

interface OffboardingReminderEmailParams {
  businessEmail: string
  confirmationToken: string
  reminderNumber: number
  businessPhone?: string
}

interface JourneyEmailParams {
  userEmail: string
  businessName?: string
  analytics: {
    totalDays?: number
    leadsCaptured?: number
    conversations?: number
    aiCallsHandled?: number
    appointmentsScheduled?: number
    paymentRequestsSent?: number
    messagesExchanged?: number
  }
}

/**
 * Generate offboarding email HTML content
 */
function generateOffboardingEmailHTML(params: OffboardingEmailParams): string {
  const { businessName, businessPhone, replyFlowNumber, confirmationToken } = params

  const businessPhoneSection = businessPhone 
    ? `<p><strong>Your business number:</strong><br>${businessPhone}</p>`
    : ''

  const replyFlowNumberSection = replyFlowNumber
    ? `<p><strong>Your ReplyFlow number:</strong><br>${replyFlowNumber}</p>`
    : ''

  const confirmationSection = confirmationToken
    ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 24px; text-align: center; margin: 30px 0;">
      <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #1e40af;">Finished disabling call forwarding?</h3>
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #3b82f6;">Once you've disabled call forwarding, click below and we'll stop all reminder emails and text messages.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/api/offboarding/confirm?token=${confirmationToken}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">I've Disabled Call Forwarding</a>
    </div>
    `
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
            <h1 style="margin: 0; font-size: 24px;">ReplyFlow</h1>
          </div>
          <div class="content">
            <p>Hi there,</p>
            
            <p>Your ReplyFlow account has been scheduled for cancellation.</p>
            
            <p>If you enabled call forwarding to ReplyFlow, please disable it using the instructions below to ensure missed calls are no longer forwarded.</p>
            
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
                <p>Dial <span class="carrier-code">##004#</span> from your business phone, then press Call/Send.</p>
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
            
            ${confirmationSection}
            
            <p>If you need help, contact <a href="mailto:support@replyflowhq.com" style="color: #2563eb;">support@replyflowhq.com</a>.</p>
            
            <p>Thanks,<br>ReplyFlow</p>
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
    console.error('[email] Resend client not initialized - RESEND_API_KEY not set')
    return { success: false, error: 'Email service not configured' }
  }

  const { businessName, userEmail } = params

  try {
    const html = generateOffboardingEmailHTML(params)

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'ReplyFlow <noreply@replyflowhq.com>'
    console.log('[email] Sending offboarding email', {
      to: userEmail,
      from: fromEmail,
      hasApiKey: !!process.env.RESEND_API_KEY,
    })

    const result = await resendClient.emails.send({
      from: fromEmail,
      to: userEmail,
      subject: 'How to turn off ReplyFlow call forwarding',
      html,
    })

    // Log full provider response in debug mode
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_EMAIL === 'true') {
      console.log('[email] Resend provider response', {
        to: userEmail,
        result: JSON.stringify(result),
      })
    }

    // Validate that provider confirmed delivery acceptance
    if (!result.data?.id) {
      console.warn('[email] Provider returned no message id - email may not have been accepted', {
        to: userEmail,
        result: JSON.stringify(result),
      })
      return { success: false, error: 'Provider did not return message id' }
    }

    console.log('[email] Offboarding email sent successfully', {
      to: userEmail,
      messageId: result.data.id,
    })

    return { success: true, messageId: result.data.id }
  } catch (error: any) {
    // Explicit error logging for provider errors
    const errorMessage = error?.message || String(error)
    const errorName = error?.name || 'UnknownError'
    const errorStatusCode = error?.statusCode

    console.error('[email] Failed to send offboarding email', {
      to: userEmail,
      error: errorMessage,
      errorName,
      statusCode: errorStatusCode,
      fullError: process.env.NODE_ENV === 'development' ? JSON.stringify(error) : undefined,
    })

    // Log specific error types
    if (errorMessage.includes('API key')) {
      console.error('[email] Missing or invalid RESEND_API_KEY')
    } else if (errorMessage.includes('from') || errorMessage.includes('domain')) {
      console.error('[email] Invalid from address or domain not verified')
    } else if (errorMessage.includes('to') || errorMessage.includes('recipient')) {
      console.error('[email] Rejected recipient')
    } else if (errorMessage.includes('sandbox') || errorMessage.includes('test')) {
      console.error('[email] Account in sandbox/test mode')
    }

    return { success: false, error: errorMessage }
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

  const twilioReservationSection = twilioNumber
    ? `<p><strong>Number status:</strong><br>Your ReplyFlow number has been released immediately and is no longer associated with your account.</p>`
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
            <h1 style="margin: 0; font-size: 24px;">ReplyFlow</h1>
          </div>
          <div class="content">
            <p>Hi there,</p>
            
            <p>This email confirms that your ReplyFlow account has been permanently deleted.</p>
            
            <div class="section">
              <h2 style="margin-top: 0; color: #1f2937;">What happened to your data:</h2>
              
              <p><strong>Account status:</strong><br>Your ReplyFlow account has been permanently deleted.</p>
              
              <p><strong>Business data:</strong><br>All your business data, including leads, conversations, messages, and settings have been removed from our systems.</p>
              
              ${businessNameSection}
              ${twilioNumberSection}
              ${twilioReservationSection}
            </div>
            
            <p>If you did not request this deletion or if you believe this was done in error, please contact our support team immediately at <a href="mailto:support@replyflowhq.com" style="color: #2563eb;">support@replyflowhq.com</a>.</p>
            
            <p>Thank you for using ReplyFlow.<br>ReplyFlow</p>
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
    console.error('[email] Resend client not initialized - RESEND_API_KEY not set')
    return { success: false, error: 'Email service not configured' }
  }

  const { userEmail } = params

  try {
    const html = generateAccountDeletionConfirmationHTML(params)

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'ReplyFlow <noreply@replyflowhq.com>'
    console.log('[email] Sending account deletion confirmation email', {
      to: userEmail,
      from: fromEmail,
      hasApiKey: !!process.env.RESEND_API_KEY,
    })

    const result = await resendClient.emails.send({
      from: fromEmail,
      to: userEmail,
      subject: 'Your ReplyFlow account has been deleted',
      html,
    })

    // Log full provider response in debug mode
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_EMAIL === 'true') {
      console.log('[email] Resend provider response', {
        to: userEmail,
        result: JSON.stringify(result),
      })
    }

    // Validate that provider confirmed delivery acceptance
    if (!result.data?.id) {
      console.warn('[email] Provider returned no message id - email may not have been accepted', {
        to: userEmail,
        result: JSON.stringify(result),
      })
      return { success: false, error: 'Provider did not return message id' }
    }

    console.log('[email] Account deletion confirmation email sent successfully', {
      to: userEmail,
      messageId: result.data.id,
    })

    return { success: true, messageId: result.data.id }
  } catch (error: any) {
    // Explicit error logging for provider errors
    const errorMessage = error?.message || String(error)
    const errorName = error?.name || 'UnknownError'
    const errorStatusCode = error?.statusCode

    console.error('[email] Failed to send account deletion confirmation email', {
      to: userEmail,
      error: errorMessage,
      errorName,
      statusCode: errorStatusCode,
      fullError: process.env.NODE_ENV === 'development' ? JSON.stringify(error) : undefined,
    })

    // Log specific error types
    if (errorMessage.includes('API key')) {
      console.error('[email] Missing or invalid RESEND_API_KEY')
    } else if (errorMessage.includes('from') || errorMessage.includes('domain')) {
      console.error('[email] Invalid from address or domain not verified')
    } else if (errorMessage.includes('to') || errorMessage.includes('recipient')) {
      console.error('[email] Rejected recipient')
    } else if (errorMessage.includes('sandbox') || errorMessage.includes('test')) {
      console.error('[email] Account in sandbox/test mode')
    }

    return { success: false, error: errorMessage }
  }
}

/**
 * Generate offboarding reminder email HTML content
 */
function generateOffboardingReminderEmailHTML(params: OffboardingReminderEmailParams): string {
  const { businessPhone, confirmationToken, reminderNumber } = params
  const confirmationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/offboarding/confirm?token=${confirmationToken}`

  const businessPhoneSection = businessPhone 
    ? `<p><strong>Your business number:</strong><br>${businessPhone}</p>`
    : ''

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reminder: Disable Call Forwarding - ReplyFlow</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e5e7eb; }
          .carrier { margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e5e7eb; }
          .carrier:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
          .carrier-name { font-weight: 600; color: #1f2937; margin-bottom: 5px; }
          .carrier-code { background: #f3f4f6; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 14px; }
          .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">⚠️ Reminder: Disable Call Forwarding</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Reminder #${reminderNumber} of 2</p>
          </div>
          <div class="content">
            <p>Hi there,</p>
            
            <p><strong>This is a reminder to disable call forwarding</strong> so your missed calls return to your normal voicemail.</p>
            
            <div class="section">
              ${businessPhoneSection}
            </div>
            
            <p>If you've already disabled call forwarding, please confirm below to stop receiving these reminders:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${confirmationUrl}" class="button">I've disabled call forwarding</a>
            </div>
            
            <div class="section">
              <h2 style="margin-top: 0; color: #1f2937;">How to disable call forwarding:</h2>
              
              <div class="carrier">
                <div class="carrier-name">Verizon</div>
                <p>Dial <span class="carrier-code">*73</span> from your business phone, then press Call/Send.</p>
              </div>
              
              <div class="carrier">
                <div class="carrier-name">AT&T</div>
                <p>Dial <span class="carrier-code">##004#</span> from your business phone, then press Call/Send.</p>
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
            
            <p>Thanks,<br>ReplyFlow</p>
          </div>
          <div class="footer">
            <p>You're receiving this email because you deleted your ReplyFlow account but haven't confirmed that call forwarding has been disabled.</p>
          </div>
        </div>
      </body>
    </html>
  `
}

/**
 * Send offboarding reminder email
 * @returns { success: boolean, error?: string, messageId?: string }
 */
export async function sendOffboardingReminderEmail(params: OffboardingReminderEmailParams): Promise<{
  success: boolean
  error?: string
  messageId?: string
}> {
  if (!resendClient) {
    console.error('[email] Resend client not initialized - RESEND_API_KEY not set')
    return { success: false, error: 'Email service not configured' }
  }

  const { businessEmail, reminderNumber } = params

  try {
    const html = generateOffboardingReminderEmailHTML(params)

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'ReplyFlow <noreply@replyflowhq.com>'
    console.log('[email] Sending offboarding reminder email', {
      to: businessEmail,
      from: fromEmail,
      reminderNumber,
      hasApiKey: !!process.env.RESEND_API_KEY,
    })

    const result = await resendClient.emails.send({
      from: fromEmail,
      to: businessEmail,
      subject: `Reminder: Disable Call Forwarding (#${reminderNumber} of 2) - ReplyFlow`,
      html,
    })

    // Log full provider response in debug mode
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_EMAIL === 'true') {
      console.log('[email] Resend provider response', {
        to: businessEmail,
        result: JSON.stringify(result),
      })
    }

    // Validate that provider confirmed delivery acceptance
    if (!result.data?.id) {
      console.warn('[email] Provider returned no message id - email may not have been accepted', {
        to: businessEmail,
        result: JSON.stringify(result),
      })
      return { success: false, error: 'Provider did not return message id' }
    }

    console.log('[email] Offboarding reminder email sent successfully', {
      to: businessEmail,
      messageId: result.data.id,
      reminderNumber,
    })

    return { success: true, messageId: result.data.id }
  } catch (error: any) {
    // Explicit error logging for provider errors
    const errorMessage = error?.message || String(error)
    const errorName = error?.name || 'UnknownError'
    const errorStatusCode = error?.statusCode

    console.error('[email] Failed to send offboarding reminder email', {
      to: businessEmail,
      error: errorMessage,
      errorName,
      statusCode: errorStatusCode,
      fullError: process.env.NODE_ENV === 'development' ? JSON.stringify(error) : undefined,
    })

    // Log specific error types
    if (errorMessage.includes('API key')) {
      console.error('[email] Missing or invalid RESEND_API_KEY')
    } else if (errorMessage.includes('from') || errorMessage.includes('domain')) {
      console.error('[email] Invalid from address or domain not verified')
    } else if (errorMessage.includes('to') || errorMessage.includes('recipient')) {
      console.error('[email] Rejected recipient')
    } else if (errorMessage.includes('sandbox') || errorMessage.includes('test')) {
      console.error('[email] Account in sandbox/test mode')
    }

    return { success: false, error: errorMessage }
  }
}

/**
 * Generate journey email HTML content
 */
function generateJourneyEmailHTML(params: JourneyEmailParams): string {
  const { userEmail, businessName, analytics } = params

  // Build stacked metric cards using table layout for Gmail compatibility
  const metricCards = []
  
  if (analytics.totalDays !== undefined) {
    metricCards.push(`
      <tr>
        <td style="padding: 16px 0;">
          <div style="background: #f8fafc; border-radius: 12px; padding: 28px 24px; text-align: center;">
            <div style="font-size: 40px; font-weight: 700; color: #2563eb; margin-bottom: 8px;">${analytics.totalDays}</div>
            <div style="font-size: 15px; font-weight: 600; color: #475569; margin-bottom: 4px;">Days Using ReplyFlow</div>
            <div style="font-size: 13px; color: #94a3b8; font-weight: 400;">Time with your account</div>
          </div>
        </td>
      </tr>
    `)
  }
  
  if (analytics.leadsCaptured !== undefined) {
    metricCards.push(`
      <tr>
        <td style="padding: 16px 0;">
          <div style="background: #f8fafc; border-radius: 12px; padding: 28px 24px; text-align: center;">
            <div style="font-size: 40px; font-weight: 700; color: #2563eb; margin-bottom: 8px;">${analytics.leadsCaptured}</div>
            <div style="font-size: 15px; font-weight: 600; color: #475569; margin-bottom: 4px;">Leads Captured</div>
            <div style="font-size: 13px; color: #94a3b8; font-weight: 400;">New opportunities recovered</div>
          </div>
        </td>
      </tr>
    `)
  }
  
  if (analytics.conversations !== undefined) {
    metricCards.push(`
      <tr>
        <td style="padding: 16px 0;">
          <div style="background: #f8fafc; border-radius: 12px; padding: 28px 24px; text-align: center;">
            <div style="font-size: 40px; font-weight: 700; color: #2563eb; margin-bottom: 8px;">${analytics.conversations}</div>
            <div style="font-size: 15px; font-weight: 600; color: #475569; margin-bottom: 4px;">Customer Conversations</div>
            <div style="font-size: 13px; color: #94a3b8; font-weight: 400;">Meaningful interactions</div>
          </div>
        </td>
      </tr>
    `)
  }
  
  if (analytics.aiCallsHandled !== undefined) {
    metricCards.push(`
      <tr>
        <td style="padding: 16px 0;">
          <div style="background: #f8fafc; border-radius: 12px; padding: 28px 24px; text-align: center;">
            <div style="font-size: 40px; font-weight: 700; color: #2563eb; margin-bottom: 8px;">${analytics.aiCallsHandled}</div>
            <div style="font-size: 15px; font-weight: 600; color: #475569; margin-bottom: 4px;">AI Calls Handled</div>
            <div style="font-size: 13px; color: #94a3b8; font-weight: 400;">Automated responses</div>
          </div>
        </td>
      </tr>
    `)
  }
  
  if (analytics.messagesExchanged !== undefined) {
    metricCards.push(`
      <tr>
        <td style="padding: 16px 0;">
          <div style="background: #f8fafc; border-radius: 12px; padding: 28px 24px; text-align: center;">
            <div style="font-size: 40px; font-weight: 700; color: #2563eb; margin-bottom: 8px;">${analytics.messagesExchanged}</div>
            <div style="font-size: 15px; font-weight: 600; color: #475569; margin-bottom: 4px;">Messages Exchanged</div>
            <div style="font-size: 13px; color: #94a3b8; font-weight: 400;">Text conversations</div>
          </div>
        </td>
      </tr>
    `)
  }
  
  if (analytics.appointmentsScheduled !== undefined) {
    metricCards.push(`
      <tr>
        <td style="padding: 16px 0;">
          <div style="background: #f8fafc; border-radius: 12px; padding: 28px 24px; text-align: center;">
            <div style="font-size: 40px; font-weight: 700; color: #2563eb; margin-bottom: 8px;">${analytics.appointmentsScheduled}</div>
            <div style="font-size: 15px; font-weight: 600; color: #475569; margin-bottom: 4px;">Appointments Scheduled</div>
            <div style="font-size: 13px; color: #94a3b8; font-weight: 400;">Booked meetings</div>
          </div>
        </td>
      </tr>
    `)
  }
  
  if (analytics.paymentRequestsSent !== undefined) {
    metricCards.push(`
      <tr>
        <td style="padding: 16px 0;">
          <div style="background: #f8fafc; border-radius: 12px; padding: 28px 24px; text-align: center;">
            <div style="font-size: 40px; font-weight: 700; color: #2563eb; margin-bottom: 8px;">${analytics.paymentRequestsSent}</div>
            <div style="font-size: 15px; font-weight: 600; color: #475569; margin-bottom: 4px;">Payment Requests Sent</div>
            <div style="font-size: 13px; color: #94a3b8; font-weight: 400;">Payment links shared</div>
          </div>
        </td>
      </tr>
    `)
  }

  const metricsSection = metricCards.length > 0 ? `
    <table style="width: 100%; border-collapse: collapse; margin-top: 48px;">
      <tr>
        <td style="text-align: center; padding: 0 0 24px 0;">
          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">━━━━━━━━━━━━━━━━</p>
          <p style="margin: 16px 0 0 0; font-size: 18px; font-weight: 600; color: #1f2937;">Your ReplyFlow Journey</p>
          <p style="margin: 0 0 24px 0; font-size: 14px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">━━━━━━━━━━━━━━━━</p>
        </td>
      </tr>
      ${metricCards.join('')}
    </table>
  ` : ''

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Thanks for using ReplyFlow</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.7; color: #374151; background-color: #f9fafb;">
        <table style="max-width: 600px; margin: 0 auto; background-color: white; width: 100%;" cellpadding="0" cellspacing="0">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 56px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 32px; font-weight: 700; color: white; letter-spacing: -0.5px; line-height: 1.2;">Your ReplyFlow Journey</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 48px 32px;">
              <!-- Greeting -->
              <p style="margin: 0 0 32px 0; font-size: 17px; color: #374151; line-height: 1.7;">
                Thank you for trusting ReplyFlow with your business.
              </p>
              
              <p style="margin: 0 0 40px 0; font-size: 17px; color: #374151; line-height: 1.7;">
                Every customer conversation matters, and we're grateful we had the opportunity to help you recover missed opportunities along the way.
              </p>
              
              ${metricsSection}
              
              <!-- Closing -->
              <table style="width: 100%; margin-top: 56px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 32px 0 0 0; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 20px 0; font-size: 17px; color: #374151; line-height: 1.7;">
                      We're genuinely sorry to see you go.
                    </p>
                    
                    <p style="margin: 0 0 20px 0; font-size: 17px; color: #374151; line-height: 1.7;">
                      Thank you for giving ReplyFlow the opportunity to support your business.
                    </p>
                    
                    <p style="margin: 0 0 24px 0; font-size: 17px; color: #374151; line-height: 1.7;">
                      We wish you continued success and hope your business keeps growing.
                    </p>
                    
                    <p style="margin: 0; font-size: 15px; color: #6b7280; line-height: 1.6;">
                      — The ReplyFlow Team
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- CTA -->
              <table style="width: 100%; margin-top: 48px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 32px 0 0 0; border-top: 1px solid #e5e7eb; text-align: center;">
                    <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #1f2937;">Need anything?</p>
                    <p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280;">
                      <a href="mailto:support@replyflowhq.com" style="color: #2563eb; text-decoration: none;">support@replyflowhq.com</a>
                    </p>
                    <p style="margin: 0; font-size: 14px; color: #9ca3af; font-style: italic;">
                      If you ever decide to come back, we'd love to have you again.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">
                You're receiving this email because your ReplyFlow account was deleted.
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
}

/**
 * Send journey email with analytics
 * @returns { success: boolean, error?: string, messageId?: string }
 */
export async function sendJourneyEmail(params: JourneyEmailParams): Promise<{
  success: boolean
  error?: string
  messageId?: string
}> {
  if (!resendClient) {
    console.error('[email] Resend client not initialized - RESEND_API_KEY not set')
    return { success: false, error: 'Email service not configured' }
  }

  const { userEmail } = params

  try {
    const html = generateJourneyEmailHTML(params)

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'ReplyFlow <noreply@replyflowhq.com>'
    console.log('[email] Sending journey email', {
      to: userEmail,
      from: fromEmail,
      hasApiKey: !!process.env.RESEND_API_KEY,
    })

    const result = await resendClient.emails.send({
      from: fromEmail,
      to: userEmail,
      subject: 'Thanks for using ReplyFlow',
      html,
    })

    // Log full provider response in debug mode
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_EMAIL === 'true') {
      console.log('[email] Resend provider response', {
        to: userEmail,
        result: JSON.stringify(result),
      })
    }

    // Validate that provider confirmed delivery acceptance
    if (!result.data?.id) {
      console.warn('[email] Provider returned no message id - email may not have been accepted', {
        to: userEmail,
        result: JSON.stringify(result),
      })
      return { success: false, error: 'Provider did not return message id' }
    }

    console.log('[email] Journey email sent successfully', {
      to: userEmail,
      messageId: result.data.id,
    })

    return { success: true, messageId: result.data.id }
  } catch (error: any) {
    // Explicit error logging for provider errors
    const errorMessage = error?.message || String(error)
    const errorName = error?.name || 'UnknownError'
    const errorStatusCode = error?.statusCode

    console.error('[email] Failed to send journey email', {
      to: userEmail,
      error: errorMessage,
      errorName,
      statusCode: errorStatusCode,
      fullError: process.env.NODE_ENV === 'development' ? JSON.stringify(error) : undefined,
    })

    // Log specific error types
    if (errorMessage.includes('API key')) {
      console.error('[email] Missing or invalid RESEND_API_KEY')
    } else if (errorMessage.includes('from') || errorMessage.includes('domain')) {
      console.error('[email] Invalid from address or domain not verified')
    } else if (errorMessage.includes('to') || errorMessage.includes('recipient')) {
      console.error('[email] Rejected recipient')
    } else if (errorMessage.includes('sandbox') || errorMessage.includes('test')) {
      console.error('[email] Account in sandbox/test mode')
    }

    return { success: false, error: errorMessage }
  }
}
