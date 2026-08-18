/**
 * Twilio Assignment Helper
 * Shared authoritative logic for checking existing business assignments
 * All checks MUST match the unique index: idx_twilio_numbers_business_active_unique
 *
 * Unique index predicate:
 * WHERE business_id IS NOT NULL
   AND (status = 'active' OR status = 'assigned')
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface ExistingAssignment {
  id: string;
  phone_number: string;
  twilio_sid: string;
  status: string;
  sms_status?: string;
  provisioning_status?: string;
}

export interface DiagnosticAssignmentSnapshot {
  id: string;
  business_id: string;
  phone_number: string;
  twilio_sid: string;
  status: string;
  sms_status: string | null;
  provisioning_status: string | null;
  released_at: string | null;
  detached_at: string | null;
  retired_at: string | null;
  reserved_for_business_id: string | null;
  reserved_at: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Diagnostic helper: Get ALL twilio_numbers rows for a business without status filtering
 * This helps diagnose why the unique index sees a row that the active lookup doesn't
 *
 * @param supabase - Supabase client
 * @param businessId - Business ID to check
 * @returns All rows for the business, or null if error
 */
export async function getAllBusinessAssignments(
  supabase: SupabaseClient,
  businessId: string
): Promise<DiagnosticAssignmentSnapshot[] | null> {
  try {
    const { data, error } = await supabase
      .from('twilio_numbers')
      .select('id, business_id, phone_number, twilio_sid, status, sms_status, provisioning_status, released_at, detached_at, retired_at, reserved_for_business_id, reserved_at, assigned_at, created_at, updated_at')
      .eq('business_id', businessId);

    if (error) {
      console.error('[AssignmentHelper] Diagnostic query failed:', error);
      return null;
    }

    return data as DiagnosticAssignmentSnapshot[];
  } catch (error: any) {
    console.error('[AssignmentHelper] Diagnostic query exception:', error);
    return null;
  }
}

/**
 * Check if a business has an existing active/assigned Twilio number
 * This query MUST match the unique index predicate exactly:
 * - business_id IS NOT NULL (implicit in eq())
 * - status = 'active' OR status = 'assigned'
 *
 * Used by:
 * - PROVISION_IDEMPOTENCY check
 * - Warm Inventory STEP 0
 * - PROVISION_PRE_PURCHASE_CHECK
 *
 * @param supabase - Supabase client
 * @param businessId - Business ID to check
 * @returns Existing assignment or null if none found
 */
export async function getExistingAssignment(
  supabase: SupabaseClient,
  businessId: string
): Promise<ExistingAssignment | null> {
  const { data, error } = await supabase
    .from('twilio_numbers')
    .select('id, phone_number, twilio_sid, status, sms_status, provisioning_status')
    .eq('business_id', businessId)
    .in('status', ['assigned', 'active'])
    .maybeSingle();

  // Diagnostic logging for active query result
  console.log('[AssignmentHelper] ACTIVE QUERY RESULT', {
    businessId,
    dataFound: !!data,
    errorPresent: !!error,
    errorCode: error?.code,
    errorMessage: error?.message,
    rowId: data?.id,
    status: data?.status,
    phoneNumberPresent: !!data?.phone_number,
    twilioSidPresent: !!data?.twilio_sid
  });

  if (error) {
    // PGRST116 is "no rows returned" - not an error for our use case
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[AssignmentHelper] Error checking existing assignment:', error);
    throw error;
  }

  return data;
}

/**
 * Check if a business has an existing active/assigned Twilio number (with error handling)
 * Same as getExistingAssignment but returns success/error flag instead of throwing
 *
 * @param supabase - Supabase client
 * @param businessId - Business ID to check
 * @returns Object with success flag and assignment data if found
 */
export async function checkExistingAssignment(
  supabase: SupabaseClient,
  businessId: string
): Promise<{ success: boolean; assignment?: ExistingAssignment; error?: string }> {
  try {
    const assignment = await getExistingAssignment(supabase, businessId);
    if (assignment) {
      return { success: true, assignment };
    }
    return { success: false };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}