import { NextRequest, NextResponse } from 'next/server'
import { notificationServiceServer } from '@/lib/notifications-server'
import crypto from 'crypto'

/**
 * POST /api/notifications/create
 * 
 * Internal endpoint for creating notifications (used by AI voice service)
 * Protected with INTERNAL_API_SECRET for server-to-server authentication
 * 
 * Request body:
 * - businessId: string
 * - leadId: string
 * - type: 'new_lead' | 'customer_reply' | 'followup_completed' | 'forwarding_disconnected' | 'sms_failed' | 'trial_ending' | 'subscription_issue' | 'voicemail_received' | 'ai_intake_completed'
 * - title?: string (optional, will use template if not provided)
 * - message?: string (optional, will use template if not provided)
 * - actionUrl?: string (optional, will use template if not provided)
 * - actionText?: string (optional, will use template if not provided)
 * - customerName?: string (for template data)
 * - customerPhone?: string (for template data)
 * - serviceRequested?: string (for AI intake notifications)
 * - aiCallRecordId?: string (for idempotency — prevents duplicate ai_intake_completed)
 * - callSid?: string (fallback idempotency key if aiCallRecordId is not available)
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[NOTIFICATION API ENTER] Request received');
    
    // Verify INTERNAL_API_SECRET for server-to-server authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[NOTIFICATION API ERROR] Missing or invalid authorization header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const providedSecret = authHeader.replace('Bearer ', '')
    const expectedSecret = process.env.INTERNAL_API_SECRET

    if (!expectedSecret) {
      console.error('[NOTIFICATION API ERROR] INTERNAL_API_SECRET not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Use timing-safe comparison to prevent timing attacks
    try {
      const isMatch = crypto.timingSafeEqual(
        Buffer.from(providedSecret),
        Buffer.from(expectedSecret)
      )
      if (!isMatch) {
        console.error('[NOTIFICATION API ERROR] Invalid INTERNAL_API_SECRET')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    } catch (error) {
      // If comparison fails (e.g., different lengths), reject
      console.error('[NOTIFICATION API ERROR] Invalid INTERNAL_API_SECRET')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      businessId, 
      leadId, 
      type = 'new_lead',
      title,
      message,
      actionUrl,
      actionText,
      customerName,
      customerPhone,
      serviceRequested,
      aiCallRecordId,
      callSid
    } = body

    console.log('[NOTIFICATION API REQUEST BODY]', { 
      businessId, 
      leadId, 
      type, 
      title,
      message,
      actionUrl,
      actionText,
      customerName,
      customerPhone,
      serviceRequested,
      aiCallRecordId: aiCallRecordId ? '[present]' : '[absent]',
      callSid: callSid ? '[present]' : '[absent]'
    });

    if (!businessId || !leadId) {
      console.error('[NOTIFICATION API ERROR] Missing required fields:', { businessId, leadId });
      return NextResponse.json({ error: 'Missing required fields: businessId, leadId' }, { status: 400 })
    }

    console.log('[NOTIFICATION API CREATE ATTEMPT]', { businessId, leadId, type });

    // Build notification data based on type
    let data: any = { leadId }
    let finalTitle = title
    let finalMessage = message
    let finalActionUrl = actionUrl || `/dashboard/leads/${leadId}`
    let finalActionText = actionText || 'View Lead'

    if (type === 'ai_intake_completed') {
      // CRITICAL FIX: The NOTIFICATION_TEMPLATES.ai_intake_completed template
      // expects `leadName` and `leadPhone` (not `customerName`/`customerPhone`).
      // Without this mapping, resolveCustomerDisplayName() always returns
      // 'Customer' → title is always "New Request" instead of the customer name.
      //
      // Also pass aiCallRecordId (or callSid as fallback) so the server helper
      // activates idempotency_key = `ai_${aiCallRecordId}`, preventing duplicate
      // notifications when both the AI voice service and the voice-status
      // webhook fire for the same call.
      const effectiveAiCallRecordId = aiCallRecordId || callSid
      data = {
        leadId,
        leadName: customerName || '',
        leadPhone: customerPhone || '',
        serviceRequested,
        aiCallRecordId: effectiveAiCallRecordId
      }
      finalTitle = title || 'New Request'
      const nameLabel = customerName || null
      const serviceLabel = serviceRequested || null
      const preview = nameLabel && serviceLabel
        ? `${nameLabel} \u2022 ${serviceLabel}`
        : serviceLabel || nameLabel || 'New customer request'
      finalMessage = message || preview
      console.log('[notification_preview_generated]', { nameLabel, serviceLabel, preview, hasIdempotencyKey: !!effectiveAiCallRecordId })
      finalActionUrl = actionUrl || `/dashboard/leads/${leadId}`
      finalActionText = actionText || 'View Lead'
    } else if (type === 'new_lead') {
      data = { leadName: customerName || 'Customer', leadPhone: customerPhone || '', leadId }
    }

    await notificationServiceServer.createNotification(
      businessId,
      type as any,
      finalMessage || '',
      data,
      finalActionUrl,
      finalActionText
    )

    console.log('[NOTIFICATION API CREATE SUCCESS]', { businessId, leadId, type });

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[NOTIFICATION API CREATE ERROR]', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
