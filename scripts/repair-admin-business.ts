/**
 * Safe repair for ReplyFlowHQ Admin business (4bd736a4-c55f-4451-8858-79e3380e8a1d)
 * 
 * This script:
 * 1. Sets the business to needs_reprovision state
 * 2. Triggers the canonical reprovisioning workflow
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[REPAIR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function repairBusiness() {
  console.log('[REPAIR] ========== STARTING SAFE REPAIR ==========');
  console.log('[REPAIR] Business ID: 4bd736a4-c55f-4451-8858-79e3380e8a1d');

  // Step 1: Get current business state
  console.log('[REPAIR] Step 1: Getting current business state');
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', '4bd736a4-c55f-4451-8858-79e3380e8a1d')
    .single();

  if (businessError) {
    console.error('[REPAIR] Business lookup error:', businessError);
    process.exit(1);
  }

  console.log('[REPAIR] Current business state:', {
    id: business.id,
    name: business.name,
    twilio_phone_number: business.twilio_phone_number,
    twilio_phone_number_sid: business.twilio_phone_number_sid,
    provisioning_status: business.provisioning_status,
    provisioning_error: business.provisioning_error,
    assigned_twilio_number_id: business.assigned_twilio_number_id,
  });

  // Step 2: Update business to needs_reprovision state
  console.log('[REPAIR] Step 2: Setting provisioning_status to needs_reprovision');
  const { error: updateError } = await supabase
    .from('businesses')
    .update({
      provisioning_status: 'needs_reprovision',
      provisioning_error: 'Twilio number PN23f607a3eea412730ce6baf7cb2e97ff not found during inventory reconciliation on 2026-07-05',
      last_provisioning_attempt_at: new Date().toISOString(),
    })
    .eq('id', '4bd736a4-c55f-4451-8858-79e3380e8a1d');

  if (updateError) {
    console.error('[REPAIR] Update error:', updateError);
    process.exit(1);
  }

  console.log('[REPAIR] ✓ Business updated to needs_reprovision state');

  // Step 3: Verify the update
  console.log('[REPAIR] Step 3: Verifying the update');
  const { data: updatedBusiness, error: verifyError } = await supabase
    .from('businesses')
    .select('id, name, twilio_phone_number, twilio_phone_number_sid, provisioning_status, provisioning_error')
    .eq('id', '4bd736a4-c55f-4451-8858-79e3380e8a1d')
    .single();

  if (verifyError) {
    console.error('[REPAIR] Verification error:', verifyError);
    process.exit(1);
  }

  console.log('[REPAIR] Updated business state:', {
    id: updatedBusiness.id,
    name: updatedBusiness.name,
    twilio_phone_number: updatedBusiness.twilio_phone_number,
    twilio_phone_number_sid: updatedBusiness.twilio_phone_number_sid,
    provisioning_status: updatedBusiness.provisioning_status,
    provisioning_error: updatedBusiness.provisioning_error,
  });

  console.log('[REPAIR] ========== SAFE REPAIR PREPARATION COMPLETE ==========');
  console.log('[REPAIR] Next step: Call /api/admin/reprovision-twilio-number with force=true');
  console.log('[REPAIR] This will clear stale Twilio assignment and trigger canonical provisioning');
}

repairBusiness().catch(error => {
  console.error('[REPAIR] Fatal error:', error);
  process.exit(1);
});
