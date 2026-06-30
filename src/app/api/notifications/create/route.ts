import { NextRequest, NextResponse } from 'next/server'
import { notificationServiceServer } from '@/lib/notifications-server'

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

    if (providedSecret !== expectedSecret) {
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
      serviceRequested
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
      serviceRequested
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
      data = { leadId, customerName, customerPhone, serviceRequested }
      finalTitle = title || 'New AI intake lead'
      const nameLabel = customerName || null
      const serviceLabel = serviceRequested || null
      const preview = nameLabel && serviceLabel
        ? `${nameLabel} \u2022 ${serviceLabel}`
        : serviceLabel || nameLabel || 'New customer request'
      finalMessage = message || preview
      console.log('[notification_preview_generated]', { nameLabel, serviceLabel, preview })
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
