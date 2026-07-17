/**
 * Investigation script for Twilio number state inconsistency
 * 
 * This script investigates the inconsistency where:
 * - Business record shows: provisioning_status = completed, twilio_phone_number = +19853321745
 * - twilio_numbers row shows: status = retired, business_id = null, detached_reason = manual_inventory_reconciliation_not_in_twilio
 * 
 * Script will:
 * 1. Check actual Twilio state for PN23f607a3eea412730ce6baf7cb2e97ff
 * 2. Audit for other inconsistent businesses
 * 3. Determine correct source-of-truth model
 * 4. Recommend safe repair
 */

import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!accountSid || !authToken) {
  console.error('[INVESTIGATION] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  process.exit(1);
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[INVESTIGATION] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const client = Twilio(accountSid, authToken);
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function investigateSpecificNumber() {
  console.log('[INVESTIGATION] ========== INVESTIGATING SPECIFIC NUMBER ==========');
  console.log('[INVESTIGATION] Phone: +19853321745');
  console.log('[INVESTIGATION] SID: PN23f607a3eea412730ce6baf7cb2e97ff');
  console.log('[INVESTIGATION] Business ID: 4bd736a4-c55f-4451-8858-79e3380e8a1d');

  // Step 1: Check business record
  console.log('[INVESTIGATION] Step 1: Checking business record');
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', '4bd736a4-c55f-4451-8858-79e3380e8a1d')
    .single();

  if (businessError) {
    console.error('[INVESTIGATION] Business lookup error:', businessError);
  } else {
    console.log('[INVESTIGATION] Business record found:', {
      id: business.id,
      name: business.name,
      twilio_phone_number: business.twilio_phone_number,
      twilio_phone_number_sid: business.twilio_phone_number_sid,
      provisioning_status: business.provisioning_status,
      assigned_twilio_number_id: business.assigned_twilio_number_id,
    });
  }

  // Step 2: Check twilio_numbers record
  console.log('[INVESTIGATION] Step 2: Checking twilio_numbers record');
  const { data: twilioNumber, error: twilioError } = await supabase
    .from('twilio_numbers')
    .select('*')
    .eq('twilio_sid', 'PN23f607a3eea412730ce6baf7cb2e97ff')
    .maybeSingle();

  if (twilioError) {
    console.error('[INVESTIGATION] twilio_numbers lookup error:', twilioError);
  } else {
    console.log('[INVESTIGATION] twilio_numbers record found:', {
      id: twilioNumber?.id,
      phone_number: twilioNumber?.phone_number,
      twilio_sid: twilioNumber?.twilio_sid,
      business_id: twilioNumber?.business_id,
      status: twilioNumber?.status,
      sms_status: twilioNumber?.sms_status,
      provisioning_status: twilioNumber?.provisioning_status,
      detached_at: twilioNumber?.detached_at,
      detached_reason: twilioNumber?.detached_reason,
    });
  }

  // Step 3: Check actual Twilio state
  console.log('[INVESTIGATION] Step 3: Checking actual Twilio state');
  try {
    const twilioNumberRecord = await client.incomingPhoneNumbers('PN23f607a3eea412730ce6baf7cb2e97ff').fetch();
    console.log('[INVESTIGATION] Number exists in Twilio:', {
      phoneNumber: twilioNumberRecord.phoneNumber,
      sid: twilioNumberRecord.sid,
      friendlyName: twilioNumberRecord.friendlyName,
      voiceEnabled: twilioNumberRecord.capabilities.voice,
      smsEnabled: twilioNumberRecord.capabilities.sms,
      mmsEnabled: twilioNumberRecord.capabilities.mms,
    });

    // Step 4: Check sender pool membership
    if (messagingServiceSid) {
      console.log('[INVESTIGATION] Step 4: Checking sender pool membership');
      const senderPool = await client.messaging.v1.services(messagingServiceSid)
        .phoneNumbers
        .list({ limit: 100 });

      const isInPool = senderPool.some(pn => pn.sid === 'PN23f607a3eea412730ce6baf7cb2e97ff');
      console.log('[INVESTIGATION] Number in sender pool:', isInPool);
      if (isInPool) {
        const poolNumber = senderPool.find(pn => pn.sid === 'PN23f607a3eea412730ce6baf7cb2e97ff');
        console.log('[INVESTIGATION] Pool number details:', {
          phoneNumber: poolNumber?.phoneNumber,
          sid: poolNumber?.sid,
        });
      }
    }
  } catch (error) {
    console.error('[INVESTIGATION] Number does NOT exist in Twilio:', error);
  }
}

async function auditInconsistentBusinesses() {
  console.log('[INVESTIGATION] ========== AUDITING INCONSISTENT BUSINESSES ==========');

  // Find businesses with twilio_phone_number but no corresponding active twilio_numbers row
  console.log('[INVESTIGATION] Finding businesses with twilio_phone_number but inconsistent twilio_numbers...');
  
  const { data: businesses, error: businessesError } = await supabase
    .from('businesses')
    .select('id, name, twilio_phone_number, twilio_phone_number_sid, provisioning_status, assigned_twilio_number_id')
    .not('twilio_phone_number', 'is', null)
    .not('twilio_phone_number_sid', 'is', null);

  if (businessesError) {
    console.error('[INVESTIGATION] Businesses lookup error:', businessesError);
    return;
  }

  console.log(`[INVESTIGATION] Found ${businesses?.length || 0} businesses with twilio_phone_number`);

  const inconsistentBusinesses = [];

  for (const business of businesses || []) {
    // Check corresponding twilio_numbers row
    const { data: twilioNumber, error: twilioError } = await supabase
      .from('twilio_numbers')
      .select('id, business_id, status, sms_status, provisioning_status, detached_at, detached_reason')
      .eq('twilio_sid', business.twilio_phone_number_sid)
      .maybeSingle();

    if (twilioError) {
      console.error(`[INVESTIGATION] Error checking twilio_numbers for ${business.id}:`, twilioError);
      continue;
    }

    // Check for inconsistency
    let inconsistent = false;
    let reason = '';

    if (!twilioNumber) {
      inconsistent = true;
      reason = 'No twilio_numbers row exists';
    } else if (twilioNumber.business_id !== business.id) {
      inconsistent = true;
      reason = `twilio_numbers.business_id (${twilioNumber.business_id}) != business.id (${business.id})`;
    } else if (twilioNumber.status === 'retired') {
      inconsistent = true;
      reason = `twilio_numbers.status is retired (detached_reason: ${twilioNumber.detached_reason})`;
    } else if (twilioNumber.status === 'released') {
      inconsistent = true;
      reason = 'twilio_numbers.status is released';
    } else if (twilioNumber.status === 'error') {
      inconsistent = true;
      reason = 'twilio_numbers.status is error';
    } else if (twilioNumber.status !== 'active' && twilioNumber.status !== 'assigned') {
      inconsistent = true;
      reason = `twilio_numbers.status is ${twilioNumber.status} (expected active/assigned)`;
    }

    if (inconsistent) {
      inconsistentBusinesses.push({
        business_id: business.id,
        business_name: business.name,
        twilio_phone_number: business.twilio_phone_number,
        twilio_phone_number_sid: business.twilio_phone_number_sid,
        provisioning_status: business.provisioning_status,
        twilio_numbers_id: twilioNumber?.id,
        twilio_numbers_business_id: twilioNumber?.business_id,
        twilio_numbers_status: twilioNumber?.status,
        twilio_numbers_sms_status: twilioNumber?.sms_status,
        twilio_numbers_provisioning_status: twilioNumber?.provisioning_status,
        detached_at: twilioNumber?.detached_at,
        detached_reason: twilioNumber?.detached_reason,
        reason,
      });
    }
  }

  console.log(`[INVESTIGATION] Found ${inconsistentBusinesses.length} inconsistent businesses`);
  
  if (inconsistentBusinesses.length > 0) {
    console.log('[INVESTIGATION] Inconsistent businesses:');
    inconsistentBusinesses.forEach(b => {
      console.log(`[INVESTIGATION] - Business: ${b.business_name} (${b.business_id})`);
      console.log(`[INVESTIGATION]   Phone: ${b.twilio_phone_number}`);
      console.log(`[INVESTIGATION]   Reason: ${b.reason}`);
      console.log(`[INVESTIGATION]   detached_reason: ${b.detached_reason}`);
      console.log(`[INVESTIGATION]   detached_at: ${b.detached_at}`);
    });
  }

  // Check inverse: twilio_numbers with business_id but business doesn't reference it
  console.log('[INVESTIGATION] Checking inverse inconsistency...');
  const { data: assignedNumbers, error: assignedError } = await supabase
    .from('twilio_numbers')
    .select('id, phone_number, twilio_sid, business_id, status')
    .not('business_id', 'is', null)
    .in('status', ['active', 'assigned']);

  if (assignedError) {
    console.error('[INVESTIGATION] Assigned numbers lookup error:', assignedError);
  } else {
    const inverseInconsistencies = [];

    for (const number of assignedNumbers || []) {
      const { data: business, error: businessCheckError } = await supabase
        .from('businesses')
        .select('id, twilio_phone_number, twilio_phone_number_sid')
        .eq('id', number.business_id)
        .maybeSingle();

      if (businessCheckError) {
        console.error(`[INVESTIGATION] Error checking business ${number.business_id}:`, businessCheckError);
        continue;
      }

      if (!business) {
        inverseInconsistencies.push({
          twilio_numbers_id: number.id,
          phone_number: number.phone_number,
          twilio_sid: number.twilio_sid,
          business_id: number.business_id,
          reason: 'Business does not exist',
        });
      } else if (business.twilio_phone_number_sid !== number.twilio_sid) {
        inverseInconsistencies.push({
          twilio_numbers_id: number.id,
          phone_number: number.phone_number,
          twilio_sid: number.twilio_sid,
          business_id: number.business_id,
          business_twilio_phone_number_sid: business.twilio_phone_number_sid,
          reason: 'Business twilio_phone_number_sid does not match',
        });
      }
    }

    console.log(`[INVESTIGATION] Found ${inverseInconsistencies.length} inverse inconsistencies`);
    
    if (inverseInconsistencies.length > 0) {
      console.log('[INVESTIGATION] Inverse inconsistencies:');
      inverseInconsistencies.forEach(i => {
        console.log(`[INVESTIGATION] - Number: ${i.phone_number} (${i.twilio_sid})`);
        console.log(`[INVESTIGATION]   business_id: ${i.business_id}`);
        console.log(`[INVESTIGATION]   Reason: ${i.reason}`);
      });
    }
  }
}

async function main() {
  console.log('[INVESTIGATION] ========== STARTING TWILIO INCONSISTENCY INVESTIGATION ==========');
  
  await investigateSpecificNumber();
  await auditInconsistentBusinesses();
  
  console.log('[INVESTIGATION] ========== INVESTIGATION COMPLETE ==========');
}

main().catch(error => {
  console.error('[INVESTIGATION] Fatal error:', error);
  process.exit(1);
});
