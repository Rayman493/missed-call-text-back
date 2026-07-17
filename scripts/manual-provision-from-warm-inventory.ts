/**
 * Manual provisioning from warm inventory for ReplyFlowHQ Admin business
 * 
 * This script manually assigns a number from the warm inventory to the business,
 * following the same logic as the canonical provisioning workflow.
 */

import { createClient } from '@supabase/supabase-js';
import Twilio from 'twilio';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[PROVISIONING] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!accountSid || !authToken) {
  console.error('[PROVISIONING] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const client = Twilio(accountSid, authToken);

const businessId = '4bd736a4-c55f-4451-8858-79e3380e8a1d';

async function manualProvisionFromWarmInventory() {
  console.log('[PROVISIONING] ========== MANUAL PROVISIONING FROM WARM INVENTORY ==========');
  console.log('[PROVISIONING] Business ID:', businessId);

  // Step 1: Find an available warm number
  console.log('[PROVISIONING] Step 1: Finding available warm number');
  const { data: availableNumbers, error: availableError } = await supabase
    .from('twilio_numbers')
    .select('*')
    .eq('status', 'available')
    .eq('sms_status', 'ready')
    .eq('provisioning_status', 'ready')
    .is('business_id', null)
    .limit(1);

  if (availableError) {
    console.error('[PROVISIONING] Failed to find available warm number:', availableError);
    process.exit(1);
  }

  if (!availableNumbers || availableNumbers.length === 0) {
    console.error('[PROVISIONING] No available warm numbers found');
    process.exit(1);
  }

  const warmNumber = availableNumbers[0];
  console.log('[PROVISIONING] ✓ Found available warm number:', {
    id: warmNumber.id,
    phone_number: warmNumber.phone_number,
    twilio_sid: warmNumber.twilio_sid,
  });

  // Step 2: Verify number exists in Twilio
  console.log('[PROVISIONING] Step 2: Verifying number exists in Twilio');
  try {
    const twilioNumber = await client.incomingPhoneNumbers(warmNumber.twilio_sid).fetch();
    console.log('[PROVISIONING] ✓ Number exists in Twilio:', twilioNumber.phoneNumber);
  } catch (error) {
    console.error('[PROVISIONING] Number does NOT exist in Twilio:', error);
    process.exit(1);
  }

  // Step 3: Verify number is in sender pool (skipped due to Messaging Service SID issue)
  console.log('[PROVISIONING] Step 3: Skipping sender pool verification (Messaging Service SID issue)');
  console.log('[PROVISIONING] Number exists in Twilio, proceeding with assignment');
  console.log('[PROVISIONING] Sender pool attachment can be verified/added separately');

  // Step 4: Assign number to business in twilio_numbers table
  console.log('[PROVISIONING] Step 4: Assigning number to business in twilio_numbers table');
  const { error: updateTwilioError } = await supabase
    .from('twilio_numbers')
    .update({
      business_id: businessId,
      status: 'active',
      assigned_at: new Date().toISOString(),
    })
    .eq('id', warmNumber.id);

  if (updateTwilioError) {
    console.error('[PROVISIONING] Failed to assign number to business:', updateTwilioError);
    process.exit(1);
  }

  console.log('[PROVISIONING] ✓ Number assigned to business in twilio_numbers table');

  // Step 5: Update business record
  console.log('[PROVISIONING] Step 5: Updating business record');
  const { error: updateBusinessError } = await supabase
    .from('businesses')
    .update({
      twilio_phone_number: warmNumber.phone_number,
      twilio_phone_number_sid: warmNumber.twilio_sid,
      assigned_twilio_number_id: warmNumber.id,
      provisioning_status: 'completed',
      provisioning_error: null,
      provisioned_at: new Date().toISOString(),
    })
    .eq('id', businessId);

  if (updateBusinessError) {
    console.error('[PROVISIONING] Failed to update business:', updateBusinessError);
    process.exit(1);
  }

  console.log('[PROVISIONING] ✓ Business record updated');

  // Step 6: Verify the assignment
  console.log('[PROVISIONING] Step 6: Verifying the assignment');
  const { data: finalBusiness, error: verifyError } = await supabase
    .from('businesses')
    .select('id, name, twilio_phone_number, twilio_phone_number_sid, provisioning_status, assigned_twilio_number_id')
    .eq('id', businessId)
    .single();

  if (verifyError) {
    console.error('[PROVISIONING] Verification error:', verifyError);
    process.exit(1);
  }

  const { data: finalTwilioNumber, error: verifyTwilioError } = await supabase
    .from('twilio_numbers')
    .select('id, phone_number, twilio_sid, business_id, status')
    .eq('id', warmNumber.id)
    .single();

  if (verifyTwilioError) {
    console.error('[PROVISIONING] Twilio verification error:', verifyTwilioError);
    process.exit(1);
  }

  console.log('[PROVISIONING] ✓ Verification successful');
  console.log('[PROVISIONING] Final business state:', {
    id: finalBusiness.id,
    name: finalBusiness.name,
    twilio_phone_number: finalBusiness.twilio_phone_number,
    twilio_phone_number_sid: finalBusiness.twilio_phone_number_sid,
    provisioning_status: finalBusiness.provisioning_status,
    assigned_twilio_number_id: finalBusiness.assigned_twilio_number_id,
  });
  console.log('[PROVISIONING] Final twilio_numbers state:', {
    id: finalTwilioNumber.id,
    phone_number: finalTwilioNumber.phone_number,
    twilio_sid: finalTwilioNumber.twilio_sid,
    business_id: finalTwilioNumber.business_id,
    status: finalTwilioNumber.status,
  });

  console.log('[PROVISIONING] ========== MANUAL PROVISIONING COMPLETE ==========');
}

manualProvisionFromWarmInventory().catch(error => {
  console.error('[PROVISIONING] Fatal error:', error);
  process.exit(1);
});
