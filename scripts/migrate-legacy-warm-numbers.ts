/**
 * One-time migration script to update legacy warm numbers to new statuses
 * 
 * This script migrates legacy twilio_numbers rows from:
 * - status='active' → status='available'
 * - sms_status='pending' → sms_status='ready'
 * 
 * ONLY for numbers that:
 * - business_id IS NULL
 * - exist in Twilio
 * - are attached to the approved Messaging Service sender pool
 * 
 * Run with: npx ts-node scripts/migrate-legacy-warm-numbers.ts
 */

import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!accountSid || !authToken) {
  console.error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  process.exit(1);
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const client = Twilio(accountSid, authToken);
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrateLegacyWarmNumbers() {
  console.log('[Warm Inventory Migration] Starting migration of legacy warm numbers...');

  try {
    // Step 1: Fetch legacy numbers (business_id IS NULL, status='active')
    const { data: legacyNumbers, error: fetchError } = await supabase
      .from('twilio_numbers')
      .select('*')
      .is('business_id', null)
      .eq('status', 'active');

    if (fetchError) {
      console.error('[Warm Inventory Migration] Error fetching legacy numbers:', fetchError);
      process.exit(1);
    }

    if (!legacyNumbers || legacyNumbers.length === 0) {
      console.log('[Warm Inventory Migration] No legacy numbers found to migrate');
      return;
    }

    console.log(`[Warm Inventory Migration] Found ${legacyNumbers.length} legacy numbers to check`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const number of legacyNumbers) {
      console.log(`[Warm Inventory Migration] Checking number: ${number.phone_number}`);

      try {
        // Step 2: Verify number exists in Twilio
        let twilioNumber;
        try {
          twilioNumber = await client.incomingPhoneNumbers(number.twilio_sid).fetch();
          console.log(`[Warm Inventory Migration] ✓ Number exists in Twilio`);
        } catch (error) {
          console.error(`[Warm Inventory Migration] ✗ Number not found in Twilio, skipping`);
          skippedCount++;
          continue;
        }

        // Step 3: Verify number is attached to Messaging Service sender pool
        if (messagingServiceSid) {
          try {
            const senderPool = await client.messaging.v1.services(messagingServiceSid)
              .phoneNumbers
              .list({ limit: 100 });

            const isInPool = senderPool.some(pn => pn.sid === number.twilio_sid);

            if (!isInPool) {
              console.error(`[Warm Inventory Migration] ✗ Number not in sender pool, skipping`);
              skippedCount++;
              continue;
            }

            console.log(`[Warm Inventory Migration] ✓ Number is in sender pool`);
          } catch (error) {
            console.error(`[Warm Inventory Migration] ✗ Failed to verify sender pool, skipping:`, error);
            skippedCount++;
            continue;
          }
        } else {
          console.log(`[Warm Inventory Migration] ⚠ No Messaging Service configured, skipping sender pool check`);
        }

        // Step 4: Update status to new values
        const { error: updateError } = await supabase
          .from('twilio_numbers')
          .update({
            status: 'available',
            sms_status: 'ready',
            updated_at: new Date().toISOString(),
          })
          .eq('id', number.id);

        if (updateError) {
          console.error(`[Warm Inventory Migration] ✗ Failed to update number:`, updateError);
          skippedCount++;
          continue;
        }

        console.log(`[Warm Inventory Migration] ✓ Migrated legacy number to available: ${number.phone_number}`);
        migratedCount++;

      } catch (error) {
        console.error(`[Warm Inventory Migration] ✗ Exception processing number:`, error);
        skippedCount++;
      }
    }

    console.log(`[Warm Inventory Migration] Migration complete:`);
    console.log(`[Warm Inventory Migration]   Migrated: ${migratedCount}`);
    console.log(`[Warm Inventory Migration]   Skipped: ${skippedCount}`);
    console.log(`[Warm Inventory Migration]   Total: ${legacyNumbers.length}`);

  } catch (error) {
    console.error('[Warm Inventory Migration] Fatal error:', error);
    process.exit(1);
  }
}

// Run migration
migrateLegacyWarmNumbers()
  .then(() => {
    console.log('[Warm Inventory Migration] Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Warm Inventory Migration] Unhandled error:', error);
    process.exit(1);
  });
