/**
 * Reconciliation script to sync database with actual Twilio reality
 * 
 * This script verifies that all twilio_numbers marked as available/ready
 * actually exist in Twilio and are attached to the Messaging Service sender pool.
 * 
 * If a number does not exist or is not in the sender pool, it is marked as failed.
 * 
 * After reconciliation, ensureWarmNumberMinimum() is called to restore the pool.
 * 
 * Run with: npx ts-node scripts/reconcile-warm-numbers.ts
 */

import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!accountSid || !authToken) {
  console.error('[Warm Inventory Sync] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  process.exit(1);
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[Warm Inventory Sync] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const client = Twilio(accountSid, authToken);
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function reconcileWarmNumbers() {
  console.log('[Warm Inventory Sync] ========== START RECONCILIATION ==========');

  try {
    // Step 1: Fetch all available warm numbers
    console.log('[Warm Inventory Sync] Fetching all available warm numbers...');
    const { data: availableNumbers, error: fetchError } = await supabase
      .from('twilio_numbers')
      .select('*')
      .eq('status', 'available')
      .eq('sms_status', 'ready');

    if (fetchError) {
      console.error('[Warm Inventory Sync] Error fetching available warm numbers:', fetchError);
      process.exit(1);
    }

    if (!availableNumbers || availableNumbers.length === 0) {
      console.log('[Warm Inventory Sync] No available warm numbers found');
      return;
    }

    console.log(`[Warm Inventory Sync] Found ${availableNumbers.length} available warm numbers to verify`);

    let validCount = 0;
    let failedCount = 0;

    // Step 2: Verify each number in Twilio
    for (const number of availableNumbers) {
      console.log(`[Warm Inventory Sync] Checking number: ${number.phone_number}`);

      // Verify number exists in Twilio
      let twilioNumber;
      try {
        twilioNumber = await client.incomingPhoneNumbers(number.twilio_sid).fetch();
        console.log(`[Warm Inventory Sync] ✓ Exists in Twilio`);
      } catch (error) {
        console.log(`[Warm Inventory Sync] ✗ Does NOT exist in Twilio`);
        console.log(`[Warm Inventory Sync] Marking as failed`);
        
        const { error: updateError } = await supabase
          .from('twilio_numbers')
          .update({
            status: 'failed',
            sms_status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', number.id);

        if (updateError) {
          console.error(`[Warm Inventory Sync] Failed to update number as failed:`, updateError);
        } else {
          console.log(`[Warm Inventory Sync] ✓ Marked as failed`);
          failedCount++;
        }
        continue;
      }

      // Verify number is attached to Messaging Service sender pool
      if (messagingServiceSid) {
        try {
          const senderPool = await client.messaging.v1.services(messagingServiceSid)
            .phoneNumbers
            .list({ limit: 100 });

          const isInPool = senderPool.some(pn => pn.sid === number.twilio_sid);

          if (!isInPool) {
            console.log(`[Warm Inventory Sync] ✗ NOT in sender pool`);
            console.log(`[Warm Inventory Sync] Marking as failed`);
            
            const { error: updateError } = await supabase
              .from('twilio_numbers')
              .update({
                status: 'failed',
                sms_status: 'failed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', number.id);

            if (updateError) {
              console.error(`[Warm Inventory Sync] Failed to update number as failed:`, updateError);
            } else {
              console.log(`[Warm Inventory Sync] ✓ Marked as failed`);
              failedCount++;
            }
            continue;
          }

          console.log(`[Warm Inventory Sync] ✓ Exists in sender pool`);
        } catch (error) {
          console.error(`[Warm Inventory Sync] Failed to verify sender pool, marking as failed:`, error);
          
          const { error: updateError } = await supabase
            .from('twilio_numbers')
            .update({
              status: 'failed',
              sms_status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', number.id);

          if (updateError) {
            console.error(`[Warm Inventory Sync] Failed to update number as failed:`, updateError);
          } else {
            console.log(`[Warm Inventory Sync] ✓ Marked as failed`);
            failedCount++;
          }
          continue;
        }
      } else {
        console.log(`[Warm Inventory Sync] ⚠ No Messaging Service configured, skipping sender pool check`);
      }

      console.log(`[Warm Inventory Sync] ✓ Keeping available`);
      validCount++;
    }

    console.log(`[Warm Inventory Sync] ========== RECONCILIATION COMPLETE ==========`);
    console.log(`[Warm Inventory Sync] Valid numbers: ${validCount}`);
    console.log(`[Warm Inventory Sync] Failed numbers: ${failedCount}`);
    console.log(`[Warm Inventory Sync] Total checked: ${availableNumbers.length}`);

    // Step 3: Re-run ensureWarmNumberMinimum() to restore pool
    console.log(`[Warm Inventory Sync] ========== RESTORING POOL ==========`);
    console.log(`[Warm Inventory Sync] Calling ensureWarmNumberMinimum()...`);
    
    const { ensureWarmNumberMinimum } = await import('../src/lib/warm-number-manager');
    const result = await ensureWarmNumberMinimum();
    
    console.log(`[Warm Inventory Sync] Pool restoration result:`);
    console.log(`[Warm Inventory Sync] Available before: ${result.availableBefore}`);
    console.log(`[Warm Inventory Sync] Numbers added: ${result.numbersAdded}`);
    console.log(`[Warm Inventory Sync] Available after: ${result.availableAfter}`);
    console.log(`[Warm Inventory Sync] ========== RECONCILIATION END ==========`);

  } catch (error) {
    console.error('[Warm Inventory Sync] Fatal error:', error);
    process.exit(1);
  }
}

reconcileWarmNumbers();
