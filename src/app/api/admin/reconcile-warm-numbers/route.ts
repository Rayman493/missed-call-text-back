import { NextRequest, NextResponse } from 'next/server';
import Twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import { ensureWarmNumberMinimum } from '@/lib/warm-number-manager';

/**
 * Admin endpoint to reconcile warm numbers with Twilio reality
 * Protected by x-admin-secret header
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin secret
    const adminSecret = request.headers.get('x-admin-secret');
    const expectedSecret = process.env.ADMIN_API_SECRET;

    if (!adminSecret || adminSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Warm Inventory Sync] ========== START RECONCILIATION ==========');

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!accountSid || !authToken) {
      console.error('[Warm Inventory Sync] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
      return NextResponse.json(
        { error: 'Missing Twilio credentials' },
        { status: 500 }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Warm Inventory Sync] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return NextResponse.json(
        { error: 'Missing Supabase credentials' },
        { status: 500 }
      );
    }

    const client = Twilio(accountSid, authToken);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Fetch all available warm numbers
    console.log('[Warm Inventory Sync] Fetching all available warm numbers...');
    const { data: availableNumbers, error: fetchError } = await supabase
      .from('twilio_numbers')
      .select('*')
      .eq('status', 'available')
      .eq('sms_status', 'ready');

    if (fetchError) {
      console.error('[Warm Inventory Sync] Error fetching available warm numbers:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch available warm numbers' },
        { status: 500 }
      );
    }

    if (!availableNumbers || availableNumbers.length === 0) {
      console.log('[Warm Inventory Sync] No available warm numbers found');
      return NextResponse.json({
        success: true,
        message: 'No available warm numbers found',
        validCount: 0,
        failedCount: 0,
        totalChecked: 0,
      });
    }

    console.log(`[Warm Inventory Sync] Found ${availableNumbers.length} available warm numbers to verify`);

    let validCount = 0;
    let failedCount = 0;
    const failedNumbers: string[] = [];

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
          failedNumbers.push(number.phone_number);
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
              failedNumbers.push(number.phone_number);
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
            failedNumbers.push(number.phone_number);
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
    
    const result = await ensureWarmNumberMinimum();
    
    console.log(`[Warm Inventory Sync] Pool restoration result:`);
    console.log(`[Warm Inventory Sync] Available before: ${result.availableBefore}`);
    console.log(`[Warm Inventory Sync] Numbers added: ${result.numbersAdded}`);
    console.log(`[Warm Inventory Sync] Available after: ${result.availableAfter}`);
    console.log(`[Warm Inventory Sync] ========== RECONCILIATION END ==========`);

    return NextResponse.json({
      success: true,
      message: 'Reconciliation complete',
      checked_count: availableNumbers.length,
      kept_available_count: validCount,
      marked_failed_count: failedCount,
      replenished_count: result.numbersAdded,
      available_after: result.availableAfter,
      failed_numbers: failedNumbers,
    });

  } catch (error: any) {
    console.error('[Warm Inventory Sync] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
