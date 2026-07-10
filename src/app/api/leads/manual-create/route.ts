import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, db } from '@/lib/supabase/admin'
import { normalizePhoneNumberForStorage } from '@/lib/supabase/admin'
import { timelineEvents } from '@/lib/event-timeline'
import { notificationServiceServer } from '@/lib/notifications-server'
import { createFollowUpJobs } from '@/lib/follow-ups'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      businessId,
      customerName,
      phoneNumber,
      serviceRequested,
      address,
      desiredCompletion,
      callbackTime,
      notes
    } = body

    // Validate required fields
    if (!businessId || !phoneNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: businessId and phoneNumber are required' },
        { status: 400 }
      )
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumberForStorage(phoneNumber)

    // Check if business exists
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, name')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    // Check for existing lead by phone number
    const { data: existingLead } = await supabaseAdmin
      .from('leads')
      .select('id, status')
      .eq('business_id', businessId)
      .eq('caller_phone', normalizedPhone)
      .maybeSingle()

    let leadId: string | null = null
    let isNewLead = false

    if (existingLead) {
      // Reuse existing lead if it's not completed/ignored
      const isCompletedOrIgnored = existingLead.status === 'completed' || existingLead.status === 'ignored'
      
      if (isCompletedOrIgnored) {
        // Create new lead
        isNewLead = true
      } else {
        // Reuse existing lead
        leadId = existingLead.id
        isNewLead = false
      }
    }

    if (isNewLead || !existingLead) {
      // Create new lead with manual intake data
      const { data: newLead, error: leadError } = await supabaseAdmin
        .from('leads')
        .insert({
          business_id: businessId,
          caller_phone: normalizedPhone,
          status: 'new',
          raw_metadata: {
            source: 'manual_entry',
            extracted_info: {
              callerName: customerName || null,
              reasonForCalling: serviceRequested || null,
              addressOrLocation: address || null,
              desiredCompletionTime: desiredCompletion || null,
              preferredCallbackTime: callbackTime || null,
              importantDetails: notes || null
            }
          }
        })
        .select()
        .single()

      if (leadError || !newLead) {
        console.error('[MANUAL CUSTOMER ENTRY] Failed to create lead:', leadError)
        return NextResponse.json(
          { error: 'Failed to create lead' },
          { status: 500 }
        )
      }

      leadId = newLead.id
      console.log('[MANUAL CUSTOMER ENTRY] Lead created:', leadId)
    } else {
      // Update existing lead with new manual intake data
      const { data: currentLead } = await supabaseAdmin
        .from('leads')
        .select('raw_metadata')
        .eq('id', leadId)
        .single()

      const existingMetadata = currentLead?.raw_metadata || {}
      const existingExtractedInfo = existingMetadata.extracted_info || {}

      // Merge new manual data with existing data (new data takes precedence)
      const mergedExtractedInfo = {
        ...existingExtractedInfo,
        callerName: customerName || existingExtractedInfo.callerName,
        reasonForCalling: serviceRequested || existingExtractedInfo.reasonForCalling,
        addressOrLocation: address || existingExtractedInfo.addressOrLocation,
        desiredCompletionTime: desiredCompletion || existingExtractedInfo.desiredCompletionTime,
        preferredCallbackTime: callbackTime || existingExtractedInfo.preferredCallbackTime,
        importantDetails: notes || existingExtractedInfo.importantDetails
      }

      const { error: updateError } = await supabaseAdmin
        .from('leads')
        .update({
          raw_metadata: {
            ...existingMetadata,
            extracted_info: mergedExtractedInfo,
            manual_entry_updated: true,
            manual_entry_updated_at: new Date().toISOString()
          }
        })
        .eq('id', leadId)

      if (updateError) {
        console.error('[MANUAL CUSTOMER ENTRY] Failed to update lead:', updateError)
        return NextResponse.json(
          { error: 'Failed to update lead' },
          { status: 500 }
        )
      }

      console.log('[MANUAL CUSTOMER ENTRY] Lead updated:', leadId)
    }

    // Get or create conversation using shared helper with canonical selection
    let conversationId: string | null = null
    if (leadId) {
      try {
        const result = await db.getOrCreateConversation(leadId, businessId)
        conversationId = result.conversationId
        console.log('[MANUAL CUSTOMER ENTRY] Conversation handled:', {
          conversationId,
          isNew: result.isNew,
          isNewLead
        })
      } catch (error) {
        console.error('[MANUAL CUSTOMER ENTRY] Failed to get or create conversation:', error)
      }
    }

    // Create timeline event
    if (leadId) {
      await timelineEvents.leadCreated(businessId, leadId, conversationId || '', normalizedPhone)
    }

    // Create notification for new lead (only if new)
    if (isNewLead && leadId) {
      try {
        await notificationServiceServer.notifyNewLead(
          businessId,
          customerName || 'Unknown',
          normalizedPhone,
          leadId
        )
      } catch (error) {
        console.error('[MANUAL CUSTOMER ENTRY] Failed to create notification:', error)
      }
    }

    // Create follow-up jobs (only if new)
    if (isNewLead && leadId) {
      try {
        await createFollowUpJobs({
          businessId,
          leadId,
          conversationId: conversationId || undefined,
          businessName: business.name
        })
      } catch (error) {
        console.error('[MANUAL CUSTOMER ENTRY] Failed to create follow-up jobs:', error)
      }
    }

    return NextResponse.json({
      success: true,
      leadId,
      conversationId,
      isNewLead,
      message: isNewLead ? 'Customer created successfully' : 'Customer updated successfully'
    })

  } catch (error: any) {
    console.error('[MANUAL CUSTOMER ENTRY] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
