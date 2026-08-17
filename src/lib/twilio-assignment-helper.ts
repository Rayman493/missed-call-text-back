/**
 * Twilio Assignment Helper
 * Shared authoritative logic for checking existing business assignments
 * All checks MUST match the unique index: idx_twilio_numbers_business_active_unique
 *
 * Unique index predicate:
 * WHERE business_id IS NOT NULL
 *   AND (status = 'active' OR status = 'assigned')
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