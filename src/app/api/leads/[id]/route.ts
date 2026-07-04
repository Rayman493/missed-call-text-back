import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { db } from '@/lib/supabase/admin';

const MANUAL_FIELD_ALIASES: Record<string, string[]> = {
  callerName: ['name', 'callerName', 'customerName', 'caller_name', 'customer_name'],
  reasonForCalling: ['serviceRequested', 'reasonForCalling', 'reason', 'service_requested'],
  importantDetails: ['importantDetails', 'details', 'issueDescription', 'additionalDetails'],
  addressOrLocation: ['address', 'addressOrLocation', 'serviceAddress', 'service_address'],
  preferredCallbackTime: ['preferredCallbackTime', 'callbackTime', 'callback_time'],
  desiredCompletionTime: ['desiredCompletion', 'desiredCompletionTime', 'desired_completion_time', 'urgency'],
};

const EXTRACTED_FIELD_KEYS: Record<string, string[]> = {
  callerName: ['callerName', 'customerName'],
  reasonForCalling: ['reasonForCalling', 'serviceRequested'],
  importantDetails: ['importantDetails', 'additionalDetails', 'issueDescription'],
  addressOrLocation: ['addressOrLocation', 'serviceAddress'],
  preferredCallbackTime: ['preferredCallbackTime', 'callbackTime'],
  desiredCompletionTime: ['desiredCompletionTime', 'desiredCompletion'],
};

function firstValue(source: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function applyAliases(target: Record<string, any>, keys: string[], value: string) {
  for (const key of keys) target[key] = value;
}

function applyExtractedAliases(target: Record<string, any>, keys: string[], value: string) {
  for (const key of keys) target[key] = value;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user from auth header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const leadId = params.id;
    const body = await request.json();
    const { status, deleted_at, deleted_by, deletion_reason, raw_metadata, name } = body;

    // Handle manual field edits (raw_metadata update from AI intake editor)
    if (raw_metadata !== undefined) {
      const { data: currentLead, error: currentLeadError } = await supabase
        .from('leads')
        .select('id, name, raw_metadata')
        .eq('id', leadId)
        .eq('business_id', business.id)
        .single()

      if (currentLeadError || !currentLead) {
        console.error('Error loading lead before metadata update:', currentLeadError)
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
      }

      const currentMetadata = currentLead.raw_metadata || {}
      const incomingCorrected = raw_metadata.corrected_fields || {}
      const existingCorrected = currentMetadata.corrected_fields || {}
      const correctedFields = { ...existingCorrected }
      const previousValues = { ...(currentMetadata.previous_values || {}) }
      const correctionSources = { ...(currentMetadata.correction_sources || {}) }
      const manualFields = new Set<string>([...(currentMetadata.manualFields || []), ...(raw_metadata.manualFields || [])])
      const canonicalExtractedInfo = {
        ...(currentMetadata.extracted_info || {}),
        ...(raw_metadata.extracted_info || {}),
      }
      let changedCount = 0

      for (const [canonicalField, aliases] of Object.entries(MANUAL_FIELD_ALIASES)) {
        const value = firstValue(incomingCorrected, aliases)
        if (!value) continue

        const previous = firstValue(existingCorrected, aliases) || firstValue(canonicalExtractedInfo, EXTRACTED_FIELD_KEYS[canonicalField] || []) || ''
        applyAliases(correctedFields, aliases, value)
        applyExtractedAliases(canonicalExtractedInfo, EXTRACTED_FIELD_KEYS[canonicalField] || [], value)
        previousValues[canonicalField] = previous || 'unknown'
        correctionSources[canonicalField] = 'manual'
        manualFields.add(canonicalField)
        if (previous !== value) changedCount++
      }

      const now = new Date().toISOString()
      const mergedRawMetadata = {
        ...currentMetadata,
        ...raw_metadata,
        extracted_info: canonicalExtractedInfo,
        corrected_fields: correctedFields,
        previous_values: previousValues,
        correction_sources: correctionSources,
        manualFields: Array.from(manualFields),
        customer_corrected_info: true,
        last_correction_at: now,
        last_correction_source: 'manual',
        corrections_count: (currentMetadata.corrections_count || 0) + changedCount,
      }

      const metaUpdate: Record<string, any> = { raw_metadata: mergedRawMetadata }
      const manualName = firstValue(correctedFields, MANUAL_FIELD_ALIASES.callerName)
      if (manualName) metaUpdate.name = manualName
      else if (name !== undefined) metaUpdate.name = name

      const { data: updatedLead, error: updateError } = await supabase
        .from('leads')
        .update(metaUpdate)
        .eq('id', leadId)
        .eq('business_id', business.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating lead metadata:', updateError)
        return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
      }

      const { data: latestAiRecord } = await supabase
        .from('ai_call_records')
        .select('id, extracted_info')
        .eq('lead_id', leadId)
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestAiRecord?.id) {
        const updatedAiExtractedInfo = {
          ...(latestAiRecord.extracted_info || {}),
          ...canonicalExtractedInfo,
        }
        const { error: aiRecordUpdateError } = await supabase
          .from('ai_call_records')
          .update({ extracted_info: updatedAiExtractedInfo })
          .eq('id', latestAiRecord.id)

        if (aiRecordUpdateError) {
          console.error('Error updating latest AI call record extracted_info:', aiRecordUpdateError)
        }
      }

      return NextResponse.json({ lead: updatedLead })
    }

    // Handle restore operation (when deleted_at is explicitly set to null)
    if (deleted_at === null) {
      const { data: updatedLead, error: updateError } = await supabase
        .from('leads')
        .update({
          deleted_at: null,
          deleted_by: null,
          deletion_reason: null
        })
        .eq('id', leadId)
        .eq('business_id', business.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error restoring lead:', updateError);
        return NextResponse.json({ error: 'Failed to restore lead' }, { status: 500 });
      }

      console.log('[LEAD RESTORE] Lead restored successfully:', { leadId, businessId: business.id, userId: user.id });
      return NextResponse.json({ lead: updatedLead });
    }

    // Handle status update
    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    // Update lead status (only if it belongs to the user's business)
    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({ status })
      .eq('id', leadId)
      .eq('business_id', business.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating lead:', updateError);
      return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
    }

    return NextResponse.json({ lead: updatedLead });
  } catch (error) {
    console.error('Error in PATCH /api/leads/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user from auth header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const leadId = params.id;

    // Verify lead belongs to user's business
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id, status')
      .eq('id', leadId)
      .eq('business_id', business.id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Pause/cancel pending follow-up jobs before soft delete
    const { error: followUpsError } = await supabase
      .from('follow_up_jobs')
      .update({
        status: 'paused',
        paused_at: new Date().toISOString(),
        paused_by: 'system',
        cancellation_reason: 'lead_deleted'
      })
      .eq('lead_id', leadId)
      .eq('status', 'pending');

    if (followUpsError) {
      console.log('[LEAD DELETE] Failed to pause follow-ups:', followUpsError);
      // Don't fail the request if follow-up pause fails
    }

    // Soft delete the lead by setting deleted_at and deleted_by
    const { error: deleteLeadError } = await supabase
      .from('leads')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        deletion_reason: 'user_deleted'
      })
      .eq('id', leadId)
      .eq('business_id', business.id);

    if (deleteLeadError) {
      console.error('Error soft deleting lead:', deleteLeadError);
      return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
    }

    // Log soft deletion
    console.log('[LEAD DELETE] Lead soft deleted successfully:', {
      leadId,
      businessId: business.id,
      userId: user.id,
      previousStatus: lead.status,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    console.error('Error in DELETE /api/leads/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
