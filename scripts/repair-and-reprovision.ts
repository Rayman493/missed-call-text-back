/**
 * Safe repair and canonical provisioning for ReplyFlowHQ Admin business
 * 
 * This script:
 * 1. Clears stale Twilio assignment (following reprovision-twilio-number pattern)
 * 2. Sets provisioning_status to 'provisioning'
 * 3. Triggers canonical provisioning workflow
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[REPAIR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const businessId = '4bd736a4-c55f-4451-8858-79e3380e8a1d';

async function repairAndReprovision() {
  console.log('[REPAIR] ========== SAFE REPAIR AND CANONICAL PROVISIONING ==========');
  console.log('[REPAIR] Business ID:', businessId);

  // Step 1: Get current business state
  console.log('[REPAIR] Step 1: Getting current business state');
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
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
    assigned_twilio_number_id: business.assigned_twilio_number_id,
  });

  // Step 2: Clear stale Twilio assignment (following reprovision-twilio-number pattern)
  console.log('[REPAIR] Step 2: Clearing stale Twilio assignment');
  const { error: updateError } = await supabase
    .from('businesses')
    .update({
      twilio_phone_number: null,
      twilio_phone_number_sid: null,
      twilio_messaging_service_sid: null,
      provisioning_status: 'provisioning',
      provisioning_error: null,
      forwarding_verified: false,
      call_forwarding_enabled: false,
    })
    .eq('id', businessId);

  if (updateError) {
    console.error('[REPAIR] Failed to clear Twilio assignment:', updateError);
    process.exit(1);
  }

  console.log('[REPAIR] ✓ Stale Twilio assignment cleared');

  // Step 3: Verify the update
  console.log('[REPAIR] Step 3: Verifying the update');
  const { data: updatedBusiness, error: verifyError } = await supabase
    .from('businesses')
    .select('id, name, twilio_phone_number, twilio_phone_number_sid, provisioning_status')
    .eq('id', businessId)
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
  });

  console.log('[REPAIR] ========== SAFE REPAIR COMPLETE ==========');
  console.log('[REPAIR] Next step: Trigger canonical provisioning via /api/business/trigger-provisioning');
  console.log('[REPAIR] Use the trigger-reprovision.ts script with PROVISIONING_ADMIN_SECRET');
}

repairAndReprovision().catch(error => {
  console.error('[REPAIR] Fatal error:', error);
  process.exit(1);
});
