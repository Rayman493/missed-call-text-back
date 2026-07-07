/**
 * Backfill sms_status for existing numbers stuck in pending state
 * Run this script to repair numbers that are already provisioned but have sms_status = pending
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfillSmsStatus() {
  console.log('[SMS STATUS BACKFILL] ========== START ==========');
  console.log('[SMS STATUS BACKFILL] Timestamp:', new Date().toISOString());

  const errors = [];
  let fixed = 0;

  try {
    // Find numbers that are stuck: provisioning_status = ready, sms_status = pending, status = active, have business_id and twilio_sid
    const { data: stuckNumbers, error: queryError } = await supabase
      .from('twilio_numbers')
      .select('id, business_id, phone_number, twilio_sid, provisioning_status, sms_status, status')
      .eq('provisioning_status', 'ready')
      .eq('sms_status', 'pending')
      .eq('status', 'active')
      .not('business_id', 'is', null)
      .not('twilio_sid', 'is', null);

    if (queryError) {
      console.error('[SMS STATUS BACKFILL] Query failed:', queryError);
      errors.push(`Query failed: ${queryError.message}`);
      return { fixed, errors };
    }

    if (!stuckNumbers || stuckNumbers.length === 0) {
      console.log('[SMS STATUS BACKFILL] No stuck numbers found');
      return { fixed, errors };
    }

    console.log('[SMS STATUS BACKFILL] Found stuck numbers:', stuckNumbers.length);

    // Update each stuck number
    for (const number of stuckNumbers) {
      try {
        console.log('[SMS STATUS BACKFILL] Fixing number:', {
          id: number.id,
          phone_number: number.phone_number,
          business_id: number.business_id,
          current_sms_status: number.sms_status,
          current_provisioning_status: number.provisioning_status
        });

        const { error: updateError } = await supabase
          .from('twilio_numbers')
          .update({ sms_status: 'ready' })
          .eq('id', number.id);

        if (updateError) {
          console.error('[SMS STATUS BACKFILL] Failed to update number:', number.id, updateError);
          errors.push(`Failed to update number ${number.phone_number}: ${updateError.message}`);
        } else {
          console.log('[SMS STATUS BACKFILL] Fixed number:', number.phone_number);
          fixed++;
        }
      } catch (error) {
        console.error('[SMS STATUS BACKFILL] Exception fixing number:', number.id, error);
        errors.push(`Exception fixing number ${number.phone_number}: ${error.message}`);
      }
    }

    console.log('[SMS STATUS BACKFILL] ========== COMPLETE ==========');
    console.log('[SMS STATUS BACKFILL] Fixed:', fixed);
    console.log('[SMS STATUS BACKFILL] Errors:', errors.length);

    return { fixed, errors };

  } catch (error) {
    console.error('[SMS STATUS BACKFILL] Exception:', error);
    errors.push(`Global exception: ${error.message}`);
    return { fixed, errors };
  }
}

// Run the backfill
backfillSmsStatus()
  .then(result => {
    console.log('\n[BACKFILL RESULT]', JSON.stringify(result, null, 2));
    process.exit(result.errors.length > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('[BACKFILL ERROR]', error);
    process.exit(1);
  });
