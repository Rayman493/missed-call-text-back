/**
 * Call Pipeline Classification Helper
 * 
 * Provides durable CallSid routing classification across all Twilio callbacks.
 * Enables voice-status bypass for Personal Voicemail calls without URL query parameters.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

export type CallPipeline = 'personal_voicemail' | 'ai_intake' | 'normal_voicemail' | 'update_voicemail' | 'unknown';

export interface CallClassification {
  callSid: string;
  businessId: string;
  callerPhone: string;
  pipeline: CallPipeline;
  createdAt: string;
  expiresAt: string;
}

/**
 * Classify a CallSid with its routing pipeline
 * 
 * Stores the classification in call_pipeline_classifications table for later retrieval
 * by other callbacks (voice-status, recording-status, personal-voicemail).
 * 
 * @param callSid - Twilio CallSid
 * @param businessId - Business ID
 * @param callerPhone - Caller phone number
 * @param pipeline - Pipeline type
 * @param ttlSeconds - Time to live in seconds (default: 600 = 10 minutes)
 */
export async function classifyCallSid(
  callSid: string,
  businessId: string,
  callerPhone: string,
  pipeline: CallPipeline,
  ttlSeconds: number = 600
): Promise<void> {
  console.log('[CALL CLASSIFICATION] Classifying CallSid:', {
    callSid: callSid.substring(0, 8),
    businessId,
    callerPhone,
    pipeline,
    ttlSeconds
  });

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from('call_pipeline_classifications')
    .upsert({
      call_sid: callSid,
      business_id: businessId,
      caller_phone: callerPhone,
      pipeline,
      expires_at: expiresAt
    }, {
      onConflict: 'call_sid'
    });

  if (error) {
    console.error('[CALL CLASSIFICATION] Failed to classify CallSid:', error);
    throw new Error(`Failed to classify CallSid: ${error.message}`);
  }

  console.log('[CALL CLASSIFICATION] Successfully classified CallSid:', {
    callSid: callSid.substring(0, 8),
    pipeline
  });
}

/**
 * Get the classification for a CallSid
 * 
 * @param callSid - Twilio CallSid
 * @returns Classification or null if not found or expired
 */
export async function getCallClassification(callSid: string): Promise<CallClassification | null> {
  console.log('[CALL CLASSIFICATION] Looking up classification for CallSid:', callSid.substring(0, 8));

  // Clean up expired classifications first
  await cleanupExpiredClassifications();

  const { data, error } = await supabaseAdmin
    .from('call_pipeline_classifications')
    .select('*')
    .eq('call_sid', callSid)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      console.log('[CALL CLASSIFICATION] No classification found for CallSid:', callSid.substring(0, 8));
      return null;
    }
    console.error('[CALL CLASSIFICATION] Error looking up classification:', error);
    throw new Error(`Failed to lookup CallSid classification: ${error.message}`);
  }

  if (!data) {
    console.log('[CALL CLASSIFICATION] No classification found for CallSid:', callSid.substring(0, 8));
    return null;
  }

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    console.log('[CALL CLASSIFICATION] Classification expired for CallSid:', callSid.substring(0, 8));
    await deleteClassification(callSid);
    return null;
  }

  console.log('[CALL CLASSIFICATION] Found classification for CallSid:', {
    callSid: callSid.substring(0, 8),
    pipeline: data.pipeline,
    businessId: data.business_id
  });

  return {
    callSid: data.call_sid,
    businessId: data.business_id,
    callerPhone: data.caller_phone,
    pipeline: data.pipeline,
    createdAt: data.created_at,
    expiresAt: data.expires_at
  };
}

/**
 * Delete a classification
 * 
 * @param callSid - Twilio CallSid
 */
export async function deleteClassification(callSid: string): Promise<void> {
  console.log('[CALL CLASSIFICATION] Deleting classification for CallSid:', callSid.substring(0, 8));

  const { error } = await supabaseAdmin
    .from('call_pipeline_classifications')
    .delete()
    .eq('call_sid', callSid);

  if (error) {
    console.error('[CALL CLASSIFICATION] Error deleting classification:', error);
  }
}

/**
 * Clean up expired classifications
 */
export async function cleanupExpiredClassifications(): Promise<void> {
  const { error } = await supabaseAdmin
    .from('call_pipeline_classifications')
    .delete()
    .lt('expires_at', new Date().toISOString());

  if (error) {
    console.error('[CALL CLASSIFICATION] Error cleaning up expired classifications:', error);
  }
}

/**
 * Check if a CallSid is classified as Personal Voicemail
 * 
 * @param callSid - Twilio CallSid
 * @returns true if Personal Voicemail, false otherwise
 */
export async function isPersonalVoicemailCall(callSid: string): Promise<boolean> {
  const classification = await getCallClassification(callSid);
  return classification?.pipeline === 'personal_voicemail';
}

/**
 * Check if a CallSid is classified as Update Voicemail
 * 
 * @param callSid - Twilio CallSid
 * @returns true if Update Voicemail, false otherwise
 */
export async function isUpdateVoicemailCall(callSid: string): Promise<boolean> {
  const classification = await getCallClassification(callSid);
  return classification?.pipeline === 'update_voicemail';
}
